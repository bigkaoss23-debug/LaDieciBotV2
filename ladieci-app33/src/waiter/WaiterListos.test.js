import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../mesa/mesaApi", () => ({
  __esModule: true,
  describeMesaError: jest.fn((error) => error?.code || "error"),
  mesaApi: {
    floor: jest.fn(),
    markServed: jest.fn(),
  },
}));

jest.mock("../sounds", () => ({ __esModule: true, default: { mesaListo: jest.fn() } }));

const WaiterListos = require("./WaiterListos").default;
const { mesaApi } = require("../mesa/mesaApi");
const Suoni = require("../sounds").default;

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const tableWith = (commandState) => ({
  id: "t1", number: 1, active: true, status: "open",
  session: {
    id: "session-1",
    commands: commandState ? [{ id: "o1", commandNumber: 1, state: commandState, time: "21:00", items: [{ n: "Margherita" }], note: "" }] : [],
  },
});

beforeEach(() => {
  jest.clearAllMocks();
});

test("does not chime on first load, even if a comanda is already ready when the tab opens", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith("LISTO")] });
  const onCountChange = jest.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<WaiterListos notify={jest.fn()} onCountChange={onCountChange} />); });
  await flush();
  expect(Suoni.mesaListo).not.toHaveBeenCalled();
  expect(onCountChange).toHaveBeenLastCalledWith(1);
  expect(container.textContent).toContain("Mesa 1");
  expect(container.textContent).toContain("Margherita");
  act(() => { root.unmount(); });
  container.remove();
});

test("chimes exactly once when a comanda transitions to LISTO between polls, not again on later polls of the same state", async () => {
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: [tableWith("EN_COCINA")] });
  const onCountChange = jest.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let refreshKey = 0;
  await act(async () => { root.render(<WaiterListos notify={jest.fn()} onCountChange={onCountChange} refreshKey={refreshKey} />); });
  await flush();
  expect(Suoni.mesaListo).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Ninguna comanda de mesa lista todavía");

  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: [tableWith("LISTO")] });
  refreshKey = 1;
  await act(async () => { root.render(<WaiterListos notify={jest.fn()} onCountChange={onCountChange} refreshKey={refreshKey} />); });
  await flush();
  expect(Suoni.mesaListo).toHaveBeenCalledTimes(1);
  expect(onCountChange).toHaveBeenLastCalledWith(1);

  // Same LISTO command polled again -- no new chime.
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: [tableWith("LISTO")] });
  refreshKey = 2;
  await act(async () => { root.render(<WaiterListos notify={jest.fn()} onCountChange={onCountChange} refreshKey={refreshKey} />); });
  await flush();
  expect(Suoni.mesaListo).toHaveBeenCalledTimes(1);

  act(() => { root.unmount(); });
  container.remove();
});

test("unmount clears the polling interval -- no request after the component is gone", async () => {
  jest.useFakeTimers();
  try {
    mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith(null)] });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<WaiterListos notify={jest.fn()} onCountChange={jest.fn()} />); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const callsBeforeUnmount = mesaApi.floor.mock.calls.length;
    act(() => { root.unmount(); });
    container.remove();
    await act(async () => { jest.advanceTimersByTime(30000); });
    expect(mesaApi.floor.mock.calls.length).toBe(callsBeforeUnmount);
  } finally {
    jest.useRealTimers();
  }
});

test("card shows both authoritative product names, quantity and item note (LISTOS_UNIFICADO_V1)", async () => {
  const table = {
    id: "t1", number: 6, active: true, status: "open",
    session: {
      id: "session-1",
      commands: [{
        id: "o1", commandNumber: 1, state: "LISTO", time: "21:00", note: "",
        items: [{ n: "El Pelusa", classicName: "Margherita Classica", q: 2, notes: "bien caliente" }],
      }],
    },
  };
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [table] });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<WaiterListos notify={jest.fn()} onCountChange={jest.fn()} />); });
  await flush();
  expect(container.textContent).toContain("Margherita Classica");
  expect(container.textContent).toContain("El Pelusa");
  expect(container.textContent).toContain("2×");
  expect(container.textContent).toContain("bien caliente");
  act(() => { root.unmount(); });
  container.remove();
});

test("Servida calls mesaApi.markServed with the session and command id", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith("LISTO")] });
  mesaApi.markServed.mockResolvedValue({ ok: true });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<WaiterListos notify={jest.fn()} onCountChange={jest.fn()} />); });
  await flush();
  const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Servida"));
  click(button);
  await flush();
  expect(mesaApi.markServed).toHaveBeenCalledWith("session-1", "o1");
  act(() => { root.unmount(); });
  container.remove();
});
