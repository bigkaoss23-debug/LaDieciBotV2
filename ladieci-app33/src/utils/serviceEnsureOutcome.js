// ===============================================================
// serviceEnsureOutcome.js — S2-7D6C
//
// Classify the ensureCurrentServiceSession response.
//
// Unlike the OLD openServiceSession contract (openServiceOutcome.js), this
// response is self-verifying: ensureCurrentServiceSession is idempotent and its
// own `{success:true, session:{...}}` body IS the trustworthy confirmation — no
// second "read the state back" round trip is needed. success:true is rendered
// identically whether `created` is true or false: reused a lunch session and
// created a fresh dinner one are the SAME "you may proceed" answer.
//
// Every non-success case is a typed, backend-decided reason, never a locally
// invented one. The schedule/session codes documented in the backend contract
// are listed explicitly; anything else is UNKNOWN, and a transport/auth
// failure is its own category — never conflated with a domain decision.
// ===============================================================

import { canOpenService, isRider } from './adminRbac';

export const ENSURE_OUTCOME = Object.freeze({
  ALLOWED: 'ALLOWED',
  BETWEEN_SERVICES: 'BETWEEN_SERVICES',
  AFTER_ORDER_CUTOFF: 'AFTER_ORDER_CUTOFF',
  OUTSIDE_WINDOWS: 'OUTSIDE_WINDOWS',
  SERVICE_ALREADY_COMPLETED_TODAY: 'SERVICE_ALREADY_COMPLETED_TODAY',
  LUNCH_SESSION_STILL_ACTIVE: 'LUNCH_SESSION_STILL_ACTIVE',
  OTHER_SERVICE_STILL_ACTIVE: 'OTHER_SERVICE_STILL_ACTIVE',
  SERVICE_SESSION_CLOSING: 'SERVICE_SESSION_CLOSING',
  INVALID_ACTOR: 'INVALID_ACTOR',
  DENIED: 'DENIED',     // role gate / 401 / 403 — never reaches the backend decision at all
  NETWORK: 'NETWORK',   // transport failure, or a no-persist draft build
  UNKNOWN: 'UNKNOWN',   // a recognized transport success with an unrecognized code
});

// The backend-decided (never frontend-guessed) typed non-success codes.
const SCHEDULE_OR_SESSION_CODES = new Set([
  ENSURE_OUTCOME.BETWEEN_SERVICES,
  ENSURE_OUTCOME.AFTER_ORDER_CUTOFF,
  ENSURE_OUTCOME.OUTSIDE_WINDOWS,
  ENSURE_OUTCOME.SERVICE_ALREADY_COMPLETED_TODAY,
  ENSURE_OUTCOME.LUNCH_SESSION_STILL_ACTIVE,
  ENSURE_OUTCOME.OTHER_SERVICE_STILL_ACTIVE,
  ENSURE_OUTCOME.SERVICE_SESSION_CLOSING,
  ENSURE_OUTCOME.INVALID_ACTOR,
]);

export const EXCEPTION_TITLE = Object.freeze({
  [ENSURE_OUTCOME.BETWEEN_SERVICES]: 'El próximo servicio todavía no está disponible',
  [ENSURE_OUTCOME.AFTER_ORDER_CUTOFF]: 'No hay un servicio disponible ahora mismo',
  [ENSURE_OUTCOME.OUTSIDE_WINDOWS]: 'No hay un servicio disponible ahora mismo',
  [ENSURE_OUTCOME.SERVICE_ALREADY_COMPLETED_TODAY]: 'El servicio de hoy ya se ha completado',
  [ENSURE_OUTCOME.LUNCH_SESSION_STILL_ACTIVE]: 'El almuerzo (PRANZO) sigue abierto',
  [ENSURE_OUTCOME.OTHER_SERVICE_STILL_ACTIVE]: 'Hay un conflicto de servicio activo',
  [ENSURE_OUTCOME.SERVICE_SESSION_CLOSING]: 'El servicio se está cerrando',
  [ENSURE_OUTCOME.INVALID_ACTOR]: 'Usuario no verificado',
  [ENSURE_OUTCOME.DENIED]: 'Acceso no autorizado',
  [ENSURE_OUTCOME.NETWORK]: 'Sin conexión con el servidor',
  [ENSURE_OUTCOME.UNKNOWN]: 'Estado del servicio no disponible',
});

export const EXCEPTION_MESSAGE = Object.freeze({
  [ENSURE_OUTCOME.BETWEEN_SERVICES]: 'El almuerzo ha terminado y la cena todavía no abre. Vuelve a intentarlo en unos minutos.',
  [ENSURE_OUTCOME.AFTER_ORDER_CUTOFF]: 'Fuera del horario de servicio. Vuelve a intentarlo cuando abra el próximo servicio.',
  [ENSURE_OUTCOME.OUTSIDE_WINDOWS]: 'Fuera del horario de servicio. Vuelve a intentarlo cuando abra el próximo servicio.',
  [ENSURE_OUTCOME.SERVICE_ALREADY_COMPLETED_TODAY]: 'Ya no se puede volver a abrir. Vuelve mañana.',
  [ENSURE_OUTCOME.LUNCH_SESSION_STILL_ACTIVE]: 'Antes de abrir la cena hay que cerrar el servicio de almuerzo.',
  [ENSURE_OUTCOME.OTHER_SERVICE_STILL_ACTIVE]: 'Otro servicio está activo y no puede abrirse encima. Revisa el cierre del servicio.',
  [ENSURE_OUTCOME.SERVICE_SESSION_CLOSING]: 'Espera a que termine el cierre en curso e inténtalo de nuevo.',
  [ENSURE_OUTCOME.INVALID_ACTOR]: 'Tu usuario no se pudo verificar para abrir el servicio. Contacta con el administrador.',
  [ENSURE_OUTCOME.DENIED]: 'No tienes permiso para acceder al servicio.',
  [ENSURE_OUTCOME.NETWORK]: 'No se pudo contactar con el servidor. Comprueba la conexión e inténtalo de nuevo.',
  [ENSURE_OUTCOME.UNKNOWN]: 'No se pudo comprobar el estado del servicio. Inténtalo de nuevo.',
});

// Retrying a DENIED/INVALID_ACTOR result cannot succeed with the same identity
// — there is nothing to wait out. Every other exception is legitimately
// retryable (a clock window passes, a conflicting session closes, a network
// blip clears).
export function exceptionAllowsRetry(kind) {
  return kind !== ENSURE_OUTCOME.DENIED && kind !== ENSURE_OUTCOME.INVALID_ACTOR;
}

// Only offer "go check the closeout" where a human action there could actually
// resolve the conflict — never for a pure clock-window wait, where visiting
// the closeout changes nothing.
export function exceptionShowsCloseoutLink(kind) {
  return kind === ENSURE_OUTCOME.LUNCH_SESSION_STILL_ACTIVE
    || kind === ENSURE_OUTCOME.OTHER_SERVICE_STILL_ACTIVE
    || kind === ENSURE_OUTCOME.NETWORK
    || kind === ENSURE_OUTCOME.UNKNOWN;
}

function domainOutcome(kind, res) {
  return Object.freeze({
    kind,
    title: EXCEPTION_TITLE[kind],
    message: EXCEPTION_MESSAGE[kind],
    code: (res && res.code) || kind,
    session: (res && res.session) || null,
    scheduleState: (res && res.scheduleState) || null,
    businessDate: (res && res.businessDate) || null,
  });
}

export function classifyEnsureAttempt(res) {
  if (!res || typeof res !== 'object') return domainOutcome(ENSURE_OUTCOME.UNKNOWN, null);

  if (res.success === true) {
    return Object.freeze({
      kind: ENSURE_OUTCOME.ALLOWED,
      created: res.created === true,
      code: res.code || null,
      session: res.session || null,
    });
  }

  // A role/auth refusal never reached (or never should have reached) the
  // backend's schedule/session decision at all.
  if (res._status === 401 || res._status === 403) return domainOutcome(ENSURE_OUTCOME.DENIED, res);

  // draftBlocked (no-persist draft build) and a genuine transport failure are
  // both "never reached an authoritative answer" — same treatment, same retry.
  if (res.draftBlocked === true || res._status === 0) return domainOutcome(ENSURE_OUTCOME.NETWORK, res);

  const code = res.code;
  if (code && SCHEDULE_OR_SESSION_CODES.has(code)) return domainOutcome(code, res);

  return domainOutcome(ENSURE_OUTCOME.UNKNOWN, res);
}

// "PRANZO · Abierto · 2026-07-26 · 12:05" / "SERA · Abierto · 2026-07-26 · 20:03"
// — the kind and business date come ONLY from the backend session, never from
// the browser clock.
export function ensuredStatusLabel(session) {
  if (!session) return '';
  const parts = [session.serviceKind ? `${session.serviceKind} · Abierto` : 'Servicio abierto'];
  if (session.businessDate) parts.push(String(session.businessDate));
  if (session.openedAt) {
    const d = new Date(session.openedAt);
    if (!Number.isNaN(d.getTime())) {
      const two = (n) => String(n).padStart(2, '0');
      parts.push(`${two(d.getHours())}:${two(d.getMinutes())}`);
    }
  }
  return parts.join(' · ');
}

// Re-exported for callers that only need the role rule this module already
// depends on (keeps a single import for ServiceExceptionPanel/ServiceStateGate).
export { canOpenService, isRider };
