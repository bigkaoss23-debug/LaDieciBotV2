// Slice 1 — "prenotazione rilevante" is one shared rule (isRelevantReservation),
// used by tableState (floor fill), the popup's Reserva section, and
// Reservas · Beta's own list. Root cause this guards against: Reservas ·
// Beta had NO date/window filter at all (showed every booking ever made),
// while the floor filtered by date only, with no time-window check --
// exactly what let a stale demo booking still show in Reservas · Beta while
// the table it pointed at had already gone green on the floor.
const { isRelevantReservation } = require("./TabMesa");

const booking = (overrides) => ({
  status: "booked", guestName: "Antonio", coversTotal: 2, durationMinutes: 120,
  ...overrides,
});

test("a booking later today, within its window, is relevant", () => {
  const now = new Date("2026-08-04T19:00:00.000Z");
  const reservedAt = new Date("2026-08-04T20:00:00.000Z").toISOString();
  expect(isRelevantReservation(booking({ reservedAt }), now)).toBe(true);
});

test("a booking from a different date (even close in wall-clock time) is not relevant", () => {
  // Same "45 minutes from some earlier now" that goes stale after the
  // mock/backend has been up long enough to roll past midnight -- the
  // literal Mesa-2-green root cause.
  const now = new Date("2026-08-04T07:30:00.000Z");
  const reservedAt = new Date("2026-08-03T19:45:00.000Z").toISOString();
  expect(isRelevantReservation(booking({ reservedAt }), now)).toBe(false);
});

test("a booking earlier today whose reserved+duration window has fully elapsed is not relevant", () => {
  const now = new Date("2026-08-04T22:30:00.000Z");
  const reservedAt = new Date("2026-08-04T19:45:00.000Z").toISOString(); // + 120min duration ends 21:45, well before now
  expect(isRelevantReservation(booking({ reservedAt, durationMinutes: 120 }), now)).toBe(false);
});

test("a booking earlier today still inside its window (arrived late, hasn't been seated yet) is still relevant", () => {
  const now = new Date("2026-08-04T20:15:00.000Z");
  const reservedAt = new Date("2026-08-04T19:45:00.000Z").toISOString(); // + 120min ends 21:45, now is inside that
  expect(isRelevantReservation(booking({ reservedAt, durationMinutes: 120 }), now)).toBe(true);
});

test("a cancelled or no-show reservation is never relevant, even if the time would otherwise qualify", () => {
  const now = new Date("2026-08-04T19:00:00.000Z");
  const reservedAt = new Date("2026-08-04T20:00:00.000Z").toISOString();
  expect(isRelevantReservation(booking({ reservedAt, status: "cancelled" }), now)).toBe(false);
  expect(isRelevantReservation(booking({ reservedAt, status: "no_show" }), now)).toBe(false);
});

test("a missing/invalid duration falls back to the app's own 2-hour default rather than a zero-length window", () => {
  const now = new Date("2026-08-04T20:30:00.000Z");
  const reservedAt = new Date("2026-08-04T19:45:00.000Z").toISOString();
  expect(isRelevantReservation(booking({ reservedAt, durationMinutes: undefined }), now)).toBe(true);
  expect(isRelevantReservation(booking({ reservedAt, durationMinutes: 0 }), now)).toBe(true);
});
