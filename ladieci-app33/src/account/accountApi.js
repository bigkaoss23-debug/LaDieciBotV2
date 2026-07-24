// ─── ACCOUNT API — thin wrappers over Supabase Auth + the backend account boundary ──
// Pure helpers (validatePassword / validateEmail / parseAuthCallback / isAccountRoute)
// are exported separately so they can be unit-tested without a DOM or network.
//
// SECURITY: never logs passwords, tokens, confirmation links or reset tokens. The
// access token is read from the Supabase session only to set the Authorization header
// for /api/account/me and is never persisted by us or returned to callers.
import { getAccountClient, ACCOUNT_REDIRECT_URL } from './supabaseAccountClient';

// Pure, dependency-free helpers live in accountHelpers.js (unit-testable in
// isolation). Re-exported here so callers have a single import surface.
export {
  PASSWORD_MIN,
  validatePassword,
  validateEmail,
  parseAuthCallback,
  isAccountRoute,
  shouldRenderAccount,
  summarizeAccount,
} from './accountHelpers';

// ── Supabase Auth actions ────────────────────────────────────────────────────
export async function accountSignUp(email, password) {
  const supabase = getAccountClient();
  return supabase.auth.signUp({
    email: String(email == null ? '' : email).trim(),
    password,
    options: { emailRedirectTo: ACCOUNT_REDIRECT_URL },
  });
}

export async function accountSignIn(email, password) {
  const supabase = getAccountClient();
  return supabase.auth.signInWithPassword({
    email: String(email == null ? '' : email).trim(),
    password,
  });
}

export async function accountRequestReset(email) {
  const supabase = getAccountClient();
  return supabase.auth.resetPasswordForEmail(String(email == null ? '' : email).trim(), {
    redirectTo: ACCOUNT_REDIRECT_URL,
  });
}

export async function accountUpdatePassword(password) {
  const supabase = getAccountClient();
  return supabase.auth.updateUser({ password });
}

export async function accountGetSession() {
  const supabase = getAccountClient();
  const { data } = await supabase.auth.getSession();
  return (data && data.session) || null;
}

export async function accountSignOut() {
  const supabase = getAccountClient();
  try { await supabase.auth.signOut(); } catch (_) { /* best effort */ }
}

// Call the backend account boundary with the current Supabase access token.
// Returns { status, ok, body }. The token is used only for the Authorization
// header and never returned.
export async function fetchAccountMe() {
  const session = await accountGetSession();
  if (!session || !session.access_token) return { status: 401, ok: false, body: { error: 'no_session' } };
  let res;
  try {
    res = await fetch('/api/account/me', {
      headers: { Authorization: 'Bearer ' + session.access_token },
      cache: 'no-store',
    });
  } catch (_) {
    return { status: 0, ok: false, body: { error: 'network' } };
  }
  let body = {};
  try { body = await res.json(); } catch (_) { body = {}; }
  return { status: res.status, ok: res.ok, body };
}
