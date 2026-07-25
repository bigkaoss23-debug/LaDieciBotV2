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

// ── operational ADMIN PIN policy (mirror of the backend pinPolicy 'admin' rule) ──
// Admin PINs are 9–12 digits and must not be trivial. This is a client-side pre-check
// for fast feedback; the backend re-validates authoritatively and is the source of truth.
export const ADMIN_PIN_MIN = 9;
export const ADMIN_PIN_MAX = 12;
export const ADMIN_PIN_POLICY_MESSAGE =
  `El PIN de administrador debe tener entre ${ADMIN_PIN_MIN} y ${ADMIN_PIN_MAX} dígitos y no puede ser una secuencia u obvio.`;
export const ADMIN_PIN_MISMATCH_MESSAGE = 'Los dos PIN no coinciden.';

function pinAllSame(pin) { return /^(\d)\1*$/.test(pin); }
function pinSequential(pin) {
  let asc = true, desc = true;
  for (let i = 1; i < pin.length; i++) {
    const d = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
    if (d !== 1) asc = false;
    if (d !== -1) desc = false;
  }
  return asc || desc;
}
function pinRepeatedBlock(pin) {
  const n = pin.length;
  for (let b = 1; b <= Math.floor(n / 2); b++) {
    if (n % b !== 0) continue;
    if (pin.slice(0, b).repeat(n / b) === pin) return true;
  }
  return false;
}

// Returns { ok, code } where code ∈ 'ok' | 'policy' | 'mismatch'. Pure.
export function validateAdminPin(pin, pin2) {
  const s = pin == null ? '' : String(pin);
  if (!/^\d+$/.test(s)) return { ok: false, code: 'policy' };
  if (s.length < ADMIN_PIN_MIN || s.length > ADMIN_PIN_MAX) return { ok: false, code: 'policy' };
  if (pinAllSame(s) || pinSequential(s) || pinRepeatedBlock(s)) return { ok: false, code: 'policy' };
  if (pin2 !== undefined && s !== String(pin2 == null ? '' : pin2)) return { ok: false, code: 'mismatch' };
  return { ok: true, code: 'ok' };
}

// ── T9 "memorable word" → numeric PIN (LOCAL memory aid only) ────────────────
// Standard telephone keypad mapping. The word is a local aid to remember the digits:
// it is NEVER sent to the backend, never stored (no localStorage/sessionStorage/DB),
// never logged and never placed in a URL. Only the numeric PIN reaches the API.
// Spanish-friendly: diacritics are normalised first (á→a→2, ñ→n→6), so accented input
// still maps one letter → exactly one digit.
export const T9_MAP = Object.freeze({
  2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ',
});

const T9_LOOKUP = (() => {
  const t = {};
  Object.keys(T9_MAP).forEach((d) => { for (const ch of T9_MAP[d]) t[ch] = d; });
  return t;
})();

// Separators a human naturally types; ignored rather than rejected.
const T9_SEPARATORS = /[\s\-_.'’,]/;

// Convert a word/phrase to digits. Returns { ok, pin, code } with
// code ∈ 'ok' | 'unsupported' | 'empty'. Pure — no I/O, no storage, no logging.
export function wordToPin(word) {
  const raw = word == null ? '' : String(word);
  // Strip diacritics so Spanish words map naturally (NFD + combining-mark removal).
  const norm = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let out = '';
  for (const ch of norm) {
    if (T9_SEPARATORS.test(ch)) continue;      // ignored
    if (ch >= '0' && ch <= '9') { out += ch; continue; } // already a digit
    const d = T9_LOOKUP[ch.toUpperCase()];
    if (!d) return { ok: false, code: 'unsupported', pin: '' };
    out += d;
  }
  if (out.length === 0) return { ok: false, code: 'empty', pin: '' };
  return { ok: true, code: 'ok', pin: out };
}

export const WORD_PIN_LENGTH_MESSAGE =
  `La palabra debe generar un PIN de entre ${ADMIN_PIN_MIN} y ${ADMIN_PIN_MAX} dígitos.`;
export const WORD_PIN_UNSUPPORTED_MESSAGE = 'Esta palabra contiene caracteres no compatibles.';

// Full word→PIN validation against the SAME admin policy the backend enforces.
// Returns { ok, pin, code } with code ∈ 'ok' | 'unsupported' | 'empty' | 'length' | 'policy'.
export function validateWordPin(word) {
  const r = wordToPin(word);
  if (!r.ok) return { ok: false, pin: '', code: r.code };
  if (r.pin.length < ADMIN_PIN_MIN || r.pin.length > ADMIN_PIN_MAX) {
    return { ok: false, pin: '', code: 'length' };
  }
  const v = validateAdminPin(r.pin);
  if (!v.ok) return { ok: false, pin: '', code: 'policy' };
  return { ok: true, pin: r.pin, code: 'ok' };
}

// Map any word-mode failure code to its precise Spanish message.
export function wordPinMessage(code) {
  if (code === 'unsupported') return WORD_PIN_UNSUPPORTED_MESSAGE;
  if (code === 'length' || code === 'empty') return WORD_PIN_LENGTH_MESSAGE;
  return ADMIN_PIN_POLICY_MESSAGE;
}
