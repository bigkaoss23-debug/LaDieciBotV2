import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../messa/messaApi", () => ({
  __esModule: true,
  createMessaRequestId: jest.fn(() => "mesa_test_request"),
  describeMessaError: jest.fn((error) => error?.code || "error"),
  messaApi: {
    floor: jest.fn(),
    openTable: jest.fn(),
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

const TabMessa = require("./TabMessa").default;
const { messaApi } = require("../../messa/messaApi");

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

async function mount(role = "owner") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TabMessa role={role} notify={jest.fn()} onNewCommand={jest.fn()} onCountChange={jest.fn()} />);
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

beforeEach(() => {
  jest.clearAllMocks();
  messaApi.floor.mockResolvedValue({ ok: true, tables: floorTables });
  messaApi.saveTable.mockResolvedValue({ ok: true });
  messaApi.createReservation.mockResolvedValue({ ok: true });
  messaApi.updateReservation.mockResolvedValue({ ok: true });
  messaApi.setReservationStatus.mockResolvedValue({ ok: true });
  messaApi.openReservation.mockResolvedValue({ ok: true });
});

test("operational floor shows five clean table cards without capacity copy", async () => {
  const { container, root } = await mount();
  expect(container.querySelectorAll(".messa-table")).toHaveLength(5);
  expect(container.textContent).toContain("Mesa 1");
  expect(container.textContent).toContain("Mesa 5");
  expect(container.textContent).not.toMatch(/máx\.|hasta 4 cubiertos/i);
  unmount(container, root);
});

test("room settings edits and persists a table maximum capacity", async () => {
  const { container, root } = await mount();
  click(buttonByText(container, "⚙ Ajustes de sala"));
  click(container.querySelector(".messa-table"));
  expect(container.querySelector('[role="dialog"]').textContent).toContain("Nueva reserva");
  click(buttonByText(container, "Ajustes de mesa"));
  expect(container.querySelector('[role="dialog"]').textContent).toContain("Ajustes de sala");
  const fields = container.querySelectorAll('.messa-modal input[type="number"]');
  expect(fields).toHaveLength(2);
  expect(fields[1].value).toBe("4");
  typeInto(fields[1], 6);
  click(buttonByText(container, "Guardar ajustes"));
  await flush();
  expect(messaApi.saveTable).toHaveBeenCalledWith("table-1", expect.objectContaining({
    tableNumber: 1,
    displayName: "Mesa 1",
    capacity: 6,
    active: true,
  }));
  unmount(container, root);
});

test("today reservation turns the table red and shows time, customer and covers", async () => {
  const reservedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  messaApi.floor.mockResolvedValue({
    ok: true,
    tables: floorTables.map((table, index) => index === 4 ? {
      ...table,
      reservations: [{ id: "reservation-1", tableId: table.id, status: "booked", guestName: "Antonio", guestPhone: "600123123", coversTotal: 4, reservedAt, durationMinutes: 120, note: "Ventana", version: 1 }],
    } : { ...table, reservations: [] }),
  });
  const { container, root } = await mount("waiter");
  const cards = container.querySelectorAll(".messa-table");
  expect(cards[4].textContent).toContain("Reservada");
  expect(cards[4].textContent).toContain("Antonio · 4 personas");
  expect(cards[4].getAttribute("style")).toContain("#EF4444");
  click(cards[4]);
  expect(container.querySelector('[role="dialog"]').textContent).toContain("Antonio · 4 personas");
  expect(container.querySelector('[role="dialog"]').textContent).toContain("600123123");
  unmount(container, root);
});

test("waiter can move a reservation to another table from the table menu", async () => {
  const reservedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const tables = floorTables.map((table, index) => index === 0 ? {
    ...table,
    reservations: [{ id: "reservation-1", tableId: table.id, status: "booked", guestName: "Antonio", guestPhone: "600", coversTotal: 4, reservedAt, durationMinutes: 120, note: "", version: 2 }],
  } : { ...table, reservations: [] });
  messaApi.floor.mockResolvedValue({ ok: true, tables });
  const { container, root } = await mount("waiter");
  click(container.querySelector(".messa-table"));
  click(buttonByText(container, "Modificar"));
  const tableSelect = container.querySelector(".messa-modal select");
  act(() => {
    tableSelect.value = "table-2";
    tableSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });
  click(buttonByText(container, "Guardar cambios"));
  await flush();
  expect(messaApi.updateReservation).toHaveBeenCalledWith("reservation-1", expect.objectContaining({
    tableId: "table-2",
    guestName: "Antonio",
    coversTotal: 4,
    expectedVersion: 2,
  }));
  expect(container.textContent).not.toContain("Ajustes de mesa");
  unmount(container, root);
});

test("dragging in room settings persists the new percentage position", async () => {
  const { container, root } = await mount();
  click(buttonByText(container, "⚙ Ajustes de sala"));
  const board = container.querySelector(".messa-board");
  const table = container.querySelector(".messa-table");
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
  expect(messaApi.saveTable).toHaveBeenCalledWith("table-1", expect.objectContaining({
    positionX: 40,
    positionY: 50,
    active: true,
  }));
  unmount(container, root);
});
