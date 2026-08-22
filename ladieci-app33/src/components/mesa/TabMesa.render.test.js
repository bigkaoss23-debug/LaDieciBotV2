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

function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  act(() => {
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

async function mount(role = "owner", {
  onNewCommand = jest.fn(), notify = jest.fn(),
  mesaDrafts = {}, onClearDraft = jest.fn(), onSendToCocina = jest.fn(),
} = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TabMesa role={role} notify={notify} onNewCommand={onNewCommand} onCountChange={jest.fn()}
      mesaDrafts={mesaDrafts} onClearDraft={onClearDraft} onSendToCocina={onSendToCocina} />);
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

// Fixed clock, not real wall time: several tests below build reservations at
// Date.now() + N hours to probe "today" vs. "tonight" grouping
// (isRelevantReservation in TabMesa.jsx compares Europe/Madrid calendar
// dates). With the real clock, any run landing late enough in the Madrid day
// makes a +3h offset spill into the next calendar day and silently changes
// which reservations count as "tonight" -- a suite-order-independent flake
// tied to the wall-clock hour, not to test order or machine locale. Pinning
// to noon UTC (14:00 in Madrid's summer DST) keeps every offset used in this
// file (up to +26h is never added forward, only -26h back for "otherDay")
// safely inside the same or a deliberately different calendar day, in any
// process TZ. Only Date is faked -- TabMesa's own setInterval/setTimeout
// calls run on the real clock, unaffected.
beforeAll(() => {
  jest.useFakeTimers({
    doNotFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "nextTick", "setImmediate", "queueMicrotask", "hrtime", "performance"],
  });
  jest.setSystemTime(new Date("2026-08-05T12:00:00.000Z"));
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  // react-scripts' jest config sets resetMocks:true, which strips even the
  // factory-level `jest.fn(() => ...)` implementation before every test --
  // without re-arming these here, requestIdRef's clientRequestId silently
  // becomes undefined in every payment/idempotency-key assertion, and every
  // error banner silently renders empty (setError(undefined) is falsy, so
  // {error && <div className="mesa-error">...} never mounts at all).
  createMesaRequestId.mockReturnValue("mesa_test_request");
  describeMesaError.mockImplementation((error) => error?.code || "error");
  mesaApi.floor.mockResolvedValue({ ok: true, tables: floorTables });
  mesaApi.openTable.mockResolvedValue({ ok: true });
  mesaApi.releaseEmptyTable.mockResolvedValue({ ok: true });
  mesaApi.saveTable.mockResolvedValue({ ok: true });
  mesaApi.createReservation.mockResolvedValue({ ok: true });
  mesaApi.updateReservation.mockResolvedValue({ ok: true });
  mesaApi.setReservationStatus.mockResolvedValue({ ok: true });
  mesaApi.openReservation.mockResolvedValue({ ok: true });
});

test("floor cards show only the bare number and a capacity badge, nothing more", async () => {
  const { container, root } = await mount();
  const cards = container.querySelectorAll(".mesa-table");
  expect(cards).toHaveLength(5);
  expect(cards[0].querySelector(".mesa-number").textContent).toBe("1");
  expect(cards[0].querySelector(".mesa-capacity").textContent).toContain("4");
  expect(container.textContent).not.toMatch(/máx\.|hasta 4 cubiertos/i);
  expect(container.textContent).not.toContain("Mesa 1");
  unmount(container, root);
});

test("Personalizar sala opens table settings and persists a table maximum capacity", async () => {
  const { container, root } = await mount();
  click(buttonByText(container, "🛠 Personalizar sala"));
  // ONE tap in Personalizar sala goes straight to the room editor.
  click(container.querySelector(".mesa-table"));
  expect(container.querySelector('[role="dialog"]').textContent).toContain("Editar Mesa 1");
  click(container.querySelector('[data-testid="capacity-quick-6"]'));
  click(container.querySelector('[data-testid="table-editor-save"]'));
  await flush();
  expect(mesaApi.saveTable).toHaveBeenCalledWith("table-1", expect.objectContaining({
    tableNumber: 1,
    displayName: "Mesa 1",
    capacity: 6,
    active: true,
  }));
  unmount(container, root);
});

test("outside Personalizar sala, tapping a table never offers to edit or remove it", async () => {
  const { container, root } = await mount("waiter");
  // status free + a reservation forces the popup open (not the instant-open path)
  const reservedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  mesaApi.floor.mockResolvedValue({
    ok: true,
    tables: floorTables.map((table, index) => index === 0 ? { ...table, reservations: [{ id: "r1", tableId: table.id, status: "booked", guestName: "Ana", coversTotal: 2, reservedAt, durationMinutes: 120, note: "", version: 1 }] } : table),
  });
  await act(async () => { await flush(); });
  const { container: c2, root: r2 } = await mount("waiter");
  click(c2.querySelector(".mesa-table"));
  expect(c2.querySelector('[role="dialog"]').textContent).not.toContain("Ajustes de mesa");
  expect(c2.querySelector('[role="dialog"]').textContent).not.toContain("Quitar mesa");
  unmount(c2, r2);
  unmount(container, root);
});

test("a booking tonight turns a free table yellow; guest detail lives in the popup, not the card", async () => {
  const reservedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  mesaApi.floor.mockResolvedValue({
    ok: true,
    tables: floorTables.map((table, index) => index === 4 ? {
      ...table,
      reservations: [{ id: "reservation-1", tableId: table.id, status: "booked", guestName: "Antonio", guestPhone: "600123123", coversTotal: 4, reservedAt, durationMinutes: 120, note: "Ventana", version: 1 }],
    } : { ...table, reservations: [] }),
  });
  const { container, root } = await mount("waiter");
  const cards = container.querySelectorAll(".mesa-table");
  expect(cards[4].getAttribute("style")).toContain("#EAB308");
  expect(cards[4].getAttribute("style")).not.toContain("#EF4444");
  expect(cards[4].textContent).not.toContain("Antonio");
  click(cards[4]);
  const dialog = container.querySelector('[role="dialog"]');
  expect(dialog.textContent).not.toContain("Antonio · 4 personas");
  // Scoped to the dialog, not the whole container: a free+reserved floor
  // tile now also carries a "Reservada" badge (see isReservedFree), so a
  // container-wide text search would find that first instead of the
  // popup's own reservation-section toggle.
  click(buttonByText(dialog, "Reserva"));
  expect(dialog.textContent).toContain("Antonio · 4 personas");
  expect(dialog.textContent).toContain("600123123");
  expect(dialog.textContent).toContain("＋ Crear pedido");
  unmount(container, root);
});

test("waiter can modify/move a reservation to another table from its popup", async () => {
  const reservedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const tables = floorTables.map((table, index) => index === 0 ? {
    ...table,
    reservations: [{ id: "reservation-1", tableId: table.id, status: "booked", guestName: "Antonio", guestPhone: "600", coversTotal: 4, reservedAt, durationMinutes: 120, note: "", version: 2 }],
  } : { ...table, reservations: [] });
  mesaApi.floor.mockResolvedValue({ ok: true, tables });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  const dialog = container.querySelector('[role="dialog"]');
  click(buttonByText(dialog, "Reserva"));
  click(buttonByText(dialog, "Modificar"));
  const tableSelect = container.querySelector(".mesa-modal select");
  act(() => {
    tableSelect.value = "table-2";
    tableSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });
  click(buttonByText(container, "Guardar cambios"));
  await flush();
  expect(mesaApi.updateReservation).toHaveBeenCalledWith("reservation-1", expect.objectContaining({
    tableId: "table-2",
    guestName: "Antonio",
    coversTotal: 4,
    expectedVersion: 2,
  }));
  expect(container.textContent).not.toContain("Ajustes de mesa");
  unmount(container, root);
});

test("dragging in Personalizar sala persists the new percentage position", async () => {
  const { container, root } = await mount();
  click(buttonByText(container, "🛠 Personalizar sala"));
  const board = container.querySelector(".mesa-board");
  const table = container.querySelector(".mesa-table");
  board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500 });
  const pointer = (type, target, x, y) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: 7 });
    act(() => { target.dispatchEvent(event); });
  };
  pointer("pointerdown", table, 150, 100);
  pointer("pointermove", board, 400, 250);
  pointer("pointerup", board, 400, 250);
  await flush();
  expect(mesaApi.saveTable).toHaveBeenCalledWith("table-1", expect.objectContaining({
    positionX: 40,
    positionY: 50,
    active: true,
  }));
  unmount(container, root);
});

test("in Personalizar sala, a tap that only jitters a few pixels opens the table menu instead of being read as a drag", async () => {
  // Regression test for the reported bug: "el tap mueve la mesa y no abre
  // el menú". Root cause was pointerMove treating ANY movement as a
  // completed drag -- even the pixel or two of jitter a real tap always
  // has between pointerdown and pointerup -- which nudged the table's
  // position (and saved it) while suppressing the click that should have
  // opened Ajustes de mesa. DRAG_THRESHOLD_PX fixes this: below threshold,
  // nothing moves and the click fires normally.
  const { container, root } = await mount();
  click(buttonByText(container, "🛠 Personalizar sala"));
  const board = container.querySelector(".mesa-board");
  const table = container.querySelector(".mesa-table");
  board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500 });
  const pointer = (type, target, x, y) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: 7 });
    act(() => { target.dispatchEvent(event); });
  };
  pointer("pointerdown", table, 150, 100);
  pointer("pointermove", board, 152, 101); // ~2.2px -- below the 6px threshold
  pointer("pointerup", board, 152, 101);
  click(table); // a real tap always ends with an actual click event too
  await flush();
  expect(mesaApi.saveTable).not.toHaveBeenCalled();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  unmount(container, root);
});

test("in Personalizar sala, a genuine drag past the threshold still suppresses the trailing click (no menu flashes open)", async () => {
  const { container, root } = await mount();
  click(buttonByText(container, "🛠 Personalizar sala"));
  const board = container.querySelector(".mesa-board");
  const table = container.querySelector(".mesa-table");
  board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500 });
  const pointer = (type, target, x, y) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: 7 });
    act(() => { target.dispatchEvent(event); });
  };
  pointer("pointerdown", table, 150, 100);
  pointer("pointermove", board, 400, 250);
  pointer("pointerup", board, 400, 250);
  click(table);
  await flush();
  expect(mesaApi.saveTable).toHaveBeenCalled();
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  unmount(container, root);
});

// MESA_POINTER_TARGET_SHIFT regression tests -- see
// TabMesaPointerTargetShift.static.test.js for the CSS-level proof (jsdom
// does not implement real :active cascade/layout, so the geometry bug itself
// can't be reproduced here). These cover the React-level contract the fix
// must not disturb: a real gesture sequence still opens exactly once, and
// the tile stays a native <button> (native Enter/Space activation, unaffected
// by the CSS-only fix). The double-tap dedup is already covered by "a double
// tap on a free table only opens it once" above -- not duplicated here.
test("a full pointerdown -> pointerup -> click sequence on a free table opens it exactly once", async () => {
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: floorTables });
  const { container, root } = await mount("waiter");
  const table = container.querySelector(".mesa-table");
  const pointer = (type, x, y) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: 3 });
    act(() => { table.dispatchEvent(event); });
  };
  pointer("pointerdown", 50, 50);
  pointer("pointerup", 50, 50);
  click(table);
  await flush();
  expect(mesaApi.openTable).toHaveBeenCalledTimes(1);
  expect(mesaApi.openTable).toHaveBeenCalledWith("table-1");
  unmount(container, root);
});

test("a table tile renders as a native <button>, so Enter/Space activation is preserved by the browser, not custom logic", async () => {
  const { container, root } = await mount();
  const table = container.querySelector(".mesa-table");
  expect(table.tagName).toBe("BUTTON");
  unmount(container, root);
});

test.each([1, 3, 5])("in Personalizar sala, %ipx of travel is still a tap -- no drag, menu opens", async (px) => {
  const { container, root } = await mount();
  click(buttonByText(container, "🛠 Personalizar sala"));
  const board = container.querySelector(".mesa-board");
  const table = container.querySelector(".mesa-table");
  board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500 });
  const pointer = (type, target, x, y) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: 7 });
    act(() => { target.dispatchEvent(event); });
  };
  pointer("pointerdown", table, 150, 100);
  pointer("pointermove", board, 150 + px, 100);
  pointer("pointerup", board, 150 + px, 100);
  click(table);
  await flush();
  expect(mesaApi.saveTable).not.toHaveBeenCalled();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  unmount(container, root);
});

test("in Personalizar sala, exactly 6px of travel (the threshold itself) already counts as a drag", async () => {
  const { container, root } = await mount();
  click(buttonByText(container, "🛠 Personalizar sala"));
  const board = container.querySelector(".mesa-board");
  const table = container.querySelector(".mesa-table");
  board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500 });
  const pointer = (type, target, x, y) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: 7 });
    act(() => { target.dispatchEvent(event); });
  };
  pointer("pointerdown", table, 150, 100);
  pointer("pointermove", board, 156, 100); // exactly 6px
  pointer("pointerup", board, 156, 100);
  click(table);
  await flush();
  expect(mesaApi.saveTable).toHaveBeenCalled();
  unmount(container, root);
});

test("the drag threshold is pointerType-agnostic -- a touch pointer's jitter is still read as a tap", async () => {
  const { container, root } = await mount();
  click(buttonByText(container, "🛠 Personalizar sala"));
  const board = container.querySelector(".mesa-board");
  const table = container.querySelector(".mesa-table");
  board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500 });
  const pointer = (type, target, x, y) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: 9 });
    Object.defineProperty(event, "pointerType", { value: "touch" });
    act(() => { target.dispatchEvent(event); });
  };
  pointer("pointerdown", table, 150, 100);
  pointer("pointermove", board, 152, 101);
  pointer("pointerup", board, 152, 101);
  click(table);
  await flush();
  expect(mesaApi.saveTable).not.toHaveBeenCalled();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  unmount(container, root);
});

test("outside Personalizar sala, pointerdown never arms a drag at all -- a tap always opens the menu", async () => {
  mesaApi.floor.mockResolvedValueOnce({
    ok: true,
    tables: floorTables.map((table, index) => index === 0 ? { ...table, status: "open", session: emptySession() } : table),
  });
  const { container, root } = await mount("waiter");
  const board = container.querySelector(".mesa-board");
  const table = container.querySelector(".mesa-table");
  const pointer = (type, target, x, y) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: 7 });
    act(() => { target.dispatchEvent(event); });
  };
  pointer("pointerdown", table, 150, 100);
  pointer("pointermove", board, 400, 250);
  pointer("pointerup", board, 400, 250);
  click(table);
  await flush();
  expect(mesaApi.saveTable).not.toHaveBeenCalled();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  unmount(container, root);
});

test("tapping a free table with no reservation opens it instantly: no menu, no covers question", async () => {
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: floorTables });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  await flush();
  expect(mesaApi.openTable).toHaveBeenCalledTimes(1);
  expect(mesaApi.openTable).toHaveBeenCalledWith("table-1");
  expect(container.textContent).not.toContain("Abrir mesa");
  expect(container.textContent).not.toContain("Número de comensales");
  unmount(container, root);
});

test("a double tap on a free table only opens it once", async () => {
  let resolveOpen;
  mesaApi.openTable.mockReturnValueOnce(new Promise((resolve) => { resolveOpen = resolve; }));
  const { container, root } = await mount("waiter");
  const table = container.querySelector(".mesa-table");
  click(table);
  click(table);
  await flush();
  expect(mesaApi.openTable).toHaveBeenCalledTimes(1);
  act(() => { resolveOpen({ ok: true }); });
  await flush();
  unmount(container, root);
});

test("an occupied Mesa with no comanda yet opens MesaWorkspace directly, offering Nueva comanda, Ver cuenta and Cerrar mesa", async () => {
  const openTables = floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session: emptySession() }
    : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  const onNewCommand = jest.fn();
  const { container, root } = await mount("waiter", { onNewCommand });
  expect(container.querySelector(".mesa-badge-order")).toBeFalsy();
  click(container.querySelector(".mesa-table"));
  const dialog = container.querySelector('[role="dialog"]');
  // No "Ocupada" subtitle and no second line -- just the compact title.
  expect(dialog.textContent).not.toContain("Ocupada");
  expect(dialog.textContent).toContain("＋ Nueva comanda");
  expect(dialog.textContent).toContain("Ver cuenta");
  expect(dialog.textContent).toContain("Cerrar mesa");
  click(buttonByText(container, "＋ Nueva comanda"));
  // TabMesa no longer gates on coversTotal itself -- it just forwards the
  // table; the caller (MesaOrderBuilder, mounted by ServicioPage) decides
  // whether to show its own covers step from table.session.coversTotal.
  expect(onNewCommand).toHaveBeenCalledTimes(1);
  expect(onNewCommand).toHaveBeenCalledWith(expect.objectContaining({ id: "table-1" }));
  unmount(container, root);
});

test("Cerrar mesa opens an internal dialog (never window.confirm); it shows the right copy and makes no request until confirmed", async () => {
  const openTables = floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session: emptySession() }
    : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Cerrar mesa"));
  const confirmDialog = container.querySelector('[role="alertdialog"]');
  expect(confirmDialog).toBeTruthy();
  expect(confirmDialog.getAttribute("aria-modal")).toBe("true");
  expect(confirmDialog.textContent).toContain("Cerrar Mesa 1");
  expect(confirmDialog.textContent).toContain("La mesa está vacía y no tiene comandas ni pagos.");
  expect(mesaApi.releaseEmptyTable).not.toHaveBeenCalled();
  unmount(container, root);
});

test("Cancelar closes the Cerrar mesa dialog without any request; the table stays open and offering Cerrar mesa", async () => {
  const openTables = floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session: emptySession() }
    : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Cerrar mesa"));
  click(buttonByText(container.querySelector('[role="alertdialog"]'), "Cancelar"));
  await flush();
  expect(mesaApi.releaseEmptyTable).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alertdialog"]')).toBeFalsy();
  expect(container.querySelector('[role="dialog"]').textContent).toContain("Cerrar mesa");
  unmount(container, root);
});

test("Escape cancels the Cerrar mesa dialog without any request", async () => {
  const openTables = floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session: emptySession() }
    : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Cerrar mesa"));
  expect(container.querySelector('[role="alertdialog"]')).toBeTruthy();
  act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  await flush();
  expect(container.querySelector('[role="alertdialog"]')).toBeFalsy();
  expect(mesaApi.releaseEmptyTable).not.toHaveBeenCalled();
  unmount(container, root);
});

test("confirming Cerrar mesa releases the table exactly once, without any payment call, and closes both the confirm dialog and the popup", async () => {
  const openTables = floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session: emptySession() }
    : table);
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: openTables });
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: floorTables });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Cerrar mesa"));
  const confirmDialog = container.querySelector('[role="alertdialog"]');
  click(buttonByText(confirmDialog, "Cerrar mesa"));
  await flush();
  expect(mesaApi.releaseEmptyTable).toHaveBeenCalledTimes(1);
  expect(mesaApi.releaseEmptyTable).toHaveBeenCalledWith("session-x");
  expect(mesaApi.pay).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alertdialog"]')).toBeFalsy();
  expect(container.querySelector('[role="dialog"]')).toBeFalsy();
  unmount(container, root);
});

test("a second click on Cerrar mesa (confirm) while the request is in flight never sends a second request -- button disables and shows Cerrando…", async () => {
  const openTables = floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session: emptySession() }
    : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  let resolveRelease;
  mesaApi.releaseEmptyTable.mockReturnValue(new Promise((resolve) => { resolveRelease = resolve; }));
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Cerrar mesa"));
  const confirmDialog = container.querySelector('[role="alertdialog"]');
  const confirmBtn = buttonByText(confirmDialog, "Cerrar mesa");
  click(confirmBtn);
  await flush();
  expect(confirmBtn.disabled).toBe(true);
  expect(confirmBtn.textContent).toContain("Cerrando");
  click(confirmBtn);
  await flush();
  expect(mesaApi.releaseEmptyTable).toHaveBeenCalledTimes(1);
  act(() => { resolveRelease({ ok: true }); });
  await flush();
  unmount(container, root);
});

test("an occupied Mesa with an order shows an active (never free-green) thick border, comanda summary, and offers Nueva comanda / Ver cuenta, never asking for covers again", async () => {
  const openTables = floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session: emptySession({ coversTotal: 4, coversRemaining: 4, commands: [{ id: "o1", commandNumber: 1, state: "EN_COCINA", items: [{ n: "Margherita" }], time: "21:00" }] }) }
    : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  const onNewCommand = jest.fn();
  const { container, root } = await mount("waiter", { onNewCommand });
  const card = container.querySelector(".mesa-table");
  expect(card.className).toContain("thick");
  expect(card.getAttribute("style")).toContain("--tc: #F97316");
  expect(card.getAttribute("style")).not.toContain("--tc: #22C55E");
  // Fill stays occupied-red regardless of order state -- only the border changed.
  expect(card.getAttribute("style")).toContain("--tb: rgba(239,68,68,.22)");
  click(card);
  const dialog = container.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain("＋ Nueva comanda");
  expect(dialog.textContent).toContain("Ver cuenta");
  expect(dialog.textContent).toContain("Comandas");
  expect(dialog.textContent).toContain("#1");
  expect(dialog.textContent).toContain("21:00");
  expect(dialog.textContent).toContain("En cocina");
  expect(dialog.textContent).not.toContain("Crear pedido");
  expect(dialog.textContent).not.toContain("Añadir pedido");
  // P0-B.1 -- Cerrar mesa is no longer gated on coversTotal == null: an
  // occupied table (even mid-order) can attempt the explicit close, and the
  // backend (mesa_close_session_v1) is what actually decides whether
  // outstanding balance or pending kitchen work blocks it.
  expect(dialog.textContent).toContain("Cerrar mesa");
  click(buttonByText(container, "＋ Nueva comanda"));
  expect(onNewCommand).toHaveBeenCalledWith(expect.objectContaining({ id: "table-1" }));
  unmount(container, root);
});

test("confirming Cerrar mesa on an OCCUPIED table calls closeTable (not releaseEmptyTable), and a blocked close surfaces the backend's error", async () => {
  const openTables = floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session: emptySession({ coversTotal: 4, coversRemaining: 4, commands: [{ id: "o1", commandNumber: 1, state: "EN_COCINA", items: [{ n: "Margherita" }], time: "21:00" }] }) }
    : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  mesaApi.closeTable.mockRejectedValueOnce({ code: "MESA_TABLE_HAS_ACTIVE_ORDERS" });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Cerrar mesa"));
  const confirmDialog = container.querySelector('[role="alertdialog"]');
  // Dialog copy must not claim the table is empty when it plainly is not.
  expect(confirmDialog.textContent).not.toContain("La mesa está vacía");
  click(buttonByText(confirmDialog, "Cerrar mesa"));
  await flush();
  expect(mesaApi.closeTable).toHaveBeenCalledTimes(1);
  expect(mesaApi.closeTable).toHaveBeenCalledWith("session-x");
  expect(mesaApi.releaseEmptyTable).not.toHaveBeenCalled();
  // Blocked: dialog stays open and shows the mapped error, table not closed.
  expect(container.querySelector('[role="alertdialog"]')).toBeTruthy();
  expect(describeMesaError).toHaveBeenCalledWith({ code: "MESA_TABLE_HAS_ACTIVE_ORDERS" });
  unmount(container, root);
});

test("confirming Cerrar mesa on a settled OCCUPIED table (paid, no pending orders) closes it via closeTable", async () => {
  const openTables = floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session: emptySession({ coversTotal: 4, coversRemaining: 0, commands: [] }) }
    : table);
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: openTables });
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: floorTables });
  mesaApi.closeTable.mockResolvedValueOnce({ ok: true, status: "closed", forced: false });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Cerrar mesa"));
  const confirmDialog = container.querySelector('[role="alertdialog"]');
  click(buttonByText(confirmDialog, "Cerrar mesa"));
  await flush();
  expect(mesaApi.closeTable).toHaveBeenCalledWith("session-x");
  expect(mesaApi.pay).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alertdialog"]')).toBeFalsy();
  expect(container.querySelector('[role="dialog"]')).toBeFalsy();
  unmount(container, root);
});

test("in Personalizar sala, an occupied table's popup offers only layout actions -- never Nueva comanda, Cerrar mesa or Ver cuenta", async () => {
  // Regression test: TableContextPopup used to gate Ajustes de mesa /
  // Eliminar mesa on `editing` but never gated the order/account buttons
  // the other way, so entering Personalizar sala and tapping an occupied
  // table showed both sets of actions stacked in the same popup. Since the
  // consolidation into MesaWorkspace, an occupied table outside editing
  // never even reaches this popup -- editing is the ONLY way it does.
  const openTables = floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session: emptySession({ coversTotal: 4, coversRemaining: 4, commands: [{ id: "o1", commandNumber: 1, state: "EN_COCINA", items: [{ n: "Margherita" }], time: "21:00" }] }) }
    : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  const { container, root } = await mount();
  click(buttonByText(container, "🛠 Personalizar sala"));
  click(container.querySelector(".mesa-table"));
  // A tap in Personalizar sala now lands on the room editor directly. The
  // guarantee this test exists for is unchanged and in fact stronger: while
  // customizing, an occupied table exposes ONLY room configuration, never an
  // operational action that could disturb a live service.
  const dialog = container.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain("Editar Mesa");
  expect(dialog.textContent).toContain("Eliminar mesa");
  expect(dialog.textContent).not.toContain("Crear pedido");
  expect(dialog.textContent).not.toContain("Nueva comanda");
  expect(dialog.textContent).not.toContain("Ver cuenta");
  expect(dialog.textContent).not.toContain("Cerrar mesa");
  expect(dialog.textContent).not.toContain("Comandas");
  // Leaving Personalizar sala restores MesaWorkspace (direct, no popup hop)
  // and hides the layout-only actions, with no reload needed.
  click(buttonByText(container, "✓ Listo"));
  click(container.querySelector(".mesa-table"));
  const dialog2 = container.querySelector('[role="dialog"]');
  expect(dialog2.textContent).toContain("＋ Nueva comanda");
  expect(dialog2.textContent).toContain("Ver cuenta");
  expect(dialog2.textContent).not.toContain("Editar Mesa");
  expect(dialog2.textContent).not.toContain("Eliminar mesa");
  unmount(container, root);
});

test("a table with two comandas shows both, collapsed by default, expandable independently and distinct, and Nueva comanda stays available for a third", async () => {
  const openTables = floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session: emptySession({ coversTotal: 4, coversRemaining: 4, commands: [
        { id: "o1", commandNumber: 1, state: "RETIRADO", items: [{ n: "Margherita" }], time: "20:50", note: "sin cebolla" },
        { id: "o2", commandNumber: 2, state: "EN_COCINA", items: [{ n: "Coca-Cola" }, { n: "Agua" }], time: "21:10", note: "" },
      ] }) }
    : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  const dialog = container.querySelector('[role="dialog"]');
  let cards = Array.from(dialog.querySelectorAll(".mesa-command-card")).map((card) => card.textContent);
  expect(cards).toHaveLength(2);
  // Collapsed: number, state and time are always visible; product detail is not.
  expect(cards[0]).toContain("#1");
  expect(cards[0]).toContain("20:50");
  expect(cards[0]).toContain("Servido");
  expect(cards[0]).not.toContain("Margherita");
  expect(cards[1]).toContain("#2");
  expect(cards[1]).toContain("21:10");
  expect(cards[1]).toContain("En cocina");
  expect(cards[1]).not.toContain("Coca-Cola");
  // Expanding #1 reveals its own products/note without touching #2.
  const cardEls = Array.from(dialog.querySelectorAll(".mesa-command-card"));
  click(cardEls[0].querySelector("button"));
  cards = Array.from(dialog.querySelectorAll(".mesa-command-card")).map((card) => card.textContent);
  expect(cards[0]).toContain("Margherita");
  expect(cards[0]).toContain("Nota: sin cebolla");
  expect(cards[1]).not.toContain("Margherita");
  expect(cards[1]).not.toContain("sin cebolla");
  expect(cards[1]).not.toContain("Coca-Cola");
  // Expanding #2 independently reveals its own 2 products.
  click(cardEls[1].querySelector("button"));
  cards = Array.from(dialog.querySelectorAll(".mesa-command-card")).map((card) => card.textContent);
  expect(cards[1]).toContain("2 productos");
  expect(cards[1]).toContain("Coca-Cola");
  expect(cards[1]).toContain("Agua");
  expect(cards[0]).not.toContain("Coca-Cola");
  // the sheet actively grows for a table with real comandas to show, not
  // just the default shrink-to-content popup size
  expect(dialog.querySelector(".mesa-modal").className).toContain("tall");
  expect(dialog.textContent).toContain("＋ Nueva comanda");
  expect(dialog.textContent).not.toContain("Crear pedido");
  expect(dialog.textContent).not.toContain("Añadir pedido");
  unmount(container, root);
});

test("Ver cuenta -> Cobrar todo charges the full outstanding balance, prints a receipt, and the next reload returns the table to free", async () => {
  const session = emptySession({
    coversTotal: 4, coversRemaining: 4, total: 40, paid: 0, outstanding: 40, nextEqualShare: 10,
    commands: [{ id: "o1", commandNumber: 1, state: "EN_COCINA", items: [{ n: "Margherita" }], time: "21:00" }],
    lines: [{ id: "l1", description: "Margherita", remaining: 40 }],
  });
  const openTables = floorTables.map((table, index) => index === 0 ? { ...table, status: "open", session } : table);
  // Only the FIRST load is occupied; beforeEach's persisting mock (all-free
  // floorTables) takes over on the reload triggered by onRefresh below --
  // simulating the backend having closed the session after full payment.
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: openTables });
  mesaApi.pay.mockResolvedValue({ amount: 40, outstandingAfter: 0 });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Ver cuenta"));
  click(buttonByText(container, "Cobrar todo"));
  // Payment Hub V1: Cobrar todo opens the ONE contextual drawer in place --
  // amount, method, confirm -- instead of stacking a second dialog.
  let dialogs = container.querySelectorAll('[role="dialog"]');
  expect(dialogs).toHaveLength(2); // MesaWorkspace + VerCuentaModal, nothing new
  const drawer = container.querySelector('[data-testid="mesa-hub-drawer-cobrar-todo"]');
  expect(drawer).not.toBeNull();
  expect(drawer.textContent).toMatch(/40,00\s?€/);
  click(buttonByText(container, "Confirmar cobro"));
  await flush();
  // THE POINT OF THIS TEST, unchanged by the refactor: the request body is
  // byte-identical to the one the old PaymentModal sent for mode "full".
  expect(mesaApi.pay).toHaveBeenCalledWith("session-x", expect.objectContaining({
    paymentMethod: "efectivo", mode: "full", coversSettled: 4, clientRequestId: "mesa_test_request",
  }));
  await flush();
  dialogs = container.querySelectorAll('[role="dialog"]');
  expect(dialogs).toHaveLength(1);
  expect(dialogs[0].textContent).toContain("RECIBO DE PAGO");
  expect(dialogs[0].textContent).toContain("Cuenta pagada. Cierra la mesa para liberarla.");
  expect(container.textContent).not.toContain("Mesa 1 · aún sin comensales");
  unmount(container, root);
});

test("Ver cuenta -> Elegir productos requires at least one selected line before confirming, and never calls pay with an empty selection", async () => {
  const session = emptySession({
    coversTotal: 2, coversRemaining: 2, total: 20, paid: 0, outstanding: 20, nextEqualShare: 10,
    commands: [{ id: "o1", commandNumber: 1, state: "EN_COCINA", items: [{ n: "Pizza" }], time: "21:00" }],
    lines: [{ id: "l1", description: "Pizza", remaining: 20 }],
  });
  const openTables = floorTables.map((table, index) => index === 0 ? { ...table, status: "open", session } : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Ver cuenta"));
  click(buttonByText(container, "Pago parcial"));
  click(buttonByText(container, "Elegir productos"));
  click(buttonByText(container, "Confirmar cobro"));
  const dialogs = container.querySelectorAll('[role="dialog"]');
  expect(dialogs[dialogs.length - 1].textContent).toContain("Selecciona al menos un producto.");
  expect(mesaApi.pay).not.toHaveBeenCalled();
  unmount(container, root);
});

test("Ver cuenta -> Importe libre rejects a custom amount above the outstanding balance client-side, before ever calling pay", async () => {
  const session = emptySession({
    coversTotal: 2, coversRemaining: 2, total: 20, paid: 0, outstanding: 20, nextEqualShare: 10,
    commands: [{ id: "o1", commandNumber: 1, state: "EN_COCINA", items: [{ n: "Pizza" }], time: "21:00" }],
    lines: [{ id: "l1", description: "Pizza", remaining: 20 }],
  });
  const openTables = floorTables.map((table, index) => index === 0 ? { ...table, status: "open", session } : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Ver cuenta"));
  click(buttonByText(container, "Pago parcial"));
  click(buttonByText(container, "Importe libre"));
  const dialogs = container.querySelectorAll('[role="dialog"]');
  const paymentDialog = dialogs[dialogs.length - 1];
  const amountInput = paymentDialog.querySelector("input.mesa-input");
  typeInto(amountInput, "999");
  click(buttonByText(paymentDialog, "Confirmar cobro"));
  expect(paymentDialog.textContent).toContain("El importe no es válido.");
  expect(mesaApi.pay).not.toHaveBeenCalled();
  unmount(container, root);
});

test("a partial (item_selection) payment keeps the table occupied and recalculates the outstanding balance instead of closing the session", async () => {
  const session = emptySession({
    coversTotal: 4, coversRemaining: 4, total: 40, paid: 0, outstanding: 40, nextEqualShare: 10,
    commands: [{ id: "o1", commandNumber: 1, state: "EN_COCINA", items: [{ n: "Margherita" }, { n: "Coca-Cola" }], time: "21:00" }],
    lines: [{ id: "l1", description: "Margherita", remaining: 25 }, { id: "l2", description: "Coca-Cola", remaining: 15 }],
  });
  const openTables = floorTables.map((table, index) => index === 0 ? { ...table, status: "open", session } : table);
  // Persists across the post-payment reload too -- the table must still read
  // as occupied afterward, unlike the full-payment test above.
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  mesaApi.pay.mockResolvedValue({ amount: 25, outstandingAfter: 15 });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Ver cuenta"));
  click(buttonByText(container, "Pago parcial"));
  click(buttonByText(container, "Elegir productos"));
  let dialogs = container.querySelectorAll('[role="dialog"]');
  const paymentDialog = dialogs[dialogs.length - 1];
  click(paymentDialog.querySelector('input[type="checkbox"]'));
  click(buttonByText(paymentDialog, "Confirmar cobro"));
  await flush();
  expect(mesaApi.pay).toHaveBeenCalledWith("session-x", expect.objectContaining({
    mode: "item_selection", lineIds: ["l1"],
  }));
  await flush();
  dialogs = container.querySelectorAll('[role="dialog"]');
  expect(dialogs).toHaveLength(3); // MesaWorkspace + VerCuentaModal stay open beneath the printed receipt
  expect(container.textContent).toContain("RECIBO DE PAGO");
  expect(container.textContent).toContain("Pago parcial registrado.");
  unmount(container, root);
});

test("opening a free table that fails leaves it free with no stuck popup, notifies the error, and an immediate retry still works", async () => {
  mesaApi.openTable.mockRejectedValueOnce({ code: "MESA_ALREADY_OPEN" });
  const onNotify = jest.fn();
  const { container, root } = await mount("waiter", { notify: onNotify });
  const card = container.querySelector(".mesa-table");
  click(card);
  await flush();
  expect(onNotify).toHaveBeenCalledWith(expect.stringContaining("MESA_ALREADY_OPEN"), expect.anything());
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  mesaApi.openTable.mockResolvedValueOnce({ ok: true });
  click(card);
  await flush();
  expect(mesaApi.openTable).toHaveBeenCalledTimes(2);
  unmount(container, root);
});

test("a rejected Cerrar mesa keeps the confirm dialog open with an inline error, and the table stays occupied", async () => {
  const openTables = floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session: emptySession() } : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  mesaApi.releaseEmptyTable.mockRejectedValueOnce({ code: "MESA_SESSION_NOT_EMPTY" });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Cerrar mesa"));
  const confirmDialog = container.querySelector('[role="alertdialog"]');
  click(buttonByText(confirmDialog, "Cerrar mesa"));
  await flush();
  const dialogAfter = container.querySelector('[role="alertdialog"]');
  expect(dialogAfter).toBeTruthy();
  expect(dialogAfter.textContent).toContain("MESA_SESSION_NOT_EMPTY");
  // still occupied, still offering the same actions -- not left half-closed
  expect(container.querySelector('[role="dialog"]').textContent).toContain("＋ Nueva comanda");
  expect(mesaApi.releaseEmptyTable).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

test("a failed payment shows an inline error and keeps the table's outstanding balance unchanged -- no receipt, no reload, table stays open", async () => {
  const session = emptySession({
    coversTotal: 2, coversRemaining: 2, total: 20, paid: 0, outstanding: 20, nextEqualShare: 20,
    commands: [{ id: "o1", commandNumber: 1, state: "EN_COCINA", items: [{ n: "Pizza" }], time: "21:00" }],
    lines: [{ id: "l1", description: "Pizza", remaining: 20 }],
  });
  const openTables = floorTables.map((table, index) => index === 0 ? { ...table, status: "open", session } : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  mesaApi.pay.mockRejectedValueOnce({ code: "MESA_PAYMENT_DECLINED" });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Ver cuenta"));
  click(buttonByText(container, "Cobrar todo"));
  click(buttonByText(container, "Confirmar cobro"));
  await flush();
  const dialogs = container.querySelectorAll('[role="dialog"]');
  // Cobrar todo is inline now, so the failure surfaces in the hub itself --
  // no third dialog to stack, and nothing closes underneath it.
  expect(dialogs).toHaveLength(2); // MesaWorkspace + VerCuentaModal, both still open
  expect(container.querySelector('[data-testid="mesa-hub-error"]').textContent)
    .toContain("MESA_PAYMENT_DECLINED");
  expect(container.textContent).not.toContain("RECIBO DE PAGO");
  // The balance is untouched -- same figure, its Payment Hub label.
  expect(container.textContent).toMatch(/Resta por pagar20,00\s?€/);
  // and the drawer stays open so the operator can simply retry
  expect(container.querySelector('[data-testid="mesa-hub-drawer-cobrar-todo"]')).not.toBeNull();
  unmount(container, root);
});

test("a slow payment request disables Confirmar cobro until it settles, so a second tap while pending cannot double-charge", async () => {
  const session = emptySession({
    coversTotal: 2, coversRemaining: 2, total: 20, paid: 0, outstanding: 20, nextEqualShare: 20,
    commands: [{ id: "o1", commandNumber: 1, state: "EN_COCINA", items: [{ n: "Pizza" }], time: "21:00" }],
    lines: [{ id: "l1", description: "Pizza", remaining: 20 }],
  });
  const openTables = floorTables.map((table, index) => index === 0 ? { ...table, status: "open", session } : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  let resolvePay;
  mesaApi.pay.mockReturnValue(new Promise((resolve) => { resolvePay = resolve; }));
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  click(buttonByText(container, "Ver cuenta"));
  click(buttonByText(container, "Cobrar todo"));
  // Captured once, before it goes busy -- React updates this same button
  // node in place (label + disabled), it doesn't replace it, so the
  // reference stays valid for the second, should-be-ignored tap.
  const confirmBtn = buttonByText(container, "Confirmar cobro");
  click(confirmBtn);
  await flush();
  expect(confirmBtn.disabled).toBe(true);
  expect(confirmBtn.textContent).toContain("Registrando");
  // a second tap while busy is a no-op -- the button is disabled, so a real
  // click() dispatch on it must not fire React's onClick handler again
  click(confirmBtn);
  await flush();
  expect(mesaApi.pay).toHaveBeenCalledTimes(1);
  act(() => { resolvePay({ amount: 20, outstandingAfter: 0 }); });
  await flush();
  unmount(container, root);
});

test("an occupied Mesa with NO order yet shows a thick red border and 'Todavía no hay comandas'", async () => {
  const openTables = floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session: emptySession() } : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  const { container, root } = await mount("waiter");
  const card = container.querySelector(".mesa-table");
  expect(card.className).toContain("thick");
  expect(card.getAttribute("style")).toContain("--tc: #EF4444");
  click(card);
  const dialog = container.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain("Todavía no hay comandas");
  unmount(container, root);
});

test("occupied + a future relevant reservation stays red (never yellow); the reservation shows only as a secondary, collapsed indicator", async () => {
  const reservedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const openTables = floorTables.map((table, index) => index === 0
    ? {
      ...table, status: "open", session: emptySession(),
      reservations: [{ id: "r1", tableId: table.id, status: "booked", guestName: "Laura", coversTotal: 2, reservedAt, durationMinutes: 120, note: "", version: 1 }],
    }
    : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  const { container, root } = await mount("waiter");
  const card = container.querySelector(".mesa-table");
  // Fill is occupied-red, not reserved-yellow -- occupied always wins.
  expect(card.getAttribute("style")).toContain("--tb: rgba(239,68,68,.22)");
  expect(card.textContent).not.toContain("Reservada"); // that badge is the free+reserved case only
  click(card);
  const dialog = container.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain("＋ Nueva comanda"); // primary action, unaffected
  // The reservation is present but collapsed (secondary), not driving the fill.
  click(buttonByText(dialog, "Próxima reserva"));
  expect(dialog.textContent).toContain("Laura");
  unmount(container, root);
});

test("Reservas · Beta and the floor never disagree: a reservation dated a different day appears in neither", async () => {
  const otherDay = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(); // yesterday-ish, well outside today's window
  const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const tables = floorTables.map((table, index) => index === 0
    ? { ...table, reservations: [{ id: "r-stale", tableId: table.id, status: "booked", guestName: "Stale Guest", coversTotal: 2, reservedAt: otherDay, durationMinutes: 120, note: "", version: 1 }] }
    : index === 1
      ? { ...table, reservations: [{ id: "r-fresh", tableId: table.id, status: "booked", guestName: "Fresh Guest", coversTotal: 2, reservedAt: soon, durationMinutes: 120, note: "", version: 1 }] }
      : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables });
  const { container, root } = await mount("waiter");
  const cards = container.querySelectorAll(".mesa-table");
  // Floor: table 0 (stale) reads free/green, table 1 (fresh) reads reserved/yellow.
  expect(cards[0].getAttribute("style")).not.toContain("#EAB308");
  expect(cards[1].getAttribute("style")).toContain("#EAB308");
  // Reservas · Beta: same two facts, from the same predicate.
  click(buttonByText(container, "📅 Reservas · Beta"));
  const agenda = container.querySelector('[role="dialog"]');
  expect(agenda.textContent).not.toContain("Stale Guest");
  expect(agenda.textContent).toContain("Fresh Guest");
  unmount(container, root);
});

test("creating a reservation refreshes the floor without a manual reload", async () => {
  const { container, root } = await mount("waiter");
  const floorCallsBefore = mesaApi.floor.mock.calls.length;
  click(buttonByText(container, "📅 Reservas · Beta"));
  click(buttonByText(container, "＋ Nueva reserva"));
  typeInto(container.querySelector('.mesa-modal input[maxlength="120"]'), "Nuevo Cliente");
  click(buttonByText(container, "Reservar mesa"));
  await flush();
  expect(mesaApi.createReservation).toHaveBeenCalled();
  expect(mesaApi.floor.mock.calls.length).toBeGreaterThan(floorCallsBefore);
  unmount(container, root);
});

test("cancelling a reservation refreshes the floor without a manual reload", async () => {
  const reservedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const tables = floorTables.map((table, index) => index === 0
    ? { ...table, reservations: [{ id: "r1", tableId: table.id, status: "booked", guestName: "Ana", coversTotal: 2, reservedAt, durationMinutes: 120, note: "", version: 1 }] }
    : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables });
  const { container, root } = await mount("waiter");
  const floorCallsBefore = mesaApi.floor.mock.calls.length;
  click(container.querySelector(".mesa-table"));
  const dialog = container.querySelector('[role="dialog"]');
  click(buttonByText(dialog, "Reserva"));
  window.confirm = jest.fn(() => true);
  click(buttonByText(dialog, "Cancelar"));
  await flush();
  expect(mesaApi.setReservationStatus).toHaveBeenCalledWith("r1", 1, "cancelled");
  expect(mesaApi.floor.mock.calls.length).toBeGreaterThan(floorCallsBefore);
  unmount(container, root);
});

test("a free table's border is thin (only occupied tables get the thick order-state border)", async () => {
  const { container, root } = await mount();
  const card = container.querySelector(".mesa-table");
  expect(card.className).not.toContain("thick");
  unmount(container, root);
});

test("a ready order (LISTO) pulses the green border; a table with only in-kitchen orders does not pulse", async () => {
  const openTables = floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session: emptySession({ commands: [{ id: "o1", commandNumber: 1, state: "LISTO", items: [], time: "21:00" }] }) }
    : index === 1
      ? { ...table, status: "open", session: emptySession({ commands: [{ id: "o2", commandNumber: 1, state: "EN_COCINA", items: [], time: "21:05" }] }) }
      : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  const { container, root } = await mount();
  const cards = container.querySelectorAll(".mesa-table");
  expect(cards[0].className).toContain("ready-pulse");
  expect(cards[1].className).not.toContain("ready-pulse");
  unmount(container, root);
});

test("entering Personalizar sala suspends the ready-pulse glow; leaving it restores the pulse, with no reload", async () => {
  const openTables = floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session: emptySession({ commands: [{ id: "o1", commandNumber: 1, state: "LISTO", items: [], time: "21:00" }] }) }
    : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  const floorCallsBefore = mesaApi.floor.mock.calls.length;
  const { container, root } = await mount();
  const readyCard = () => container.querySelectorAll(".mesa-table")[0];
  expect(readyCard().className).toContain("ready-pulse");

  click(buttonByText(container, "🛠 Personalizar sala"));
  expect(readyCard().className).not.toContain("ready-pulse");
  expect(readyCard().className).toContain("is-editing");

  click(buttonByText(container, "✓ Listo"));
  expect(readyCard().className).toContain("ready-pulse");
  expect(readyCard().className).not.toContain("is-editing");
  // Restored from the SAME already-fetched table state -- no extra floor()
  // call was needed to bring the pulse back.
  expect(mesaApi.floor.mock.calls.length).toBe(floorCallsBefore + 1);
  unmount(container, root);
});

test("Personalizar sala gives every table a flat neutral dashed border, regardless of its operational fill/thickness", async () => {
  const openTables = floorTables.map((table, index) => index === 0
    ? { ...table, status: "open", session: emptySession({ commands: [{ id: "o1", commandNumber: 1, state: "EN_COCINA", items: [], time: "21:00" }] }) }
    : table);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
  const { container, root } = await mount();
  click(buttonByText(container, "🛠 Personalizar sala"));
  const cards = container.querySelectorAll(".mesa-table");
  // Table 0 is occupied-no-order (normally a thick RED border); in edit
  // mode its border must read the same as every other table's.
  expect(cards[0].className).toContain("is-editing");
  expect(cards[0].className).toContain("thick"); // the operational flag is still there in the DOM...
  // ...but is-editing.thick resets the width back to 2px, and is-editing
  // itself overrides border-color to the same neutral value for every
  // table -- verified as CSS rules present in the injected stylesheet
  // (jsdom doesn't run layout, so this asserts the rule exists rather than
  // a computed color).
  const styleText = container.querySelector("style").textContent;
  expect(styleText).toContain(".mesa-table.is-editing{border-style:dashed;border-color:rgba(224,214,194,.55)");
  expect(styleText).toContain(".mesa-table.is-editing.thick{border-width:2px}");
  unmount(container, root);
});

test("the dock below the map swaps Reservas·Beta/Personalizar sala for Añadir mesa/Salir while editing, never both at once", async () => {
  const { container, root } = await mount();
  const board = container.querySelector(".mesa-board");
  const dock = () => board.nextElementSibling.matches(".mesa-dock") ? board.nextElementSibling : container.querySelector(".mesa-dock");

  expect(dock().textContent).toContain("Reservas · Beta");
  expect(dock().textContent).not.toContain("Añadir mesa");
  expect(dock().textContent).toContain("Personalizar sala");

  click(buttonByText(container, "🛠 Personalizar sala"));
  expect(dock().textContent).not.toContain("Reservas · Beta");
  expect(dock().textContent).toContain("Añadir mesa");
  expect(dock().textContent).toContain("Listo");

  click(buttonByText(container, "✓ Listo"));
  expect(dock().textContent).toContain("Reservas · Beta");
  expect(dock().textContent).not.toContain("Añadir mesa");
  unmount(container, root);
});

test("the dock renders after the floor board in the DOM (below the map, not a second toolbar above it)", async () => {
  const { container, root } = await mount();
  const board = container.querySelector(".mesa-board");
  const dock = container.querySelector(".mesa-dock");
  // DOCUMENT_POSITION_FOLLOWING (4) means dock comes after board.
  expect(board.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  unmount(container, root);
});

test("selecting a reserved table's popup marks its own card as selected, others stay unselected", async () => {
  const reservedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  mesaApi.floor.mockResolvedValue({
    ok: true,
    tables: floorTables.map((table, index) => index === 0
      ? { ...table, reservations: [{ id: "r1", tableId: table.id, status: "booked", guestName: "Ana", coversTotal: 2, reservedAt, durationMinutes: 120, note: "", version: 1 }] }
      : table),
  });
  const { container, root } = await mount();
  const cards = container.querySelectorAll(".mesa-table");
  click(cards[0]);
  expect(cards[0].className).toContain("selected");
  expect(cards[1].className).not.toContain("selected");
  unmount(container, root);
});

test("dragging a wide rectangle-long table to the right edge clamps by its own half-width, not the narrower default margin", async () => {
  mesaApi.floor.mockResolvedValue({
    ok: true,
    tables: [{ ...floorTables[0], shape: "rectangle", shapePreset: "long" }],
  });
  const { container, root } = await mount();
  click(buttonByText(container, "🛠 Personalizar sala"));
  const board = container.querySelector(".mesa-board");
  const table = container.querySelector(".mesa-table");
  board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500 });
  const pointer = (type, target, x, y) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: 7 });
    act(() => { target.dispatchEvent(event); });
  };
  // Drag well past the right edge -- a 168px-wide card on a 1000px board needs
  // an 8.4% margin (half-width), wider than the 7% default used by round/square.
  pointer("pointerdown", table, 150, 100);
  pointer("pointermove", board, 990, 250);
  pointer("pointerup", board, 990, 250);
  await flush();
  expect(mesaApi.saveTable).toHaveBeenCalledWith("table-1", expect.objectContaining({
    positionX: 91.6,
  }));
  unmount(container, root);
});

test("all four shape/length variants render with their exact CSS class and a fixed footprint", async () => {
  const shaped = [
    { ...floorTables[0], shape: "round", shapePreset: "standard" },
    { ...floorTables[1], shape: "square", shapePreset: "standard" },
    { ...floorTables[2], shape: "rectangle", shapePreset: "standard" },
    { ...floorTables[3], shape: "rectangle", shapePreset: "long" },
  ];
  mesaApi.floor.mockResolvedValue({ ok: true, tables: shaped });
  const { container, root } = await mount();
  const cards = container.querySelectorAll(".mesa-table");
  expect(cards[0].className).toContain("mesa-table round");
  expect(cards[1].className).toContain("mesa-table square");
  expect(cards[2].className).toContain("mesa-table rectangle");
  expect(cards[2].className).not.toContain("rectangle-long");
  expect(cards[3].className).toContain("mesa-table rectangle-long");
  // Two-digit table numbers and capacity still fit the same fixed card, no per-state sizing.
  expect(cards[0].querySelector(".mesa-number").textContent).toBe("1");
  unmount(container, root);
});

test("a table with no shapePreset on the wire (legacy row) defaults to the standard variant, not a crash", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [{ ...floorTables[0], shape: "square", shapePreset: undefined }] });
  const { container, root } = await mount();
  const card = container.querySelector(".mesa-table");
  expect(card.className).toContain("mesa-table square");
  unmount(container, root);
});

test("Añadir mesa offers the three visual shapes and creates with the chosen shape+length pair", async () => {
  const { container, root } = await mount();
  click(buttonByText(container, "🛠 Personalizar sala"));
  click(buttonByText(container, "＋ Añadir mesa"));
  const dialog = container.querySelector('[role="dialog"]');
  const shapeButtons = dialog.querySelectorAll(".mesa-shape-btn");
  expect(Array.from(shapeButtons).map((button) => button.textContent)).toEqual(["Redonda", "Cuadrada", "Rectangular"]);
  click(Array.from(shapeButtons).find((button) => button.textContent === "Rectangular"));
  // Choosing Rectangular reveals the compact 6/8 plazas length control.
  const lengthButtons = dialog.querySelectorAll(".mesa-btn.small");
  expect(Array.from(lengthButtons).map((button) => button.textContent)).toEqual(["6 plazas", "8 plazas"]);
  click(Array.from(lengthButtons).find((button) => button.textContent === "8 plazas"));
  click(buttonByText(container, "Añadir"));
  await flush();
  expect(mesaApi.saveTable).toHaveBeenCalledWith("new", expect.objectContaining({
    shape: "rectangle",
    shapePreset: "long",
    capacity: 8,
  }));
  unmount(container, root);
});

test("choosing a base shape (Redonda/Cuadrada/Rectangular) never touches capacity -- only the explicit 6/8 plazas preset does", async () => {
  const { container, root } = await mount();
  click(buttonByText(container, "🛠 Personalizar sala"));
  click(buttonByText(container, "＋ Añadir mesa"));
  const dialog = container.querySelector('[role="dialog"]');
  const capacityInput = dialog.querySelectorAll('input[type="number"]')[1];
  expect(capacityInput.value).toBe("4"); // fresh Añadir mesa's own starting default
  click(Array.from(dialog.querySelectorAll(".mesa-shape-btn")).find((button) => button.textContent === "Rectangular"));
  // Merely switching the base shape to Rectangular must NOT overwrite capacity.
  expect(capacityInput.value).toBe("4");
  click(Array.from(dialog.querySelectorAll(".mesa-btn.small")).find((button) => button.textContent === "6 plazas"));
  expect(capacityInput.value).toBe("6");
  typeInto(capacityInput, 10);
  expect(capacityInput.value).toBe("10");
  // Switching shape away and back to Rectangular must not clobber the manually typed 10.
  click(Array.from(dialog.querySelectorAll(".mesa-shape-btn")).find((button) => button.textContent === "Cuadrada"));
  click(Array.from(dialog.querySelectorAll(".mesa-shape-btn")).find((button) => button.textContent === "Rectangular"));
  expect(capacityInput.value).toBe("10");
  unmount(container, root);
});

test("Ajustes de mesa preselects the table's current shape and persists a change to it", async () => {
  mesaApi.floor.mockResolvedValue({
    ok: true,
    tables: [{ ...floorTables[0], shape: "square", shapePreset: "standard" }],
  });
  const { container, root } = await mount();
  click(buttonByText(container, "🛠 Personalizar sala"));
  click(container.querySelector(".mesa-table"));
  const modal = container.querySelector(".mesa-modal");
  expect(modal.querySelector(".mesa-shape-btn.active").textContent).toBe("Cuadrada");
  click(Array.from(modal.querySelectorAll(".mesa-shape-btn")).find((button) => button.textContent === "Rectangular"));
  click(Array.from(modal.querySelectorAll(".mesa-btn.small")).find((button) => button.textContent === "8 plazas"));
  click(container.querySelector('[data-testid="table-editor-save"]'));
  await flush();
  expect(mesaApi.saveTable).toHaveBeenCalledWith("table-1", expect.objectContaining({
    shape: "rectangle",
    shapePreset: "long",
    capacity: 8,
  }));
  unmount(container, root);
});

test("reopening a rectangular table saved with a manual, off-preset capacity (10) shows 10, not 6 or 8", async () => {
  mesaApi.floor.mockResolvedValue({
    ok: true,
    tables: [{ ...floorTables[0], shape: "rectangle", shapePreset: "long", capacity: 10 }],
  });
  const { container, root } = await mount();
  click(buttonByText(container, "🛠 Personalizar sala"));
  click(container.querySelector(".mesa-table"));
  const modal = container.querySelector(".mesa-modal");
  expect(modal.querySelector(".mesa-shape-btn.active").textContent).toBe("Rectangular");
  const capacityInput = modal.querySelector('[data-testid="capacity-custom-input"]');
  expect(capacityInput.value).toBe("10");
  // Re-picking the SAME shape/preset the table already has (a no-op edit,
  // e.g. the operator just glancing at the form) must not reset capacity.
  click(Array.from(modal.querySelectorAll(".mesa-shape-btn")).find((button) => button.textContent === "Rectangular"));
  expect(capacityInput.value).toBe("10");
  click(container.querySelector('[data-testid="table-editor-save"]'));
  await flush();
  expect(mesaApi.saveTable).toHaveBeenCalledWith("table-1", expect.objectContaining({
    shape: "rectangle",
    capacity: 10,
  }));
  unmount(container, root);
});

test("a Reservas row is compact, entirely clickable, and opens Modificar / mover for that reservation", async () => {
  const reservedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  mesaApi.floor.mockResolvedValue({
    ok: true,
    tables: floorTables.map((table, index) => index === 0
      ? { ...table, reservations: [{ id: "r1", tableId: table.id, status: "booked", guestName: "Beatriz Soler", guestPhone: "611222333", coversTotal: 2, reservedAt, durationMinutes: 120, note: "", version: 1 }] }
      : { ...table, reservations: [] }),
  });
  const { container, root } = await mount("waiter");
  click(buttonByText(container, "📅 Reservas · Beta"));
  const dialog = container.querySelector('[role="dialog"]');
  const row = dialog.querySelector(".mesa-row");
  expect(row.textContent).toContain("Beatriz Soler");
  expect(row.textContent).toContain("Mesa 1");
  expect(row.textContent).toContain("2 personas");
  expect(row.textContent).toContain("Confirmada");
  // No NESTED action buttons in the row -- it is itself the one tap target.
  expect(row.querySelector("button")).toBeFalsy();
  click(row);
  expect(container.querySelector('[role="dialog"]').textContent).toContain("Modificar / mover reserva");
  unmount(container, root);
});

// MESA_PHONE_VISUAL_PARITY_V2 -- conflict is a real, derived fact (a booked
// reservation on a table someone else is already occupying), read from the
// exact same table.status the floor tiles' own fill color uses -- this test
// guards that the agenda can never show "Confirmada" for that case, or fail
// to show it for an ordinary (non-conflicting) booking.
test("Reservas shows a real Conflicto/Ocupada chip when a booked table is already occupied by someone else, Confirmada otherwise", async () => {
  const reservedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  mesaApi.floor.mockResolvedValue({
    ok: true,
    tables: floorTables.map((table, index) => index === 0
      ? { ...table, status: "open", session: emptySession(), reservations: [{ id: "r-conflict", tableId: table.id, status: "booked", guestName: "Conflict Guest", coversTotal: 2, reservedAt, durationMinutes: 120, note: "", version: 1 }] }
      : index === 1
        ? { ...table, reservations: [{ id: "r-ok", tableId: table.id, status: "booked", guestName: "Fine Guest", coversTotal: 2, reservedAt, durationMinutes: 120, note: "", version: 1 }] }
        : table),
  });
  const { container, root } = await mount("waiter");
  click(buttonByText(container, "📅 Reservas · Beta"));
  const dialog = container.querySelector('[role="dialog"]');
  const rows = Array.from(dialog.querySelectorAll(".mesa-row"));
  const conflictRow = rows.find((row) => row.textContent.includes("Conflict Guest"));
  const fineRow = rows.find((row) => row.textContent.includes("Fine Guest"));
  expect(conflictRow.textContent).toContain("Conflicto");
  expect(conflictRow.className).toContain("conflict");
  expect(fineRow.textContent).toContain("Confirmada");
  expect(fineRow.className).not.toContain("conflict");
  unmount(container, root);
});

test("Reservas · Beta's Nueva reserva button is not styled destructive-red", async () => {
  const { container, root } = await mount();
  click(buttonByText(container, "📅 Reservas · Beta"));
  const nueva = buttonByText(container, "＋ Nueva reserva");
  expect(nueva.className).not.toContain("red");
  expect(nueva.className).toContain("gold");
  unmount(container, root);
});

test("a table with two reservations tonight shows only the soonest in the popup's own Reserva section, and 'Ver reservas de la noche (2)' opens both", async () => {
  const soon = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const later = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  const tables = floorTables.map((table, index) => index === 0
    ? { ...table, reservations: [
        { id: "r-later", tableId: table.id, status: "booked", guestName: "Later Guest", coversTotal: 2, reservedAt: later, durationMinutes: 60, note: "", version: 1 },
        { id: "r-soon", tableId: table.id, status: "booked", guestName: "Soon Guest", coversTotal: 4, reservedAt: soon, durationMinutes: 60, note: "", version: 1 },
      ] }
    : { ...table, reservations: [] });
  mesaApi.floor.mockResolvedValue({ ok: true, tables });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".mesa-table"));
  const dialog = container.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain("＋ Crear pedido");
  click(buttonByText(dialog, "Reserva"));
  // the soonest reservation is the one shown inline -- not the later one
  expect(dialog.textContent).toContain("Soon Guest");
  expect(dialog.textContent).not.toContain("Later Guest");
  const viewNightBtn = buttonByText(dialog, "Ver reservas de la noche (2)");
  expect(viewNightBtn).toBeDefined();
  click(viewNightBtn);
  const agenda = container.querySelector('[role="dialog"]');
  expect(agenda.textContent).toContain("Soon Guest");
  expect(agenda.textContent).toContain("Later Guest");
  unmount(container, root);
});

test("Reservas · Beta filters by name/phone and by a specific table", async () => {
  const reservedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const tables = floorTables.map((table, index) => index === 0
    ? { ...table, reservations: [{ id: "r1", tableId: table.id, status: "booked", guestName: "Beatriz Soler", guestPhone: "611222333", coversTotal: 2, reservedAt, durationMinutes: 120, note: "", version: 1 }] }
    : index === 1
      ? { ...table, reservations: [{ id: "r2", tableId: table.id, status: "booked", guestName: "Carlos Mena", guestPhone: "699888777", coversTotal: 3, reservedAt, durationMinutes: 120, note: "", version: 1 }] }
      : { ...table, reservations: [] });
  mesaApi.floor.mockResolvedValue({ ok: true, tables });
  const { container, root } = await mount("waiter");
  click(buttonByText(container, "📅 Reservas · Beta"));
  const dialog = container.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain("Beatriz Soler");
  expect(dialog.textContent).toContain("Carlos Mena");
  const search = dialog.querySelector('input.mesa-input:not([type])') || dialog.querySelectorAll(".mesa-modal input")[0];
  typeInto(search, "Beatriz");
  expect(container.querySelector('[role="dialog"]').textContent).toContain("Beatriz Soler");
  expect(container.querySelector('[role="dialog"]').textContent).not.toContain("Carlos Mena");
  unmount(container, root);
});

describe("MesaWorkspace pre-comanda panel (Confirmar comanda -> Enviar a cocina)", () => {
  const sampleDraft = {
    items: [{
      id: 1, n: "El Pelusa", q: 2, cat: "Pizzas", p: 12.5,
      classicName: "Margherita Classica", fantasyName: "El Pelusa", baseUnitPrice: 12.0,
      extras: [{ key: "ing_jamon", name: "Jamón cocido", price: 0.5, emoji: "🍖", quantity: 1 }],
      notes: "poco hecha", removedIngredients: ["Albahaca"],
    }],
    nota: "mesa junto a la ventana", coversTotal: 4, client_req_id: "draft-req-1",
  };

  test("a pending draft renders collapsed as a compact summary by default, with Modificar/Enviar a cocina, and hides Nueva comanda + Cerrar mesa", async () => {
    const openTables = floorTables.map((table, index) => index === 0
      ? { ...table, status: "open", session: emptySession() } : table);
    mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
    const { container, root } = await mount("waiter", { mesaDrafts: { "session-x": sampleDraft } });
    click(container.querySelector(".mesa-table"));
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog.textContent).toContain("Comanda por confirmar");
    expect(dialog.textContent).toContain("2 artículos");
    // Collapsed: full item detail is NOT in the DOM yet, only the summary line.
    expect(dialog.textContent).not.toContain("Margherita Classica");
    expect(dialog.textContent).toContain("Modificar");
    expect(dialog.textContent).toContain("Enviar a cocina");
    // No second order-creator and no premature close while a draft is pending.
    expect(dialog.textContent).not.toContain("＋ Nueva comanda");
    expect(dialog.textContent).not.toContain("Cerrar mesa");
    unmount(container, root);
  });

  test("tapping the draft summary expands it inline, showing full item detail; tapping again collapses it", async () => {
    const openTables = floorTables.map((table, index) => index === 0
      ? { ...table, status: "open", session: emptySession() } : table);
    mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
    const { container, root } = await mount("waiter", { mesaDrafts: { "session-x": sampleDraft } });
    click(container.querySelector(".mesa-table"));
    const dialog = container.querySelector('[role="dialog"]');
    click(byTestId(container, "mesa-draft-toggle"));
    expect(dialog.textContent).toContain("El Pelusa");
    expect(dialog.textContent).toContain("Margherita Classica");
    expect(dialog.textContent).toContain("Jamón cocido");
    expect(dialog.textContent).toContain("Albahaca");
    expect(dialog.textContent).toContain("poco hecha");
    expect(dialog.textContent).toContain("mesa junto a la ventana");
    click(byTestId(container, "mesa-draft-toggle"));
    expect(dialog.textContent).not.toContain("Margherita Classica");
    unmount(container, root);
  });

  test("Modificar calls onNewCommand for the same table -- MesaOrderBuilder reseeds itself from the draft, TabMesa doesn't own that", async () => {
    const openTables = floorTables.map((table, index) => index === 0
      ? { ...table, status: "open", session: emptySession() } : table);
    mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
    const onNewCommand = jest.fn();
    const { container, root } = await mount("waiter", { mesaDrafts: { "session-x": sampleDraft }, onNewCommand });
    click(container.querySelector(".mesa-table"));
    click(buttonByText(container, "Modificar"));
    expect(onNewCommand).toHaveBeenCalledWith(expect.objectContaining({ id: "table-1" }));
    unmount(container, root);
  });

  test("Enviar a cocina calls onSendToCocina once with (sessionId, tableNumber, draft), then clears the draft and reloads", async () => {
    const openTables = floorTables.map((table, index) => index === 0
      ? { ...table, status: "open", session: emptySession() } : table);
    mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: openTables });
    mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: floorTables.map((t, i) => i === 0 ? { ...t, status: "open", session: emptySession({ coversTotal: 4, coversRemaining: 4, commands: [{ id: "o1", commandNumber: 1, state: "EN_COCINA", items: [{ n: "El Pelusa" }], time: "21:00" }] }) } : t) });
    const onSendToCocina = jest.fn().mockResolvedValue({ ok: true });
    const onClearDraft = jest.fn();
    const { container, root } = await mount("waiter", { mesaDrafts: { "session-x": sampleDraft }, onSendToCocina, onClearDraft });
    click(container.querySelector(".mesa-table"));
    click(buttonByText(container, "Enviar a cocina"));
    await flush();
    expect(onSendToCocina).toHaveBeenCalledTimes(1);
    expect(onSendToCocina).toHaveBeenCalledWith("session-x", 1, sampleDraft);
    expect(onClearDraft).toHaveBeenCalledWith("session-x");
    unmount(container, root);
  });

  test("a rapid double tap on Enviar a cocina never sends a second request -- button disables synchronously", async () => {
    const openTables = floorTables.map((table, index) => index === 0
      ? { ...table, status: "open", session: emptySession() } : table);
    mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
    let resolveSend;
    const onSendToCocina = jest.fn(() => new Promise((resolve) => { resolveSend = resolve; }));
    const { container, root } = await mount("waiter", { mesaDrafts: { "session-x": sampleDraft }, onSendToCocina });
    click(container.querySelector(".mesa-table"));
    const btn = buttonByText(container, "Enviar a cocina");
    click(btn);
    click(btn);
    click(btn);
    await flush();
    expect(onSendToCocina).toHaveBeenCalledTimes(1);
    expect(btn.disabled).toBe(true);
    act(() => { resolveSend({ ok: true }); });
    await flush();
    unmount(container, root);
  });

  test("a failed Enviar a cocina shows an inline error and keeps the whole draft intact for retry", async () => {
    const openTables = floorTables.map((table, index) => index === 0
      ? { ...table, status: "open", session: emptySession() } : table);
    mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
    const onSendToCocina = jest.fn().mockRejectedValueOnce({ code: "MESA_SERVER_ERROR" });
    const onClearDraft = jest.fn();
    const { container, root } = await mount("waiter", { mesaDrafts: { "session-x": sampleDraft }, onSendToCocina, onClearDraft });
    click(container.querySelector(".mesa-table"));
    click(buttonByText(container, "Enviar a cocina"));
    await flush();
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog.textContent).toContain("MESA_SERVER_ERROR");
    expect(dialog.textContent).toContain("Comanda por confirmar");
    click(byTestId(container, "mesa-draft-toggle"));
    expect(dialog.textContent).toContain("El Pelusa");
    expect(onClearDraft).not.toHaveBeenCalled();
    const retryBtn = buttonByText(container, "Enviar a cocina");
    expect(retryBtn.disabled).toBe(false);
    unmount(container, root);
  });

  test("without a pending draft, the workspace looks exactly as before: Nueva comanda shown, no 'Comanda por confirmar' section", async () => {
    const openTables = floorTables.map((table, index) => index === 0
      ? { ...table, status: "open", session: emptySession() } : table);
    mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
    const { container, root } = await mount("waiter", { mesaDrafts: {} });
    click(container.querySelector(".mesa-table"));
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog.textContent).not.toContain("Comanda por confirmar");
    expect(dialog.textContent).toContain("＋ Nueva comanda");
    unmount(container, root);
  });

  // CANONICAL_ORDER_LINE_SLICE_1 -- HARD ACCEPTANCE DEFECT A. Before this
  // slice, a custom pizza's selected ingredients were visible inside
  // MesaOrderBuilder's own "Ver comanda" drawer but vanished here (this
  // panel read item.extras/.classicName/.fantasyName, none of which exist
  // on PizzaCustomBuilder's raw item shape) -- same draft, two renderers,
  // two truths. Real production shape: id "custom_<timestamp>", n "Pizza a
  // tu gusto", _ingredienti[] holding the selected ingredient records.
  const customDraft = {
    items: [{
      id: "custom_1723622400000", n: "Pizza a tu gusto",
      sub: "Base Pelusa + Tomates confitados, Rúcula",
      e: "⭐", p: 14, q: 1, cat: "Pizzas",
      _ingredienti: [
        { id: "i_tom", n: "Tomates confitados", e: "🍅", prezzo: 1 },
        { id: "i_ruc", n: "Rúcula", e: "🌿", prezzo: 1 },
      ],
      ing: "Base Pelusa + Tomates confitados, Rúcula",
    }],
    nota: "", coversTotal: 2, client_req_id: "draft-req-custom",
  };

  test("a custom pizza's selected ingredients remain visible in the draft panel, not collapsed to just its generic name", async () => {
    const openTables = floorTables.map((table, index) => index === 0
      ? { ...table, status: "open", session: emptySession() } : table);
    mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
    const { container, root } = await mount("waiter", { mesaDrafts: { "session-x": customDraft } });
    click(container.querySelector(".mesa-table"));
    click(byTestId(container, "mesa-draft-toggle"));
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog.textContent).toContain("Pizza a tu gusto");
    expect(dialog.textContent).toContain("Tomates confitados");
    expect(dialog.textContent).toContain("Rúcula");
    unmount(container, root);
  });
});

describe("hideToolbar -- Mesa map visual cleanup", () => {
  test("by default (hideToolbar unset) the Sala principal selector and Libre/Reservada/Ocupada legend still render", async () => {
    const { container, root } = await mount("waiter");
    expect(container.textContent).toContain("Sala principal");
    expect(container.textContent).toContain("Libre");
    expect(container.textContent).toContain("Reservada");
    expect(container.textContent).toContain("Ocupada");
    unmount(container, root);
  });

  test("hideToolbar hides the Sala selector and legend without touching the map/board itself", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<TabMesa role="waiter" notify={jest.fn()} onNewCommand={jest.fn()} onCountChange={jest.fn()} hideToolbar />);
    });
    await flush();
    expect(container.textContent).not.toContain("Sala principal");
    expect(container.querySelector(".mesa-legend")).toBeFalsy();
    // the map itself, with all its tables, is unaffected
    expect(container.querySelectorAll(".mesa-table").length).toBe(floorTables.length);
    unmount(container, root);
  });

  test("hideToolbar does not add the compact class -- it only hides the toolbar, unlike WaiterShell's `compact` (different height/flex CSS, different embedding)", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<TabMesa role="waiter" notify={jest.fn()} onNewCommand={jest.fn()} onCountChange={jest.fn()} hideToolbar />);
    });
    await flush();
    expect(container.querySelector(".mesa-root.compact")).toBeFalsy();
    expect(container.querySelector(".mesa-root")).toBeTruthy();
    unmount(container, root);
  });
});

describe("MesaWorkspace header format -- 'Mesa 6 (4 pax)', never a dot-separated second line", () => {
  test("with known covers, the header reads exactly 'Mesa 1 (4 pax)'", async () => {
    const openTables = floorTables.map((table, index) => index === 0
      ? { ...table, status: "open", session: emptySession({ coversTotal: 4, coversRemaining: 4 }) } : table);
    mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
    const { container, root } = await mount("waiter");
    click(container.querySelector(".mesa-table"));
    const dialog = container.querySelector('[role="dialog"]');
    const titleEl = dialog.querySelector(".mesa-modal-head > div > div");
    expect(titleEl.textContent).toBe("Mesa 1 (4 pax)");
    expect(dialog.textContent).not.toContain("cubiertos");
    expect(dialog.textContent).not.toContain("Mesa 1 · ");
    unmount(container, root);
  });

  test("with covers still unknown, the header is just 'Mesa 1' -- never '0 pax'", async () => {
    const openTables = floorTables.map((table, index) => index === 0
      ? { ...table, status: "open", session: emptySession() } : table);
    mesaApi.floor.mockResolvedValue({ ok: true, tables: openTables });
    const { container, root } = await mount("waiter");
    click(container.querySelector(".mesa-table"));
    const dialog = container.querySelector('[role="dialog"]');
    const titleEl = dialog.querySelector(".mesa-modal-head > div > div");
    expect(titleEl.textContent).toBe("Mesa 1");
    expect(dialog.textContent).not.toContain("pax");
    unmount(container, root);
  });
});
