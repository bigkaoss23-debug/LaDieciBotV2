// ===============================================================
// useOpenServiceController.js — S2-7D5B
//
// THE single controller for opening a service session.
//
// S2-7D5 shipped two open paths: the guarded one on the closed-service landing,
// and a bare button on the closeout page that called api.openServiceSession()
// straight from its click handler — no confirmation, no actor recap, no lock,
// no verification. Two paths meant one of them was going to be the unsafe one.
//
// There is now exactly one. Every entry point mounts this hook and renders
// <OpenServiceConfirmation/>; no component may call api.openServiceSession
// itself. The hook owns:
//   - the role gate (unknown roles fail closed, rider never opens)
//   - the confirmation step (nothing is sent on the first click)
//   - ONE synchronous lock, so a double click sends one request
//   - the typed result classifier
//   - verification: only a fresh getCurrentServiceCloseout reporting 'open'
//     counts as success
// ===============================================================

import { useCallback, useRef, useState } from 'react';
import { api } from '../../api';
import { canOpenService } from '../../utils/adminRbac';
import { ATTEMPT, createAttemptLock, runOpenServiceAttempt } from '../../utils/openServiceFlow';

// onOpened(verifiedState) runs ONLY after the state read confirms an open
// service. Callers use it to refresh their view or navigate.
export function useOpenServiceController({ role, onOpened } = {}) {
  const [confirming, setConfirming] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const lockRef = useRef(null);
  if (lockRef.current === null) lockRef.current = createAttemptLock();
  const liveRef = useRef(true);

  const mayOpen = canOpenService(role);

  // First click: show the confirmation. It must NEVER send anything.
  const requestOpen = useCallback(() => {
    if (!mayOpen) return;
    setError('');
    setConfirming(true);
  }, [mayOpen]);

  // Cancel is a decision, not a failure: close the panel, send nothing.
  const cancel = useCallback(() => {
    if (lockRef.current.busy) return;
    setConfirming(false);
    setError('');
  }, []);

  const confirm = useCallback(async () => {
    // Belt and braces: the role gate is re-checked at the moment of action, not
    // only at render time.
    if (!mayOpen) { setError('No tienes permiso para abrir el servicio.'); return; }
    if (lockRef.current.busy) return;
    setOpening(true);
    setError('');
    const result = await runOpenServiceAttempt({
      lock: lockRef.current,
      openService: () => api.openServiceSession(),
      readState: () => api.getCurrentServiceCloseout(),
    });
    if (!liveRef.current) return;
    setOpening(false);
    if (result.kind === ATTEMPT.IGNORED) return;   // the losing half of a double click
    if (result.kind === ATTEMPT.OPENED) {
      setConfirming(false);
      if (onOpened) onOpened(result.state);
      return;
    }
    // BLOCKED / DENIED / NETWORK / FAILED / unverified — the panel stays open
    // with the reason, and the lock has already released so a retry is possible.
    setError(result.message);
    return result;
  }, [mayOpen, onOpened]);

  const dispose = useCallback(() => { liveRef.current = false; }, []);

  return { mayOpen, confirming, opening, error, requestOpen, cancel, confirm, dispose, lock: lockRef.current };
}
