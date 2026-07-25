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
  PASSWORD_POLICY_MESSAGE,
  RESET_REQUEST_MESSAGE,
  RESET_RATE_LIMIT_MESSAGE,
  validatePassword,
  validateNewPassword,
  describeResetOutcome,
  validateEmail,
  parseAuthCallback,
  isAccountRoute,
  shouldRenderAccount,
  summarizeAccount,
  ADMIN_PIN_MIN,
  ADMIN_PIN_MAX,
  ADMIN_PIN_POLICY_MESSAGE,
  validateAdminPin,
  resolvePinInput,
  pinInputMessage,
  formatPinGroups,
  generateSecurePin,
  PIN_NUMERIC_ONLY_MESSAGE,
  PIN_LENGTH_MESSAGE,
  PIN_MISMATCH_MESSAGE,
  PIN_MATCH_LABEL,
  PIN_MISMATCH_LABEL,
  PIN_HELP_TEXT,
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

// Authenticated call to the backend account boundary using the current Supabase access
// token. The token is used ONLY for the Authorization header and never returned/persisted.
// `body`, when given, is sent as JSON. Returns { status, ok, body }.
async function accountFetch(path, { method = 'GET', body } = {}) {
  const session = await accountGetSession();
  if (!session || !session.access_token) return { status: 401, ok: false, body: { error: 'no_session' } };
  const headers = { Authorization: 'Bearer ' + session.access_token };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      cache: 'no-store',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (_) {
    return { status: 0, ok: false, body: { error: 'network' } };
  }
  let out = {};
  try { out = await res.json(); } catch (_) { out = {}; }
  return { status: res.status, ok: res.ok, body: out };
}

// GET /api/account/me — profile + memberships + server-derived adminPinSetupRequired.
export async function fetchAccountMe() {
  return accountFetch('/api/account/me');
}

// POST /api/account/workspaces/bootstrap — idempotent La Dieci owner claim (staging-guarded
// server side). No identity in the body — the backend uses the verified token subject.
export async function claimWorkspace() {
  return accountFetch('/api/account/workspaces/bootstrap', { method: 'POST' });
}

// POST /api/account/workspaces/:id/admin-pin — create/rotate the owner operational PIN.
// The PIN is sent once over HTTPS, hashed server-side; it is never logged or persisted here.
export async function setAdminPin(workspaceId, pin) {
  const id = encodeURIComponent(String(workspaceId == null ? '' : workspaceId));
  return accountFetch(`/api/account/workspaces/${id}/admin-pin`, { method: 'POST', body: { pin } });
}
