// Netlify Function — PIN verification + JWT token generation (Functions API v2)
// PHASE 0A1: PINs and JWT secret come ONLY from Netlify environment variables
// (APP_PIN, REPARTIDOR_PIN, JWT_SECRET). No Supabase-config PIN lookup, no
// default fallbacks. Missing required env → fail closed (503). DEV_AUTH_BYPASS
// is honored only OUTSIDE the production context.
//
// [PIN-RATE-LIMIT 2026-09-23] Rate limiting is Netlify's NATIVE rule declared in
// `config` below (max 10 requests per 180 s per IP+domain → Netlify answers 429
// before this code runs). The old AUTH_BLOCK_* counters in Supabase `config` are
// gone: they were written with the publishable key, rejected by RLS, and never
// blocked anything. Public path unchanged: /api/auth (the netlify.toml rewrite to
// /.netlify/functions/auth is removed — with `path` set, Netlify serves the
// function only at /api/auth, ahead of redirects).
import crypto from "node:crypto";

export const config = {
  path: "/api/auth",
  rateLimit: {
    windowLimit: 10,
    windowSize: 180,
    aggregateBy: ["ip", "domain"],
  },
};

// Env-only secrets. No fallbacks — a missing value must fail closed, never
// authenticate with a guessable default.
const env = (k) => process.env[k];

// ─── JWT ────────────────────────────────────────────────────────────────────
function createToken(secret, role, expiresInHours = 10) {
  const payload = {
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (expiresInHours * 3600)
  };
  const header  = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body    = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig     = crypto.createHmac("sha256", secret).update(header + "." + body).digest("base64url");
  return header + "." + body + "." + sig;
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export default async (req, context) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== "POST") return respond(405, { error: "method not allowed" });

  let body;
  try { body = await req.json(); } catch (e) { return respond(400, { error: "invalid json" }); }
  const { pin, role } = body || {};

  const JWT_SECRET = env("JWT_SECRET");
  const APP_PIN_ENV = env("APP_PIN");
  const REPARTIDOR_PIN_ENV = env("REPARTIDOR_PIN");
  // Production context guard: DEV_AUTH_BYPASS can never activate in production.
  const IS_PRODUCTION = env("CONTEXT") === "production" || (context && context.deploy && context.deploy.context === "production");

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
  // enabled. Can never activate in production.
  const isLocalOperatorBypass =
    !IS_PRODUCTION &&
    env("DEV_AUTH_BYPASS") === "true" &&
    role !== "repartidor" &&
    String(pin) === "123456";

  if (isLocalOperatorBypass) {
    const token = createToken(JWT_SECRET, "operador", 10);
    return respond(200, { token, role: "operador", expiresIn: "10h" });
  }

  // Correct PIN comes ONLY from the environment (no Supabase config lookup).
  const correctPin = role === "repartidor" ? REPARTIDOR_PIN_ENV : APP_PIN_ENV;
  if (pin !== correctPin) {
    return respond(401, { error: "PIN incorrecto" });
  }

  const expiresInHours = role === "repartidor" ? 12 : 10;
  const token = createToken(JWT_SECRET, role === "repartidor" ? "repartidor" : "operador", expiresInHours);
  return respond(200, { token, role: role === "repartidor" ? "repartidor" : "operador", expiresIn: `${expiresInHours}h` });
};

function respond(status, body) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
}
