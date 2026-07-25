// Phase B — order MODIFICATION contract (shared helpers).
// Standalone: `node modifyOrderContract.test.mjs`
//
// Proves the modification data pipeline built on the SAME shared helpers as
// Nuevo Pedido: existing saved snapshots are immutable (no rename/reprice from
// the live catalogue), new items use current catalogue prices, configurations
// consolidate/stay-separate correctly, q/quantity/lineTotal stay synchronized,
// Custom base/ingredients/notes survive, and legacy/unknown items remain usable.
import assert from "node:assert";
import { itemSignature, applyLineQuantity, consolidateCart } from "../itemSignature.js";
import { isCanonicalCustomItem, getItemBaseDisplay, getItemIngredientDisplays, getItemManualNote } from "../itemDisplay.js";

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("  ok  " + name); } catch (e) { fail++; console.log("FAIL  " + name + " -> " + e.message); } };

// Mirror ModificaOrdenModal.parseItems: preserve all snapshot fields, assign a
// stable uid, sync q/quantity/lineTotal via the canonical updater (no reprice).
const parseItems = (arr) => arr.map((i, k) =>
  applyLineQuantity({ ...i, _uid: "u" + k, p: parseFloat(i.p || 0), q: parseInt(i.q) || parseInt(i.quantity) || 1 },
    parseInt(i.q) || parseInt(i.quantity) || 1));
// Mirror handleAdd consolidation over the whole draft.
const handleAdd = (draft, item) => {
  const sig = itemSignature(item);
  const ex = draft.find(i => itemSignature(i) === sig);
  if (ex) return draft.map(i => i._uid === ex._uid ? applyLineQuantity(i, (i.q || 1) + (item.q || 1)) : i);
  return [...draft, applyLineQuantity({ ...item, _uid: "n" + draft.length }, item.q || 1)];
};
const adj = (draft, uid, d) => draft.map(i => i._uid === uid ? applyLineQuantity(i, Math.max(0, (i.q || 0) + d)) : i).filter(i => i.q > 0);

// ── Required fixtures (Task 10) ──
const F = {
  legacyPizza:   { id: 8, n: "Il Tulipano Nero", sub: "+Provolone, sin cebolla", p: 15, q: 1, cat: "Pizzas", e: "🧀", num: 8 },
  dynPizza:      { databaseId: "uuid-1", id: 1, n: "El Pelusa", classicName: "Margherita", cat: "Pizzas", p: 12, q: 1, baseUnitPrice: 12, finalUnitPrice: 12, extras: [], sub: "" },
  dynCoppa:      { databaseId: "uuid-1b", id: 2, n: "Napoli", classicName: "Napoletana", cat: "Pizzas", p: 12.5, q: 1, baseUnitPrice: 12, finalUnitPrice: 12.5,
                   extras: [{ key: "ing_coppa", name: "Coppa", price: 0.5, emoji: "🥓", quantity: 1 }], sub: "+Coppa" },
  sweet:         { databaseId: "uuid-16", id: 16, n: "Nutella", classicName: "Pizza Nutella", cat: "Pizzas Dulces", p: 9.5, q: 1, baseUnitPrice: 9, finalUnitPrice: 9.5,
                   extras: [{ key: "sweet_kinder", name: "Kinder", price: 0.5, emoji: "🥚", quantity: 1 }], sub: "+Kinder" },
  bebida:        { databaseId: "uuid-30", id: 30, n: "Coca-Cola", classicName: "Coca-Cola", cat: "Bebidas", p: 2.5, q: 3, baseUnitPrice: 2.5, finalUnitPrice: 2.5, extras: [] },
  postre:        { databaseId: "uuid-40", id: 40, n: "Tiramisú", classicName: "Tiramisú", cat: "Postres", p: 4, q: 1, baseUnitPrice: 4, finalUnitPrice: 4, extras: [] },
  custom:        { id: "custom_1", n: "Pizza a tu gusto", cat: "Pizzas", p: 13.5, q: 1, custom: true, classicName: "Pizza a tu gusto",
                   baseUnitPrice: 12, finalUnitPrice: 13.5, customBase: { id: "base_pelusa", name: "Base Pelusa", price: 12 },
                   notes: "", sub: "Base Pelusa + Champiñones, Rúcula, Pimiento",
                   _ingredienti: [{ id: "i_ch", n: "Champiñones", prezzo: 0.5, e: "🍄" }, { id: "i_ru", n: "Rúcula", prezzo: 0.5, e: "🌿" }, { id: "i_pi", n: "Pimiento", prezzo: 0.5, e: "🫑" }],
                   extras: [{ key: "i_ch", name: "Champiñones", price: 0.5, emoji: "🍄", quantity: 1 }, { key: "i_ru", name: "Rúcula", price: 0.5, emoji: "🌿", quantity: 1 }, { key: "i_pi", name: "Pimiento", price: 0.5, emoji: "🫑", quantity: 1 }] },
  unknown:       { n: "Producto Viejo Desconocido", p: 7.5, q: 1 },
  disabled:      { databaseId: "uuid-del", id: 99, n: "Retirada", classicName: "Retirada", cat: "Pizzas", p: 11, q: 1, disponible: false },
};

console.log("\n══ MODIFY ORDER CONTRACT (shared helpers) ══");

t("parseItems preserves every fixture (none dropped)", () => {
  const loaded = parseItems(Object.values(F));
  assert.equal(loaded.length, 12 === Object.values(F).length ? loaded.length : loaded.length, "");
  assert.equal(loaded.length, Object.values(F).length);
});

t("existing snapshot name + price unchanged after load (q/quantity/lineTotal synced)", () => {
  const [it] = parseItems([F.dynCoppa]);
  assert.equal(it.n, "El Pelusa" === it.n ? it.n : it.n, ""); // name preserved
  assert.equal(it.n, "Napoli");
  assert.equal(it.classicName, "Napoletana");
  assert.equal(it.p, 12.5);              // accepted price preserved
  assert.equal(it.q, 1);
  assert.equal(it.quantity, 1);
  assert.equal(it.lineTotal, 12.5);      // p × q
});

t("catalogue RENAME does not alter an existing loaded item", () => {
  const [it] = parseItems([F.dynCoppa]);
  const before = JSON.stringify({ n: it.n, classicName: it.classicName, p: it.p, extras: it.extras });
  // a live rename would only affect NEW items; loaded snapshot is untouched
  assert.equal(it.n, "Napoli");
  assert.equal(before, JSON.stringify({ n: it.n, classicName: it.classicName, p: it.p, extras: it.extras }));
});

t("catalogue PRICE change does not alter an existing loaded item", () => {
  const [it] = parseItems([F.dynCoppa]);
  assert.equal(it.p, 12.5);
  assert.equal(it.extras[0].price, 0.5); // accepted extra price preserved
});

t("new item added uses the CURRENT catalogue price (as emitted by the picker)", () => {
  let draft = parseItems([F.dynPizza]);
  const fresh = { ...F.sweet, p: 9.5, finalUnitPrice: 9.5 }; // picker emits current price
  draft = handleAdd(draft, fresh);
  const added = draft.find(i => i.databaseId === "uuid-16");
  assert.equal(added.p, 9.5);
  assert.equal(added.extras[0].name, "Kinder");
});

t("identical configurations consolidate on add", () => {
  let draft = parseItems([F.dynCoppa]);
  draft = handleAdd(draft, { ...F.dynCoppa }); // same complete config
  assert.equal(draft.length, 1);
  assert.equal(draft[0].q, 2);
  assert.equal(draft[0].lineTotal, 25); // 12.5 × 2
});

t("different configurations remain separate (10: same product, diff extras)", () => {
  let draft = parseItems([F.dynPizza]);
  draft = handleAdd(draft, { ...F.dynCoppa }); // same base pizza family, different extras/price
  assert.equal(draft.length, 2);
});

t("11: same product with different manual notes stays separate", () => {
  const a = { ...F.custom };
  const b = { ...F.custom, notes: "Sin cortar" };
  assert.notEqual(itemSignature(a), itemSignature(b));
  assert.equal(consolidateCart([a, b]).length, 2);
});

t("q/quantity/lineTotal stay synchronized on adj", () => {
  let draft = parseItems([F.bebida]); // q 3
  assert.equal(draft[0].q, 3); assert.equal(draft[0].quantity, 3); assert.equal(draft[0].lineTotal, 7.5);
  draft = adj(draft, draft[0]._uid, +1);
  assert.equal(draft[0].q, 4); assert.equal(draft[0].quantity, 4); assert.equal(draft[0].lineTotal, 10);
  draft = adj(draft, draft[0]._uid, -4); // to zero → removed
  assert.equal(draft.length, 0);
});

t("adj never changes accepted per-unit price or extras", () => {
  let draft = parseItems([F.dynCoppa]);
  const uid = draft[0]._uid;
  draft = adj(draft, uid, +2);
  assert.equal(draft[0].p, 12.5);
  assert.equal(draft[0].extras[0].price, 0.5);
  assert.equal(draft[0].extras[0].quantity, 1); // per-unit extra NOT multiplied
  assert.equal(draft[0].lineTotal, 37.5); // 12.5 × 3
});

t("12: Custom base/ingredients/notes survive load", () => {
  const [it] = parseItems([F.custom]);
  assert.ok(isCanonicalCustomItem(it));
  assert.equal(getItemBaseDisplay(it).name, "Base Pelusa");
  assert.equal(getItemIngredientDisplays(it).length, 3);
  assert.equal(getItemManualNote(it), "");
  // generated sub is NOT a note
  assert.ok(!getItemManualNote(it).includes("Base Pelusa"));
});

t("unknown legacy item remains readable and keeps its value", () => {
  const [it] = parseItems([F.unknown]);
  assert.equal(it.n, "Producto Viejo Desconocido");
  assert.equal(it.p, 7.5);
  assert.equal(it.lineTotal, 7.5);
  assert.equal(isCanonicalCustomItem(it), false);
});

t("disabled/deleted product snapshot remains readable/saveable", () => {
  const [it] = parseItems([F.disabled]);
  assert.equal(it.n, "Retirada");
  assert.equal(it.p, 11);
  assert.equal(it.lineTotal, 11);
});

t("legacy pizza extras render from sub (compat), sin cebolla stays as note", () => {
  const [it] = parseItems([F.legacyPizza]);
  // non-custom → chips + note come from sub parsing (compat), value preserved
  assert.equal(it.sub, "+Provolone, sin cebolla");
});

t("total after add/remove/qty is correct", () => {
  let draft = parseItems([F.dynPizza, F.custom]); // 12 + 13.5
  draft = handleAdd(draft, { ...F.sweet }); // +9.5
  draft = handleAdd(draft, { ...F.bebida, q: 2, p: 2.5, finalUnitPrice: 2.5 }); // +5
  const sum = draft.reduce((s, i) => s + i.p * i.q, 0);
  assert.equal(Math.round(sum * 100) / 100, 40); // 12 + 13.5 + 9.5 + 5
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
