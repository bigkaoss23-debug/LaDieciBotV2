// ===============================================================
// openServiceFlow.js — S2-7D5
//
// The open-service attempt as a pure, injectable routine.
//
// Same philosophy as order/submissionLifecycle.js: no React, no fetch, no env,
// so the rules that actually matter — one request per double click, and "only a
// verified read may declare the service open" — are provable without a browser.
//
// The lock is acquired SYNCHRONOUSLY before the first await. React state cannot
// stop the second click of a double click; a plain boolean can.
// ===============================================================

import { OPEN_OUTCOME, OPEN_UNVERIFIED_MESSAGE, classifyOpenAttempt } from './openServiceOutcome';
import { SERVICE_PHASE, classifyServiceState } from './serviceSessionState';

export const ATTEMPT = Object.freeze({
  IGNORED: 'ignored',   // a previous attempt is still in flight — nothing was sent
  OPENED: 'opened',     // verified: a fresh read reports status 'open'
  FAILURE: 'failure',   // anything else, always with an operator-facing message
});

export function createAttemptLock() {
  let busy = false;
  return {
    acquire() { if (busy) return false; busy = true; return true; },
    release() { busy = false; },
    get busy() { return busy; },
  };
}

// openService : async () => raw response of api.openServiceSession()
// readState   : async () => raw response of api.getCurrentServiceCloseout()
export async function runOpenServiceAttempt({ lock, openService, readState }) {
  if (!lock.acquire()) return { kind: ATTEMPT.IGNORED };
  try {
    const outcome = classifyOpenAttempt(await openService());
    if (outcome.kind !== OPEN_OUTCOME.VERIFY) {
      return { kind: ATTEMPT.FAILURE, reason: outcome.kind, message: outcome.message };
    }
    // Never conclude success from the open response: the only trustworthy
    // confirmation is the state read the closeout contract owns.
    const state = classifyServiceState(await readState());
    if (state.phase === SERVICE_PHASE.OPEN) return { kind: ATTEMPT.OPENED, state };
    return { kind: ATTEMPT.FAILURE, reason: 'unverified', message: OPEN_UNVERIFIED_MESSAGE, state };
  } catch (_) {
    return {
      kind: ATTEMPT.FAILURE,
      reason: 'network',
      message: 'Error de red al abrir el servicio. No se abrió nada.',
    };
  } finally {
    lock.release();
  }
}
