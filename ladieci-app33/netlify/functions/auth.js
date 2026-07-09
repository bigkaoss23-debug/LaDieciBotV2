// Netlify Function — PIN verification + JWT token generation
// PHASE 0A1: PINs and JWT secret come ONLY from Netlify environment variables
// (APP_PIN, REPARTIDOR_PIN, JWT_SECRET). No Supabase-config PIN lookup, no
// default fallbacks. Missing required env → fail closed (503). DEV_AUTH_BYPASS
// is honored only OUTSIDE the production context.
// Rate limiting: blocks an IP for 15 minutes after 5 failed attempts (uses the
// Supabase anon key for the AUTH_BLOCK_* counters only — never for PINs).

const crypto = require('crypto');

// Env-only secrets. No fallbacks — a missing value must fail closed, never
// authenticate with a guessable default.
const JWT_SECRET      = process.env.JWT_SECRET;
const APP_PIN_ENV     = process.env.APP_PIN;
const REPARTIDOR_PIN_ENV = process.env.REPARTIDOR_PIN;
// Production context guard: DEV_AUTH_BYPASS can never activate in production.
const IS_PRODUCTION   = process.env.CONTEXT === "production";

const SUPABASE_URL    = "https://wnswassgfuuivmfwjxsf.supabase.co";
// Anon key — used ONLY for the AUTH_BLOCK_* rate-limit counters, never for PINs.
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || "sb_publishable_esObmXoAcWH9z27Sj_-jtw_PO0VeL5O";
const MAX_ATTEMPTS    = 5;
const BLOCK_MS        = 15 * 60 * 1000; // 15 minutes

// ─── Supabase helpers ────────────────────────────────────────────────────────
async function sbSelect(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  return res.json();
}
async function sbUpsert(table, data) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(data)
  });
}

// PIN lookup from Supabase config REMOVED (Phase 0A1) — PINs are env-only now.

// ─── Rate limiting via Supabase config table ────────────────────────────────
// Stores: chiave = "AUTH_BLOCK_<ip_hash>", valore = JSON {count, until}
function ipHash(ip) {
  return crypto.createHash('sha256').update(ip || "unknown").digest('hex').slice(0, 16);
}
async function checkRateLimit(ip) {
  const key = "AUTH_BLOCK_" + ipHash(ip);
  try {
    const rows = await sbSelect("config", `chiave=eq.${key}&limit=1`);
    if (!rows || !rows[0]) return { blocked: false, count: 0 };
    const data = JSON.parse(rows[0].valore || "{}");
    if (data.until && Date.now() < data.until) {
      return { blocked: true, retryAfter: Math.ceil((data.until - Date.now()) / 60000) };
    }
    return { blocked: false, count: data.count || 0, key };
  } catch(e) { return { blocked: false, count: 0, key }; }
}
async function recordFailure(ip) {
  const key = "AUTH_BLOCK_" + ipHash(ip);
  try {
    const rows = await sbSelect("config", `chiave=eq.${key}&limit=1`);
    const current = rows && rows[0] ? JSON.parse(rows[0].valore || "{}") : {};
    const count = (current.count || 0) + 1;
    const until = count >= MAX_ATTEMPTS ? Date.now() + BLOCK_MS : null;
    await sbUpsert("config", { chiave: key, valore: JSON.stringify({ count, until }) });
    return count;
  } catch(e) { return 0; }
}
async function clearFailures(ip) {
  const key = "AUTH_BLOCK_" + ipHash(ip);
  try {
    await sbUpsert("config", { chiave: key, valore: JSON.stringify({ count: 0, until: null }) });
  } catch(e) {}
}

// ─── JWT ────────────────────────────────────────────────────────────────────
function createToken(role, expiresInHours = 10) {
  const payload = {
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (expiresInHours * 3600)
  };
  const header  = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString('base64url');
  const body    = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig     = crypto.createHmac('sha256', JWT_SECRET).update(header + "." + body).digest('base64url');
  return header + "." + body + "." + sig;
}

// ─── Handler ─────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders() };
  if (event.httpMethod !== "POST") return respond(405, { error: "method not allowed" });

  let body;
  try { body = JSON.parse(event.body); } catch(e) { return respond(400, { error: "invalid json" }); }

  const { pin, role } = body;
  const ip = event.headers["x-forwarded-for"]?.split(",")[0].trim() || event.headers["client-ip"] || "unknown";

  // FAIL CLOSED: required secrets must come from the environment. If any is
  // missing we refuse to authenticate and return a GENERIC 503 that does not
  // reveal which variable is absent. No default PIN, no default JWT secret.
  if (!APP_PIN_ENV || !REPARTIDOR_PIN_ENV || !JWT_SECRET) {
    return respond(503, { error: "auth no configurado" });
  }

  // Validate PIN format (4-8 digits)
  if (!pin || !/^\d{4,8}$/.test(String(pin))) {
    return respond(400, { error: "El PIN debe tener entre 4 y 8 dígitos" });
  }

  // DEV_AUTH_BYPASS: only OUTSIDE the production context, and only if explicitly
  // enabled. Can never activate when CONTEXT === "production".
  const isLocalOperatorBypass =
    !IS_PRODUCTION &&
    process.env.DEV_AUTH_BYPASS === "true" &&
    role !== "repartidor" &&
    String(pin) === "123456";

  if (isLocalOperatorBypass) {
    const token = createToken("operador", 10);
    return respond(200, { token, role: "operador", expiresIn: "10h" });
  }

  // Rate limit check
  const rl = await checkRateLimit(ip);
  if (rl.blocked) {
    return respond(429, { error: `Demasiados intentos. Espera ${rl.retryAfter} minutos.` });
  }

  // Correct PIN comes ONLY from the environment (no Supabase config lookup).
  const correctPin = role === "repartidor" ? REPARTIDOR_PIN_ENV : APP_PIN_ENV;

  if (pin !== correctPin) {
    const count = await recordFailure(ip);
    const remaining = MAX_ATTEMPTS - count;
    if (remaining <= 0) {
      return respond(401, { error: `Demasiados intentos. Bloqueado 15 minutos.` });
    }
    return respond(401, { error: "PIN incorrecto", intentosRestantes: remaining });
  }

  // Success
  await clearFailures(ip);
  const expiresInHours = role === "repartidor" ? 12 : 10;
  const token = createToken(role === "repartidor" ? "repartidor" : "operador", expiresInHours);
  return respond(200, { token, role: role === "repartidor" ? "repartidor" : "operador", expiresIn: `${expiresInHours}h` });
};

function respond(status, body) {
  return { statusCode: status, headers: corsHeaders(), body: JSON.stringify(body) };
}
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
}
