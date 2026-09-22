// Pure order state machine.
// No React, no API calls, no database writes.

export const ORDER_STATES = Object.freeze({
  POR_CONFIRMAR: "POR_CONFIRMAR",
  EN_COCINA: "EN_COCINA",
  LISTO: "LISTO",
  EN_ENTREGA: "EN_ENTREGA",
  RETIRADO: "RETIRADO",
  COMPLETATO: "COMPLETATO",
  CHIUSO_FORZATO: "CHIUSO_FORZATO",
});

// SEMANTICA CANONICA (DELIVERY-REFACTOR 2026-09-22):
//   RETIRADO = il cliente ha RICEVUTO (DOMICILIO) o RITIRATO (RITIRO) l'ordine.
//              È l'unico stato terminale, e significa un fatto di business.
//              NON significa più "driver rientrato" né "giro rider chiuso".
//   EN_ENTREGA = LEGACY. Nessuna UI lo produce più: il viaggio del driver non è
//              uno stato dell'ordine, che durante la consegna resta LISTO.
//              Resta nell'enum, e finalizzabile, per gli ordini in-flight creati
//              da versioni precedenti.
// Nelle viste l'azione finale si chiama "Entregado" per DOMICILIO e "Retirado"
// per RITIRO — stesso stato DB, parola giusta per il contesto.
export const ORDER_STATE_LABELS = Object.freeze({
  [ORDER_STATES.POR_CONFIRMAR]: "Por confirmar",
  [ORDER_STATES.EN_COCINA]: "En cocina",
  [ORDER_STATES.LISTO]: "Listo",
  [ORDER_STATES.EN_ENTREGA]: "En entrega",
  [ORDER_STATES.RETIRADO]: "Retirado",
  [ORDER_STATES.COMPLETATO]: "Completado",
  [ORDER_STATES.CHIUSO_FORZATO]: "Cierre forzado",
});

export const ORDER_STATE_RANK = Object.freeze({
  [ORDER_STATES.POR_CONFIRMAR]: 0,
  [ORDER_STATES.EN_COCINA]: 1,
  [ORDER_STATES.LISTO]: 2,
  [ORDER_STATES.EN_ENTREGA]: 3,
  [ORDER_STATES.RETIRADO]: 9,
  [ORDER_STATES.COMPLETATO]: 9,
  [ORDER_STATES.CHIUSO_FORZATO]: 9,
});

export const TERMINAL_ORDER_STATES = Object.freeze([
  ORDER_STATES.RETIRADO,
  ORDER_STATES.COMPLETATO,
  ORDER_STATES.CHIUSO_FORZATO,
]);

export const COMPLETED_ORDER_STATES = Object.freeze([
  ORDER_STATES.RETIRADO,
  ORDER_STATES.COMPLETATO,
]);

export const ACTIVE_ORDER_STATES = Object.freeze([
  ORDER_STATES.POR_CONFIRMAR,
  ORDER_STATES.EN_COCINA,
  ORDER_STATES.LISTO,
  ORDER_STATES.EN_ENTREGA,
]);

export const DELIVERY_ORDER_STATES = Object.freeze([
  ORDER_STATES.EN_COCINA,
  ORDER_STATES.LISTO,
  ORDER_STATES.EN_ENTREGA,
]);

// [DELIVERY-REFACTOR 2026-09-22] Allineato al grafo del backend
// (src/utils/orderStateMachine.js), che è l'autorità: prima il FE era più
// permissivo (EN_COCINA → RETIRADO / EN_ENTREGA) e il BE avrebbe rifiutato.
// Percorso moderno: POR_CONFIRMAR → EN_COCINA → LISTO → RETIRADO.
// Unico undo operativo: LISTO → EN_COCINA ("Volver a cocina", il pulsante LISTO
// non ha conferma e si preme per sbaglio).
// EN_ENTREGA sopravvive SOLO in uscita, per gli ordini legacy in-flight: nessuna
// transizione porta più verso di lui.
export const VALID_ORDER_TRANSITIONS = Object.freeze({
  [ORDER_STATES.POR_CONFIRMAR]: Object.freeze([
    ORDER_STATES.EN_COCINA,
    ORDER_STATES.CHIUSO_FORZATO,
  ]),
  [ORDER_STATES.EN_COCINA]: Object.freeze([
    ORDER_STATES.LISTO,
    ORDER_STATES.CHIUSO_FORZATO,
  ]),
  [ORDER_STATES.LISTO]: Object.freeze([
    ORDER_STATES.EN_COCINA,
    ORDER_STATES.RETIRADO,
    ORDER_STATES.CHIUSO_FORZATO,
  ]),
  // Legacy in-flight: si esce, non si entra.
  [ORDER_STATES.EN_ENTREGA]: Object.freeze([
    ORDER_STATES.RETIRADO,
    ORDER_STATES.CHIUSO_FORZATO,
  ]),
  [ORDER_STATES.RETIRADO]: Object.freeze([
    ORDER_STATES.RETIRADO,
  ]),
  [ORDER_STATES.COMPLETATO]: Object.freeze([]),
  [ORDER_STATES.CHIUSO_FORZATO]: Object.freeze([]),
});

export function normalizeOrderState(state) {
  return String(state || "").trim().toUpperCase();
}

export function isKnownOrderState(state) {
  return Object.prototype.hasOwnProperty.call(ORDER_STATE_LABELS, normalizeOrderState(state));
}

export function nextStates(state) {
  return VALID_ORDER_TRANSITIONS[normalizeOrderState(state)] || [];
}

export function canTransition(fromState, toState) {
  const from = normalizeOrderState(fromState);
  const to = normalizeOrderState(toState);
  if (!from || !to) return false;
  if (from === to) return true;
  return nextStates(from).includes(to);
}

export function isTerminalState(state) {
  return TERMINAL_ORDER_STATES.includes(normalizeOrderState(state));
}

export function isCompletedState(state) {
  return COMPLETED_ORDER_STATES.includes(normalizeOrderState(state));
}

export function isActiveState(state) {
  return ACTIVE_ORDER_STATES.includes(normalizeOrderState(state));
}

export function isDeliveryState(state) {
  return DELIVERY_ORDER_STATES.includes(normalizeOrderState(state));
}

function isDeliveryOrder(order) {
  const tipoConsegna = String(order?.tipo_consegna || order?.tipoConsegna || "").trim().toUpperCase();
  return tipoConsegna === "DOMICILIO";
}

export function isWaitingDriverState(order) {
  return isDeliveryOrder(order) && normalizeOrderState(order?.estado) === ORDER_STATES.LISTO;
}

export function isDriverOnTheWayState(order) {
  return isDeliveryOrder(order) && normalizeOrderState(order?.estado) === ORDER_STATES.EN_ENTREGA;
}

export function isDeliveryActiveState(order) {
  return isDeliveryOrder(order) && !isTerminalState(order?.estado);
}

export function buildVolverACocinaTransition(order, metadata = {}) {
  return {
    orderId: order?.id || null,
    from: ORDER_STATES.LISTO,
    to: ORDER_STATES.EN_COCINA,
    action: "volverACocina",
    component: "unknown",
    timestamp: new Date().toISOString(),
    metadata: {
      ...metadata,
      reason: "manual_operator_rollback",
    },
  };
}

export function orderStateRank(state, fallback = 5) {
  const normalized = normalizeOrderState(state);
  return ORDER_STATE_RANK[normalized] ?? fallback;
}
