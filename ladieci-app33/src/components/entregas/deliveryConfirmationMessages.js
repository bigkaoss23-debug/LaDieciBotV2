// DELIVERY x ECONOMY DECOUPLING (migration 139) -- operator-facing Spanish copy for the refusals of the
// pizzeria's delivery confirmation (confirmarEntregaOperador). One frozen dictionary keyed by the backend's own typed
// codes; an unknown code falls back to a generic retry sentence, never raw backend text.
const BY_CODE = Object.freeze({
  INVALID_STATE: "El pedido ya no está en reparto. Actualiza la lista.",
  NOT_FOUND: "No se encontró el pedido.",
  ORDER_NOT_ELIGIBLE: "Este pedido no es una entrega a domicilio.",
  ORDER_NOT_CANONICAL: "El pedido no tiene identidad canónica; no se puede confirmar.",
  DELIVERY_LOST_RACE: "El pedido cambió mientras tanto. No se registró nada; actualiza e inténtalo de nuevo.",
  AUTH_FORBIDDEN_ROLE: "Tu rol no puede confirmar entregas.",
  AUTH_SESSION_STALE: "Tu sesión ha caducado. Vuelve a entrar.",
  AUTH_ACTOR_NOT_FOUND: "Tu sesión ha caducado. Vuelve a entrar.",
  AUTH_INITIATOR_INACTIVE: "Tu sesión ha caducado. Vuelve a entrar.",
  CASH_RELOGIN_REQUIRED: "Vuelve a entrar para poder registrar el cobro.",
  OPERATOR_DELIVERY_CONTEXT_UNAVAILABLE: "Tu sesión ha caducado. Vuelve a entrar.",
});

// A refused PAYMENT means the delivery was NOT confirmed either (one transaction): say both.
const BY_PAYMENT_CODE = Object.freeze({
  // Since migration 139 (B2) a payment no longer needs a service to be OPEN: it is recorded as an off-service receipt.
  // This code can only come back now for an order that has NO service of its own at all (a legacy row).
  ORDER_PAYMENT_NO_OPEN_SERVICE: "Este pedido no tiene un servicio asociado, no se puede registrar el cobro. No se registró nada: confirma solo la entrega.",
  ORDER_PAYMENT_POSSIBLE_DUPLICATE: "Ya se registró un cobro idéntico hace poco. No se registró nada.",
  ORDER_PAYMENT_AMOUNT_INVALID: "El importe no es válido. No se registró nada.",
  ORDER_PAYMENT_FORBIDDEN: "Tu rol no puede registrar cobros. No se registró nada.",
  ORDER_PAYMENT_ORDER_CANCELLED: "El pedido está anulado. No se registró nada.",
  ORDER_PAYMENT_IDEMPOTENCY_CONFLICT: "Este intento de cobro ya se usó con otros datos. No se registró nada.",
  // Migration 148: the order says "paid" in the legacy system but the ledger has no such payment. The writer refuses
  // any new collection until administration imports the historical payment (or reconciles the obligation).
  ORDER_PAYMENT_LEGACY_IMPORT_REQUIRED: "Figura como pagado en el sistema antiguo, pero ese cobro no está registrado en caja. No se registró nada: no cobres al cliente y avisa a administración para regularizarlo.",
});

export function describeDeliveryConfirmError(res) {
  const code = res && res.error;
  if (code === "PAYMENT_REFUSED") {
    return BY_PAYMENT_CODE[res.payment_code] || "No se pudo registrar el cobro. No se registró nada.";
  }
  return BY_CODE[code] || "No se pudo confirmar la entrega. Actualiza e inténtalo de nuevo.";
}

// STALE PAYMENT MIRROR (H2) -- the success toast says what the backend ACTUALLY recorded. The confirmation succeeds
// without a new payment when the order was already settled (ORDER_PAYMENT_ALREADY_SETTLED is tolerated: e.g. the
// rider collected first, or an adjustment brought the debt down to what was already paid); saying "cobro efectivo"
// then told the operator to take money that was never recorded. `payment` is the writer's receipt (null when nothing
// was collected); a response without that key predates this contract and keeps the previous wording.
// Returns { detail, message, tone }: `detail` is what follows "✓ Entrega confirmada" (the handler keeps that literal), message is
// the whole sentence, tone 'ok' | 'warning'.
const confirmed = (detail, tone) => ({ detail, message: `✓ Entrega confirmada${detail}`, tone });
export function describeDeliveryConfirmSuccess(res, requestedPayment) {
  if (!requestedPayment) return confirmed("", "ok");
  if (!res || !Object.prototype.hasOwnProperty.call(res, "payment")) return confirmed(` · cobro ${requestedPayment.method}`, "ok");
  const receipt = res.payment;
  if (receipt && receipt.idempotent !== true) {
    const amount = Number(receipt.amount);
    return confirmed(` · cobro ${requestedPayment.method}${Number.isFinite(amount) && amount > 0 ? ` ${amount.toFixed(2)}€` : ""}`, "ok");
  }
  if (receipt) return confirmed(" · el cobro ya estaba registrado (no se cobró de nuevo)", "ok");
  if (res.payment_note === "ORDER_PAYMENT_ALREADY_SETTLED") {
    return confirmed(" · NO se registró ningún cobro: el pedido ya estaba pagado. No cobres al cliente.", "warning");
  }
  return confirmed(" · NO se registró ningún cobro.", "warning");
}
