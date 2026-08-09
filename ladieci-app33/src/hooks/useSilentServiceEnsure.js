// ===============================================================
// useSilentServiceEnsure.js — S2-7D6C
//
// Thin React wrapper around serviceEnsureFlow.js. All the behaviour that
// actually matters (the role gate, the shared in-flight request) lives in that
// pure module and is unit-tested there without a renderer — this hook only
// owns React state and the mount effect.
//
// Phases: idle (pre-mount) → ensuring (first silent attempt) → ready (an
// authorized session was returned — render the operational shell, no success
// UI) → exception (typed non-success — render the mapped copy) → retrying
// (an explicit "Reintentar" click; same phase family as ensuring, distinct
// label only so a retry visibly reads as a retry).
//
// recheckSilently() is deliberately NOT "retrying": it exists for the
// 'ld-service-session-lost' recovery (a mid-shift write refused because the
// session closed under the operator) and never flips the visible phase away
// from READY while the check is in flight — exactly like the read-only
// refresh() this replaces, it only disturbs the UI if the answer actually
// changed. Flashing the full loading/exception surface over an operator's
// in-progress order would be a regression this hook must not introduce.
// ===============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { attemptSilentEnsure, createSharedEnsure } from '../utils/serviceEnsureFlow';
import { ENSURE_OUTCOME } from '../utils/serviceEnsureOutcome';

export const ENSURE_PHASE = Object.freeze({
  IDLE: 'idle',
  ENSURING: 'ensuring',
  READY: 'ready',
  EXCEPTION: 'exception',
  RETRYING: 'retrying',
});

// ONE shared in-flight request for the whole module lifetime (i.e. the whole
// page load) — every mount of this hook, however many, funnels through the
// same dedup boundary in serviceEnsureFlow.js.
const sharedEnsure = createSharedEnsure(() => api.ensureCurrentServiceSession());

export function useSilentServiceEnsure({ role } = {}) {
  const [phase, setPhase] = useState(ENSURE_PHASE.IDLE);
  const [session, setSession] = useState(null);
  const [exception, setException] = useState(null);
  // SERVICE CLOSEOUT V2 / SLICE 4B — optional, read-only, non-blocking
  // carryover advisory riding the SAME ensure response; never a second
  // request. null whenever absent (backend read-model degrade, or nothing
  // to report) — never an error state on its own.
  const [previousCloseoutIncidents, setPreviousCloseoutIncidents] = useState(null);
  const liveRef = useRef(true);

  const settle = useCallback((outcome) => {
    if (!liveRef.current) return;
    if (outcome.kind === ENSURE_OUTCOME.ALLOWED) {
      setSession(outcome.session);
      setPreviousCloseoutIncidents(outcome.previousCloseoutIncidents || null);
      setException(null);
      setPhase(ENSURE_PHASE.READY);
      return;
    }
    setPreviousCloseoutIncidents(null);
    setException(outcome);
    setPhase(ENSURE_PHASE.EXCEPTION);
  }, []);

  const run = useCallback(async (visiblePhase) => {
    if (visiblePhase) { setPhase(visiblePhase); setException(null); }
    const { outcome } = await attemptSilentEnsure({ role, sharedEnsure });
    settle(outcome);
  }, [role, settle]);

  useEffect(() => {
    liveRef.current = true;
    run(ENSURE_PHASE.ENSURING);
    return () => { liveRef.current = false; };
  }, [run]);

  const retry = useCallback(() => { run(ENSURE_PHASE.RETRYING); }, [run]);
  const recheckSilently = useCallback(() => { run(null); }, [run]);

  return { phase, session, exception, previousCloseoutIncidents, retry, recheckSilently };
}
