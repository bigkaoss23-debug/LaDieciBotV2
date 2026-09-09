// calendarPeriods.js — periodi di CALENDARIO per Economía, fuso Europe/Madrid.
//
// Semantica congelata:
//   DÍA    = giorno di calendario locale            [00:00, 00:00 del giorno dopo)
//   SEMANA = settimana di calendario, lunedì→lunedì  [lun 00:00, lun+7 00:00)
//   MES    = mese di calendario, primo→primo         [gg-01, mese+1 gg-01)
//   TODO   = tutto lo storico valido (nessun limite di data)
//
// NON sono finestre mobili (niente now−7·24h / now−30·24h).
//
// `storico.fecha` è già la data-servizio in ISO `YYYY-MM-DD` e — verificato
// read-only sull'intero storico produzione (1454/1454 righe) — coincide sempre
// col giorno di calendario Europe/Madrid del timestamp. La usiamo come chiave di
// periodo con confronto lessicografico: nessuna riconversione da epoch, nessun
// problema di ora legale (le date di calendario non hanno DST).
//
// Nessuna libreria: solo Intl per leggere "oggi" a Madrid, poi aritmetica su
// Date UTC (che non ha ora legale) per spostarsi di N giorni.
//
// CJS come serviceClock.js/uiOffset.js: import ESM dal frontend via interop
// webpack, `require()` diretto per i test Node puri.

const MADRID_TZ = "Europe/Madrid";

// Formatter riusato (la costruzione di Intl.DateTimeFormat non è gratis e
// madridDayKey può essere chiamata in loop su liste di ordini).
let _madridFmt = null;
const madridFmt = () => {
  if (!_madridFmt) {
    _madridFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: MADRID_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  return _madridFmt;
};

// "YYYY-MM-DD" del giorno di calendario Europe/Madrid per un Date (default: adesso).
const madridDayKey = (d = new Date()) => {
  try {
    // en-CA formatta come "YYYY-MM-DD"
    return madridFmt().format(d instanceof Date ? d : new Date(d));
  } catch (e) {
    // Ambiente senza dati fuso (raro): ricadi sul locale runtime.
    const x = d instanceof Date ? d : new Date(d);
    return (
      x.getFullYear() +
      "-" +
      String(x.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(x.getDate()).padStart(2, "0")
    );
  }
};

// Valida una chiave "YYYY-MM-DD"; ritorna [y, m, d] numerici o null.
const parseKey = (key) => {
  const m = String(key || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return [y, mm, dd];
};

// Somma n giorni (anche negativi) a una chiave "YYYY-MM-DD", restando su date di
// calendario. Si lavora in UTC apposta: UTC non ha ora legale, quindi "+1 giorno"
// è sempre esattamente 24h e non salta né duplica un giorno alle transizioni DST.
const addDaysKey = (key, n) => {
  const p = parseKey(key);
  if (!p) return null;
  const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  dt.setUTCDate(dt.getUTCDate() + Number(n || 0));
  return (
    dt.getUTCFullYear() +
    "-" +
    String(dt.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(dt.getUTCDate()).padStart(2, "0")
  );
};

// Sposta una chiave "YYYY-MM-DD" di n mesi (anche negativi) e ancora al giorno 1
// del mese risultante. Usata dalla navigazione MES (i periodi mese sono
// [gg-01, mese+1 gg-01) — il giorno di partenza è irrilevante).
const addMonthsKey = (key, n) => {
  const p = parseKey(key);
  if (!p) return null;
  const total = p[0] * 12 + (p[1] - 1) + Number(n || 0);
  const y = Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12; // resto sempre 0..11 anche per total negativi
  return y + "-" + String(m + 1).padStart(2, "0") + "-01";
};

// Giorno della settimana ISO per una chiave "YYYY-MM-DD": 1 = lunedì … 7 = domenica.
const isoWeekdayOfKey = (key) => {
  const p = parseKey(key);
  if (!p) return null;
  const wd = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); // 0=dom … 6=sab
  return wd === 0 ? 7 : wd;
};

// Intervallo [start, end) del periodo attivo come chiavi "YYYY-MM-DD".
//   periodo: "sett" | "mese" | "serata"/"tutto"/altro
//   refKey : giorno di riferimento (default: oggi a Madrid)
// Per "sett"/"mese" ritorna i confini di calendario; per tutto il resto
// ritorna { start: null, end: null } = nessun limite (usato da "Todo").
const periodRange = (periodo, refKey) => {
  const ref = parseKey(refKey) ? refKey : madridDayKey();

  if (periodo === "sett") {
    const start = addDaysKey(ref, -(isoWeekdayOfKey(ref) - 1)); // lunedì della settimana
    return { start, end: addDaysKey(start, 7) };
  }

  if (periodo === "mese") {
    const p = parseKey(ref);
    const start = p[0] + "-" + String(p[1]).padStart(2, "0") + "-01";
    const end =
      p[1] === 12
        ? p[0] + 1 + "-01-01"
        : p[0] + "-" + String(p[1] + 1).padStart(2, "0") + "-01";
    return { start, end };
  }

  return { start: null, end: null };
};

// Chiave giorno di una riga storico: usa `fecha` ISO (fonte canonica); fallback
// difensivo su `ts` → giorno Madrid per eventuali righe legacy senza `fecha`.
const rowDayKey = (r) => {
  const raw = String((r && r.fecha) || "");
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const ts = Number((r && r.ts) || 0);
  if (ts > 0) return madridDayKey(new Date(ts < 1e12 ? ts * 1000 : ts));
  return "";
};

// La riga appartiene al periodo? start incluso, end escluso.
// range { start:null, end:null } (Todo) → sempre true.
const rowInPeriod = (r, range) => {
  if (!range || (!range.start && !range.end)) return true;
  const k = rowDayKey(r);
  if (!k) return false;
  return k >= range.start && k < range.end;
};

module.exports = {
  MADRID_TZ,
  madridDayKey,
  addDaysKey,
  addMonthsKey,
  isoWeekdayOfKey,
  periodRange,
  rowDayKey,
  rowInPeriod,
};
