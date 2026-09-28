// R2 (Economy 147) — the Mesa surface renders each comanda's paid state from the
// backend `settlement`, not from its historical lines. Sessions are the REAL floor
// responses of the candidate backend on the PG17 bench (ids shortened):
//   A  100 -> pay 100 -> adjust 80 -> refund 20          (the table owes nothing)
//   J  comanda 1 (60 + 40) adjusted 100 -> 80, comanda 2 (30), nothing paid
//   F  comanda 1 paid by products then adjusted 100 -> 80 (kept 20 more than owed),
//      comanda 2 (30) unpaid: the table itself owes only 10
import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../mesa/mesaApi", () => ({
  __esModule: true,
  createMesaRequestId: jest.fn(() => "mesa_test_request"),
  describeMesaError: jest.fn((error) => error?.code || "error"),
  mesaApi: {
    floor: jest.fn(), openTable: jest.fn(), releaseEmptyTable: jest.fn(), closeTable: jest.fn(),
    saveTable: jest.fn(), addCommand: jest.fn(), markServed: jest.fn(), pay: jest.fn(),
    createReservation: jest.fn(), updateReservation: jest.fn(), setReservationStatus: jest.fn(),
    openReservation: jest.fn(),
  },
}));

const TabMesa = require("./TabMesa").default;
const { buildBillDocument } = require("./TabMesa");
const { mesaApi, describeMesaError, createMesaRequestId } = require("../../mesa/mesaApi");

beforeEach(() => {
  describeMesaError.mockImplementation((error) => error?.code || "error");
  createMesaRequestId.mockImplementation(() => "mesa_test_request");
});

const settlement = (o) => ({ currentObligation: 0, netCollected: 0, outstanding: 0, overCollected: 0, payState: "unpaid", payableByLines: false, ...o });
const session = (o) => ({ id: "s1", coversTotal: 2, coversRemaining: 2, nextEqualShare: 0, paymentTotals: {}, payments: [], ...o });

const A = session({
  total: 80, paid: 80, outstanding: 0, overCollected: 0, coversRemaining: 0, paymentTotals: { efectivo: 80 },
  commands: [{ id: "#A", commandNumber: 1, state: "EN_COCINA", total: 80, items: [], time: "20:00",
    settlement: settlement({ currentObligation: 80, netCollected: 80, payState: "paid" }) }],
  lines: [{ id: "a1", orderId: "#A", description: "Pizza", amount: 100, paid: 80, remaining: 20 }],
});
const J = session({
  total: 110, paid: 0, outstanding: 110, overCollected: 0,
  commands: [
    { id: "#A", commandNumber: 1, state: "EN_COCINA", total: 80, items: [], time: "20:00", settlement: settlement({ currentObligation: 80, outstanding: 80 }) },
    { id: "#B", commandNumber: 2, state: "EN_COCINA", total: 30, items: [], time: "20:10", settlement: settlement({ currentObligation: 30, outstanding: 30, payableByLines: true }) },
  ],
  lines: [
    { id: "a1", orderId: "#A", description: "Pizza", amount: 60, paid: 0, remaining: 60 },
    { id: "a2", orderId: "#A", description: "Vino", amount: 40, paid: 0, remaining: 40 },
    { id: "b1", orderId: "#B", description: "Postre", amount: 30, paid: 0, remaining: 30 },
  ],
});
const F = session({
  total: 110, paid: 100, outstanding: 10, overCollected: 0, paymentTotals: { efectivo: 100 },
  commands: [
    { id: "#A", commandNumber: 1, state: "EN_COCINA", total: 80, items: [], time: "20:00",
      settlement: settlement({ currentObligation: 80, netCollected: 100, overCollected: 20, payState: "paid" }) },
    { id: "#B", commandNumber: 2, state: "EN_COCINA", total: 30, items: [], time: "20:10",
      settlement: settlement({ currentObligation: 30, outstanding: 30, payableByLines: true }) },
  ],
  lines: [
    { id: "a1", orderId: "#A", description: "Pizza", amount: 100, paid: 100, remaining: 0 },
    { id: "b1", orderId: "#B", description: "Vino", amount: 30, paid: 0, remaining: 30 },
  ],
});
// comanda 1 settled canonically (adjusted after being paid) while its line still owes 20
const RESUMEN = session({
  total: 110, paid: 80, outstanding: 30, overCollected: 0,
  commands: [
    { id: "#A", commandNumber: 1, state: "EN_COCINA", total: 80, items: [], time: "20:00",
      settlement: settlement({ currentObligation: 80, netCollected: 80, payState: "paid" }) },
    { id: "#B", commandNumber: 2, state: "EN_COCINA", total: 30, items: [], time: "20:10",
      settlement: settlement({ currentObligation: 30, outstanding: 30, payableByLines: true }) },
  ],
  lines: [
    { id: "a1", orderId: "#A", description: "Pizza", amount: 100, paid: 80, remaining: 20 },
    { id: "b1", orderId: "#B", description: "Vino", amount: 30, paid: 0, remaining: 30 },
  ],
});

const tableWith = (s) => ({
  id: "t4", number: 4, x: 40, y: 40, shape: "square", shapePreset: "standard",
  active: true, capacity: 4, reservations: [], status: "open", session: s,
});
function click(el) { act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
const byTestId = (c, id) => c.querySelector(`[data-testid="${id}"]`);
const buttonByText = (c, text) => Array.from(c.querySelectorAll("button")).find((b) => b.textContent.trim() === text);
async function openTable(s) {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith(s)] });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TabMesa role="admin" notify={jest.fn()} onNewCommand={jest.fn()} onCountChange={jest.fn()}
      mesaDrafts={{}} onClearDraft={jest.fn()} onSendToCocina={jest.fn()} />);
  });
  click(container.querySelector(".mesa-table"));
  await flush();
  return { container, root };
}
async function openHub(s) {
  const opened = await openTable(s);
  click(buttonByText(opened.container, "Ver cuenta"));
  await flush();
  return opened;
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }
const hubRow = (c, name) => Array.from(c.querySelectorAll('[data-testid="mesa-hub-line"]')).find((r) => r.textContent.includes(name));

test("A: the ticket shows the settled comanda's product as Pagado, and nothing can be charged", async () => {
  const { container, root } = await openHub(A);
  expect(hubRow(container, "Pizza").textContent).toContain("Pagado");
  expect(byTestId(container, "mesa-hub-pago-parcial").disabled).toBe(true);
  unmount(container, root);
});

test("A: the CUENTA CLIENTE lists nothing to pay (it used to print Pizza 20,00 €)", () => {
  const doc = buildBillDocument(A, 4);
  expect(doc.rows).toEqual([]);
  expect(doc.total).toBe(0);
});

test("J: Por productos offers only the comanda whose lines owe what it owes, and charges exactly those ids", async () => {
  mesaApi.pay.mockResolvedValue({ amount: 30, outstandingAfter: 80 });
  const { container, root } = await openHub(J);
  click(byTestId(container, "mesa-hub-pago-parcial"));
  click(byTestId(container, "mesa-hub-mode-productos"));
  for (const name of ["Pizza", "Vino"]) {
    const row = hubRow(container, name);
    expect(row.disabled).toBe(true);
    expect(row.textContent).toContain("Cobrar por importe");
    expect(row.textContent).not.toContain("Pagado");
  }
  const postre = hubRow(container, "Postre");
  expect(postre.disabled).toBe(false);
  click(postre);
  click(buttonByText(container, "Confirmar cobro"));
  await flush();
  expect(mesaApi.pay).toHaveBeenCalledWith("s1", {
    paymentMethod: "efectivo", mode: "item_selection", lineIds: ["b1"], coversSettled: 0, clientRequestId: "mesa_test_request",
  });
  unmount(container, root);
});

test("J: the CUENTA CLIENTE shows the adjusted comanda at its canonical balance and the other by product", () => {
  expect(buildBillDocument(J, 4).rows).toEqual([
    { label: "Comanda 1", value: expect.stringMatching(/^80,00\s?€$/) },
    { label: "Postre", value: expect.stringMatching(/^30,00\s?€$/) },
  ]);
});

test("F: a selection above what the table still owes is stopped before the writer would refuse it", async () => {
  const { container, root } = await openHub(F);
  click(byTestId(container, "mesa-hub-pago-parcial"));
  click(byTestId(container, "mesa-hub-mode-productos"));
  click(hubRow(container, "Vino"));
  click(buttonByText(container, "Confirmar cobro"));
  await flush();
  expect(mesaApi.pay).not.toHaveBeenCalled();
  expect(container.textContent).toContain("La selección supera lo que queda por pagar en la mesa");
  unmount(container, root);
});

test("Resumen de comandas: a comanda settled after an adjustment reads Pagada although its line still owes", async () => {
  const { container, root } = await openTable(RESUMEN);
  const dialog = container.querySelector('[role="dialog"]');
  click(byTestId(dialog, "mesa-resumen-section"));
  const items = byTestId(dialog, "mesa-resumen-items");
  expect(items.textContent).toContain("Comanda 1");
  expect(byTestId(items, "mesa-resumen-state").textContent).toBe("Pagada");
  unmount(container, root);
});
