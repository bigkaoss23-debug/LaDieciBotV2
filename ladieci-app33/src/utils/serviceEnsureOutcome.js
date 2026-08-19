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
  STALE_SERVICE_SESSION: 'STALE_SERVICE_SESSION', // an open session belongs to an earlier businessDate
  // F-7 (migration row 92) — the two read-only answers ensure_service_session
  // gives once it became READ/REUSE ONLY and can no longer create anything.
  // They are NOT symmetric to an operator (see the POST F-10 UX correction
  // below, classifyEnsureAttempt's NO_OPEN_SERVICE intercept):
  //   REOPEN_REQUIRED — the business day this response names already had a
  //     service, and it stays a genuine typed exception (see below).
  //   NO_OPEN_SERVICE — nothing is open. Kept as its own code (never merged
  //     into REOPEN_REQUIRED) purely so a caller CAN still special-case a
  //     truly virgin day if it ever needs to; classifyEnsureAttempt below no
  //     longer treats it as an exception at all.
  REOPEN_REQUIRED: 'REOPEN_REQUIRED',   // this Business Day already had a service, none is active now
  NO_OPEN_SERVICE: 'NO_OPEN_SERVICE',   // this Business Day has never had a service
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
  ENSURE_OUTCOME.STALE_SERVICE_SESSION,
  ENSURE_OUTCOME.REOPEN_REQUIRED,
  // NO_OPEN_SERVICE is deliberately NOT in this set — see classifyEnsureAttempt's
  // early intercept below. It never reaches this generic fallback.
]);

export const EXCEPTION_TITLE = Object.freeze({
  [ENSURE_OUTCOME.BETWEEN_SERVICES]: 'El próximo servicio todavía no está disponible',
  [ENSURE_OUTCOME.AFTER_ORDER_CUTOFF]: 'No hay un servicio disponible ahora mismo',
  [ENSURE_OUTCOME.OUTSIDE_WINDOWS]: 'No hay un servicio disponible ahora mismo',
  [ENSURE_OUTCOME.SERVICE_ALREADY_COMPLETED_TODAY]: 'El servicio de hoy ya se ha completado',
  // S2-7D6E — reached only in the residual sub-case where the still-open other-kind
  // session is itself mid-close (status 'closing'); a genuinely open one now resolves
  // to normal operational access (see classifyEnsureAttempt) and never shows this at
  // all. Copy matches SERVICE_SESSION_CLOSING on purpose: from here it is the same
  // situation. Never names PRANZO/SERA/service_kind to the operator.
  [ENSURE_OUTCOME.LUNCH_SESSION_STILL_ACTIVE]: 'El servicio anterior se está cerrando',
  [ENSURE_OUTCOME.OTHER_SERVICE_STILL_ACTIVE]: 'El servicio anterior se está cerrando',
  [ENSURE_OUTCOME.SERVICE_SESSION_CLOSING]: 'El servicio se está cerrando',
  [ENSURE_OUTCOME.INVALID_ACTOR]: 'Usuario no verificado',
  [ENSURE_OUTCOME.STALE_SERVICE_SESSION]: 'Servicio anterior pendiente',
  [ENSURE_OUTCOME.REOPEN_REQUIRED]: 'No hay ningún servicio abierto',
  // No NO_OPEN_SERVICE entry — classifyEnsureAttempt intercepts that code
  // before it ever reaches EXCEPTION_TITLE (see the intercept below).
  [ENSURE_OUTCOME.DENIED]: 'Acceso no autorizado',
  [ENSURE_OUTCOME.NETWORK]: 'Sin conexión con el servidor',
  [ENSURE_OUTCOME.UNKNOWN]: 'Estado del servicio no disponible',
});

export const EXCEPTION_MESSAGE = Object.freeze({
  [ENSURE_OUTCOME.BETWEEN_SERVICES]: 'El almuerzo ha terminado y la cena todavía no abre. Vuelve a intentarlo en unos minutos.',
  [ENSURE_OUTCOME.AFTER_ORDER_CUTOFF]: 'Fuera del horario de servicio. Vuelve a intentarlo cuando abra el próximo servicio.',
  [ENSURE_OUTCOME.OUTSIDE_WINDOWS]: 'Fuera del horario de servicio. Vuelve a intentarlo cuando abra el próximo servicio.',
  [ENSURE_OUTCOME.SERVICE_ALREADY_COMPLETED_TODAY]: 'Ya no se puede volver a abrir. Vuelve mañana.',
  [ENSURE_OUTCOME.LUNCH_SESSION_STILL_ACTIVE]: 'Espera unos segundos a que termine el cierre e inténtalo de nuevo.',
  [ENSURE_OUTCOME.OTHER_SERVICE_STILL_ACTIVE]: 'Espera unos segundos a que termine el cierre e inténtalo de nuevo.',
  [ENSURE_OUTCOME.SERVICE_SESSION_CLOSING]: 'Espera a que termine el cierre en curso e inténtalo de nuevo.',
  [ENSURE_OUTCOME.INVALID_ACTOR]: 'Tu usuario no se pudo verificar para abrir el servicio. Contacta con el administrador.',
  [ENSURE_OUTCOME.STALE_SERVICE_SESSION]: 'El servicio activo pertenece a otra fecha operativa. Ciérralo antes de recibir nuevos pedidos.',
  [ENSURE_OUTCOME.REOPEN_REQUIRED]: 'El servicio anterior ya se cerró. Vuelve a abrirlo desde el cierre del servicio para recibir pedidos.',
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
    || kind === ENSURE_OUTCOME.STALE_SERVICE_SESSION
    || kind === ENSURE_OUTCOME.REOPEN_REQUIRED
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
      // SERVICE CLOSEOUT V2 / SLICE 4B — optional, read-only, non-blocking
      // carryover advisory. Absent whenever the backend's own read-model
      // lookup failed (it degrades by omitting the field, never a 5xx) or
      // there is nothing to report; never invented here, never re-fetched
      // separately.
      previousCloseoutIncidents: res.previousCloseoutIncidents || null,
    });
  }

  // A role/auth refusal never reached (or never should have reached) the
  // backend's schedule/session decision at all.
  if (res._status === 401 || res._status === 403) return domainOutcome(ENSURE_OUTCOME.DENIED, res);

  // draftBlocked (no-persist draft build) and a genuine transport failure are
  // both "never reached an authoritative answer" — same treatment, same retry.
  if (res.draftBlocked === true || res._status === 0) return domainOutcome(ENSURE_OUTCOME.NETWORK, res);

  const code = res.code;

  // POST F-10 UX CORRECTION — 2026-08-19 staging incident. NO_OPEN_SERVICE is
  // a routine lifecycle state (no session anywhere, and the current Business
  // Day pointer has never had one), never an incident: "nobody has ordered
  // yet" is true at open-of-day EVERY day. Before this, it fell through to
  // SCHEDULE_OR_SESSION_CODES and rendered a full blocking exception panel —
  // "No hay ningún servicio abierto", with a "Ver cierre del servicio" link —
  // over what is, from the operator's chair, simply an empty app ready for
  // its first order. The real authority that decides whether a brand-new
  // order may lazily open a service is resolve_order_intake_context_v1 (F-7),
  // invoked fresh, from the real clock, inside the order-creation flow's own
  // INSERT trigger — completely independent of this classification. Nothing here
  // creates a session or bypasses that authority; this only stops rendering
  // an operator-facing incident over a state that was never one.
  //
  // REOPEN_REQUIRED is deliberately NOT given the same treatment. It is
  // structurally ambiguous with the current read-only contract: ensure_
  // service_session never recomputes "today" from the clock the way the
  // order-intake resolver does — it only trusts whatever business day the
  // stored canonical pointer currently names, and that pointer advances
  // ONLY on a real order or an explicit open (see resolve_order_intake_
  // context_v1 / open_business_day_v1), never on a schedule. So a pointer
  // that is genuinely stale (nobody has ordered since a PAST business day
  // that pointer still names) makes REOPEN_REQUIRED indistinguishable, from
  // here, from a true same-day "this was already explicitly finalized
  // today" state — exactly what happened live on 2026-08-19: the pointer
  // still named 2026-08-16 sessions closed two days before this classifier
  // ran, and the response read businessDate:"2026-08-16", not today.
  // Silently absorbing REOPEN_REQUIRED into ALLOWED would risk bypassing a
  // genuine intentional-reopen requirement on a real same-day close, so it
  // stays a typed, blocking exception (unchanged) until the backend can
  // state whether the named businessDate IS today's canonical one — a
  // structured discriminator this response does not carry today. Never
  // computed here in the frontend: that would be exactly the invented
  // date logic this module's own header forbids.
  if (code === ENSURE_OUTCOME.NO_OPEN_SERVICE) {
    return Object.freeze({
      kind: ENSURE_OUTCOME.ALLOWED,
      created: false,
      code,
      session: null,
      previousCloseoutIncidents: null,
    });
  }

  // S2-7D6E — a still-open OTHER-kind session is not a dead end. The backend
  // refused to open a NEW session over it (protecting the ledger split
  // between the two services), but it handed back the session that IS open.
  // The operator belongs in the normal operational surface for THAT session
  // — reachable, Entregas included — never routed straight to a report page
  // with no way back. Brand-new intake for the wrong kind stays
  // independently blocked server-side by orderIntakePolicy's
  // SERVICE_KIND_MISMATCH, so this cannot let a dinner order land in a
  // lingering lunch session. Only when the backend could not hand back an
  // actually-open session (e.g. it is itself mid-close) does this remain an
  // exception — see domainOutcome below.
  if ((code === ENSURE_OUTCOME.LUNCH_SESSION_STILL_ACTIVE || code === ENSURE_OUTCOME.OTHER_SERVICE_STILL_ACTIVE)
      && res.session && res.session.status === 'open') {
    return Object.freeze({
      kind: ENSURE_OUTCOME.ALLOWED,
      created: false,
      code,
      session: res.session,
      // The backend only ever attaches this on a success:true body; kept
      // here defensively for the same shape as the primary ALLOWED branch.
      previousCloseoutIncidents: res.previousCloseoutIncidents || null,
    });
  }

  // P0-C1 — AVAILABILITY CONTAINMENT. A session mid-close is transitional
  // lifecycle metadata, never an app-wide outage on its own (see
  // SERVICE_LIFECYCLE_ECONOMIC_BOUNDARY_AUDIT_REPORT.md §4/§7.6): before this,
  // SERVICE_SESSION_CLOSING always fell through to the blocking exception
  // panel below, which — because ServiceStateGate wraps the entire Servicio
  // shell — took Mesa/Cocina/Listos/Teléfono/Banco/Entregas all offline for
  // as long as the close attempt stayed stuck, not just the closing session's
  // own board. The backend always attaches a real session (with a real id) to
  // THIS specific code (ensureServiceSession.js's pre-check reads it before
  // ever reaching a window decision) — same "hand back what's real and
  // operable" precedent as the LUNCH/OTHER branch just above, extended to a
  // session that is itself the one closing. `session.status` is preserved
  // exactly as `'closing'`, never rewritten to `'open'` — this is a truthful
  // ALLOWED, not a fake one; ensuredStatusLabel below renders it accordingly.
  // A missing session (should not happen for this code, but defensive) still
  // falls through to the blocking exception below — a true integrity gap is
  // never hidden behind a fake success.
  if (code === ENSURE_OUTCOME.SERVICE_SESSION_CLOSING && res.session && res.session.id) {
    return Object.freeze({
      kind: ENSURE_OUTCOME.ALLOWED,
      created: false,
      code,
      session: res.session,
      previousCloseoutIncidents: res.previousCloseoutIncidents || null,
    });
  }

  if (code && SCHEDULE_OR_SESSION_CODES.has(code)) return domainOutcome(code, res);

  return domainOutcome(ENSURE_OUTCOME.UNKNOWN, res);
}

// S-E — the Operational Service identity (S-D) can now legitimately span
// both PRANZO and SERA within a single session, so its own lifecycle label
// must not assert either one (a session opened at lunch may still be the
// same open service at dinner). KIND_LABEL / the PRANZO|SERA branch is
// removed entirely, not merely defaulted-around: the ongoing service is
// always presented neutrally now, unconditionally — PRANZO/SERA still
// appear, correctly, inside economic/report breakdowns (see
// closeoutServiceKind.js), just never as the service's own identity label.
//
// "Servicio · Abierto · 2026-07-26 · 12:05" — the business date still comes
// ONLY from the backend session, never from the browser clock.
export function ensuredStatusLabel(session) {
  if (!session) return '';
  const label = 'Servicio';
  // P0-C1 — a session handed back while status:'closing' (see the
  // SERVICE_SESSION_CLOSING branch in classifyEnsureAttempt above) must never
  // claim "Abierto": that would misrepresent real lifecycle state on the one
  // pill that summarizes it. Any other/legacy status (including missing,
  // pre-V2-lifecycle sessions) keeps the original "Abierto" wording unchanged.
  const parts = [session.status === 'closing' ? `${label} · Cerrando` : `${label} · Abierto`];
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
