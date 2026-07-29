import { assertTicketType } from "./contracts";

function segment(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${field} is required`);
  return encodeURIComponent(normalized.toLowerCase());
}

export function buildPrintIdempotencyKey({
  locationId,
  orderId,
  ticketType,
  orderRevision,
  targetPrinter,
  copyNumber,
} = {}) {
  assertTicketType(ticketType);
  if (!Number.isInteger(orderRevision) || orderRevision < 1) {
    throw new TypeError("orderRevision must be a positive integer");
  }
  if (!Number.isInteger(copyNumber) || copyNumber < 1) {
    throw new TypeError("copyNumber must be a positive integer");
  }
  return [
    "print-v1",
    segment(locationId, "locationId"),
    segment(orderId, "orderId"),
    ticketType.toLowerCase(),
    `r${orderRevision}`,
    segment(targetPrinter, "targetPrinter"),
    `c${copyNumber}`,
  ].join(":");
}
