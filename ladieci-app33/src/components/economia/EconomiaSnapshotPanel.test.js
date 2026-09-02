// ===============================================================
// I-1 — mounts the REAL EconomiaSnapshotPanel.
//
// The figures below are the certified economy of staging service 480eca89
// (the evening of 2026-08-20): 262.50 collected, 85.00 of it in cash. The
// same numbers the backend suite asserts against real rows.
//
// The last two tests are the ones that matter most. This panel sits one tap
// from the control that misled the owner on 2026-08-20 — a read-only page
// titled "Cierre del servicio" that read as a completed close when zero
// closeout attempts had ever been recorded. A cash count must never be able
// to read that way, so the copy is asserted, not merely written.
// ===============================================================

import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../economy/economyApi", () => ({
  __esModule: true,
  EconomyApiError: class EconomyApiError extends Error {
    constructor(code, status = 0) { super(code); this.name = "EconomyApiError"; this.code = code; this.status = status; }
  },
  createEconomyRequestId: jest.fn(() => "cash_testrequestid0001"),
  economyApi: {
    snapshot: jest.fn(),
    listCashCounts: jest.fn(),
    createCashCount: jest.fn(),
  },
}));

const EconomiaSnapshotPanel = require("./EconomiaSnapshotPanel").default;
const { economyApi, createEconomyRequestId, EconomyApiError } = require("../../economy/economyApi");

const WINDOW = Object.freeze({
  preset: "hoy", label: "Hoy",
  from: "2026-08-20T15:30:00.000Z", to: "2026-08-21T02:00:00.000Z",
  timezone: "Europe/Madrid", businessDate: "2026-08-20", serviceSessionId: null,
  bounds: "[from,to)", asOf: "2026-08-21T12:00:00.000Z", generatedAt: "2026-08-21T12:00:00.000Z",
});

const NO_CROSSING = Object.freeze({
  obligationBeforeWindowReceiptInside: [],
  obligationInsideWindowReceiptAfter: [],
  receiptsSplitAcrossBoundary: [],
});

const SNAPSHOT = Object.freeze({
  ok: true,
  window: WINDOW,
  obligation: { gross: 262.5, unpaid: 0, voided: 0, refunded: 0 },
  receipts: {
    collected: 262.5, collectedGross: 262.5, refunded: 0,
    byMethod: { efectivo: 85, tarjeta: 130, bizum: 47.5, other: 0 },
  },
  counts: { obligations: 5, obligationsCancelled: 0, obligationsUnpaid: 0, receiptEvents: 8, payments: 8, refunds: 0 },
  economicBreakdown: { obligations: {}, receipts: {}, source: "stamped_era_read_rule" },
  windowCrossing: NO_CROSSING,
  drillDown: { obligations: [], receipts: [], legacyReceipts: [] },
  serviceProvenance: [],
});

const SAVED = Object.freeze({
  ok: true, created: true,
  count: {
    id: "cc-1", countedAt: "2026-08-21T12:00:00.000Z", actor: "owner", actorRole: "admin",
    countedCash: 80, recordedCashReceipts: 85, variance: -5,
    window: { from: WINDOW.from, to: WINDOW.to, timezone: "Europe/Madrid", preset: "hoy" },
    serviceSessionId: null, note: null, snapshotContext: {}, createdAt: "2026-08-21T12:00:00.000Z",
  },
});

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}
function byTestId(c, id) { return c.querySelector(`[data-testid="${id}"]`); }
function click(el) { act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }
function type(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  act(() => { setter.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<EconomiaSnapshotPanel />); });
  await flush();
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

beforeEach(() => {
  jest.clearAllMocks();
  // CRA's Jest config sets resetMocks:true, which wipes a mock's
  // IMPLEMENTATION — including one set inside the jest.mock factory, which
  // runs once and is never re-invoked. Re-establish every one here or the
  // second test onward silently receives `undefined`.
  createEconomyRequestId.mockImplementation(() => "cash_testrequestid0001");
  economyApi.snapshot.mockResolvedValue(SNAPSHOT);
  economyApi.listCashCounts.mockResolvedValue({ ok: true, counts: [] });
  economyApi.createCashCount.mockResolvedValue(SAVED);
});

test("shows the window economy exactly as the backend reader reported it", async () => {
  const { container, root } = await mount();
  expect(byTestId(container, "m-collected").textContent).toMatch(/262,50\s?€/);
  expect(byTestId(container, "m-cash").textContent).toMatch(/85,00\s?€/);
  expect(byTestId(container, "m-card").textContent).toMatch(/130,00\s?€/);
  expect(byTestId(container, "m-bizum").textContent).toMatch(/47,50\s?€/);
  expect(byTestId(container, "m-gross").textContent).toMatch(/262,50\s?€/);
  expect(byTestId(container, "m-tickets").textContent).toContain("5");
  unmount(container, root);
});

// ECONOMÍA REFUND REPORTING FIX — Devuelto moved into "COBRADO EN EL
// PERÍODO" (it is a receipt event, not a sale), reading receipts.refunded.
// This box is dead in the shipped app today (EconomiaPage.jsx always mounts
// this component with showEconomicWindow={false}), but this test suite
// mounts it bare and is this field's only real coverage -- proven against
// the same live UAT shape as EconomiaGeneral.test.js's cross-day case
// (#999034, 2026-08-28): a sale from an earlier day, refunded today.
test("cross-day refund: Devuelto reads receipts.refunded, never obligation.refunded", async () => {
  economyApi.snapshot.mockResolvedValue({
    ...SNAPSHOT,
    obligation: { gross: 0, unpaid: 0, voided: 0, refunded: 0 },
    receipts: { collected: -15, collectedGross: 0, refunded: 15, byMethod: { efectivo: -15, tarjeta: 0, bizum: 0, other: 0 } },
  });
  const { container, root } = await mount();
  expect(byTestId(container, "m-refund").textContent).toMatch(/15,00\s?€/);
  // And it now lives beside the other receipt-scoped figures, not the sale ones.
  expect(byTestId(container, "m-collected").parentElement).toBe(byTestId(container, "m-refund").parentElement);
  unmount(container, root);
});

test("opening the panel reads and writes nothing", async () => {
  const { container, root } = await mount();
  expect(economyApi.snapshot).toHaveBeenCalledTimes(1);
  expect(economyApi.createCashCount).not.toHaveBeenCalled();
  unmount(container, root);
});

test("every preset resolves to a plain window request", async () => {
  const { container, root } = await mount();
  for (const preset of ["ayer", "mediodia", "noche", "hoy"]) {
    click(byTestId(container, `preset-${preset}`));
    await flush();
    expect(economyApi.snapshot).toHaveBeenCalledWith(expect.objectContaining({ preset }));
  }
  expect(economyApi.createCashCount).not.toHaveBeenCalled();
  unmount(container, root);
});

test("the comparison figure is RECORDED receipts, never an expected drawer balance", async () => {
  const { container, root } = await mount();
  const tile = byTestId(container, "m-cash-recorded");
  expect(tile.textContent).toMatch(/Efectivo registrado en el período/i);
  expect(tile.textContent).toMatch(/85,00\s?€/);
  // This system models no opening float and no drawer movements, so it cannot
  // know what the drawer "should" hold and must never say that it does.
  expect(container.textContent).not.toMatch(/esperad[oa]/i);
  expect(container.textContent).not.toMatch(/descuadre|faltante/i);
  unmount(container, root);
});

test("the difference previews live, before anything is recorded", async () => {
  const { container, root } = await mount();
  type(byTestId(container, "counted-cash-input"), "80");
  await flush();
  expect(byTestId(container, "m-variance-preview").textContent).toMatch(/-5,00\s?€/);
  expect(economyApi.createCashCount).not.toHaveBeenCalled();
  unmount(container, root);
});

test("confirming records exactly one count, for the window on screen", async () => {
  const { container, root } = await mount();
  type(byTestId(container, "counted-cash-input"), "80");
  type(byTestId(container, "cash-count-note"), "UAT-CASH-COUNT-V1");
  await flush();
  click(byTestId(container, "confirm-cash-count"));
  await flush();
  expect(economyApi.createCashCount).toHaveBeenCalledTimes(1);
  expect(economyApi.createCashCount).toHaveBeenCalledWith(expect.objectContaining({
    preset: "hoy", countedCash: 80, note: "UAT-CASH-COUNT-V1",
    clientRequestId: "cash_testrequestid0001",
  }));
  expect(byTestId(container, "cash-count-saved").textContent).toMatch(/diferencia -5,00\s?€/);
  unmount(container, root);
});

test("a comma decimal is accepted, as a Spanish keypad produces it", async () => {
  const { container, root } = await mount();
  type(byTestId(container, "counted-cash-input"), "84,55");
  await flush();
  click(byTestId(container, "confirm-cash-count"));
  await flush();
  expect(economyApi.createCashCount).toHaveBeenCalledWith(expect.objectContaining({ countedCash: 84.55 }));
  unmount(container, root);
});

test("confirm stays disabled until a real amount is present", async () => {
  const { container, root } = await mount();
  expect(byTestId(container, "confirm-cash-count").disabled).toBe(true);
  type(byTestId(container, "counted-cash-input"), "abc");
  await flush();
  expect(byTestId(container, "confirm-cash-count").disabled).toBe(true);
  type(byTestId(container, "counted-cash-input"), "-3");
  await flush();
  expect(byTestId(container, "confirm-cash-count").disabled).toBe(true);
  // Zero is a legitimate count: an empty drawer is a real observation.
  type(byTestId(container, "counted-cash-input"), "0");
  await flush();
  expect(byTestId(container, "confirm-cash-count").disabled).toBe(false);
  unmount(container, root);
});

test("a refused count is reported and nothing is claimed to have been saved", async () => {
  economyApi.createCashCount.mockRejectedValue(new EconomyApiError("ECONOMY_CASH_COUNT_FORBIDDEN", 403));
  const { container, root } = await mount();
  type(byTestId(container, "counted-cash-input"), "80");
  await flush();
  click(byTestId(container, "confirm-cash-count"));
  await flush();
  expect(byTestId(container, "cash-count-error").textContent)
    .toContain("Tu perfil no puede registrar conteos de caja.");
  expect(byTestId(container, "cash-count-saved")).toBeNull();
  unmount(container, root);
});

test("window-crossing movements are surfaced, never hidden", async () => {
  economyApi.snapshot.mockResolvedValue({
    ...SNAPSHOT,
    windowCrossing: {
      obligationBeforeWindowReceiptInside: [{ orderId: "#999014" }],
      obligationInsideWindowReceiptAfter: [{ orderId: "#999016" }],
      receiptsSplitAcrossBoundary: [{ orderId: "#999015" }],
    },
  });
  const { container, root } = await mount();
  const box = byTestId(container, "window-crossing");
  // SMOKE FIX — this is now a compact one-line summary that expands. The
  // disclosure is unchanged in SUBSTANCE: the headline states how many
  // crossing receipts there are, and all three categories are still named
  // with their own counts underneath.
  expect(box.textContent).toMatch(/3 cobros a caballo del período/);
  expect(box.textContent).toMatch(/1 de pedidos anteriores al período/);
  expect(box.textContent).toMatch(/1 posteriores al período/);
  expect(box.textContent).toMatch(/1 pedido\(s\) con cobros partidos por el corte/);
  unmount(container, root);
});

test("history is listed and declared immutable", async () => {
  economyApi.listCashCounts.mockResolvedValue({
    ok: true,
    counts: [{
      id: "cc-9", countedAt: "2026-08-21T10:00:00.000Z", actor: "owner", actorRole: "admin",
      countedCash: 80, recordedCashReceipts: 85, variance: -5,
      window: { from: WINDOW.from, to: WINDOW.to, timezone: "Europe/Madrid", preset: "noche" },
      note: "UAT-CASH-COUNT-V1",
    }],
  });
  const { container, root } = await mount();
  expect(byTestId(container, "cash-count-history").textContent).toContain("UAT-CASH-COUNT-V1");
  expect(byTestId(container, "cash-count-history").textContent).toContain("owner");
  expect(byTestId(container, "history-immutable-note").textContent).toMatch(/no se editan ni se borran/i);
  unmount(container, root);
});

test("nothing on this panel can be read as finalizing a service", async () => {
  const { container, root } = await mount();
  const text = container.textContent || "";
  // The exact vocabulary behind the 2026-08-20 misunderstanding.
  for (const forbidden of [/cierre/i, /cerrar/i, /finalizar/i, /fin de servicio/i, /servicio cerrado/i]) {
    expect(text).not.toMatch(forbidden);
  }
  // And it states the opposite, out loud, where it matters most.
  expect(byTestId(container, "cash-count-not-a-close").textContent).toMatch(/no finaliza el servicio/i);
  // SMOKE FIX — the second, longer read-only paragraph was removed on purpose:
  // the panel is a picker plus a count form with no destructive control in it,
  // and the structure said what the prose was repeating. The load-bearing
  // sentence above stays; what is gone is documentation, not a guarantee.
  expect(byTestId(container, "snapshot-read-only-note")).toBeNull();
  expect(text).not.toMatch(/Solo consulta/i);
  expect(text).not.toMatch(/Elige el tramo que vas a contar/i);
  unmount(container, root);
});

test("the two economic questions are explained rather than left to collide", async () => {
  const { container, root } = await mount();
  expect(byTestId(container, "two-sets-note").textContent).toMatch(/no tienen por qué coincidir/i);
  unmount(container, root);
});
