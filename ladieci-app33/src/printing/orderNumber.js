const clean = (value) => value == null ? "" : String(value).trim();

export function normalizeServiceOrderNumber(value) {
  const raw = clean(value);
  if (!raw) return "";
  const withoutLabel = raw.replace(/^(?:pedido|orden)\s*/i, "");
  return withoutLabel.replace(/^#+\s*/, "").trim();
}

export function resolveServiceOrderNumber(order) {
  if (!order || typeof order !== "object") return normalizeServiceOrderNumber(order);
  return normalizeServiceOrderNumber(
    order.service_order_number
      ?? order.serviceOrderNumber
      ?? order.order_number
      ?? order.numero
      ?? order.number
      ?? order.id
      ?? order.order_id
      ?? order.orden_id
  );
}

export function formatServiceOrderNumber(value, fallback = "—", minimumDigits = 0) {
  const number = typeof value === "object"
    ? resolveServiceOrderNumber(value)
    : normalizeServiceOrderNumber(value);
  const display = minimumDigits > 0 && /^\d+$/.test(number)
    ? number.padStart(minimumDigits, "0")
    : number;
  return display ? `#${display}` : fallback;
}
