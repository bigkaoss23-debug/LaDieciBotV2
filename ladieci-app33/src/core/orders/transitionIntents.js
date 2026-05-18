import { ORDER_STATES, normalizeOrderState } from "./stateMachine";

export function buildOrderTransition({
  order,
  orderId,
  from,
  to,
  action,
  component,
  timestamp,
  metadata = {},
} = {}) {
  return {
    orderId: orderId || order?.id || null,
    from: from == null ? normalizeOrderState(order?.estado) : normalizeOrderState(from),
    to: to == null ? null : normalizeOrderState(to),
    action: action || "unknown",
    component: component || "unknown",
    timestamp: timestamp || new Date().toISOString(),
    metadata,
  };
}

export function buildRetiradoTransition(order, {
  action = "setRetirado",
  component = "unknown",
  timestamp,
  metadata = {},
} = {}) {
  return buildOrderTransition({
    order,
    to: ORDER_STATES.RETIRADO,
    action,
    component,
    timestamp,
    metadata,
  });
}

export function buildListoTransition(order, {
  action = "setListo",
  component = "unknown",
  timestamp,
  metadata = {},
} = {}) {
  return buildOrderTransition({
    order,
    to: ORDER_STATES.LISTO,
    action,
    component,
    timestamp,
    metadata,
  });
}

export function buildEnCocinaTransition(order, {
  action = "setEnCocina",
  component = "unknown",
  timestamp,
  metadata = {},
} = {}) {
  return buildOrderTransition({
    order,
    to: ORDER_STATES.EN_COCINA,
    action,
    component,
    timestamp,
    metadata,
  });
}

export function buildEnEntregaTransition(order, {
  action = "setEnEntrega",
  component = "unknown",
  timestamp,
  metadata = {},
} = {}) {
  return buildOrderTransition({
    order,
    to: ORDER_STATES.EN_ENTREGA,
    action,
    component,
    timestamp,
    metadata,
  });
}
