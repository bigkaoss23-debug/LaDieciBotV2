// Netlify Function — RETIRED operational login (S2-7D2).
//
// This endpoint used to be the real operational login: it read the PLAINTEXT config.APP_PIN /
// config.REPARTIDOR_PIN from Supabase, compared them in JavaScript, and minted a role-only JWT
// that carried no actor and no session_version. That credential was completely disconnected
// from auth_actors, so rotating an actor's PIN through the canonical path did not affect it —
// and a revoked session could not be invalidated by bumping session_version.
//
// Operational login now goes to the canonical Auth V2 route on Railway
// (POST /api/auth/v2/login), which verifies auth_actors.pin_hash, enforces lockout and
// per-IP limiting, writes login_ok / login_fail audit rows, and issues a token bound to
// {actor, role, session_version}.
//
// The path is KEPT as a fail-closed stub — not deleted — so any stale client fails loudly
// here instead of silently falling through to another handler. It reads no config, performs
// no PIN comparison, and can never mint a token again.
//
// The plaintext config rows are intentionally still present in the database; removing them is
// a separate guarded cleanup step after acceptance.

const DEPRECATION = Object.freeze({ error: "endpoint_retired" });

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }
  // 410 Gone on every method, POST included: no branch can return a token.
  return {
    statusCode: 410,
    headers: corsHeaders(),
    body: JSON.stringify(DEPRECATION),
  };
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}
