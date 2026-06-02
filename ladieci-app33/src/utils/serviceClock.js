// serviceClock.js — helper orario "service-day-aware" per la cucina.
//
// Il servizio La Dieci attraversa la mezzanotte: un orario 00:08 visto di
// pomeriggio/sera appartiene alla NOTTE in arrivo, non a "oggi già passato".
//
// BUG-COCINA-COUNTDOWN-SERVICE-DAY-00XX-01 (fix 2026-06-02):
// la regola precedente rollava i target 00:xx a domani SOLO se now >= 18:00
// (SERVICE_EVENING_START_MIN). Aprendo Cocina prima delle 18:00 (prep
// pomeridiana) — o con ordini Q5 after-midnight già a sistema — un
// forno_out 00:08/00:27 veniva letto come "oggi 00:08" → ~17h nel passato →
// countdown tipo -1049 min e falso "TARDE".
//
// Fix: rolliamo il target after-midnight (00:00–03:59) a DOMANI per qualunque
// `now` fuori dalla finestra after-midnight (>= 04:00), mantenendo "oggi" solo
// quando anche `now` è 00:00–03:59 — così un ordine davvero in ritardo nella
// coda notturna resta correttamente TARDE.

// 00:00–03:59 appartiene al servizio serale (coda dopo mezzanotte).
const SERVICE_ROLLOVER_CUTOFF_MIN = 4 * 60;

const toDateFromNowInput = (now) => {
  if (now instanceof Date) return new Date(now.getTime());
  if (typeof now === "number" && Number.isFinite(now)) return new Date(now);
  return new Date();
};

// "HH:MM" -> minuti dalla mezzanotte (0..1439). null se non valido.
const parseHoraToMin = (horaStr) => {
  if (!horaStr || typeof horaStr !== "string") return null;
  const m = horaStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return ((hh % 24) * 60) + mm;
};

// Converte "HH:MM" nell'epoch-ms della sua occorrenza nel service-day corrente
// relativo a `now` (Date | number ms | undefined → adesso).
const orarioToMs = (horaStr, now = Date.now()) => {
  const targetMin = parseHoraToMin(horaStr);
  if (targetMin == null) return null;

  const base = toDateFromNowInput(now);
  const nowMin = base.getHours() * 60 + base.getMinutes();
  const d = new Date(base.getTime());
  d.setHours(Math.floor(targetMin / 60), targetMin % 60, 0, 0);

  // Target after-midnight visto quando now NON è after-midnight → notte in arrivo.
  if (targetMin < SERVICE_ROLLOVER_CUTOFF_MIN && nowMin >= SERVICE_ROLLOVER_CUTOFF_MIN) {
    d.setDate(d.getDate() + 1);
  }

  return d.getTime();
};

// CJS export per consentire test Node puro (no Jest, no transpiler).
// L'import frontend ESM (`import { orarioToMs } from ...`) funziona via interop webpack.
module.exports = { SERVICE_ROLLOVER_CUTOFF_MIN, parseHoraToMin, orarioToMs };
