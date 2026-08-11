import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

// P1_D_TABLE_FIRST_01 -- covers MesaWorkspace's compactCard presentation
// (phone shell only, compact prop) added in this slice: the centered table
// modal replacing the old bottom-sheet-that-shrinks-to-content, its
// COMANDAS/RESERVAS muted-vs-active sections, and that the non-compact
// (tablet/desktop) path renders the exact old Modal/bottom-sheet markup,
// completely unaffected.
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
const { mesaApi } = require("../../mesa/mesaApi");

const emptySession = { id: "s1", coversTotal: 2, coversRemaining: 2, total: 0, paid: 0, outstanding: 0, nextEqualShare: 0, paymentTotals: {}, commands: [], lines: [], payments: [] };
const withOrdersSession = {
  ...emptySession, total: 24.5, outstanding: 24.5,
  commands: [{ id: "c1", commandNumber: 101, state: "EN_COCINA", time: "20:10", items: [{ n: "Margherita", q: 2 }, { n: "Coca-Cola", q: 1 }] }],
};
// Same-day, ~30 min from now -- inside isRelevantReservation's default
// 120-minute window regardless of the exact instant the suite runs.
const futureReservation = { id: "r1", status: "booked", guestName: "Ana Ruiz", coversTotal: 4, reservedAt: new Date(Date.now() + 30 * 60000).toISOString(), version: 1 };

function tableFixture(overrides) {
  return { id: "t1", number: 5, x: 40, y: 40, shape: "square", shapePreset: "standard", active: true, capacity: 4, reservations: [], ...overrides };
}

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

async function mount({ compact, table }) {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [table] });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TabMesa role="admin" notify={jest.fn()} onNewCommand={jest.fn()} onCountChange={jest.fn()}
      compact={compact} mesaDrafts={{}} onClearDraft={jest.fn()} onSendToCocina={jest.fn()} />);
  });
  await flush();
  // The one occupied table on the board -- status:"open" tables go straight
  // to MesaWorkspace on tap, same branch this exercises on real staging.
  click(container.querySelector(".mesa-table"));
  await flush();
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

describe("MesaWorkspace compactCard -- presentation (phone shell only)", () => {
  test("compact=true renders the new centered-card overlay, not the old Modal/bottom-sheet markup", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: emptySession }) });
    expect(container.querySelector(".mesa-table-card-overlay")).not.toBeNull();
    expect(container.querySelector(".mesa-table-card")).not.toBeNull();
    expect(container.querySelector(".mesa-overlay")).toBeNull();
    expect(container.querySelector(".mesa-modal")).toBeNull();
    unmount(container, root);
  });

  test("compact=false (tablet/desktop) is completely unchanged -- still the old Modal/bottom-sheet markup, never the new card", async () => {
    const { container, root } = await mount({ compact: false, table: tableFixture({ status: "open", session: emptySession }) });
    expect(container.querySelector(".mesa-overlay")).not.toBeNull();
    expect(container.querySelector(".mesa-modal")).not.toBeNull();
    expect(container.querySelector(".mesa-table-card-overlay")).toBeNull();
    unmount(container, root);
  });

  test("X closes the compact card", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: emptySession }) });
    expect(container.querySelector(".mesa-table-card-overlay")).not.toBeNull();
    click(container.querySelector(".mesa-close"));
    await flush();
    expect(container.querySelector(".mesa-table-card-overlay")).toBeNull();
    unmount(container, root);
  });
});

describe("MesaWorkspace compactCard -- COMANDAS section", () => {
  test("empty: muted, no aggregate dumped, just the short empty line", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: emptySession }) });
    const section = container.querySelector('[data-testid="mesa-card-comandas"]');
    expect(section.className).toContain("muted");
    expect(section.className).not.toContain("active");
    expect(section.textContent).toContain("Todavía no hay comandas.");
    unmount(container, root);
  });

  test("populated: active, compact aggregate summary (not the full per-item dump) until expanded", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: withOrdersSession }) });
    const section = container.querySelector('[data-testid="mesa-card-comandas"]');
    expect(section.className).toContain("active");
    // Pedido en curso · 3 artículos (2 Margherita + 1 Coca-Cola) · 24,50 €
    expect(section.textContent).toContain("Pedido en curso");
    expect(section.textContent).toContain("3 artículos");
    expect(section.textContent).not.toContain("Margherita");
    // Tap reveals the exact existing CommandCard list -- reused, not
    // duplicated -- rather than a second, parallel rendering of the order.
    // CommandCard itself stays independently collapsed by default (its own
    // existing, unmodified behavior); "Comanda #101" is its own collapsed-
    // state label, proof this is the real component, not a re-summary.
    expect(container.textContent).not.toContain("Comanda #101");
    click(section);
    await flush();
    expect(container.textContent).toContain("Comanda #101");
    unmount(container, root);
  });
});

describe("MesaWorkspace compactCard -- RESERVAS section", () => {
  test("no reservation for this table: muted, short line, does not consume much space", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: emptySession, reservations: [] }) });
    const section = container.querySelector('[data-testid="mesa-card-reservas"]');
    expect(section.className).toContain("muted");
    expect(section.textContent).toContain("Sin reserva para esta mesa.");
    unmount(container, root);
  });

  test("a reservation exists: active, compact summary with guest name", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: emptySession, reservations: [futureReservation] }) });
    const section = container.querySelector('[data-testid="mesa-card-reservas"]');
    expect(section.className).toContain("active");
    expect(section.textContent).toContain("Ana Ruiz");
    unmount(container, root);
  });

  test("tapping RESERVAS opens the real agenda filtered to this table (same data source, no parallel store)", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: emptySession, reservations: [futureReservation], number: 5 }) });
    click(container.querySelector('[data-testid="mesa-card-reservas"]'));
    await flush();
    expect(container.textContent).toContain("Reservas activas de hoy");
    // Filtered to Mesa 5: the <select> reads that table's id, not "".
    const select = container.querySelector(".mesa-form-grid select");
    expect(select.value).toBe("t1");
    unmount(container, root);
  });
});

describe("MesaWorkspace compactCard -- table actions unchanged", () => {
  test("Nueva comanda / Ver cuenta / Cerrar mesa are all present, same handlers as before", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: emptySession }) });
    const actionLabels = Array.from(container.querySelectorAll(".mesa-table-card button")).map((b) => b.textContent);
    expect(actionLabels.some((t) => t.includes("Nueva comanda"))).toBe(true);
    expect(actionLabels.some((t) => t.includes("Ver cuenta"))).toBe(true);
    expect(actionLabels.some((t) => t.includes("Cerrar mesa"))).toBe(true);
    unmount(container, root);
  });

  test("Ver cuenta opens the real, unchanged VerCuentaModal", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: withOrdersSession }) });
    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Ver cuenta"));
    await flush();
    expect(container.textContent).toContain("Cuenta");
    expect(container.textContent).toContain("Pendiente");
    unmount(container, root);
  });
});
