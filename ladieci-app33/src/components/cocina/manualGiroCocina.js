import { orarioToMs } from '../ordenes/TabListos';

export const formatManualGiroLabel = (giro) => {
  if (!giro) return "G?";
  if (typeof giro.seq === "number" && Number.isFinite(giro.seq)) return "G" + giro.seq;
  const m = String(giro.id || "").match(/_(\d+)$/);
  return m ? "G" + m[1] : "G?";
};

export const buildManualGiroMetaById = (manualGiros = []) => {
  const out = {};
  for (const giro of manualGiros || []) {
    if (giro && giro.id && !giro.dissolved_at) out[giro.id] = giro;
  }
  return out;
};

export const getManualGiroForOrder = (order, giroMetaById = {}) => {
  const gid = order?.manual_giro_id;
  if (!gid) return null;
  return giroMetaById[gid] || { id: gid, seq: null, order_ids: [] };
};

export const manualGiroBadgeStyle = (light = false) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: light ? "rgba(251,191,36,0.18)" : "rgba(251,191,36,0.20)",
  border: "1px solid rgba(251,191,36,0.55)",
  borderRadius: 999,
  color: light ? "#92400E" : "#FEF3C7",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: 0.2,
  padding: "3px 8px",
  lineHeight: 1,
  whiteSpace: "nowrap",
  textTransform: "uppercase",
});

export const manualGiroSortAnchorMs = (order, orders = []) => {
  const gid = order?.manual_giro_id;
  if (!gid) return orarioToMs(order?.horaForno || order?.hora) || 0;
  const groupTimes = (orders || [])
    .filter(o => o?.manual_giro_id === gid)
    .map(o => orarioToMs(o?.horaForno || o?.hora))
    .filter(ms => ms != null);
  if (!groupTimes.length) return orarioToMs(order?.horaForno || order?.hora) || 0;
  return Math.min(...groupTimes);
};
