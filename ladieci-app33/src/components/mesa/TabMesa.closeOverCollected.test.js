// TabMesa.closeOverCollected.test.js — OVER-COLLECTED / AJUSTE COMERCIAL V1
// SLICE C, §17-19.
//
// mesa_close_session_v1 never gates on overCollected (only `unpaid > 0`
// blocks; the RPC returns overCollected in its own success payload
// regardless -- see this slice's own report for the exact live-contract
// inspection). So there is no backend "acknowledgment parameter": the
// two-step warning here is a pure client-side courtesy step before a call
// the backend already permits unconditionally. These tests prove exactly
// that: no loop, no fabricated incident, one real call either way.
import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

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
const { mesaApi, createMesaRequestId, describeMesaError } = require("../../mesa/mesaApi");

const floorTables = Array.from({ length: 2 }, (_, index) => ({
  id: `table-${index + 1}`, number: index + 1, name: `Mesa ${index + 1}`, capacity: 4,
  x: 15, y: 20, shape: "square", active: true, status: "free", session: null,
}));

function click(element) { act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
function buttonByText(container, text) {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent.trim().startsWith(text));
}
function byTestId(container, id) { return container.querySelector(`[data-testid="${id}"]`); }

async function mount(role = "waiter") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TabMesa role={role} notify={jest.fn()} onNewCommand={jest.fn()} onCountChange={jest.fn()} />);
  });
  await flush();
  return { container, root };
}
function unmount(container, root) {
  act(() => { root.unmount(); });
  container.remove();
}

// A real occupied, fully-settled, over-collected table: coversTotal is set
// (routes confirmClose through mesaApi.closeTable, not releaseEmptyTable),
// outstanding is 0 (so the pre-existing MESA_TABLE_NOT_SETTLED gate never
// fires), overCollected is 10 -- exactly the shape mesaService.js's
// projectSessionAccount produces once netCollected exceeds total.
const overCollectedSession = (overrides = {}) => ({
  id: "session-oc", coversTotal: 2, coversRemaining: 0,
  total: 20, paid: 30, outstanding: 0, overCollected: 10,
  nextEqualShare: 0, paymentTotals: {},
  commands: [{ id: "#001", commandNumber: 1, state: "RETIRADO", total: 20, time: "20:00", items: [] }],
  lines: [], payments: [], ...overrides,
});

beforeAll(() => {
  jest.useFakeTimers({
    doNotFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "nextTick", "setImmediate", "queueMicrotask", "hrtime", "performance"],
  });
  jest.setSystemTime(new Date("2026-08-05T12:00:00.000Z"));
});
afterAll(() => { jest.useRealTimers(); });

beforeEach(() => {
  jest.clearAllMocks();
  createMesaRequestId.mockReturnValue("mesa_test_request");
  describeMesaError.mockImplementation((error) => error?.code || "error");
  mesaApi.saveTable.mockResolvedValue({ ok: true });
});

function withOpenTable(session) {
  return floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session } : table);
}

test("§18 -- overCollected shows the exact warning copy and Volver/Cerrar igualmente labels", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: withOpenTable(overCollectedSession()) });
  const { container, root } = await mount();
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Cerrar mesa"));
  const dialog = container.querySelector('[role="alertdialog"]');
  expect(dialog.textContent).toContain("Hay 10,00");
  expect(dialog.textContent).toContain("cobrados de más");
  expect(dialog.textContent).toContain("Puedes reembolsarlo ahora o cerrar la mesa dejando la incidencia registrada.");
  expect(buttonByText(dialog, "Volver")).toBeTruthy();
  expect(buttonByText(dialog, "Cerrar igualmente")).toBeTruthy();
  // Never the plain-close wording once overCollected is showing.
  expect(dialog.textContent).not.toContain("La mesa quedará libre para nuevos clientes.");
  expect(mesaApi.closeTable).not.toHaveBeenCalled();
  unmount(container, root);
});

test("§18/§27 -- Volver cancels: no request, table stays open, dialog gone", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: withOpenTable(overCollectedSession()) });
  const { container, root } = await mount();
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Cerrar mesa"));
  click(buttonByText(container.querySelector('[role="alertdialog"]'), "Volver"));
  await flush();
  expect(mesaApi.closeTable).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alertdialog"]')).toBeFalsy();
  expect(container.querySelector('[role="dialog"]').textContent).toContain("Cerrar mesa");
  unmount(container, root);
});

test("§18/§27 -- Cerrar igualmente calls the SAME closeTable the plain close path uses, exactly once, no loop", async () => {
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: withOpenTable(overCollectedSession()) });
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: floorTables });
  mesaApi.closeTable.mockResolvedValue({ ok: true, overCollected: 10 });
  const { container, root } = await mount();
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Cerrar mesa"));
  const dialog = container.querySelector('[role="alertdialog"]');
  click(buttonByText(dialog, "Cerrar igualmente"));
  await flush();
  expect(mesaApi.closeTable).toHaveBeenCalledTimes(1);
  expect(mesaApi.closeTable).toHaveBeenCalledWith("session-oc");
  expect(mesaApi.releaseEmptyTable).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alertdialog"]')).toBeFalsy();
  expect(container.querySelector('[role="dialog"]')).toBeFalsy();
  unmount(container, root);
});

test("blocked (pending kitchen work) takes priority over the overCollected warning -- copy and confirm-disabled behavior unchanged", async () => {
  const blockedSession = overCollectedSession({
    commands: [{ id: "#001", commandNumber: 1, state: "EN_COCINA", total: 20, time: "20:00", items: [] }],
  });
  mesaApi.floor.mockResolvedValue({ ok: true, tables: withOpenTable(blockedSession) });
  const { container, root } = await mount();
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Cerrar mesa"));
  const dialog = container.querySelector('[role="alertdialog"]');
  expect(dialog.textContent).toContain("Faltan comandas por servir.");
  expect(dialog.textContent).not.toContain("cobrados de más");
  expect(byTestId(dialog, "cerrar-mesa-confirm").disabled).toBe(true);
  unmount(container, root);
});

test("overCollected 0 (settled, nothing owed either way): plain close copy and labels, unchanged from before this slice", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: withOpenTable(overCollectedSession({ paid: 20, overCollected: 0 })) });
  const { container, root } = await mount();
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Cerrar mesa"));
  const dialog = container.querySelector('[role="alertdialog"]');
  expect(dialog.textContent).toContain("La mesa quedará libre para nuevos clientes.");
  expect(dialog.textContent).not.toContain("cobrados de más");
  expect(buttonByText(dialog, "Cerrar mesa")).toBeTruthy();
  expect(buttonByText(dialog, "Cancelar")).toBeTruthy();
  unmount(container, root);
});

// §19 -- no fabricated incident: the passive "Cobrado de más" figure the
// operator sees afterwards comes only from re-reading the canonical closed
// account (Ultimas Cuentas / MesaAccountBalance), never from a badge this
// close flow invents on its own. Proven by absence: nothing here renders an
// incident marker, and refreshing after close re-fetches the floor exactly
// once (already covered by the "exactly once, no loop" assertion above).
test("§19 -- closing creates no local incident badge; refresh is the single canonical floor re-fetch", async () => {
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: withOpenTable(overCollectedSession()) });
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: floorTables });
  mesaApi.closeTable.mockResolvedValue({ ok: true, overCollected: 10 });
  const { container, root } = await mount();
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Cerrar mesa"));
  click(buttonByText(container.querySelector('[role="alertdialog"]'), "Cerrar igualmente"));
  await flush();
  expect(mesaApi.floor).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[data-testid*="incident"]')).toBeFalsy();
  unmount(container, root);
});
