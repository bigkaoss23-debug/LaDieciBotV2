import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

const OrderLineView = require("./OrderLineView").default;
const { normalizeOrderLine } = require("../../menu/normalizeOrderLine");

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<OrderLineView {...props} />); });
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }
function byTestId(container, id) { return container.querySelector(`[data-testid="${id}"]`); }

const emittedPizza = (overrides = {}) => ({
  id: 1, n: "El Pelusa", q: 1, cat: "Pizzas", p: 12,
  classicName: "Margherita Classica", fantasyName: "El Pelusa", baseUnitPrice: 12,
  extras: [], notes: "", removedIngredients: [],
  ...overrides,
});

const realCustomPizza = () => ({
  id: "custom_1723622400000", n: "Pizza a tu gusto",
  sub: "Base Pelusa + Tomates confitados, Rúcula",
  e: "⭐", p: 14, q: 1, cat: "Pizzas",
  _ingredienti: [
    { id: "i_tom", n: "Tomates confitados", e: "🍅", prezzo: 1, tipo: "normal", gruppo: "Verduras y hierbas" },
    { id: "i_ruc", n: "Rúcula", e: "🌿", prezzo: 1, tipo: "normal", gruppo: "Verduras y hierbas" },
  ],
  ing: "Base Pelusa + Tomates confitados, Rúcula",
});

test("renders nothing when line is absent", () => {
  const { container, root } = mount({ line: null });
  expect(container.textContent).toBe("");
  unmount(container, root);
});

test("plain pizza: name and classic secondary name, no extras/removed/note rows", () => {
  const { container, root } = mount({ line: normalizeOrderLine(emittedPizza()) });
  expect(container.textContent).toContain("El Pelusa");
  expect(container.textContent).toContain("Margherita Classica");
  expect(byTestId(container, "order-line-extras")).toBeNull();
  expect(byTestId(container, "order-line-removed")).toBeNull();
  expect(byTestId(container, "order-line-note")).toBeNull();
  unmount(container, root);
});

// GOAL 18 -- display name hierarchy: the canonical/classic name gets its own
// element so it can be styled distinctly (uppercase, per orderLineViewCss)
// from the nickname, without changing what the line's text actually says.
test("the canonical/secondary name is its own element (styleable independently of the nickname)", () => {
  const { container, root } = mount({ line: normalizeOrderLine(emittedPizza()) });
  const nameRow = byTestId(container, "order-line-name");
  const secondary = nameRow.querySelector(".order-line-name-secondary");
  expect(secondary).toBeTruthy();
  expect(secondary.textContent).toContain("Margherita Classica");
  // textContent (what every existing consumer/test reads) is unaffected by
  // the CSS text-transform:uppercase applied via the class -- same string,
  // same "nickname / Canonical Name" order as before.
  expect(nameRow.textContent.replace(/\s+/g, " ").trim()).toBe("El Pelusa / Margherita Classica");
  unmount(container, root);
});

// HARD ACCEPTANCE DEFECT A — custom pizza detail must not collapse to just
// "Pizza a tu gusto" once outside the picker's own drawer.
test("custom pizza: selected ingredients render as visible chips, not just the generic name", () => {
  const { container, root } = mount({ line: normalizeOrderLine(realCustomPizza()) });
  expect(container.textContent).toContain("Pizza a tu gusto");
  const extras = byTestId(container, "order-line-extras");
  expect(extras).toBeTruthy();
  expect(extras.textContent).toContain("Tomates confitados");
  expect(extras.textContent).toContain("Rúcula");
  unmount(container, root);
});

// HARD ACCEPTANCE DEFECT B — a removal must be visible on the shared renderer.
test("removed ingredient renders a clear 'Sin: ...' row", () => {
  const line = normalizeOrderLine(emittedPizza({ removedIngredients: ["Cebolla"] }));
  const { container, root } = mount({ line });
  const removed = byTestId(container, "order-line-removed");
  expect(removed).toBeTruthy();
  expect(removed.textContent).toBe("Sin: Cebolla");
  unmount(container, root);
});

test("extras and note are both visible and stay in separate, distinct rows", () => {
  const line = normalizeOrderLine(emittedPizza({
    extras: [{ key: "ing_jamon", name: "Jamón cocido", price: 0.5, emoji: "🍖", quantity: 2 }],
    notes: "cortar en 4",
  }));
  const { container, root } = mount({ line });
  const extras = byTestId(container, "order-line-extras");
  const note = byTestId(container, "order-line-note");
  expect(extras.textContent).toBe("+ Jamón cocido ×2");
  expect(note.textContent).toBe("Nota: cortar en 4");
  // Neither row leaks into the other.
  expect(extras.textContent).not.toContain("cortar");
  expect(note.textContent).not.toContain("Jamón");
  unmount(container, root);
});

test("beverage: name plus size/variant, coherent presentation", () => {
  const line = normalizeOrderLine({
    id: 20, n: "Coca Cola", q: 1, cat: "Bebidas", p: 3,
    classicName: "0,33L", fantasyName: "Coca Cola", baseUnitPrice: 3,
    extras: [], notes: "", removedIngredients: [],
  });
  const { container, root } = mount({ line });
  expect(byTestId(container, "order-line-name").textContent).toBe("Coca Cola / 0,33L");
  unmount(container, root);
});

test("showQuantityPrefix renders '2× ' ahead of the name only when explicitly requested", () => {
  const line = normalizeOrderLine(emittedPizza({ q: 2 }));
  const withoutPrefix = mount({ line });
  expect(byTestId(withoutPrefix.container, "order-line-name").textContent).not.toContain("2×");
  unmount(withoutPrefix.container, withoutPrefix.root);

  const withPrefix = mount({ line, showQuantityPrefix: true });
  expect(byTestId(withPrefix.container, "order-line-name").textContent).toContain("2× El Pelusa");
  unmount(withPrefix.container, withPrefix.root);
});

// Deliberate design boundary (see file header comment): price/total stay
// owned by the host surface, each of which formats them differently today.
test("never renders a price or total -- that stays owned by the host surface", () => {
  const line = normalizeOrderLine(emittedPizza({ p: 12, q: 3 }));
  const { container, root } = mount({ line });
  expect(container.textContent).not.toMatch(/12[.,]00/);
  expect(container.textContent).not.toMatch(/36[.,]00/);
  unmount(container, root);
});

test("testId prop scopes child data-testids for multi-instance queries", () => {
  const { container, root } = mount({
    line: normalizeOrderLine(emittedPizza({ removedIngredients: ["Albahaca"] })),
    testId: "mesa-line-0",
  });
  expect(byTestId(container, "mesa-line-0")).toBeTruthy();
  expect(byTestId(container, "mesa-line-0-order-line-removed")).toBeTruthy();
  unmount(container, root);
});

// A host surface (e.g. TabMesa's .mesa-muted/.mesa-command-note) must be
// able to reproduce its OWN existing visual language exactly -- this is what
// keeps the migration from silently reskinning an already-live screen.
test("classNames/styles let a host surface override per-row appearance without changing structure", () => {
  const line = normalizeOrderLine(emittedPizza({
    extras: [{ key: "a", name: "Jamón cocido", price: 0.5, emoji: "🍖", quantity: 1 }],
    removedIngredients: ["Albahaca"],
    notes: "poco hecha",
  }));
  const { container, root } = mount({
    line,
    classNames: { extras: "mesa-muted", removed: "mesa-muted", note: "mesa-command-note" },
    styles: { extras: { fontSize: 12 }, removed: { fontSize: 12 } },
  });
  const extras = byTestId(container, "order-line-extras");
  const removed = byTestId(container, "order-line-removed");
  const note = byTestId(container, "order-line-note");
  expect(extras.className).toContain("mesa-muted");
  expect(extras.style.fontSize).toBe("12px");
  expect(removed.className).toContain("mesa-muted");
  expect(note.className).toContain("mesa-command-note");
  // Base structural class stays too -- caller classes are additive.
  expect(extras.className).toContain("order-line-extras");
  unmount(container, root);
});

// ── readability of the shared renderer ────────────────────────────────────
// These exist because of a real iPhone defect, not for coverage. The app sets
// no global text colour (constants.js styles html/body/#root with a background
// only), so a class with no stylesheet renders as the user-agent default —
// BLACK — on a #070707 panel. DraftSummary, the one surface where an operator
// proof-reads a comanda before sending it to the kitchen, passed no classNames
// and no styles, so extras / removed / note were invisible there. The base
// stylesheet is therefore part of the component's contract.
describe("the shared renderer is readable without the host dressing it", () => {
  const styleEl = () => document.getElementById("order-line-view-base-css");

  test("ships its own base stylesheet the first time it renders", () => {
    styleEl()?.remove();
    expect(styleEl()).toBeNull();
    const { container, root } = mount({ line: normalizeOrderLine(emittedPizza({})) });
    expect(styleEl()).toBeTruthy();
    unmount(container, root);
  });

  test("gives every detail row an explicit colour, so none can inherit black", () => {
    const { container, root } = mount({ line: normalizeOrderLine(emittedPizza({})) });
    const css = styleEl().textContent;
    ["order-line-name", "order-line-extras", "order-line-removed", "order-line-note"]
      .forEach((cls) => {
        const rule = css.split("\n").find((line) => line.includes(`.${cls}{`));
        expect(rule).toBeTruthy();
        expect(rule).toMatch(/color:#[0-9a-fA-F]{6}/);
      });
    unmount(container, root);
  });

  // The three detail rows carry different meanings (added / removed / free
  // text) and must stay distinguishable at a glance, not merely visible.
  test("extras, removals and notes are not all the same colour", () => {
    const { container, root } = mount({ line: normalizeOrderLine(emittedPizza({})) });
    const css = styleEl().textContent;
    const colourOf = (cls) => css.split("\n").find((l) => l.includes(`.${cls}{`)).match(/color:(#[0-9a-fA-F]{6})/)[1];
    const colours = ["order-line-extras", "order-line-removed", "order-line-note"].map(colourOf);
    expect(new Set(colours).size).toBe(3);
    unmount(container, root);
  });

  test("injects exactly one stylesheet however many lines render", () => {
    styleEl()?.remove();
    const a = mount({ line: normalizeOrderLine(emittedPizza({})) });
    const b = mount({ line: normalizeOrderLine(emittedPizza({})) });
    expect(document.querySelectorAll("#order-line-view-base-css")).toHaveLength(1);
    unmount(a.container, a.root);
    unmount(b.container, b.root);
  });
});
