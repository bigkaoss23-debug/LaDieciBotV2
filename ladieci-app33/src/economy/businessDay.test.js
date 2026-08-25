// N-9 — the reporting calendar. Europe/Madrid, business day 04:00 → 04:00.
//
// These tests pin the FE helper to the SAME answers the backend's
// serviceSchedule.businessDateFor()/economicWindow.businessDayStart() give, so
// the "FE computes one window, BE computes another" failure mode is a test
// failure rather than a silent one-day/one-hour disagreement in production.
//
// Run: CI=true npx react-scripts test --watchAll=false src/economy/businessDay.test.js

import {
  REPORTING_TIMEZONE,
  BUSINESS_DAY_ROLLOVER_MIN,
  madridBusinessDate,
  shiftBusinessDate,
  withinLastBusinessDays,
} from "./businessDay";

// A Madrid wall-clock instant, expressed as the UTC instant it really is.
const utc = (iso) => new Date(iso);

describe("N-9 · reporting timezone is explicit", () => {
  test("Europe/Madrid, 04:00 rollover — never the browser's timezone, never UTC", () => {
    expect(REPORTING_TIMEZONE).toBe("Europe/Madrid");
    expect(BUSINESS_DAY_ROLLOVER_MIN).toBe(4 * 60);
  });
});

describe("N-9 · F/G · summer (CEST, UTC+2) and winter (CET, UTC+1) offsets", () => {
  test("SUMMER: 13:30 Madrid on 2026-08-25 is business date 2026-08-25", () => {
    // 13:30 CEST === 11:30Z
    expect(madridBusinessDate(utc("2026-08-25T11:30:00Z"))).toBe("2026-08-25");
  });

  test("SUMMER: 03:30 Madrid still belongs to the PREVIOUS business date", () => {
    // 03:30 CEST === 01:30Z on the 26th
    expect(madridBusinessDate(utc("2026-08-26T01:30:00Z"))).toBe("2026-08-25");
  });

  test("SUMMER: 04:00 Madrid exactly starts the new business date (inclusive bound)", () => {
    expect(madridBusinessDate(utc("2026-08-26T02:00:00Z"))).toBe("2026-08-26");
  });

  test("WINTER: 13:30 Madrid on 2026-01-15 is business date 2026-01-15", () => {
    // 13:30 CET === 12:30Z — one hour different from the summer case above,
    // and getting this wrong by a hardcoded UTC+1/UTC+2 is exactly the bug.
    expect(madridBusinessDate(utc("2026-01-15T12:30:00Z"))).toBe("2026-01-15");
  });

  test("WINTER: 03:30 Madrid still belongs to the previous business date", () => {
    expect(madridBusinessDate(utc("2026-01-16T02:30:00Z"))).toBe("2026-01-15");
  });

  test("WINTER: 04:00 Madrid exactly starts the new business date", () => {
    expect(madridBusinessDate(utc("2026-01-16T03:00:00Z"))).toBe("2026-01-16");
  });
});

describe("N-9 · H · DST transition days", () => {
  test("spring-forward (2026-03-29 02:00→03:00): the 23-hour day keeps one date", () => {
    // 01:30Z on the 29th is 02:30 CET... which does not exist; the clock has
    // already jumped to 03:30 CEST. Either way it is business date 2026-03-29
    // only once 04:00 local has passed — before that it is still the 28th.
    expect(madridBusinessDate(utc("2026-03-29T00:30:00Z"))).toBe("2026-03-28"); // 01:30 CET
    expect(madridBusinessDate(utc("2026-03-29T01:30:00Z"))).toBe("2026-03-28"); // 03:30 CEST
    expect(madridBusinessDate(utc("2026-03-29T02:00:00Z"))).toBe("2026-03-29"); // 04:00 CEST
  });

  test("fall-back (2026-10-25 03:00→02:00): the ambiguous hour never duplicates a date", () => {
    expect(madridBusinessDate(utc("2026-10-25T00:30:00Z"))).toBe("2026-10-24"); // 02:30 CEST
    expect(madridBusinessDate(utc("2026-10-25T01:30:00Z"))).toBe("2026-10-24"); // 02:30 CET (repeat)
    expect(madridBusinessDate(utc("2026-10-25T03:00:00Z"))).toBe("2026-10-25"); // 04:00 CET
  });

  test("shiftBusinessDate is calendar arithmetic, not ±24h — it cannot drift across DST", () => {
    expect(shiftBusinessDate("2026-03-29", -1)).toBe("2026-03-28");
    expect(shiftBusinessDate("2026-03-28", 1)).toBe("2026-03-29");
    expect(shiftBusinessDate("2026-10-25", -1)).toBe("2026-10-24");
    expect(shiftBusinessDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftBusinessDate("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("N-9 · A/B · Hoy and Ayer", () => {
  const today = "2026-08-25";

  test("Hoy includes morning, lunch AND dinner of the same business day", () => {
    // 09:15, 13:44 and 21:30 Madrid — all one business date. The pre-N-9 code
    // would have kept only the last of these.
    expect(madridBusinessDate(utc("2026-08-25T07:15:00Z"))).toBe(today);
    expect(madridBusinessDate(utc("2026-08-25T11:44:00Z"))).toBe(today);
    expect(madridBusinessDate(utc("2026-08-25T19:30:00Z"))).toBe(today);
  });

  test("Hoy also owns the after-midnight tail up to 03:59 Madrid", () => {
    expect(madridBusinessDate(utc("2026-08-26T00:30:00Z"))).toBe(today); // 02:30
  });

  test("Ayer is the previous business date and nothing else", () => {
    const ayer = shiftBusinessDate(today, -1);
    expect(ayer).toBe("2026-08-24");
    expect(withinLastBusinessDays(ayer, ayer, 1)).toBe(true);
    expect(withinLastBusinessDays(today, ayer, 1)).toBe(false);
  });
});

describe("N-9 · withinLastBusinessDays — deterministic, inclusive of today", () => {
  const today = "2026-08-25";

  test("7-day window covers today back to today-6, and excludes today-7", () => {
    expect(withinLastBusinessDays("2026-08-25", today, 7)).toBe(true);
    expect(withinLastBusinessDays("2026-08-19", today, 7)).toBe(true);
    expect(withinLastBusinessDays("2026-08-18", today, 7)).toBe(false);
  });

  test("a future day is never inside a trailing window", () => {
    expect(withinLastBusinessDays("2026-08-26", today, 7)).toBe(false);
  });

  test("30-day window boundary", () => {
    expect(withinLastBusinessDays("2026-07-27", today, 30)).toBe(true);
    expect(withinLastBusinessDays("2026-07-26", today, 30)).toBe(false);
  });

  test("missing inputs are false, never a silent 'true'", () => {
    expect(withinLastBusinessDays(null, today, 7)).toBe(false);
    expect(withinLastBusinessDays("2026-08-25", null, 7)).toBe(false);
  });
});
