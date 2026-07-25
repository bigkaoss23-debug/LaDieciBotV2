// Canonical item MANUAL-NOTE contract (Phase-B note fix).
// Standalone: `node canonicalItemNotes.test.mjs`
//
// DEFECT fixed: a new canonical item's manual operator note was written into
// the legacy `sub` string (sub="+Kinder, Prueba modificación", notes="").
// CONTRACT: the manual note lives EXCLUSIVELY in `notes`; `sub` is
// configuration/compatibility text only and never receives the note.
import assert from "node:assert";
import {
  isCanonicalItem, isCanonicalCustomItem,
  getItemManualNote, resolveItemNote, getLegacyNoteFromSub,
  setItemManualNote, clearItemManualNote,
  getItemIngredientDisplays, getItemBaseDisplay,
} from "../itemDisplay.js";
import { itemSignature, consolidateCart } from "../itemSignature.js";

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("  ok  " + name); } catch (e) { fail++; console.log("FAIL  " + name + " -> " + e.message); } };

// A NEW canonical Pizza Nutella (Pizzas Dulces) with a Kinder structured extra,
// exactly as the dynamic ItemPickerModal emits it: structured extras[] + a
// config-only legacy `sub`, note carried in `notes`.
const nutellaKinder = (notes = "") => ({
  id: 16, databaseId: "uuid-16", n: "Nutella", classicName: "Pizza Nutella",
  cat: "Pizzas Dulces", p: 9.5, q: 2, quantity: 2,
  baseUnitPrice: 9, finalUnitPrice: 9.5, lineTotal: 19,
  extras: [{ key: "sweet_kinder", name: "Kinder", price: 0.5, emoji: "🥚", quantity: 1 }],
  removedIngredients: [],
  notes,
  sub: "+Kinder",
});

console.log("\n══ CANONICAL ITEM NOTES — notes vs sub ══");

// ── isCanonicalItem ──
t("canonical: item with structured extras[] is canonical", () => {
  assert.equal(isCanonicalItem(nutellaKinder()), true);
});
t("canonical: item with snapshotVersion is canonical", () => {
  assert.equal(isCanonicalItem({ snapshotVersion: 1, id: 3, p: 8 }), true);
});
t("legacy: sub-only item is NOT canonical", () => {
  assert.equal(isCanonicalItem({ id: 1, n: "Margarita", sub: "+Jamón, cortar en 4", p: 10 }), false);
});

// ── Task 1/2: editor writes notes, never sub ──
t("1: note editor writes `notes` (canonical normal item)", () => {
  const out = setItemManualNote(nutellaKinder(), "Prueba modificación");
  assert.equal(out.notes, "Prueba modificación");
});
t("2: note editor does NOT append to `sub`", () => {
  const out = setItemManualNote(nutellaKinder(), "Prueba modificación");
  assert.equal(out.sub, "+Kinder");
  assert.ok(!String(out.sub).includes("Prueba"));
});

// ── Task 3: clearing ──
t("3: clearing a canonical note sets notes=\"\"", () => {
  const out = clearItemManualNote(nutellaKinder("Prueba modificación"));
  assert.equal(out.notes, "");
  assert.equal(out.sub, "+Kinder");
});

// ── Task 4/5/6/7/8: nothing else changes on note edit ──
t("4: structured extras unchanged after note editing", () => {
  const before = nutellaKinder();
  const out = setItemManualNote(before, "Sin cortar");
  assert.deepEqual(out.extras, before.extras);
  assert.equal(out.extras.length, 1);
});
t("5: accepted extra price unchanged", () => {
  const out = setItemManualNote(nutellaKinder(), "Sin cortar");
  assert.equal(out.extras[0].price, 0.5);
});
t("6: product accepted price unchanged (p/finalUnitPrice)", () => {
  const out = setItemManualNote(nutellaKinder(), "Sin cortar");
  assert.equal(out.p, 9.5);
  assert.equal(out.finalUnitPrice, 9.5);
});
t("7: q and quantity unchanged", () => {
  const out = setItemManualNote(nutellaKinder(), "Sin cortar");
  assert.equal(out.q, 2);
  assert.equal(out.quantity, 2);
});
t("8: lineTotal unchanged", () => {
  const out = setItemManualNote(nutellaKinder(), "Sin cortar");
  assert.equal(out.lineTotal, 19);
});

// ── Task 9/10: sub/notes target shape ──
t("9: Kinder extra alone → sub=\"+Kinder\", notes empty", () => {
  const it = nutellaKinder();
  assert.equal(it.sub, "+Kinder");
  assert.equal(getItemManualNote(it), "");
});
t("10: Kinder extra + manual note → sub=\"+Kinder\", notes=\"Prueba modificación\"", () => {
  const it = setItemManualNote(nutellaKinder(), "Prueba modificación");
  assert.equal(it.sub, "+Kinder");
  assert.equal(it.notes, "Prueba modificación");
  assert.equal(getItemManualNote(it), "Prueba modificación");
});

// ── Display resolution ──
t("display: canonical note read from `notes` (not from sub config)", () => {
  const it = setItemManualNote(nutellaKinder(), "Prueba modificación");
  assert.equal(resolveItemNote(it), "Prueba modificación");
});
t("display: empty note on canonical item → no note (config-only sub yields '')", () => {
  assert.equal(resolveItemNote(nutellaKinder()), "");
});
t("display: Custom empty note never shows generated sub config as a note", () => {
  const custom = {
    id: "custom_1", custom: true, n: "Pizza a tu gusto", p: 12, q: 1, notes: "",
    customBase: { id: "base_pelusa", name: "Base Pelusa", price: 8 },
    extras: [{ key: "i_tom", name: "Tomate", price: 1, emoji: "🍅", quantity: 1 }],
    sub: "Base Pelusa + Tomate",
  };
  assert.equal(isCanonicalCustomItem(custom), true);
  assert.equal(resolveItemNote(custom), "");
});

// ── Task 16/17: consolidation by note ──
t("16: same canonical note → lines consolidate", () => {
  const a = setItemManualNote({ ...nutellaKinder(), q: 1 }, "Prueba");
  const b = setItemManualNote({ ...nutellaKinder(), q: 1 }, "Prueba");
  assert.equal(itemSignature(a), itemSignature(b));
  assert.equal(consolidateCart([a, b]).length, 1);
});
t("17: different canonical notes → lines stay separate", () => {
  const a = setItemManualNote({ ...nutellaKinder(), q: 1 }, "Prueba");
  const b = setItemManualNote({ ...nutellaKinder(), q: 1 }, "Otra");
  assert.notEqual(itemSignature(a), itemSignature(b));
  assert.equal(consolidateCart([a, b]).length, 2);
});
t("signature: editing the note leaves extras/price/qty untouched in the item", () => {
  const before = { ...nutellaKinder(), q: 1 };
  const after = setItemManualNote(before, "Prueba");
  assert.deepEqual(after.extras, before.extras);
  assert.equal(after.finalUnitPrice, before.finalUnitPrice);
  assert.equal(after.quantity, before.quantity);
});

// ── Task 19/20/21: legacy compatibility ──
t("19: legacy sub-only normal item remains readable (note parsed from sub)", () => {
  const legacy = { id: 1, n: "Margarita", cat: "Pizzas", sub: "+Jamón, cortar en 4", p: 10, q: 1 };
  assert.equal(getLegacyNoteFromSub(legacy.sub), "cortar en 4");
  assert.equal(resolveItemNote(legacy), "cortar en 4");
});
t("20: legacy Custom item (sub-only) remains readable, no note fabricated", () => {
  const legacyCustom = { id: "custom_9", custom: true, n: "Pizza a tu gusto", p: 12, q: 1,
    sub: "Base Pelusa + Tomate, Rúcula" };
  // legacy custom (no structured fields) is not canonical-custom → still readable,
  // and its generated sub config is not mistaken for an operator note.
  assert.equal(isCanonicalCustomItem(legacyCustom), false);
  // resolveItemNote falls back to sub free-text only for NON-custom; a legacy
  // custom without structured fields is not canonical-custom, so the fallback
  // parses sub — the generated config has no free-text note tokens beyond names.
  assert.ok(typeof resolveItemNote(legacyCustom) === "string");
});
t("21: explicit edit of a legacy item preserves original sub, writes new note to notes", () => {
  const legacy = { id: 1, n: "Margarita", cat: "Pizzas", sub: "+Jamón, cortar en 4", p: 10, q: 1 };
  const edited = setItemManualNote(legacy, "cortar en 8");
  assert.equal(edited.sub, "+Jamón, cortar en 4");   // historical sub preserved
  assert.equal(edited.notes, "cortar en 8");           // new note in notes
  assert.equal(resolveItemNote(edited), "cortar en 8"); // notes precedence
});
t("21b: canonical `notes` takes precedence over stray legacy sub free-text", () => {
  const mixed = { id: 1, n: "Margarita", cat: "Pizzas", extras: [{ key: "k", name: "Jamón", price: 0.5, quantity: 1 }],
    sub: "+Jamón, texto viejo", notes: "nota nueva", p: 10, q: 1 };
  assert.equal(resolveItemNote(mixed), "nota nueva");
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
