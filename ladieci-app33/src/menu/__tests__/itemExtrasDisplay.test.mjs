// Operational EXTRAS vs MANUAL NOTE separation (Cocina rendering fix).
// Standalone: `node itemExtrasDisplay.test.mjs`
//
// EXTRAS  = product supplements → getItemExtraDisplays / formatItemExtrasLabel ("Name")
//           NO "+" prefix (owner-requested: orange styling already signals "extra").
// NOTE    = operator instruction → resolveItemNote (separate row, never an extras chip)
import assert from "node:assert";
import {
  getItemExtraDisplays, formatItemExtrasLabel, resolveItemNote, isCanonicalItem,
} from "../itemDisplay.js";

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("  ok  " + name); } catch (e) { fail++; console.log("FAIL  " + name + " -> " + e.message); } };

// Canonical Pizza KitKat, structured extras KitKat+Pistacho, manual note.
const kitkat = (notes = "") => ({
  id: 17, n: "KitKat", classicName: "Pizza KitKat", cat: "Pizzas Dulces",
  p: 10.5, q: 1, quantity: 1, snapshotVersion: 1,
  extras: [
    { key: "sweet_kitkat", name: "KitKat", price: 0.5, emoji: "🍫", quantity: 1 },
    { key: "sweet_pistacho", name: "Pistacho", price: 0.5, emoji: "🟢", quantity: 1 },
  ],
  notes, sub: "+KitKat, +Pistacho",
});

console.log("\n══ ITEM EXTRAS DISPLAY — extras vs note ══");

// ── extras from structured extras[] ──
t("extras come from structured extras[]", () => {
  const ex = getItemExtraDisplays(kitkat());
  assert.deepEqual(ex.map(e => e.name), ["KitKat", "Pistacho"]);
});
t("label has NO '+' prefix, comma-separated names", () => {
  assert.equal(formatItemExtrasLabel(kitkat()), "KitKat, Pistacho");
  assert.ok(!formatItemExtrasLabel(kitkat()).includes("+"), "no '+' anywhere in the label");
});
t("note comes from notes, not from the extras label", () => {
  const it = kitkat("Sin cortar");
  assert.equal(resolveItemNote(it), "Sin cortar");
  assert.ok(!formatItemExtrasLabel(it).includes("Sin cortar"));
});

// ── quantity > 1 compact ──
t("extra quantity >1 renders compactly as ×N (no '+')", () => {
  const it = kitkat();
  it.extras = [{ key: "sweet_kitkat", name: "KitKat", price: 0.5, quantity: 2 }];
  assert.equal(formatItemExtrasLabel(it), "KitKat ×2");
});
t("qty 5 renders as ×5 (no '+')", () => {
  const it = kitkat();
  it.extras = [{ key: "sweet_pistacho", name: "Pistacho", price: 0.5, quantity: 5 }];
  assert.equal(formatItemExtrasLabel(it), "Pistacho ×5");
});
t("same extra repeated is deduped and summed (no '+')", () => {
  const it = kitkat();
  it.extras = [
    { key: "sweet_kitkat", name: "KitKat", price: 0.5, quantity: 1 },
    { key: "sweet_kitkat", name: "KitKat", price: 0.5, quantity: 1 },
  ];
  assert.equal(formatItemExtrasLabel(it), "KitKat ×2");
});

// ── the four operational cases ──
t("CASE 1 extras+note: label non-empty AND note non-empty", () => {
  const it = kitkat("Sin cortar");
  assert.equal(formatItemExtrasLabel(it), "KitKat, Pistacho");
  assert.equal(resolveItemNote(it), "Sin cortar");
});
t("CASE 2 extras only: label non-empty, note empty (no note row)", () => {
  const it = kitkat("");
  assert.equal(formatItemExtrasLabel(it), "KitKat, Pistacho");
  assert.equal(resolveItemNote(it), "");
});
t("CASE 3 note only: label empty (no extras chip), note non-empty", () => {
  const it = { id: 17, n: "KitKat", cat: "Pizzas Dulces", snapshotVersion: 1,
    extras: [], notes: "Sin cortar", sub: "", p: 10, q: 1 };
  assert.equal(formatItemExtrasLabel(it), "");
  assert.equal(resolveItemNote(it), "Sin cortar");
});
t("CASE 4 neither: both empty (no rows)", () => {
  const it = { id: 17, n: "KitKat", cat: "Pizzas Dulces", snapshotVersion: 1,
    extras: [], notes: "", sub: "", p: 10, q: 1 };
  assert.equal(formatItemExtrasLabel(it), "");
  assert.equal(resolveItemNote(it), "");
});

// ── legacy sub-only fallback: split extras from note, strip literal "+" ──
t("legacy sub-only: leading '+' stripped from displayed label, note from free text", () => {
  const legacy = { id: 1, n: "Margarita", cat: "Pizzas", sub: "+Jamón, cortar en 4", p: 10, q: 1 };
  assert.equal(isCanonicalItem(legacy), false);
  assert.equal(formatItemExtrasLabel(legacy), "Jamón");
  assert.ok(!formatItemExtrasLabel(legacy).startsWith("+"), "legacy '+' not shown");
  assert.equal(resolveItemNote(legacy), "cortar en 4");
});

// ── Custom items: no extras chip here (base/ingredients shown elsewhere) ──
t("canonical Custom → getItemExtraDisplays returns [] (no extras chip)", () => {
  const custom = { id: "custom_1", custom: true, n: "Pizza a tu gusto", p: 12, q: 1,
    customBase: { id: "base_pelusa", name: "Base Pelusa", price: 8 },
    extras: [{ key: "i_tom", name: "Tomate", price: 1, quantity: 1 }],
    notes: "Sin cortar", sub: "Base Pelusa + Tomate" };
  assert.deepEqual(getItemExtraDisplays(custom), []);
  assert.equal(resolveItemNote(custom), "Sin cortar"); // note still resolves from notes
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
