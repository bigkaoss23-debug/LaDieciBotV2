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

// P1-A — service_order_number resets per service_session, so two DIFFERENT
// orders from different services can share the same base label (e.g. two
// "#001"s across a rollover/carryover). Canonical identity (order.id) never
// changes; this only computes what to SHOW. A collision is defined as two
// distinct orders, in the SAME rendered list, whose base label matches but
// whose service_session_id differs (or is unknown on either side -- treated
// as "can't prove they're the same", so it disambiguates rather than risk
// hiding a real collision). Same-session duplicates are never possible
// (service_order_number is unique within one service) and are never
// disambiguated here -- that would be a different, upstream bug, not
// something to paper over with a suffix.
//
// Disambiguation is a compact " · <letter>" suffix, A/B/C..., assigned by
// sorting the colliding service_session_ids lexicographically -- fully
// deterministic for a given input list, no backend field beyond the
// service_session_id every order already carries.
function letterForIndex(index) {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export function buildVisibleOrderLabels(orders, options = {}) {
  const { fallback = "—" } = options;
  const list = Array.isArray(orders) ? orders : [];
  const keyOf = (o, index) => (o && typeof o === "object" && o.id != null) ? o.id : `__idx_${index}`;
  const sessionKeyOf = (o, key) => {
    const raw = o && typeof o === "object" ? o.service_session_id : null;
    return (raw != null && String(raw).trim()) ? String(raw) : `__no_session__${key}`;
  };

  const bases = new Map();
  const sessionKeyByKey = new Map();
  const groups = new Map(); // base label -> Set of distinct session keys sharing it

  list.forEach((o, index) => {
    const key = keyOf(o, index);
    const base = formatOrderNumber(o, options);
    bases.set(key, base);
    if (base === fallback) return; // "no number" is never a collision
    const sk = sessionKeyOf(o, key);
    sessionKeyByKey.set(key, sk);
    if (!groups.has(base)) groups.set(base, new Set());
    groups.get(base).add(sk);
  });

  const labels = new Map();
  list.forEach((o, index) => {
    const key = keyOf(o, index);
    const base = bases.get(key);
    const sessionSet = base === fallback ? null : groups.get(base);
    if (!sessionSet || sessionSet.size <= 1) { labels.set(key, base); return; }
    const sorted = [...sessionSet].sort();
    const suffix = letterForIndex(sorted.indexOf(sessionKeyByKey.get(key)));
    labels.set(key, `${base} · ${suffix}`);
  });

  return labels;
}

// Safe lookup helper for render call sites: falls back to the plain
// (non-disambiguated) label if the order isn't in the map for any reason
// (e.g. a race between computing labels and a list update) rather than
// showing nothing.
export function resolveVisibleOrderLabel(order, labelsMap, options = {}) {
  if (labelsMap && order && typeof order === "object" && order.id != null && labelsMap.has(order.id)) {
    return labelsMap.get(order.id);
  }
  return formatOrderNumber(order, options);
}
