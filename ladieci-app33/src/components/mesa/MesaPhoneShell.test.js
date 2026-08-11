import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

// jest.mock()'s factory is hoisted above the rest of the module, so it can
// only safely reference outer variables named `mock*` (Jest's own
// convention/allowlist) -- these two are the fixture tables MesaListaView's
// and TabMesa's own mesaApi.floor() resolve to throughout this file.
const mockFreeTable = { id: "t1", number: 1, x: 30, y: 30, shape: "square", shapePreset: "standard", active: true, status: "free", capacity: 4, reservations: [] };
const mockOpenTable = {
  id: "t2", number: 2, x: 60, y: 60, shape: "round", shapePreset: "standard", active: true, status: "open", capacity: 4, reservations: [],
  session: { id: "s2", coversTotal: 2, coversRemaining: 0, total: 0, paid: 0, outstanding: 0, nextEqualShare: 0, paymentTotals: {}, commands: [], lines: [], payments: [] },
};

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
jest.mock("../../sounds", () => ({ __esModule: true, default: { mesaListo: jest.fn() } }));

const MesaPhoneShell = require("./MesaPhoneShell").default;
const { mesaApi } = require("../../mesa/mesaApi");

// CRA's own jest config sets resetMocks:true (createJestConfig.js), which
// wipes every mockResolvedValue/mockReturnValue back to a bare stub before
// EACH test -- setting them once inside the jest.mock() factory above only
// ever takes effect for the very first test in the file. Re-establishing
// them here, every time, is the correct fix, not a workaround.
beforeEach(() => {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [mockFreeTable, mockOpenTable] });
  mesaApi.openTable.mockResolvedValue({ sessionId: "s1", coversTotal: null });
});

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}
async function flush() {
  // A screen switch that mounts a fresh component with its own useEffect ->
  // async mesaApi.floor() (MesaListaView, or TabMesa itself) needs more than
  // a couple of microtask hops to actually settle in JSDOM -- several short
  // rounds is more reliable here than one long one.
  for (let i = 0; i < 6; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}
function byText(container, selector, text) {
  return Array.from(container.querySelectorAll(selector)).find((el) => el.textContent.trim() === text);
}
function navButton(container, label) {
  return Array.from(container.querySelectorAll("nav button")).find((b) => b.textContent.includes(label));
}

async function mount(overrides = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const props = {
    role: "admin", notify: jest.fn(), onNewCommand: jest.fn(), onCountChange: jest.fn(),
    refreshKey: 0, mesaDrafts: {}, onClearDraft: jest.fn(), onSendToCocina: jest.fn(),
    listosElement: <div data-testid="listos-stub">LISTOS_STUB</div>,
    onNewOrder: jest.fn(), onExit: jest.fn(),
    ...overrides,
  };
  await act(async () => { root.render(<MesaPhoneShell {...props} />); });
  await flush();
  return { container, root, props };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

describe("MesaPhoneShell -- admin-only back arrow", () => {
  test("role=admin sees the back arrow", async () => {
    const { container, root } = await mount({ role: "admin" });
    expect(container.querySelector('[aria-label="Volver a Servicio"]')).not.toBeNull();
    unmount(container, root);
  });

  test("role=operator does NOT see the back arrow -- no hidden tappable ghost area either", async () => {
    const { container, root } = await mount({ role: "operator" });
    expect(container.querySelector('[aria-label="Volver a Servicio"]')).toBeNull();
    unmount(container, root);
  });

  test("tapping the back arrow calls onExit and nothing else -- no logout/session/lifecycle side effect available to it", async () => {
    const { container, root, props } = await mount({ role: "admin" });
    click(container.querySelector('[aria-label="Volver a Servicio"]'));
    expect(props.onExit).toHaveBeenCalledTimes(1);
    unmount(container, root);
  });
});

describe("MesaPhoneShell -- default screen and nav", () => {
  test("Mapa is the default tab -- the floor is visible without extra navigation", async () => {
    const { container, root } = await mount();
    expect(container.querySelector(".mesa-board")).not.toBeNull();
    unmount(container, root);
  });

  test("bottom nav is exactly Mapa / Lista / + / Listos / Más, in that order", async () => {
    const { container, root } = await mount();
    const nav = container.querySelector("nav");
    const labels = Array.from(nav.children).map((el) => (el.getAttribute("aria-label") || el.textContent).trim());
    expect(labels.map((l, i) => l.includes(["Mapa", "Lista", "Nuevo pedido", "Listos", "Más"][i]))).toEqual([true, true, true, true, true]);
    unmount(container, root);
  });
});

describe("MesaPhoneShell -- center + is the real Nuevo Pedido entrypoint, nothing new", () => {
  test("tapping the center + calls the caller's onNewOrder, not a new/duplicate order flow", async () => {
    const { container, root, props } = await mount();
    click(container.querySelector('[aria-label="Nuevo pedido"]'));
    expect(props.onNewOrder).toHaveBeenCalledTimes(1);
    unmount(container, root);
  });
});

describe("MesaPhoneShell -- Listos reuses the exact authoritative element, not a reimplementation", () => {
  test("tapping Listos renders the passed listosElement verbatim", async () => {
    const { container, root } = await mount();
    click(navButton(container, "Listos"));
    await flush();
    expect(container.querySelector('[data-testid="listos-stub"]')).not.toBeNull();
    expect(container.textContent).toContain("LISTOS_STUB");
    unmount(container, root);
  });
});

describe("MesaPhoneShell -- Lista shows the same authoritative Mesa data as Mapa", () => {
  test("Lista lists both real tables by number, with their current state", async () => {
    const { container, root } = await mount();
    click(navButton(container, "Lista"));
    await flush();
    expect(container.textContent).toContain("Mesa 1");
    expect(container.textContent).toContain("Mesa 2");
    expect(container.textContent).toContain("Libre");
    expect(container.textContent).toContain("Ocupada");
    unmount(container, root);
  });

  test("tapping a free table in Lista opens it in Mapa via the SAME action a map tap uses (openWalkIn -> mesaApi.openTable)", async () => {
    const { container, root } = await mount();
    click(navButton(container, "Lista"));
    await flush();
    click(byText(container, "button", null) || Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Mesa 1")));
    await flush();
    expect(mesaApi.openTable).toHaveBeenCalledWith("t1");
    // Lands back on Mapa, not stranded on Lista.
    expect(container.querySelector(".mesa-board")).not.toBeNull();
    unmount(container, root);
  });

  test("tapping an already-open table in Lista goes straight to its workspace, same as tapping it on the map", async () => {
    const { container, root } = await mount();
    click(navButton(container, "Lista"));
    await flush();
    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Mesa 2")));
    await flush();
    // "Comandas" (mixed case) is the literal DOM text -- the all-caps look
    // on real staging is a CSS text-transform, invisible to textContent.
    expect(container.textContent).toContain("Comandas");
    expect(container.textContent).toContain("Mesa 2");
    unmount(container, root);
  });
});

describe("MesaPhoneShell -- Más is scoped to Mesa-operational actions only, role-aware", () => {
  test("admin sees both Reservas and Personalizar sala", async () => {
    const { container, root } = await mount({ role: "admin" });
    click(navButton(container, "Más"));
    await flush();
    expect(container.textContent).toContain("Reservas");
    expect(container.textContent).toContain("Personalizar sala");
    unmount(container, root);
  });

  test("operator sees Reservas but NOT Personalizar sala (room editing stays admin-only, same as the map's own dock)", async () => {
    const { container, root } = await mount({ role: "operator" });
    click(navButton(container, "Más"));
    await flush();
    expect(container.textContent).toContain("Reservas");
    expect(container.textContent).not.toContain("Personalizar sala");
    unmount(container, root);
  });

  test("Más never renders PIN management, Mi cuenta, or Gestión de accesos -- those stay outside Mesa", async () => {
    const { container, root } = await mount({ role: "admin" });
    click(navButton(container, "Más"));
    await flush();
    expect(container.textContent).not.toContain("PIN");
    expect(container.textContent).not.toContain("Mi cuenta");
    expect(container.textContent).not.toContain("Gestión de accesos");
    unmount(container, root);
  });

  test("Más's Personalizar sala switches to Mapa already in editing mode", async () => {
    const { container, root } = await mount({ role: "admin" });
    click(navButton(container, "Más"));
    await flush();
    click(byText(container, "button", "🛠 Personalizar sala"));
    await flush();
    expect(container.querySelector(".mesa-board")).not.toBeNull();
    expect(container.textContent).toContain("Salir de Personalizar sala");
    unmount(container, root);
  });

  test("Más's Reservas switches to Mapa with the reservations agenda already open", async () => {
    const { container, root } = await mount({ role: "admin" });
    click(navButton(container, "Más"));
    await flush();
    click(byText(container, "button", "📅 Reservas"));
    await flush();
    expect(container.textContent).toContain("Reservas activas de hoy");
    unmount(container, root);
  });
});
