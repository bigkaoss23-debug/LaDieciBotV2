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

// ── Admin PIN input — NUMERIC ONLY ──────────────────────────────────────────
// Deliberately numeric-only. An earlier draft let the owner type a memorable word that was
// converted with the telephone keypad mapping (T9); it was removed because it WEAKENS the
// credential: a 9-digit PIN derived from a dictionary word has ~10^5 realistic candidates
// instead of 10^9, i.e. weaker than a random 6-digit PIN, while looking stronger. No serious
// POS or banking app derives PINs from words. Memorability is solved instead by a secure
// random generator plus grouped display, so the owner can note the number down.
//
// Spaces and hyphens are accepted as harmless separators (people group digits naturally);
// anything else is rejected.
const PIN_SEPARATOR = /[\s-]/;

// { ok, pin, code } — code ∈ 'ok' | 'empty' | 'unsupported' | 'length'.
// `pin` is populated even when the length is still invalid so the live preview can update
// on every keystroke; it is empty when a non-digit character is present.
export function resolvePinInput(text) {
  const raw = text == null ? '' : String(text);
  let out = '';
  for (const ch of raw) {
    if (PIN_SEPARATOR.test(ch)) continue;
    if (ch < '0' || ch > '9') return { ok: false, pin: '', code: 'unsupported' };
    out += ch;
  }
  if (out.length === 0) return { ok: false, pin: '', code: 'empty' };
  if (out.length < ADMIN_PIN_MIN || out.length > ADMIN_PIN_MAX) {
    return { ok: false, pin: out, code: 'length' };
  }
  return { ok: true, pin: out, code: 'ok' };
}

export const PIN_NUMERIC_ONLY_MESSAGE = 'Introduce solo números.';
export const PIN_LENGTH_MESSAGE =
  `El PIN debe tener entre ${ADMIN_PIN_MIN} y ${ADMIN_PIN_MAX} dígitos.`;
export const PIN_MISMATCH_MESSAGE = 'Los PIN no coinciden.';
export const PIN_MATCH_LABEL = 'Los PIN coinciden';
export const PIN_MISMATCH_LABEL = 'Los PIN no coinciden';

export function pinInputMessage(code) {
  if (code === 'unsupported') return PIN_NUMERIC_ONLY_MESSAGE;
  return PIN_LENGTH_MESSAGE;   // length + empty
}

// Display helper: group digits in threes so a long PIN can be read and copied reliably
// (123 456 789). Never changes the value that is submitted.
export function formatPinGroups(pin) {
  const s = String(pin == null ? '' : pin);
  return s.replace(/(\d{3})(?=\d)/g, '$1 ');
}

// Cryptographically secure random PIN that already satisfies the admin policy (no
// all-same / sequential / repeated-block result). Generated LOCALLY and shown to the owner
// so it can be written down or stored in a password manager; never derived from a word.
export function generateSecurePin(length = ADMIN_PIN_MIN) {
  const n = Math.min(Math.max(Number(length) || ADMIN_PIN_MIN, ADMIN_PIN_MIN), ADMIN_PIN_MAX);
  const randomDigits = () => {
    const out = new Array(n);
    const g = (typeof globalThis !== 'undefined' && globalThis.crypto
      && typeof globalThis.crypto.getRandomValues === 'function') ? globalThis.crypto : null;
    if (g) {
      const buf = new Uint32Array(n);
      g.getRandomValues(buf);
      for (let i = 0; i < n; i++) out[i] = String(buf[i] % 10);
    } else {
      // Non-browser fallback (tests/SSR only); the browser path always uses WebCrypto.
      for (let i = 0; i < n; i++) out[i] = String(Math.floor(Math.random() * 10));
    }
    return out.join('');
  };
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = randomDigits();
    if (validateAdminPin(candidate).ok) return candidate;
  }
  return randomDigits(); // practically unreachable; policy re-checked by the caller/backend
}

// Spanish help shown behind the information control next to the field label.
export const PIN_HELP_TEXT =
  'El PIN es numérico y sirve para el acceso operativo diario. Es distinto de la contraseña ' +
  'de tu cuenta: no se envía por correo y no se puede recuperar en texto. Si no quieres ' +
  'memorizarlo, pulsa «Generar PIN seguro» y guárdalo en tu gestor de contraseñas o anótalo ' +
  'en un lugar seguro. Tu cuenta de propietario verificada puede cambiarlo cuando quieras.';

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
