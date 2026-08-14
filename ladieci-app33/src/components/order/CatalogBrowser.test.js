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
  // First real ingredient in the static custom-builder's default group.
  const ingredientButtons = Array.from(container.querySelectorAll("button")).filter((b) => b.textContent.includes("+0.50"));
  click(ingredientButtons[0]);
  const addBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Añadir esta pizza"));
  click(addBtn);
  expect(onAddCustom).toHaveBeenCalledTimes(1);
  const added = onAddCustom.mock.calls[0][0];
  expect(added.id).toMatch(/^custom_/);
  expect(added._ingredienti.length).toBe(1);
  unmount(container, root);
});

// ── the horizontally scrolling tab row ────────────────────────────────────
// "⭐ Custom is clipped on iPhone" was not a sizing bug. A flex row that
// scrolls horizontally does not honour its own padding-right at the scroll
// end in WebKit/Blink, so the last tab butts flush against the edge. The fix
// is a real, unshrinkable trailing child; these lock it in because the
// symptom is invisible in JSDOM's layout and trivially removable by someone
// tidying up "an empty span".
describe("the last category tab is never clipped at the scroll end", () => {
  test("the tab row ends with an unshrinkable spacer, not container padding", () => {
    const { container, root } = mount({});
    const spacer = byTestId(container, "catalog-tabs-end-spacer");
    expect(spacer).toBeTruthy();
    // must be the LAST child: a spacer anywhere else buys nothing
    expect(spacer.parentElement.lastElementChild).toBe(spacer);
    // and must not be allowed to collapse under flex pressure
    expect(spacer.style.flex).toContain("0 0");
    unmount(container, root);
  });

  test("the row carries no right padding for the browser to drop", () => {
    const { container, root } = mount({});
    const row = container.querySelector(".catalog-browser-tabs");
    expect(row.style.paddingRight === "" || row.style.paddingRight === "0px").toBe(true);
    unmount(container, root);
  });

  test("the Custom tab is still the last real tab and still switches", () => {
    const { container, root } = mount({});
    const tabs = Array.from(container.querySelectorAll(".catalog-browser-tabs button"));
    expect(tabs[tabs.length - 1].textContent).toContain("Custom");
    click(tabs[tabs.length - 1]);
    expect(allByTestId(container, "catalog-product-card")).toHaveLength(0);
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
