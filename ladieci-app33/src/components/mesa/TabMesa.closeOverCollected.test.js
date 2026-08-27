// TabMesa.closeOverCollected.test.js — OVER-COLLECTED close flow, REWRITTEN for
// the ledger-119 backend authority (Frontend Slice C §31/§32).
//
// The old version of this file asserted a CLIENT-ONLY authority: "if
// session.overCollected > 0, show Volver / Cerrar igualmente BEFORE calling
// closeTable". That is gone. The authoritative sequence is now:
//
//   1. Cerrar mesa  -> mesaApi.closeTable(id)   (no confirmOverCollected)
//   2. backend rejects with MESA_CLOSE_OVER_COLLECTED (+ a safe `overCollected`
//      amount) -> ONLY THEN does the dialog become the acknowledgement step,
//      using the BACKEND's amount.
//   3. Cerrar igualmente -> mesaApi.closeTable(id, { confirmOverCollected: true })
//   4. backend success -> canonical floor refresh.
//
// MESA_TABLE_NOT_SETTLED and any other failure stay the plain error banner —
// never the override. No client-fabricated incident. No retry loop.
import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../mesa/mesaApi", () => ({
  __esModule: true,
  createMesaRequestId: jest.fn(() => "mesa_test_request"),
  describeMesaError: jest.fn((error) => error?.code || "error"),
  MESA_DUPLICATE_PAYMENT_CODE: "MESA_POSSIBLE_DUPLICATE_PAYMENT",
  MESA_CLOSE_OVER_COLLECTED_CODE: "MESA_CLOSE_OVER_COLLECTED",
  mesaApi: {
    floor: jest.fn(),
    openTable: jest.fn(),
    releaseEmptyTable: jest.fn(),
    closeTable: jest.fn(),
    adjust: jest.fn(),
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
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
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

// A real occupied, fully-settled table: coversTotal is set (routes confirmClose
// through mesaApi.closeTable, not releaseEmptyTable), one terminal comanda (so
// the pre-existing kitchen-work gate never fires). Whether it is over-collected
// is decided ONLY by what mesaApi.closeTable does when called.
const settledSession = (overrides = {}) => ({
  id: "session-oc", coversTotal: 2, coversRemaining: 0,
  total: 20, paid: 20, outstanding: 0, overCollected: 0,
  nextEqualShare: 0, paymentTotals: {},
  commands: [{ id: "#001", commandNumber: 1, state: "RETIRADO", total: 20, time: "20:00", items: [] }],
  lines: [], payments: [], ...overrides,
});

function withOpenTable(session) {
  return floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session } : table);
}

// The dialog is the standalone CerrarMesaDialog overlay (non-compact path).
function openCloseDialog(container) {
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Cerrar mesa"));
  return container.querySelector('[role="alertdialog"]');
}

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

// ─── §31.A — ordinary settled table: closes on the first attempt, no warning ──
test("§31.A — a settled table closes on the first attempt, no over-collected step", async () => {
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: withOpenTable(settledSession()) });
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: floorTables });
  mesaApi.closeTable.mockResolvedValue({ ok: true, status: "closed", overCollected: 0 });
  const { container, root } = await mount();
  const dialog = openCloseDialog(container);
  expect(dialog.textContent).toContain("La mesa quedará libre para nuevos clientes.");
  click(byTestId(dialog, "cerrar-mesa-confirm"));
  await flush();
  expect(mesaApi.closeTable).toHaveBeenCalledTimes(1);
  expect(mesaApi.closeTable).toHaveBeenCalledWith("session-oc");
  expect(container.querySelector('[role="alertdialog"]')).toBeFalsy();
  expect(mesaApi.floor).toHaveBeenCalledTimes(2);
  unmount(container, root);
});

// ─── §31.B — backend MESA_CLOSE_OVER_COLLECTED turns the dialog into the ack step ─
test("§31.B — MESA_CLOSE_OVER_COLLECTED (overCollected=10) shows the acknowledgement step with the BACKEND amount", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: withOpenTable(settledSession()) });
  mesaApi.closeTable.mockRejectedValueOnce({ code: "MESA_CLOSE_OVER_COLLECTED", overCollected: 10 });
  const { container, root } = await mount();
  openCloseDialog(container);
  click(byTestId(container.querySelector('[role="alertdialog"]'), "cerrar-mesa-confirm"));
  await flush();
  const dialog = container.querySelector('[role="alertdialog"]');
  expect(mesaApi.closeTable).toHaveBeenCalledTimes(1);
  expect(mesaApi.closeTable).toHaveBeenLastCalledWith("session-oc");
  expect(dialog.textContent).toContain("Hay 10,00");
  expect(dialog.textContent).toContain("cobrados de más");
  expect(dialog.textContent).toContain("Puedes reembolsarlo ahora o cerrar la mesa dejando la incidencia registrada.");
  expect(buttonByText(dialog, "Volver")).toBeTruthy();
  expect(buttonByText(dialog, "Cerrar igualmente")).toBeTruthy();
  expect(dialog.textContent).not.toContain("La mesa quedará libre para nuevos clientes.");
  // Only the initial floor read so far — the table is NOT closed.
  expect(mesaApi.floor).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

// A local session that is already over-collected must NOT preempt the dialog.
test("§32 — a locally over-collected account does NOT show the ack step before the backend rejects", async () => {
  mesaApi.floor.mockResolvedValue({
    ok: true,
    tables: withOpenTable(settledSession({ paid: 30, overCollected: 10 })),
  });
  const { container, root } = await mount();
  const dialog = openCloseDialog(container);
  // Plain close copy and labels — the client's own overCollected figure is display, not authority.
  expect(dialog.textContent).toContain("La mesa quedará libre para nuevos clientes.");
  expect(dialog.textContent).not.toContain("cobrados de más");
  expect(buttonByText(dialog, "Cerrar mesa")).toBeTruthy();
  expect(buttonByText(dialog, "Cancelar")).toBeTruthy();
  expect(buttonByText(dialog, "Cerrar igualmente")).toBeFalsy();
  expect(mesaApi.closeTable).not.toHaveBeenCalled();
  unmount(container, root);
});

// ─── §31.C — Volver: no second close request ─────────────────────────────────
test("§31.C — Volver after the ack step sends no second request", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: withOpenTable(settledSession()) });
  mesaApi.closeTable.mockRejectedValueOnce({ code: "MESA_CLOSE_OVER_COLLECTED", overCollected: 10 });
  const { container, root } = await mount();
  openCloseDialog(container);
  click(byTestId(container.querySelector('[role="alertdialog"]'), "cerrar-mesa-confirm"));
  await flush();
  click(buttonByText(container.querySelector('[role="alertdialog"]'), "Volver"));
  await flush();
  expect(mesaApi.closeTable).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="alertdialog"]')).toBeFalsy();
  expect(container.querySelector('[role="dialog"]').textContent).toContain("Cerrar mesa");
  unmount(container, root);
});

// ─── §31.D/E — Cerrar igualmente retries with confirmOverCollected:true, then closes ─
test("§31.D/E — Cerrar igualmente sends confirmOverCollected:true and closes on backend success", async () => {
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: withOpenTable(settledSession()) });
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: floorTables });
  mesaApi.closeTable
    .mockRejectedValueOnce({ code: "MESA_CLOSE_OVER_COLLECTED", overCollected: 10 })
    .mockResolvedValueOnce({ ok: true, status: "closed", overCollected: 10, overCollectedAcknowledged: true, incidentId: "inc-1" });
  const { container, root } = await mount();
  openCloseDialog(container);
  click(byTestId(container.querySelector('[role="alertdialog"]'), "cerrar-mesa-confirm"));
  await flush();
  click(buttonByText(container.querySelector('[role="alertdialog"]'), "Cerrar igualmente"));
  await flush();
  expect(mesaApi.closeTable).toHaveBeenCalledTimes(2);
  expect(mesaApi.closeTable).toHaveBeenNthCalledWith(1, "session-oc");
  expect(mesaApi.closeTable).toHaveBeenNthCalledWith(2, "session-oc", { confirmOverCollected: true });
  expect(mesaApi.releaseEmptyTable).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alertdialog"]')).toBeFalsy();
  expect(container.querySelector('[role="dialog"]')).toBeFalsy();
  // Exactly one canonical floor re-fetch after the close.
  expect(mesaApi.floor).toHaveBeenCalledTimes(2);
  unmount(container, root);
});

// ─── §31.F — MESA_TABLE_NOT_SETTLED never becomes the over-collected override ──
test("§31.F — MESA_TABLE_NOT_SETTLED shows the plain error, never the ack step", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: withOpenTable(settledSession()) });
  mesaApi.closeTable.mockRejectedValueOnce({ code: "MESA_TABLE_NOT_SETTLED" });
  const { container, root } = await mount();
  openCloseDialog(container);
  click(byTestId(container.querySelector('[role="alertdialog"]'), "cerrar-mesa-confirm"));
  await flush();
  const dialog = container.querySelector('[role="alertdialog"]');
  expect(dialog).toBeTruthy();
  expect(dialog.textContent).toContain("MESA_TABLE_NOT_SETTLED");
  expect(dialog.textContent).not.toContain("cobrados de más");
  expect(buttonByText(dialog, "Cerrar igualmente")).toBeFalsy();
  expect(buttonByText(dialog, "Volver")).toBeFalsy();
  expect(mesaApi.closeTable).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

// ─── §31.G — a generic failure never becomes a close override ────────────────
test("§31.G — a generic close failure shows the plain error, never the ack step", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: withOpenTable(settledSession()) });
  mesaApi.closeTable.mockRejectedValueOnce({ code: "MESA_SERVER_ERROR" });
  const { container, root } = await mount();
  openCloseDialog(container);
  click(byTestId(container.querySelector('[role="alertdialog"]'), "cerrar-mesa-confirm"));
  await flush();
  const dialog = container.querySelector('[role="alertdialog"]');
  expect(dialog.textContent).toContain("MESA_SERVER_ERROR");
  expect(dialog.textContent).not.toContain("cobrados de más");
  expect(buttonByText(dialog, "Cerrar igualmente")).toBeFalsy();
  unmount(container, root);
});

// ─── §31.H — no client-fabricated incident anywhere in the flow ──────────────
test("§31.H — the close flow never renders a client-created incident marker", async () => {
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: withOpenTable(settledSession()) });
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: floorTables });
  mesaApi.closeTable
    .mockRejectedValueOnce({ code: "MESA_CLOSE_OVER_COLLECTED", overCollected: 10 })
    .mockResolvedValueOnce({ ok: true, status: "closed", incidentId: "inc-1" });
  const { container, root } = await mount();
  openCloseDialog(container);
  click(byTestId(container.querySelector('[role="alertdialog"]'), "cerrar-mesa-confirm"));
  await flush();
  click(buttonByText(container.querySelector('[role="alertdialog"]'), "Cerrar igualmente"));
  await flush();
  expect(container.querySelector('[data-testid*="incident"]')).toBeFalsy();
  expect(container.textContent).not.toContain("inc-1");
  unmount(container, root);
});

// ─── §31.I — no retry loop if the acknowledged request itself fails ──────────
test("§31.I — a failure on the acknowledged request shows the error and does NOT loop", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: withOpenTable(settledSession()) });
  mesaApi.closeTable
    .mockRejectedValueOnce({ code: "MESA_CLOSE_OVER_COLLECTED", overCollected: 10 })
    .mockRejectedValueOnce({ code: "MESA_CLOSE_INCIDENT_PERSISTENCE_FAILED" });
  const { container, root } = await mount();
  openCloseDialog(container);
  click(byTestId(container.querySelector('[role="alertdialog"]'), "cerrar-mesa-confirm"));
  await flush();
  click(buttonByText(container.querySelector('[role="alertdialog"]'), "Cerrar igualmente"));
  await flush();
  const dialog = container.querySelector('[role="alertdialog"]');
  expect(mesaApi.closeTable).toHaveBeenCalledTimes(2);
  expect(dialog).toBeTruthy();
  expect(dialog.textContent).toContain("MESA_CLOSE_INCIDENT_PERSISTENCE_FAILED");
  // Still the acknowledgement dialog (Cerrar igualmente stays available for a
  // deliberate re-try) — but no third automatic call.
  expect(buttonByText(dialog, "Cerrar igualmente")).toBeTruthy();
  unmount(container, root);
});

// ─── kitchen-work still takes priority and disables confirm ──────────────────
test("pending kitchen work takes priority: the over-collected step never appears, confirm stays disabled", async () => {
  const blockedSession = settledSession({
    commands: [{ id: "#001", commandNumber: 1, state: "EN_COCINA", total: 20, time: "20:00", items: [] }],
  });
  mesaApi.floor.mockResolvedValue({ ok: true, tables: withOpenTable(blockedSession) });
  const { container, root } = await mount();
  const dialog = openCloseDialog(container);
  expect(dialog.textContent).toContain("Faltan comandas por servir.");
  expect(dialog.textContent).not.toContain("cobrados de más");
  expect(byTestId(dialog, "cerrar-mesa-confirm").disabled).toBe(true);
  expect(mesaApi.closeTable).not.toHaveBeenCalled();
  unmount(container, root);
});
