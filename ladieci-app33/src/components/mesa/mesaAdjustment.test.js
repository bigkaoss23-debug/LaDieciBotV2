// mesaAdjustment.test.js — pure helpers for the manual Ajuste Comercial.
import {
  parseAdjustmentAmountInput, formatAmountForInput, isAdjustmentValid, adjustmentDelta,
  projectedOverCollected, accountObligationTotal, accountOriginalObligationTotal,
  accountAdjustmentTotal, adjustableCommands,
} from "./mesaAdjustment";

const fin = (o) => ({
  orderUid: o.orderUid ?? "uid-1",
  originalObligation: o.original, currentObligation: o.current,
  commercialAdjustment: Math.round(((o.current ?? 0) - (o.original ?? 0)) * 100) / 100,
  obligationRevision: o.rev ?? 0, adjustable: o.adjustable ?? true,
});

describe("parse / format", () => {
  test("accepts the Spanish decimal comma", () => {
    expect(parseAdjustmentAmountInput("20,50")).toBe(20.5);
    expect(parseAdjustmentAmountInput("0")).toBe(0);
  });
  test("non-numeric -> NaN", () => {
    expect(Number.isNaN(parseAdjustmentAmountInput("abc"))).toBe(true);
    expect(Number.isNaN(parseAdjustmentAmountInput(""))).toBe(true);
  });
  test("formats back to a comma string", () => {
    expect(formatAmountForInput(20)).toBe("20,00");
    expect(formatAmountForInput(19.999)).toBe("20,00");
  });
});

describe("isAdjustmentValid — reduction only, never wider than the backend", () => {
  test("a strict reduction is valid", () => {
    expect(isAdjustmentValid(20, 30)).toBe(true);
  });
  test("zero is valid when the backend would accept it (§13)", () => {
    expect(isAdjustmentValid(0, 30)).toBe(true);
  });
  test("an increase is rejected", () => {
    expect(isAdjustmentValid(31, 30)).toBe(false);
    expect(isAdjustmentValid(30.01, 30)).toBe(false);
  });
  test("no change is rejected (backend answers MESA_ADJUSTMENT_NO_CHANGE)", () => {
    expect(isAdjustmentValid(30, 30)).toBe(false);
  });
  test("a negative gross is rejected", () => {
    expect(isAdjustmentValid(-1, 30)).toBe(false);
  });
  test("NaN is rejected", () => {
    expect(isAdjustmentValid(NaN, 30)).toBe(false);
  });
  test("a value that rounds to the current obligation is treated as no-change (rejected)", () => {
    expect(isAdjustmentValid(29.9995, 30)).toBe(false); // -> 30,00, no change
  });
  test("a genuine near-round reduction is accepted", () => {
    expect(isAdjustmentValid(19.999, 30)).toBe(true); // -> 20,00, a real -10,00
  });
});

describe("adjustmentDelta", () => {
  test("newGross - currentObligation, <= 0 for a reduction", () => {
    expect(adjustmentDelta(30, 20)).toBe(-10);
    expect(adjustmentDelta(30, 0)).toBe(-30);
  });
});

describe("account aggregates read the canonical per-order financial block", () => {
  const commands = [
    { commandNumber: 1, total: 20, financial: fin({ orderUid: "a", original: 30, current: 20, rev: 2 }) },
    { commandNumber: 2, total: 15, financial: fin({ orderUid: "b", original: 15, current: 15, rev: 1 }) },
    { commandNumber: 3, total: 8 }, // no financial block -> falls back to `total`, never the id
  ];
  test("accountObligationTotal = Σ currentObligation (with total fallback)", () => {
    expect(accountObligationTotal(commands)).toBe(43); // 20 + 15 + 8
  });
  test("accountOriginalObligationTotal = Σ originalObligation", () => {
    expect(accountOriginalObligationTotal(commands)).toBe(53); // 30 + 15 + 8
  });
  test("accountAdjustmentTotal = Σ commercialAdjustment (<= 0), 0 when nothing adjusted", () => {
    expect(accountAdjustmentTotal(commands)).toBe(-10);
    expect(accountAdjustmentTotal([{ financial: fin({ original: 10, current: 10 }) }])).toBe(0);
    expect(accountAdjustmentTotal([])).toBe(0);
    expect(accountAdjustmentTotal(undefined)).toBe(0);
  });
});

describe("adjustableCommands — permanent identity + backend verdict only (§10)", () => {
  test("keeps only commands with a financial block, a real orderUid, and adjustable === true", () => {
    const commands = [
      { commandNumber: 1, id: "#001", financial: fin({ orderUid: "uid-a", original: 30, current: 20, adjustable: true }) },
      { commandNumber: 2, id: "#002", financial: fin({ orderUid: "uid-b", original: 10, current: 10, adjustable: false }) },
      { commandNumber: 3, id: "#003", financial: { ...fin({ original: 5, current: 5 }), orderUid: null } },
      { commandNumber: 4, id: "#004" }, // no financial block at all (Class B / old payload)
    ];
    const out = adjustableCommands(commands);
    expect(out.map((c) => c.commandNumber)).toEqual([1]);
  });
  test("never falls back to the display id", () => {
    const commands = [{ commandNumber: 9, id: "#999", financial: { adjustable: true, currentObligation: 5, orderUid: "" } }];
    expect(adjustableCommands(commands)).toEqual([]);
  });
  test("empty / missing input is safe", () => {
    expect(adjustableCommands(undefined)).toEqual([]);
    expect(adjustableCommands([])).toEqual([]);
  });
});

describe("projectedOverCollected (§14) — derived from backend figures, never netted", () => {
  test("30 sale, 30 paid, reduce one order 30 -> 20 leaves 10 over-collected", () => {
    const over = projectedOverCollected({
      accountObligationTotal: 30, accountPaid: 30, currentObligation: 30, newGross: 20,
    });
    expect(over).toBe(10);
  });
  test("still unpaid after the reduction -> 0 over-collected", () => {
    const over = projectedOverCollected({
      accountObligationTotal: 30, accountPaid: 12, currentObligation: 30, newGross: 20,
    });
    expect(over).toBe(0);
  });
  test("multi-command: only this order's reduction is applied to the account total", () => {
    // account obligation 45 (20 + 25), paid 45; reduce the 25 order to 15 -> 35 obligation, 10 over
    const over = projectedOverCollected({
      accountObligationTotal: 45, accountPaid: 45, currentObligation: 25, newGross: 15,
    });
    expect(over).toBe(10);
  });
});
