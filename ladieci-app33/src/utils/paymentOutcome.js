// S2-7D6E — reading the outcome of a collection.
//
// WHY THIS EXISTS. `setRetirado` used to accept the response as successful whenever
// `res.error` was falsy. But `proxyPost` NEVER throws: on a non-2xx it returns
// `{...body, _status, _ok:false}`. An HTTP error with an empty JSON body therefore read as
// a success, and the operator saw "🛍 Retirado — Buon appetito!" for an order that had not
// moved. Combined with the backend defect (payment recorded as a boolean nobody set), that
// is how a 12.00 cash sale reached the closeout as Cobrado 0.00 with nobody noticing.
//
// The backend now refuses the transition when the ledger refuses the money, answering 409
// with a typed `code`. These helpers are pure so the mapping is unit-testable without a DOM
// or a network: the UI layer only decides where to render the string.

// Codes the operator payment registrar can return (src/financial/registerOperatorPayment.js
// on the backend) plus the SQL domain codes that can reach the operator.
export const PAYMENT_FAILURE_MESSAGES = Object.freeze({
  PAYMENT_CONTEXT_UNAVAILABLE:
    "No se pudo verificar tu sesión para registrar el cobro. Vuelve a entrar e inténtalo otra vez.",
  PAYMENT_METHOD_INVALID:
    "Método de pago no válido. Elige efectivo, tarjeta o bizum.",
  PAYMENT_ORDER_INVALID:
    "Pedido no válido para el cobro.",
  AUTH_SESSION_STALE:
    "Tu sesión ha caducado. Vuelve a entrar para registrar el cobro.",
  AUTH_ORDER_NOT_FOUND:
    "El pedido ya no existe. Actualiza la pantalla.",
  AUTH_IDEMPOTENCY_CONFLICT:
    "Ya hay un cobro distinto registrado para este pedido. Revísalo antes de reintentar.",
  AUTH_BASIS_EXISTS:
    "Este pedido ya tiene un cobro registrado.",
  ORDER_WITHOUT_SERVICE_SESSION:
    "El pedido no está asociado a ningún servicio abierto. No se puede cobrar.",
  // N-5 — the operator asked to collect AND apply a discount in one action. The backend
  // refuses BEFORE taking any money, because a collection is registered against the total
  // as it stands: the discount would land after the charge, recording more than was owed.
  // Nothing was charged and the pedido has not moved, so the way through is to apply the
  // discount first and then collect.
  PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN:
    "No se puede modificar el importe de un pedido que ya tiene pagos registrados. Aplica el descuento antes de cobrar.",
});

const GENERIC_FAILURE = "No se pudo registrar el cobro. El pedido no ha cambiado de estado.";

// A response counts as failed when the transport says so (`_ok === false`), when the
// backend flags `success:false`, or when the legacy `error` field is populated. Checking
// only one of the three is what let a silent failure through.
export function isPaymentFailure(res) {
  if (!res || typeof res !== "object") return true;
  if (res._ok === false) return true;
  if (res.success === false) return true;
  if (res.error) return true;
  return false;
}

// Never invent a reason. An unrecognised code falls back to the generic sentence rather
// than echoing a raw backend token at the operator.
export function describePaymentFailure(res) {
  const code = res && typeof res === "object"
    ? (typeof res.code === "string" && res.code) || (typeof res.error === "string" && res.error) || null
    : null;
  const known = code && Object.prototype.hasOwnProperty.call(PAYMENT_FAILURE_MESSAGES, code);
  return Object.freeze({
    code: code || null,
    message: known ? PAYMENT_FAILURE_MESSAGES[code] : GENERIC_FAILURE,
    // Every current failure leaves the order untouched, so retrying is always safe: the
    // backend key is deterministic per order, so a retry replays instead of double-charging.
    retryable: true,
  });
}

export { GENERIC_FAILURE as PAYMENT_GENERIC_FAILURE };
