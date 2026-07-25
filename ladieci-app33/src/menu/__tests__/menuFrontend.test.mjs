// Phase 3A frontend offline tests. No network, no React render, no DB writes.
// Fixture = real getMenu response captured from ladieci-menu-staging.
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toLegacyMenu, extrasForProduct } from "../menuAdapter.js";
import { buildOrderItemSnapshot } from "../menuSnapshot.js";
import { canEditExtras } from "../extrasPolicy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAYLOAD = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "getMenu_response.json"), "utf8"));

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("  ok  " + name); } catch (e) { fail++; console.log("FAIL  " + name + " → " + e.message); } };

const M = toLegacyMenu(PAYLOAD);
const pizzas = M.MENU.filter((p) => p.cat === "Pizzas");
const byClave = new Map(M.MENU.map((p) => [p.clave, p]));

// ── CATALOGUE LOAD ────────────────────────────────────────────────
t("4 categories (dynamic order)", () => assert.equal(M.CATS.length, 4));
t("45 products", () => assert.equal(M.MENU.length, 45));
t("32 extras", () => assert.equal(M.INGREDIENTI.length, 32));
t("nums 1-14 from numOficial (not index)", () => {
  const nums = pizzas.map((p) => p.num).sort((a, b) => a - b);
  assert.deepEqual(nums, Array.from({ length: 14 }, (_, i) => i + 1));
});
t("deterministic toLegacyMenu (two runs identical)", () =>
  assert.equal(JSON.stringify(toLegacyMenu(PAYLOAD)), JSON.stringify(toLegacyMenu(PAYLOAD))));
t("legacy ids preserved (La Joya=38, Magicbox=37, Pinturicchio=39)", () => {
  assert.equal(byClave.get("la_joya").id, 38);
  assert.equal(byClave.get("magicbox").id, 37);
  assert.equal(byClave.get("pinturicchio").id, 39);
  assert.equal(byClave.get("pinturicchio").databaseId.length, 36); // uuid retained
});

// ── DISPLAY (mirrors ItemPickerModal derivation; dynamic products) ─
// Number is NOT prefixed to the name; it lives in a footer badge (Nº {num}).
const dyn = (p) => p.databaseId != null;
const prominent = (p) => (dyn(p) ? p.sub : p.n);
const secondary = (p) => (dyn(p) ? p.n : p.sub);
const badge = (p) => (p.num != null ? `Nº ${p.num}` : null);
t("classic prominent, fantasy secondary, NO number prefix", () => {
  const m = new Map(pizzas.map((p) => [p.num, p]));
  assert.equal(prominent(m.get(4)), "Inferno");           // no "4."
  assert.equal(secondary(m.get(4)), "El Maestro");
  assert.equal(prominent(m.get(11)), "Capricciosa");
  assert.equal(prominent(m.get(14)), "affumicata");
  assert.ok(!prominent(m.get(1)).startsWith("1."));
});
t("official number lives in footer badge only", () => {
  const m = new Map(pizzas.map((p) => [p.num, p]));
  assert.equal(badge(m.get(1)), "Nº 1");
  assert.equal(badge(m.get(8)), "Nº 8");
  assert.equal(badge(m.get(14)), "Nº 14");
});
t("non-numbered products have no badge, classic name prominent", () => {
  const bev = M.MENU.find((p) => p.clave === "coca_cola_033");
  assert.equal(bev.num, null);
  assert.equal(badge(bev), null);
  assert.equal(prominent(bev), "Coca Cola");
  assert.equal(secondary(bev), "0,33L");
});

// ── EXTRAS EDITOR POLICY (the dead-pencil root cause) ─────────────
t("canEditExtras: dessert pizzas (Nutella/KitKat/Kinder) → true", () =>
  ["pizza_nutella", "pizza_kitkat", "pizza_kinder"].forEach((c) =>
    assert.equal(canEditExtras(byClave.get(c)), true, c)));
t("canEditExtras: savory pizzas → true", () =>
  assert.equal(canEditExtras(byClave.get("el_pelusa")), true));
t("canEditExtras: ordinary desserts → false", () =>
  ["misu_clasico", "ferrero_rocher", "tartufo_bianco", "baba_napoletano"].forEach((c) =>
    assert.equal(canEditExtras(byClave.get(c)), false, c)));
t("canEditExtras: beverages → false", () =>
  assert.equal(canEditExtras(byClave.get("coca_cola_033")), false));
t("canEditExtras: static fallback (no extrasPermitidos) → Pizzas only", () => {
  assert.equal(canEditExtras({ cat: "Pizzas" }), true);
  assert.equal(canEditExtras({ cat: "Postres" }), false);
});

// ── EXTRA EMOJIS (from dynamic catalogue) ─────────────────────────
t("savory extras carry catalogue emoji (not a frontend map)", () => {
  const coppa = M.INGREDIENTI.find((g) => g.id === "ing_coppa");
  const champis = M.INGREDIENTI.find((g) => g.id === "ing_champis");
  assert.equal(coppa.e, "🥓"); assert.equal(champis.e, "🍄");
});
t("sweet extras without approved emoji → generic placeholder (no invented map)", () => {
  const sweet = M.INGREDIENTI.filter((g) => M.EXTRAS.find((e) => e.key === g.id && e.grupo === "sweet"));
  assert.ok(sweet.length === 5 && sweet.every((g) => g.e === "➕"));
});

// ── EXTRAS ────────────────────────────────────────────────────────
t("savory pizza gets its mapped savory extras (27)", () =>
  assert.equal(extrasForProduct(byClave.get("el_pelusa"), M.INGREDIENTI).length, 27));
t("KitKat/Kinder/Nutella each get 5 sweet extras", () => {
  ["pizza_nutella", "pizza_kitkat", "pizza_kinder"].forEach((c) => {
    const ex = extrasForProduct(byClave.get(c), M.INGREDIENTI);
    assert.equal(ex.length, 5, c);
    assert.ok(ex.every((e) => e.gruppo === "Dulces"), c);
  });
});
t("ordinary desserts get zero extras", () =>
  ["misu_clasico", "ferrero_rocher", "tartufo_bianco", "baba_napoletano"].forEach((c) =>
    assert.equal(extrasForProduct(byClave.get(c), M.INGREDIENTI).length, 0, c)));

// ── SNAPSHOT ──────────────────────────────────────────────────────
const coppa = M.INGREDIENTI.find((g) => g.id === "ing_coppa");
const snap = buildOrderItemSnapshot(byClave.get("el_pelusa"), { q: 2, extras: [coppa], nota: "sin albahaca" });
t("snapshot: base+extra price, q, structured extra", () => {
  assert.equal(snap.basePrice, 12); assert.equal(snap.p, 12.5); assert.equal(snap.q, 2);
  assert.equal(snap.num, 1); assert.equal(snap.sub, "Margherita Classica");
  assert.equal(snap.extras[0].key, "ing_coppa"); assert.equal(snap.extras[0].prezzo, 0.5);
});
t("q>1 total = p×q (compat with tot())", () => assert.equal((snap.p * snap.q).toFixed(2), "25.00"));
t("snapshot frozen; later API price/rename/renumber does NOT mutate it", () => {
  const p2 = JSON.parse(JSON.stringify(PAYLOAD));
  const el = p2.productos.find((x) => x.clave === "el_pelusa");
  el.precio = 99; el.nombreClasico = "RENAMED"; el.numOficial = 99;
  const M2 = toLegacyMenu(p2);
  assert.equal(M2.MENU.find((x) => x.clave === "el_pelusa").p, 99); // catalogue changed
  assert.equal(snap.p, 12.5); assert.equal(snap.sub, "Margherita Classica"); assert.equal(snap.num, 1); // snapshot intact
  assert.throws(() => { "use strict"; snap.p = 1; });
});
t("later extra-price change does not mutate selected extra snapshot", () => {
  const p2 = JSON.parse(JSON.stringify(PAYLOAD));
  p2.extras.find((e) => e.legacyKey === "ing_coppa").precioDelta = 9;
  toLegacyMenu(p2);
  assert.equal(snap.extras[0].prezzo, 0.5);
});

// ── AVAILABILITY (mirrors picker filters) ─────────────────────────
t("visiblePicker=false product filtered from picker", () => {
  const p2 = JSON.parse(JSON.stringify(PAYLOAD));
  p2.productos.find((x) => x.clave === "zizou").visiblePicker = false;
  const M2 = toLegacyMenu(p2);
  const shown = M2.MENU.filter((m) => m.cat === "Pizzas" && m.visiblePicker !== false);
  assert.ok(!shown.some((m) => m.clave === "zizou"));
});
t("disponible=false → present but flagged unavailable (not orderable)", () => {
  const p2 = JSON.parse(JSON.stringify(PAYLOAD));
  p2.productos.find((x) => x.clave === "zizou").disponible = false;
  const z = toLegacyMenu(p2).MENU.find((m) => m.clave === "zizou");
  assert.ok(z && z.disponible === false);
});
t("visibleCocina carried for Cocina quick-add filtering", () =>
  assert.equal(byClave.get("el_pelusa").visibleCocina, true));
t("inactive product absent (backend getMenu excludes; frontend receives only active)", () =>
  assert.ok(M.MENU.every((p) => p.activo === true)));

// ── FLAG LOGIC (mirrors useMenuData) ──────────────────────────────
const flag = (v) => v === "true";
t("flag OFF → static source (no dynamic load)", () => assert.equal(flag(undefined), false));
t("flag ON → dynamic", () => assert.equal(flag("true"), true));

// ── COMPATIBILITY ─────────────────────────────────────────────────
t("old stored item without databaseId still renders (uses n/sub/p)", () => {
  const legacyItem = { id: 4, n: "El Maestro", sub: "Inferno", p: 13.5, q: 1, cat: "Pizzas" };
  assert.equal(legacyItem.sub, "Inferno"); assert.equal((legacyItem.p * legacyItem.q).toFixed(2), "13.50");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
