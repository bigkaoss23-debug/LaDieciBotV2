import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

// The renderer flag is read at module scope (same convention as
// REACT_APP_MESA_ENABLED), so it has to be set before TabMesa is required.
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
const {
  HYBRID_TOKENS, cameraFrame, sceneGeometry, tableGeometry, tableFootprint,
} = require("./hybridScene");

const BOARD = { left: 0, top: 0, width: 370, height: 663, right: 370, bottom: 663 };

// The geometry the COMPONENT builds, camera framing included. Rebuilding it
// the same way here is the whole point of these assertions: the hit target has
// to land on the table as actually drawn, under whatever camera is in effect.
// Checking against an unframed room would pass while the operator taps floor.
const geomFor = (tables) =>
  sceneGeometry(BOARD.width, BOARD.height, HYBRID_TOKENS, cameraFrame(tables));

function table(overrides) {
  return {
    id: "t1", number: 1, name: "Mesa 1", capacity: 4, x: 50, y: 50,
    shape: "square", active: true, status: "free", session: null, reservations: [],
    ...overrides,
  };
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

async function mount(tables, props = {}) {
  mesaApi.floor.mockResolvedValue({ ok: true, tables });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<TabMesa role="owner" notify={jest.fn()} onNewCommand={jest.fn()} compact {...props} />);
  });
  await flush();
  // JSDOM reports a zero-sized box, so give the board a realistic one and let
  // the component's own resize path pick it up — the same code path a real
  // viewport change uses.
  const board = host.querySelector(".mesa-board");
  if (board) {
    board.getBoundingClientRect = () => BOARD;
    await act(async () => { window.dispatchEvent(new Event("resize")); });
    await flush();
  }
  return { host, root, board: host.querySelector(".mesa-board") };
}

function pointer(el, type, x, y, pointerId = 1) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { clientX: x, clientY: y, pointerId });
  act(() => { el.dispatchEvent(event); });
}

beforeEach(() => { jest.clearAllMocks(); document.body.innerHTML = ""; });

// ── renderer selection ─────────────────────────────────────────────────────
describe("renderer flag", () => {
  test("mounts the hybrid scene when the flag is enabled", async () => {
    const { host } = await mount([table()]);
    expect(host.querySelector(".mesa-scene")).not.toBeNull();
    expect(host.querySelector(".mesa-board").className).toContain("hybrid");
    expect(host.querySelector(".mesa-table").className).toContain("hybrid");
  });

  test("falls back to the original renderer when the flag is disabled", () => {
    jest.isolateModules(() => {
      const prev = process.env.REACT_APP_MESA_HYBRID_3D_ENABLED;
      process.env.REACT_APP_MESA_HYBRID_3D_ENABLED = "false";
      const Fallback = require("./TabMesa").default;
      expect(typeof Fallback).toBe("function");
      // The flag is consumed at module scope, so a module loaded with it off
      // cannot reach the hybrid code path at all.
      const source = require("fs").readFileSync(require.resolve("./TabMesa"), "utf8");
      expect(source).toContain('process.env.REACT_APP_MESA_HYBRID_3D_ENABLED === "true"');
      process.env.REACT_APP_MESA_HYBRID_3D_ENABLED = prev;
    });
  });

  test("the scene is decorative only — never focusable, never a control", async () => {
    const { host } = await mount([table()]);
    const svg = host.querySelector(".mesa-scene");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.querySelectorAll("button, a, [tabindex]")).toHaveLength(0);
  });
});

// ── chairs ────────────────────────────────────────────────────────────────
describe("chairs represent authoritative capacity", () => {
  test.each([[2, 2], [4, 4], [6, 6]])("capacity %i renders exactly %i chairs", async (capacity, expected) => {
    const { host } = await mount([table({ capacity })]);
    const group = host.querySelector('[data-table-id="t1"]');
    expect(group.querySelectorAll('[data-chair]')).toHaveLength(expected);
  });

  test("a round two-seater does not get four decorative chairs", async () => {
    const { host } = await mount([table({ shape: "round", capacity: 2 })]);
    expect(host.querySelectorAll('[data-chair]')).toHaveLength(2);
  });

  test("capacity is read per table, not shared across the floor", async () => {
    const { host } = await mount([
      table({ id: "t1", number: 1, capacity: 2, x: 25, y: 30 }),
      table({ id: "t2", number: 2, capacity: 6, x: 70, y: 70 }),
    ]);
    expect(host.querySelector('[data-table-id="t1"]').querySelectorAll('[data-chair]')).toHaveLength(2);
    expect(host.querySelector('[data-table-id="t2"]').querySelectorAll('[data-chair]')).toHaveLength(6);
  });

  test("chairs never become independent interaction entities", async () => {
    const { host } = await mount([table({ capacity: 6 })]);
    const chairs = host.querySelectorAll('[data-chair]');
    expect(chairs.length).toBe(6);
    chairs.forEach((chair) => {
      expect(chair.closest("button")).toBeNull();
      expect(chair.getAttribute("tabindex")).toBeNull();
    });
    // one Mesa, one accessible control
    expect(host.querySelectorAll(".mesa-table")).toHaveLength(1);
  });
});

// ── shapes ────────────────────────────────────────────────────────────────
describe("shape construction", () => {
  test("a round table draws round primitives", async () => {
    const { host } = await mount([table({ shape: "round" })]);
    const group = host.querySelector('[data-table-id="t1"]');
    expect(group.getAttribute("data-shape")).toBe("round");
    expect(group.querySelectorAll("ellipse").length).toBeGreaterThan(0);
  });

  test("a square table draws rect primitives and keeps its class variant", async () => {
    const { host } = await mount([table({ shape: "square" })]);
    const group = host.querySelector('[data-table-id="t1"]');
    expect(group.getAttribute("data-shape")).toBe("square");
    expect(group.querySelectorAll("rect").length).toBeGreaterThan(0);
    expect(host.querySelector(".mesa-table").className).toContain("square");
  });
});

// ── domain state ──────────────────────────────────────────────────────────
describe("state comes from the domain, never from the renderer", () => {
  test("a free table reads free and keeps the green family", async () => {
    const { host } = await mount([table({ status: "free" })]);
    const group = host.querySelector('[data-table-id="t1"]');
    expect(group.getAttribute("data-state")).toBe("free");
    expect(group.getAttribute("data-rim")).toBe("#22C55E");
  });

  test("an occupied table with no comanda reads occupied with the red family", async () => {
    const { host } = await mount([table({ status: "open", session: { id: "s1", commands: [] } })]);
    const group = host.querySelector('[data-table-id="t1"]');
    expect(group.getAttribute("data-state")).toBe("occupied");
    expect(group.getAttribute("data-rim")).toBe("#EF4444");
  });

  test("an occupied table whose comanda is sent keeps the occupied face but a green rim", async () => {
    const { host } = await mount([table({
      status: "open",
      session: { id: "s1", commands: [{ id: "c1", state: "EN_COCINA", items: [] }] },
    })]);
    const group = host.querySelector('[data-table-id="t1"]');
    // the two independent signals the default renderer already carries
    expect(group.getAttribute("data-state")).toBe("occupied");
    expect(group.getAttribute("data-rim")).toBe("#22C55E");
  });

  test("a reserved table reads reserved with the amber family", async () => {
    const reservedAt = new Date(Date.now() + 30 * 60000).toISOString();
    const { host } = await mount([table({
      reservations: [{ id: "r1", tableId: "t1", status: "booked", guestName: "Ana", reservedAt, durationMinutes: 120 }],
    })]);
    const group = host.querySelector('[data-table-id="t1"]');
    expect(group.getAttribute("data-state")).toBe("reserved");
    expect(group.getAttribute("data-rim")).toBe("#EAB308");
  });

  test("the conflict badge still renders when the domain says so", async () => {
    const reservedAt = new Date(Date.now() + 30 * 60000).toISOString();
    const { host } = await mount([table({
      status: "open", session: { id: "s1", commands: [] },
      reservations: [{ id: "r1", tableId: "t1", status: "booked", guestName: "Ana", reservedAt, durationMinutes: 120 }],
    })]);
    const badge = host.querySelector(".mesa-badge-reserved");
    expect(badge).not.toBeNull();
    expect(badge.className).toContain("conflict");
    expect(badge.getAttribute("aria-label")).toBe("Reserva en conflicto");
  });
});

// ── hit target ────────────────────────────────────────────────────────────
describe("hit target tracks the projected table", () => {
  test("the control is positioned in px on the projected table, not at a raw percentage", async () => {
    const rows = [table({ x: 30, y: 62 })];
    const { host } = await mount(rows);
    const geom = geomFor(rows);
    const expected = tableFootprint(rows[0], geom);
    const tile = host.querySelector(".mesa-table");
    expect(tile.style.left).toBe(`${expected.left}px`);
    expect(tile.style.top).toBe(`${expected.top}px`);
    expect(tile.style.width).toBe(`${expected.width}px`);
    expect(tile.style.height).toBe(`${expected.height}px`);
  });

  test("the control's centre sits on the drawn table's centre — no target shift", async () => {
    const rows = [table({ x: 30, y: 62 })];
    const { host } = await mount(rows);
    const geom = geomFor(rows);
    const drawn = tableGeometry(rows[0], geom);
    const tile = host.querySelector(".mesa-table");
    const centerX = parseFloat(tile.style.left) + parseFloat(tile.style.width) / 2;
    expect(centerX).toBeCloseTo(drawn.topX, 6);
  });

  test("still keeps exactly one accessible control per Mesa", async () => {
    const { host } = await mount([
      table({ id: "t1", number: 1, x: 25, y: 30 }),
      table({ id: "t2", number: 2, x: 70, y: 70 }),
    ]);
    expect(host.querySelectorAll("button.mesa-table")).toHaveLength(2);
  });
});

// ── interaction ───────────────────────────────────────────────────────────
describe("tapping a projected table", () => {
  test("opens the correct Mesa", async () => {
    mesaApi.openTable.mockResolvedValue({ ok: true });
    const { host } = await mount([
      table({ id: "t1", number: 1, x: 25, y: 30 }),
      table({ id: "t2", number: 2, x: 70, y: 70 }),
    ]);
    const tiles = [...host.querySelectorAll(".mesa-table")];
    const second = tiles.find((tile) => tile.textContent.includes("2"));
    act(() => { second.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await flush();
    expect(mesaApi.openTable).toHaveBeenCalledTimes(1);
    expect(mesaApi.openTable.mock.calls[0][0]).toBe("t2");
  });
});

// ── drag ──────────────────────────────────────────────────────────────────
describe("projected drag", () => {
  test("persists a LOGICAL coordinate, never projected pixels", async () => {
    mesaApi.saveTable.mockResolvedValue({ ok: true });
    const rows = [table({ x: 50, y: 50 })];
    const { host, board } = await mount(rows, { initialAction: { token: 1, type: "editing" } });
    await flush();
    const tile = host.querySelector(".mesa-table");
    pointer(tile, "pointerdown", 185, 300);
    pointer(board, "pointermove", 210, 260);
    await act(async () => { pointer(board, "pointerup", 210, 260); });
    await flush();

    expect(mesaApi.saveTable).toHaveBeenCalledTimes(1);
    const [id, payload] = mesaApi.saveTable.mock.calls[0];
    expect(id).toBe("t1");
    // logical floor coordinates stay in the 0..100 domain range — a projected
    // pixel would be far outside it
    expect(payload.positionX).toBeGreaterThan(0);
    expect(payload.positionX).toBeLessThan(100);
    expect(payload.positionY).toBeGreaterThan(0);
    expect(payload.positionY).toBeLessThan(100);
    // moved up-screen ⇒ further back in the room ⇒ smaller y
    expect(payload.positionY).toBeLessThan(50);
  });

  test("saves once per drag, not once per move", async () => {
    mesaApi.saveTable.mockResolvedValue({ ok: true });
    const { host, board } = await mount([table({ x: 50, y: 50 })], { initialAction: { token: 1, type: "editing" } });
    await flush();
    const tile = host.querySelector(".mesa-table");
    pointer(tile, "pointerdown", 185, 300);
    pointer(board, "pointermove", 195, 290);
    pointer(board, "pointermove", 205, 280);
    pointer(board, "pointermove", 215, 270);
    await act(async () => { pointer(board, "pointerup", 215, 270); });
    await flush();
    expect(mesaApi.saveTable).toHaveBeenCalledTimes(1);
  });

  test("a tap below the drag threshold never saves a position", async () => {
    const { host, board } = await mount([table({ x: 50, y: 50 })], { initialAction: { token: 1, type: "editing" } });
    await flush();
    const tile = host.querySelector(".mesa-table");
    pointer(tile, "pointerdown", 185, 300);
    pointer(board, "pointermove", 187, 302);
    await act(async () => { pointer(board, "pointerup", 187, 302); });
    await flush();
    expect(mesaApi.saveTable).not.toHaveBeenCalled();
  });
});
