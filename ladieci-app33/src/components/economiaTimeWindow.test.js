// N-9 — ECONOMÍA TIME-WINDOW CORRECTNESS.
//
// The rows below are REAL rows from the STAGING archive table (Supabase project
// tdikhfeinufaahagmpjz), with their real `ts` values, captured read-only while
// diagnosing this defect. They are the evidence, not a fixture invented to make
// a fix look good:
//
//   order      Madrid local          ts               total    pre-N-9 verdict
//   #369       2026-08-13 10:03      1786608229063     26,00   DROPPED
//   #370       2026-08-13 15:20      1786627255055     40,00   DROPPED
//   #001       2026-08-06 17:28      1786030122914     10,00   DROPPED
//   #369b      2026-08-13 19:38      1786642709767     25,00   DROPPED
//   #002       2026-08-06 19:49      1786038598627     10,00   DROPPED  ← 1 min early
//   #003       2026-08-06 20:00      1786039204290     14,50   kept
//   #374       2026-08-13 20:08      1786644490115     12,50   kept
//   #375       2026-08-13 20:14      1786644884932     14,50   kept
//   #377       2026-08-13 20:23      1786645434692     14,50   kept
//   #379       2026-08-13 20:46      1786646789151     25,00   kept
//
// Pre-N-9, aggrega() ran `hm < 19*60+50 || hm >= 23*60 → return` over these,
// keeping 5 of 10 and dropping 111,00 € of obligations from the product mix,
// the channel split, the delivery split, the time bands, the weekday chart —
// and from the DIVISOR of the ticket medio, whose numerator (the ledger) never
// had any such filter. That last one is why an invisible non-money filter was
// a money bug.
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/economiaTimeWindow.test.js

import { aggrega, sumLedgerWindow } from "./EconomiaPage";
import { madridBusinessDate } from "../economy/businessDay";

// ── accessors ──────────────────────────────────────────────────────────────
// The Economía aggregate's field names are pre-existing legacy vocabulary. They
// are read through these four helpers so the rest of the file can assert in
// plain terms, and so the legacy names appear once each rather than 30 times.

// language-guard: allow-legacy countOrdini is the existing aggregate field name being read, not new vocabulary
const headlineCount = (out) => out.countOrdini;
// language-guard: allow-legacy giorniDettaglio[].ordini is the existing drilldown field name being read, not new vocabulary
const drilldownCount = (out) => out.giorniDettaglio.reduce((s, d) => s + d.ordini, 0);
// language-guard: allow-legacy pagamentiOggi is the existing per-day payment-bucket field name being read, not new vocabulary
const dayPayments = (out) => out.pagamentiOggi;
// language-guard: allow-legacy tipo_consegna/RITIRO are the existing delivery-type field and enum value, not new vocabulary
const DELIVERY_TYPE = { tipo_consegna: "RITIRO" };
// language-guard: allow-legacy incassoOggi is the existing per-day collected-total field name being read, not new vocabulary
const dayTotal = (out) => out.incassoOggi;
// language-guard: allow-legacy pagamenti is the existing window-wide payment-bucket field name being read, not new vocabulary
const windowPayments = (out) => out.pagamenti;

const row = (id, ts, total, extra = {}) => ({
  id, ts, totale: total,
  nombre: "UAT", tel: "600000000", canal: "MANUAL",
  items: [{ n: "Pelusa", e: "🍕", p: total, q: 1, cat: "Pizzas" }],
  nota: "", hora: "", estado: "RETIRADO",
  fecha: madridBusinessDate(new Date(ts)),
  metodo_pago: "efectivo",
  ...DELIVERY_TYPE,
  ...extra,
});

// The real staging population, in ascending time order.
const DAYTIME_AND_EARLY = [
  row("#369",  1786608229063, 26),    // 10:03 — morning
  row("#370",  1786627255055, 40),    // 15:20 — lunch/afternoon
  row("#001",  1786030122914, 10),    // 17:28 — afternoon
  row("#369b", 1786642709767, 25),    // 19:38 — evening, before the old cutoff
  row("#002",  1786038598627, 10),    // 19:49 — ONE MINUTE before the old cutoff
];
const EVENING = [
  row("#003", 1786039204290, 14.5),   // 20:00
  row("#374", 1786644490115, 12.5),   // 20:08
  row("#375", 1786644884932, 14.5),   // 20:14
  row("#377", 1786645434692, 14.5),   // 20:23
  row("#379", 1786646789151, 25),     // 20:46
];
const ALL = [...DAYTIME_AND_EARLY, ...EVENING];

describe("N-9 · Phase 9 · the hidden 19:50–23:00 filter is gone", () => {
  test("A · every real staging row is counted — morning, lunch AND dinner", () => {
    // Pre-N-9 this was 5. There is no longer a second, invisible window.
    expect(headlineCount(aggrega(ALL, {}, false))).toBe(10);
  });

  test("A · the five daytime/early rows are individually present, not just the total", () => {
    // Counted one at a time, so a compensating error cannot hide inside a sum.
    DAYTIME_AND_EARLY.forEach((r) => {
      expect(headlineCount(aggrega([r], {}, false))).toBe(1);
    });
  });

  test("A · the 19:49 row — one minute before an arbitrary threshold — is counted", () => {
    expect(headlineCount(aggrega([row("#002", 1786038598627, 10)], {}, false))).toBe(1);
  });

  test("A · a 23:30 order is counted (the old band also cut the late tail off)", () => {
    // 2026-08-13 23:30 Madrid === 21:30Z.
    const late = row("#late", Date.parse("2026-08-13T21:30:00Z"), 18);
    expect(headlineCount(aggrega([late], {}, false))).toBe(1);
  });

  test("A · a 02:30 order still inside the business day is counted", () => {
    // 2026-08-14 02:30 Madrid === 2026-08-14T00:30Z, business date 2026-08-13.
    const nightcap = row("#tail", Date.parse("2026-08-14T00:30:00Z"), 9);
    expect(madridBusinessDate(new Date(nightcap.ts))).toBe("2026-08-13");
    expect(headlineCount(aggrega([nightcap], {}, false))).toBe(1);
  });
});

describe("N-9 · Phase 12 M · the whole screen sees one population", () => {
  test("the product mix includes daytime items", () => {
    const out = aggrega(ALL, {}, false);
    const pelusa = out.topProdotti.find((p) => p.n === "Pelusa");
    expect(pelusa.q).toBe(10); // 10 rows × 1 unit. Pre-N-9: 5.
  });

  test("channel and delivery-type counts equal the headline count", () => {
    const out = aggrega(ALL, {}, false);
    const byChannel = Object.values(out.canali).reduce((s, n) => s + n, 0);
    const byDelivery = Object.values(out.consegne).reduce((s, n) => s + n, 0);
    expect(byChannel).toBe(headlineCount(out));
    expect(byDelivery).toBe(headlineCount(out));
  });

  test("the drilldown counts the same orders as the headline", () => {
    const out = aggrega(ALL, {}, false);
    // Pre-N-9 the headline used the evening-filtered loop and the drilldown used
    // an UNfiltered one, so these two disagreed on the same screen.
    expect(drilldownCount(out)).toBe(headlineCount(out));
  });

  test("a lunch time band gets a bucket instead of being discarded", () => {
    const lunch = row("#lunch", 1786627255055, 40, { hora: "15:20" });
    const out = aggrega([lunch], {}, false);
    // Pre-N-9 the axis was `h = 19; h < 24`, so 15:00 had nowhere to go.
    expect(out.fasceOrarie["15:00"]).toBe(1);
  });
});

describe("N-9 · Phase 12 M/L · ticket medio and payment methods use ONE window", () => {
  const businessDate = madridBusinessDate(new Date(1786646789151)); // 2026-08-13
  const ledgerByDay = {
    [businessDate]: {
      paymentTotals: { efectivo: 100, tarjeta: 0, bizum: 0, other: 0 },
      totals: { collected: 100, gross: 100, refunded: 0, unpaid: 0 },
    },
  };

  test("ticket medio divides by every order in the window, not just the evening ones", () => {
    const sameDay = ALL.filter((r) => madridBusinessDate(new Date(r.ts)) === businessDate);
    const out = aggrega(sameDay, ledgerByDay, true, businessDate);
    expect(out.incassoTot).toBe(100);
    expect(headlineCount(out)).toBe(sameDay.length);
    expect(out.ticketMedio).toBeCloseTo(100 / sameDay.length, 6);

    // The concrete regression: the ledger numerator was already window-wide
    // while the divisor was evening-only, so the average came out inflated.
    const eveningOnly = sameDay.filter((r) => {
      const d = new Date(r.ts);
      const hm = d.getHours() * 60 + d.getMinutes();
      return hm >= 19 * 60 + 50 && hm < 23 * 60;
    }).length;
    expect(out.ticketMedio).not.toBeCloseTo(100 / eveningOnly, 6);
  });

  test("L · payment-method totals come from the ledger for the selected window", () => {
    const buckets = dayPayments(aggrega(ALL, ledgerByDay, true, businessDate));
    expect(buckets.efectivo.incasso).toBe(100);
    expect(buckets.tarjeta.incasso).toBe(0);
  });
});

describe("N-9 · Phase 12 A/B · Hoy and Ayer are Madrid business days", () => {
  const ledgerByDay = {
    "2026-08-24": { paymentTotals: { efectivo: 10, tarjeta: 0, bizum: 0, other: 0 }, totals: { collected: 10 } },
    "2026-08-25": { paymentTotals: { efectivo: 40, tarjeta: 0, bizum: 0, other: 0 }, totals: { collected: 40 } },
    "2026-08-18": { paymentTotals: { efectivo: 70, tarjeta: 0, bizum: 0, other: 0 }, totals: { collected: 70 } },
  };
  const rows = [row("#x", 1786646789151, 25)];

  test("the day total selects exactly the resolved business date", () => {
    expect(dayTotal(aggrega(rows, ledgerByDay, true, "2026-08-25"))).toBe(40);
  });

  test("the SERVER's business date decides — the same rows yield the previous day's total", () => {
    expect(dayTotal(aggrega(rows, ledgerByDay, true, "2026-08-24"))).toBe(10);
  });

  test("the week is the trailing 7 business days, inclusive of the current one", () => {
    // 08-25 + 08-24 are in; 08-18 is day 8 and is out.
    expect(aggrega(rows, ledgerByDay, true, "2026-08-25").incassoSett).toBe(50);
  });

  test("the month reaches back 30 business days and picks up 08-18", () => {
    expect(aggrega(rows, ledgerByDay, true, "2026-08-25").incassoMese).toBe(120);
  });
});

describe("N-9 · sumLedgerWindow predicate contract", () => {
  const ledgerByDay = {
    "2026-08-24": { paymentTotals: { efectivo: 10, tarjeta: 0, bizum: 0, other: 0 }, totals: { collected: 10 } },
    "2026-08-25": { paymentTotals: { efectivo: 40, tarjeta: 0, bizum: 0, other: 0 }, totals: { collected: 40 } },
  };

  test("the predicate receives the raw business-date string as its 2nd argument", () => {
    const seen = [];
    sumLedgerWindow(ledgerByDay, (_dt, day) => { seen.push(day); return false; });
    expect(seen.sort()).toEqual(["2026-08-24", "2026-08-25"]);
  });

  test("string-based selection needs no Date and cannot drift with the browser timezone", () => {
    const out = sumLedgerWindow(ledgerByDay, (_dt, day) => day === "2026-08-25");
    expect(out.collected).toBe(40);
    expect(windowPayments(out).efectivo.incasso).toBe(40);
  });

  test("the pre-N-9 Date-first predicate signature still works (no caller was broken)", () => {
    const out = sumLedgerWindow(ledgerByDay, (dt) => dt.getDate() === 25 && dt.getMonth() === 7);
    expect(out.collected).toBe(40);
  });
});

describe("N-9 · Phase 12 K · the N-8 ledger gate is untouched", () => {
  test("ledgerReady=false still yields null money, never a row-based figure", () => {
    const out = aggrega(ALL, {}, false);
    expect(out.incassoTot).toBeNull();
    expect(dayTotal(out)).toBeNull();
    expect(out.ticketMedio).toBeNull();
    expect(windowPayments(out)).toBeNull();
    // ...while the non-money fields the filter used to corrupt are available.
    expect(headlineCount(out)).toBe(10);
  });
});
