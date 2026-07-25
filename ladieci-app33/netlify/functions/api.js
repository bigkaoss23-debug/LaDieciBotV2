// Netlify Function — Secure proxy to Railway backend
// Verifies JWT token before forwarding requests
// Secrets needed: RAILWAY_API_KEY (transport). Operational identity: Auth V2 bearer (Railway).

const { resolveBackendUrl } = require('./_env');

const RAILWAY_API_KEY = process.env.RAILWAY_API_KEY;
// Backend URL FAIL-CLOSED (ENV_SPLIT_V1_08): il default prod è permesso SOLO sul
// sito di produzione reale (riconosciuto da SITE_ID, dentro _env.js). In
// V1/staging/deploy-preview, se BACKEND_API_URL manca → CONFIG_ERROR e la function
// risponde 503: niente fallback prod silenzioso (causa del fail-open in V1_07).
const _backend = resolveBackendUrl();
const RAILWAY_URL = _backend.url || null;
const CONFIG_ERROR = _backend.error || null;
// log safe: solo la MODALITÀ, mai URL/segreti
console.log("[api proxy] backend mode:",
  CONFIG_ERROR ? "FAIL-CLOSED(no-prod-fallback)"
              : (_backend.prodFallback ? "prod-fallback(real-prod)" : "env-override"));
// Base senza il suffisso /api — usato per le route REST esplicite del backend
// (es. il Delivery Planner shadow preview, che vive fuori da /api?action=...).
const RAILWAY_BASE = RAILWAY_URL ? RAILWAY_URL.replace(/\/api$/, "") : null;

// Actions allowed for repartidor role (read-only + mark delivered)
// S2-7D2: the proxy-side rider allow-list was REMOVED — src/auth/legacyActionRoles.js on
// Railway is the authoritative role->action map, applied against the verified token.

// Actions that don't need auth (public health check)
const PUBLIC_ACTIONS = [];

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders() };
  }

  // FAIL-CLOSED: deploy non-production senza BACKEND_API_URL → 503, mai prod.
  if (CONFIG_ERROR) {
    return respond(503, { error: "config error: " + CONFIG_ERROR });
  }

  // Verify JWT
  const authHeader = event.headers["authorization"] || event.headers["Authorization"] || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return respond(401, { error: "token mancante" });
  }

  // S2-7D2: the proxy no longer decides WHO the caller is. The Auth V2 bearer is minted and
  // verified by Railway (AUTH_JWT_SECRET_B64URL) and carries actor + role + session_version;
  // this function cannot and must not validate it (different secret, and no access to
  // auth_actors for the active/freshness checks). It is forwarded verbatim and Railway's
  // already-enabled legacy Auth V2 guard is the sole authority on actor/role/session.
  // X-Api-Key stays as the server-to-server transport boundary only.

  try {
    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      const action = params.action || "";

      // Role authorization is Railway's (legacyActionRoles is the authoritative map).

      // Delivery Planner — Shadow Preview (READ-ONLY, internal/admin).
      // Vive su una route REST esplicita del backend (GET /api/delivery/shadow-preview),
      // fuori dallo schema /api?action=... . Inoltra SOLO il parametro `date`, sempre
      // GET, con la stessa X-Api-Key del proxy. Nessuna scrittura. Il check ruolo sopra
      // Il ruolo è verificato da Railway sul bearer Auth V2.
      if (action === "shadowPreview") {
        const date = params.date || "";
        const url = RAILWAY_BASE + "/api/delivery/shadow-preview" +
          (date ? "?date=" + encodeURIComponent(date) : "");
        const res = await fetch(url, {
          headers: { "X-Api-Key": RAILWAY_API_KEY, "Authorization": "Bearer " + token }
        });
        const data = await res.json();
        return respond(res.status, data);
      }

      const qs = Object.entries(params)
        .map(([k, v]) => k + "=" + encodeURIComponent(v))
        .join("&");

      const res = await fetch(RAILWAY_URL + "?" + qs, {
        headers: { "X-Api-Key": RAILWAY_API_KEY, "Authorization": "Bearer " + token }
      });
      const data = await res.json();
      return respond(res.status, data);
    }

    if (event.httpMethod === "POST") {
      let body;
      try { body = JSON.parse(event.body); } catch(e) {
        return respond(400, { error: "invalid json" });
      }

      const action = body.action || "";

      // Role authorization is Railway's (legacyActionRoles is the authoritative map).

      const res = await fetch(RAILWAY_URL + "?action=" + encodeURIComponent(action), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": RAILWAY_API_KEY,
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      return respond(res.status, data);
    }

    return respond(405, { error: "method not allowed" });
  } catch (err) {
    return respond(502, { error: "proxy error: " + err.message });
  }
};

// S2-7D2: verifyToken() was REMOVED. It validated the retired role-only JWT with the local
// JWT_SECRET and produced a proxy-side role decision. Operational identity now comes only
// from the Auth V2 bearer, verified by Railway against auth_actors (active + fresh
// session_version). No local token verification and no local role authorization remain.

function respond(status, body) {
  return {
    statusCode: status,
    headers: corsHeaders(),
    body: JSON.stringify(body)
  };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
  };
}
