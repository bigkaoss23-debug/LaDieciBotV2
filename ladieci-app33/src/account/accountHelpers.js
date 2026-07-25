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
// account (memberships [] and workspaces []) => noWorkspace + noAccess true. S2-7D adds
// the server-derived owner-workspace + admin-PIN-setup signals (never guessed here).
export function summarizeAccount(me) {
  const m = me || {};
  const memberships = Array.isArray(m.memberships) ? m.memberships : [];
  const workspaces = Array.isArray(m.workspaces) ? m.workspaces : [];
  const ownerMembership = memberships.find((x) => x && x.role === 'workspace_owner') || null;
  return {
    emailVerified: m.emailVerified === true,
    membershipCount: memberships.length,
    noWorkspace: memberships.length === 0,
    noAccess: workspaces.length === 0,
    // Owner workspace (if any) for display + the admin-PIN endpoint target.
    ownerWorkspaceId: ownerMembership ? (ownerMembership.workspaceId || null) : null,
    ownerWorkspaceName: ownerMembership ? (ownerMembership.workspaceName || null) : null,
    // Trust the server flag ONLY. Never infer PIN-setup need from missing data.
    adminPinSetupRequired: m.adminPinSetupRequired === true,
  };
}

// ── Operational PIN — EXACTLY 6 DIGITS (S2-7D2) ─────────────────────────────
// Mirrors the backend rotation policy (pinPolicy.validateNewPinFormat): exactly six digits,
// no letters, no separators, no admin bypass, and no trivial values. The backend re-validates
// authoritatively and owns uniqueness. NOTE: this is the policy for NEW/rotated PINs only —
// login still accepts the legacy lengths until all four actors have been rotated.
export const PIN_LENGTH = 6;

// { ok, pin, code } — code ∈ 'ok' | 'empty' | 'unsupported' | 'length' | 'weak'.
// `pin` is populated while still incomplete so the progress dots can update per keystroke.
export function resolvePinInput(text) {
  const raw = text == null ? '' : String(text);
  for (const ch of raw) {
    if (ch < '0' || ch > '9') return { ok: false, pin: '', code: 'unsupported' };
  }
  if (raw.length === 0) return { ok: false, pin: '', code: 'empty' };
  if (raw.length !== PIN_LENGTH) return { ok: false, pin: raw, code: 'length' };
  if (isTrivialPin(raw)) return { ok: false, pin: raw, code: 'weak' };
  return { ok: true, pin: raw, code: 'ok' };
}

function pinAllSameDigits(pin) { return /^(\d)\1*$/.test(pin); }
function pinSequentialDigits(pin) {
  let asc = true, desc = true;
  for (let i = 1; i < pin.length; i++) {
    const d = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
    if (d !== 1) asc = false;
    if (d !== -1) desc = false;
  }
  return asc || desc;
}
function pinRepeatedBlockDigits(pin) {
  const n = pin.length;
  for (let b = 1; b <= Math.floor(n / 2); b++) {
    if (n % b !== 0) continue;
    if (pin.slice(0, b).repeat(n / b) === pin) return true;
  }
  return false;
}
export function isTrivialPin(pin) {
  const s = String(pin == null ? '' : pin);
  return pinAllSameDigits(s) || pinSequentialDigits(s) || pinRepeatedBlockDigits(s);
}

export const PIN_LENGTH_MESSAGE = `El PIN debe tener exactamente ${PIN_LENGTH} números.`;
export const PIN_MISMATCH_MESSAGE = 'Los PIN no coinciden.';
export const PIN_DUPLICATE_MESSAGE = 'Este PIN no está disponible. Elige otro.';
export const PIN_WEAK_MESSAGE = 'Evita PIN previsibles como 111111, 123456 o 121212.';
export const PIN_MATCH_LABEL = 'Los PIN coinciden';
export const PIN_MISMATCH_LABEL = 'Los PIN no coinciden';

export function pinInputMessage(code) {
  if (code === 'weak') return PIN_WEAK_MESSAGE;
  return PIN_LENGTH_MESSAGE;   // length + empty + unsupported (digits-only keypad)
}

// Map the backend response for a PIN rotation to a Spanish message. The duplicate case is
// neutral: it never says WHICH actor already uses the PIN.
export function describePinSaveError(status, body) {
  const code = (body && body.error) || '';
  if (status === 409 || code === 'admin_pin_duplicate') return PIN_DUPLICATE_MESSAGE;
  return 'No se pudo guardar el PIN. Inténtalo de nuevo.';
}

export const PIN_GUIDANCE =
  `Elige un PIN de ${PIN_LENGTH} números para el acceso diario. Es distinto de la contraseña de tu cuenta.`;

// ── Session resume + idle auto-logout ───────────────────────────────────────
// The account session is tab-scoped (see supabaseAccountClient). Resuming it on load is
// safe — the token is already in the tab's storage, so forcing a fresh login only added
// friction without protecting anything. The REAL protection on a shared device is this
// idle timeout: after 15 minutes without interaction the account is signed out.
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

// A session may be resumed only on the plain entry point. An email-confirmation or
// password-recovery landing has its own view and must never be overridden by the resume.
export function shouldResumeSession(initialView, hasSession) {
  return hasSession === true && initialView === 'home';
}
