// ─── Access Management V3 — canonical client (V3-I.1 read + V3-I write) ──────
// Consumes the accepted, staging-gated Access Management V3 API (V3-F/V3-G/V3-H/
// V3-H.2), proven end-to-end from this exact staging frontend origin:
//   browser owner session → CORS → Railway staging → Access Management V3 API
//   → PostgREST → Supabase staging.
//
// Transport: direct fetch to the Railway backend origin (BACKEND_BASE_URL), the
// same cross-origin path already proven by the V3-H.1/V3-H.2 browser acceptance
// (not the /api/proxy Netlify function used by legacy action-based calls — the
// V3 routes are REST paths, and CORS on the backend was fixed in V3-H.2
// specifically to allow this direct browser call). Uses the SAME operational
// Auth V2 bearer token as the rest of the app (api.js `auth.getToken()`) — no
// second token store, no new credential source.
//
// V3-I adds the 7 write methods (create/rename/role-change/PIN-set/PIN-clear/
// deactivate/reactivate). Every one requires a `stepUpProof` (from the existing
// canonical owner step-up flow, src/operationalSession.js getPinStepUp — never a
// second proof format) and a `clientRequestId` (idempotency key, safe-replay on
// an identical retry, AUTH_IDEMPOTENCY_CONFLICT on a changed payload — see the
// backend's `access_management_idempotency` contract). Field names, body shapes
// and error codes below are mirrored exactly from the backend's own handlers/
// tests (src/auth/accessManagementHttpHandlersV3.js) — not guessed.
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
//
// V3-I: also retains `dbRole` and `sessionVersion` — NOT for display (the page/
// view-model must never render them as primary text), but because the write
// routes' stale-snapshot guards compare against the RAW `auth_actors.role` value
// (confirmed directly against the RPC source: `IF v_tgt.role <> p_expected_role`,
// where v_tgt is `SELECT * FROM auth_actors` — the raw row, not a canonical
// mapping) and the raw `session_version`. Neither is a secret (no pin/hash/
// fingerprint here) — both were already part of the original V3-F wire envelope.
function projectSafeUser(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  if (typeof r.actor !== 'string' || !r.actor) return null;
  if (typeof r.dbRole !== 'string' || !r.dbRole) return null;
  if (typeof r.canonicalRole !== 'string' || !r.canonicalRole) return null;
  if (typeof r.active !== 'boolean') return null;
  if (typeof r.hasPin !== 'boolean') return null;
  if (!Number.isInteger(r.sessionVersion)) return null;
  return {
    actor: r.actor,
    displayName: typeof r.displayName === 'string' ? r.displayName : '',
    dbRole: r.dbRole,
    canonicalRole: r.canonicalRole,
    active: r.active,
    hasPin: r.hasPin,
    sessionVersion: r.sessionVersion,
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

// ═══ WRITE METHODS (V3-I) ═══════════════════════════════════════════════════

// Every write failure code the backend can return on these 7 routes, mapped to a
// stable `kind` the UI branches on — the exact Spanish sentence per kind lives in
// accessManagementErrors.js, not here (this module stays transport-only).
const WRITE_CODE_KIND = Object.freeze({
  AUTH_STEP_UP_REQUIRED: 'step_up_required',
  AUTH_CLIENT_REQUEST_ID_INVALID: 'client_request_id_invalid',
  AUTH_ROLE_INVALID: 'role_invalid',
  AUTH_DISPLAY_NAME_INVALID: 'display_name_invalid',
  AUTH_PIN_FORMAT_INVALID: 'pin_format_invalid',
  AUTH_ACCESS_MANAGEMENT_UNAVAILABLE: 'unavailable',
  AUTH_IDEMPOTENCY_CONFLICT: 'idempotency_conflict',
  AUTH_PIN_DUPLICATE: 'pin_duplicate',
  AUTH_PIN_RESERVED: 'pin_reserved',
  AUTH_WAITER_HAS_OPEN_TABLES: 'waiter_open_tables',
  // AUTH_INVALID_REQUEST is the backend's single generic bucket for a malformed
  // request AND a stale expected-state snapshot (no distinct wire code exists for
  // "your snapshot is stale" — confirmed against the RPC/handler source). Treated
  // as 'stale' here because the correct, safe UI reaction is identical either way:
  // refresh the record and ask the owner to re-confirm, never silently retry.
  AUTH_INVALID_REQUEST: 'stale',
  AUTH_ACCESS_MANAGEMENT_INTERNAL_ERROR: 'server',
});

// One shared write call (POST/PATCH/PUT/DELETE with a JSON body). Mirrors
// accessManagementGet's discriminated-result shape and never-throws contract, so
// every caller handles success/failure the same way as the read methods.
async function accessManagementWrite(method, path, body) {
  const token = auth.getToken();
  if (!token) return { kind: 'unauthenticated', status: 401, code: SESSION_EXPIRED_CODE };

  let res;
  try {
    res = await fetch(BACKEND_BASE_URL + path, {
      method,
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  } catch (_) {
    return { kind: 'network', status: 0, code: null };
  }

  let responseBody = null;
  try { responseBody = await res.json(); } catch (_) { responseBody = null; }

  if (!responseBody || typeof responseBody !== 'object') {
    return { kind: 'server', status: res.status, code: null };
  }

  const code = typeof responseBody.code === 'string' ? responseBody.code : null;

  if (res.status === 401 || code === SESSION_EXPIRED_CODE) {
    invalidateOperationalSession();
    return { kind: 'unauthenticated', status: res.status, code: code || SESSION_EXPIRED_CODE };
  }
  if (res.status === 403 && code !== 'AUTH_STEP_UP_REQUIRED') return { kind: 'forbidden', status: res.status, code };
  if (res.status === 404) return { kind: 'not_found', status: res.status, code };
  if (!res.ok || responseBody.ok !== true) {
    const kind = (code && WRITE_CODE_KIND[code]) || 'server';
    return { kind, status: res.status, code };
  }
  return { kind: 'ok', status: res.status, body: responseBody };
}

// create/rename share the same wire shape — no `hasPin` field (confirmed:
// toWireCreateOrRenameResult never includes it), unlike list/get/pin-set.
function projectCreateOrRenameResult(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  if (typeof r.actor !== 'string' || !r.actor) return null;
  if (typeof r.canonicalRole !== 'string' || !r.canonicalRole) return null;
  if (typeof r.active !== 'boolean') return null;
  return {
    actor: r.actor,
    displayName: typeof r.displayName === 'string' ? r.displayName : '',
    canonicalRole: r.canonicalRole,
    active: r.active,
  };
}

function projectRoleChangeResult(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  if (typeof r.actor !== 'string' || !r.actor) return null;
  if (typeof r.role !== 'string' || !r.role) return null;
  return {
    actor: r.actor,
    oldRole: typeof r.oldRole === 'string' ? r.oldRole : '',
    role: r.role,
    changed: r.changed === true,
  };
}

function projectPinSetResult(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  if (typeof r.actor !== 'string' || !r.actor) return null;
  if (typeof r.active !== 'boolean') return null;
  if (typeof r.hasPin !== 'boolean') return null;
  return { actor: r.actor, active: r.active, hasPin: r.hasPin };
}

// clear-pin / deactivate / reactivate share this lifecycle-result shape.
function projectLifecycleResult(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  if (typeof r.actor !== 'string' || !r.actor) return null;
  if (typeof r.active !== 'boolean') return null;
  return { actor: r.actor, active: r.active };
}

function actorPath(actor, suffix) {
  const id = encodeURIComponent(String(actor == null ? '' : actor));
  return `${ACCESS_USERS_PATH}/${id}${suffix}`;
}

// POST /api/auth/v3/access-users — the created actor id is server-generated;
// never send one. `role` must be one of the 5 assignable canonical roles.
export async function createAccessUser({ displayName, role, stepUpProof, clientRequestId } = {}) {
  const result = await accessManagementWrite('POST', ACCESS_USERS_PATH, {
    stepUpProof, clientRequestId, role, displayName,
  });
  if (result.kind !== 'ok') return result;
  const user = projectCreateOrRenameResult(result.body.user);
  if (!user) return { kind: 'malformed', status: result.status, code: null };
  return { kind: 'ok', status: result.status, user };
}

// PATCH /api/auth/v3/access-users/:actor/display-name
export async function renameAccessUser({ actor, displayName, stepUpProof, clientRequestId } = {}) {
  const result = await accessManagementWrite('PATCH', actorPath(actor, '/display-name'), {
    stepUpProof, clientRequestId, displayName,
  });
  if (result.kind !== 'ok') return result;
  const user = projectCreateOrRenameResult(result.body.user);
  if (!user) return { kind: 'malformed', status: result.status, code: null };
  return { kind: 'ok', status: result.status, user };
}

// PATCH /api/auth/v3/access-users/:actor/role — `expectedRole` is the
// stale-snapshot guard (what the caller believes the current role is);
// `requestedRole` is the new role. Both required, both distinct field names.
export async function changeAccessUserRole({ actor, expectedRole, requestedRole, stepUpProof, clientRequestId } = {}) {
  const result = await accessManagementWrite('PATCH', actorPath(actor, '/role'), {
    stepUpProof, clientRequestId, expectedRole, requestedRole,
  });
  if (result.kind !== 'ok') return result;
  const user = projectRoleChangeResult(result.body.user);
  if (!user) return { kind: 'malformed', status: result.status, code: null };
  return { kind: 'ok', status: result.status, user };
}

// PUT /api/auth/v3/access-users/:actor/pin — `pin` must be exactly 6 digits
// (NEW_PIN_LENGTH), validated server-side against the weak/sequential-pattern
// policy. No stale-snapshot field on this route.
export async function setAccessUserPin({ actor, pin, stepUpProof, clientRequestId } = {}) {
  const result = await accessManagementWrite('PUT', actorPath(actor, '/pin'), {
    stepUpProof, clientRequestId, pin,
  });
  if (result.kind !== 'ok') return result;
  const user = projectPinSetResult(result.body.user);
  if (!user) return { kind: 'malformed', status: result.status, code: null };
  return { kind: 'ok', status: result.status, user };
}

// DELETE /api/auth/v3/access-users/:actor/pin — clears the existing credential
// only; never sets a new one. `expectedSessionVersion` (integer >= 1) is the
// stale-snapshot guard for this route.
export async function clearAccessUserPin({ actor, expectedSessionVersion, stepUpProof, clientRequestId } = {}) {
  const result = await accessManagementWrite('DELETE', actorPath(actor, '/pin'), {
    stepUpProof, clientRequestId, expectedSessionVersion,
  });
  if (result.kind !== 'ok') return result;
  const user = projectLifecycleResult(result.body.user);
  if (!user) return { kind: 'malformed', status: result.status, code: null };
  return { kind: 'ok', status: result.status, user };
}

// POST /api/auth/v3/access-users/:actor/deactivate — `expectedActive` (boolean)
// is the stale-snapshot guard. Can fail with `waiter_open_tables` if the target
// is a waiter with open assigned table sessions.
export async function deactivateAccessUser({ actor, expectedActive, stepUpProof, clientRequestId } = {}) {
  const result = await accessManagementWrite('POST', actorPath(actor, '/deactivate'), {
    stepUpProof, clientRequestId, expectedActive,
  });
  if (result.kind !== 'ok') return result;
  const user = projectLifecycleResult(result.body.user);
  if (!user) return { kind: 'malformed', status: result.status, code: null };
  return { kind: 'ok', status: result.status, user };
}

// POST /api/auth/v3/access-users/:actor/reactivate — `expectedActive` (boolean)
// is the stale-snapshot guard. Never produces a waiter/open-tables conflict
// (reactivation never removes anyone from an open table).
export async function reactivateAccessUser({ actor, expectedActive, stepUpProof, clientRequestId } = {}) {
  const result = await accessManagementWrite('POST', actorPath(actor, '/reactivate'), {
    stepUpProof, clientRequestId, expectedActive,
  });
  if (result.kind !== 'ok') return result;
  const user = projectLifecycleResult(result.body.user);
  if (!user) return { kind: 'malformed', status: result.status, code: null };
  return { kind: 'ok', status: result.status, user };
}
