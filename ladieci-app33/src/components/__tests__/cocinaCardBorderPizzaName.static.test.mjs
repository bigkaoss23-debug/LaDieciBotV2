// Test statico mirato — COCINA_CARD_BORDER_WEIGHT_AND_PIZZA_NAME_LAYOUT
// Standalone: `node cocinaCardBorderPizzaName.static.test.mjs`
//
// Rifinitura card Cocina (TabCocina.jsx + PanelCocina.jsx):
//   A) contorno UNIFORME 4px per pickup e delivery (era 2px sui pickup) +
//      halo pieno anche sui non-delivery (rinforzato in late/tarde) → peso
//      visivo coerente riga per riga;
//   B) blocco prodotto ESPLICITO e stabile: badge ×N a sinistra; a destra
//      colonna [riga1 = nome breve/tag, riga2 = nome vero grande]; ingredienti sotto;
//   C) invariati: top slot non-delivery MUTO, delivery con `🚚 DELIVERY`.
//
// Asserzioni sul render (non sui commenti), mirate al markup esatto.

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMP = join(HERE, "..");
const COCINA = join(COMP, "cocina");
const tab = readFileSync(join(COCINA, "TabCocina.jsx"), "utf8");
const panel = readFileSync(join(COCINA, "PanelCocina.jsx"), "utf8");

let pass = 0, fail = 0;
const ck = (label, fn) => {
  try { fn(); pass++; console.log("  ✓", label); }
  catch (e) { fail++; console.log("  ✗", label, "—", e.message); }
};

console.log("\n══ COCINA CARD — BORDER WEIGHT & PIZZA NAME (static) ══");

for (const [name, src] of [["TabCocina", tab], ["PanelCocina", panel]]) {
  // A. bordo UNIFORME 4px — non-delivery ora 4px (non più 2px)
  ck(`${name}: contorno non-delivery 4px (uniforme con delivery)`, () => {
    assert.ok(/: `4px solid \$\{fc\.border\}`/.test(src), "non-delivery border 4px");
    assert.ok(!/: `2px solid \$\{fc\.border\}`/.test(src), "niente più border 2px sui pickup");
    assert.ok(/(?:o\.)?isDelivery \? `4px solid \$\{zonaColore\}`/.test(src), "delivery border 4px zonaColore");
  });
  // A2. halo non-delivery presente anche non-urgent + rinforzato in tarde/urgent
  ck(`${name}: halo non-delivery presente (ring) + rinforzato late/tarde`, () => {
    assert.ok(/0 0 0 4px \$\{fc\.border\}88, 0 6px 24px \$\{fc\.border\}55/.test(src), "halo urgente 4px pieno");
    assert.ok(/0 0 0 3px (?:\$\{fc\.border\}|" \+ fc\.border \+ ")44, 0 4px 16px rgba\(0,0,0,0\.15\)/.test(src), "ring base non-urgent");
  });
  // B. blocco prodotto: badge ×N nero a sinistra, poi colonna [tag / nome vero]
  ck(`${name}: badge ×N nero + colonna [tag / nome vero]`, () => {
    assert.ok(/background:"#111",color:"#fff",flexShrink:0,[\s\S]{0,240}?×\{it\.q\}/.test(src), "badge ×N nero");
    assert.ok(/×\{it\.q\}<\/span>\s*<div style=\{\{display:"flex",flexDirection:"column"/.test(src),
      "badge seguito da colonna verticale (tag sopra, nome vero sotto)");
  });
  // B2. riga 1 = nome breve/tag (secondario)
  ck(`${name}: riga 1 = nome breve/tag`, () => {
    assert.ok(/const tagName\s+= /.test(src), "tagName definito");
    assert.ok(/color:"#6B7280"[\s\S]{0,220}?\{tagName\}<\/span>/.test(src), "tag secondario grigio");
  });
  // B3. riga 2 = nome vero grande con clamp 2 righe
  ck(`${name}: riga 2 = nome vero (clamp 2 righe)`, () => {
    assert.ok(/const realName = /.test(src), "realName definito");
    assert.ok(/display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"\}\}>\{realName\}/.test(src),
      "nome vero con WebkitLineClamp:2");
  });
  // B4. ingredienti sotto
  ck(`${name}: ingredienti sotto (secondari)`, () => {
    assert.ok(/fontFamily:SYS_FONT,color:"#(?:555|777)",fontSize:compact\?1[01]:1[23],fontWeight:500[\s\S]{0,80}?\{nomeIng\}/.test(src));
  });
  // C. Mesa può avere il riferimento operativo; gli altri pickup restano muti.
  ck(`${name}: top slot Mesa consentita; altri pickup muti`, () => {
    if (name === "TabCocina") {
      assert.ok(/: messaNumber \? <>🍽 MESA \{messaNumber\}<\/> : null\}/.test(src),
        "Mesa mostra numero; altro pickup resta muto");
    } else {
      assert.ok(/<>🚚 DELIVERY[\s\S]*?<\/>\s*: null\}/.test(src), "non-delivery slot muto");
    }
    assert.ok(!/🏠/.test(src) && !/RETIRO/.test(src) && !/RITIRO/.test(src) && !/LOCO/.test(src),
      "niente label RITIRO/LOCO/🏠");
  });
  // C2. delivery mantiene `🚚 DELIVERY[· G{seq}]`
  ck(`${name}: delivery mantiene 🚚 DELIVERY`, () => {
    assert.ok(/<>🚚 DELIVERY\{o\.manualGiro \? ` · \$\{formatManualGiroLabel\(o\.manualGiro\)\}` : ""\}<\/>/.test(src));
  });
  // extra: LISTO + ora forno preservati
  ck(`${name}: LISTO + ora forno preservati`, () => {
    assert.ok(/✅ LISTO/.test(src));
    assert.ok(/\{o\.horaForno \|\| o\.hora\}/.test(src));
  });
}

// Source guard — viste esterne NON toccate
const entregas = readFileSync(join(COMP, "entregas", "TabEntregas.jsx"), "utf8");
const repartidor = readFileSync(join(COMP, "repartidor", "RepartidorPage.jsx"), "utf8");
const nuevoPedido = readFileSync(join(COMP, "NuevoPedidoModal.jsx"), "utf8");

ck("Entregas: hora scooter (🛵) ANCORA presente", () => { assert.ok(/🛵/.test(entregas)); });
ck("Repartidor: hora scooter (🛵) ANCORA presente", () => { assert.ok(/🛵/.test(repartidor)); });
ck("Marker COCINA_CARD_PIZZA_NAME vive SOLO in Cocina", () => {
  assert.ok(!/COCINA_CARD_PIZZA_NAME/.test(entregas));
  assert.ok(!/COCINA_CARD_PIZZA_NAME/.test(repartidor));
  assert.ok(!/COCINA_CARD_PIZZA_NAME/.test(nuevoPedido));
});

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
