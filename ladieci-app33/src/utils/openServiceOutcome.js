// ===============================================================
// openServiceOutcome.js — S2-7D5
//
// Classify the openServiceSession response.
//
// The client NEVER concludes "the service is open" from this response alone.
// index.js returns 409 with a bare code on failure and the RPC body on success,
// and the RPC body shape is not part of any frozen contract the frontend owns.
// So the only trustworthy confirmation is a fresh getCurrentServiceCloseout that
// reports status === 'open'. This module therefore answers a narrower question:
//
//   "should I now re-read the service state, or is this a hard failure?"
//
// 409 is deliberately `verify`, not `failed`: the single-active-session unique
// index means a race with another operator surfaces as a conflict while the
// service IS in fact open. Re-reading resolves it correctly either way.
// ===============================================================

export const OPEN_OUTCOME = Object.freeze({
  VERIFY: 'verify',     // request went through (or raced) — re-read the state
  BLOCKED: 'blocked',   // draft write lock — nothing left the browser
  DENIED: 'denied',     // 401/403 — role/session refused by the backend
  NETWORK: 'network',   // never reached the backend
  FAILED: 'failed',     // backend refused for a domain reason
});

const CODES = {
  SERVICE_SESSION_OPEN_FAILED: 'No se pudo abrir el servicio. Inténtalo de nuevo.',
  SERVICE_SESSION_TRANSPORT_ERROR: 'El servidor no respondió al abrir el servicio. Inténtalo de nuevo.',
  SERVICE_SESSION_ALREADY_OPEN: 'Ya hay un servicio abierto.',
};

export function classifyOpenAttempt(res) {
  if (!res || typeof res !== 'object') {
    return { kind: OPEN_OUTCOME.FAILED, message: 'No se pudo abrir el servicio. Inténtalo de nuevo.' };
  }
  if (res.draftBlocked) {
    return {
      kind: OPEN_OUTCOME.BLOCKED,
      message: res.error || 'Borrador de prueba — no se abrirá ningún servicio.',
    };
  }
  const status = res._status;
  if (status === 401 || status === 403) {
    return { kind: OPEN_OUTCOME.DENIED, message: 'No tienes permiso para abrir el servicio.' };
  }
  if (status === 0) {
    return { kind: OPEN_OUTCOME.NETWORK, message: 'Error de red al abrir el servicio. No se abrió nada.' };
  }
  // A conflict means another open attempt won the race — the service may well be
  // open now. Verify rather than declaring failure.
  if (status === 409) return { kind: OPEN_OUTCOME.VERIFY, message: null };
  if (res._ok === false) {
    const code = String(res.error || '').trim();
    return { kind: OPEN_OUTCOME.FAILED, message: CODES[code] || 'No se pudo abrir el servicio. Inténtalo de nuevo.' };
  }
  return { kind: OPEN_OUTCOME.VERIFY, message: null };
}

// Shown when the call was accepted but a fresh read still does not report an
// open service. Never claim success the state does not confirm.
export const OPEN_UNVERIFIED_MESSAGE =
  'El servicio no consta como abierto. Recarga e inténtalo de nuevo.';
