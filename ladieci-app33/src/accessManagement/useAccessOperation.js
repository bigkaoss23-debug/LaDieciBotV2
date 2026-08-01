// ─── Access Management V3 — ONE reusable write-operation controller (V3-I) ───
// Every panel (create/rename/role/PIN-set/PIN-clear/deactivate/reactivate) drives
// its network call through this same hook — no per-row state machine, no
// duplicated step-up/idempotency/double-submit logic scattered across forms.
//
// Phases: 'idle' | 'awaitingStepUp' | 'submitting' | 'success' | 'error'.
// (Editing/awaiting-confirmation are owned by the calling panel's own form state,
// since those steps are pure UI and never touch the network — this hook only
// exists once a write is actually about to happen.)
import { useCallback, useRef, useState } from 'react';
import { getPinStepUp, clearPinStepUp } from '../operationalSession';
import { generateClientRequestId } from './clientRequestId';
import { describeAccessWriteError } from './accessManagementErrors';

export function useAccessOperation() {
  const [phase, setPhase] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const busyRef = useRef(false);
  const clientRequestIdRef = useRef(null);
  const pendingCallRef = useRef(null);

  // `call(stepUpProof, clientRequestId) => Promise<discriminated result>`. The
  // SAME clientRequestId is reused across retries of this one attempt (safe —
  // the backend replays an identical-payload retry and only 409s on a genuinely
  // different payload); it is only dropped on cancel() or after success, so a
  // fresh "Añadir acceso"/edit session always starts a clean id.
  const run = useCallback(async (call) => {
    if (busyRef.current) return null;
    const proof = getPinStepUp();
    if (!proof) { pendingCallRef.current = call; setPhase('awaitingStepUp'); return null; }
    if (!clientRequestIdRef.current) clientRequestIdRef.current = generateClientRequestId();

    busyRef.current = true;
    setPhase('submitting');
    setErrorMessage('');
    let result;
    try {
      result = await call(proof, clientRequestIdRef.current);
    } finally {
      busyRef.current = false;
    }

    if (result && result.kind === 'ok') {
      setPhase('success');
      clientRequestIdRef.current = null;
      pendingCallRef.current = null;
      return result;
    }
    if (result && result.kind === 'step_up_required') {
      // The proof was rejected server-side (expired/wrong session) — drop it so
      // the next attempt gets a fresh one; the clientRequestId is kept, since
      // nothing was actually written (step-up is checked before any mutation).
      clearPinStepUp();
      pendingCallRef.current = call;
      setPhase('awaitingStepUp');
      return result;
    }
    setPhase('error');
    setErrorMessage(describeAccessWriteError(result));
    return result;
  }, []);

  // Abandons this attempt entirely — the next run() call starts a genuinely new
  // operation (new clientRequestId), matching "generate a new id for a
  // genuinely changed operation."
  const cancel = useCallback(() => {
    setPhase('idle');
    setErrorMessage('');
    clientRequestIdRef.current = null;
    pendingCallRef.current = null;
  }, []);

  // Called from the step-up modal's onVerified — automatically re-attempts the
  // SAME pending write now that a fresh proof exists, so the human doesn't have
  // to press "confirm" a second time after step-up (one smooth flow: confirm →
  // step-up if needed → done).
  const retryAfterStepUp = useCallback(() => {
    const call = pendingCallRef.current;
    pendingCallRef.current = null;
    if (call) { run(call); } else { setPhase('idle'); }
  }, [run]);

  return {
    phase,
    errorMessage,
    run,
    cancel,
    retryAfterStepUp,
    busy: phase === 'submitting',
  };
}
