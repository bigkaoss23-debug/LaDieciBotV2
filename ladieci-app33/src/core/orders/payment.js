// [PAYMENT-IDEMPOTENCY 2026-09-23] Pagamento lato UI — specchio del contratto BE
// (ladieci_bot src/core/delivery/finalization.js). Il backend resta l'autorità:
// qui solo cosa mostrare e cosa NON chiedere.
//
//   - Metodi ammessi: ESATTAMENTE efectivo | tarjeta | bizum. Mai "manual".
//   - Ordine già pagato (Ya pagado, oppure cobrado con metodo reale): la
//     finalizzazione non apre il picker e non manda un metodo.
//   - Correzione del metodo su un ordine RETIRADO: azione esplicita
//     api.cambiarMetodoPago, mai un secondo RETIRADO.
//   - RETIRADO è lo stesso stato per DOMICILIO e RITIRO; cambia solo la copy.

export const PAYMENT_METHODS = Object.freeze(["efectivo", "tarjeta", "bizum"]);

export const PAYMENT_METHOD_UI = Object.freeze({
  efectivo: { icon: "💵", label: "Efectivo", color: "#16A34A" },
  tarjeta:  { icon: "💳", label: "Tarjeta",  color: "#2563EB" },
  bizum:    { icon: "📱", label: "Bizum",    color: "#0EA5E9" },
});

export function normalizePaymentMethod(m) {
  return String(m == null ? "" : m).trim().toLowerCase();
}

export function isValidPaymentMethod(m) {
  return PAYMENT_METHODS.includes(normalizePaymentMethod(m));
}

export function isAlreadyPaid(order) {
  if (!order) return false;
  if (order.ya_pagado === true) return true;
  return order.cobrado === true && isValidPaymentMethod(order.metodo_pago);
}

// Copy dello stato terminale: DOMICILIO → "Entregado", RITIRO → "Retirado".
export function terminalLabel(order) {
  return order && order.tipo_consegna === "DOMICILIO" ? "Entregado" : "Retirado";
}
