// ─── CUSTOMER ACCOUNT AUTH (Supabase Auth / GoTrue) ─────────────────────────
// S2-7C2 — customer-facing account boundary. This is the "normal Supabase client"
// for account signup / login / password recovery. It is COMPLETELY SEPARATE from
// the operator PIN login (src/api.js `auth`, sessionStorage `ld_token`): different
// storage key, different token, different backend chain. Nothing here touches the
// PIN flow, operator roles, workspaces, actors, or PINs.
//
// URL + publishable anon key are reused from src/api.js (single source of truth,
// staging values baked at build time via REACT_APP_SUPABASE_* — no prod literal here).
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../api';

// Where GoTrue sends the user after an email-confirmation or password-recovery link.
// MUST be an allow-listed Supabase redirect URL. We use the site ORIGIN (== the
// configured Site URL and the only allow-list entry) and detect the callback there.
// We deliberately do NOT invent /auth/confirm or /auth/reset-password sub-routes.
export const ACCOUNT_REDIRECT_URL =
  (typeof window !== 'undefined' && window.location && window.location.origin) ||
  'https://ladieci-v1-staging.netlify.app';

let _client = null;

// TAB-SCOPED session storage. The account token lives in sessionStorage, NOT localStorage:
// reloading the page keeps you signed in (no pointless re-login), but closing the tab or the
// browser ends the session. On a shared pizzeria tablet that is the behaviour we want, and it
// honours the project rule "MAI localStorage — app usata da più operatori sullo stesso
// browser". Falls back to an in-memory store where sessionStorage is unavailable (SSR/tests)
// so the client never throws and never silently downgrades to a persistent store.
export function accountSessionStorage() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      // probe: Safari private mode exposes the API but throws on write
      const k = '__ld_probe__';
      window.sessionStorage.setItem(k, '1');
      window.sessionStorage.removeItem(k);
      return window.sessionStorage;
    }
  } catch (_) { /* fall through to memory */ }
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
}

// One-time cleanup of the pre-migration session. Until S2-7D the account token was written
// to localStorage, where it survived indefinitely on a shared browser. Moving to
// sessionStorage stops NEW tokens persisting, but an old one would still be sitting there —
// a valid credential nobody reads any more. Remove it on startup.
export function purgeLegacyLocalSession() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('ld-account-auth');
    }
  } catch (_) { /* never block the account surface on storage errors */ }
}

// Lazily construct a single account client. Constructed only inside the account
// surface, so the operator app never instantiates it (and never runs URL session
// detection).
export function getAccountClient() {
  if (_client) return _client;
  purgeLegacyLocalSession();
  _client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
      // Distinct storage key: makes the separation from the PIN session explicit.
      storageKey: 'ld-account-auth',
      // Tab-scoped (see above) — never localStorage.
      storage: accountSessionStorage(),
    },
  });
  return _client;
}
