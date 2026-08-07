// FREE_TABLE_OPEN_LATENCY_01 -- regression suite for the free-table
// open/multi-tap bug reported on physical iPhone: opening a free table used
// to call the component's GLOBAL `loading` flag (via a bare, non-quiet
// load()), which unmounted the ENTIRE mesa-board -- every table's own tap
// target -- for the ~400-500ms the floor refetch took. A second tap on any
// OTHER table during that window landed on nothing and was silently lost,
// sometimes for 3-4 attempts in a row (see the audit report for the real
// staging timeline: ~718ms total, and a live-reproduced dropped tap).
//
// The fix (see TabMesa.jsx, tag FREE_TABLE_OPEN_LATENCY_01): opened() now
// reloads quietly (tables state still refreshes with the same real,
// authoritative floor data -- only the blocking full-screen "Cargando"
// replacement is skipped), plus a per-table (not global) `opening` visual
// state for immediate tap feedback on just the tapped tile.
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

const freeTables = Array.from({ length: 3 }, (_, index) => ({
  id: `table-${index + 1}`,
  number: index + 1,
  name: `Mesa ${index + 1}`,
  capacity: 4,
  x: 15 + (index * 25),
  y: 30,
  shape: "square",
  active: true,
  status: "free",
  session: null,
}));

function openedTables(ids) {
  return freeTables.map((table) => ids.includes(table.id)
    ? { ...table, status: "open", session: { id: `session-${table.id}`, coversTotal: null, coversRemaining: 0, total: 0, paid: 0, outstanding: 0, nextEqualShare: 0, paymentTotals: {}, commands: [], lines: [], payments: [] } }
    : table);
}

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

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

function tableButtons(container) {
  return Array.from(container.querySelectorAll(".mesa-table"));
}

// A promise the test controls the resolution of, to simulate a real
// in-flight network request and observe intermediate render state.
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  createMesaRequestId.mockReturnValue("mesa_test_request");
  describeMesaError.mockImplementation((error) => error?.code || "error");
  mesaApi.floor.mockResolvedValue({ ok: true, tables: freeTables });
  mesaApi.openTable.mockResolvedValue({ ok: true });
  mesaApi.releaseEmptyTable.mockResolvedValue({ ok: true });
});

test("1. a free-table tap invokes openTable exactly once for that table", async () => {
  const { container, root } = await mount();
  click(tableButtons(container)[0]);
  await flush();
  expect(mesaApi.openTable).toHaveBeenCalledTimes(1);
  expect(mesaApi.openTable).toHaveBeenCalledWith("table-1");
  unmount(container, root);
});

test("2. table A pending does not disable table B -- B stays tappable and opens independently", async () => {
  const openA = deferred();
  mesaApi.openTable.mockImplementationOnce(() => openA.promise);
  const { container, root } = await mount();
  const [a, b] = tableButtons(container);
  click(a);
  await flush();
  // A is visually pending; B carries no pending marker at all.
  expect(a.className).toMatch(/\bopening\b/);
  expect(b.className).not.toMatch(/\bopening\b/);
  mesaApi.openTable.mockResolvedValueOnce({ ok: true });
  click(b);
  await flush();
  expect(mesaApi.openTable).toHaveBeenCalledWith("table-2");
  openA.resolve({ ok: true });
  await flush();
  unmount(container, root);
});

test("3. rapid sequential open A then B both reach the backend, independently, with the right ids", async () => {
  const { container, root } = await mount();
  const [a, b] = tableButtons(container);
  click(a);
  click(b);
  await flush();
  expect(mesaApi.openTable).toHaveBeenCalledTimes(2);
  expect(mesaApi.openTable.mock.calls.map((c) => c[0]).sort()).toEqual(["table-1", "table-2"]);
  unmount(container, root);
});

test("4. no duplicate session: tapping the SAME pending table again never calls openTable twice", async () => {
  const openA = deferred();
  mesaApi.openTable.mockImplementationOnce(() => openA.promise);
  const { container, root } = await mount();
  const a = tableButtons(container)[0];
  click(a);
  await flush();
  click(a); // same table, still pending
  click(a);
  await flush();
  expect(mesaApi.openTable).toHaveBeenCalledTimes(1);
  openA.resolve({ ok: true });
  await flush();
  unmount(container, root);
});

test("5. the second tap is never lost: the map never shows the blocking loading banner during a table-open flow, and other tables stay real DOM buttons throughout", async () => {
  const floorGate = deferred();
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: freeTables }); // initial mount load
  const { container, root } = await mount();
  mesaApi.floor.mockImplementationOnce(() => floorGate.promise); // opened()'s own reload
  const [a, b] = tableButtons(container);
  click(a);
  await flush();
  // The quiet reload is in flight (floor called a second time), but the
  // board must still show real, clickable table buttons -- no "Cargando"
  // full-screen replacement, no unmounted board.
  expect(container.querySelector(".mesa-banner")).toBeNull();
  expect(tableButtons(container).length).toBe(freeTables.length);
  const bStill = tableButtons(container)[1];
  click(bStill);
  await flush();
  expect(mesaApi.openTable).toHaveBeenCalledWith("table-2");
  floorGate.resolve({ ok: true, tables: openedTables(["table-1"]) });
  await flush();
  unmount(container, root);
});

test("6. an already-open table reopens instantly -- zero network calls, just local state", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openedTables(["table-1"]) });
  const { container, root } = await mount();
  jest.clearAllMocks();
  click(tableButtons(container)[0]);
  await flush();
  expect(mesaApi.openTable).not.toHaveBeenCalled();
  expect(mesaApi.floor).not.toHaveBeenCalled();
  expect(container.querySelector(".mesa-modal-head")).not.toBeNull();
  unmount(container, root);
});

test("7. close then reopen the same table works cleanly, no stray pending state left behind", async () => {
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: freeTables }); // initial mount
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: openedTables(["table-1"]) }); // opened()'s reload
  const { container, root } = await mount();
  click(tableButtons(container)[0]);
  await flush();
  expect(container.querySelector(".mesa-modal-head")).not.toBeNull();
  const closeBtn = container.querySelector(".mesa-close");
  click(closeBtn);
  await flush();
  expect(container.querySelector(".mesa-modal-head")).toBeNull();
  const a = tableButtons(container)[0];
  expect(a.className).not.toMatch(/\bopening\b/);
  // Table is already open now -- reopening it is the fast, no-network path.
  click(a);
  await flush();
  expect(container.querySelector(".mesa-modal-head")).not.toBeNull();
  unmount(container, root);
});

test("8. backend error on open: pending state clears, table becomes tappable again, no phantom session", async () => {
  mesaApi.openTable.mockRejectedValueOnce({ code: "MESA_TABLE_UNAVAILABLE" });
  const notify = jest.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TabMesa role="waiter" notify={notify} onNewCommand={jest.fn()} onCountChange={jest.fn()} />);
  });
  await flush();
  const a = tableButtons(container)[0];
  click(a);
  await flush();
  expect(notify).toHaveBeenCalledWith(expect.stringContaining("MESA_TABLE_UNAVAILABLE"), expect.anything());
  expect(container.querySelector(".mesa-modal-head")).toBeNull();
  expect(tableButtons(container)[0].className).not.toMatch(/\bopening\b/);
  // Retrying after the failure works normally.
  mesaApi.openTable.mockResolvedValueOnce({ ok: true });
  click(tableButtons(container)[0]);
  await flush();
  expect(mesaApi.openTable).toHaveBeenCalledTimes(2);
  unmount(container, root);
});
