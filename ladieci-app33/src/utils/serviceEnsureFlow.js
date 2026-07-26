// ===============================================================
// serviceEnsureFlow.js — S2-7D6C
//
// The silent-ensure attempt as a pure, injectable routine — same philosophy as
// openServiceFlow.js and order/submissionLifecycle.js: no React, no fetch, no
// env, so the two rules that actually matter are provable without a browser:
//   1. a rider (or any role that may not open the service) NEVER issues the
//      request at all — the gate is checked here, not only in a component;
//   2. however many callers ask "is a session ensured yet?" at once —
//      StrictMode's double effect invoke, a remount, several mounted
//      consumers, a fast double click of "Reintentar" — AT MOST ONE
//      ensureCurrentServiceSession request is in flight at any moment.
// ===============================================================

import { canOpenService, isRider } from './adminRbac';
import { ENSURE_OUTCOME, classifyEnsureAttempt } from './serviceEnsureOutcome';

// createSharedEnsure wraps a raw `() => Promise<rawResponse>` caller (normally
// `api.ensureCurrentServiceSession`) so every concurrent invocation shares the
// SAME in-flight promise. Cleared as soon as that request settles — a LATER,
// distinct call (a fresh page entry, an explicit retry after the first one
// finished) still issues a new request; this dedupes concurrency, not time.
export function createSharedEnsure(ensureFn) {
  let inFlight = null;
  return function sharedEnsure() {
    if (!inFlight) {
      inFlight = ensureFn().finally(() => { inFlight = null; });
    }
    return inFlight;
  };
}

// attemptSilentEnsure({ role, sharedEnsure }) → { outcome }
// The role gate is evaluated BEFORE sharedEnsure is ever touched — a denied
// role produces a typed DENIED outcome and issues no request whatsoever.
export async function attemptSilentEnsure({ role, sharedEnsure }) {
  if (!canOpenService(role)) {
    const message = isRider(role)
      ? 'El reparto no abre el servicio. Avisa a un operador.'
      : 'No tienes permiso para acceder al servicio.';
    return {
      outcome: Object.freeze({
        kind: ENSURE_OUTCOME.DENIED, title: 'Acceso no autorizado', message,
        code: null, session: null, scheduleState: null, businessDate: null,
      }),
    };
  }
  const raw = await sharedEnsure();
  return { outcome: classifyEnsureAttempt(raw) };
}
