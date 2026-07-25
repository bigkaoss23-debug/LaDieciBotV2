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

// ── Unified PIN input: a memorable WORD or a direct NUMERIC PIN ─────────────
// ONE field accepts either digits only, or ASCII letters only (spaces and hyphens are
// harmless separators). Mixed letters+digits (e.g. "PIZZA2026") are rejected so the mode is
// never ambiguous. Letters convert LOCALLY with the standard telephone mapping; the word is
// a mnemonic only — never sent to the server, never stored, never logged. Accented letters
// are deliberately REJECTED (not transliterated) so frontend behaviour matches the accepted
// backend/T9 contract exactly.
export const T9_MAP = Object.freeze({
  2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ',
});

const T9_LOOKUP = (() => {
  const t = {};
  Object.keys(T9_MAP).forEach((d) => { for (const ch of T9_MAP[d]) t[ch] = d; });
  return t;
})();

// Only spaces and hyphens are ignored; everything else must be a letter or a digit.
const PIN_SEPARATOR = /[\s-]/;
const ASCII_LETTER = /^[A-Za-z]$/;

// Convert a pure ASCII word to digits. { ok, pin, code } — code ∈ 'ok'|'unsupported'|'empty'.
export function wordToPin(word) {
  const raw = word == null ? '' : String(word);
  let out = '';
  for (const ch of raw) {
    if (PIN_SEPARATOR.test(ch)) continue;
    if (!ASCII_LETTER.test(ch)) return { ok: false, code: 'unsupported', pin: '' };
    out += T9_LOOKUP[ch.toUpperCase()];
  }
  if (out.length === 0) return { ok: false, code: 'empty', pin: '' };
  return { ok: true, code: 'ok', pin: out };
}

// THE unified resolver used by the admin-PIN form. Returns
// { ok, pin, mode, code } with mode ∈ 'word'|'numeric'|null and
// code ∈ 'ok'|'empty'|'mixed'|'unsupported'|'length_word'|'length_numeric'.
// `pin` is populated even when the length is still invalid, so the live preview can update
// on every keystroke; it is empty for mixed/unsupported input.
export function resolvePinInput(text) {
  const raw = text == null ? '' : String(text);
  let letters = 0, digits = 0, out = '';
  for (const ch of raw) {
    if (PIN_SEPARATOR.test(ch)) continue;
    if (ch >= '0' && ch <= '9') { digits++; out += ch; continue; }
    if (ASCII_LETTER.test(ch)) { letters++; out += T9_LOOKUP[ch.toUpperCase()]; continue; }
    return { ok: false, pin: '', mode: null, code: 'unsupported' };  // accents included
  }
  if (letters > 0 && digits > 0) return { ok: false, pin: '', mode: null, code: 'mixed' };
  if (out.length === 0) return { ok: false, pin: '', mode: null, code: 'empty' };
  const mode = letters > 0 ? 'word' : 'numeric';
  if (out.length < ADMIN_PIN_MIN || out.length > ADMIN_PIN_MAX) {
    return { ok: false, pin: out, mode, code: mode === 'word' ? 'length_word' : 'length_numeric' };
  }
  return { ok: true, pin: out, mode, code: 'ok' };
}

export const PIN_MIXED_MESSAGE = 'Introduce solo letras o solo números, sin mezclarlos.';
export const PIN_NUMERIC_LENGTH_MESSAGE =
  `El PIN debe tener entre ${ADMIN_PIN_MIN} y ${ADMIN_PIN_MAX} dígitos.`;
export const PIN_WORD_LENGTH_MESSAGE =
  `La palabra debe generar un PIN de entre ${ADMIN_PIN_MIN} y ${ADMIN_PIN_MAX} dígitos.`;
export const PIN_UNSUPPORTED_CHAR_MESSAGE = 'Este carácter no es compatible.';
export const PIN_MISMATCH_MESSAGE = 'Los PIN no coinciden.';
export const PIN_MATCH_LABEL = 'Los PIN coinciden';
export const PIN_MISMATCH_LABEL = 'Los PIN no coinciden';

export function pinInputMessage(code) {
  if (code === 'mixed') return PIN_MIXED_MESSAGE;
  if (code === 'unsupported') return PIN_UNSUPPORTED_CHAR_MESSAGE;
  if (code === 'length_word') return PIN_WORD_LENGTH_MESSAGE;
  return PIN_NUMERIC_LENGTH_MESSAGE;   // length_numeric + empty
}

// Spanish help shown behind the information control next to the field label.
export const PIN_HELP_TEXT =
  'Puedes escribir directamente un PIN numérico o utilizar una palabra fácil de recordar. ' +
  'Las letras se convierten en números como en un teclado telefónico: ABC = 2, DEF = 3, ' +
  'GHI = 4, JKL = 5, MNO = 6, PQRS = 7, TUV = 8 y WXYZ = 9. El acceso operativo siempre se ' +
  'realiza con el PIN numérico generado.';
