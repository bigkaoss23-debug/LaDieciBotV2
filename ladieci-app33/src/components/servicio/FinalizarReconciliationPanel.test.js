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

test("a multi-service day explains WHY the two cash figures differ", async () => {
  const { container, root } = await mount({ data: DATA });
  const note = byTestId(container, "scope-explainer");
  expect(note.textContent).toMatch(/2\s*servicios/);
  expect(note.textContent).toMatch(/157,50\s?€/);
  expect(note.textContent).toMatch(/85,00\s?€/);
  unmount(container, root);
});

test("a single-service day shows no explainer, because there is nothing to explain", async () => {
  const single = { ...DATA, reconciliation: { ...DATA.reconciliation, serviceCount: 1 } };
  const { container, root } = await mount({ data: single });
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
