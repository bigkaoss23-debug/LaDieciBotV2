// ─── ACCOUNT HELPERS — pure, dependency-free (unit-testable in isolation) ────
// No imports: safe to load under plain node or jest without a DOM/network and
// without pulling the Supabase client. accountApi.js re-exports these.

// Mirrors the Supabase Auth password policy configured for this project
// (minimum 12 chars, letters + digits).
export const PASSWORD_MIN = 12;

export function validatePassword(pw) {
  const s = pw == null ? '' : String(pw);
  if (s.length < PASSWORD_MIN) return { ok: false, code: 'too_short' };
  if (!/[A-Za-z]/.test(s)) return { ok: false, code: 'need_letter' };
  if (!/[0-9]/.test(s)) return { ok: false, code: 'need_digit' };
  return { ok: true, code: 'ok' };
}

// Single accurate message for EVERY policy failure (length AND composition).
// Deliberately states the full rule so it never implies that only a number, or
// only length, is required. Mirrors the staging Supabase policy exactly.
export const PASSWORD_POLICY_MESSAGE =
  `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres e incluir letras y números.`;

// Validate a new-password + confirmation pair (signup / recovery). Pure and
// testable: returns { ok, code } where code is a policy code, 'mismatch', or 'ok'.
export function validateNewPassword(pw, pw2) {
  const v = validatePassword(pw);
  if (!v.ok) return { ok: false, code: v.code };
  if (pw !== pw2) return { ok: false, code: 'mismatch' };
  return { ok: true, code: 'ok' };
}

// Privacy-safe outcome for a password-reset REQUEST. We never confirm an email
// was actually sent (no account enumeration, and the built-in mailer may be
// rate-limited or unavailable). A genuine rate-limit (429 / over_email_send) gets
// its own accurate message; everything else gets the neutral "maybe sent" text.
export const RESET_REQUEST_MESSAGE =
  'Si la dirección es válida y el servicio de correo puede procesar la solicitud, recibirás un enlace para restablecer la contraseña.';
export const RESET_RATE_LIMIT_MESSAGE =
  'Demasiadas solicitudes de envío. Espera unos minutos antes de pedir otro enlace.';

export function describeResetOutcome(error) {
  const status = error && error.status;
  const code = String((error && error.code) || '').toLowerCase();
  const msg = String((error && error.message) || '').toLowerCase();
  if (status === 429 || code.includes('over_email_send') || /rate limit|too many/.test(`${msg} ${code}`)) {
    return { rateLimited: true, message: RESET_RATE_LIMIT_MESSAGE };
  }
  return { rateLimited: false, message: RESET_REQUEST_MESSAGE };
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email == null ? '' : email).trim());
}

// Parse a Supabase email-link callback from the URL hash/query. Returns ONLY
// non-secret routing info — never the access/refresh token value itself.
//   { present, type, error, errorDescription }
export function parseAuthCallback(hash, search) {
  const out = { present: false, type: null, error: null, errorDescription: null };
  const scan = (str) => {
    if (!str) return;
    const first = str.charAt(0);
    const q = first === '#' || first === '?' ? str.slice(1) : str;
    if (!q) return;
    let p;
    try { p = new URLSearchParams(q); } catch (_) { return; }
    const type = p.get('type');
    const err = p.get('error') || p.get('error_code');
    if (type && !out.type) out.type = type;
    if (err && !out.error) out.error = err;
    const desc = p.get('error_description');
    if (desc && !out.errorDescription) out.errorDescription = desc;
    if (p.get('access_token') || p.get('code') || type || err) out.present = true;
  };
  scan(hash);
  scan(search);
  return out;
}

// True when the current path is the customer account entry point (/cuenta).
export function isAccountRoute(pathname) {
  const p = String(pathname == null ? '' : pathname).replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
  return p === 'cuenta' || p === 'account';
}

// Decide whether the top-level app should render the ACCOUNT surface instead of
// the operator app: either the /cuenta route, or an auth callback landing at root.
export function shouldRenderAccount(loc) {
  const l = loc || (typeof window !== 'undefined' ? window.location : {});
  if (isAccountRoute(l && l.pathname)) return true;
  return parseAuthCallback(l && l.hash, l && l.search).present;
}

// Reduce a /api/account/me body to the neutral account-page flags. An unassigned
// account (memberships [] and workspaces []) => noWorkspace + noAccess true.
export function summarizeAccount(me) {
  const m = me || {};
  const memberships = Array.isArray(m.memberships) ? m.memberships : [];
  const workspaces = Array.isArray(m.workspaces) ? m.workspaces : [];
  return {
    emailVerified: m.emailVerified === true,
    membershipCount: memberships.length,
    noWorkspace: memberships.length === 0,
    noAccess: workspaces.length === 0,
  };
}
