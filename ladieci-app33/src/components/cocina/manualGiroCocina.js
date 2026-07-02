import { orarioToMs } from '../ordenes/TabListos';

export const formatManualGiroLabel = (giro) => {
  if (!giro) return "G?";
  if (typeof giro.seq === "number" && Number.isFinite(giro.seq)) return "G" + giro.seq;
  const m = String(giro.id || "").match(/_(\d+)$/);
  return m ? "G" + m[1] : "G?";
};

// COCINA_MANUAL_GIRO_VISUAL_GROUPING (Option 1) — stable accent color per giro so
// that all cards sharing a manual_giro_id read as ONE cluster in Cocina. PURE &
// DETERMINISTIC: keyed by giro.seq (backend-assigned, integer, stable per service
// day → identical for every member). Fallback to a char-code hash of giro.id when
// seq is missing (fetch race). NEVER pure red — red is reserved for aggiunta/urgent.
export const MANUAL_GIRO_ACCENT_PALETTE = [
  "#F59E0B", // amber
  "#06B6D4", // cyan
  "#8B5CF6", // violet
  "#22C55E", // green
  "#EC4899", // pink
  "#3B82F6", // blue
];

export const manualGiroAccentColor = (giro) => {
  const P = MANUAL_GIRO_ACCENT_PALETTE;
  if (!giro) return P[0];
  const seq = Number(giro.seq);
  if (Number.isFinite(seq) && seq >= 1) return P[(Math.floor(seq) - 1) % P.length];
  const id = String(giro.id || "");
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % P.length;
  return P[h];
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

// ManualGiroSalidaRefProxy — orario operativo UNICO del giro (⏱ ready-by), con la
// precedenza approvata (decisione A):
//   hora_ref (operatore)  >  salida_ref (proxy backend-owned)
// Ritorna "HH:MM" o null. null = NESSUN piano giro backend-owned ancora: il
// chiamante può fare fallback al forno_out per-ordine, ma NON deve trattare il
// giro come se avesse un piano proxy valido (nessuna matematica giro nel frontend).
// La UI non calcola mai questo tempo: legge solo il backend.
export const resolveGiroReadyBy = (giro) =>
  (giro && (giro.hora_ref || giro.salida_ref)) || null;

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
