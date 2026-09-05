// EconomiaGeneral.test.js — OVER-COLLECTED / AJUSTE COMERCIAL V1 SLICE C, §15.
//
// The one thing this slice adds to Economía: a "Cobrado de más" KPI reading
// the backend's own dedicated `balance` section (economicSnapshot.js, Over-
// Collected Slice A) verbatim, never netted against Pendiente. Same mocking
// seam as EconomiaSnapshotPanel.test.js: both useEconomySnapshot and
// useServiceSessions call economyApi.snapshot() internally.
import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../economy/economyApi", () => ({
  __esModule: true,
  EconomyApiError: class EconomyApiError extends Error {
    constructor(code, status = 0) { super(code); this.name = "EconomyApiError"; this.code = code; this.status = status; }
  },
  economyApi: { snapshot: jest.fn(), pendencies: jest.fn(), listCashCounts: jest.fn() },
}));

const EconomiaGeneral = require("./EconomiaGeneral").default;
const { economyApi } = require("../../economy/economyApi");

// PENDIENTE(scope) is `totals.porCobrar` from a scoped Pendencias read now, not
// `obligation.unpaid`. Control Caja is a scoped cash-count read. Give both a
// resolved-empty default; individual tests override `pendencies`.
const PENDENCIES_EMPTY = Object.freeze({
  ok: true, porCobrar: [], porDevolver: [], requiereRevision: [],
  counts: { porCobrar: 0, porDevolver: 0, requiereRevision: 0 },
  totals: { porCobrar: 0, porDevolver: 0 }, scope: null, window: null,
});

const WINDOW = Object.freeze({
  preset: "hoy", label: "Hoy",
  from: "2026-08-20T15:30:00.000Z", to: "2026-08-21T02:00:00.000Z",
  timezone: "Europe/Madrid", businessDate: "2026-08-20", serviceSessionId: null,
  bounds: "[from,to)", asOf: "2026-08-21T12:00:00.000Z", generatedAt: "2026-08-21T12:00:00.000Z",
});
const NO_CROSSING = Object.freeze({
  obligationBeforeWindowReceiptInside: [], obligationInsideWindowReceiptAfter: [], receiptsSplitAcrossBoundary: [],
});
const baseSnapshot = (balance) => Object.freeze({
  ok: true, window: WINDOW,
  obligation: { gross: 30, unpaid: 0, voided: 0, refunded: 0 },
  receipts: { collected: 30, collectedGross: 30, refunded: 0, byMethod: { efectivo: 30, tarjeta: 0, bizum: 0, other: 0 } },
  balance,
  counts: { obligations: 1, obligationsCancelled: 0, obligationsUnpaid: 0, receiptEvents: 1, payments: 1, refunds: 0 },
  economicBreakdown: { obligations: {}, receipts: {}, source: "stamped_era_read_rule" },
  windowCrossing: NO_CROSSING,
  drillDown: { obligations: [], receipts: [], legacyReceipts: [] },
  serviceProvenance: [],
});

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
function byTestId(c, id) { return c.querySelector(`[data-testid="${id}"]`); }
async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<EconomiaGeneral />); });
  await flush();
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

beforeEach(() => {
  jest.clearAllMocks();
  economyApi.pendencies.mockResolvedValue(PENDENCIES_EMPTY);
  economyApi.listCashCounts.mockResolvedValue({ ok: true, counts: [], scope: null, window: null });
});

test("balance.overCollected > 0: Cobrado de más KPI shows the exact figure", async () => {
  economyApi.snapshot.mockResolvedValue(baseSnapshot({ unpaid: 0, overCollected: 12.5, unresolvedOverCollected: 12.5 }));
  const { container, root } = await mount();
  const kpi = byTestId(container, "general-kpi-cobrado-de-mas");
  expect(kpi).toBeTruthy();
  expect(kpi.textContent).toContain("Cobrado de más");
  expect(kpi.textContent).toMatch(/12,50\s?€/);
  unmount(container, root);
});

test("balance.overCollected === 0: no KPI rendered (compact, no noise)", async () => {
  economyApi.snapshot.mockResolvedValue(baseSnapshot({ unpaid: 0, overCollected: 0, unresolvedOverCollected: 0 }));
  const { container, root } = await mount();
  expect(byTestId(container, "general-kpi-cobrado-de-mas")).toBe(null);
  unmount(container, root);
});

test("PENDIENTE and Cobrado de más both non-zero at once: both KPIs shown, never netted", async () => {
  // PENDIENTE is canonical `totals.porCobrar` from Pendencias at this scope
  // (10,00); Cobrado de más is the snapshot's own `balance.overCollected`
  // (10,00). They are independent exposures and must never be netted.
  economyApi.snapshot.mockResolvedValue({
    ...baseSnapshot({ unpaid: 10, overCollected: 10, unresolvedOverCollected: 10 }),
    obligation: { gross: 30, unpaid: 10, voided: 0, refunded: 0 },
  });
  economyApi.pendencies.mockResolvedValue({
    ...PENDENCIES_EMPTY,
    counts: { porCobrar: 1, porDevolver: 0, requiereRevision: 0 },
    totals: { porCobrar: 10, porDevolver: 0 },
  });
  const { container, root } = await mount();
  expect(byTestId(container, "general-kpi-pendiente").textContent).toMatch(/10,00\s?€/);
  const overKpi = byTestId(container, "general-kpi-cobrado-de-mas");
  expect(overKpi).toBeTruthy();
  expect(overKpi.textContent).toMatch(/10,00\s?€/);
  unmount(container, root);
});

test("PENDIENTE reads totals.porCobrar, NEVER obligation.unpaid", async () => {
  // The snapshot says unpaid 999; Pendencias says porCobrar 20. The KPI must
  // show 20 — a different, canonical concept (still-active unpaid orders are
  // not a pendency).
  economyApi.snapshot.mockResolvedValue({
    ...baseSnapshot({ unpaid: 999, overCollected: 0, unresolvedOverCollected: 0 }),
    obligation: { gross: 1000, unpaid: 999, voided: 0, refunded: 0 },
  });
  economyApi.pendencies.mockResolvedValue({
    ...PENDENCIES_EMPTY,
    counts: { porCobrar: 1, porDevolver: 0, requiereRevision: 0 },
    totals: { porCobrar: 20, porDevolver: 0 },
  });
  const { container, root } = await mount();
  expect(byTestId(container, "general-kpi-pendiente").textContent).toMatch(/20,00\s?€/);
  expect(byTestId(container, "general-kpi-pendiente").textContent).not.toMatch(/999/);
  unmount(container, root);
});

test("a failed Pendencias read shows the KPI's own dash — never a fallback number", async () => {
  economyApi.snapshot.mockResolvedValue(baseSnapshot({ unpaid: 42, overCollected: 0, unresolvedOverCollected: 0 }));
  economyApi.pendencies.mockRejectedValue(new Error("boom"));
  const { container, root } = await mount();
  const txt = byTestId(container, "general-kpi-pendiente").textContent;
  expect(txt).toMatch(/—|···/);
  expect(txt).not.toMatch(/42/);
  unmount(container, root);
});

// ECONOMÍA REFUND REPORTING FIX — the exact live UAT shape (#999034, Mesa 6,
// 2026-08-28): a sale ORIGINATED on an earlier business day is refunded
// TODAY. `obligation.refunded` is correctly 0 (no sale was BORN in "Hoy");
// `receipts.refunded` is correctly 15 (a refund EVENT landed in "Hoy").
// Before this fix, Devuelto read the first field and showed 0,00 € on
// screen despite a real 15,00 € refund existing in the canonical ledger for
// the selected window -- this test fails against the pre-fix code and is
// the regression pin for that exact defect.
test("cross-day refund: Devuelto reads the RECEIPT-scoped figure, never the obligation-scoped one", async () => {
  economyApi.snapshot.mockResolvedValue({
    ...baseSnapshot({ unpaid: 0, overCollected: 0, unresolvedOverCollected: 0 }),
    obligation: { gross: 0, unpaid: 0, voided: 0, refunded: 0 },
    receipts: { collected: -15, collectedGross: 0, refunded: 15, byMethod: { efectivo: -15, tarjeta: 0, bizum: 0, other: 0 } },
  });
  const { container, root } = await mount();
  expect(byTestId(container, "general-kpi-devuelto").textContent).toMatch(/15,00\s?€/);
  unmount(container, root);
});

// Same-day sanity: when both scopes agree (the common case), the fix must
// not have introduced a divergence where none exists.
test("same-day payment and refund: Devuelto still matches when obligation.refunded and receipts.refunded happen to agree", async () => {
  economyApi.snapshot.mockResolvedValue({
    ...baseSnapshot({ unpaid: 0, overCollected: 0, unresolvedOverCollected: 0 }),
    obligation: { gross: 85, unpaid: 0, voided: 0, refunded: 15 },
    receipts: { collected: 70, collectedGross: 85, refunded: 15, byMethod: { efectivo: 70, tarjeta: 0, bizum: 0, other: 0 } },
  });
  const { container, root } = await mount();
  expect(byTestId(container, "general-kpi-cobrado").textContent).toMatch(/70,00\s?€/);
  expect(byTestId(container, "general-kpi-devuelto").textContent).toMatch(/15,00\s?€/);
  unmount(container, root);
});
