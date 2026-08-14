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
// `extras` lets a case swap the injected catalogue (the grouping cases need a
// multi-family one); everything else behaves exactly as before.
function Harness({ onCartSnapshot, onClose, extras = INGREDIENTI }) {
  const cartApi = useOrderCart({ MENU: [PIZZA], INGREDIENTI: extras });
  const seededRef = React.useRef(false);
  if (!seededRef.current) { seededRef.current = true; cartApi.increment(PIZZA); }
  const item = cartApi.cartItems[0];
  React.useEffect(() => { onCartSnapshot && onCartSnapshot(cartApi.cartItems); });
  if (!item) return null;
  return <ItemConfigurator item={item} INGREDIENTI={extras} cartApi={cartApi} onClose={onClose} />;
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

// ── grouped browsing + the structural split ───────────────────────────────
// Both come from the same iPhone review: the extras sheet was one
// undifferentiated black slab with a flat, unscannable list of every extra.
describe("extras are grouped so a long list stays scannable", () => {
  // Real vocabulary on purpose -- the grouping rule is a language table, so a
  // fixture of invented words would prove the wiring and nothing else.
  const MIXED = [
    { id: "g-1", n: "Provolone", e: "🧀", prezzo: 0.5, gruppo: "Salados" },
    { id: "g-2", n: "Gorgonzola DOP", e: "🧀", prezzo: 0.5, gruppo: "Salados" },
    { id: "g-3", n: "Pancetta", e: "🥓", prezzo: 0.5, gruppo: "Salados" },
    { id: "g-4", n: "Berenjena", e: "🍆", prezzo: 0.5, gruppo: "Salados" },
  ];

  test("a mixed list offers a group filter, defaulting to everything", () => {
    const { container, root } = mount({ extras: MIXED });
    expect(byTestId(container, "configurator-group-filter")).toBeTruthy();
    expect(allByTestId(container, "configurator-extra-chip")).toHaveLength(4);
    unmount(container, root);
  });

  test("choosing a group narrows the grid to that group only", () => {
    const { container, root } = mount({ extras: MIXED });
    click(byTestId(container, "configurator-group-Quesos"));
    const names = allByTestId(container, "configurator-extra-chip").map((b) => b.textContent);
    expect(names).toHaveLength(2);
    expect(names.join(" ")).toContain("Provolone");
    expect(names.join(" ")).toContain("Gorgonzola");
    expect(names.join(" ")).not.toContain("Pancetta");
    unmount(container, root);
  });

  test("Todos restores the whole list", () => {
    const { container, root } = mount({ extras: MIXED });
    click(byTestId(container, "configurator-group-Quesos"));
    expect(allByTestId(container, "configurator-extra-chip")).toHaveLength(2);
    click(byTestId(container, "configurator-group-Todos"));
    expect(allByTestId(container, "configurator-extra-chip")).toHaveLength(4);
    unmount(container, root);
  });

  // A chip row that cannot filter anything is noise dressed as a control --
  // e.g. a product whose allowlist is four cheeses.
  test("a single-family list shows no filter row at all", () => {
    const { container, root } = mount({
      extras: [MIXED[0], MIXED[1]],
    });
    expect(byTestId(container, "configurator-group-filter")).toBeFalsy();
    expect(allByTestId(container, "configurator-extra-chip")).toHaveLength(2);
    unmount(container, root);
  });

  // Filtering is a VIEW. It must never change what is in the cart.
  test("filtering never mutates the order", () => {
    let snapshot = null;
    const { container, root } = mount({ extras: MIXED, onCartSnapshot: (items) => { snapshot = items; } });
    click(allByTestId(container, "configurator-extra-chip")[0]);
    const afterAdd = snapshot[0].sub;
    click(byTestId(container, "configurator-group-Carnes"));
    click(byTestId(container, "configurator-group-Todos"));
    expect(snapshot[0].sub).toBe(afterAdd);
    unmount(container, root);
  });
});

test("La Dieci's extras keep their emoji — they are how an operator recognises them", () => {
  const { container, root } = mount({});
  const chip = allByTestId(container, "configurator-extra-chip")[0];
  expect(chip.textContent).toContain("🌿");
  unmount(container, root);
});

// The sheet used to be three strips separated by 1px hairlines on
// near-identical near-black, so browsing and adjusting melted together and the
// operator had no landmark. The lower zone is now one raised panel.
test("the adjust zone is a visually distinct panel, not another black strip", () => {
  const { container, root } = mount({});
  const zone = byTestId(container, "configurator-adjust-zone");
  expect(zone).toBeTruthy();
  // its own ground, a real rule, and a shadow that lifts it off the grid
  expect(zone.style.background).toBeTruthy();
  expect(zone.style.borderTop).not.toBe("");
  expect(parseFloat(zone.style.borderTop)).toBeGreaterThanOrEqual(2);
  expect(zone.style.boxShadow).toBeTruthy();
  expect(zone.style.borderRadius).toBeTruthy();
  // and it genuinely contains BOTH lower jobs, not just one of them
  expect(zone.querySelector('[data-testid="configurator-note-input"]')).toBeTruthy();
  expect(zone.querySelector('[data-testid="configurator-done"]')).toBeTruthy();
  expect(zone.querySelector('[data-testid="remove-ingredient-chip"]')).toBeTruthy();
  unmount(container, root);
});
