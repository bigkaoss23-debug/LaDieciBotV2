// Snooze visivo per-card DOMICILIO.
// L'operatore in cucina sposta il countdown di +5 min cumulativi (max +20).
// `ui_offset_min` vive su `ordenes` (campo DB, persistente a F5).
// I dati veri (`hora`, `forno_out`) restano intatti — qui solo display.

export const UI_OFFSET_STEP = 5;
export const UI_OFFSET_MAX  = 20;

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
  return `${String(Math.floor(tot / 60)).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}`;
};

// Wrapper: applica l'offset al forno_out di un ordine.
// Usato dai componenti che mostrano countdown / ordinano per uscita forno.
export const fornoOutConOffset = (o) => {
  if (!o?.forno_out) return o?.forno_out;
  return applyUiOffset(o.forno_out, o.ui_offset_min);
};
