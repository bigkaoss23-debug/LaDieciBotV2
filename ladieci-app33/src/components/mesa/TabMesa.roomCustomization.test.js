import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;
process.env.REACT_APP_MESA_HYBRID_3D_ENABLED = "true";

jest.mock("../../mesa/mesaApi", () => ({
  __esModule: true,
  createMesaRequestId: jest.fn(() => "mesa_test_request"),
  describeMesaError: jest.fn((error) => error?.code || "error"),
  mesaApi: {
    floor: jest.fn(), openTable: jest.fn(), releaseEmptyTable: jest.fn(),
    closeTable: jest.fn(), saveTable: jest.fn(), addCommand: jest.fn(),
    markServed: jest.fn(), pay: jest.fn(), createReservation: jest.fn(),
    updateReservation: jest.fn(), setReservationStatus: jest.fn(), openReservation: jest.fn(),
  },
}));

const TabMesa = require("./TabMesa").default;
const { mesaApi } = require("../../mesa/mesaApi");

const BOARD = { left: 0, top: 0, width: 370, height: 663, right: 370, bottom: 663 };

// ROOM CUSTOMIZATION — editing an EXISTING table's physical configuration.
//
// The product contract these lock down: a table's IDENTITY (its id, its
// number, its history) is separate from its CONFIGURATION (capacity, shape,
// position). Changing the physical table must never retire Mesa 5 and mint a
// replacement, and must never touch the live session's comensales.
const table = (overrides) => ({
  id: "t5", number: 5, name: "Mesa 5", capacity: 4, x: 50, y: 40,
  shape: "square", shapePreset: "standard", active: true,
  status: "free", session: null, reservations: [], ...overrides,
});

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

async function mount(tables, props = {}) {
  mesaApi.floor.mockResolvedValue({ ok: true, tables });
  mesaApi.saveTable.mockResolvedValue({ ok: true });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<TabMesa role="owner" notify={jest.fn()} onNewCommand={jest.fn()} compact
      initialAction={{ token: 1, type: "editing" }} {...props} />);
  });
  await flush();
  const board = host.querySelector(".mesa-board");
  if (board) {
    board.getBoundingClientRect = () => BOARD;
    await act(async () => { window.dispatchEvent(new Event("resize")); });
    await flush();
  }
  return { host, root };
}

const click = (el) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const byTestId = (host, id) => host.querySelector(`[data-testid="${id}"]`);
const tileFor = (host, number) =>
  [...host.querySelectorAll(".mesa-table")].find((b) => b.textContent.trim().startsWith(String(number)));
const typeInto = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  act(() => { setter.call(input, String(value)); input.dispatchEvent(new Event("input", { bubbles: true })); });
};
// Opens the editor the way an operator does: one tap on the table, in
// Personalizar sala. That path is itself part of what is under test.
async function openEditor(host, number = 5) {
  click(tileFor(host, number));
  await flush();
  return byTestId(host, "table-editor");
}

beforeEach(() => { jest.clearAllMocks(); document.body.innerHTML = ""; });

describe("reaching the editor", () => {
  test("a tap in Personalizar sala opens the room editor directly", async () => {
    const { host } = await mount([table()]);
    expect(await openEditor(host)).toBeTruthy();
    expect(host.textContent).toContain("Editar Mesa 5");
  });

  test("outside Personalizar sala the same tap does NOT open it", async () => {
    // A free table outside customization opens the walk-in flow instead, so
    // that call is stubbed with the shape the component actually consumes.
    mesaApi.openTable.mockResolvedValue({ ok: true, sessionId: "s5", coversTotal: 2 });
    const { host } = await mount([table()], { initialAction: undefined });
    click(tileFor(host, 5));
    await flush();
    expect(byTestId(host, "table-editor")).toBeFalsy();
  });
});

describe("editing an existing table preserves its identity", () => {
  test("capacity 4 → 6 saves against the SAME table id, never creates a new one", async () => {
    const { host } = await mount([table({ capacity: 4 })]);
    await openEditor(host);
    click(byTestId(host, "capacity-quick-6"));
    click(byTestId(host, "table-editor-save"));
    await flush();
    expect(mesaApi.saveTable).toHaveBeenCalledTimes(1);
    const [id, payload] = mesaApi.saveTable.mock.calls[0];
    expect(id).toBe("t5");            // the existing row, not "new"
    expect(id).not.toBe("new");
    expect(payload.tableNumber).toBe(5);
    expect(payload.capacity).toBe(6);
    expect(payload.active).toBe(true); // not a soft-delete
  });

  test("capacity 4 → 2 works the same way", async () => {
    const { host } = await mount([table({ capacity: 4 })]);
    await openEditor(host);
    click(byTestId(host, "capacity-quick-2"));
    click(byTestId(host, "table-editor-save"));
    await flush();
    const [id, payload] = mesaApi.saveTable.mock.calls[0];
    expect(id).toBe("t5");
    expect(payload.capacity).toBe(2);
    expect(payload.tableNumber).toBe(5);
  });

  test("a capacity outside the quick options is still reachable", async () => {
    const { host } = await mount([table({ capacity: 4 })]);
    await openEditor(host);
    typeInto(byTestId(host, "capacity-custom-input"), 12);
    click(byTestId(host, "table-editor-save"));
    await flush();
    expect(mesaApi.saveTable.mock.calls[0][1].capacity).toBe(12);
  });

  test("shape square → rectangular keeps the same Mesa", async () => {
    const { host } = await mount([table({ shape: "square" })]);
    await openEditor(host);
    const rect = [...host.querySelectorAll(".mesa-shape-btn")].find((b) => /Rectangular/i.test(b.textContent));
    click(rect);
    click(byTestId(host, "table-editor-save"));
    await flush();
    const [id, payload] = mesaApi.saveTable.mock.calls[0];
    expect(id).toBe("t5");
    expect(payload.shape).toBe("rectangle");
    expect(payload.tableNumber).toBe(5);
  });

  test("shape round → square keeps the same Mesa", async () => {
    const { host } = await mount([table({ shape: "round" })]);
    await openEditor(host);
    const square = [...host.querySelectorAll(".mesa-shape-btn")].find((b) => /Cuadrada/i.test(b.textContent));
    click(square);
    click(byTestId(host, "table-editor-save"));
    await flush();
    const [id, payload] = mesaApi.saveTable.mock.calls[0];
    expect(id).toBe("t5");
    expect(payload.shape).toBe("square");
  });

  // Editing the physical table must not relocate it: the operator placed it.
  test("editing configuration carries the table's position through untouched", async () => {
    const { host } = await mount([table({ x: 31.5, y: 62.25 })]);
    await openEditor(host);
    click(byTestId(host, "capacity-quick-8"));
    click(byTestId(host, "table-editor-save"));
    await flush();
    const payload = mesaApi.saveTable.mock.calls[0][1];
    expect(payload.positionX).toBeCloseTo(31.5, 6);
    expect(payload.positionY).toBeCloseTo(62.25, 6);
  });
});

// THE DOMAIN DISTINCTION the brief calls out: `máx N` describes the table,
// `N comensales` describes who is sitting at it right now.
describe("capacity is not covers", () => {
  const seated = table({
    status: "open", capacity: 4,
    session: { id: "s5", coversTotal: 3, commands: [] },
  });

  test("changing capacity never writes a covers field", async () => {
    const { host } = await mount([seated]);
    await openEditor(host);
    click(byTestId(host, "capacity-quick-6"));
    click(byTestId(host, "table-editor-save"));
    await flush();
    const payload = mesaApi.saveTable.mock.calls[0][1];
    expect(payload.capacity).toBe(6);
    expect(payload).not.toHaveProperty("coversTotal");
    expect(payload).not.toHaveProperty("covers");
    expect(JSON.stringify(payload)).not.toContain("covers");
  });

  test("the editor shows the live covers so the two are visibly different", async () => {
    const { host } = await mount([seated]);
    await openEditor(host);
    const note = byTestId(host, "table-editor-covers-note");
    expect(note).toBeTruthy();
    expect(note.textContent).toContain("3 comensales");
  });

  test("a free table shows no covers note at all", async () => {
    const { host } = await mount([table({ status: "free", session: null })]);
    await openEditor(host);
    expect(byTestId(host, "table-editor-covers-note")).toBeFalsy();
  });
});

describe("the map reflects an edited configuration", () => {
  test("máx N follows the authoritative capacity", async () => {
    const { host } = await mount([table({ capacity: 6 })]);
    expect(tileFor(host, 5).textContent).toContain("máx 6");
  });

  // The approved decorative rule survives a capacity edit: exact to 4, capped
  // above it. A 6-top must not go back to rendering six chairs.
  test("decorative chairs stay capped after a capacity change", async () => {
    const two = await mount([table({ capacity: 2 })]);
    expect(two.host.querySelectorAll("[data-chair]")).toHaveLength(2);
    document.body.innerHTML = "";
    const six = await mount([table({ capacity: 6 })]);
    expect(six.host.querySelectorAll("[data-chair]")).toHaveLength(4);
    expect(tileFor(six.host, 5).textContent).toContain("máx 6");
  });
});

describe("add and edit share one configuration contract", () => {
  test("Añadir mesa offers the same capacity control as the editor", async () => {
    const { host } = await mount([table()]);
    click(byTestId(host, "mesa-add-table"));
    await flush();
    expect(byTestId(host, "capacity-quick-6")).toBeTruthy();
    expect(byTestId(host, "capacity-custom-input")).toBeTruthy();
    expect(host.querySelectorAll(".mesa-shape-btn").length).toBeGreaterThan(0);
  });

  test("a new table is created with id 'new' — the one place that is correct", async () => {
    const { host } = await mount([table()]);
    click(byTestId(host, "mesa-add-table"));
    await flush();
    click(byTestId(host, "capacity-quick-8"));
    click([...host.querySelectorAll("button")].find((b) => b.textContent.trim() === "Añadir"));
    await flush();
    const [id, payload] = mesaApi.saveTable.mock.calls[0];
    expect(id).toBe("new");
    expect(payload.capacity).toBe(8);
  });
});

// The finish CTA must not claim to save when saving already happened.
describe("customization bottom bar tells the truth about persistence", () => {
  test("the finish action says Listo, not a save that does not exist", async () => {
    const { host } = await mount([table()]);
    const toggle = byTestId(host, "mesa-customize-toggle");
    expect(toggle.textContent).toContain("Listo");
    expect(toggle.textContent).not.toMatch(/Guardar sala/i);
    expect(toggle.textContent).not.toMatch(/Salir de Personalizar sala/i);
  });

  test("leaving customization performs no save of its own", async () => {
    const { host } = await mount([table()]);
    click(byTestId(host, "mesa-customize-toggle"));
    await flush();
    // nothing was staged, so nothing is flushed on exit
    expect(mesaApi.saveTable).not.toHaveBeenCalled();
    expect(byTestId(host, "mesa-customize-toggle").textContent).toContain("Personalizar sala");
  });

  test("Añadir mesa is still offered while customizing", async () => {
    const { host } = await mount([table()]);
    expect(byTestId(host, "mesa-add-table")).toBeTruthy();
  });
});
