// ─── Access Management V3 — READ-ONLY client (V3-I.1) ────────────────────────
// Consumes the accepted, staging-gated Access Management V3 API (V3-F/V3-G/V3-H/
// V3-H.2), proven end-to-end from this exact staging frontend origin:
//   browser owner session → CORS → Railway staging → Access Management V3 API
//   → PostgREST → Supabase staging.
//
// GET only. This module exports exactly two network calls — listAccessUsers()
// and getAccessUser(actor) — and never imports or constructs a POST/PATCH/PUT/
// DELETE request against /api/auth/v3/access-users. There are 7 write routes on
// this API (create, rename, role change, PIN set/clear, deactivate/reactivate);
// none of them has a client function here, on purpose — this slice is read-only.
//
// Transport: direct fetch to the Railway backend origin (BACKEND_BASE_URL), the
// same cross-origin path already proven by the V3-H.1/V3-H.2 browser acceptance
// (not the /api/proxy Netlify function used by legacy action-based calls — the
// V3 routes are REST paths, and CORS on the backend was fixed in V3-H.2
// specifically to allow this direct browser call). Uses the SAME operational
// Auth V2 bearer token as the rest of the app (api.js `auth.getToken()`) — no
// second token store, no new credential source.
import { auth } from '../api';
import { BACKEND_BASE_URL } from '../utils/backendBase';

export const ACCESS_USERS_PATH = '/api/auth/v3/access-users';

// The V3 API collapses missing / malformed / expired / stale-session-version
// tokens into one code (AUTH_UNAUTHENTICATED, 401) — confirmed against the
// backend source (src/auth/jwt.js verifyToken, accessManagementHttpHandlersV3.js
// auth middleware). There is no separate "expired" vs "missing" code, so one
// branch is the correct and complete handling, not a shortcut.
const SESSION_EXPIRED_CODE = 'AUTH_UNAUTHENTICATED';

// Fires the SAME canonical operational-logout signal the rest of the app uses
// (src/api.js onOperationalUnauthorized, src/App.jsx's "ld-operational-unauthorized"
// listener) so an expired/invalid session on this screen lands the operator back
// on the PIN screen exactly like every other authenticated surface — no second
// logout path, no new session store.
function invalidateOperationalSession() {
  try { auth.clear(); } catch (_) { /* noop */ }
  try { window.dispatchEvent(new Event('ld-operational-unauthorized')); } catch (_) { /* noop */ }
}

// Whitelist projection of one wire user record. Never spreads the raw API
// object into the UI — unknown/extra fields are dropped, not forwarded. Returns
// null when a required field is structurally wrong, so the caller can fail into
// a safe recoverable error state instead of rendering malformed data.
function projectSafeUser(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  if (typeof r.actor !== 'string' || !r.actor) return null;
  if (typeof r.canonicalRole !== 'string' || !r.canonicalRole) return null;
  if (typeof r.active !== 'boolean') return null;
  if (typeof r.hasPin !== 'boolean') return null;
  return {
    actor: r.actor,
    displayName: typeof r.displayName === 'string' ? r.displayName : '',
    canonicalRole: r.canonicalRole,
    active: r.active,
    hasPin: r.hasPin,
  };
}

// One shared GET call. Returns a discriminated result — never throws — so
// callers can render loading/empty/error states without try/catch.
//   { kind: 'ok', status, body }
//   { kind: 'unauthenticated' | 'forbidden' | 'not_found' | 'server' | 'network' | 'malformed', status, code }
async function accessManagementGet(path) {
  const token = auth.getToken();
  if (!token) return { kind: 'unauthenticated', status: 401, code: SESSION_EXPIRED_CODE };

  let res;
  try {
    res = await fetch(BACKEND_BASE_URL + path, {
      method: 'GET',
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token },
    });
  } catch (_) {
    return { kind: 'network', status: 0, code: null };
  }

  let body = null;
  try { body = await res.json(); } catch (_) { body = null; }

  if (!body || typeof body !== 'object') {
    return { kind: 'server', status: res.status, code: null };
  }

  const code = typeof body.code === 'string' ? body.code : null;

  if (res.status === 401 || code === SESSION_EXPIRED_CODE) {
    invalidateOperationalSession();
    return { kind: 'unauthenticated', status: res.status, code: code || SESSION_EXPIRED_CODE };
  }
  if (res.status === 403) return { kind: 'forbidden', status: res.status, code };
  if (res.status === 404) return { kind: 'not_found', status: res.status, code };
  if (!res.ok || body.ok !== true) return { kind: 'server', status: res.status, code };

  return { kind: 'ok', status: res.status, body };
}

// GET /api/auth/v3/access-users — the list used by the main page load.
export async function listAccessUsers() {
  const result = await accessManagementGet(ACCESS_USERS_PATH);
  if (result.kind !== 'ok') return result;
  if (!Array.isArray(result.body.users)) return { kind: 'malformed', status: result.status, code: null };
  const users = [];
  for (const raw of result.body.users) {
    const safe = projectSafeUser(raw);
    if (!safe) return { kind: 'malformed', status: result.status, code: null };
    users.push(safe);
  }
  return { kind: 'ok', status: result.status, users };
}

// GET /api/auth/v3/access-users/:actor — kept for a future detail view or
// cross-check; the V3-I.1 page reads MI ACCESO/PERSONAL from the single list
// response above and does not call this on its main load path.
export async function getAccessUser(actorId) {
  const id = encodeURIComponent(String(actorId == null ? '' : actorId));
  const result = await accessManagementGet(`${ACCESS_USERS_PATH}/${id}`);
  if (result.kind !== 'ok') return result;
  const safe = projectSafeUser(result.body.user);
  if (!safe) return { kind: 'malformed', status: result.status, code: null };
  return { kind: 'ok', status: result.status, user: safe };
}
