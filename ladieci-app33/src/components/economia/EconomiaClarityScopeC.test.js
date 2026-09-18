// EconomiaClarityScopeC.test.js — POST_OPUS_REVIEW_REMEDIATION Scope C (2026-09-18).
//
// THE DEFECT (Opus review, §3): Economía could show "Pendiente 0,00 €" while a
// still-active service genuinely owed real money (e.g. 64,50 €) — two canonically
// correct numbers (current-service unpaid exposure vs. post-operational Pendientes)
// sharing one ambiguous label across three surfaces (General's KPI, Ventas' per-order
// badge, the Pendientes page). The backend ledger was never wrong; the operator-facing
// semantics were.
//
// THE FIX (presentation-only, NO new endpoint, NO FE recomputation):
//   - EconomiaGeneral gains a "Por cobrar ahora" KPI bound AS-IS to the already-present
//     canonical `snapshot.obligation.unpaid` (economicSnapshot.js).
//   - The existing "Pendiente" KPI is renamed "Pendientes anteriores" (still
//     `totals.porCobrar` from Pendencias, unchanged).
//   - Ventas' per-order badge is renamed "Pendiente" -> "Por cobrar" (still
//     `unpaidAmount > 0`, unchanged) so it no longer collides with the KPI above it.
//   - EconomiaPendientes' "Por cobrar" empty text is qualified ("... tras cierre
//     operativo") so it cannot read as "nothing is owed".
//
// This suite proves all three surfaces communicate BOTH facts correctly across the
// required fixture matrix, and that nothing here ever recomputes economics client-side.
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/economia/EconomiaClarityScopeC.test.js

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
const EconomiaPendientes = require("./EconomiaPendientes").default;
const { economyApi } = require("../../economy/economyApi");

const WINDOW = Object.freeze({
  preset: "hoy", label: "Hoy",
  from: "2026-09-18T02:00:00.000Z", to: "2026-09-18T12:00:00.000Z",
  timezone: "Europe/Madrid", businessDate: "2026-09-18", serviceSessionId: null,
  bounds: "[from,to)", asOf: "2026-09-18T12:00:00.000Z", generatedAt: "2026-09-18T12:00:00.000Z",
});
const NO_CROSSING = Object.freeze({
  obligationBeforeWindowReceiptInside: [], obligationInsideWindowReceiptAfter: [], receiptsSplitAcrossBoundary: [],
});
// The one number this whole suite is about: obligation.unpaid, read AS-IS, never
// recomputed. `refunded` is carried too, for the combined refund fixture below.
const snapshotWith = ({ unpaid = 0, refunded = 0 } = {}) => Object.freeze({
  ok: true, window: WINDOW,
  obligation: { gross: 100, unpaid, voided: 0, refunded },
  receipts: { collected: 100 - unpaid, collectedGross: 100, refunded, byMethod: { efectivo: 100 - unpaid, tarjeta: 0, bizum: 0, other: 0 } },
  balance: { unpaid, overCollected: 0, unresolvedOverCollected: 0 },
  counts: { obligations: 1, obligationsCancelled: 0, obligationsUnpaid: unpaid > 0 ? 1 : 0, receiptEvents: 1, payments: 1, refunds: refunded > 0 ? 1 : 0 },
  economicBreakdown: { obligations: {}, receipts: {}, source: "stamped_era_read_rule" },
  windowCrossing: NO_CROSSING,
  drillDown: { obligations: [], receipts: [], legacyReceipts: [] },
  serviceProvenance: [],
});
// `forceNonEmpty`: the Group component only renders a per-group empty TEXT when the
// page as a whole is not fully empty (useEconomyPendencies' `isEmpty` short-circuits a
// totally-empty read to a silent blank marker, unrelated to this scope's fix). A token
// requiere-revisión item forces that branch off so the "Por cobrar" group's own
// (qualified) empty text is what's actually under test.
const pendenciesWith = (porCobrar, { forceNonEmpty = false } = {}) => Object.freeze({
  ok: true, generatedAt: "2026-09-18T12:00:00.000Z",
  porCobrar: porCobrar > 0 ? [{
    direction: "POR_COBRAR", orderUid: "uid-hist-1", amount: porCobrar, currentObligation: porCobrar,
    netCollected: 0, originalDate: "2026-09-10T18:00:00.000Z", originalBusinessDate: "2026-09-10",
    lastMovementAt: "2026-09-10T18:05:00.000Z", ageDays: 8, channel: "RETIRO",
    display: { orderNumber: "#888001", tableNumber: null, tableName: null, commandNumber: null },
    customer: { name: "Cliente Histórico", phone: "600000000" }, allowedActions: [], identityConfidence: "STABLE",
  }] : [],
  porDevolver: [],
  requiereRevision: forceNonEmpty ? [{
    status: "REQUIERE_REVISION", reasonCode: "ORPHANED_LEDGER_EVENT", amount: 1, direction: null,
    orderDisplay: "#888099", originalDate: "2026-09-10T15:00:00.000Z", channel: null,
    note: "fixture",
  }] : [],
  counts: { porCobrar: porCobrar > 0 ? 1 : 0, porDevolver: 0, requiereRevision: forceNonEmpty ? 1 : 0 },
  totals: { porCobrar, porDevolver: 0 },
  scope: null, window: null,
});

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
function byTestId(c, id) { return c.querySelector(`[data-testid="${id}"]`); }
async function mountGeneral() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<EconomiaGeneral />); });
  await flush();
  return { container, root };
}
async function mountPendientes() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<EconomiaPendientes />); });
  await flush();
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

beforeEach(() => {
  jest.clearAllMocks();
  economyApi.listCashCounts.mockResolvedValue({ ok: true, counts: [], scope: null, window: null });
});

describe("fixture matrix — both facts communicated correctly, never netted or recomputed", () => {
  test("active unpaid = 64.50, historical pending = 0", async () => {
    economyApi.snapshot.mockResolvedValue(snapshotWith({ unpaid: 64.5 }));
    economyApi.pendencies.mockResolvedValue(pendenciesWith(0, { forceNonEmpty: true }));
    const g = await mountGeneral();
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).toMatch(/64,50\s?€/);
    expect(byTestId(g.container, "general-kpi-pendiente").textContent).toMatch(/0,00\s?€/);
    unmount(g.container, g.root);

    const p = await mountPendientes();
    expect(byTestId(p.container, "pendientes-group-cobrar-empty").textContent).toBe("Sin saldos pendientes tras cierre operativo.");
    unmount(p.container, p.root);
  });

  test("active unpaid = 0, historical pending > 0 (30,00 €)", async () => {
    economyApi.snapshot.mockResolvedValue(snapshotWith({ unpaid: 0 }));
    economyApi.pendencies.mockResolvedValue(pendenciesWith(30));
    const g = await mountGeneral();
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).toMatch(/0,00\s?€/);
    expect(byTestId(g.container, "general-kpi-pendiente").textContent).toMatch(/30,00\s?€/);
    unmount(g.container, g.root);

    const p = await mountPendientes();
    expect(byTestId(p.container, "pendientes-group-cobrar-empty")).toBeNull();
    expect(byTestId(p.container, "pendientes-item-cobrar").textContent).toMatch(/30,00\s?€/);
    unmount(p.container, p.root);
  });

  test("both non-zero at once: 64.50 active AND 30 historical — distinct, never summed or netted", async () => {
    economyApi.snapshot.mockResolvedValue(snapshotWith({ unpaid: 64.5 }));
    economyApi.pendencies.mockResolvedValue(pendenciesWith(30));
    const g = await mountGeneral();
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).toMatch(/64,50\s?€/);
    expect(byTestId(g.container, "general-kpi-pendiente").textContent).toMatch(/30,00\s?€/);
    // Neither figure leaks into the other's tile (e.g. no 94,50 anywhere).
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).not.toMatch(/94,50/);
    expect(byTestId(g.container, "general-kpi-pendiente").textContent).not.toMatch(/94,50/);
    unmount(g.container, g.root);
  });

  test("both zero: both KPIs read 0,00 €; Pendientes' own totally-empty state stays a silent blank (not misleading text)", async () => {
    economyApi.snapshot.mockResolvedValue(snapshotWith({ unpaid: 0 }));
    economyApi.pendencies.mockResolvedValue(pendenciesWith(0));
    const g = await mountGeneral();
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).toMatch(/0,00\s?€/);
    expect(byTestId(g.container, "general-kpi-pendiente").textContent).toMatch(/0,00\s?€/);
    unmount(g.container, g.root);

    const p = await mountPendientes();
    // Every group is empty here: useEconomyPendencies' own isEmpty collapses the page
    // to a silent blank marker (VISUAL_CONSISTENCY_PASS_1) rather than any group text
    // -- genuinely non-misleading (it says nothing, rather than saying something false).
    expect(byTestId(p.container, "pendientes-empty")).toBeTruthy();
    expect(byTestId(p.container, "pendientes-group-cobrar-empty")).toBeNull();
    unmount(p.container, p.root);
  });

  test("a PARTIALLY paid active order: obligation.unpaid is the remaining balance, bound as-is (no FE arithmetic)", async () => {
    // Order total 20,00; 5,00 already collected; backend's own safeTicket derivation
    // (economicSnapshot.js) is the ONLY source of the remaining 15,00 -- this test
    // fixtures the backend's answer and asserts the KPI shows exactly that number,
    // never a value this component derived from a total/paid pair.
    economyApi.snapshot.mockResolvedValue(snapshotWith({ unpaid: 15 }));
    economyApi.pendencies.mockResolvedValue(pendenciesWith(0));
    const g = await mountGeneral();
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).toMatch(/15,00\s?€/);
    unmount(g.container, g.root);
  });

  test("refund case: a same-window refund does not interfere with the unpaid-exposure KPI", async () => {
    // obligation.refunded and obligation.unpaid are independent exposures (Over-
    // Collected Slice A boundary already certified elsewhere) -- both non-zero at
    // once must not net against each other on this KPI.
    economyApi.snapshot.mockResolvedValue(snapshotWith({ unpaid: 64.5, refunded: 15 }));
    economyApi.pendencies.mockResolvedValue(pendenciesWith(0));
    const g = await mountGeneral();
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).toMatch(/64,50\s?€/);
    expect(byTestId(g.container, "general-kpi-devuelto").textContent).toMatch(/15,00\s?€/);
    unmount(g.container, g.root);
  });
});

describe("Ventas copy: the live per-order badge no longer collides with the historical KPI's word", () => {
  test('a Ventas row for an unpaid order says "Por cobrar", never "Pendiente"', async () => {
    economyApi.snapshot.mockResolvedValue({
      ...snapshotWith({ unpaid: 64.5 }),
      drillDown: {
        obligations: [{ id: "#999040", amount: 64.5, unpaidAmount: 64.5, cancelled: false, refundedAmount: 0, time: "20:10" }],
        receipts: [], legacyReceipts: [],
      },
      counts: { obligations: 1, obligationsCancelled: 0, obligationsUnpaid: 1, receiptEvents: 0, payments: 0, refunds: 0 },
    });
    economyApi.pendencies.mockResolvedValue(pendenciesWith(0));
    const g = await mountGeneral();
    act(() => { byTestId(g.container, "general-view-ventas").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await flush();
    const row = byTestId(g.container, "general-ventas-row");
    expect(row.textContent).toContain("Por cobrar");
    expect(row.textContent).not.toContain("Pendiente");
    unmount(g.container, g.root);
  });
});

describe("no FE economic recomputation", () => {
  test("Por cobrar ahora is bound to obligation.unpaid verbatim, not derived from gross/collected", async () => {
    // gross=100, collected would suggest 100-40=60 if this component ever subtracted
    // client-side -- obligation.unpaid says 7.25 instead (an arbitrary, non-derivable
    // figure). The KPI must show exactly 7,25, proving it never computes its own.
    economyApi.snapshot.mockResolvedValue({ ...snapshotWith({ unpaid: 7.25 }), obligation: { gross: 100, unpaid: 7.25, voided: 0, refunded: 0 }, receipts: { collected: 40, collectedGross: 100, refunded: 0, byMethod: { efectivo: 40, tarjeta: 0, bizum: 0, other: 0 } } });
    economyApi.pendencies.mockResolvedValue(pendenciesWith(0));
    const g = await mountGeneral();
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).toMatch(/7,25\s?€/);
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).not.toMatch(/60,00/);
    unmount(g.container, g.root);
  });
});
