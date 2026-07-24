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

// Lazily construct a single account client. Constructed only inside the account
// surface, so the operator app never instantiates it (and never runs URL session
// detection).
export function getAccountClient() {
  if (_client) return _client;
  _client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
      // Distinct storage key: makes the separation from the PIN session explicit.
      storageKey: 'ld-account-auth',
    },
  });
  return _client;
}
