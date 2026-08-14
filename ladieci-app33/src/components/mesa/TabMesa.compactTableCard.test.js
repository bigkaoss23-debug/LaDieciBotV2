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
const { mesaApi, describeMesaError } = require("../../mesa/mesaApi");

// react-scripts' jest config sets resetMocks:true, which strips even the
// factory-level `jest.fn((error) => ...)` implementation above before every
// test -- without re-arming it here, setError(describeMesaError(err))
// silently becomes setError(undefined) (falsy, so {error && <div
// className="mesa-error">...} never mounts) in every rejected-close/rejected-
// payment assertion added for the nav-consolidation slice. Same fix already
// applied in TabMesa.render.test.js for the identical reason.
beforeEach(() => {
  describeMesaError.mockImplementation((error) => error?.code || "error");
});

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
function byTestId(container, id) { return container.querySelector(`[data-testid="${id}"]`); }

async function mount({ compact, table, mesaDrafts = {} }) {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [table] });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TabMesa role="admin" notify={jest.fn()} onNewCommand={jest.fn()} onCountChange={jest.fn()}
      compact={compact} mesaDrafts={mesaDrafts} onClearDraft={jest.fn()} onSendToCocina={jest.fn()} />);
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

  test("Ver cuenta drives the real, unchanged VerCuentaBody content, now in-place", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: withOrdersSession }) });
    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Ver cuenta"));
    await flush();
    expect(container.textContent).toContain("Pendiente");
    unmount(container, root);
  });
});

// MESA_NAV_CONSOLIDATION_01 -- Ver cuenta / Cerrar mesa used to mount as a
// second, independent full-viewport overlay (VerCuentaModal / CerrarMesaDialog,
// each their own .mesa-overlay) stacked on top of this same card. This block
// covers the replacement: one workspace, one modal layer, an internal back
// control, and the outer × always closing the whole thing regardless of
// which subview is showing.
describe("MesaWorkspace compactCard -- Ver cuenta in-place (no second overlay)", () => {
  test("Ver cuenta replaces the compact card content in-place -- one modal layer, detail not simultaneously rendered", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: withOrdersSession }) });
    expect(container.querySelector('[data-testid="mesa-card-comandas"]')).not.toBeNull();

    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Ver cuenta"));
    await flush();

    // Still exactly one workspace layer -- no second .mesa-overlay/.mesa-modal
    // stacked on top of the compact card.
    expect(container.querySelectorAll(".mesa-table-card-overlay").length).toBe(1);
    expect(container.querySelector(".mesa-overlay")).toBeNull();
    expect(container.querySelector(".mesa-modal")).toBeNull();

    // Detail content is gone, not just visually covered by a second layer.
    expect(container.querySelector('[data-testid="mesa-card-comandas"]')).toBeNull();
    expect(container.querySelector('[data-testid="mesa-card-reservas"]')).toBeNull();

    const accountView = container.querySelector('[data-testid="mesa-card-view-account"]');
    expect(accountView).not.toBeNull();
    expect(accountView.textContent).toContain("Pendiente");
    unmount(container, root);
  });

  test("internal back control (← Mesa N) restores the exact previous Mesa detail state", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: withOrdersSession, number: 5 }) });
    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Ver cuenta"));
    await flush();

    const back = container.querySelector('[data-testid="mesa-card-back"]');
    expect(back).not.toBeNull();
    expect(back.textContent).toContain("Mesa 5");

    click(back);
    await flush();
    expect(container.querySelector('[data-testid="mesa-card-view-account"]')).toBeNull();
    expect(container.querySelector('[data-testid="mesa-card-comandas"]')).not.toBeNull();
    unmount(container, root);
  });
});

describe("MesaWorkspace compactCard -- Cerrar mesa in-place (no second overlay)", () => {
  test("Cerrar mesa replaces the compact card content in-place -- one modal layer, real confirmation copy and buttons", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: emptySession, number: 5 }) });

    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Cerrar mesa"));
    await flush();

    expect(container.querySelectorAll(".mesa-table-card-overlay").length).toBe(1);
    expect(container.querySelector(".mesa-overlay")).toBeNull();
    expect(container.querySelector(".mesa-modal")).toBeNull();
    expect(container.querySelector('[data-testid="mesa-card-comandas"]')).toBeNull();

    const confirmView = container.querySelector('[data-testid="mesa-card-view-close-confirm"]');
    expect(confirmView).not.toBeNull();
    expect(confirmView.textContent).toContain("Cerrar Mesa 5");
    expect(confirmView.getAttribute("role")).toBe("alertdialog");
    expect(Array.from(confirmView.querySelectorAll("button")).map((b) => b.textContent.trim())).toEqual(["Cancelar", "Cerrar mesa"]);
    unmount(container, root);
  });

  test("Cancelar returns to Mesa detail without any request", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: emptySession }) });
    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Cerrar mesa"));
    await flush();

    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Cancelar"));
    await flush();

    expect(container.querySelector('[data-testid="mesa-card-view-close-confirm"]')).toBeNull();
    expect(container.querySelector('[data-testid="mesa-card-comandas"]')).not.toBeNull();
    expect(mesaApi.closeTable).not.toHaveBeenCalled();
    expect(mesaApi.releaseEmptyTable).not.toHaveBeenCalled();
    unmount(container, root);
  });

  test("the ← Mesa N back control also returns to Mesa detail from the close confirmation", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: emptySession, number: 5 }) });
    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Cerrar mesa"));
    await flush();

    const back = container.querySelector('[data-testid="mesa-card-back"]');
    expect(back.textContent).toContain("Mesa 5");
    click(back);
    await flush();

    expect(container.querySelector('[data-testid="mesa-card-view-close-confirm"]')).toBeNull();
    expect(container.querySelector('[data-testid="mesa-card-comandas"]')).not.toBeNull();
    unmount(container, root);
  });
});

describe("MesaWorkspace compactCard -- outer × vs internal back", () => {
  test("outer × closes the whole workspace from the account view, not just back to detail", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: withOrdersSession }) });
    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Ver cuenta"));
    await flush();
    expect(container.querySelector('[data-testid="mesa-card-view-account"]')).not.toBeNull();

    click(container.querySelector(".mesa-close"));
    await flush();
    expect(container.querySelector(".mesa-table-card-overlay")).toBeNull();
    unmount(container, root);
  });

  test("outer × closes the whole workspace from the Cerrar-mesa confirmation view", async () => {
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: emptySession }) });
    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Cerrar mesa"));
    await flush();
    expect(container.querySelector('[data-testid="mesa-card-view-close-confirm"]')).not.toBeNull();

    click(container.querySelector(".mesa-close"));
    await flush();
    expect(container.querySelector(".mesa-table-card-overlay")).toBeNull();
    unmount(container, root);
  });
});

describe("MesaWorkspace compactCard -- table-local state isolation (key={table.id})", () => {
  test("switching directly from one open table to another resets local error and subview state", async () => {
    mesaApi.closeTable.mockRejectedValueOnce({ code: "MESA_TABLE_HAS_ACTIVE_ORDERS" });
    const tableA = tableFixture({ id: "t1", number: 5, status: "open", session: withOrdersSession });
    const tableB = tableFixture({ id: "t2", number: 6, x: 60, y: 60, status: "open", session: emptySession });
    mesaApi.floor.mockResolvedValue({ ok: true, tables: [tableA, tableB] });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<TabMesa role="admin" notify={jest.fn()} onNewCommand={jest.fn()} onCountChange={jest.fn()}
        compact={true} mesaDrafts={{}} onClearDraft={jest.fn()} onSendToCocina={jest.fn()} />);
    });
    await flush();

    const byNumber = (n) => Array.from(container.querySelectorAll(".mesa-table")).find((b) => b.querySelector(".mesa-number")?.textContent === String(n));

    click(byNumber(5));
    await flush();
    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Cerrar mesa"));
    await flush();
    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Cerrar mesa"));
    await flush();

    // Table 5 now shows a real, backend-mapped error, still on the close-confirm view.
    expect(container.textContent).toContain("MESA_TABLE_HAS_ACTIVE_ORDERS");
    expect(container.querySelector('[data-testid="mesa-card-view-close-confirm"]')).not.toBeNull();

    // Switch straight to table 6's workspace without closing table 5's first --
    // exactly the path that leaked state before key={table.id}.
    click(byNumber(6));
    await flush();

    expect(container.textContent).not.toContain("MESA_TABLE_HAS_ACTIVE_ORDERS");
    expect(container.querySelector('[data-testid="mesa-card-view-close-confirm"]')).toBeNull();
    expect(container.querySelector('[data-testid="mesa-card-comandas"]')).not.toBeNull();
    expect(container.querySelector(".mesa-table-card-head").textContent).toContain("Mesa 6");
    unmount(container, root);
  });
});

describe("MesaWorkspace compactCard -- business behavior unchanged under in-place navigation", () => {
  test("Ver cuenta in-place still drives the real payment flow (Cobrar todo -> mesaApi.pay)", async () => {
    mesaApi.pay.mockResolvedValue({ amount: 24.5, outstandingAfter: 0 });
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: withOrdersSession }) });

    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Ver cuenta"));
    await flush();
    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Cobrar todo"));
    await flush();
    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Confirmar cobro"));
    await flush();

    expect(mesaApi.pay).toHaveBeenCalledWith("s1", expect.objectContaining({ mode: "full", coversSettled: 2 }));
    unmount(container, root);
  });

  test("Cerrar mesa in-place still enforces the real backend blocker on a rejected close -- table stays open", async () => {
    mesaApi.closeTable.mockRejectedValueOnce({ code: "MESA_TABLE_HAS_ACTIVE_ORDERS" });
    const { container, root } = await mount({ compact: true, table: tableFixture({ status: "open", session: withOrdersSession }) });

    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Cerrar mesa"));
    await flush();
    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "Cerrar mesa"));
    await flush();

    expect(mesaApi.closeTable).toHaveBeenCalledWith("s1");
    expect(container.querySelector('[data-testid="mesa-card-view-close-confirm"]')).not.toBeNull();
    expect(container.textContent).toContain("MESA_TABLE_HAS_ACTIVE_ORDERS");
    unmount(container, root);
  });
});

// CANONICAL_ORDER_LINE_SLICE_1 -- the compact-card draft panel (phone shell)
// had no test coverage of its own item-detail rendering at all (every test
// above mounts with mesaDrafts={{}}); TabMesa.render.test.js's "Comanda por
// confirmar" describe block covers only the non-compact Modal branch. Both
// branches used to hand-roll the identical, independently-broken-for-custom-
// items interpretation (see DraftItemsList in TabMesa.jsx) -- this closes
// the gap for the compact branch specifically.
describe("MesaWorkspace compactCard -- draft panel item detail (Comanda por confirmar)", () => {
  const draftWithDetail = {
    items: [{
      id: 1, n: "El Pelusa", q: 1, cat: "Pizzas", p: 12.5,
      classicName: "Margherita Classica", fantasyName: "El Pelusa", baseUnitPrice: 12.0,
      extras: [{ key: "ing_jamon", name: "Jamón cocido", price: 0.5, emoji: "🍖", quantity: 1 }],
      notes: "poco hecha", removedIngredients: ["Albahaca"],
    }],
    nota: "mesa junto a la ventana", coversTotal: 2, client_req_id: "draft-req-compact",
  };

  test("expanding the compact draft panel shows dual name, extras, removed ingredient and note", async () => {
    const { container, root } = await mount({
      compact: true, table: tableFixture({ status: "open", session: emptySession }),
      mesaDrafts: { s1: draftWithDetail },
    });
    click(byTestId(container, "mesa-draft-toggle"));
    await flush();
    expect(container.textContent).toContain("El Pelusa");
    expect(container.textContent).toContain("Margherita Classica");
    expect(container.textContent).toContain("Jamón cocido");
    expect(container.textContent).toContain("Sin: Albahaca");
    expect(container.textContent).toContain("Nota: poco hecha");
    unmount(container, root);
  });

  // HARD ACCEPTANCE DEFECT A, compact branch.
  test("a custom pizza's selected ingredients remain visible in the compact draft panel", async () => {
    const customDraft = {
      items: [{
        id: "custom_1723622400000", n: "Pizza a tu gusto",
        sub: "Base Pelusa + Tomates confitados, Rúcula", e: "⭐", p: 14, q: 1, cat: "Pizzas",
        _ingredienti: [
          { id: "i_tom", n: "Tomates confitados", e: "🍅", prezzo: 1 },
          { id: "i_ruc", n: "Rúcula", e: "🌿", prezzo: 1 },
        ],
        ing: "Base Pelusa + Tomates confitados, Rúcula",
      }],
      nota: "", coversTotal: 2, client_req_id: "draft-req-compact-custom",
    };
    const { container, root } = await mount({
      compact: true, table: tableFixture({ status: "open", session: emptySession }),
      mesaDrafts: { s1: customDraft },
    });
    click(byTestId(container, "mesa-draft-toggle"));
    await flush();
    expect(container.textContent).toContain("Pizza a tu gusto");
    expect(container.textContent).toContain("Tomates confitados");
    expect(container.textContent).toContain("Rúcula");
    unmount(container, root);
  });
});
