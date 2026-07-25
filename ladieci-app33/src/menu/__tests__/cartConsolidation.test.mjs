// Cart consolidation signature + canonical quantity updater.
// Standalone: `node cartConsolidation.test.mjs`
import assert from "node:assert";
import { itemSignature, consolidateCart, applyLineQuantity } from "../itemSignature.js";

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("  ok  " + name); } catch (e) { fail++; console.log("FAIL  " + name + " -> " + e.message); } };
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// KitKat base 9.00; extras carry key+name+price.
const kitExtra = { key: "sweet_kitkat", name: "KitKat", price: 0.5, quantity: 1 };
const nutExtra = { key: "sweet_nutella", name: "Nutella", price: 0.5, quantity: 1 };
const kit = (extras = [], notes = "", q = 1, base = 9) => {
  const p = r2(base + extras.reduce((s, e) => s + (e.price || 0) * (e.quantity || 1), 0));
  return { id: 40, databaseId: "uuid-kit", n: "Pizza KitKat", classicName: "Pizza KitKat", baseUnitPrice: base, finalUnitPrice: p, p, q, cat: "Pizzas Dulces", extras, notes, sub: [...extras.map(e => `+${e.name}`), notes].filter(Boolean).join(", ") };
};

// ── Quantity consistency (q === quantity, lineTotal) ──
t("applyLineQuantity keeps q === quantity and lineTotal = final × q", () => {
  const it = applyLineQuantity(kit([kitExtra]), 4);
  assert.equal(it.q, 4);
  assert.equal(it.quantity, 4);
  assert.equal(it.finalUnitPrice, 9.5);
  assert.equal(it.lineTotal, 38.0);
});
t("legacy item (only p) → lineTotal = p × q", () => {
  const it = applyLineQuantity({ p: 12.5, q: 1 }, 3);
  assert.equal(it.quantity, 3);
  assert.equal(it.lineTotal, 37.5);
});
t("quantity reaching zero (updater floors at 0; caller removes)", () => {
  const it = applyLineQuantity(kit([kitExtra]), 0);
  assert.equal(it.q, 0);
  assert.equal(it.quantity, 0);
  assert.equal(it.lineTotal, 0);
});

// ── 1-3: consolidation via '+2/+3'-style aggregation keeps q===quantity ──
t("scenario 1/2/3: identical KitKat+extra rows consolidate; q===quantity", () => {
  const out = consolidateCart([kit([kitExtra]), kit([kitExtra]), kit([kitExtra])]);
  assert.equal(out.length, 1);
  assert.equal(out[0].q, 3);
  assert.equal(out[0].quantity, 3);
  assert.equal(out[0].lineTotal, r2(9.5 * 3));
});
t("scenario 5: per-unit extras NOT multiplied when line quantity grows", () => {
  const out = consolidateCart([kit([kitExtra], "", 1), kit([kitExtra], "", 2)]);
  assert.equal(out[0].q, 3);
  assert.equal(out[0].extras.length, 1);
  assert.equal(out[0].extras[0].quantity, 1);
});

// ── 6: same product/config/SAME accepted price merges ──
t("scenario 6: same config, same accepted price → merge", () => {
  assert.equal(consolidateCart([kit([kitExtra]), kit([kitExtra])]).length, 1);
});
// ── 7: same config, DIFFERENT accepted price → NO merge ──
t("scenario 7: same config, different accepted unit price → separate", () => {
  const a = kit([kitExtra]);
  const b = { ...kit([kitExtra]), p: 99, finalUnitPrice: 99 };
  assert.notEqual(itemSignature(a), itemSignature(b));
  assert.equal(consolidateCart([a, b]).length, 2);
});
// ── 8: same extra NAME, different KEY → NO merge ──
t("scenario 8: same extra name but different key → separate", () => {
  const a = kit([{ key: "sweet_kitkat", name: "KitKat", price: 0.5, quantity: 1 }]);
  const b = kit([{ key: "other_kitkat", name: "KitKat", price: 0.5, quantity: 1 }]);
  assert.notEqual(itemSignature(a), itemSignature(b));
  assert.equal(consolidateCart([a, b]).length, 2);
});
// ── 9: same extra KEY, different accepted PRICE → NO merge ──
t("scenario 9: same extra key but different accepted price → separate", () => {
  const a = kit([{ key: "sweet_kitkat", name: "KitKat", price: 0.5, quantity: 1 }]);
  const b = kit([{ key: "sweet_kitkat", name: "KitKat", price: 1.5, quantity: 1 }]);
  assert.notEqual(itemSignature(a), itemSignature(b));
  assert.equal(consolidateCart([a, b]).length, 2);
});
// different extra / note (baseline)
t("KitKat+extra vs plain, and different note → separate", () => {
  assert.equal(consolidateCart([kit([kitExtra]), kit([])]).length, 2);
  assert.equal(consolidateCart([kit([kitExtra], "sin cortar"), kit([kitExtra], "")]).length, 2);
});
// order independence
t("same extras chosen in different order → merge", () => {
  assert.equal(itemSignature(kit([kitExtra, nutExtra])), itemSignature(kit([nutExtra, kitExtra])));
});

// ── Custom base + ingredients ──
const custom = (ings, base = { id: "base_pelusa", name: "Base Pelusa", price: 12 }) => ({
  id: "custom_" + Math.random(), custom: true, n: "Pizza a tu gusto", cat: "Pizzas",
  baseUnitPrice: base.price, customBase: base, p: base.price + ings.length * 0.5, finalUnitPrice: base.price + ings.length * 0.5, q: 1,
  _ingredienti: ings.map(n => ({ id: "ing_" + n, n, prezzo: 0.5 })),
  extras: ings.map(n => ({ key: "ing_" + n, name: n, price: 0.5, quantity: 1 })),
});
t("scenario 11: same Custom base + same ingredients → merge", () => {
  const out = consolidateCart([custom(["champis", "rucola"]), custom(["rucola", "champis"])]);
  assert.equal(out.length, 1);
  assert.equal(out[0].q, 2);
});
t("scenario 10: same Custom ingredients but DIFFERENT base → separate", () => {
  const a = custom(["champis"], { id: "base_pelusa", name: "Base Pelusa", price: 12 });
  const b = custom(["champis"], { id: "base_integrale", name: "Base Integrale", price: 13 });
  assert.notEqual(itemSignature(a), itemSignature(b));
  assert.equal(consolidateCart([a, b]).length, 2);
});
t("different Custom ingredients → separate; Custom never merges with a normal product", () => {
  assert.equal(consolidateCart([custom(["champis"]), custom(["rucola"])]).length, 2);
  assert.equal(consolidateCart([custom(["champis"]), kit([])]).length, 2);
});
t("Custom does NOT use the generated custom_ timestamp id as identity", () => {
  assert.equal(itemSignature(custom(["champis"])), itemSignature(custom(["champis"])));
});

t("signature safe on junk", () => assert.equal(itemSignature(null), "invalid"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
