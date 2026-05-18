import { canTransition, normalizeOrderState } from "./stateMachine";

const CHANNEL = "[order-state]";

function buildEvent(type, data = {}) {
  const from = data.from == null ? null : normalizeOrderState(data.from);
  const to = data.to == null ? null : normalizeOrderState(data.to);
  return {
    type,
    timestamp: new Date().toISOString(),
    component: data.component || "unknown",
    action: data.action || "unknown",
    orderId: data.orderId || data.id || null,
    from,
    to,
    valid: from && to ? canTransition(from, to) : null,
    metadata: data.metadata || {},
  };
}

function emit(method, label, event) {
  const fn = console[method] || console.log;
  fn(`${CHANNEL} ${label}`, event);
  return event;
}

export function logTransition(data = {}) {
  const event = buildEvent("transition", data);
  if (event.valid === false) return logInvalidTransition(data);
  return emit("info", "transition", event);
}

export function logInvalidTransition(data = {}) {
  return emit("warn", "invalid-transition", buildEvent("invalid-transition", data));
}

export function logRollback(data = {}) {
  return emit("warn", "rollback", buildEvent("rollback", data));
}

export function logLegacyBypass(data = {}) {
  return emit("warn", "legacy-bypass", buildEvent("legacy-bypass", data));
}

export function logOrderCreation(intent = {}) {
  return emit("info", "order-creation", {
    type: "order-creation",
    timestamp: intent.timestamp || new Date().toISOString(),
    component: intent.component || "unknown",
    action: intent.action || "unknown",
    tempId: intent.tempId || null,
    clientReqId: intent.clientReqId || null,
    source: intent.source || "unknown",
    canal: intent.canal || "unknown",
    initialState: intent.initialState || null,
    metadata: intent.metadata || {},
  });
}
