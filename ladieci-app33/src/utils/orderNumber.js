const CANDIDATE_FIELDS = Object.freeze([
  "service_order_number", "serviceOrderNumber", "order_number", "numero_servicio",
  "numero", "number", "id", "order_id", "orden_id", "ordine_ref",
]);

export function getOrderNumber(source) {
  if (source == null) return "";
  if (typeof source !== "object") return source;
  for (const field of CANDIDATE_FIELDS) {
    const value = source[field];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return "";
}

export function normalizeOrderNumberToken(source) {
  return String(getOrderNumber(source) ?? "")
    .trim()
    .replace(/^(?:pedido|orden|ordine)\s*/i, "")
    .replace(/^#+\s*/, "")
    .trim();
}

export function formatOrderNumber(source, { prefix = "#", fallback = "—", pad = 3 } = {}) {
  const token = normalizeOrderNumberToken(source);
  if (!token) return fallback;
  const isOperational = source && typeof source === "object"
    && (source.service_order_number != null || source.serviceOrderNumber != null || source.numero_servicio != null);
  const displayToken = isOperational && /^\d+$/.test(token) ? token.padStart(pad, "0") : token;
  return `${prefix}${displayToken}`;
}

export function formatOrderLabel(source, { label = "PEDIDO", fallback = `${label} —` } = {}) {
  const number = formatOrderNumber(source, { fallback: "" });
  return number ? `${label} ${number}` : fallback;
}
