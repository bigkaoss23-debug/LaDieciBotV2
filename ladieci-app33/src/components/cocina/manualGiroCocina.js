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

// Orario consegna comune (🛵) di un ordine che appartiene a un manual giro.
// Fallback in ordine di priorità:
//   1) giro.entrega_ref (target consegna scelto/derivato dall'operatore)
//   2) anchor_order_id → ora cliente dell'ordine di provenienza
//   3) max ora cliente tra i membri del giro
//   4) ora cliente dell'ordine stesso
// allOrders dev'essere la lista più completa disponibile (prop ordenes), non
// solo gli ordini visibili in Cocina, per non sottostimare il max se un membro
// del giro è già passato a LISTO/EN_ENTREGA.
export const resolveHoraEntregaGiro = (order, giro, allOrders = []) => {
  if (giro && giro.entrega_ref) return giro.entrega_ref;
  const gid = giro && giro.id;
  if (gid) {
    if (giro.anchor_order_id) {
      const anchor = (allOrders || []).find(o => o && o.id === giro.anchor_order_id);
      if (anchor && anchor.hora) return anchor.hora;
    }
    const memberHoras = (allOrders || [])
      .filter(o => o && o.manual_giro_id === gid && o.hora)
      .map(o => ({ h: o.hora, ms: orarioToMs(o.hora) }))
      .filter(x => x.ms != null);
    if (memberHoras.length) {
      return memberHoras.reduce((a, b) => (b.ms > a.ms ? b : a)).h;
    }
  }
  return order?.hora || null;
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
