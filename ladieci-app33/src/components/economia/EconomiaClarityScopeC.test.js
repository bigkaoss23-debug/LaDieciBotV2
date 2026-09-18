// EconomiaClarityScopeC.test.js — POST_REMEDIATION_FINAL_OPUS_REVIEW ECON-R1/ECON-R2
// (2026-09-18), superseding the POST_OPUS_REVIEW_REMEDIATION Scope C pass this file
// originally certified.
//
// THE DEFECT THIS SUITE ORIGINALLY MISSED (Opus final review, §4, ECON-R1): the Scope C
// fix bound "Por cobrar ahora" to `snapshot.obligation.unpaid` — but `unpaid` is
// WINDOW-WIDE (economicSnapshot.js: every order born in the window, operationally over
// or not), the SAME population Pendencias narrows down to `totals.porCobrar` via its own
// `isOperationallyOver` filter. So "Pendientes anteriores" ⊆ "Por cobrar ahora" for the
// same scope: 64,50 € live + 30 € historical showed as "94,50 €" next to "30,00 €", not
// two independent facts. This suite's own fixture (`unpaid: 64.5` alongside a separate
// `porCobrar: 30`) was a state the real backend can never produce for one scope — it
// certified a contract the backend does not have.
//
// THE FIX (backend-first, NO FE recomputation):
//   - economicSnapshot.js adds `obligation.currentServiceUnpaid` — the STILL-OPEN subset
//     of the SAME `unpaid` figure, filtered by the SAME `isOperationallyOver` predicate
//     Pendencias already owns (imported, not re-derived). `obligation.unpaid` itself is
//     UNCHANGED (every existing caller keeps reading it).
//   - EconomiaGeneral's KPI is rebound to `obligation.currentServiceUnpaid`, relabelled
//     "Por cobrar del servicio actual" (was "Por cobrar ahora", whose "ahora" claim also
//     didn't hold on Ayer/Personalizado/a closed Servicio).
//   - The Ventas per-order badge is renamed "Por cobrar" -> "Sin cobrar" (the previous
//     Scope C pass renamed it FROM "Pendiente" but landed on the exact word the dedicated
//     Pendientes page's own group title/summary tile already use for a different meaning).
//   - EconomiaPendientes' totally-empty state gains a scope-qualified sentence ("No hay
//     pendientes anteriores.") instead of a silent blank, so an empty historical read is
//     never misread as "nothing is owed" while the live KPI is genuinely non-zero.
//
// This suite proves the two KPIs now partition real backend money rather than overlap,
// across the required fixture matrix, with a genuine parent-negative-control test (the
// exact broken binding this file used to certify) — and that nothing here recomputes
// economics client-side.
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
// `unpaid` (window-wide, unchanged) and `currentServiceUnpaid` (the still-open subset —
// ECON-R1) are BOTH carried, exactly like the real economicSnapshot.js response shape.
// A realistic fixture keeps `unpaid >= currentServiceUnpaid` (the backend can never
// produce the inverse, since currentServiceUnpaid is a filtered subset of unpaid), but
// the two are read from two DIFFERENT fields, never derived from each other here.
const snapshotWith = ({ unpaid = 0, currentServiceUnpaid = unpaid, refunded = 0 } = {}) => Object.freeze({
  ok: true, window: WINDOW,
  obligation: { gross: 100, unpaid, currentServiceUnpaid, voided: 0, refunded },
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
// totally-empty read to its own scope-qualified marker text, unrelated to this scope's
// fix). A token requiere-revisión item forces that branch off so the "Por cobrar" group's
// own (qualified) empty text is what's actually under test.
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

describe("fixture matrix — current-service and historical partition the same money, never overlap", () => {
  // CASE 1 — current service unpaid = 64.50, historical pending = 0.
  test("current service unpaid = 64.50, historical pending = 0", async () => {
    // Realistic: nothing has left the operational phase yet, so unpaid === currentServiceUnpaid.
    economyApi.snapshot.mockResolvedValue(snapshotWith({ unpaid: 64.5, currentServiceUnpaid: 64.5 }));
    economyApi.pendencies.mockResolvedValue(pendenciesWith(0, { forceNonEmpty: true }));
    const g = await mountGeneral();
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).toMatch(/64,50\s?€/);
    expect(byTestId(g.container, "general-kpi-pendiente").textContent).toMatch(/0,00\s?€/);
    unmount(g.container, g.root);

    const p = await mountPendientes();
    expect(byTestId(p.container, "pendientes-group-cobrar-empty").textContent).toBe("Sin saldos pendientes tras cierre operativo.");
    unmount(p.container, p.root);
  });

  // CASE 2 — current = 0, historical = 30.
  test("current service unpaid = 0, historical pending > 0 (30,00 €)", async () => {
    economyApi.snapshot.mockResolvedValue(snapshotWith({ unpaid: 30, currentServiceUnpaid: 0 }));
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

  // CASE 3 — both non-zero: current 64.50 AND historical 30, on the SAME real backend
  // window-wide `unpaid` (94.50 = 64.50 still-open + 30 post-operational) — this is the
  // shape the real backend actually produces, unlike the old fixture's impossible one.
  test("both non-zero at once: 64.50 current AND 30 historical — distinct, never summed or netted", async () => {
    economyApi.snapshot.mockResolvedValue(snapshotWith({ unpaid: 94.5, currentServiceUnpaid: 64.5 }));
    economyApi.pendencies.mockResolvedValue(pendenciesWith(30));
    const g = await mountGeneral();
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).toMatch(/64,50\s?€/);
    expect(byTestId(g.container, "general-kpi-pendiente").textContent).toMatch(/30,00\s?€/);
    // Neither figure leaks into the other's tile, and the window-wide 94,50 (the old,
    // overlapping figure) never appears on screen at all.
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).not.toMatch(/94,50/);
    expect(byTestId(g.container, "general-kpi-pendiente").textContent).not.toMatch(/94,50/);
    unmount(g.container, g.root);
  });

  // CASE 4 — both zero.
  test("both zero: both KPIs read 0,00 €; Pendientes' own totally-empty state names its scope, not a silent blank", async () => {
    economyApi.snapshot.mockResolvedValue(snapshotWith({ unpaid: 0, currentServiceUnpaid: 0 }));
    economyApi.pendencies.mockResolvedValue(pendenciesWith(0));
    const g = await mountGeneral();
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).toMatch(/0,00\s?€/);
    expect(byTestId(g.container, "general-kpi-pendiente").textContent).toMatch(/0,00\s?€/);
    unmount(g.container, g.root);

    const p = await mountPendientes();
    // ECON-R2 — every group is empty here: the page no longer collapses to a silent
    // blank marker; it names its own scope ("anteriores") so it is never misread as
    // "nothing is owed" on a visit where the current service happens to owe nothing too.
    expect(byTestId(p.container, "pendientes-empty").textContent).toBe("No hay pendientes anteriores.");
    expect(byTestId(p.container, "pendientes-group-cobrar-empty")).toBeNull();
    unmount(p.container, p.root);
  });

  // CASE 5 — a partially paid active (still-open) order.
  test("a PARTIALLY paid active order: currentServiceUnpaid is the remaining balance, bound as-is (no FE arithmetic)", async () => {
    // Order total 20,00; 5,00 already collected; backend's own safeTicket derivation
    // (economicSnapshot.js) is the ONLY source of the remaining 15,00 -- this test
    // fixtures the backend's answer and asserts the KPI shows exactly that number,
    // never a value this component derived from a total/paid pair.
    economyApi.snapshot.mockResolvedValue(snapshotWith({ unpaid: 15, currentServiceUnpaid: 15 }));
    economyApi.pendencies.mockResolvedValue(pendenciesWith(0));
    const g = await mountGeneral();
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).toMatch(/15,00\s?€/);
    unmount(g.container, g.root);
  });

  // CASE 6 — a same-window refund alongside a still-open unpaid balance.
  test("refund case: a same-window refund does not interfere with the current-service unpaid KPI", async () => {
    // obligation.refunded and obligation.currentServiceUnpaid are independent exposures
    // (Over-Collected Slice A boundary already certified elsewhere) -- both non-zero at
    // once must not net against each other on this KPI.
    economyApi.snapshot.mockResolvedValue(snapshotWith({ unpaid: 64.5, currentServiceUnpaid: 64.5, refunded: 15 }));
    economyApi.pendencies.mockResolvedValue(pendenciesWith(0));
    const g = await mountGeneral();
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).toMatch(/64,50\s?€/);
    expect(byTestId(g.container, "general-kpi-devuelto").textContent).toMatch(/15,00\s?€/);
    unmount(g.container, g.root);
  });

  // CASE 7 — a historical-origin late settlement: an order already counted as
  // post-operational Pendientes is later fully collected. currentServiceUnpaid must stay
  // 0 (it was never "still open" to begin with) and the historical figure simply drops to
  // 0 too, from the SAME Pendencias reader — no interaction between the two KPIs.
  test("historical-origin late settlement: currentServiceUnpaid stays 0, historical drops to 0 from its own reader", async () => {
    economyApi.snapshot.mockResolvedValue(snapshotWith({ unpaid: 0, currentServiceUnpaid: 0 }));
    economyApi.pendencies.mockResolvedValue(pendenciesWith(0));
    const g = await mountGeneral();
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).toMatch(/0,00\s?€/);
    expect(byTestId(g.container, "general-kpi-pendiente").textContent).toMatch(/0,00\s?€/);
    unmount(g.container, g.root);
  });
});

describe("PARENT NEGATIVE CONTROL — the exact broken binding this suite used to certify", () => {
  test("if the KPI were still bound to window-wide obligation.unpaid, it would wrongly show 94,50 (this must fail on the real fix)", async () => {
    // The real backend shape for "64,50 still open + 30 post-operational, same scope":
    // unpaid (window-wide) = 94.5, currentServiceUnpaid (still-open subset) = 64.5.
    const snapshot = snapshotWith({ unpaid: 94.5, currentServiceUnpaid: 64.5 });
    economyApi.snapshot.mockResolvedValue(snapshot);
    economyApi.pendencies.mockResolvedValue(pendenciesWith(30));
    const g = await mountGeneral();
    const kpiText = byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent;
    // The pre-remediation binding (`obligation.unpaid`) would show 94,50 here — proving
    // this assertion actually discriminates: swapping the component back to read
    // `obligation.unpaid` instead of `obligation.currentServiceUnpaid` makes this fail.
    expect(kpiText).not.toMatch(/94,50/);
    expect(kpiText).toMatch(/64,50\s?€/);
    unmount(g.container, g.root);
  });
});

describe("Ventas copy: the live per-order badge shares no word with the historical KPI or the Pendientes page", () => {
  test('a Ventas row for an unpaid order says "Sin cobrar", never "Pendiente" or "Por cobrar"', async () => {
    economyApi.snapshot.mockResolvedValue({
      ...snapshotWith({ unpaid: 64.5, currentServiceUnpaid: 64.5 }),
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
    expect(row.textContent).toContain("Sin cobrar");
    expect(row.textContent).not.toContain("Pendiente");
    expect(row.textContent).not.toContain("Por cobrar");
    unmount(g.container, g.root);
  });
});

describe("no FE economic recomputation", () => {
  test("Por cobrar del servicio actual is bound to obligation.currentServiceUnpaid verbatim, not derived from gross/collected", async () => {
    // gross=100, collected would suggest 100-40=60 if this component ever subtracted
    // client-side -- obligation.currentServiceUnpaid says 7.25 instead (an arbitrary,
    // non-derivable figure). The KPI must show exactly 7,25, proving it never computes
    // its own, and never falls back to obligation.unpaid either.
    economyApi.snapshot.mockResolvedValue({
      ...snapshotWith({ unpaid: 7.25, currentServiceUnpaid: 7.25 }),
      obligation: { gross: 100, unpaid: 40, currentServiceUnpaid: 7.25, voided: 0, refunded: 0 },
      receipts: { collected: 40, collectedGross: 100, refunded: 0, byMethod: { efectivo: 40, tarjeta: 0, bizum: 0, other: 0 } },
    });
    economyApi.pendencies.mockResolvedValue(pendenciesWith(0));
    const g = await mountGeneral();
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).toMatch(/7,25\s?€/);
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).not.toMatch(/60,00/);
    expect(byTestId(g.container, "general-kpi-por-cobrar-ahora").textContent).not.toMatch(/40,00/);
    unmount(g.container, g.root);
  });
});
