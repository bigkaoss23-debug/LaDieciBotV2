import { orderDeadlineMs, deadlineState } from './manualGiroCocina';

// ─── [FDV1 R3] Pizzeria: blocchi atomici + packing ────────────────────────────────────────────────────────
// PROBLEMA (§13): la griglia CSS mette il contenitore di un giro su una riga tutta sua (`grid-column: 1 / -1`).
// Risultato: [1 ordine][vuoto][vuoto] e sotto il giro da 3. Buchi enormi, densità inaccettabile su tablet.
//
// ALGORITMO SCELTO — greedy row-fill con bounded lookahead nello stesso SLOT di urgenza.
//   width(blocco)  = 1 per uno standalone, min(cols, n_membri) per un giro (il giro NON si spezza mai:
//                    se n > cols il contenitore occupa tutta la riga e manda a capo INTERNAMENTE — resta
//                    un solo box, quindi un solo blocco visivo).
//   Si riempie una riga alla volta, prendendo i blocchi nell'ordine operativo prodotto da sortKitchenCards.
//   Quando la testa della coda NON entra nello spazio residuo, invece di lasciare il buco si cerca in avanti
//   (max PACK_LOOKAHEAD = 4 blocchi) il primo blocco che entra e la cui urgenza dista dalla testa al massimo
//   PACK_MAX_SLOT_JUMP slot da 10 minuti (≈ 20 min). Quel blocco viene PROMOSSO a riempire il buco.
//
// PERCHÉ È SICURO (§14 — «niente ordine più urgente nascosto più in basso per estetica»):
//   1. la testa della coda non viene MAI ritardata: senza promozione aprirebbe comunque la riga successiva,
//      e con la promozione apre esattamente la stessa riga successiva, nella stessa posizione;
//   2. l'unico effetto è che un blocco MENO urgente sale prima — nessun blocco più urgente scende;
//   3. i blocchi realmente scavalcati sono al massimo PACK_LOOKAHEAD − 1 e arretrano di una sola posizione;
//   4. il salto di urgenza è limitato: un ordine molto più lontano nel tempo non sale mai sopra lavoro urgente
//      solo per chiudere un buco — in quel caso si preferisce lasciare il buco.
//   Con PACK_LOOKAHEAD = 0 il layout degrada al comportamento precedente (nessuna promozione), mai a un
//   ordine operativo sbagliato.

export const PACK_LOOKAHEAD = 4;
export const PACK_SLOT_MS = 10 * 60000;   // stesso slot di urgenza di sortKitchenCards
export const PACK_MAX_SLOT_JUMP = 2;      // ≈ 20 min: oltre, meglio il buco che un ordine fuorviante

export const segmentWidth = (seg, cols) => {
  const n = seg && seg.type === "giro" ? (seg.cards || []).length : 1;
  return Math.max(1, Math.min(Math.max(1, cols), n));
};

// Urgenza del blocco = deadline più urgente tra le sue card (RITIRO / senza deadline → +∞, in fondo).
export const segmentUrgencyMs = (seg) => {
  const cards = seg && seg.type === "giro" ? seg.cards : [seg && seg.card];
  const ms = (cards || []).map(orderDeadlineMs).filter((x) => Number.isFinite(x));
  return ms.length ? Math.min(...ms) : Number.MAX_SAFE_INTEGER;
};

const NO_SLOT = Number.MAX_SAFE_INTEGER;
const slotOf = (seg) => {
  const u = segmentUrgencyMs(seg);
  return u === NO_SLOT ? NO_SLOT : Math.floor(u / PACK_SLOT_MS);
};

// Promozione ammessa solo tra blocchi di urgenza vicina. Un blocco senza deadline (RITIRO) può riempire il
// buco solo di un altro blocco senza deadline: non salta mai sopra lavoro a scadenza.
export const slotCompatible = (headSlot, candSlot) => {
  if (headSlot === NO_SLOT || candSlot === NO_SLOT) return headSlot === candSlot;
  return candSlot - headSlot <= PACK_MAX_SLOT_JUMP && candSlot >= headSlot;
};

// Ritorna i segmenti riordinati per il packing + la larghezza di ciascuno.
// Nessun dato viene modificato: è puramente una proiezione di layout.
export const packKitchenSegments = (segments = [], cols = 3, { lookahead = PACK_LOOKAHEAD } = {}) => {
  const C = Math.max(1, Number(cols) || 1);
  const queue = [...(segments || [])];
  const out = [];
  while (queue.length) {
    let left = C;
    let placedInRow = 0;
    while (left > 0 && queue.length) {
      const head = queue[0];
      const wHead = segmentWidth(head, C);
      if (wHead <= left) {
        queue.shift();
        out.push({ seg: head, width: wHead });
        left -= wHead;
        placedInRow += 1;
        continue;
      }
      // la testa non entra: cerco un riempitivo compatibile, senza ritardare la testa
      const headSlot = slotOf(head);
      let pick = -1;
      for (let i = 1; i < queue.length && i <= lookahead; i += 1) {
        if (segmentWidth(queue[i], C) > left) continue;
        if (!slotCompatible(headSlot, slotOf(queue[i]))) continue;
        pick = i; break;
      }
      if (pick < 0) break;                       // nessun riempitivo sicuro → si chiude la riga
      const [filler] = queue.splice(pick, 1);
      out.push({ seg: filler, width: segmentWidth(filler, C) });
      left -= segmentWidth(filler, C);
      placedInRow += 1;
    }
    if (!placedInRow && queue.length) {          // salvagente: blocco più largo della riga → riga propria
      const s = queue.shift();
      out.push({ seg: s, width: C });
    }
  }
  return out;
};

// Righe risultanti (solo per i test / le fixture): [[{seg,width}...], ...]
export const packRows = (packed = [], cols = 3) => {
  const C = Math.max(1, Number(cols) || 1);
  const rows = [];
  let row = [], left = C;
  for (const p of packed) {
    if (p.width > left) { if (row.length) rows.push(row); row = []; left = C; }
    row.push(p); left -= p.width;
  }
  if (row.length) rows.push(row);
  return rows;
};

// ─── Identità del blocco (§9 colore, §10 orario unico, §11 countdown, §12 pickup) ─────────────────────────
// Un blocco prende il colore della zona quando TUTTE le sue card sono della stessa zona. Se le zone sono
// diverse non si inventa una zona: il blocco è "VARIAS ZONAS" (neutro dedicato) e ogni card conserva la
// propria banda/badge di zona.
export const blockZone = (cards = [], zoneOf) => {
  const zs = (cards || []).map(zoneOf);
  if (!zs.length) return null;
  const first = zs[0];
  return zs.every((z) => z && first && z.id === first.id) ? first : { mixed: true };
};

// Orario operativo del blocco = riferimento del membro PIÙ URGENTE, con lo stato temporale già in uso
// (normal / near = URGENTE / late = TARDE). Non è un nuovo timestamp di business: è lo stesso
// delivery_deadline_at che la Pizzeria usa già per la singola card, preso al minimo sul blocco.
export const blockDeadline = (cards = [], nowMs) => {
  const live = (cards || []).filter((c) => Number.isFinite(orderDeadlineMs(c)));
  if (!live.length) return null;
  const most = live.reduce((a, b) => (orderDeadlineMs(a) <= orderDeadlineMs(b) ? a : b));
  return deadlineState(most, nowMs);
};

// Countdown = PROIEZIONE VISIVA dello stesso timestamp: nessun secondo orologio di business.
export const countdownLabel = (deadlineMs, nowMs) => {
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) return null;
  const min = Math.round((deadlineMs - nowMs) / 60000);
  if (min < 0) return { text: `${Math.abs(min)} min tarde`, late: true, minutes: min };
  if (min === 0) return { text: "ahora", late: false, minutes: 0 };
  return { text: `faltan ${min} min`, late: false, minutes: min };
};
