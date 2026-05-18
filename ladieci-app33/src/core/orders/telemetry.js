import { canTransition, normalizeOrderState } from "./stateMachine";

const CHANNEL = "[order-state]";
const MAX_EVENTS = 200;
const DEBUG_KEY = "__ORDER_TELEMETRY__";

function emptyCounts() {
  return Object.create(null);
}

function inc(counts, key) {
  const safeKey = key || "unknown";
  counts[safeKey] = (counts[safeKey] || 0) + 1;
}

function createDebugStore() {
  const store = {
    events: [],
    countsByType: emptyCounts(),
    countsByComponent: emptyCounts(),
    countsByAction: emptyCounts(),
    countsByTransition: emptyCounts(),
    invalidCount: 0,
    rollbackCount: 0,
    legacyBypassCount: 0,
    creationBySource: emptyCounts(),
    clear() {
      this.events.length = 0;
      this.countsByType = emptyCounts();
      this.countsByComponent = emptyCounts();
      this.countsByAction = emptyCounts();
      this.countsByTransition = emptyCounts();
      this.invalidCount = 0;
      this.rollbackCount = 0;
      this.legacyBypassCount = 0;
      this.creationBySource = emptyCounts();
      return this.summary();
    },
    summary() {
      return {
        total: this.events.length,
        countsByType: { ...this.countsByType },
        countsByComponent: { ...this.countsByComponent },
        countsByAction: { ...this.countsByAction },
        countsByTransition: { ...this.countsByTransition },
        invalidCount: this.invalidCount,
        rollbackCount: this.rollbackCount,
        legacyBypassCount: this.legacyBypassCount,
        creationBySource: { ...this.creationBySource },
        lastEvent: this.events[this.events.length - 1] || null,
      };
    },
  };
  return store;
}

function getDebugStore() {
  if (typeof window === "undefined") return null;
  if (!window[DEBUG_KEY]) window[DEBUG_KEY] = createDebugStore();
  return window[DEBUG_KEY];
}

function recordEvent(event) {
  const store = getDebugStore();
  if (!store || !event) return;

  store.events.push(event);
  if (store.events.length > MAX_EVENTS) store.events.splice(0, store.events.length - MAX_EVENTS);

  inc(store.countsByType, event.type);
  inc(store.countsByComponent, event.component);
  inc(store.countsByAction, event.action);

  if (event.from || event.to) {
    inc(store.countsByTransition, `${event.from || "null"}->${event.to || "null"}`);
  }
  if (event.type === "invalid-transition") store.invalidCount += 1;
  if (event.type === "rollback") store.rollbackCount += 1;
  if (event.type === "legacy-bypass") store.legacyBypassCount += 1;
  if (event.type === "order-creation") inc(store.creationBySource, event.source);
}

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
  recordEvent(event);
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
