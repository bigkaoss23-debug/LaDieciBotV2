import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../mesa/mesaApi", () => ({
  __esModule: true,
  describeMesaError: jest.fn((error) => error?.code || "error"),
  mesaApi: {
    floor: jest.fn(),
    markServed: jest.fn(),
    pay: jest.fn(),
    addCommand: jest.fn(),
  },
}));

jest.mock("../../sounds", () => ({ __esModule: true, default: { mesaListo: jest.fn(), conferma: jest.fn() } }));

const ListosUnificado = require("./ListosUnificado").default;
const { mesaApi } = require("../../mesa/mesaApi");
const Suoni = require("../../sounds").default;

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function setWidth(px) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: px });
}

const tableWith = (commandState) => ({
  id: "t1", number: 1, active: true, status: "open",
  session: {
    id: "session-1",
    commands: commandState ? [{ id: "o1", commandNumber: 1, state: commandState, time: "21:00", items: [{ n: "Margherita" }], note: "" }] : [],
  },
});

const pickupOrder = {
  id: "P1", estado: "LISTO", nombre: "Juan", tel: "600111222", canal: "WA",
  items: [{ n: "Margherita", e: "🍕", p: 10, q: 1 }], totale: 10, ya_pagado: false,
};

const baseProps = {
  ordenes: [pickupOrder],
  onRetirado: jest.fn(),
  onVolverACocina: jest.fn(),
  onOpenTicket: jest.fn(),
  loadingIds: new Set(),
  waMsgs: [],
  onViewChat: jest.fn(),
  onCambiaPago: jest.fn(),
  vipIds: new Set(),
  notify: jest.fn(),
  refreshKey: 0,
  onSalaCountChange: jest.fn(),
  listosN: 1,
};

async function renderPage(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<ListosUnificado {...baseProps} {...props} />); });
  await flush();
  return { container, root };
}

beforeEach(() => {
  jest.clearAllMocks();
  setWidth(1280);
});

test("zero comande Sala: no Sala column, Recogida/Domicilio list stays full width", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith(null)] });
  const { container, root } = await renderPage({});
  expect(container.textContent).not.toContain("Sala");
  expect(container.textContent).toContain("Juan"); // pickup order still renders
  expect(container.querySelector(".listos-sala-column")).toBeNull();
  act(() => { root.unmount(); });
  container.remove();
});

test("one comanda Mesa pronta: Sala column appears automatically, card shown once", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith("LISTO")] });
  const { container, root } = await renderPage({});
  expect(container.querySelector(".listos-sala-column")).not.toBeNull();
  const occurrences = container.textContent.split("Mesa 1 · #1").length - 1;
  expect(occurrences).toBe(1);
  expect(container.textContent).toContain("Juan"); // pickup list untouched, coexists
  act(() => { root.unmount(); });
  container.remove();
});

test("multiple Sala comandas on different tables all render, no duplication", async () => {
  const twoTables = [
    { id: "t1", number: 1, active: true, status: "open", session: { id: "s1", commands: [{ id: "o1", commandNumber: 1, state: "LISTO", items: [{ n: "A" }] }] } },
    { id: "t2", number: 2, active: true, status: "open", session: { id: "s2", commands: [{ id: "o2", commandNumber: 1, state: "LISTO", items: [{ n: "B" }] }] } },
  ];
  mesaApi.floor.mockResolvedValue({ ok: true, tables: twoTables });
  const { container, root } = await renderPage({});
  expect(container.textContent).toContain("Mesa 1");
  expect(container.textContent).toContain("Mesa 2");
  expect(container.querySelectorAll(".mesa-row").length).toBe(2);
  act(() => { root.unmount(); });
  container.remove();
});

test("last Sala comanda marked Servida: column disappears, list returns full width", async () => {
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: [tableWith("LISTO")] });
  mesaApi.markServed.mockResolvedValue({ ok: true });
  const { container, root } = await renderPage({});
  expect(container.querySelector(".listos-sala-column")).not.toBeNull();

  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: [tableWith(null)] });
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Servida"));
  click(btn);
  await flush();

  expect(mesaApi.markServed).toHaveBeenCalledWith("session-1", "o1");
  expect(container.querySelector(".listos-sala-column")).toBeNull();
  expect(container.textContent).not.toContain("Sala");
  act(() => { root.unmount(); });
  container.remove();
});

test("Servida calls only mesaApi.markServed -- no payment/financial endpoint touched", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith("LISTO")] });
  mesaApi.markServed.mockResolvedValue({ ok: true });
  const { container, root } = await renderPage({});
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Servida"));
  click(btn);
  await flush();
  expect(mesaApi.markServed).toHaveBeenCalledTimes(1);
  expect(mesaApi.pay).not.toHaveBeenCalled();
  expect(baseProps.onRetirado).not.toHaveBeenCalled();
  act(() => { root.unmount(); });
  container.remove();
});

test("badge callback reports the exact ready count, summed nowhere else in this component", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith("LISTO")] });
  const onSalaCountChange = jest.fn();
  const { root, container } = await renderPage({ onSalaCountChange });
  expect(onSalaCountChange).toHaveBeenLastCalledWith(1);
  act(() => { root.unmount(); });
  container.remove();
});

test("tablet/desktop width shows both columns side by side", async () => {
  setWidth(1280);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith("LISTO")] });
  const { container, root } = await renderPage({});
  expect(container.textContent).not.toContain("Recogida/Domicilio (");
  expect(container.querySelector(".listos-sala-column")).not.toBeNull();
  act(() => { root.unmount(); });
  container.remove();
});

test("phone width shows the compact selector, not two columns", async () => {
  setWidth(400);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith("LISTO")] });
  const { container, root } = await renderPage({});
  expect(container.textContent).toContain("Recogida/Domicilio (1)");
  expect(container.textContent).toContain("Sala (1)");
  // default view is pickup -- Sala cards not shown until the selector is tapped
  expect(container.textContent).not.toContain("Mesa 1 · #1");
  const salaBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.startsWith("Sala ("));
  click(salaBtn);
  await flush();
  expect(container.textContent).toContain("Mesa 1 · #1");
  expect(container.textContent).not.toContain("Juan");
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
    await act(async () => { root.render(<ListosUnificado {...baseProps} />); });
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

test("no double chime: only one useMesaReadyCommands instance is mounted by this page", async () => {
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: [tableWith(null)] });
  const { root, container } = await renderPage({});
  mesaApi.floor.mockResolvedValueOnce({ ok: true, tables: [tableWith("LISTO")] });
  await act(async () => { root.render(<ListosUnificado {...baseProps} refreshKey={1} />); });
  await flush();
  expect(Suoni.mesaListo).toHaveBeenCalledTimes(1);
  act(() => { root.unmount(); });
  container.remove();
});
