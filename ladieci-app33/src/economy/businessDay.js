// ===============================================================
// businessDay.js — N-9 ECONOMÍA TIME-WINDOW CORRECTNESS
//
// The frontend's ONLY legitimate reporting-calendar helper.
//
// WHY THIS EXISTS. Economía used to decide what "hoy" meant with
// `new Date(); setHours(0,0,0,0)` — the operator's BROWSER midnight, in the
// operator's BROWSER timezone — and then compared that against
// `service_sessions.business_date` keys, which are Europe/Madrid BUSINESS dates
// that turn over at 04:00 Madrid. Two different calendars, silently equated.
// language-guard: allow-legacy the Caja reader's existing exported name is quoted on the next line as the defect's location, not new vocabulary
// Separately, `api.getSerata()` mixed `toISOString()` (a UTC date) with
// `getHours()` (a browser-local hour) in the same predicate.
//
// THE AUTHORITY IS THE BACKEND. `getEconomiaLedger` now returns the interval it
// actually resolved (`window.businessDateToday`, `window.from/to`, `timezone`),
// and every caller here MUST prefer that value. The functions below exist for
// exactly two jobs the server value cannot do:
//   1. a Madrid-correct default for the render that happens BEFORE the ledger
//      response lands (previously that render used browser midnight);
//   2. pure calendar arithmetic on the YYYY-MM-DD business-date STRINGS the
//      ledger is keyed by, so "last 7 days" never goes through a Date and can
//      never drift by an hour across a DST change.
//
// They restate serviceSchedule.DEFAULT_SCHEDULE.rolloverMin (04:00) and
// TIMEZONE ("Europe/Madrid"); `businessDay.test.js` pins them to the same
// answers the backend gives (see the backend's own
// tests/n9EconomiaLedgerWindow.test.js for the other half of that pair).
// ===============================================================

export const REPORTING_TIMEZONE = "Europe/Madrid";

// serviceSchedule.DEFAULT_SCHEDULE.rolloverMin — the instant the business day
// turns over. 03:59 Madrid still belongs to the PREVIOUS business date.
export const BUSINESS_DAY_ROLLOVER_MIN = 4 * 60;

const MADRID_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: REPORTING_TIMEZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

// Wall-clock parts of `at` as seen in Europe/Madrid. Intl does the DST work;
// no offset is ever hardcoded.
const madridParts = (at) => {
  const p = {};
  MADRID_PARTS.formatToParts(at).forEach(({ type, value }) => { p[type] = value; });
  const hour = Number(p.hour) % 24; // en-GB renders midnight as "24" in some engines
  return {
    dateStr: `${p.year}-${p.month}-${p.day}`,
    minutesOfDay: hour * 60 + Number(p.minute),
  };
};

// The business date `at` falls in. Mirrors the backend's businessDateFor().
export const madridBusinessDate = (at = new Date()) => {
  const { dateStr, minutesOfDay } = madridParts(at);
  if (minutesOfDay >= BUSINESS_DAY_ROLLOVER_MIN) return dateStr;
  return shiftBusinessDate(dateStr, -1);
};

// Calendar arithmetic on the DATE STRING, deliberately not "+/- 24h on an
// instant": across a DST change a business day is 23 or 25 hours long, so
// instant arithmetic drifts. UTC is used purely as a calendar here — it never
// implies UTC reporting semantics.
export function shiftBusinessDate(dateStr, days) {
  const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return String(dateStr);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Inclusive membership on business-date strings: `day` within the last
// `days` business dates counting `today` as day 1. Pure string compare —
// YYYY-MM-DD sorts lexicographically the same way it sorts chronologically.
export const withinLastBusinessDays = (day, today, days) => {
  if (!day || !today) return false;
  const first = shiftBusinessDate(today, -(days - 1));
  const k = String(day).slice(0, 10);
  return k >= first && k <= String(today).slice(0, 10);
};

// Formats a business-date string for display. Never re-parses through a
// browser-local Date, so the label can't slip a day.
export const formatBusinessDate = (day) => {
  const k = String(day || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return k;
  const [y, m, d] = k.split("-");
  return `${d}/${m}/${y}`;
};
