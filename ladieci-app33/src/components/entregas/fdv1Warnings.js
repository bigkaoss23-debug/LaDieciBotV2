// [FDV1 FE final] A4 — le warning di deadline nominano SOLO gli ordini realmente a rischio.
// Il backend (giroWarnings, invariato) con 3+ membri non coerenti restituisce `spread_over_window` con il primo e
// l'ULTIMO membro: l'ultimo (límite più lontano) non è mai a rischio. Qui, sulle deadline della composizione valutata:
//   a rischio = límite già superato (`deadline_passed`) ∪ outlier (`deadline_much_closer`)
//             ∪ membri il cui límite precede quello più lontano di oltre la finestra (`window_min` del backend).
// Ogni warning di deadline viene ristretta a quell'insieme e scartata se resta vuota. Le warning di composizione
// senza deadline (zone diverse, capienza, senza zona, già partito) restano invariate. Nessun orario viene modificato.
import { orderDeadlineMs } from "../cocina/manualGiroCocina";

const DEADLINE_CODES = new Set(["deadline_passed", "deadline_much_closer", "spread_over_window"]);
const RISK_CODES = new Set(["deadline_passed", "deadline_much_closer"]);
const minuteOf = (ms) => Math.floor(ms / 60000);

// members: ordini della composizione valutata ({ id, estado, delivery_deadline_at }).
export const atRiskMemberIds = (warnings = [], members = []) => {
  const out = new Set();
  for (const w of warnings || []) if (w && RISK_CODES.has(w.code)) for (const id of w.member_ids || []) out.add(id);
  const spread = (warnings || []).find((w) => w && w.code === "spread_over_window");
  const win = spread && spread.data && Number(spread.data.window_min);
  if (spread && Number.isFinite(win)) {
    const dl = (members || []).filter((m) => m && m.estado !== "EN_ENTREGA")
      .map((m) => ({ id: m.id, t: orderDeadlineMs(m) })).filter((x) => x.t != null);
    if (dl.length >= 2) {
      const latest = Math.max(...dl.map((x) => minuteOf(x.t)));
      for (const x of dl) if (latest - minuteOf(x.t) > win) out.add(x.id);
    }
  }
  return out;
};

export const filterFdv1Warnings = (warnings = [], members = []) => {
  const risk = atRiskMemberIds(warnings, members);
  const out = [];
  for (const w of warnings || []) {
    if (!w) continue;
    if (!DEADLINE_CODES.has(w.code)) { out.push(w); continue; }
    let ids = (w.member_ids || []).filter((id) => risk.has(id));
    if (w.code === "spread_over_window") {
      // tutti (e solo) i membri a rischio della composizione, in ordine di límite
      const byDl = (members || []).filter((m) => m && risk.has(m.id))
        .sort((a, b) => (orderDeadlineMs(a) ?? 0) - (orderDeadlineMs(b) ?? 0)).map((m) => m.id);
      ids = byDl.length ? byDl : ids;
    }
    if (ids.length) out.push({ ...w, member_ids: ids });
  }
  return out;
};
