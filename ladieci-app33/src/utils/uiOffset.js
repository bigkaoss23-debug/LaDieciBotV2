// Snooze visivo per-card DOMICILIO.
// L'operatore in cucina sposta il countdown di +5 min cumulativi (max +20).
// `ui_offset_min` vive su `ordenes` (campo DB, persistente a F5).
// I dati veri (`hora`, `forno_out`) restano intatti — qui solo display.

export const UI_OFFSET_STEP = 5;
export const UI_OFFSET_MAX  = 30;   // [FDV1] contratto v1 (BE eee119e): −30..+30 — fallback se il BE non espone priorityContract
// [FDV1 R3] contratto v2 (BE priorityContract): range teorico −50..+50. Il + è applicabile finché il target di
// produzione resta ENTRO la HORA LÍMITE reale (per un giro: quella del membro più urgente).
// NESSUN buffer artificiale: gli ultimi minuti prima del límite sono URGENTE — uno stato VISIVO, non una zona
// vietata. Un ordine appena entrato (deadline ts+55) può legittimamente prendere +50 e restare con 5 minuti.
// Solo il superamento reale del límite (TARDE) azzera la finestra.
export const PRIORITY_STEPS_ALL = [5, 10, 15, 20, 30, 40, 50];
export const PRIORITY_MARGIN_MIN = 0;
export const CONTRACT_V1 = Object.freeze({ version: 1, min: -30, max: 30, margin_min: PRIORITY_MARGIN_MIN });

// Aggiunge N minuti a una stringa "HH:MM". Ritorna null se input invalido.
export const applyUiOffset = (hhmm, offsetMin) => {
  if (!hhmm) return hhmm;
  const off = Number(offsetMin) || 0;
  if (off === 0) return hhmm;
  const [h, m] = String(hhmm).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  let tot = h * 60 + m + off;
  if (tot < 0) tot = 0;
  if (tot >= 24 * 60) tot = 24 * 60 - 1;
  return `${String(Math.floor(tot/60)%24).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}`;
};

// Wrapper: applica l'offset al forno_out di un ordine.
// Usato dai componenti che mostrano countdown / ordinano per uscita forno.
export const fornoOutConOffset = (o) => {
  if (!o?.forno_out) return o?.forno_out;
  return applyUiOffset(o.forno_out, o.ui_offset_min);
};
