import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

// B2 (POST_UAT_BLOCKER_FIX_2026-09-17) -- MULTI_COMANDA_PREVIOUS_COMMAND_CAN_
// BE_COMPLETED_AND_TABLE_CLOSED.
//
// UAT evidence (Mesa 3, table_session_id 4183796b-e0d5-4d5d-b4b8-bc73103c0001):
// comanda #1 (order #004) stayed LISTO while comanda #2 (order #005) reached
// RETIRADO. mesa_close_session_v1 (migrations/2026-08-27_mesa_close_over_
// collected_ack_migration_119.sql) correctly refuses to close while ANY
// order under the table_session_id is not in a terminal estado -- that guard
// is untouched and unchanged here. mesaService.markServed() (src/tables/
// mesaService.js) already accepts any orderId belonging to the session, not
// only the most-recent one. The bug was purely that TabMesa.jsx's
// ResumenComandasSection (the "historical comandas" list) never rendered a
// way to call it for anything but the single most-recent comanda
// (ComandaActualCard) -- so a comanda that stopped being "current" lost its
// only path to RETIRADO the moment a newer comanda was sent to Cocina.
jest.mock("../../mesa/mesaApi", () => ({
  __esModule: true,
  createMesaRequestId: jest.fn(() => "mesa_test_request"),
  describeMesaError: jest.fn((error) => error?.code || "error"),
  mesaApi: {
    floor: jest.fn(),
    openTable: jest.fn(),
    releaseEmptyTable: jest.fn(),
    closeTable: jest.fn(),
    saveTable: jest.fn(),
    addCommand: jest.fn(),
    markServed: jest.fn(),
    pay: jest.fn(),
    createReservation: jest.fn(),
    updateReservation: jest.fn(),
    setReservationStatus: jest.fn(),
    openReservation: jest.fn(),
  },
}));

const TabMesa = require("./TabMesa").default;
const { mesaApi } = require("../../mesa/mesaApi");

const floorTables = Array.from({ length: 5 }, (_, index) => ({
  id: `table-${index + 1}`,
  number: index + 1,
  name: `Mesa ${index + 1}`,
  capacity: 4,
  x: 15 + (index * 15),
  y: index < 3 ? 20 : 60,
  shape: "square",
  active: true,
  status: "free",
  session: null,
}));

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

async function mount(role = "owner") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TabMesa role={role} notify={jest.fn()} onNewCommand={jest.fn()} onCountChange={jest.fn()}
      mesaDrafts={{}} onClearDraft={jest.fn()} onSendToCocina={jest.fn()} />);
  });
  await flush();
  return { container, root };
}

function unmount(container, root) {
  act(() => { root.unmount(); });
  container.remove();
}

function buttonByText(container, text) {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent.trim().startsWith(text));
}

function byTestId(container, id) { return container.querySelector(`[data-testid="${id}"]`); }

const emptySession = (overrides = {}) => ({
  id: "session-x", coversTotal: null, coversRemaining: 0, total: 0, paid: 0,
  outstanding: 0, nextEqualShare: 0, paymentTotals: {}, commands: [], lines: [], payments: [],
  ...overrides,
});

// Mirrors the real UAT fixture: comanda #1 (24.50, LISTO, historical the
// moment #2 was sent) and comanda #2 (13.00, RETIRADO, current). Both fully
// paid (outstanding 0) -- the table's only blocker is comanda #1's estado.
const twoCommandTable = (command1State) => floorTables.map((table, index) => index === 0
  ? { ...table, status: "open", session: emptySession({
      id: "session-mesa3", coversTotal: 2, coversRemaining: 0, total: 37.5, paid: 37.5, outstanding: 0,
      commands: [
        { id: "o1", commandNumber: 1, state: command1State, total: 24.5, items: [{ n: "El Pelusa" }], time: "17:12" },
        { id: "o2", commandNumber: 2, state: "RETIRADO", total: 13, items: [{ n: "El Gaucho" }], time: "18:14" },
      ],
      lines: [
        { id: "l1", orderId: "o1", description: "El Pelusa", amount: 24.5, remaining: 0, quantity: 1 },
        { id: "l2", orderId: "o2", description: "El Gaucho", amount: 13, remaining: 0, quantity: 1 },
      ],
    }) }
  : table);

beforeEach(() => {
  jest.clearAllMocks();
  mesaApi.floor.mockResolvedValue({ ok: true, tables: floorTables });
});

test("MULTI_COMANDA_PREVIOUS_COMMAND_CAN_BE_COMPLETED_AND_TABLE_CLOSED -- a historical LISTO comanda exposes its own Servida action in Resumen de comandas", async () => {
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: twoCommandTable("LISTO") });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  const dialog = container.querySelector('[role="dialog"]');

  // Comanda actual is #2 (most recent), already RETIRADO -- no Servida button
  // on the current card (nothing to do there).
  const current = byTestId(dialog, "mesa-current-card");
  expect(current.textContent).toContain("Comanda 2");
  expect(buttonByText(current, "✓ Servida")).toBeFalsy();

  // Resumen de comandas: comanda #1 is historical -- both lines are fully
  // paid (remaining 0, mirroring the real UAT fixture) so the row's label
  // reads "Pagada" (paidInFull takes label priority over the raw kitchen
  // state by this section's own design), but its estado is still the real
  // "LISTO", and it now carries its OWN Servida action (this is the fix --
  // the action is gated on command.state, never on the paid label).
  const resumen = byTestId(dialog, "mesa-resumen-section");
  click(resumen);
  const resumenItems = byTestId(dialog, "mesa-resumen-items");
  expect(resumenItems.textContent).toContain("Comanda 1");
  expect(resumenItems.textContent).toContain("Pagada");
  const servedButton = byTestId(resumenItems, "mesa-resumen-mark-served");
  expect(servedButton).toBeTruthy();

  mesaApi.markServed.mockResolvedValue({ ok: true, orderId: "o1", state: "RETIRADO" });
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: twoCommandTable("RETIRADO") });
  click(servedButton);
  await flush();

  // The historical comanda's id travels, not the current one's.
  expect(mesaApi.markServed).toHaveBeenCalledTimes(1);
  expect(mesaApi.markServed).toHaveBeenCalledWith("session-mesa3", "o1");
  unmount(container, root);
});

test("MULTI_COMANDA_PREVIOUS_COMMAND_CAN_BE_COMPLETED_AND_TABLE_CLOSED -- once every comanda is terminal, Cerrar mesa reaches mesaApi.closeTable", async () => {
  // Both comandas already terminal (post-fix end state): the table is now
  // legitimately closeable, and the close action is ungated by anything this
  // fix touched (mesa_close_session_v1 itself is unchanged).
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: twoCommandTable("RETIRADO") });
  const { container, root } = await mount("owner");
  click(container.querySelector(".mesa-table"));
  let dialog = container.querySelector('[role="dialog"]');

  const resumen = byTestId(dialog, "mesa-resumen-section");
  click(resumen);
  // Nothing left to mark served: comanda #1 is now RETIRADO too (both
  // comandas fully paid, so the label still reads "Pagada" per this
  // section's own paid-in-full priority), with no Servida button anywhere.
  expect(byTestId(dialog, "mesa-resumen-items").textContent).toContain("Pagada");
  expect(byTestId(dialog, "mesa-resumen-items").querySelector('[data-testid="mesa-resumen-mark-served"]')).toBeFalsy();

  mesaApi.closeTable.mockResolvedValue({ ok: true, status: "closed", overCollected: 0 });
  click(buttonByText(dialog, "Cerrar mesa"));
  const confirmDialog = container.querySelector('[role="alertdialog"]');
  click(byTestId(confirmDialog, "cerrar-mesa-confirm"));
  await flush();

  expect(mesaApi.closeTable).toHaveBeenCalledTimes(1);
  expect(mesaApi.closeTable).toHaveBeenCalledWith("session-mesa3");
  unmount(container, root);
});
