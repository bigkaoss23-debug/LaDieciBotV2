import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../mesa/mesaApi", () => ({
  __esModule: true,
  createMesaRequestId: jest.fn(() => "mesa_test_request"),
}));

const MesaOrderBuilder = require("./MesaOrderBuilder").default;
const { createMesaRequestId } = require("../../mesa/mesaApi");

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}
function typeInto(input, value) {
  const proto = input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  act(() => {
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
function setWidth(px) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: px });
  act(() => { window.dispatchEvent(new Event("resize")); });
}
function byTestId(container, id) { return container.querySelector(`[data-testid="${id}"]`); }
function allByTestId(container, id) { return Array.from(container.querySelectorAll(`[data-testid="${id}"]`)); }
// Case-insensitive: non-pizza cards now render their primary name in
// UPPERCASE (Fase 9 -- presentation only), so a lookup by the menu's own
// mixed-case name must not depend on DOM casing.
function productCard(container, name) {
  return allByTestId(container, "catalog-product-card").find((el) => el.textContent.toLowerCase().includes(name.toLowerCase()));
}
function buttonByText(container, text) {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent.trim().startsWith(text));
}

const target = (overrides = {}) => ({
  sessionId: "session-1", tableNumber: 3, tableName: "Mesa 3", coversTotal: null, ...overrides,
});

async function mount(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onClose = props.onClose || jest.fn();
  const onConfirm = props.onConfirm || jest.fn();
  await act(async () => {
    root.render(<MesaOrderBuilder target={props.target || target()} draft={props.draft || null} onClose={onClose} onConfirm={onConfirm} />);
  });
  await flush();
  return { container, root, onClose, onConfirm };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

beforeEach(() => {
  jest.clearAllMocks();
  createMesaRequestId.mockReturnValue("mesa_test_request");
  setWidth(1280);
});

// 1. first comanda with covers null -- shows the covers picker
test("covers null shows the compact covers step first", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: null }) });
  expect(container.textContent).toContain("¿Cuántos comensales?");
  expect(byTestId(container, "covers-quick-4")).toBeTruthy();
  unmount(container, root);
});

// MESA_PHONE_POLISH_01 -- the covers quick-grid is now capacity-aware
// (table.capacity threaded through ServicioPage -> mesaCommandTarget ->
// this component's target prop) instead of always showing a fixed 1-8
// grid, so a 4-seat table proposes exactly 1-4. Audited against the
// backend's addCommand, which only bounds covers to 1-99 with no capacity
// cap -- a party genuinely exceeding the table's nominal seating is still
// valid, so the custom input must keep accepting it.
test("capacity=4 shows quick options 1-4 only, not the old fixed 1-8 grid", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: null, capacity: 4 }) });
  [1, 2, 3, 4].forEach((n) => expect(byTestId(container, `covers-quick-${n}`)).toBeTruthy());
  [5, 6, 7, 8].forEach((n) => expect(byTestId(container, `covers-quick-${n}`)).toBeNull());
  expect(byTestId(container, "covers-custom-input").placeholder).toBe("Otro número (5-99)");
  unmount(container, root);
});

test("missing capacity falls back to the original 1-8 quick grid -- unchanged old behavior", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: null }) });
  for (let n = 1; n <= 8; n++) expect(byTestId(container, `covers-quick-${n}`)).toBeTruthy();
  expect(byTestId(container, "covers-custom-input").placeholder).toBe("Otro número (9-99)");
  unmount(container, root);
});

test("a large table's quick grid is capped at 8, not one button per seat", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: null, capacity: 12 }) });
  expect(byTestId(container, "covers-quick-8")).toBeTruthy();
  expect(byTestId(container, "covers-quick-9")).toBeNull();
  unmount(container, root);
});

test("a party larger than the table's capacity is still a valid custom entry, not blocked", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: null, capacity: 2 }) });
  typeInto(byTestId(container, "covers-custom-input"), "5");
  click(byTestId(container, "covers-custom-confirm"));
  await flush();
  expect(container.textContent).not.toContain("¿Cuántos comensales?");
  // GOAL 1 -- header hierarchy split "Nueva comanda" (small eyebrow) from
  // "Mesa N" (dominant), no longer one literal em-dash string.
  expect(container.textContent).toContain("Nueva comanda");
  expect(container.textContent).toContain("Mesa 3");
  unmount(container, root);
});

// 2. picking covers -- opens the picker immediately
test("picking covers opens the picker workspace immediately, no intermediate screen", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: null }) });
  click(byTestId(container, "covers-quick-4"));
  await flush();
  expect(container.textContent).not.toContain("¿Cuántos comensales?");
  // GOAL 1 -- header hierarchy split "Nueva comanda" (small eyebrow) from
  // "Mesa N" (dominant), no longer one literal em-dash string.
  expect(container.textContent).toContain("Nueva comanda");
  expect(container.textContent).toContain("Mesa 3");
  expect(container.textContent).toContain("Pizzas");
  unmount(container, root);
});

// 3. Cancelar on the covers step -- no draft produced
test("Cancelar on the covers step aborts without ever calling onConfirm", async () => {
  const { container, root, onClose, onConfirm } = await mount({ target: target({ coversTotal: null }) });
  click(buttonByText(container, "Cancelar"));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
  unmount(container, root);
});

// 4. covers are never persisted separately -- picking them alone never calls onConfirm
test("choosing covers alone never calls onConfirm -- it's only bundled at Confirmar comanda", async () => {
  const { container, root, onConfirm } = await mount({ target: target({ coversTotal: null }) });
  click(byTestId(container, "covers-quick-4"));
  await flush();
  expect(onConfirm).not.toHaveBeenCalled();
  unmount(container, root);
});

// 5. Confirmar comanda bundles the freshly chosen coversTotal with items, no network call
test("Confirmar comanda bundles the freshly chosen coversTotal atomically with items, calling onConfirm locally (no network)", async () => {
  const { container, root, onConfirm } = await mount({ target: target({ coversTotal: null }) });
  click(byTestId(container, "covers-quick-4"));
  await flush();
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "draft-summary-primary-action"));
  await flush();
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onConfirm.mock.calls[0][0].coversTotal).toBe(4);
  expect(onConfirm.mock.calls[0][0].client_req_id).toBe("mesa_test_request");
  unmount(container, root);
});

// 6. when covers are already known, the builder opens straight to the picker
test("when covers are already known, the builder opens straight to the picker", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 4 }) });
  expect(container.textContent).not.toContain("¿Cuántos comensales?");
  // GOAL 1 -- header hierarchy split "Nueva comanda" (small eyebrow) from
  // "Mesa N" (dominant), no longer one literal em-dash string.
  expect(container.textContent).toContain("Nueva comanda");
  expect(container.textContent).toContain("Mesa 3");
  unmount(container, root);
});

// 7. cart survives opening/closing the sub-picker (extras panel + category switch)
test("cart survives opening/closing the extras sub-panel and switching categories", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "draft-summary-edit"));
  await flush();
  expect(container.textContent).toContain("Ingredientes extra");
  click(buttonByText(container, "Listo"));
  await flush();
  expect(container.textContent).toContain("1 artículo");
  click(buttonByText(container, "Bebidas"));
  await flush();
  click(buttonByText(container, "Pizzas"));
  await flush();
  expect(productCard(container, "El Pelusa").textContent).toContain("1");
  unmount(container, root);
});

// 8. adding items from multiple categories
test("items from multiple categories accumulate in the same persistent cart", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(buttonByText(container, "Bebidas"));
  await flush();
  click(productCard(container, "Estrella Galicia"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  expect(allByTestId(container, "draft-summary-line").length).toBe(2);
  unmount(container, root);
});

// 9. quantity
// CANONICAL_MANUAL_PICKER_FINAL_CORRECTION -- Goal 5 reverses the old "every
// tap is its own line" rule: two bare taps on the same product now merge by
// signature into ONE line at qty 2 (was 2 separate qty-1 lines -- exactly
// the "Marinara ×2 shows as two identical rows" defect human UAT flagged).
test("tapping a product again merges into the same line (qty 2, not two lines); drawer +/- also works", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  click(productCard(container, "El Pelusa"));
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  expect(allByTestId(container, "draft-summary-line").length).toBe(1);
  expect(container.textContent).toContain("2 artículos");
  click(byTestId(container, "draft-summary-plus"));
  await flush();
  expect(container.textContent).toContain("3 artículos");
  unmount(container, root);
});

// 10. extras and removed ingredients
test("extras and removed-ingredient toggles reach the confirmed draft", async () => {
  const onConfirm = jest.fn();
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onConfirm });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "draft-summary-edit"));
  await flush();
  click(allByTestId(container, "configurator-extra-chip")[0]);
  await flush();
  click(allByTestId(container, "remove-ingredient-chip")[0]);
  await flush();
  click(buttonByText(container, "Listo"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "draft-summary-primary-action"));
  await flush();
  const submitted = onConfirm.mock.calls[0][0].items[0];
  expect(submitted.extras.length).toBe(1);
  expect(submitted.removedIngredients.length).toBe(1);
  unmount(container, root);
});

// 11. per-line note on a non-pizza item
test("a per-line note on a non-pizza item reaches the confirmed item", async () => {
  const onConfirm = jest.fn();
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onConfirm });
  click(buttonByText(container, "Bebidas"));
  await flush();
  click(productCard(container, "Estrella Galicia"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  typeInto(byTestId(container, "draft-summary-plain-note"), "bien fría");
  click(byTestId(container, "draft-summary-primary-action"));
  await flush();
  expect(onConfirm.mock.calls[0][0].items[0].notes).toBe("bien fría");
  unmount(container, root);
});

// 12. general note
test("the general note reaches onConfirm as `nota`", async () => {
  const onConfirm = jest.fn();
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onConfirm });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  typeInto(byTestId(container, "draft-summary-general-note"), "mesa junto a la ventana");
  click(byTestId(container, "draft-summary-primary-action"));
  await flush();
  expect(onConfirm.mock.calls[0][0].nota).toBe("mesa junto a la ventana");
  unmount(container, root);
});

// 13. both product names and ID preserved
test("confirmed item preserves product id, classic name and fantasy name -- no silent remap", async () => {
  const onConfirm = jest.fn();
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onConfirm });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "draft-summary-primary-action"));
  await flush();
  const item = onConfirm.mock.calls[0][0].items[0];
  expect(item.id).toBe(1);
  expect(item.fantasyName).toBe("El Pelusa");
  expect(item.classicName).toBe("Margherita Classica");
  expect(item.baseUnitPrice).toBe(12.0);
  unmount(container, root);
});

// 14. edit a line
test("editing a line via the pencil updates that same line, not a duplicate", async () => {
  const onConfirm = jest.fn();
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onConfirm });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "draft-summary-edit"));
  await flush();
  click(allByTestId(container, "configurator-extra-chip")[0]);
  await flush();
  click(buttonByText(container, "Listo"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  expect(allByTestId(container, "draft-summary-line").length).toBe(1);
  click(byTestId(container, "draft-summary-primary-action"));
  await flush();
  expect(onConfirm.mock.calls[0][0].items.length).toBe(1);
  expect(onConfirm.mock.calls[0][0].items[0].extras.length).toBe(1);
  unmount(container, root);
});

// 15. remove a line
test("removing a line via the trash button drops it from the cart and the confirmed draft", async () => {
  const onConfirm = jest.fn();
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onConfirm });
  click(productCard(container, "El Pelusa"));
  click(buttonByText(container, "Bebidas"));
  await flush();
  click(productCard(container, "Estrella Galicia"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  expect(allByTestId(container, "draft-summary-line").length).toBe(2);
  click(byTestId(container, "draft-summary-remove"));
  await flush();
  expect(allByTestId(container, "draft-summary-line").length).toBe(1);
  click(byTestId(container, "draft-summary-primary-action"));
  await flush();
  expect(onConfirm.mock.calls[0][0].items.length).toBe(1);
  unmount(container, root);
});

// 16. correct total
test("total shown in the sticky bar matches the sum of line subtotals", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  click(productCard(container, "El Pelusa")); // 12.0
  await flush();
  click(buttonByText(container, "Bebidas"));
  await flush();
  click(productCard(container, "Estrella Galicia")); // 3.0
  await flush();
  expect(container.textContent).toContain("15.00€");
  unmount(container, root);
});

// 17. correct sticky bar
test("the sticky bar shows item count, total and a Ver comanda action, disabled while empty", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  expect(byTestId(container, "mesa-ver-comanda").disabled).toBe(true);
  click(productCard(container, "El Pelusa"));
  await flush();
  expect(container.textContent).toContain("1 artículo");
  expect(byTestId(container, "mesa-ver-comanda").disabled).toBe(false);
  unmount(container, root);
});

// 18. Confirmar comanda only once
test("Confirmar comanda calls onConfirm exactly once", async () => {
  const onConfirm = jest.fn();
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onConfirm });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "draft-summary-primary-action"));
  await flush();
  expect(onConfirm).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

// 19. no delivery/customer/planner surface
test("no delivery/customer/planner surface leaks into the Mesa builder", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  const text = container.textContent;
  for (const banned of ["Teléfono", "Dirección", "Planner", "Retirar a las", "Comanda separada para cocina", "Método de pago"]) {
    expect(text).not.toContain(banned);
  }
  unmount(container, root);
});

// 20/21. Modificar -- reopening with an existing draft
test("reopening with an existing draft (Modificar) reseeds cart, covers, general note and reuses the same client_req_id", async () => {
  createMesaRequestId.mockReturnValue("should-not-be-used");
  const draft = {
    items: [{
      id: 1, n: "El Pelusa", sub: "", q: 2, cat: "Pizzas", p: 12.5,
      classicName: "Margherita Classica", fantasyName: "El Pelusa", baseUnitPrice: 12.0,
      extras: [{ key: "ing_jamon", name: "Jamón cocido", price: 0.5, emoji: "🍖", quantity: 1 }],
      notes: "poco hecha", removedIngredients: ["Albahaca"],
    }],
    nota: "mesa junto a la ventana", coversTotal: 4, client_req_id: "existing-draft-id",
  };
  const { container, root, onConfirm } = await mount({ target: target({ coversTotal: null }), draft });
  // No covers prompt -- reseeded straight from the draft, not the target.
  expect(container.textContent).not.toContain("¿Cuántos comensales?");
  expect(container.textContent).toContain("4 comensales");
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  expect(allByTestId(container, "draft-summary-line").length).toBe(1);
  expect(byTestId(container, "draft-summary-general-note").value).toBe("mesa junto a la ventana");
  click(byTestId(container, "draft-summary-primary-action"));
  await flush();
  const resubmitted = onConfirm.mock.calls[0][0];
  expect(resubmitted.client_req_id).toBe("existing-draft-id");
  expect(resubmitted.items[0].extras.length).toBe(1);
  expect(resubmitted.items[0].extras[0].name).toBe("Jamón cocido");
  expect(resubmitted.items[0].removedIngredients).toEqual(["Albahaca"]);
  expect(resubmitted.items[0].notes).toBe("poco hecha");
  unmount(container, root);
});

test("Modificar preserves quantity and lets the operator change it before re-confirming", async () => {
  const draft = {
    items: [{
      id: 1, n: "El Pelusa", sub: "", q: 2, cat: "Pizzas", p: 12.0,
      classicName: "Margherita Classica", fantasyName: "El Pelusa", baseUnitPrice: 12.0,
      extras: [], notes: "", removedIngredients: [],
    }],
    nota: "", coversTotal: 2, client_req_id: "existing-draft-id-2",
  };
  const onConfirm = jest.fn();
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), draft, onConfirm });
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  const line = byTestId(container, "draft-summary-line");
  expect(line.textContent).toContain("2");
  click(byTestId(container, "draft-summary-plus"));
  await flush();
  click(byTestId(container, "draft-summary-primary-action"));
  await flush();
  expect(onConfirm.mock.calls[0][0].items[0].q).toBe(3);
  unmount(container, root);
});

// 25/26. responsive
test("on a phone-width viewport the picker panel goes full screen (no user-agent sniffing)", async () => {
  setWidth(375);
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  const dialog = container.querySelector('[aria-label^="Nueva comanda"]');
  expect(dialog.getAttribute("style")).toContain("border-radius: 0;");
  unmount(container, root);
});
test("on a tablet/desktop-width viewport the picker panel keeps its rounded floating layout", async () => {
  setWidth(1024);
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  const dialog = container.querySelector('[aria-label^="Nueva comanda"]');
  expect(dialog.getAttribute("style")).toContain("border-radius: 20px");
  unmount(container, root);
});

// 31/32/33. responsive product grid -- real CSS breakpoints (jsdom doesn't
// compute layout from media queries, so this asserts the rules themselves
// exist with the right column counts, not a runtime grid measurement).
test("the product grid uses real CSS breakpoints for 2/3/4 columns -- no user-agent sniffing, no JS width branching for layout", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  const css = Array.from(container.querySelectorAll("style")).map((el) => el.textContent).join("\n");
  expect(css).toMatch(/\.catalog-browser-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*1fr\)/);
  expect(css).toMatch(/@media \(max-width:\s*359px\)[^{]*\{[^}]*\.catalog-browser-grid[^}]*grid-template-columns:\s*1fr/);
  expect(css).toMatch(/@media \(min-width:\s*768px\)[^{]*\{[^}]*\.catalog-browser-grid[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/);
  expect(css).toMatch(/@media \(min-width:\s*1024px\)[^{]*\{[^}]*\.catalog-browser-grid[^}]*grid-template-columns:\s*repeat\(4,\s*1fr\)/);
  unmount(container, root);
});

// 36. no decorative emoji on the product card -- name/subname/price only.
test("product cards show no decorative icon -- just primary name, secondary name and price", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  const card = productCard(container, "El Pelusa");
  expect(card.textContent).toContain("El Pelusa");
  expect(card.textContent.toUpperCase()).toContain("MARGHERITA CLASSICA");
  expect(card.textContent).toContain("12.00€");
  // The static menu's own emoji field (🍕 for El Pelusa) must not appear on the card.
  expect(card.textContent).not.toContain("🍕");
  unmount(container, root);
});

// 27. accessibility
test("the picker step exposes a labelled dialog role", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  const dialog = container.querySelector('[role="dialog"]');
  expect(dialog).toBeTruthy();
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  unmount(container, root);
});
// Editing a line from the comanda summary is a round trip, not a departure:
// the operator is proof-reading the order, taps the pencil on one line, and
// has to come back to the list they were reading. The drawer therefore stays
// mounted UNDER the configurator (which already stacks above it), so closing
// the configurator reveals the summary again. Previously the drawer was closed
// on the way in, and every edit dropped the operator onto the raw product grid
// with their review context gone.
test("editing a line from the summary returns to the summary, not the product grid", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "draft-summary-edit"));
  await flush();
  // the summary is still there, underneath the configurator
  expect(byTestId(container, "item-configurator")).toBeTruthy();
  expect(byTestId(container, "draft-summary")).toBeTruthy();
  // ...and closing the configurator leaves the operator on it
  click(byTestId(container, "configurator-done"));
  await flush();
  expect(byTestId(container, "item-configurator")).toBeFalsy();
  expect(byTestId(container, "draft-summary")).toBeTruthy();
  unmount(container, root);
});

// The test name always described three layers; the body only pressed Escape
// twice because the old edit flow had already thrown the drawer away. Now the
// body matches the name.
test("Escape closes the extras panel first, then the drawer, then the whole builder", async () => {
  const { container, root, onClose } = await mount({ target: target({ coversTotal: 2 }) });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "draft-summary-edit"));
  await flush();
  expect(container.textContent).toContain("Ingredientes extra");

  // 1st: the configurator only
  act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  await flush();
  expect(container.textContent).not.toContain("Ingredientes extra");
  expect(byTestId(container, "draft-summary")).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();

  // 2nd: the drawer, which is genuinely still open now
  act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  await flush();
  expect(byTestId(container, "draft-summary")).toBeFalsy();
  expect(onClose).not.toHaveBeenCalled();

  // 3rd: the builder itself -- GOAL 10, the draft is non-empty (El Pelusa is
  // still in the cart), so this must show the destructive confirmation
  // instead of discarding straight away.
  act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  await flush();
  expect(onClose).not.toHaveBeenCalled();
  expect(byTestId(container, "confirm-discard-dialog")).toBeTruthy();

  // Escape again dismisses just the confirmation (draft still untouched).
  act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  await flush();
  expect(byTestId(container, "confirm-discard-dialog")).toBeFalsy();
  expect(onClose).not.toHaveBeenCalled();

  // Eliminar is the one explicit path that actually discards.
  click(byTestId(container, "mesa-picker-close"));
  await flush();
  click(byTestId(container, "confirm-discard-eliminar"));
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

// 28. Ver comanda drawer must show removed ingredients too -- they already
// exist on the working cart item (isRemoved/toggleRemoved) and already show
// correctly in MesaWorkspace's draft panel; the drawer was silently omitting
// them. Also covers the required per-line format: dual name, "+ extras",
// "Sin: ..." and "Nota: ...".
test("Ver comanda drawer shows dual name, extras, removed ingredients and note for a fresh line", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "draft-summary-edit"));
  await flush();
  // First salted extra chip (prezzo > 0, filtered before the base/free
  // ingredients) is "Albahaca fresca"; first "Quitar ingredientes" chip
  // (El Pelusa's own base) is "Tomate San Marzano" -- both from the real
  // static menu/ingredient list, not invented.
  click(allByTestId(container, "configurator-extra-chip")[0]);
  await flush();
  click(allByTestId(container, "remove-ingredient-chip")[0]);
  await flush();
  const notaInput = container.querySelector('input[placeholder^="Nota cocina"]');
  typeInto(notaInput, "poco hecha");
  click(buttonByText(container, "Listo"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  const line = byTestId(container, "draft-summary-line");
  expect(line.textContent).toContain("El Pelusa / Margherita Classica");
  expect(line.textContent).toContain("+ Albahaca fresca");
  const removedLine = byTestId(container, "order-line-removed");
  expect(removedLine).toBeTruthy();
  expect(removedLine.textContent).toBe("Sin: Tomate San Marzano");
  expect(line.textContent).toContain("Nota: poco hecha");
  unmount(container, root);
});

// 29. the same bug, reproduced from a reopened draft (Modificar path) -- the
// exact scenario reported: removed ingredients exist in the draft and show
// correctly in MesaWorkspace, but must ALSO show here once reseeded.
test("Ver comanda drawer shows removed ingredients for a line reseeded from an existing draft", async () => {
  const draft = {
    items: [{
      id: 1, n: "El Pelusa", sub: "", q: 1, cat: "Pizzas", p: 12.0,
      classicName: "Margherita Classica", fantasyName: "El Pelusa", baseUnitPrice: 12.0,
      extras: [], notes: "", removedIngredients: ["Albahaca", "Fior di latte"],
    }],
    nota: "", coversTotal: 2, client_req_id: "draft-req-99",
  };
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), draft });
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  const removedLine = byTestId(container, "order-line-removed");
  expect(removedLine).toBeTruthy();
  expect(removedLine.textContent).toBe("Sin: Albahaca, Fior di latte");
  unmount(container, root);
});

// 30. pizza-number badge -- discreet, bottom-left, using the authoritative
// menu number verbatim; absent for products that have none.
test("pizza cards show a small badge with the authoritative pizza number; non-pizza cards show none", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  const pizzaCard = productCard(container, "El Pelusa");
  const badge = pizzaCard.querySelector('[data-testid="catalog-pizza-number-badge"]');
  expect(badge).toBeTruthy();
  expect(badge.textContent).toBe("1");
  click(buttonByText(container, "Bebidas"));
  await flush();
  const drinkCard = productCard(container, "Estrella Galicia");
  expect(drinkCard.querySelector('[data-testid="catalog-pizza-number-badge"]')).toBeNull();
  unmount(container, root);
});

// 31. Postres/Bebidas cards use the same strong uppercase hierarchy as pizza
// cards for the main name -- presentation only, no data mutation.
test("non-pizza cards render the main name in uppercase, secondary value unchanged", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  click(buttonByText(container, "Postres"));
  await flush();
  const card = productCard(container, "Misu Clásico");
  expect(card.textContent).toContain("MISU CLÁSICO");
  expect(card.textContent).toContain("Tiramisú");
  unmount(container, root);
});

// ── GOAL 10 -- main picker ✕ destructive confirmation (direct coverage,
// independent of the Escape-key scenario above) ────────────────────────────
test("main picker ✕ with an EMPTY draft closes directly -- no confirmation", async () => {
  const { container, root, onClose } = await mount({ target: target({ coversTotal: 2 }) });
  click(byTestId(container, "mesa-picker-close"));
  await flush();
  expect(byTestId(container, "confirm-discard-dialog")).toBeFalsy();
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

test("main picker ✕ with a NON-EMPTY draft shows the confirmation; Cancelar leaves the draft untouched", async () => {
  const { container, root, onClose } = await mount({ target: target({ coversTotal: 2 }) });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-picker-close"));
  await flush();
  expect(onClose).not.toHaveBeenCalled();
  expect(byTestId(container, "confirm-discard-dialog")).toBeTruthy();
  click(byTestId(container, "confirm-discard-cancel"));
  await flush();
  expect(byTestId(container, "confirm-discard-dialog")).toBeFalsy();
  expect(onClose).not.toHaveBeenCalled();
  // The operator is exactly where they were -- the cart is still there.
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  expect(byTestId(container, "draft-summary-line")).toBeTruthy();
  unmount(container, root);
});

test("tapping the backdrop with a non-empty draft is gated the same way as the ✕", async () => {
  const { container, root, onClose } = await mount({ target: target({ coversTotal: 2 }) });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(container.firstElementChild); // the fixed backdrop overlay div
  await flush();
  expect(onClose).not.toHaveBeenCalled();
  expect(byTestId(container, "confirm-discard-dialog")).toBeTruthy();
  unmount(container, root);
});

// ── NESTED CLOSE -- cart-sheet ✕ and configurator ✕ never discard, even
// with a non-empty draft (their own ownership, unaffected by Goal 10) ──────
test("cart-sheet ✕ only closes the sheet, never the draft, even when non-empty", async () => {
  const { container, root, onClose } = await mount({ target: target({ coversTotal: 2 }) });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "draft-summary-close"));
  await flush();
  expect(onClose).not.toHaveBeenCalled();
  expect(byTestId(container, "confirm-discard-dialog")).toBeFalsy();
  expect(byTestId(container, "draft-summary")).toBeFalsy();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  expect(byTestId(container, "draft-summary-line")).toBeTruthy();
  unmount(container, root);
});

// ── GOAL 4 -- quick decrement straight from the catalogue card, end-to-end
// through the real shell (not just the cartApi unit test) ─────────────────
test("catalogue card quick decrement: 0->1->2 via tap, then 2->1->0 via the card's own minus, no cart trip needed", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  const card = productCard(container, "El Pelusa");
  click(card);
  await flush();
  click(card);
  await flush();
  expect(byTestId(card, "catalog-qty-badge").textContent).toBe("2");
  expect(container.textContent).toContain("2 artículos");

  const minus = byTestId(card, "catalog-decrement");
  click(minus);
  await flush();
  expect(byTestId(card, "catalog-qty-badge").textContent).toBe("1");
  expect(container.textContent).toContain("1 artículo");

  click(minus);
  await flush();
  expect(byTestId(card, "catalog-qty-badge")).toBeNull();
  expect(byTestId(card, "catalog-decrement")).toBeNull();
  expect(container.textContent).toContain("Selecciona productos");
  unmount(container, root);
});

// ── GOAL 14 -- adding a configured Custom pizza opens the cart automatically ──
test("adding a Custom pizza opens the cart automatically, with the configured pizza already in it", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  click(buttonByText(container, "⭐ Custom"));
  await flush();
  click(allByTestId(container, "custom-ingredient-chip")[0]);
  await flush();
  click(byTestId(container, "custom-add-cta"));
  await flush();
  expect(byTestId(container, "draft-summary")).toBeTruthy();
  expect(byTestId(container, "draft-summary-line").textContent).toContain("Pizza a tu gusto");
  unmount(container, root);
});
