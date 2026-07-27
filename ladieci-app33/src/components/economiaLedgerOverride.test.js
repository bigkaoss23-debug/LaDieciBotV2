// S2-7D6E3 — Economía's money figures must come from the ledger (order_financial_events,
// via the backend's getEconomiaLedger action), never from metodo_pago bucketed over raw
// storico/ordenes rows. This is the exact incident that was proven live on staging: an
// order with metodo_pago=efectivo, cobrado=false and ZERO order_financial_events rows
// still showed as "12,00€" collected — because Economía summed `totale` into a bucket
// keyed only by `metodo_pago`, never checking whether a payment actually happened.
//
// Unit coverage of the pure functions (aggrega/buildCajaStats/sumLedgerWindow), no
// component render needed — the accounting logic is what's under test.
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

describe("Economía ledger override — no metodo_pago-only accounting", () => {
  test("case 1 — a row with a real ledger payment reports the ledger amount, not the row total again", () => {
    const rows = [row({ metodo_pago: "efectivo" })];
    const ledgerByDay = {
      "2026-07-27": {
        paymentTotals: { efectivo: 12, tarjeta: 0, bizum: 0, other: 0 },
        totals: { gross: 12, collected: 12, refunded: 0, unpaid: 0 },
      },
    };
    const out = aggrega(rows, ledgerByDay);
    expect(out.incassoTot).toBe(12);
    expect(out.pagamenti.efectivo.incasso).toBe(12);
    expect(out.giorniDettaglio[0].incasso).toBe(12);
  });

  test("case 2 — metodo_pago=efectivo but NO ledger event for that day reports 0 collected, not the row total", () => {
    const rows = [row({ metodo_pago: "efectivo" })];
    const ledgerByDay = {
      "2026-07-27": {
        paymentTotals: { efectivo: 0, tarjeta: 0, bizum: 0, other: 0 },
        totals: { gross: 12, collected: 0, refunded: 0, unpaid: 12 },
      },
    };
    const out = aggrega(rows, ledgerByDay);
    expect(out.incassoTot).toBe(0);
    expect(out.pagamenti.efectivo.incasso).toBe(0);
    expect(out.giorniDettaglio[0].incasso).toBe(0);
  });

  test("case 3 — a payment netted against a refund shows the net, not the gross", () => {
    const rows = [row({ metodo_pago: "efectivo" })];
    const ledgerByDay = {
      "2026-07-27": {
        paymentTotals: { efectivo: 7, tarjeta: 0, bizum: 0, other: 0 },
        totals: { gross: 12, collected: 7, refunded: 5, unpaid: 0 },
      },
    };
    const out = aggrega(rows, ledgerByDay);
    expect(out.incassoTot).toBe(7);
    expect(out.pagamenti.efectivo.incasso).toBe(7);
  });

  test("no ledger data at all (still loading): falls back to the row-based figures, never crashes or shows undefined", () => {
    const rows = [row({ metodo_pago: "efectivo" })];
    const out = aggrega(rows, {});
    expect(out.incassoTot).toBe(12);
    expect(out.pagamenti.efectivo.incasso).toBe(12);
  });

  test("ticketMedio always divides the SAME total displayed as incassoTot (never drifts after the ledger override)", () => {
    const rows = [row({ metodo_pago: "efectivo" }), row({ id: "#902", metodo_pago: "efectivo" })];
    const ledgerByDay = {
      "2026-07-27": {
        paymentTotals: { efectivo: 0, tarjeta: 0, bizum: 0, other: 0 },
        totals: { gross: 24, collected: 0, refunded: 0, unpaid: 24 },
      },
    };
    const out = aggrega(rows, ledgerByDay);
    expect(out.ticketMedio).toBe(out.incassoTot / out.countOrdini);
    expect(out.ticketMedio).toBe(0);
  });

  test("buildCajaStats (single-day Caja view) uses the ledger entry for that day, ignoring metodo_pago", () => {
    const rows = [row({ metodo_pago: "efectivo" })];
    const ledgerEntry = {
      paymentTotals: { efectivo: 0, tarjeta: 0, bizum: 0, other: 0 },
      totals: { collected: 0, unpaid: 12, gross: 12, refunded: 0 },
    };
    const out = buildCajaStats(rows, ledgerEntry);
    expect(out.incasso).toBe(0);
    expect(out.pagamenti.efectivo.incasso).toBe(0);
  });

  test("buildCajaStats without a ledger entry falls back to the row-based figure", () => {
    const rows = [row({ metodo_pago: "tarjeta" })];
    const out = buildCajaStats(rows, undefined);
    expect(out.incasso).toBe(12);
    expect(out.pagamenti.tarjeta.incasso).toBe(12);
  });

  test("sumLedgerWindow sums only days matching the predicate", () => {
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
