import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

const { useOrderCart, isCustomRawItem } = require("../../order/useOrderCart");
const DraftSummary = require("./DraftSummary").default;

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}
function byTestId(container, id) { return container.querySelector(`[data-testid="${id}"]`); }
function allByTestId(container, id) { return Array.from(container.querySelectorAll(`[data-testid="${id}"]`)); }

const INGREDIENTI = [{ id: "ing-a", n: "Fixture Basil", e: "🌿", prezzo: 0.6, tipo: "normal", gruppo: "g1" }];
const PIZZA = { id: "fx-p", n: "Fixture Pie", sub: "Fixture Classic", p: 10, cat: "Pizzas", ingredientesBase: ["Fixture Onion"] };
const DRINK = { id: "fx-d", n: "Fixture Cola", sub: "33cl", p: 3, cat: "Bebidas" };

function Harness({ seed, ...rest }) {
  const cartApi = useOrderCart({ MENU: [PIZZA, DRINK], INGREDIENTI });
  const seededRef = React.useRef(false);
  if (!seededRef.current) { seededRef.current = true; seed(cartApi); }
  return (
    <DraftSummary
      title="Comanda"
      cartItems={cartApi.cartItems}
      totalCart={cartApi.totalCart}
      totalQty={cartApi.totalQty}
      onSetQty={cartApi.setQty}
      onRemoveLine={cartApi.removeLine}
      onEditLine={rest.onEditLine || (() => {})}
      onSetPlainNote={cartApi.setNota}
      generalNote={rest.generalNote || ""}
      onSetGeneralNote={rest.onSetGeneralNote || (() => {})}
      onClose={rest.onClose || (() => {})}
      primaryAction={rest.primaryAction || { label: "Confirmar", onClick: () => {}, disabled: false }}
    />
  );
}

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<Harness {...props} />); });
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

test("a plain pizza line shows product name and price", () => {
  const { container, root } = mount({ seed: (cart) => cart.increment(PIZZA) });
  expect(container.textContent).toContain("Fixture Pie");
  expect(container.textContent).toContain("10.00€");
  unmount(container, root);
});

test("extras, removed ingredients and notes all render via the canonical OrderLineView -- same truth as the migrated draft panels", () => {
  const { container, root } = mount({
    seed: (cart) => {
      const uid = cart.increment(PIZZA);
      cart.addExtra(uid, INGREDIENTI[0]);
      cart.toggleRemoved(uid, "Fixture Onion");
      cart.setNotaLibera(uid, "cortar en 4");
    },
  });
  expect(byTestId(container, "draft-summary-line").textContent).toContain("Fixture Basil");
  expect(container.textContent).toContain("Sin: Fixture Onion");
  expect(container.textContent).toContain("Nota: cortar en 4");
  unmount(container, root);
});

test("custom pizza ingredients render here too -- not collapsed to just the generic name", () => {
  const { container, root } = mount({
    seed: (cart) => cart.addRaw({
      id: "custom_1", n: "Pizza a tu gusto", sub: "Base Fixture + Fixture Basil", p: 12, q: 1, cat: "Pizzas",
      _ingredienti: [{ id: "ing-a", n: "Fixture Basil", e: "🌿", prezzo: 0.6 }],
    }),
  });
  expect(container.textContent).toContain("Pizza a tu gusto");
  expect(container.textContent).toContain("Fixture Basil");
  unmount(container, root);
});

test("total reflects all lines", () => {
  const { container, root } = mount({
    seed: (cart) => { cart.increment(PIZZA); cart.increment(DRINK); },
  });
  expect(container.textContent).toContain("13.00€");
  unmount(container, root);
});

// Teléfono's "edit an already-placed line" (modifica) mode locks quantity,
// same as the original ItemPickerModal modifica UI never showing +/-.
test("showLineControls=false hides qty +/-/remove, showing a read-only quantity instead", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const cartApi = { cartItems: [{ ...PIZZA, _uid: "u1", q: 2, sub: "" }], totalCart: 20, totalQty: 2 };
  act(() => {
    root.render(<DraftSummary
      title="Editar" cartItems={cartApi.cartItems} totalCart={cartApi.totalCart} totalQty={cartApi.totalQty}
      onSetQty={() => {}} onRemoveLine={() => {}} onEditLine={() => {}} onSetPlainNote={() => {}}
      generalNote="" onSetGeneralNote={() => {}} showGeneralNote={false} showLineControls={false}
      onClose={() => {}} primaryAction={{ label: "Actualizar", onClick: () => {}, disabled: false }}
    />);
  });
  expect(byTestId(container, "draft-summary-minus")).toBeNull();
  expect(byTestId(container, "draft-summary-plus")).toBeNull();
  expect(byTestId(container, "draft-summary-remove")).toBeNull();
  expect(byTestId(container, "draft-summary-qty-readonly").textContent).toBe("× 2");
  act(() => { root.unmount(); });
  container.remove();
});

test("pencil (edit) is offered only for configurable items (canEditExtras) -- a beverage gets a plain note field instead", () => {
  const { container, root } = mount({ seed: (cart) => { cart.increment(PIZZA); cart.increment(DRINK); } });
  const lines = allByTestId(container, "draft-summary-line");
  const pizzaLine = lines.find((l) => l.textContent.includes("Fixture Pie"));
  const drinkLine = lines.find((l) => l.textContent.includes("Fixture Cola"));
  expect(pizzaLine.querySelector('[data-testid="draft-summary-edit"]')).toBeTruthy();
  expect(drinkLine.querySelector('[data-testid="draft-summary-edit"]')).toBeNull();
  expect(drinkLine.querySelector('[data-testid="draft-summary-plain-note"]')).toBeTruthy();
  unmount(container, root);
});

test("pencil click calls onEditLine with that item", () => {
  const onEditLine = jest.fn();
  const { container, root } = mount({ seed: (cart) => cart.increment(PIZZA), onEditLine });
  click(byTestId(container, "draft-summary-edit"));
  expect(onEditLine).toHaveBeenCalledWith(expect.objectContaining({ id: "fx-p" }));
  unmount(container, root);
});

test("+/- and remove controls mutate the real cart (via the caller's own useOrderCart instance)", () => {
  const { container, root } = mount({ seed: (cart) => cart.increment(PIZZA) });
  click(byTestId(container, "draft-summary-plus"));
  expect(container.textContent).toContain("20.00€"); // 2x 10.00
  click(byTestId(container, "draft-summary-remove"));
  expect(byTestId(container, "draft-summary-line")).toBeNull();
  unmount(container, root);
});

test("primary action button reflects the caller's label and disabled state", () => {
  const onClick = jest.fn();
  const { container, root } = mount({ seed: () => {}, primaryAction: { label: "Añadir (0)", onClick, disabled: true } });
  const btn = byTestId(container, "draft-summary-primary-action");
  expect(btn.textContent).toBe("Añadir (0)");
  expect(btn.disabled).toBe(true);
  unmount(container, root);
});

test("isCustomRawItem still correctly identifies custom lines seeded here -- sanity check the fixture matches the real production shape", () => {
  const custom = { id: "custom_2", n: "x" };
  expect(isCustomRawItem(custom)).toBe(true);
});

// ── GOAL 9 -- swipe-down-to-dismiss ────────────────────────────────────────
function pointer(el, type, x, y, pointerId = 1) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { clientX: x, clientY: y, pointerId });
  act(() => { el.dispatchEvent(event); });
}

test("dragging down from the handle past the threshold closes the sheet only, draft untouched", () => {
  const onClose = jest.fn();
  const { container, root } = mount({ seed: (cart) => cart.increment(PIZZA), onClose });
  const handle = byTestId(container, "draft-summary-drag-zone");
  const panel = byTestId(container, "draft-summary-panel");
  pointer(handle, "pointerdown", 100, 300);
  pointer(panel, "pointermove", 100, 400); // +100px, past the 70px threshold
  pointer(panel, "pointerup", 100, 400);
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

test("dragging down from the handle but short of the threshold snaps back -- no close", () => {
  const onClose = jest.fn();
  const { container, root } = mount({ seed: (cart) => cart.increment(PIZZA), onClose });
  const handle = byTestId(container, "draft-summary-drag-zone");
  const panel = byTestId(container, "draft-summary-panel");
  pointer(handle, "pointerdown", 100, 300);
  pointer(panel, "pointermove", 100, 330); // only +30px
  pointer(panel, "pointerup", 100, 330);
  expect(onClose).not.toHaveBeenCalled();
  unmount(container, root);
});

test("dragging down from within the scrolled-down line list does NOT dismiss -- ordinary scroll is preserved", () => {
  const onClose = jest.fn();
  const { container, root } = mount({ seed: (cart) => cart.increment(PIZZA), onClose });
  const content = byTestId(container, "draft-summary-content");
  const panel = byTestId(container, "draft-summary-panel");
  // Simulate the list already scrolled down (not at its own top).
  Object.defineProperty(content, "scrollTop", { value: 40, configurable: true });
  pointer(content, "pointerdown", 100, 300);
  pointer(panel, "pointermove", 100, 400);
  pointer(panel, "pointerup", 100, 400);
  expect(onClose).not.toHaveBeenCalled();
  unmount(container, root);
});

test("dragging down from within the line list DOES dismiss when the list is already at its own scroll top", () => {
  const onClose = jest.fn();
  const { container, root } = mount({ seed: (cart) => cart.increment(PIZZA), onClose });
  const content = byTestId(container, "draft-summary-content");
  const panel = byTestId(container, "draft-summary-panel");
  Object.defineProperty(content, "scrollTop", { value: 0, configurable: true });
  pointer(content, "pointerdown", 100, 300);
  pointer(panel, "pointermove", 100, 400);
  pointer(panel, "pointerup", 100, 400);
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount(container, root);
});
