// Shared item display model — canonical Custom ingredients vs operator notes.
// Standalone: `node itemDisplayModel.test.mjs`
//
// INGREDIENTS = pizza configuration (customBase + extras[]/_ingredienti).
// NOTES       = manual operator text (`notes`), never the generated `sub`.
import assert from "node:assert";
import {
  isCanonicalCustomItem, getItemBaseDisplay, getItemIngredientDisplays, getItemManualNote,
} from "../itemDisplay.js";
import { itemSignature, consolidateCart } from "../itemSignature.js";

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("  ok  " + name); } catch (e) { fail++; console.log("FAIL  " + name + " -> " + e.message); } };

// A canonical Custom pizza with four selected ingredients, exactly as
// PizzaCustomBuilder emits it (base Pelusa + 4 extras). `sub` intentionally
// carries the legacy configuration summary — it must NOT be read as a note.
const fourIng = () => ({
  id: "custom_1", n: "Pizza a tu gusto", cat: "Pizzas", p: 12, q: 1,
  custom: true, classicName: "Pizza a tu gusto",
  baseUnitPrice: 8, finalUnitPrice: 12,
  customBase: { id: "base_pelusa", name: "Base Pelusa", price: 8 },
  _ingredienti: [
    { id: "i_tom", n: "Tomates confitados", prezzo: 1, e: "🍅" },
    { id: "i_ruc", n: "Rúcula", prezzo: 1, e: "🌿" },
    { id: "i_pim", n: "Pimiento", prezzo: 1, e: "🫑" },
    { id: "i_ber", n: "Berenjena", prezzo: 1, e: "🍆" },
  ],
  extras: [
    { key: "i_tom", name: "Tomates confitados", price: 1, emoji: "🍅", quantity: 1 },
    { key: "i_ruc", name: "Rúcula", price: 1, emoji: "🌿", quantity: 1 },
    { key: "i_pim", name: "Pimiento", price: 1, emoji: "🫑", quantity: 1 },
    { key: "i_ber", name: "Berenjena", price: 1, emoji: "🍆", quantity: 1 },
  ],
  notes: "", removedIngredients: [],
  sub: "Base Pelusa + Tomates confitados, Rúcula, Pimiento, Berenjena",
});

console.log("\n══ ITEM DISPLAY MODEL — custom ingredients vs notes ══");

t("1: canonical Custom carries four _ingredienti records", () => {
  assert.equal(fourIng()._ingredienti.length, 4);
});
t("2: canonical Custom carries four structured extras", () => {
  assert.equal(fourIng().extras.length, 4);
});
t("3: no selected ingredient is lost — 4 ingredient chips derived", () => {
  const chips = getItemIngredientDisplays(fourIng());
  assert.equal(chips.length, 4);
  assert.deepEqual(chips.map(c => c.name), ["Tomates confitados", "Rúcula", "Pimiento", "Berenjena"]);
});
t("4: notes default to empty", () => {
  assert.equal(getItemManualNote(fourIng()), "");
});
t("5: generated `sub` config is NOT interpreted as a note", () => {
  const it = fourIng();
  assert.equal(getItemManualNote(it), "");
  assert.ok(!getItemManualNote(it).includes("Base Pelusa"));
});
t("7: base is derived separately from ingredients", () => {
  const base = getItemBaseDisplay(fourIng());
  assert.equal(base.name, "Base Pelusa");
  assert.equal(base.price, 8);
});
t("9: a real manual note is returned exactly once", () => {
  const it = { ...fourIng(), notes: "Sin cortar" };
  assert.equal(getItemManualNote(it), "Sin cortar");
});
t("10: clearing the note yields empty (no note row)", () => {
  const it = { ...fourIng(), notes: "" };
  assert.equal(getItemManualNote(it), "");
});
t("11: same ingredient in extras[] AND _ingredienti is not duplicated", () => {
  // extras present → _ingredienti ignored; dedupe by key within extras.
  const it = fourIng();
  it.extras = [...it.extras, { key: "i_tom", name: "Tomates confitados", price: 1, emoji: "🍅", quantity: 1 }];
  const chips = getItemIngredientDisplays(it);
  const tom = chips.filter(c => c.name === "Tomates confitados");
  assert.equal(tom.length, 1);
  assert.equal(tom[0].qty, 2); // merged to ×2, not duplicated
});
t("repeated per-unit ingredient shows compactly as ×N (quantity kept)", () => {
  const it = fourIng();
  it.extras = [{ key: "i_tom", name: "Tomates confitados", price: 1, emoji: "🍅", quantity: 2 }];
  const chips = getItemIngredientDisplays(it);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].qty, 2);
});
t("falls back to _ingredienti when extras[] absent", () => {
  const it = fourIng();
  delete it.extras;
  const chips = getItemIngredientDisplays(it);
  assert.equal(chips.length, 4);
});
t("non-custom item → no base, no custom chips, empty helper note", () => {
  const pizza = { id: 1, n: "Margarita", cat: "Pizzas", sub: "+Jamón, cortar en 4", p: 10, q: 1 };
  assert.equal(isCanonicalCustomItem(pizza), false);
  assert.equal(getItemBaseDisplay(pizza), null);
  assert.deepEqual(getItemIngredientDisplays(pizza), []);
  assert.equal(getItemManualNote(pizza), ""); // caller keeps its legacy sub parsing
});
t("18: legacy-only custom (only sub, no structured) is not canonical", () => {
  const legacy = { id: "custom_9", n: "Pizza a tu gusto", p: 12, q: 1, custom: true,
    sub: "Base Pelusa + Tomates, Rúcula" };
  // no extras/_ingredienti/customBase → not canonical → helper returns empty,
  // caller renders the legacy `sub` (readable, never lost).
  assert.equal(isCanonicalCustomItem(legacy), false);
  assert.deepEqual(getItemIngredientDisplays(legacy), []);
});

// ── consolidation / signature contract still holds ──
t("14: identical Custom configurations still consolidate", () => {
  const out = consolidateCart([fourIng(), fourIng()]);
  assert.equal(out.length, 1);
  assert.equal(out[0].q, 2);
});
t("15: different Custom configurations remain separate", () => {
  const a = fourIng();
  const b = fourIng();
  b.extras = b.extras.slice(0, 3); // one fewer ingredient
  b._ingredienti = b._ingredienti.slice(0, 3);
  assert.notEqual(itemSignature(a), itemSignature(b));
  assert.equal(consolidateCart([a, b]).length, 2);
});
t("16: ingredient accepted prices participate in the signature", () => {
  const a = fourIng();
  const b = fourIng();
  b.extras = b.extras.map((e, i) => i === 0 ? { ...e, price: 2 } : e); // different accepted price
  assert.notEqual(itemSignature(a), itemSignature(b));
});
t("5b: sig treats canonical custom notes as empty (extras array → '')", () => {
  const a = fourIng(); // notes "", sub has config text
  const b = fourIng(); b.sub = ""; // sub differs but must not affect notes
  const sa = JSON.parse(itemSignature(a));
  assert.equal(sa.notes, "");
});
t("manual note DOES change the signature (two customs, one noted)", () => {
  const a = fourIng();
  const b = { ...fourIng(), notes: "Sin cortar" };
  assert.notEqual(itemSignature(a), itemSignature(b));
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
