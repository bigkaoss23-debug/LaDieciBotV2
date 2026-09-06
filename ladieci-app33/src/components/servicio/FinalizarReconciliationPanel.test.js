// ===============================================================
// J-1 — mounts the REAL Finalizar reconciliation panel.
//
// The figures are the certified staging ones. The decisive tests are the last
// few: the panel must never let an operator read the service's 85,00 € and
// the day's 157,50 € as the same number, and must never show a variance
// derived from a cash count whose window does not match.
// ===============================================================

import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

const FinalizarReconciliationPanel = require("./FinalizarReconciliationPanel").default;

const DAY_FROM = "2026-08-20T02:00:00.000Z";
const DAY_TO = "2026-08-21T02:00:00.000Z";

const DATA = Object.freeze({
  ok: true,
  serviceSessionId: "480eca89-33cd-43ba-ac7f-5ed0a0473639",
  businessDate: "2026-08-20",
  status: "open",
  service: {
    scope: "service", orderCount: 5,
    gross: 262.5, collected: 262.5, unpaid: 0, voided: 0, refunded: 0,
    byMethod: { efectivo: 85, tarjeta: 130, bizum: 47.5, other: 0 },
  },
  reconciliation: {
    scope: "business_day",
    window: { from: DAY_FROM, to: DAY_TO, timezone: "Europe/Madrid", preset: "hoy" },
    businessDate: "2026-08-20",
    orderCount: 12, gross: 406, collected: 386.5, unpaid: 19.5, voided: 10, refunded: 0,
    byMethod: { efectivo: 157.5, tarjeta: 142, bizum: 87, other: 0 },
    cashReceipts: 157.5, serviceCount: 2, serviceProvenance: [],
  },
  cashCount: {
    id: "77f010ad-d82f-49c5-8afd-633cadf4deb0",
    countedAt: "2026-08-21T15:43:01.033Z", actor: "owner",
    countedCash: 150, recordedCashReceiptsAtCount: 157.5, note: "UAT-CASH-COUNT-V1",
    window: { from: DAY_FROM, to: DAY_TO, timezone: "Europe/Madrid", preset: "ayer" },
    windowMatchesExactly: true,
  },
  cashCountCandidates: 1,
  variance: -7.5,
  varianceSemantics: "counted_minus_recorded_receipts",
  drawerMovementsModeled: false,
});

function byTestId(c, id) { return c.querySelector(`[data-testid="${id}"]`); }
async function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<FinalizarReconciliationPanel {...props} />); });
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

test("the service scope shows the closing service's own certified economy", async () => {
  const { container, root } = await mount({ data: DATA });
  const scope = byTestId(container, "scope-service");
  expect(scope.textContent).toContain("Este servicio");
  expect(byTestId(container, "svc-tickets").textContent).toContain("5");
  expect(byTestId(container, "svc-gross").textContent).toMatch(/262,50\s?€/);
  expect(byTestId(container, "svc-collected").textContent).toMatch(/262,50\s?€/);
  expect(byTestId(container, "svc-cash").textContent).toMatch(/85,00\s?€/);
  expect(byTestId(container, "svc-card").textContent).toMatch(/130,00\s?€/);
  expect(byTestId(container, "svc-bizum").textContent).toMatch(/47,50\s?€/);
  unmount(container, root);
});

test("the day scope shows the Business Day, with its window and service count", async () => {
  const { container, root } = await mount({ data: DATA });
  const scope = byTestId(container, "scope-day");
  expect(scope.textContent).toContain("Día operativo 20/08");
  expect(byTestId(container, "day-window").textContent).toMatch(/hora de Madrid/);
  expect(byTestId(container, "day-gross").textContent).toMatch(/406,00\s?€/);
  expect(byTestId(container, "day-collected").textContent).toMatch(/386,50\s?€/);
  expect(byTestId(container, "day-cash").textContent).toMatch(/157,50\s?€/);
  expect(byTestId(container, "day-tickets").textContent).toContain("12");
  unmount(container, root);
});

test("the compatible cash count and its variance are shown with honest wording", async () => {
  const { container, root } = await mount({ data: DATA });
  expect(byTestId(container, "day-counted").textContent).toMatch(/150,00\s?€/);
  const v = byTestId(container, "day-variance");
  expect(v.textContent).toContain("Diferencia frente al efectivo registrado");
  expect(v.textContent).toMatch(/-7,50\s?€/);
  // Opening float and drawer movements are unmodelled, and the panel says so.
  expect(byTestId(container, "variance-note").textContent)
    .toMatch(/no incluye fondo inicial ni movimientos manuales de caja/i);
  // It must never present the difference as an accounting verdict.
  expect(container.textContent).not.toMatch(/descuadre|faltante|robo|p[ée]rdida/i);
  unmount(container, root);
});

test("the two scopes are never presented as one number", async () => {
  const { container, root } = await mount({ data: DATA });
  // Each figure lives inside its own labelled block.
  expect(byTestId(container, "scope-service").textContent).toMatch(/85,00\s?€/);
  expect(byTestId(container, "scope-service").textContent).not.toMatch(/157,50\s?€/);
  expect(byTestId(container, "scope-day").textContent).toMatch(/157,50\s?€/);
  expect(byTestId(container, "scope-day").textContent).not.toMatch(/262,50\s?€/);
  // And nowhere does the panel print a merged total of the two.
  expect(container.textContent).not.toContain("668,50");
  expect(container.textContent).not.toContain("649,00");
  unmount(container, root);
});

test("differing cash figures are explained by RECEIPTS, never by a claimed number of services", async () => {
  // SMOKE FIX — this line used to assert "este día operativo tuvo 2 servicios".
  // On 2026-08-25 it said exactly that while ONE service_session belonged to
  // the business date: the extra cash was a payment taken today for an older
  // service. Money received today is a receipt fact and says nothing about how
  // many services the day holds, so the copy now states only the two figures.
  const { container, root } = await mount({ data: DATA });
  const note = byTestId(container, "scope-explainer");
  expect(note.textContent).toMatch(/157,50\s?€/);
  expect(note.textContent).toMatch(/85,00\s?€/);
  expect(note.textContent).not.toMatch(/servicios/i);
  unmount(container, root);
});

test("the explainer follows the figures, not serviceCount: one service can still differ", async () => {
  // The real 25/08 shape: a single service on the business date, and day cash
  // larger than this service's because of a receipt for an older one.
  const single = { ...DATA, reconciliation: { ...DATA.reconciliation, serviceCount: 1 } };
  const { container, root } = await mount({ data: single });
  const note = byTestId(container, "scope-explainer");
  expect(note).not.toBeNull();
  expect(note.textContent).not.toMatch(/servicios/i);
  unmount(container, root);
});

test("when the two cash figures agree there is nothing to explain, and nothing is said", async () => {
  // The honest condition is "do these numbers differ?", not "how many services
  // does the backend think the day had?".
  const agreeing = { ...DATA, reconciliation: { ...DATA.reconciliation, cashReceipts: 85 } };
  const { container, root } = await mount({ data: agreeing });
  expect(byTestId(container, "scope-explainer")).toBeNull();
  unmount(container, root);
});

test("no compatible cash count says so, and shows NO variance", async () => {
  const none = { ...DATA, cashCount: null, cashCountCandidates: 0, variance: null };
  const { container, root } = await mount({ data: none });
  expect(byTestId(container, "no-cash-count").textContent)
    .toMatch(/No hay conteo de caja compatible para este per[íi]odo/i);
  // Absent, not zero: 0,00 € would assert an agreement nobody verified.
  expect(byTestId(container, "day-variance")).toBeNull();
  expect(byTestId(container, "day-counted")).toBeNull();
  // The economy is still fully reported.
  expect(byTestId(container, "day-cash").textContent).toMatch(/157,50\s?€/);
  unmount(container, root);
});

test("an over-count reads positive, an exact count reads zero", async () => {
  for (const [variance, counted] of [[2.75, 160.25], [0, 157.5]]) {
    const d = { ...DATA, variance, cashCount: { ...DATA.cashCount, countedCash: counted } };
    const { container, root } = await mount({ data: d });
    expect(byTestId(container, "day-variance").textContent)
      .toMatch(new RegExp(`${String(variance.toFixed(2)).replace('.', ',')}\\s?€`));
    unmount(container, root);
  }
});

test("a preflight failure is reported and never blocks the close", async () => {
  const { container, root } = await mount({ data: null, error: "Sin conexión con el servidor." });
  expect(byTestId(container, "reconciliation-error").textContent)
    .toContain("No se pudo cargar el resumen económico");
  expect(byTestId(container, "reconciliation-error").textContent)
    .toContain("Sin conexión con el servidor.");
  // Crucially: it renders an advisory, not a blocker — no scope blocks, and
  // nothing here disables anything.
  expect(byTestId(container, "scope-service")).toBeNull();
  unmount(container, root);
});

test("while loading it says so and asserts nothing about money", async () => {
  const { container, root } = await mount({ data: null, loading: true });
  expect(byTestId(container, "reconciliation-loading").textContent).toMatch(/Cargando resumen econ[óo]mico/i);
  expect(container.textContent).not.toMatch(/€/);
  unmount(container, root);
});

test("nothing in this panel claims to reset, archive or delete anything", async () => {
  const { container, root } = await mount({ data: DATA });
  const text = container.textContent || "";
  for (const forbidden of [/anular/i, /reiniciar/i, /borrar/i, /eliminar/i, /archivar/i, /vaciar caja/i]) {
    expect(text).not.toMatch(forbidden);
  }
  unmount(container, root);
});

// ===============================================================
// J-2 — the stale cash count. A count is a fact at an instant.
//
// Reproduced from the real staging case of 2026-08-22: counted 65,00 € at
// 13:35 against a recorded 65,00 €, then 51,00 € more came in and the day's
// recorded cash became 116,00 €. The panel must NEVER print «-51,00 €».
// ===============================================================

const DAY22_FROM = "2026-08-22T02:00:00.000Z";
const DAY22_TO = "2026-08-23T02:00:00.000Z";

const STALE_COUNT = Object.freeze({
  id: "10d61ed6-2d71-4421-8d73-ac3fd984eb5b",
  countedAt: "2026-08-22T11:35:06.567Z", actor: "owner",
  countedCash: 65, recordedCashReceiptsAtCount: 65, recordedCashReceiptsNow: 116,
  note: null,
  window: { from: DAY22_FROM, to: DAY22_TO, timezone: "Europe/Madrid", preset: "hoy" },
  windowMatchesExactly: true, isCurrent: false, staleReason: "recorded_cash_receipts_changed",
});

// What the FIXED backend sends: the count reported, but not attached.
const STALE_DATA = Object.freeze({
  ...DATA,
  businessDate: "2026-08-22",
  reconciliation: {
    ...DATA.reconciliation,
    businessDate: "2026-08-22",
    window: { from: DAY22_FROM, to: DAY22_TO, timezone: "Europe/Madrid", preset: "hoy" },
    byMethod: { efectivo: 116, tarjeta: 0, bizum: 0, other: 0 },
    cashReceipts: 116, serviceCount: 1,
  },
  cashCount: null,
  latestCashCount: STALE_COUNT,
  cashCountStatus: "stale",
  cashCountStaleReason: "recorded_cash_receipts_changed",
  cashCountCandidates: 1,
  variance: null,
});

test("J-2 · a stale count NEVER renders the fabricated -51,00 € difference", async () => {
  const { container, root } = await mount({ data: STALE_DATA });
  // The bug, stated as an assertion.
  expect(container.textContent).not.toContain("-51,00");
  expect(container.textContent).not.toContain("51,00 €");
  expect(byTestId(container, "day-variance")).toBeNull();
  expect(byTestId(container, "day-counted")).toBeNull();
  // And it must not have silently degraded into "no count exists" either.
  expect(byTestId(container, "no-cash-count")).toBeNull();
  unmount(container, root);
});

test("J-2 · the stale count is shown as history, with the figures that explain it", async () => {
  const { container, root } = await mount({ data: STALE_DATA });
  const box = byTestId(container, "stale-cash-count");
  expect(box).not.toBeNull();
  expect(box.textContent).toMatch(/No hay un conteo de caja actual/i);
  const detail = byTestId(container, "stale-cash-count-detail").textContent;
  expect(detail).toMatch(/65,00\s?€/);            // what was counted
  expect(detail).toMatch(/116,00\s?€/);           // what is recorded now
  expect(detail).toMatch(/13:35/);                // and when it was taken
  // The operator is told what to do, and that closing is still allowed.
  const guidance = byTestId(container, "stale-cash-count-guidance").textContent;
  expect(guidance).toMatch(/registra un conteo nuevo/i);
  expect(guidance).toMatch(/finalizar el servicio sin conteo/i);
  // The count was never wrong, and the panel says so rather than implying it.
  expect(guidance).toMatch(/sigue siendo válido para su momento/i);
  unmount(container, root);
});

test("J-2 · a stale count is never worded as a loss or an accusation", async () => {
  const { container, root } = await mount({ data: STALE_DATA });
  const text = container.textContent || "";
  for (const forbidden of [/descuadre/i, /faltante/i, /falta[nr]/i, /robo/i, /p[ée]rdida/i, /error del conteo/i]) {
    expect(text).not.toMatch(forbidden);
  }
  // The day's economy is still reported in full — nothing is hidden.
  expect(byTestId(container, "day-cash").textContent).toMatch(/116,00\s?€/);
  unmount(container, root);
});

test("J-2 · a current count still shows its variance — the gate did not disable comparison", async () => {
  const current = {
    ...STALE_DATA,
    cashCount: { ...STALE_COUNT, countedCash: 116, recordedCashReceiptsAtCount: 116, isCurrent: true, staleReason: null },
    latestCashCount: { ...STALE_COUNT, countedCash: 116, recordedCashReceiptsAtCount: 116, isCurrent: true, staleReason: null },
    cashCountStatus: "current", cashCountStaleReason: null, variance: 0,
  };
  const { container, root } = await mount({ data: current });
  expect(byTestId(container, "stale-cash-count")).toBeNull();
  expect(byTestId(container, "day-counted").textContent).toMatch(/116,00\s?€/);
  expect(byTestId(container, "day-variance").textContent).toMatch(/0,00\s?€/);
  unmount(container, root);
});

test("J-2 · a real shortfall against a CURRENT count is still reported", async () => {
  const short = {
    ...STALE_DATA,
    cashCount: { ...STALE_COUNT, countedCash: 111, recordedCashReceiptsAtCount: 116, isCurrent: true, staleReason: null },
    latestCashCount: { ...STALE_COUNT, countedCash: 111, recordedCashReceiptsAtCount: 116, isCurrent: true, staleReason: null },
    cashCountStatus: "current", cashCountStaleReason: null, variance: -5,
  };
  const { container, root } = await mount({ data: short });
  expect(byTestId(container, "day-variance").textContent).toMatch(/-5,00\s?€/);
  unmount(container, root);
});

test("J-2 · with no count at all the panel still says exactly that", async () => {
  const none = { ...STALE_DATA, cashCount: null, latestCashCount: null, cashCountStatus: "none", cashCountCandidates: 0, variance: null };
  const { container, root } = await mount({ data: none });
  expect(byTestId(container, "no-cash-count").textContent)
    .toMatch(/No hay conteo de caja compatible para este per[íi]odo/i);
  expect(byTestId(container, "stale-cash-count")).toBeNull();
  expect(byTestId(container, "day-variance")).toBeNull();
  unmount(container, root);
});

test("J-2 · a backend that predates the field cannot make the panel print a false difference", async () => {
  // The deploy window: an older payload still attaches the count and sends the
  // arithmetic variance. The panel can see the count was taken against 65,00 €
  // while the day now records 116,00 €, and refuses the comparison.
  const legacyPayload = {
    ...STALE_DATA,
    cashCount: STALE_COUNT,
    latestCashCount: undefined,
    cashCountStatus: undefined,
    cashCountStaleReason: undefined,
    variance: -51,
  };
  const { container, root } = await mount({ data: legacyPayload });
  expect(container.textContent).not.toContain("-51,00");
  expect(byTestId(container, "day-variance")).toBeNull();
  expect(byTestId(container, "stale-cash-count")).not.toBeNull();
  unmount(container, root);
});

// ===============================================================
// FINALIZAR CLOSEOUT CONTRACT HARDENING — 2026-09-06
//
// The audited service 42af1de9 showed Total 161 / Cobrado 139 / Pendiente 32,
// with no way to see that the missing 10 was an over-collection on one order
// (obligation 60, net collected 70). And its window sat entirely OUTSIDE its
// Business Day window, so "hoy se cobraron 89,50 €. De este servicio: 70,00 €"
// was a false subset claim — the service's real share of that 89,50 € was 0.
// The backend now publishes service.overCollected and scopeRelation; this
// panel renders them and NEVER does the arithmetic itself.
// ===============================================================

// The audited shape, as the hardened backend now sends it.
const AUDITED = Object.freeze({
  ...DATA,
  service: {
    scope: "service", orderCount: 4,
    gross: 161, collected: 139, unpaid: 32, voided: 0, refunded: 0,
    overCollected: 10, unresolvedOverCollected: 10,
    byMethod: { efectivo: 70, tarjeta: 69, bizum: 0, other: 0 },
  },
  reconciliation: {
    ...DATA.reconciliation,
    businessDate: "2026-08-25",
    window: { from: "2026-08-25T02:00:00.000Z", to: "2026-08-26T02:00:00.000Z", timezone: "Europe/Madrid", preset: "hoy" },
    orderCount: 5, gross: 215.5, collected: 158.5, unpaid: 32, voided: 0, refunded: 0,
    overCollected: 10, unresolvedOverCollected: 10,
    byMethod: { efectivo: 89.5, tarjeta: 69, bizum: 0, other: 0 },
    cashReceipts: 89.5, serviceCount: 1, serviceProvenance: [],
  },
  cashCount: null, latestCashCount: null, cashCountStatus: "none",
  cashCountCandidates: 0, variance: null,
  scopeRelation: {
    kind: "crossing", serviceWithinDay: false, cashCountComparable: false,
    serviceWindow: { from: "2026-08-25T17:02:59.058Z", to: "2026-09-06T10:00:00.000Z" },
    dayWindow: { from: "2026-08-25T02:00:00.000Z", to: "2026-08-26T02:00:00.000Z" },
  },
});

test("K5 · the service outstanding row is labelled 'Saldo pendiente', not the generic 'Pendiente'", async () => {
  const { container, root } = await mount({ data: AUDITED });
  const row = byTestId(container, "svc-unpaid");
  expect(row.textContent).toMatch(/saldo pendiente/i);
  expect(row.textContent).toMatch(/32,00\s?€/);
  unmount(container, root);
});

test("K1 · when the backend reports overCollected > 0 the panel shows 'Cobrado de más' with that exact figure", async () => {
  const { container, root } = await mount({ data: AUDITED });
  const over = byTestId(container, "svc-overcollected");
  expect(over).not.toBeNull();
  expect(over.textContent).toMatch(/cobrado de más/i);
  expect(over.textContent).toMatch(/10,00\s?€/);
  // The two exposures are shown side by side, never netted into one number.
  expect(byTestId(container, "svc-unpaid").textContent).toMatch(/32,00\s?€/);
  // 22,00 (= 161 - 139) is NOT printed as any figure: the panel does no such
  // subtraction.
  expect(byTestId(container, "scope-service").textContent).not.toMatch(/22,00\s?€/);
  unmount(container, root);
});

test("K1 · overCollected 0 (or absent) shows no 'Cobrado de más' row at all", async () => {
  for (const svc of [{ ...AUDITED.service, overCollected: 0 }, { ...AUDITED.service, overCollected: undefined }]) {
    const { container, root } = await mount({ data: { ...AUDITED, service: svc } });
    expect(byTestId(container, "svc-overcollected")).toBeNull();
    unmount(container, root);
  }
});

test("K2 · when the scopes cross, the 'de este servicio' sentence is NOT rendered", async () => {
  const { container, root } = await mount({ data: AUDITED });
  // 89,50 ≠ 70,00, so the OLD gate would have shown the sentence.
  expect(byTestId(container, "scope-explainer")).toBeNull();
  expect(container.textContent).not.toMatch(/De este servicio/i);
  unmount(container, root);
});

test("K3 · a crossing service is stated once, so 'Diferencia' cannot read as 'this service reconciles'", async () => {
  const { container, root } = await mount({ data: AUDITED });
  const note = byTestId(container, "scope-crossing-note");
  expect(note).not.toBeNull();
  expect(note.textContent).toMatch(/per[íi]odo distinto/i);
  unmount(container, root);
});

test("K2 · when the backend says the scopes ARE comparable, the sentence still renders", async () => {
  const nested = {
    ...AUDITED,
    scopeRelation: { ...AUDITED.scopeRelation, kind: "nested", serviceWithinDay: true, cashCountComparable: true },
  };
  const { container, root } = await mount({ data: nested });
  expect(byTestId(container, "scope-crossing-note")).toBeNull();
  const note = byTestId(container, "scope-explainer");
  expect(note).not.toBeNull();
  expect(note.textContent).toMatch(/89,50\s?€/);
  expect(note.textContent).toMatch(/70,00\s?€/);
  unmount(container, root);
});

test("a payload with NO scopeRelation (older backend) keeps the pre-hardening behaviour", async () => {
  // DATA has no scopeRelation and service efectivo 85 ≠ day cash 157,5.
  const { container, root } = await mount({ data: DATA });
  expect(byTestId(container, "scope-crossing-note")).toBeNull();
  expect(byTestId(container, "scope-explainer")).not.toBeNull();
  unmount(container, root);
});

test("ANTI-PATCH · the panel source does no economic arithmetic on the service figures", () => {
  const raw = require("fs").readFileSync(require("path").join(__dirname, "FinalizarReconciliationPanel.jsx"), "utf8");
  // Only executable code counts — the comments necessarily NAME the forbidden
  // formulas to explain why they are forbidden, so strip block + line comments
  // (and JSX {/* */}) before asserting, exactly like finalizarConfirmationCopy.
  const src = raw
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  // No reconstruction of the exposures, no netting, no window comparison.
  expect(src).not.toMatch(/s\.gross\s*-\s*s\.collected/);
  expect(src).not.toMatch(/s\.unpaid\s*-\s*[a-zA-Z]/);
  expect(src).not.toMatch(/overCollected\s*[-+]\s*s\.unpaid|s\.unpaid\s*[-+]\s*overCollected/);
  expect(src).not.toMatch(/new Date\([^)]*window[^)]*\)\s*[<>]/i);
  // overCollected and scopesComparable are READ from data, not computed.
  expect(src).toMatch(/s && s\.overCollected/);
  expect(src).toMatch(/data\.scopeRelation/);
});
