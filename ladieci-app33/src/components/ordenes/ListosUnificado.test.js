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

function filterButton(container, label) {
  return Array.from(container.querySelectorAll("button")).find((b) => b.textContent.startsWith(`${label} (`));
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

const retiradoOrder = {
  id: "R1", estado: "RETIRADO", nombre: "Carla", tel: "600333444", canal: "WA",
  // language-guard: allow-legacy existing backend field/enum (tipo_consegna/RITIRO), not new vocabulary
  tipo_consegna: "RITIRO",
  items: [{ n: "Diavola", e: "🍕", p: 12, q: 1 }], totale: 12, ya_pagado: true, metodo_pago: "efectivo",
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

// ── 1-2. single Listos experience, three filters always present ──────────
test("exactly one Listos surface with the three Todo/Sala/Takeaway filters, always visible with live counts", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith("LISTO")] });
  const { container, root } = await renderPage({});
  expect(filterButton(container, "Todo").textContent).toBe("Todo (2)");
  expect(filterButton(container, "Sala").textContent).toBe("Sala (1)");
  expect(filterButton(container, "Takeaway").textContent).toBe("Takeaway (1)");
  act(() => { root.unmount(); });
  container.remove();
});

test("filters stay visible with count 0 even when a queue is empty (no conditional hiding)", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith(null)] });
  const { container, root } = await renderPage({ ordenes: [], listosN: 0 });
  expect(filterButton(container, "Todo").textContent).toBe("Todo (0)");
  expect(filterButton(container, "Sala").textContent).toBe("Sala (0)");
  expect(filterButton(container, "Takeaway").textContent).toBe("Takeaway (0)");
  act(() => { root.unmount(); });
  container.remove();
});

// ── 3. Todo shows both sources, no duplication ────────────────────────────
test("Todo (default filter) shows both Sala and Takeaway together, each item once", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith("LISTO")] });
  const { container, root } = await renderPage({});
  expect(container.textContent).toContain("Juan");
  const occurrences = container.textContent.split("Mesa 1 · #1").length - 1;
  expect(occurrences).toBe(1);
  act(() => { root.unmount(); });
  container.remove();
});

// ── 4. Sala excludes Takeaway ──────────────────────────────────────────────
test("Sala filter shows only the Mesa queue, Takeaway pickup orders excluded", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith("LISTO")] });
  const { container, root } = await renderPage({});
  click(filterButton(container, "Sala"));
  await flush();
  expect(container.textContent).toContain("Mesa 1 · #1");
  expect(container.textContent).not.toContain("Juan");
  act(() => { root.unmount(); });
  container.remove();
});

// ── 5. Takeaway excludes Mesa ──────────────────────────────────────────────
test("Takeaway filter shows only Recogida/Domicilio orders, Mesa excluded", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith("LISTO")] });
  const { container, root } = await renderPage({});
  click(filterButton(container, "Takeaway"));
  await flush();
  expect(container.textContent).toContain("Juan");
  expect(container.textContent).not.toContain("Mesa 1 · #1");
  act(() => { root.unmount(); });
  container.remove();
});

// ── 6. Servida contract unchanged ──────────────────────────────────────────
test("Servida calls only mesaApi.markServed -- no payment/financial endpoint, table stays open", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith("LISTO")] });
  mesaApi.markServed.mockResolvedValue({ ok: true });
  const { container, root } = await renderPage({});
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Servida"));
  click(btn);
  await flush();
  expect(mesaApi.markServed).toHaveBeenCalledWith("session-1", "o1");
  expect(mesaApi.pay).not.toHaveBeenCalled();
  expect(baseProps.onRetirado).not.toHaveBeenCalled();
  act(() => { root.unmount(); });
  container.remove();
});

// ── 7. Badge sums active only ──────────────────────────────────────────────
test("badge callback reports only the active Sala count, archivados never included", async () => {
  mesaApi.floor.mockResolvedValue({
    ok: true,
    tables: [{
      id: "t1", number: 1, active: true, status: "open",
      session: {
        id: "session-1",
        commands: [
          { id: "o1", commandNumber: 1, state: "LISTO", items: [{ n: "A" }] },
          { id: "o2", commandNumber: 2, state: "RETIRADO", items: [{ n: "B" }] },
        ],
      },
    }],
  });
  const onSalaCountChange = jest.fn();
  const { root, container } = await renderPage({ onSalaCountChange });
  expect(onSalaCountChange).toHaveBeenLastCalledWith(1);
  expect(filterButton(container, "Sala").textContent).toBe("Sala (1)");
  act(() => { root.unmount(); });
  container.remove();
});

// ── Archivados: closed by default, distinguishes type, excluded from badge ─
test("Archivados row: closed by default, count sums served Sala + Retirado Takeaway, opens to distinguish types", async () => {
  mesaApi.floor.mockResolvedValue({
    ok: true,
    tables: [{
      id: "t1", number: 6, active: true, status: "open",
      session: { id: "session-1", commands: [{ id: "o1", commandNumber: 1, state: "RETIRADO", items: [{ n: "El Pelusa" }] }] },
    }],
  });
  const { container, root } = await renderPage({ ordenes: [pickupOrder, retiradoOrder], listosN: 1 });
  const archBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.startsWith("Archivados"));
  expect(archBtn.textContent).toContain("2");
  expect(container.textContent).not.toContain("Carla");
  click(archBtn);
  await flush();
  expect(container.textContent).toContain("Sala (1)");
  expect(container.textContent).toContain("Recogida (1)");
  expect(container.textContent).toContain("Carla");
  // Archived items never move the live badge or filter counts.
  expect(filterButton(container, "Sala").textContent).toBe("Sala (0)");
  expect(filterButton(container, "Takeaway").textContent).toBe("Takeaway (1)");
  act(() => { root.unmount(); });
  container.remove();
});

// ── viewport behavior ──────────────────────────────────────────────────────
test("tablet/desktop width: Todo shows both columns side by side", async () => {
  setWidth(1280);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith("LISTO")] });
  const { container, root } = await renderPage({});
  expect(container.querySelector(".listos-sala-column")).not.toBeNull();
  expect(container.textContent).toContain("Juan");
  expect(container.textContent).toContain("Mesa 1 · #1");
  act(() => { root.unmount(); });
  container.remove();
});

test("phone width: Todo stacks vertically, never a squeezed two-column layout", async () => {
  setWidth(400);
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith("LISTO")] });
  const { container, root } = await renderPage({});
  // Both sections are present (stacked), same as desktop, just not side by side --
  // there is no separate "compact selector" text/state left over from the old binary toggle.
  expect(container.textContent).toContain("Juan");
  expect(container.textContent).toContain("Mesa 1 · #1");
  expect(container.textContent).not.toContain("Recogida/Domicilio (");
  act(() => { root.unmount(); });
  container.remove();
});

// ── no double polling / sound / count ──────────────────────────────────────
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

// ── Recogida/Delivery still work through the unified shell ────────────────
test("Recogida pickup order still reaches Retirado via Takeaway filter", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith(null)] });
  const onRetirado = jest.fn();
  const { container, root } = await renderPage({ onRetirado, ordenes: [{ ...pickupOrder, ya_pagado: true, metodo_pago: "efectivo" }] });
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Retirado"));
  click(btn);
  await flush();
  expect(onRetirado).toHaveBeenCalledWith("P1", "efectivo", undefined);
  act(() => { root.unmount(); });
  container.remove();
});

test("Delivery (DOMICILIO) order still renders its driver-status flow, unaffected by the new filters", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith(null)] });
  // language-guard: allow-legacy existing backend field name (tipo_consegna), not new vocabulary
  const deliveryOrder = { ...pickupOrder, id: "P2", tipo_consegna: "DOMICILIO", estado: "EN_ENTREGA" };
  const { container, root } = await renderPage({ ordenes: [deliveryOrder], listosN: 1 });
  expect(container.textContent).toContain("Driver fuera");
  act(() => { root.unmount(); });
  container.remove();
});

// ── table_session_id exclusion holds through the unified shell too ────────
test("an order carrying table_session_id never appears in the Takeaway filter, even if its estado matches LISTO", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith(null)] });
  const tableOwnedOrder = { ...pickupOrder, id: "P3", nombre: "MesaLeak", table_session_id: "session-1" };
  const { container, root } = await renderPage({ ordenes: [tableOwnedOrder], listosN: 0 });
  click(filterButton(container, "Takeaway"));
  await flush();
  expect(container.textContent).not.toContain("MesaLeak");
  act(() => { root.unmount(); });
  container.remove();
});

test("switching filters does not trigger extra mesaApi.floor polls", async () => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableWith("LISTO")] });
  const { container, root } = await renderPage({});
  const callsAfterMount = mesaApi.floor.mock.calls.length;
  click(filterButton(container, "Sala"));
  click(filterButton(container, "Takeaway"));
  click(filterButton(container, "Todo"));
  await flush();
  expect(mesaApi.floor.mock.calls.length).toBe(callsAfterMount);
  act(() => { root.unmount(); });
  container.remove();
});
