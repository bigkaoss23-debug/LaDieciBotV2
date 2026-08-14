import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

const { useOrderCart } = require("../../order/useOrderCart");
const ItemConfigurator = require("./ItemConfigurator").default;

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  act(() => {
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function byTestId(container, id) { return container.querySelector(`[data-testid="${id}"]`); }
function allByTestId(container, id) { return Array.from(container.querySelectorAll(`[data-testid="${id}"]`)); }

// Arbitrary fixture catalogue -- proves no dependency on the real static menu.
const INGREDIENTI = [
  { id: "ing-a", n: "Fixture Basil", e: "🌿", prezzo: 0.6, tipo: "normal", gruppo: "g1" },
  { id: "ing-b", n: "Fixture Garlic", e: "🧄", prezzo: 0.6, tipo: "normal", gruppo: "g1" },
];
const PIZZA = { id: "fx-p", n: "Fixture Pie", sub: "Fixture Classic", p: 10, cat: "Pizzas", ingredientesBase: ["Fixture Sauce", "Fixture Cheese"] };

// Harness: mounts a real useOrderCart() instance, seeds one item, exposes it
// to ItemConfigurator exactly as MesaOrderBuilder/ItemPickerModal already do.
function Harness({ onCartSnapshot, onClose }) {
  const cartApi = useOrderCart({ MENU: [PIZZA], INGREDIENTI });
  const seededRef = React.useRef(false);
  if (!seededRef.current) { seededRef.current = true; cartApi.increment(PIZZA); }
  const item = cartApi.cartItems[0];
  React.useEffect(() => { onCartSnapshot && onCartSnapshot(cartApi.cartItems); });
  if (!item) return null;
  return <ItemConfigurator item={item} INGREDIENTI={INGREDIENTI} cartApi={cartApi} onClose={onClose} />;
}

function mount(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<Harness {...props} />); });
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

test("renders arbitrary injected extras and base ingredients verbatim", () => {
  const { container, root } = mount();
  expect(container.textContent).toContain("Fixture Basil");
  expect(container.textContent).toContain("Fixture Garlic");
  expect(container.textContent).toContain("Quitar ingredientes");
  expect(container.textContent).toContain("Fixture Sauce");
  expect(container.textContent).toContain("Fixture Cheese");
  unmount(container, root);
});

test("adding an extra updates the chip count and is reflected in the cart snapshot", () => {
  let snapshot = null;
  const { container, root } = mount({ onCartSnapshot: (items) => { snapshot = items; } });
  click(allByTestId(container, "configurator-extra-chip")[0]);
  expect(snapshot[0].sub).toContain("+Fixture Basil");
  unmount(container, root);
});

test("toggling a base ingredient marks it removed, does not touch price/sub", () => {
  let snapshot = null;
  const { container, root } = mount({ onCartSnapshot: (items) => { snapshot = items; } });
  const chip = allByTestId(container, "remove-ingredient-chip")[0];
  const priceBefore = snapshot[0].p;
  click(chip);
  expect(snapshot[0].removedIngredients).toEqual(["Fixture Sauce"]);
  expect(snapshot[0].p).toBe(priceBefore);
  expect(snapshot[0].sub).toBe("");
  unmount(container, root);
});

test("note stays distinct from extras -- typing a note does not add an extra, and vice versa", () => {
  let snapshot = null;
  const { container, root } = mount({ onCartSnapshot: (items) => { snapshot = items; } });
  click(allByTestId(container, "configurator-extra-chip")[0]);
  typeInto(byTestId(container, "configurator-note-input"), "cortar en 4");
  expect(snapshot[0].sub).toContain("+Fixture Basil");
  expect(snapshot[0].sub).toContain("cortar en 4");
  unmount(container, root);
});

test("Listo calls onClose", () => {
  const onClose = jest.fn();
  const { container, root } = mount({ onClose });
  click(byTestId(container, "configurator-done"));
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

test("removing an extra via its own minus control decrements the chip count", () => {
  let snapshot = null;
  const { container, root } = mount({ onCartSnapshot: (items) => { snapshot = items; } });
  const chip = allByTestId(container, "configurator-extra-chip")[0];
  click(chip);
  click(chip);
  expect(snapshot[0].sub.split(",").filter((t) => t.includes("Fixture Basil")).length).toBe(2);
  const minusControl = chip.querySelector('[aria-label="Quitar Fixture Basil"]');
  click(minusControl);
  expect(snapshot[0].sub.split(",").filter((t) => t.includes("Fixture Basil")).length).toBe(1);
  unmount(container, root);
});
