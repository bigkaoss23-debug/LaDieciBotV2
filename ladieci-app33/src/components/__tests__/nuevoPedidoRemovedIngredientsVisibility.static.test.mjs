// CANONICAL_ORDER_LINE_SLICE_1 -- HARD ACCEPTANCE DEFECT B.
// Standalone: `node nuevoPedidoRemovedIngredientsVisibility.static.test.mjs`
//
// Before this slice, NuevoPedidoModal's own item list (Teléfono/Banco/
// Recogida/Domicilio/WA-escalated -- the highest-traffic create-order
// screen) never read item.removedIngredients: `grep removedIngredients
// NuevoPedidoModal.jsx` returned zero matches. An operator's "sin cebolla"
// reached the payload and Cocina correctly, but was invisible on the one
// list the operator reads back to the customer before confirming.
//
// (1) Proves the real normalizeOrderLine surfaces removedIngredients for
//     the exact shape this screen's items carry (buildEmittedItem output).
// (2) Greps NuevoPedidoModal.jsx to confirm the outer item list now reads
//     through normalizeOrderLine, that a removal renders, AND that the
//     pre-existing interactive extras-chip removal (removeExtraFromItem)
//     is still wired -- this migration must not touch that interaction.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizeOrderLine } from "../../menu/normalizeOrderLine.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODAL_PATH = join(HERE, "..", "NuevoPedidoModal.jsx");
const SRC = readFileSync(MODAL_PATH, "utf8");

let pass = 0, fail = 0;
const ck = (label, fn) => {
  try { fn(); pass++; console.log("  ✓", label); }
  catch (e) { fail++; console.log("  ✗", label, "—", e.message); }
};

console.log("\n══ NuevoPedidoModal — removed ingredients now visible on the create-order list ══");

// ── (1) Real data: the exact shape ItemPickerModal.buildEmittedItem hands to
//        NuevoPedidoModal's handleAdd, which spreads it verbatim into `items` ──
const emittedItemWithRemoval = {
  id: 1, n: "El Pelusa", q: 1, cat: "Pizzas", p: 12,
  classicName: "Margherita Classica", fantasyName: "El Pelusa", baseUnitPrice: 12,
  extras: [{ key: "ing_jamon", name: "Jamón cocido", price: 0.5, emoji: "🍖", quantity: 1 }],
  notes: "", removedIngredients: ["Cebolla"], _uid: "np-test-uid",
};

ck("normalizeOrderLine surfaces the removal for NuevoPedidoModal's real item shape", () => {
  const line = normalizeOrderLine(emittedItemWithRemoval);
  assert.deepEqual(line.removed, ["Cebolla"]);
  assert.equal(line.displayName, "El Pelusa");
  assert.deepEqual(line.extras, [{ name: "Jamón cocido", quantity: 1 }]);
});

ck("a real custom-pizza item (no removedIngredients field at all) yields an empty removal list, not a crash", () => {
  const line = normalizeOrderLine({ id: "custom_1", n: "Pizza a tu gusto", sub: "Base Pelusa + Rúcula", p: 14, q: 1, cat: "Pizzas", _ingredienti: [{ id: "i1", n: "Rúcula", e: "🌿", prezzo: 1 }] });
  assert.deepEqual(line.removed, []);
});

// ── (2) Source-level integration proof ──
ck("imports normalizeOrderLine", () => {
  assert.match(SRC, /import\s*\{\s*normalizeOrderLine\s*\}\s*from\s*['"]\.\.\/menu\/normalizeOrderLine['"]/);
});

const rowStart = SRC.indexOf('items.map((item, idx)');
const rowEnd = SRC.indexOf('np-row-right', rowStart);
if (rowStart === -1 || rowEnd === -1) throw new Error("could not locate the np-row item-list block in NuevoPedidoModal.jsx -- source shape changed");
const rowSection = SRC.slice(rowStart, rowEnd);

ck("the outer item list (np-row) calls normalizeOrderLine on each item", () => {
  assert.match(rowSection, /const line = normalizeOrderLine\(item\)/);
});

ck("the removed-ingredients row is rendered from the normalized `removed` field, distinctly from the note", () => {
  assert.match(rowSection, /removed\.length > 0/);
  assert.match(rowSection, /Sin: \{removed\.join\(", "\)\}/);
  // Distinct row from the note (different literal prefix, not reusing "⚠").
  assert.doesNotMatch(rowSection.match(/Sin: \{removed\.join\(", "\)\}[^\n]*/)[0], /⚠/);
});

ck("the pre-existing interactive extras-chip removal is untouched -- removeExtraFromItem still wired to the chip's × button", () => {
  assert.match(rowSection, /onClick=\{e => \{ e\.stopPropagation\(\); removeExtraFromItem\(item, ex\.name\); \}\}/);
});

ck("extras chips now read the normalized {name, quantity} shape (ex.quantity), not the old {name, qty}", () => {
  assert.match(rowSection, /ex\.quantity > 1/);
});

ck("splitItemSub itself is untouched (still defined) -- still used by extrasLabel's tooltip and removeExtraFromItem's own parsing, both out of Slice 1's scope", () => {
  assert.match(SRC, /const splitItemSub = \(sub\) => \{/);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
