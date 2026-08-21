// ===============================================================
// TKT-01 (2026-08-21 forensic audit) — the customer bill must never present a
// credit as a charge.
//
// The fixture below is the REAL 2026-08-20 Mesa 4 state, taken from the durable
// staging rows and frozen here so the defect can never come back:
//
//   comanda 1  #999015  101.00  settled 21:23:34 → 21:25:23 (tarjeta/bizum/efectivo)
//   comanda 2  #999017   27.50  La Pulga 13.00 + Il Tulipano Nero 14.50, still owed
//   ------------------------------------------------------------------
//   total consumido 128.50 · ya cobrado 101.00 · pendiente 27.50
//
// Before the fix, billDocument() pushed "Ya cobrado 101,00 €" into the same
// `rows` array as the two item charges and PrintPreview drew all three through
// one identical renderer, so the paper read as 128,50 € of charges above a
// total of 27,50 €.
// ===============================================================

import { buildBillDocument } from "./TabMesa";

// exactly what buildFloor projects for table_session b490d667 at 21:27:11
const MESA_4_AFTER_SECOND_COMANDA = Object.freeze({
  id: "b490d667-5747-485b-8821-fdbdb579446f",
  total: 128.5,
  paid: 101,
  outstanding: 27.5,
  coversTotal: 4,
  coversRemaining: 0,
  paymentTotals: { efectivo: 30, tarjeta: 51, bizum: 20, other: 0 },
  lines: [
    // comanda 1 — fully allocated, so `remaining` is 0 on every line
    { id: "l1", orderId: "#999015", description: "El Divino Codino", amount: 12.5, paid: 12.5, remaining: 0 },
    { id: "l2", orderId: "#999015", description: "La Joya", amount: 15, paid: 15, remaining: 0 },
    { id: "l3", orderId: "#999015", description: "Pizza Nutella", amount: 10, paid: 10, remaining: 0 },
    // comanda 2 — the two additional pizzas, unpaid
    { id: "l4", orderId: "#999017", description: "La Pulga", amount: 13, paid: 0, remaining: 13 },
    { id: "l5", orderId: "#999017", description: "Il Tulipano Nero", amount: 14.5, paid: 0, remaining: 14.5 },
  ],
});

// the same table BEFORE anyone paid anything — nothing collected yet
const MESA_4_NOTHING_PAID = Object.freeze({
  total: 27.5, paid: 0, outstanding: 27.5, paymentTotals: {},
  lines: [
    { id: "l4", description: "La Pulga", amount: 13, paid: 0, remaining: 13 },
    { id: "l5", description: "Il Tulipano Nero", amount: 14.5, paid: 0, remaining: 14.5 },
  ],
});

const amounts = (rows) => rows.map((r) => r.value);
const numeric = (value) => Number(String(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));

describe("TKT-01 — the post-settlement bill separates charges from credits", () => {
  const doc = buildBillDocument(MESA_4_AFTER_SECOND_COMANDA, 4);

  test("rows carry ONLY the two unpaid pizzas — no credit is smuggled in", () => {
    expect(doc.rows).toHaveLength(2);
    expect(doc.rows.map((r) => r.label)).toEqual(["La Pulga", "Il Tulipano Nero"]);
    // the defect, stated as an assertion: no charge row may be the paid amount
    for (const row of doc.rows) {
      expect(row.label).not.toMatch(/cobrado|pagado/i);
      expect(numeric(row.value)).not.toBeCloseTo(101, 2);
    }
    // and the charge rows add up to the pending total, not to something else
    expect(amounts(doc.rows).reduce((s, v) => s + numeric(v), 0)).toBeCloseTo(27.5, 2);
  });

  test("the reconciliation states all three numbers: 128.50 consumed − 101.00 paid = 27.50 pending", () => {
    expect(doc.summary).toHaveLength(2);
    const [consumed, credit] = doc.summary;

    expect(consumed.label).toBe("Total consumido");
    expect(numeric(consumed.value)).toBeCloseTo(128.5, 2);
    expect(consumed.credit).toBeFalsy();

    expect(credit.label).toBe("Ya cobrado");
    expect(numeric(credit.value)).toBeCloseTo(101, 2);
    expect(credit.credit).toBe(true);

    expect(doc.totalLabel).toBe("PENDIENTE");
    expect(doc.total).toBeCloseTo(27.5, 2);

    // the arithmetic the operator can now actually follow on the paper
    expect(numeric(consumed.value) - numeric(credit.value)).toBeCloseTo(doc.total, 2);
  });

  test("the credit is FLAGGED as a credit, which is what earns it the minus sign", () => {
    // PrintSheet renders `− ${value}` for any row with credit:true, so the flag
    // is the whole mechanism — assert it here rather than the rendered glyph
    const credits = doc.summary.filter((r) => r.credit);
    expect(credits).toHaveLength(1);
    expect(credits[0].label).toBe("Ya cobrado");
    expect(doc.rows.some((r) => r.credit)).toBe(false);
  });

  test("no presentation makes 101.00 look like an additional charge", () => {
    // the charge block and the reconciliation block are structurally distinct
    // arrays, so a credit can never be drawn in the charge run
    expect(doc.rows).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Ya cobrado" }),
    ]));
    // and the charges must never sum to the accumulated total, which was the
    // exact visual lie: 13.00 + 14.50 + 101.00 = 128.50 over a 27.50 total
    expect(amounts(doc.rows).reduce((s, v) => s + numeric(v), 0)).not.toBeCloseTo(128.5, 2);
  });

  test("the note explains the scope of the rows instead of contradicting the total", () => {
    expect(doc.note).toBe("Arriba, solo lo que queda por pagar.");
  });
});

describe("TKT-01 — a table that has paid nothing shows no reconciliation block", () => {
  const doc = buildBillDocument(MESA_4_NOTHING_PAID, 4);

  test("no credit exists, so no summary is printed", () => {
    expect(doc.summary).toEqual([]);
    expect(doc.note).toBe("Cuenta completa de la mesa.");
  });

  test("the rows ARE the whole account and match the total", () => {
    expect(doc.rows).toHaveLength(2);
    expect(amounts(doc.rows).reduce((s, v) => s + numeric(v), 0)).toBeCloseTo(doc.total, 2);
  });
});

describe("TKT-01 — the builder performs no arithmetic of its own", () => {
  test("every figure is passed through from the session exactly as the backend computed it", () => {
    // `outstanding` is deliberately NOT total - paid here, so passthrough and
    // local recomputation give different answers and the test can tell them
    // apart. A real session never looks like this; the point is that the
    // builder reports what the payment engine decided and never second-guesses
    // it (refunds, voided lines and cancelled orders all make the naive
    // subtraction wrong in production).
    const session = {
      total: 88.88, paid: 11.11, outstanding: 50,
      lines: [{ id: "x", description: "Algo", amount: 50, paid: 0, remaining: 50 }],
    };
    const doc = buildBillDocument(session, 9);
    expect(numeric(doc.summary[0].value)).toBeCloseTo(88.88, 2);
    expect(numeric(doc.summary[1].value)).toBeCloseTo(11.11, 2);
    expect(doc.total).toBe(50);
    expect(doc.total).not.toBeCloseTo(88.88 - 11.11, 2);
  });

  test("a missing or empty session degrades without throwing", () => {
    for (const session of [null, undefined, {}, { lines: null }]) {
      const doc = buildBillDocument(session, 1);
      expect(doc.rows).toEqual([]);
      expect(doc.summary).toEqual([]);
    }
  });
});
