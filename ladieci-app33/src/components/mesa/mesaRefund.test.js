// mesaRefund.test.js — Refund V1 Slice B pure-logic tests.
//
// Everything here is deterministic and DOM-free: grouping/eligibility (§11,
// §31), reason policy (§15), external-tender copy (§17), amount parsing/
// validation (§14, §32). MesaPaymentsList.test.js covers the DOM/UX side.
import {
  REFUND_REASONS, resolveRefundReason, groupPaymentsWithRefunds,
  externalSettlementCopy, REFUND_ECONOMIC_WARNING, parseRefundAmountInput,
  isRefundAmountValid, formatAmountForInput,
} from "./mesaRefund";

describe("REFUND_REASONS (§15, frozen)", () => {
  test("exposes exactly the five approved presets, in order", () => {
    expect(REFUND_REASONS.map((r) => r.label)).toEqual([
      "Error de importe", "Cobro duplicado", "Mesa equivocada", "Error de cobro", "Otro",
    ]);
  });

  test('"Devolución de producto" is absent -- a refund never reduces the sale', () => {
    expect(REFUND_REASONS.some((r) => r.label === "Devolución de producto")).toBe(false);
  });

  test("a standard preset resolves to its own label verbatim, no detail required", () => {
    expect(resolveRefundReason("importe", "")).toBe("Error de importe");
    expect(resolveRefundReason("duplicado", undefined)).toBe("Cobro duplicado");
  });

  test('"otro" requires non-blank detail and returns it verbatim, trimmed', () => {
    expect(resolveRefundReason("otro", "  El cliente cambió de opinión  ")).toBe("El cliente cambió de opinión");
    expect(resolveRefundReason("otro", "")).toBe(null);
    expect(resolveRefundReason("otro", "   ")).toBe(null);
  });

  test("no preset id / unknown id resolves to null", () => {
    expect(resolveRefundReason(null, "")).toBe(null);
    expect(resolveRefundReason("no-existe", "algo")).toBe(null);
  });
});

describe("groupPaymentsWithRefunds (§11/§31, frozen basis)", () => {
  test("a payment with no refunds: refundedTotal 0, refundableRemaining == amount", () => {
    const [row] = groupPaymentsWithRefunds([
      { id: "pt-1", kind: "payment", amount: 30, method: "tarjeta", createdAt: "2026-08-22T20:14:00Z", reversesTransactionId: null },
    ]);
    expect(row.refunds).toEqual([]);
    expect(row.refundedTotal).toBe(0);
    expect(row.refundableRemaining).toBe(30);
  });

  test("§21 -- two partial refunds against the SAME original: 30 - 10 - 5 = 15", () => {
    const [row] = groupPaymentsWithRefunds([
      { id: "pt-1", kind: "payment", amount: 30, method: "tarjeta", createdAt: "2026-08-22T20:14:00Z", reversesTransactionId: null },
      { id: "pt-r1", kind: "refund", amount: 10, method: "tarjeta", createdAt: "2026-08-22T20:47:00Z", reversesTransactionId: "pt-1" },
      { id: "pt-r2", kind: "refund", amount: 5, method: "tarjeta", createdAt: "2026-08-22T21:00:00Z", reversesTransactionId: "pt-1" },
    ]);
    expect(row.refunds.map((r) => r.id)).toEqual(["pt-r1", "pt-r2"]);
    expect(row.refundedTotal).toBe(15);
    expect(row.refundableRemaining).toBe(15);
  });

  test("§22 -- a fully refunded original has refundableRemaining exactly 0, never negative", () => {
    const [row] = groupPaymentsWithRefunds([
      { id: "pt-1", kind: "payment", amount: 30, method: "efectivo", createdAt: "t0", reversesTransactionId: null },
      { id: "pt-r1", kind: "refund", amount: 30, method: "efectivo", createdAt: "t1", reversesTransactionId: "pt-1" },
    ]);
    expect(row.refundableRemaining).toBe(0);
  });

  test("does NOT accidentally include a refund belonging to a DIFFERENT original", () => {
    const rows = groupPaymentsWithRefunds([
      { id: "pt-A", kind: "payment", amount: 20, method: "efectivo", createdAt: "t0", reversesTransactionId: null },
      { id: "pt-B", kind: "payment", amount: 20, method: "efectivo", createdAt: "t0", reversesTransactionId: null },
      { id: "pt-rB", kind: "refund", amount: 5, method: "efectivo", createdAt: "t1", reversesTransactionId: "pt-B" },
    ]);
    const a = rows.find((r) => r.id === "pt-A");
    const b = rows.find((r) => r.id === "pt-B");
    expect(a.refunds).toEqual([]);
    expect(a.refundableRemaining).toBe(20);
    expect(b.refunds.map((r) => r.id)).toEqual(["pt-rB"]);
    expect(b.refundableRemaining).toBe(15);
  });

  test("a refund transaction never appears as a top-level (refundable) row itself", () => {
    const rows = groupPaymentsWithRefunds([
      { id: "pt-1", kind: "payment", amount: 30, method: "tarjeta", createdAt: "t0", reversesTransactionId: null },
      { id: "pt-r1", kind: "refund", amount: 10, method: "tarjeta", createdAt: "t1", reversesTransactionId: "pt-1" },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["pt-1"]);
    expect(rows.find((r) => r.id === "pt-r1")).toBeUndefined();
  });

  test("does not use a table/session aggregate -- multiple originals stay independently bounded", () => {
    // Two 15.00 payments on the same table; refunding one in full must never
    // affect the other's own refundable-remaining.
    const rows = groupPaymentsWithRefunds([
      { id: "pt-1", kind: "payment", amount: 15, method: "efectivo", createdAt: "t0", reversesTransactionId: null },
      { id: "pt-2", kind: "payment", amount: 15, method: "efectivo", createdAt: "t0", reversesTransactionId: null },
      { id: "pt-r1", kind: "refund", amount: 15, method: "efectivo", createdAt: "t1", reversesTransactionId: "pt-1" },
    ]);
    expect(rows.find((r) => r.id === "pt-1").refundableRemaining).toBe(0);
    expect(rows.find((r) => r.id === "pt-2").refundableRemaining).toBe(15);
  });

  test("empty/missing payments -> empty list, never throws", () => {
    expect(groupPaymentsWithRefunds([])).toEqual([]);
    expect(groupPaymentsWithRefunds(undefined)).toEqual([]);
    expect(groupPaymentsWithRefunds(null)).toEqual([]);
  });
});

describe("externalSettlementCopy (§17, frozen -- no tender selector, ever)", () => {
  test("tarjeta -> datáfono recording notice", () => {
    expect(externalSettlementCopy("tarjeta")).toMatch(/datáfono/i);
  });
  test("bizum -> Bizum recording notice", () => {
    expect(externalSettlementCopy("bizum")).toMatch(/Bizum/i);
  });
  test("efectivo -> no warning (truthfully records the drawer, not a POS action)", () => {
    expect(externalSettlementCopy("efectivo")).toBe(null);
  });
  test("neither copy ever mentions a bank/POS SUCCESS or transaction id -- La Dieci only records, never claims to execute", () => {
    expect(externalSettlementCopy("tarjeta")).not.toMatch(/aprobad|éxito|transacción \d/i);
    expect(externalSettlementCopy("bizum")).not.toMatch(/aprobad|éxito|transacción \d/i);
  });
});

describe("REFUND_ECONOMIC_WARNING (§16, load-bearing frozen copy)", () => {
  test("states the amount becomes pending again", () => {
    expect(REFUND_ECONOMIC_WARNING).toMatch(/pendiente/i);
  });
  test("states the refund does not modify the sale's value", () => {
    expect(REFUND_ECONOMIC_WARNING).toMatch(/no modifica el valor de la venta/i);
  });
});

describe("amount parsing/validation (§14/§32)", () => {
  test("accepts Spanish decimal comma, same convention as Importe libre", () => {
    expect(parseRefundAmountInput("10,50")).toBe(10.5);
    expect(parseRefundAmountInput("10.50")).toBe(10.5);
  });
  test("non-numeric garbage parses to NaN, and NaN is never a valid amount", () => {
    expect(Number.isNaN(parseRefundAmountInput("abc"))).toBe(true);
    expect(isRefundAmountValid(parseRefundAmountInput("abc"), 30)).toBe(false);
  });
  test("empty input parses to 0, which is safely rejected as an invalid amount (never a silent charge)", () => {
    expect(parseRefundAmountInput("")).toBe(0);
    expect(isRefundAmountValid(parseRefundAmountInput(""), 30)).toBe(false);
  });
  test("zero and negative are invalid", () => {
    expect(isRefundAmountValid(0, 30)).toBe(false);
    expect(isRefundAmountValid(-5, 30)).toBe(false);
  });
  test("above the refundable remaining is invalid", () => {
    expect(isRefundAmountValid(30.01, 30)).toBe(false);
  });
  test("exactly the refundable remaining is valid (the default full-remainder case)", () => {
    expect(isRefundAmountValid(30, 30)).toBe(true);
  });
  test("a reduced partial amount within bounds is valid", () => {
    expect(isRefundAmountValid(10, 30)).toBe(true);
  });
  test("formatAmountForInput round-trips through parseRefundAmountInput", () => {
    expect(parseRefundAmountInput(formatAmountForInput(23.5))).toBe(23.5);
    expect(formatAmountForInput(20)).toBe("20,00");
  });
});
