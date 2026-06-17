// Netlify Function — PIN verification + JWT token generation
// PINs are stored in Supabase config table (APP_PIN, REPARTIDOR_PIN)
// so the owner can change them from the app without touching Netlify.
// Rate limiting: blocks an IP for 15 minutes after 5 failed attempts.

const crypto = require('crypto');
const { resolveSupabase } = require('./_env');

const JWT_SECRET      = process.env.JWT_SECRET || "CHANGE_ME_IN_NETLIFY_ENV";
// Supabase FAIL-CLOSED (ENV_SPLIT_V1_08): il fallback prod è permesso SOLO sul
// sito di produzione reale (SITE_ID, dentro _env.js). In V1/staging/preview, se
// SUPABASE_URL / *_KEY mancano → CONFIG_ERROR e 503: niente lettura del DB prod
// (era il fail-open di V1_07 che leggeva config/segreti prod).
const _sb = resolveSupabase();
const SUPABASE_URL    = _sb.url || null;
const SUPABASE_KEY    = _sb.key || null;   // service key se presente, altrimenti anon
const CONFIG_ERROR    = _sb.error || null;
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

// ─── Read PIN from Supabase config table ────────────────────────────────────
async function getPin(chiave, fallback) {
  try {
    const rows = await sbSelect("config", `chiave=eq.${chiave}&limit=1`);
    return (rows && rows[0] && rows[0].valore) ? String(rows[0].valore) : fallback;
  } catch(e) { return fallback; }
}

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

  // FAIL-CLOSED: deploy non-production senza config Supabase esplicita → 503,
  // mai leggere il DB prod.
  if (CONFIG_ERROR) return respond(503, { error: "config error: " + CONFIG_ERROR });

  let body;
  try { body = JSON.parse(event.body); } catch(e) { return respond(400, { error: "invalid json" }); }

  const { pin, role } = body;
  const ip = event.headers["x-forwarded-for"]?.split(",")[0].trim() || event.headers["client-ip"] || "unknown";

  // Validate PIN format (4-8 digits)
  if (!pin || !/^\d{4,8}$/.test(String(pin))) {
    return respond(400, { error: "El PIN debe tener entre 4 y 8 dígitos" });
  }

  const isLocalOperatorBypass =
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

  // Read correct PIN from Supabase
  const correctPin = role === "repartidor"
    ? await getPin("REPARTIDOR_PIN", process.env.REPARTIDOR_PIN || "000000")
    : await getPin("APP_PIN",        process.env.APP_PIN        || "000000");

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
