import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

const PizzaCustomBuilder = require("./PizzaCustomBuilder").default;

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}
function byTestId(container, id) { return container.querySelector(`[data-testid="${id}"]`); }
function allByTestId(container, id) { return Array.from(container.querySelectorAll(`[data-testid="${id}"]`)); }

// Arbitrary fixture ingredients -- proves no dependency on the real static
// catalogue (matches the DYNAMIC MENU TEST convention used elsewhere in this
// picker slice).
const INGREDIENTI = [
  { id: "ing-a", n: "Fixture Basil", e: "🌿", prezzo: 0.5, tipo: "standard", gruppo: "Verduras" },
  { id: "ing-b", n: "Fixture Garlic", e: "🧄", prezzo: 0.5, tipo: "standard", gruppo: "Verduras" },
];

function mount(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const setItems = props.setItems || jest.fn();
  act(() => { root.render(<PizzaCustomBuilder INGREDIENTI={props.INGREDIENTI || INGREDIENTI} setItems={setItems} />); });
  return { container, root, setItems };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

test("no CTA bar until at least one ingredient is selected", () => {
  const { container, root } = mount();
  expect(byTestId(container, "custom-add-cta-bar")).toBeNull();
  unmount(container, root);
});

// ── GOAL 11 -- ingredient quantity 0→1→2→1→0, price follows quantity ──────
test("tapping an ingredient chip repeatedly increments its own quantity, price scales, then decrements back to 0 removes it", () => {
  const { container, root } = mount();
  const chip = allByTestId(container, "custom-ingredient-chip")[0]; // Fixture Basil, +0.50
  click(chip); // qty 1
  click(chip); // qty 2
  expect(chip.textContent).toContain("2");
  expect(byTestId(container, "custom-current-price").textContent).toBe("13.00€"); // 12.00 base + 2*0.50
  expect(byTestId(container, "custom-selection-summary").textContent).toContain("Fixture Basil ×2");

  const minus = chip.querySelector('[aria-label="Quitar Fixture Basil"]');
  click(minus); // qty 1
  expect(byTestId(container, "custom-current-price").textContent).toBe("12.50€");
  click(minus); // qty 0 -- removed entirely
  expect(byTestId(container, "custom-current-price").textContent).toBe("12.00€");
  expect(byTestId(container, "custom-selection-summary")).toBeNull();
  expect(byTestId(container, "custom-add-cta-bar")).toBeNull();
  unmount(container, root);
});

test("two different ingredients at different quantities price correctly", () => {
  const { container, root } = mount();
  const [basil, garlic] = allByTestId(container, "custom-ingredient-chip");
  click(basil); click(basil); // ×2 -> +1.00
  click(garlic); // ×1 -> +0.50
  // base 12.00 + 1.00 + 0.50 = 13.50
  expect(byTestId(container, "custom-current-price").textContent).toBe("13.50€");
  unmount(container, root);
});

// ── GOAL 13 -- sticky CTA is a real pinned footer, not embedded mid-scroll ──
test("the add CTA renders as a flexShrink:0 footer AFTER the scrolling ingredient grid, not above it", () => {
  const { container, root } = mount();
  const chip = allByTestId(container, "custom-ingredient-chip")[0];
  click(chip);
  const root_ = byTestId(container, "custom-header").parentElement;
  const children = Array.from(root_.children);
  const gridIdx = children.findIndex((el) => el.getAttribute("data-testid") === "custom-ingredient-grid" || el.querySelector('[data-testid="custom-ingredient-grid"]'));
  const ctaIdx = children.findIndex((el) => el.getAttribute("data-testid") === "custom-add-cta-bar");
  expect(ctaIdx).toBeGreaterThan(-1);
  expect(gridIdx).toBeGreaterThan(-1);
  expect(ctaIdx).toBeGreaterThan(gridIdx);
  const ctaBar = byTestId(container, "custom-add-cta-bar");
  expect(ctaBar.style.flexShrink).toBe("0");
  unmount(container, root);
});

// ── GOAL 14 (this component's own half) -- Añadir builds the item and hands
// it out via setItems exactly once, then resets its own local selection ──
test("Añadir esta pizza builds the configured item once and resets local selection", () => {
  const setItems = jest.fn();
  const { container, root } = mount({ setItems });
  click(allByTestId(container, "custom-ingredient-chip")[0]);
  click(byTestId(container, "custom-add-cta"));
  expect(setItems).toHaveBeenCalledTimes(1);
  // The adapter in CatalogBrowser.jsx invokes setItems as a React updater;
  // call it here directly against a throwaway array to inspect the item.
  const updater = setItems.mock.calls[0][0];
  const result = updater([]);
  expect(result).toHaveLength(1);
  const item = result[0];
  expect(item.id).toMatch(/^custom_/);
  expect(item._ingredienti).toHaveLength(1);
  expect(item._ingredienti[0].quantity).toBe(1);
  // selection reset -- CTA bar gone again
  expect(byTestId(container, "custom-add-cta-bar")).toBeNull();
  unmount(container, root);
});

// ── GOAL 16 -- the emitted item is genuinely canonical, not the old
// custom-raw shape that only carried a legacy `sub` description ──────────
test("the emitted item carries structured custom truth: custom:true, customBase, extras[] with quantity, empty notes", () => {
  const setItems = jest.fn();
  const { container, root } = mount({ setItems });
  const chip = allByTestId(container, "custom-ingredient-chip")[0];
  click(chip); click(chip); // qty 2
  click(byTestId(container, "custom-add-cta"));
  const item = setItems.mock.calls[0][0]([])[0];
  expect(item.custom).toBe(true);
  expect(item.customBase).toEqual(expect.objectContaining({ price: expect.any(Number) }));
  expect(item.notes).toBe("");
  expect(item.removedIngredients).toEqual([]);
  expect(item.extras).toEqual([
    expect.objectContaining({ name: "Fixture Basil", quantity: 2, price: 0.5 }),
  ]);
  // Legacy sub/ing text is still present for any surface reading it verbatim,
  // but it is compatibility text only -- never the source of extras/notes.
  expect(item.sub).toContain("Fixture Basil ×2");
  unmount(container, root);
});

// ── GOAL 15 -- base description contrast raised off the near-invisible dim
// grey, and clearly distinguishes base price from this pizza's live total ──
test("base description no longer uses the near-invisible dim grey", () => {
  const { container, root } = mount();
  const baseDesc = byTestId(container, "custom-base-desc");
  expect(baseDesc.style.color).not.toBe("#666666");
  unmount(container, root);
});

// ── GOAL 19 -- shares the canonical ingredient grouping primitive, not a
// second hardcoded GRUPPI_ING list ─────────────────────────────────────────
test("ingredient grouping uses the shared canonical rule (menu/ingredientGroups), not a separate hardcoded list", () => {
  // Real Spanish vocabulary on purpose -- menu/ingredientGroups.js classifies
  // by a language keyword table, so invented English words would prove
  // nothing about the classifier itself (same convention ItemConfigurator's
  // own grouping tests already use).
  const MIXED = [
    { id: "g-1", n: "Provolone", e: "🧀", prezzo: 0.5, gruppo: "Salados" },
    { id: "g-2", n: "Pancetta", e: "🥓", prezzo: 0.5, gruppo: "Salados" },
  ];
  const { container, root } = mount({ INGREDIENTI: MIXED });
  // "Quesos"/"Carnes" are classified by NAME (menu/ingredientGroups.js's
  // keyword table), not by the static-only "gruppo" field -- proving this
  // grid runs the same classifier the extras configurator uses.
  expect(byTestId(container, "custom-group-filter")).toBeTruthy();
  expect(byTestId(container, "custom-group-Quesos")).toBeTruthy();
  expect(byTestId(container, "custom-group-Carnes")).toBeTruthy();
  unmount(container, root);
});

// ── Falls back to the static catalogue when no INGREDIENTI prop is given ──
test("falls back to the static ingredient catalogue when no INGREDIENTI prop is provided (never an empty grid)", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<PizzaCustomBuilder setItems={jest.fn()} />); });
  expect(allByTestId(container, "custom-ingredient-chip").length).toBeGreaterThan(0);
  act(() => { root.unmount(); });
  container.remove();
});
