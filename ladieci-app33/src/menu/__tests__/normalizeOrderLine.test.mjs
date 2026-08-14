// normalizeOrderLine — canonical order-line read model (Slice 1).
// Standalone: `node normalizeOrderLine.test.mjs`
//
// Fixtures below are the three REAL reachable shapes, taken verbatim from:
//   - order/useOrderCart.js (working shape: increment/addExtra/toggleRemoved,
//     emitted shape: buildEmittedItem)
//   - components/PizzaCustomBuilder.jsx (custom-raw shape: handleAggiungi)
// Not an imagined future clean model — see CANONICAL_ORDER_LINE_SLICE_1_
// REPORT_2026-08-14.md for how each was confirmed against source.
import assert from "node:assert";
import { normalizeOrderLine } from "../normalizeOrderLine.js";

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("  ok  " + name); } catch (e) { fail++; console.log("FAIL  " + name + " -> " + e.message); } };

console.log("\n══ normalizeOrderLine — canonical order-line read model ══");

// ── Emitted shape (buildEmittedItem output — Mesa draft, NuevoPedidoModal) ──

const emittedPizza = (overrides = {}) => ({
  id: 1, n: "El Pelusa", q: 1, cat: "Pizzas", p: 12,
  classicName: "Margherita Classica", fantasyName: "El Pelusa", baseUnitPrice: 12,
  extras: [], notes: "", removedIngredients: [],
  ...overrides,
});

const emittedBeverage = (overrides = {}) => ({
  id: 20, n: "Coca Cola", q: 2, cat: "Bebidas", p: 3,
  classicName: "0,33L", fantasyName: "Coca Cola", baseUnitPrice: 3,
  extras: [], notes: "", removedIngredients: [],
  ...overrides,
});

t("plain pizza: name, secondary (classic name), no extras/removed/note", () => {
  const line = normalizeOrderLine(emittedPizza());
  assert.equal(line.displayName, "El Pelusa");
  assert.equal(line.secondaryName, "Margherita Classica");
  assert.equal(line.isCustom, false);
  assert.deepEqual(line.extras, []);
  assert.deepEqual(line.removed, []);
  assert.equal(line.note, "");
  assert.equal(line.quantity, 1);
});

t("beverage: secondary name carries the size/variant, not an extra/note/removal", () => {
  const line = normalizeOrderLine(emittedBeverage());
  assert.equal(line.displayName, "Coca Cola");
  assert.equal(line.secondaryName, "0,33L");
  assert.deepEqual(line.extras, []);
  assert.deepEqual(line.removed, []);
  assert.equal(line.note, "");
  assert.equal(line.quantity, 2);
});

t("structured extras[] wins — quantity preserved", () => {
  const line = normalizeOrderLine(emittedPizza({
    extras: [{ key: "ing_jamon", name: "Jamón cocido", price: 0.5, emoji: "🍖", quantity: 2 }],
  }));
  assert.deepEqual(line.extras, [{ name: "Jamón cocido", quantity: 2 }]);
});

t("structured removedIngredients[] survives", () => {
  const line = normalizeOrderLine(emittedPizza({ removedIngredients: ["Albahaca"] }));
  assert.deepEqual(line.removed, ["Albahaca"]);
});

t("structured notes survives and stays distinct from extras", () => {
  const line = normalizeOrderLine(emittedPizza({ notes: "cortar en 4" }));
  assert.equal(line.note, "cortar en 4");
  assert.deepEqual(line.extras, []);
});

t("extras + removal + note together: all three visible, none conflated", () => {
  const line = normalizeOrderLine(emittedPizza({
    extras: [{ key: "ing_jamon", name: "Jamón cocido", price: 0.5, emoji: "🍖", quantity: 1 }],
    notes: "cortar en 4",
    removedIngredients: ["Albahaca", "Fior di latte"],
  }));
  assert.deepEqual(line.extras, [{ name: "Jamón cocido", quantity: 1 }]);
  assert.equal(line.note, "cortar en 4");
  assert.deepEqual(line.removed, ["Albahaca", "Fior di latte"]);
  // Cross-contamination check: the note text never leaks into extras/removed.
  assert.ok(!line.extras.some((e) => e.name.includes("cortar")));
  assert.ok(!line.removed.some((r) => r.includes("cortar")));
});

t("structured truth wins over a stale/conflicting legacy sub", () => {
  const line = normalizeOrderLine(emittedPizza({
    sub: "+Something stale that should never be read",
    extras: [{ key: "ing_jamon", name: "Jamón cocido", price: 0.5, emoji: "🍖", quantity: 1 }],
    notes: "real note",
  }));
  assert.deepEqual(line.extras, [{ name: "Jamón cocido", quantity: 1 }]);
  assert.equal(line.note, "real note");
});

// ── Working shape (mid-cart — order/useOrderCart.js, before buildEmittedItem) ──

t("legacy fallback: extras + note combined in working `sub` are correctly split", () => {
  const working = {
    id: 1, n: "El Pelusa", q: 1, cat: "Pizzas", p: 12.5,
    sub: "+Jamón cocido, cortar en 4",
    classicName: "Margherita Classica", fantasyName: "El Pelusa", baseUnitPrice: 12, _uid: "abc",
  };
  const line = normalizeOrderLine(working);
  assert.deepEqual(line.extras, [{ name: "Jamón cocido", quantity: 1 }]);
  assert.equal(line.note, "cortar en 4");
});

t("legacy fallback: repeated `+Name` tokens (no ×N suffix) sum to one chip with quantity", () => {
  const working = { id: 1, n: "El Pelusa", q: 1, cat: "Pizzas", p: 13, sub: "+Jamón cocido, +Jamón cocido" };
  const line = normalizeOrderLine(working);
  assert.deepEqual(line.extras, [{ name: "Jamón cocido", quantity: 2 }]);
});

t("working-shape removedIngredients (set via toggleRemoved before emission) already survives", () => {
  const working = {
    id: 1, n: "El Pelusa", q: 1, cat: "Pizzas", p: 12, sub: "",
    classicName: "Margherita Classica", fantasyName: "El Pelusa", baseUnitPrice: 12,
    removedIngredients: ["Albahaca"], _uid: "xyz",
  };
  const line = normalizeOrderLine(working);
  assert.deepEqual(line.removed, ["Albahaca"]);
});

t("ambiguous/unrecognized legacy sub (no comma, no '+') is preserved as a note, not discarded", () => {
  const line = normalizeOrderLine({ id: 5, n: "Postre raro", q: 1, cat: "Postres", p: 5, sub: "sin azúcar por favor" });
  assert.equal(line.note, "sin azúcar por favor");
  assert.deepEqual(line.extras, []);
});

// ── Custom-raw shape (PizzaCustomBuilder.jsx — real production shape) ──

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

t("custom pizza (HARD ACCEPTANCE DEFECT A): id is detected as custom via the real production shape", () => {
  const line = normalizeOrderLine(realCustomPizza());
  assert.equal(line.isCustom, true);
});

t("custom pizza: selected ingredients survive as extras chips (not collapsed to just the name)", () => {
  const line = normalizeOrderLine(realCustomPizza());
  assert.equal(line.displayName, "Pizza a tu gusto");
  assert.deepEqual(line.extras, [
    { name: "Tomates confitados", quantity: 1 },
    { name: "Rúcula", quantity: 1 },
  ]);
});

t("custom pizza: the generated `sub` description is never read as a manual note", () => {
  const line = normalizeOrderLine(realCustomPizza());
  assert.equal(line.note, "");
  assert.ok(!line.note.includes("Base Pelusa"));
});

t("custom pizza: an explicit manual note (if ever set) is still shown, distinct from the ingredient list", () => {
  const line = normalizeOrderLine({ ...realCustomPizza(), notes: "bien caliente" });
  assert.equal(line.note, "bien caliente");
  assert.equal(line.extras.length, 2);
});

t("custom pizza: repeated ingredient selection dedupes to one chip with summed quantity", () => {
  const it = realCustomPizza();
  it._ingredienti.push({ id: "i_tom", n: "Tomates confitados", e: "🍅", prezzo: 1, tipo: "normal", gruppo: "Verduras y hierbas" });
  const line = normalizeOrderLine(it);
  const tom = line.extras.find((e) => e.name === "Tomates confitados");
  assert.equal(tom.quantity, 2);
});

t("custom pizza: legacy-only historical line (no _ingredienti at all) falls back to the raw description, not lost", () => {
  const legacyCustom = {
    id: "custom_1690000000000", n: "Pizza a tu gusto",
    sub: "Base Pelusa + Tomate, Rúcula", e: "⭐", p: 14, q: 1, cat: "Pizzas",
  };
  const line = normalizeOrderLine(legacyCustom);
  assert.equal(line.isCustom, true);
  assert.deepEqual(line.extras, []);
  assert.equal(line.secondaryName, "Base Pelusa + Tomate, Rúcula");
});

t("custom pizza: no removedIngredients field present -> empty, not an error", () => {
  const line = normalizeOrderLine(realCustomPizza());
  assert.deepEqual(line.removed, []);
});

// ── No meaningful data loss / immutability / safety ──

t("no meaningful data loss: every populated field of a kitchen-sink line reaches the view model", () => {
  const line = normalizeOrderLine(emittedPizza({
    extras: [{ key: "a", name: "Jamón cocido", price: 0.5, emoji: "🍖", quantity: 1 }],
    notes: "cortar en 4",
    removedIngredients: ["Albahaca"],
  }));
  assert.ok(line.displayName && line.secondaryName && line.extras.length && line.removed.length && line.note);
});

t("immutability: normalizeOrderLine never mutates its input", () => {
  const original = emittedPizza({
    extras: [{ key: "a", name: "Jamón cocido", price: 0.5, emoji: "🍖", quantity: 1 }],
    removedIngredients: ["Albahaca"],
  });
  const snapshot = JSON.parse(JSON.stringify(original));
  normalizeOrderLine(original);
  assert.deepEqual(original, snapshot);
});

t("safety: null/undefined/non-object input returns a safe empty line, never throws", () => {
  assert.doesNotThrow(() => normalizeOrderLine(null));
  assert.doesNotThrow(() => normalizeOrderLine(undefined));
  assert.doesNotThrow(() => normalizeOrderLine("not an item"));
  const line = normalizeOrderLine(null);
  assert.equal(line.displayName, "");
  assert.deepEqual(line.extras, []);
});

t("quantity/price: unitPrice and lineTotal are derived when the host surface has them", () => {
  const line = normalizeOrderLine(emittedPizza({ p: 12.5, q: 2 }));
  assert.equal(line.unitPrice, 12.5);
  assert.equal(line.lineTotal, 25);
});

t("numbering: p.num passes through untouched when present, null when absent", () => {
  assert.equal(normalizeOrderLine(emittedPizza({ num: 1 })).number, 1);
  assert.equal(normalizeOrderLine(emittedPizza()).number, null);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
