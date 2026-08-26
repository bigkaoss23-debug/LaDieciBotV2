// mesaFormat — the tiny pure display formatters shared by TabMesa.jsx and
// MesaPaymentsList.jsx. Extracted (not duplicated) so a refund UI living in
// its own file can render the same euro/clock formatting as the rest of
// Mesa without TabMesa.jsx importing it back (which would be circular, since
// TabMesa.jsx renders MesaPaymentsList).

export const MADRID_TIMEZONE = "Europe/Madrid";

export const euro = (value) => new Intl.NumberFormat("es-ES", {
  style: "currency", currency: "EUR", minimumFractionDigits: 2,
}).format(Number(value) || 0);

export function madridFields(value = new Date()) {
  const out = {};
  new Intl.DateTimeFormat("en-GB", {
    timeZone: MADRID_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(value instanceof Date ? value : new Date(value)).forEach((part) => {
    if (part.type !== "literal") out[part.type] = part.value;
  });
  return {
    date: `${out.year}-${out.month}-${out.day}`,
    time: `${String(Number(out.hour) % 24).padStart(2, "0")}:${out.minute}`,
  };
}

// turns undefined into "now", and it happily converts null into the Unix
// epoch (both would print a plausible-looking wrong time instead of an
// honest blank), and it throws on an unparsable string. All three cases are
// guarded here explicitly rather than trusted to fall through.
export function formatClockTime(value) {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return madridFields(date).time;
}
