export const TICKET_SNAPSHOT_VERSION = 1;
export const TICKET_DOCUMENT_VERSION = 1;

export const TICKET_TYPES = Object.freeze({
  KITCHEN: "KITCHEN",
  KITCHEN_DELTA: "KITCHEN_DELTA",
  KITCHEN_CORRECTION: "KITCHEN_CORRECTION",
  CUSTOMER: "CUSTOMER",
  CANCELLATION: "CANCELLATION",
});

export const PAPER_WIDTHS = Object.freeze([58, 80]);

export const MOCK_PRINT_STATUSES = Object.freeze({
  PREVIEW_READY: "preview_ready",
  DIALOG_OPENED: "dialog_opened",
  PRINTED: "printed",
  FAILED: "failed",
  UNKNOWN: "unknown",
});

const values = (object) => Object.values(object);

export function assertTicketType(value) {
  if (!values(TICKET_TYPES).includes(value)) {
    throw new TypeError(`Unsupported ticket type: ${String(value)}`);
  }
  return value;
}

export function assertPaperWidth(value) {
  const width = Number(value);
  if (!PAPER_WIDTHS.includes(width)) {
    throw new TypeError(`Unsupported paper width: ${String(value)}`);
  }
  return width;
}

export function assertSnapshotVersion(value) {
  if (value !== TICKET_SNAPSHOT_VERSION) {
    throw new TypeError(`Unsupported snapshot version: ${String(value)}`);
  }
  return value;
}

export function assertTicketDocument(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new TypeError("TicketDocument must be an object");
  }
  if (document.document_version !== TICKET_DOCUMENT_VERSION) {
    throw new TypeError(`Unsupported document version: ${String(document.document_version)}`);
  }
  assertTicketType(document.ticket_type);
  assertPaperWidth(document.paper_width);
  if (!Array.isArray(document.blocks)) {
    throw new TypeError("TicketDocument.blocks must be an array");
  }
  return document;
}

export function assertTicketSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError("TicketSnapshot must be an object");
  }
  assertSnapshotVersion(snapshot.snapshot_version);
  assertTicketType(snapshot.ticket_type);
  assertPaperWidth(snapshot.paper_width);
  for (const field of ["location_id", "order_id", "service_session_id", "created_at"]) {
    if (typeof snapshot[field] !== "string" || !snapshot[field].trim()) {
      throw new TypeError(`TicketSnapshot.${field} is required`);
    }
  }
  if (!Number.isInteger(snapshot.order_revision) || snapshot.order_revision < 1) {
    throw new TypeError("TicketSnapshot.order_revision must be a positive integer");
  }
  for (const section of ["order", "kitchen", "customer", "delivery", "privacy"]) {
    if (!snapshot[section] || typeof snapshot[section] !== "object") {
      throw new TypeError(`TicketSnapshot.${section} is required`);
    }
  }
  return snapshot;
}

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
