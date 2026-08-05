import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../mesa/mesaApi", () => ({
  __esModule: true,
  createMesaRequestId: jest.fn(() => "mesa_test_request"),
  describeMesaError: jest.fn((error) => error?.code || "error"),
  mesaApi: {
    floor: jest.fn().mockResolvedValue({ ok: true, tables: [] }),
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

jest.mock("../sounds", () => ({ __esModule: true, default: { mesaListo: jest.fn() } }));

const WaiterShell = require("./WaiterShell").default;

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

async function mount(role) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<WaiterShell role={role} notify={jest.fn()} />); });
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

test("the waiter shell's tab bar shows only Mesa and Listos -- no WhatsApp/Tel/Cocina/Entregas", async () => {
  const { container, root } = await mount("waiter");
  const tabLabels = Array.from(container.querySelectorAll("nav button")).map((b) => b.textContent);
  expect(tabLabels).toHaveLength(2);
  expect(tabLabels.some((t) => t.includes("Mesa"))).toBe(true);
  expect(tabLabels.some((t) => t.includes("Listos"))).toBe(true);
  expect(container.textContent).not.toContain("WhatsApp");
  expect(container.textContent).not.toContain("Cocina");
  expect(container.textContent).not.toContain("Entregas");
  unmount(container, root);
});

test("Mesa is the default tab on open -- the floor is visible without any extra navigation", async () => {
  const { container, root } = await mount("waiter");
  expect(container.querySelector(".mesa-board")).not.toBeNull();
  unmount(container, root);
});

test("role=waiter never sees Personalizar sala in the shell's Mesa tab", async () => {
  const { container, root } = await mount("waiter");
  expect(container.textContent).not.toContain("Personalizar sala");
  unmount(container, root);
});

test("role=admin sees Personalizar sala in the shell's Mesa tab", async () => {
  const { container, root } = await mount("admin");
  expect(container.textContent).toContain("Personalizar sala");
  unmount(container, root);
});

test("switching to the Listos tab swaps the floor out for the ready-comandas list", async () => {
  const { container, root } = await mount("waiter");
  expect(container.querySelector(".mesa-board")).not.toBeNull();
  click(buttonByText(container, "✅") || Array.from(container.querySelectorAll("nav button")).find((b) => b.textContent.includes("Listos")));
  await flush();
  expect(container.querySelector(".mesa-board")).toBeNull();
  expect(container.textContent).toContain("Ninguna comanda de mesa lista todavía");
  unmount(container, root);
});
