// Centralized classification of api.verifyOwnPin() responses — the single source of
// truth OwnerStepUpView (and any future caller) uses to decide what to tell the human.
// A transport/session/config failure must never be shown as "you typed the wrong PIN":
// the backend's own error CODE is read first, the same lesson api.js's S2-7D6E6 comment
// documents for the transport layer, applied here at the UI layer.
//
// Backend contract (index.js verifyOwnPin branch, src/auth/pinStepUp.js):
//   ok:true                       -> verified, stepUpProof issued
//   429 {error:"LOCKED"}          -> too many attempts, retryAfterSec may be present
//   401 {error:"REAUTH_REQUIRED"} -> session predates per-login sid, no weaker fallback
//   400 {error:"BAD_REQUEST"}     -> PIN format rejection, DELIBERATELY indistinguishable
//                                    from a wrong PIN by the backend's own design ("no
//                                    length/shape oracle" — src/auth/pinStepUp.js)
//   401 {error:"PIN_INCORRECTO"}  -> genuine wrong credential
// Everything else — a network error, an unexpected HTTP status, a trusted-proxy/
// X-Api-Key rejection (401 {error:"unauthorized"}), 403 ROLE_FORBIDDEN, 503
// UNAVAILABLE, or any unrecognized code — is a TRANSPORT failure: the request never
// reached PIN comparison, so it must never assert the PIN was wrong.
export function classifyStepUpFailure(res) {
  if (res && res.error === 'LOCKED') {
    const secs = Number(res.retryAfterSec) || 0;
    return {
      kind: 'locked',
      message: secs > 0
        ? `Demasiados intentos. Espera ${secs}s e inténtalo de nuevo.`
        : 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    };
  }
  if (res && res.error === 'REAUTH_REQUIRED') {
    return { kind: 'reauth', message: 'Por seguridad, vuelve a iniciar sesión para gestionar los PIN.' };
  }
  if (res && (res.error === 'PIN_INCORRECTO' || res.error === 'BAD_REQUEST')) {
    return { kind: 'wrong_pin', message: 'PIN incorrecto.' };
  }
  if (res && res.error === 'UNAVAILABLE') {
    return { kind: 'unavailable', message: 'Servicio no disponible temporalmente. Inténtalo de nuevo en unos minutos.' };
  }
  return { kind: 'transport', message: 'No se pudo verificar el PIN. Comprueba la conexión e inténtalo de nuevo.' };
}
