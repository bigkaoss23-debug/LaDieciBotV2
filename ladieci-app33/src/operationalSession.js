// S2-7D3 — canonical operational session: boot routing + the ONE logout path.
//
// Two defects motivated this module:
//   1. the surface decision (account vs operational) was taken synchronously in index.js from
//      raw URL params, once, before anything was initialised. A Supabase callback hash won
//      even when a valid operational session existed, and because the chosen view was captured
//      in useState it survived the URL being cleaned — so the registration-confirmation page
//      rendered instead of the operational app;
//   2. the callback had no "already processed" marker, so it replayed on every reload of that
//      history entry until an async replaceState happened to land.
//
// Rules implemented here:
//   A genuine, UNPROCESSED callback  -> account surface, processed exactly once, URL sanitised
//   valid operational session        -> operational app directly
//   no/!valid operational session    -> operational PIN directly (even with an active account)
//   /cuenta                          -> account surface (explicit secondary entry)
//
// ld_pin_ok / ld_role are presentation caches and are never treated as authentication.

import { auth } from './api';
import { parseAuthCallback, isAccountRoute } from './account/accountHelpers';

// Marks a callback as consumed for this tab. Tab-scoped on purpose: a new tab opened on a
// stale confirmation link is a genuinely new callback, but a reload is not.
const CALLBACK_DONE_KEY = 'ld_cb_done';

export const SURFACE = Object.freeze({
  ACCOUNT_CALLBACK: 'account_callback',
  ACCOUNT: 'account',
  OPERATIONAL: 'operational',
});

function tabGet(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } }
function tabSet(k, v) { try { sessionStorage.setItem(k, v); } catch (_) { /* noop */ } }

// A stable identity for one callback landing, so a reload of the SAME callback is a replay.
export function callbackFingerprint(loc) {
  const l = loc || (typeof window !== 'undefined' ? window.location : {});
  return String((l && l.hash) || '') + '|' + String((l && l.search) || '');
}

export function isCallbackProcessed(loc) {
  const fp = callbackFingerprint(loc);
  return !!fp && tabGet(CALLBACK_DONE_KEY) === fp;
}

export function markCallbackProcessed(loc) {
  const fp = callbackFingerprint(loc);
  if (fp) tabSet(CALLBACK_DONE_KEY, fp);
}

// Strip EVERY auth query/hash parameter from the visible URL. Authorization codes, token
// hashes and recovery parameters must never stay in browser history.
export function sanitizeCallbackUrl() {
  try {
    if (typeof window === 'undefined' || !window.history || !window.history.replaceState) return;
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (_) { /* noop */ }
}

// Which surface should mount. Pure: no I/O, safe to unit test.
export function resolveSurface(loc, opts = {}) {
  const l = loc || (typeof window !== 'undefined' ? window.location : {});

  // Explicit secondary entry point always wins — the user asked for it.
  if (isAccountRoute(l && l.pathname)) return SURFACE.ACCOUNT;

  // A genuine callback, but only the FIRST time this tab sees it.
  const cb = parseAuthCallback(l && l.hash, l && l.search);
  if (cb.present && !(opts.callbackProcessed === true)) return SURFACE.ACCOUNT_CALLBACK;

  // Everything else is operational. App itself then shows the PIN screen or the application
  // depending on whether a valid Auth V2 session was restored — an active personal account
  // NEVER becomes the default landing surface.
  return SURFACE.OPERATIONAL;
}

// Server validation of the restored operational token. The claim check is local and cheap;
// this proves the backend still accepts it (actor active + fresh session_version), because a
// rotation or deactivation invalidates a token that still looks structurally valid.
// Returns true only on a definite success. A network failure is NOT treated as invalid —
// that would sign the operator out of a working shift on a blip; the first real request will
// fail closed anyway.
export async function validateOperationalSession(fetchImpl) {
  if (!auth.isAuthenticated()) return false;
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!f) return true;
  try {
    const res = await f('/api/proxy?action=getOrdenes', {
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + auth.getToken() },
    });
    if (res.status === 401 || res.status === 403) return false;
    return true;
  } catch (_) {
    return true; // inconclusive — keep the shift, let the next real request decide
  }
}

// ── THE canonical operational logout ────────────────────────────────────────
// Used by: the menu action, the inactivity timeout, and every 401/403 from Auth V2.
// Clears ONLY operational state. The personal Supabase account session (ld-account-auth)
// is deliberately untouched — the two sessions are independent.
const teardownHooks = new Set();

// Register realtime/polling teardown (websocket close, clearInterval, ...).
export function registerOperationalTeardown(fn) {
  if (typeof fn !== 'function') return () => {};
  teardownHooks.add(fn);
  return () => teardownHooks.delete(fn);
}

export function operationalLogout() {
  // 1) stop realtime + polling before dropping the credential
  teardownHooks.forEach((fn) => { try { fn(); } catch (_) { /* never block logout */ } });
  teardownHooks.clear();
  // 2) drop the token and every operational presentation flag (auth.clear also purges any
  //    pre-cutover localStorage copy). ld-account-auth is NOT in that set.
  try { auth.clear(); } catch (_) { /* noop */ }
  try { sessionStorage.removeItem(CALLBACK_DONE_KEY); } catch (_) { /* noop */ }
}

// Spanish labels for the verified Auth V2 identity. Derived from the token/response only.
const ACTOR_LABEL = Object.freeze({
  owner: 'Propietario',
  operator_primary: 'Operador principal',
  operator_backup: 'Operador de apoyo',
  rider: 'Repartidor',
});
const ROLE_LABEL = Object.freeze({
  admin: 'Administrador',
  operator: 'Operador',
  rider: 'Repartidor',
});

export function describeIdentity(actor, role) {
  const a = ACTOR_LABEL[actor] || '';
  const r = ROLE_LABEL[role] || '';
  if (a && r && a !== r) return a + ' · ' + r;
  return a || r || '';
}

export { ACTOR_LABEL, ROLE_LABEL, CALLBACK_DONE_KEY };
