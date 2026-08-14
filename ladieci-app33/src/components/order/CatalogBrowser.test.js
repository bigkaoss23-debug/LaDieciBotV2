import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

const CatalogBrowser = require("./CatalogBrowser").default;

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}
function byTestId(container, id) { return container.querySelector(`[data-testid="${id}"]`); }
function allByTestId(container, id) { return Array.from(container.querySelectorAll(`[data-testid="${id}"]`)); }

// Arbitrary, non-static-menu names/ids -- proves no primitive depends on the
// real catalogue's actual content (DYNAMIC MENU TEST).
const CATS = ["Fixture Pizzas", "Fixture Drinks"];
const MENU = [
  { id: "fx-1", n: "Zanzibar Special", sub: "Clasica Zanzibar", num: 7, p: 11.25, cat: "Fixture Pizzas", disponible: true, visiblePicker: true },
  { id: "fx-2", n: "Nebula Fizz", sub: "33cl lata", num: null, p: 2.75, cat: "Fixture Drinks", disponible: true, visiblePicker: true },
  { id: "fx-3", n: "Hidden Item", sub: "", num: null, p: 5, cat: "Fixture Pizzas", disponible: false, visiblePicker: true },
];

function mount(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const defaults = { MENU, CATS, qtyOf: () => 0, onTapProduct: jest.fn(), onAddCustom: jest.fn(), initialCategory: CATS[0] };
  const finalProps = { ...defaults, ...props };
  act(() => { root.render(<CatalogBrowser {...finalProps} />); });
  return { container, root, props: finalProps };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

// fx-1 has num:7 (a numbered pizza), so pizzaLabel() makes the CLASSIC name
// (`sub`) primary/uppercase and the fantasy name (`n`) the secondary
// «guillemets» text -- verified against constants.js's own pizzaLabel()
// before writing this fixture, not assumed.
test("renders arbitrary injected categories and products verbatim -- no dependency on the real static menu", () => {
  const { container, root } = mount();
  expect(container.textContent).toContain("CLASICA ZANZIBAR");
  expect(container.textContent).toContain("«Zanzibar Special»");
  expect(container.textContent).toContain("11.25€");
  unmount(container, root);
});

test("unavailable products (disponible=false) are filtered from the grid", () => {
  const { container, root } = mount();
  expect(container.textContent).not.toContain("Hidden Item");
  unmount(container, root);
});

test("tapping a product card calls onTapProduct with that product", () => {
  const onTapProduct = jest.fn();
  const { container, root } = mount({ onTapProduct });
  click(allByTestId(container, "catalog-product-card")[0]);
  expect(onTapProduct).toHaveBeenCalledWith(expect.objectContaining({ id: "fx-1" }));
  unmount(container, root);
});

test("switching category shows only that category's products", () => {
  const { container, root } = mount();
  expect(container.textContent).toContain("CLASICA ZANZIBAR");
  click(byTestId(container, "catalog-cat-Fixture Drinks"));
  expect(container.textContent).toContain("NEBULA FIZZ");
  expect(container.textContent).not.toContain("CLASICA ZANZIBAR");
  unmount(container, root);
});

// Presentation: a numbered pizza AND a non-pizza/beverage both render their
// primary name uppercase -- the exact casing unification this slice exists
// for (Mesa's grid already did this for pizzas via pizzaLabel + Postres/
// Bebidas via its own wrapper; ItemPickerModal did neither for non-pizzas).
// Secondary text (classic name / size) is NOT uppercased.
test("beverage/non-pizza primary name is uppercase, secondary text is not", () => {
  const { container, root } = mount();
  click(byTestId(container, "catalog-cat-Fixture Drinks"));
  const drinkCard = allByTestId(container, "catalog-product-card").find((el) => el.textContent.includes("NEBULA"));
  expect(drinkCard.textContent).toContain("NEBULA FIZZ");
  expect(drinkCard.textContent).toContain("33cl lata");
  expect(drinkCard.textContent).not.toContain("33CL LATA");
  unmount(container, root);
});

test("numbered pizza shows the authoritative menu number as a corner badge; non-numbered items show none", () => {
  const { container, root } = mount();
  const pizzaCard = allByTestId(container, "catalog-product-card").find((el) => el.textContent.includes("ZANZIBAR"));
  const badge = pizzaCard.querySelector('[data-testid="catalog-pizza-number-badge"]');
  expect(badge).toBeTruthy();
  expect(badge.textContent).toBe("7");
  click(byTestId(container, "catalog-cat-Fixture Drinks"));
  const drinkCard = allByTestId(container, "catalog-product-card").find((el) => el.textContent.includes("NEBULA"));
  expect(drinkCard.querySelector('[data-testid="catalog-pizza-number-badge"]')).toBeNull();
  unmount(container, root);
});

test("qty badge reflects qtyOf(productId) -- caller-owned cart state, not internal to the browser", () => {
  const { container, root } = mount({ qtyOf: (id) => (id === "fx-1" ? 3 : 0) });
  const pizzaCard = allByTestId(container, "catalog-product-card").find((el) => el.textContent.includes("ZANZIBAR"));
  expect(pizzaCard.textContent).toContain("3");
  unmount(container, root);
});

test("no decorative emoji on product cards -- Mesa's proven no-emoji grid is the shared baseline", () => {
  const menuWithEmoji = [{ ...MENU[0], e: "🍕" }];
  const { container, root } = mount({ MENU: menuWithEmoji });
  expect(container.textContent).not.toContain("🍕");
  unmount(container, root);
});

test("the grid uses real CSS breakpoints for 2/3/4 columns, not JS width branching", () => {
  const { container, root } = mount();
  const css = Array.from(container.querySelectorAll("style")).map((el) => el.textContent).join("\n");
  expect(css).toMatch(/\.catalog-browser-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*1fr\)/);
  expect(css).toMatch(/@media \(min-width:\s*768px\)[^{]*\{[^}]*\.catalog-browser-grid[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/);
  expect(css).toMatch(/@media \(min-width:\s*1024px\)[^{]*\{[^}]*\.catalog-browser-grid[^}]*grid-template-columns:\s*repeat\(4,\s*1fr\)/);
  unmount(container, root);
});

test("⭐ Custom tab mounts the custom pizza builder", () => {
  const { container, root } = mount();
  click(byTestId(container, "catalog-cat-⭐ Custom"));
  expect(container.textContent).toContain("Pizza a tu gusto");
  unmount(container, root);
});

test("adding a custom pizza calls onAddCustom with the built item, without needing PizzaCustomBuilder.jsx changed", () => {
  const onAddCustom = jest.fn();
  const { container, root } = mount({ onAddCustom });
  click(byTestId(container, "catalog-cat-⭐ Custom"));
  // First real ingredient in the shared IngredientGrid's default group.
  click(allByTestId(container, "custom-ingredient-chip")[0]);
  const addBtn = byTestId(container, "custom-add-cta");
  click(addBtn);
  expect(onAddCustom).toHaveBeenCalledTimes(1);
  const added = onAddCustom.mock.calls[0][0];
  expect(added.id).toMatch(/^custom_/);
  expect(added._ingredienti.length).toBe(1);
  unmount(container, root);
});

// ── the 4 main tabs (Pizzas/Postres/Bebidas/Custom fixture-equivalent) ────
// CANONICAL_MANUAL_PICKER_FINAL_CORRECTION (Goal 2) -- "⭐ Custom is clipped
// on iPhone" was originally fixed as a horizontal-scroll clipping bug (a
// trailing spacer so the scroll end wasn't flush against the edge). Human
// phone UAT found that fix insufficient: with only 4 top-level categories,
// there should be NO scroll at all -- all 4 always visible together. The
// fixture here has exactly 2 CATS + Custom = 3 tabs, still <=4, so it
// exercises the same no-scroll grid path the real 3-CATS-+-Custom catalogue
// uses. JSDOM never runs real layout (no way to assert on-screen pixels at
// 375/390/393 here -- see MOBILE VISUAL QA in the final report for the real
// on-device proof), so these are structural: a CSS grid of N equal columns
// has no overflow to scroll, by construction, regardless of viewport width.
describe("the main tab row fits without horizontal scroll (<=4 categories)", () => {
  test("uses a CSS grid of one column per tab, not a scrolling flex row", () => {
    const { container, root } = mount({});
    const row = byTestId(container, "catalog-browser-tabs");
    expect(row.style.display).toBe("grid");
    expect(row.style.gridTemplateColumns).toBe("repeat(3, 1fr)"); // 2 CATS + Custom
    expect(row.style.overflowX).not.toBe("auto");
    unmount(container, root);
  });

  test("no trailing scroll-end spacer when the grid layout is used -- there is no scroll end to protect", () => {
    const { container, root } = mount({});
    expect(byTestId(container, "catalog-tabs-end-spacer")).toBeNull();
    unmount(container, root);
  });

  test("every tab, including Custom, renders as a direct grid child with no width override forcing overflow", () => {
    const { container, root } = mount({});
    const tabs = Array.from(container.querySelectorAll('[data-testid="catalog-browser-tabs"] button'));
    expect(tabs).toHaveLength(3);
    tabs.forEach((btn) => { expect(btn.style.flexShrink).toBe(""); });
    unmount(container, root);
  });

  test("the Custom tab is still the last real tab and still switches", () => {
    const { container, root } = mount({});
    const tabs = Array.from(container.querySelectorAll('[data-testid="catalog-browser-tabs"] button'));
    expect(tabs[tabs.length - 1].textContent).toContain("Custom");
    click(tabs[tabs.length - 1]);
    expect(allByTestId(container, "catalog-product-card")).toHaveLength(0);
    unmount(container, root);
  });

  test("a catalogue with MORE than 4 top-level categories falls back to the proven scrollable row + end-spacer, instead of a too-narrow grid", () => {
    const { container, root } = mount({ CATS: ["A", "B", "C", "D", "E"] }); // 5 + Custom = 6
    const row = byTestId(container, "catalog-browser-tabs");
    expect(row.style.display).toBe("flex");
    expect(row.style.overflowX).toBe("auto");
    expect(byTestId(container, "catalog-tabs-end-spacer")).toBeTruthy();
    unmount(container, root);
  });
});

// ── GOAL 3 — card number/quantity/price no longer compete for one corner ──
describe("catalogue card badge positions (Goal 3)", () => {
  test("selected quantity badge sits top-left", () => {
    const { container, root } = mount({ qtyOf: (id) => (id === "fx-1" ? 2 : 0) });
    const card = allByTestId(container, "catalog-product-card").find((el) => el.textContent.includes("ZANZIBAR"));
    const badge = card.querySelector('[data-testid="catalog-qty-badge"]');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe("2");
    expect(badge.style.top).toBe("-8px");
    expect(badge.style.left).toBe("-8px");
    unmount(container, root);
  });

  test("catalogue number badge sits bottom-right (no positioning of its own -- laid out in the bottom row)", () => {
    const { container, root } = mount({});
    const card = allByTestId(container, "catalog-product-card").find((el) => el.textContent.includes("ZANZIBAR"));
    const badge = card.querySelector('[data-testid="catalog-pizza-number-badge"]');
    expect(badge).toBeTruthy();
    expect(badge.style.position).not.toBe("absolute");
    const priceEl = card.querySelector('[data-testid="catalog-product-price"]');
    const bottomRow = badge.parentElement;
    expect(bottomRow).toBe(priceEl.parentElement);
    expect(Array.from(bottomRow.children).indexOf(badge)).toBeGreaterThan(Array.from(bottomRow.children).indexOf(priceEl));
    unmount(container, root);
  });

  test("price sits bottom-left, in the same row as the number badge", () => {
    const { container, root } = mount({});
    const card = allByTestId(container, "catalog-product-card").find((el) => el.textContent.includes("ZANZIBAR"));
    const priceEl = card.querySelector('[data-testid="catalog-product-price"]');
    expect(priceEl.textContent).toBe("11.25€");
    unmount(container, root);
  });
});

// ── GOAL 4 — quick decrement straight from the catalogue card ─────────────
describe("catalogue card quick decrement (Goal 4)", () => {
  test("no minus control when quantity is 0", () => {
    const { container, root } = mount({ qtyOf: () => 0, onDecrementProduct: jest.fn() });
    const card = allByTestId(container, "catalog-product-card")[0];
    expect(card.querySelector('[data-testid="catalog-decrement"]')).toBeNull();
    unmount(container, root);
  });

  test("minus control appears once quantity > 0 and calls onDecrementProduct with the product, without also triggering onTapProduct", () => {
    const onTapProduct = jest.fn();
    const onDecrementProduct = jest.fn();
    const { container, root } = mount({ qtyOf: (id) => (id === "fx-1" ? 1 : 0), onTapProduct, onDecrementProduct });
    const card = allByTestId(container, "catalog-product-card").find((el) => el.textContent.includes("ZANZIBAR"));
    const minus = card.querySelector('[data-testid="catalog-decrement"]');
    expect(minus).toBeTruthy();
    click(minus);
    expect(onDecrementProduct).toHaveBeenCalledWith(expect.objectContaining({ id: "fx-1" }));
    expect(onTapProduct).not.toHaveBeenCalled();
    unmount(container, root);
  });
});

// The product number is a genuine operational aid (operators and customers
// both say "la 7"), so it has to be catchable. It used to be #888 on near
// black inside a near-black border.
test("the product number badge is legible, not three stacked near-blacks", () => {
  const { container, root } = mount({});
  const badge = byTestId(container, "catalog-pizza-number-badge");
  expect(badge).toBeTruthy();
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };
  // the label itself must be clearly bright, whatever the ground behind it
  expect(luminance("#F0D9A8")).toBeGreaterThan(0.7);
  expect(badge.style.color.replace(/\s/g, "")).toMatch(/rgb\(240,217,168\)|#F0D9A8/i);
  unmount(container, root);
});
