// S2-7D6E4 — Economía's money figures must come from the ledger (order_financial_events,
// via the backend's getEconomiaLedger action) and ONLY from the ledger. There is no
// row-based fallback left: aggrega()/buildCajaStats() take an explicit `ledgerReady` flag
// and return `null` for every money field whenever it is false — never a metodo_pago
// bucket over raw rows, and never a silent 0 while the real figure is still loading.
//
// This is the exact incident that was proven live on staging: an order with
// metodo_pago=efectivo, cobrado=false and ZERO order_financial_events rows still showed
// as "12,00€" collected, because Economía summed `totale` into a bucket keyed only by
// `metodo_pago`. Component-level coverage of the loading/error/retry UI lives in
// economiaLedgerGate.test.js; this file covers the pure aggregation functions.
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/economiaLedgerOverride.test.js

import { aggrega, buildCajaStats, sumLedgerWindow } from "./EconomiaPage";

const row = (o = {}) => ({
  id: "#901", nombre: "Test", tel: "600000000", canal: "MANUAL",
  items: [], nota: "", hora: "20:30", estado: "RETIRADO",
  totale: 12, fecha: "2026-07-27", giorno: "Lunes", fascia: "20:30",
  ts: new Date(2026, 6, 27, 20, 30, 0).getTime(),
  tipo_consegna: "RITIRO", metodo_pago: "", ...o,
});

describe("Economía ledger gate — ledgerReady=false must never emit a money value", () => {
  test("aggrega(): every money field is null while the ledger is loading, even with a metodo_pago=efectivo row", () => {
    const rows = [row({ metodo_pago: "efectivo" })];
    const out = aggrega(rows, {}, false);
    expect(out.incassoTot).toBeNull();
    expect(out.incassoOggi).toBeNull();
    expect(out.incassoSett).toBeNull();
    expect(out.incassoMese).toBeNull();
    expect(out.ticketMedio).toBeNull();
    expect(out.pagamenti).toBeNull();
    expect(out.pagamentiOggi).toBeNull();
    expect(out.pagamentiSett).toBeNull();
    expect(out.pagamentiMese).toBeNull();
    out.giorniDettaglio.forEach((d) => expect(d.incasso).toBeNull());
    // Non-money fields still work — they aren't the bug and must keep functioning.
    expect(out.countOrdini).toBe(1);
  });

  test("aggrega(): still null even if ledgerByDay happens to hold data — ledgerReady is the ONLY gate, not map non-emptiness", () => {
    const rows = [row({ metodo_pago: "efectivo" })];
    const ledgerByDay = {
      "2026-07-27": { paymentTotals: { efectivo: 12, tarjeta: 0, bizum: 0, other: 0 }, totals: { collected: 12, gross: 12, refunded: 0, unpaid: 0 } },
    };
    // ledgerReady explicitly false: e.g. a stale ledgerByDay from a previous successful
    // fetch, while a later retry is currently in flight. Must still emit null, not the
    // stale (or any) number.
    const out = aggrega(rows, ledgerByDay, false);
    expect(out.incassoTot).toBeNull();
    expect(out.pagamenti).toBeNull();
  });

  test("buildCajaStats(): incasso/pagamenti/ticketMedio are all null while not ready, regardless of the row's metodo_pago", () => {
    const rows = [row({ metodo_pago: "tarjeta" })];
    const out = buildCajaStats(rows, undefined, false);
    expect(out.incasso).toBeNull();
    expect(out.pagamenti).toBeNull();
    expect(out.ticketMedio).toBeNull();
    expect(out.countOrdini).toBe(1); // non-money, still available
  });
});

describe("Economía ledger gate — ledgerReady=true emits ledger-derived values, never metodo_pago", () => {
  test("case 1 — a row with a real ledger payment reports the ledger amount", () => {
    const rows = [row({ metodo_pago: "efectivo" })];
    const ledgerByDay = {
      "2026-07-27": {
        paymentTotals: { efectivo: 12, tarjeta: 0, bizum: 0, other: 0 },
        totals: { gross: 12, collected: 12, refunded: 0, unpaid: 0 },
      },
    };
    const out = aggrega(rows, ledgerByDay, true);
    expect(out.incassoTot).toBe(12);
    expect(out.pagamenti.efectivo.incasso).toBe(12);
    expect(out.giorniDettaglio[0].incasso).toBe(12);
  });

  test("case 2 — metodo_pago=efectivo but NO ledger event for that day reports a CONFIRMED 0, not null and not the row total", () => {
    const rows = [row({ metodo_pago: "efectivo" })];
    const ledgerByDay = {
      "2026-07-27": {
        paymentTotals: { efectivo: 0, tarjeta: 0, bizum: 0, other: 0 },
        totals: { gross: 12, collected: 0, refunded: 0, unpaid: 12 },
      },
    };
    const out = aggrega(rows, ledgerByDay, true);
    expect(out.incassoTot).toBe(0);
    expect(out.pagamenti.efectivo.incasso).toBe(0);
    expect(out.giorniDettaglio[0].incasso).toBe(0);
  });

  test("case 2b — ready, but the day has NO entry in ledgerByDay at all: still a confirmed 0, not null", () => {
    const rows = [row({ metodo_pago: "efectivo" })];
    const out = aggrega(rows, {}, true); // ready, empty map (e.g. a slow day/month)
    expect(out.incassoTot).toBe(0);
    expect(out.pagamenti.efectivo.incasso).toBe(0);
  });

  test("case 3 — a payment netted against a refund shows the net", () => {
    const rows = [row({ metodo_pago: "efectivo" })];
    const ledgerByDay = {
      "2026-07-27": {
        paymentTotals: { efectivo: 7, tarjeta: 0, bizum: 0, other: 0 },
        totals: { gross: 12, collected: 7, refunded: 5, unpaid: 0 },
      },
    };
    const out = aggrega(rows, ledgerByDay, true);
    expect(out.incassoTot).toBe(7);
    expect(out.pagamenti.efectivo.incasso).toBe(7);
  });

  test("ticketMedio always divides the SAME total displayed as incassoTot", () => {
    const rows = [row({ metodo_pago: "efectivo" }), row({ id: "#902", metodo_pago: "efectivo" })];
    const ledgerByDay = {
      "2026-07-27": { paymentTotals: { efectivo: 0, tarjeta: 0, bizum: 0, other: 0 }, totals: { gross: 24, collected: 0, refunded: 0, unpaid: 24 } },
    };
    const out = aggrega(rows, ledgerByDay, true);
    expect(out.ticketMedio).toBe(out.incassoTot / out.countOrdini);
    expect(out.ticketMedio).toBe(0);
  });

  test("buildCajaStats (single-day Caja view) uses the ledger entry for that day, ignoring metodo_pago", () => {
    const rows = [row({ metodo_pago: "efectivo" })];
    const ledgerEntry = {
      paymentTotals: { efectivo: 0, tarjeta: 0, bizum: 0, other: 0 },
      totals: { collected: 0, unpaid: 12, gross: 12, refunded: 0 },
    };
    const out = buildCajaStats(rows, ledgerEntry, true);
    expect(out.incasso).toBe(0);
    expect(out.pagamenti.efectivo.incasso).toBe(0);
  });

  test("buildCajaStats: ready but no entry for this day is a confirmed 0, not the row-based total", () => {
    const rows = [row({ metodo_pago: "tarjeta" })];
    const out = buildCajaStats(rows, undefined, true);
    expect(out.incasso).toBe(0);
    expect(out.pagamenti.tarjeta.incasso).toBe(0);
  });
});

describe("sumLedgerWindow", () => {
  test("sums only days matching the predicate", () => {
    const ledgerByDay = {
      "2026-07-20": { paymentTotals: { efectivo: 5, tarjeta: 0, bizum: 0, other: 0 }, totals: { collected: 5 } },
      "2026-07-27": { paymentTotals: { efectivo: 12, tarjeta: 0, bizum: 0, other: 0 }, totals: { collected: 12 } },
    };
    const onlyToday = sumLedgerWindow(ledgerByDay, (dt) => dt.getFullYear() === 2026 && dt.getMonth() === 6 && dt.getDate() === 27);
    expect(onlyToday.collected).toBe(12);
    expect(onlyToday.pagamenti.efectivo.incasso).toBe(12);

    const both = sumLedgerWindow(ledgerByDay, () => true);
    expect(both.collected).toBe(17);
    expect(both.pagamenti.efectivo.incasso).toBe(17);
  });
});
