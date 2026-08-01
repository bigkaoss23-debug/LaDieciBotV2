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

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TabMessa role="owner" notify={jest.fn()} onNewCommand={jest.fn()} onCountChange={jest.fn()} />);
  });
  await flush();
  return { container, root };
}

function unmount(container, root) {
  act(() => { root.unmount(); });
  container.remove();
}

function buttonByText(container, text) {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent.trim() === text);
}

beforeEach(() => {
  jest.clearAllMocks();
  messaApi.floor.mockResolvedValue({ ok: true, tables: floorTables });
  messaApi.saveTable.mockResolvedValue({ ok: true });
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
