// Test statico mirato — COCINA_CARD_PIXEL_GRID
// Standalone: `node cocinaCardPixelGrid.static.test.mjs`
//
// Griglia visiva unica per le card Cocina (TabCocina.jsx + PanelCocina.jsx):
//   A) TOP SLOT / ribbon ad altezza FISSA (RIBBON_H) uguale per delivery e retiro
//      → l'header verde parte sempre alla stessa quota (niente vuoto bianco sopra i LOCO);
//   B) delivery ribbon = accent (zona/giro) `🚚 DELIVERY[· G{seq}]`; retiro ribbon slate `🏠 RETIRO`;
//   C) header con minHeight fisso (grid floor);
//   D) cliente SOTTO il numero ordine (stacked), id dominante;
//   E) chip ora forno VERDE uniforme (LOCO == DELIVERY), niente branch isDelivery;
//   F) nome pizza reale su riga piena con clamp a 2 righe (niente troncamento brutto);
//   G) preservati: no GIRO MANUAL, no scooter, no zona chip, LISTO, oven time.
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

console.log("\n══ COCINA CARD — PIXEL GRID (static) ══");

for (const [name, src] of [["TabCocina", tab], ["PanelCocina", panel]]) {
  // A. RIBBON_H definito e usato come altezza fissa del top slot
  ck(`${name}: RIBBON_H definito e usato come height del top slot`, () => {
    assert.ok(/const RIBBON_H = 26;/.test(src), "RIBBON_H definito");
    assert.ok(/height:RIBBON_H,flexShrink:0,boxSizing:"border-box"/.test(src), "top slot height:RIBBON_H");
  });
  // B. top slot SEMPRE presente: delivery mostra label; TabCocina può mostrare
  // anche il badge Mesa richiesto dal flusso ristorante; gli altri pickup restano muti.
  ck(`${name}: top slot sempre presente — delivery / Mesa label, altri pickup muti`, () => {
    if (name === "TabCocina") {
      assert.ok(/(?:o\.)?isDelivery \? \(giroAccent \|\| zonaColore\) : \(mesaNumber \? "#8B5CF6" : fc\.bg\)/.test(src),
        "bg delivery-accent / Mesa viola / altro pickup colore header");
    } else {
      assert.ok(/(?:o\.)?isDelivery \? \(giroAccent \|\| zonaColore\) : fc\.bg(?:Light)?/.test(src),
        "bg delivery-accent / non-delivery = colore header");
    }
    // contenuto delivery `🚚 DELIVERY[· G{seq}]`
    assert.ok(/(?:o\.)?isDelivery\s*\?\s*<>🚚 DELIVERY\{o\.manualGiro \? ` · \$\{formatManualGiroLabel\(o\.manualGiro\)\}` : ""\}<\/>/.test(src),
      "contenuto delivery `🚚 DELIVERY[· G{seq}]`");
    if (name === "TabCocina") {
      assert.ok(/: mesaNumber \? <>🍽 MESA \{mesaNumber\}<\/> : null\}/.test(src),
        "Mesa mostra numero; altro pickup resta muto");
    } else {
      assert.ok(/<>🚚 DELIVERY[\s\S]*?<\/>\s*: null\}/.test(src), "non-delivery slot muto (else null)");
    }
  });
  // B2. non-delivery NON mostra testo/label nel top slot (no RITIRO/LOCO/🏠)
  ck(`${name}: non-delivery slot silenzioso (no RITIRO/LOCO/🏠)`, () => {
    assert.ok(!/🏠/.test(src), "niente icona casa nel top slot");
    assert.ok(!/RETIRO/.test(src), "niente label RETIRO");
    assert.ok(!/RITIRO/.test(src), "niente label RITIRO");
    assert.ok(!/LOCO/.test(src), "niente label LOCO");
  });
  // C. header con minHeight fisso (grid floor)
  ck(`${name}: header con minHeight fisso`, () => {
    assert.ok(/padding:"12px 16px",minHeight:88,boxSizing:"border-box"/.test(src));
  });
  // D. cliente SOTTO il numero ordine (stacked), id dominante (mono 900 / 24)
  ck(`${name}: cliente stacked sotto id dominante`, () => {
    assert.ok(/fontFamily:"'DM Mono',monospace",fontWeight:900,color:[^,}]+,fontSize:24,lineHeight:1\}\}>\{formatOrderNumber\(o\)\}<\/div>/.test(src),
      "id dominante 24px mono");
    assert.ok(/\{formatOrderNumber\(o\)\}<\/div>\s*<div[^>]*textOverflow:"ellipsis"[^>]*>👤 \{o\.nombre\}<\/div>/.test(src),
      "cliente nel div successivo con ellipsis");
    assert.ok(!/alignItems:"baseline"[\s\S]{0,120}?👤 \{o\.nombre\}/.test(src), "niente baseline row");
  });
  // E. chip ora forno VERDE uniforme (nessun branch isDelivery)
  ck(`${name}: chip ora forno verde uniforme`, () => {
    assert.ok(/background:"#16A34A",\s*border:"1\.5px solid #0E7A38"/.test(src), "chip verde #16A34A");
    assert.ok(!/background: o\.isDelivery \? "#F97316"/.test(src), "niente branch arancio/verde");
    assert.ok(!/o\.isDelivery \? "⏱" : "🕐"/.test(src), "niente icona condizionata");
  });
  // F. nome pizza reale con clamp a 2 righe (niente troncamento brutto)
  ck(`${name}: nome pizza reale con clamp 2 righe`, () => {
    assert.ok(/const realName = /.test(src), "realName definito");
    assert.ok(/display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"\}\}>\s*\{realName\}/.test(src),
      "nome reale con WebkitLineClamp:2");
  });
  // G. preservazioni
  ck(`${name}: "GIRO MANUAL" assente`, () => { assert.ok(!/GIRO MANUAL/.test(src)); });
  ck(`${name}: hora scooter (>🛵<) assente`, () => { assert.ok(!/>🛵</.test(src)); });
  ck(`${name}: chip zona ({o.zona} en <span>) assente`, () => { assert.ok(!/\{o\.zona\}<\/span>/.test(src)); });
  ck(`${name}: LISTO + ora forno preservati`, () => {
    assert.ok(/✅ LISTO/.test(src));
    assert.ok(/\{o\.horaForno \|\| o\.hora\}/.test(src));
  });
  // grouping visivo giro (border) preservato
  ck(`${name}: grouping visivo giro (giroAccent border) preservato`, () => {
    assert.ok(/giroAccent \? `4px solid \$\{giroAccent\}`/.test(src));
  });
}

// Source guard — viste esterne NON toccate
const entregas = readFileSync(join(COMP, "entregas", "TabEntregas.jsx"), "utf8");
const repartidor = readFileSync(join(COMP, "repartidor", "RepartidorPage.jsx"), "utf8");
const nuevoPedido = readFileSync(join(COMP, "NuevoPedidoModal.jsx"), "utf8");

ck("Entregas: hora scooter (🛵) ANCORA presente", () => { assert.ok(/🛵/.test(entregas)); });
ck("Repartidor: hora scooter (🛵) ANCORA presente", () => { assert.ok(/🛵/.test(repartidor)); });
ck("Marker COCINA_CARD_PIXEL_GRID vive SOLO in Cocina", () => {
  assert.ok(!/COCINA_CARD_PIXEL_GRID/.test(entregas));
  assert.ok(!/COCINA_CARD_PIXEL_GRID/.test(repartidor));
  assert.ok(!/COCINA_CARD_PIXEL_GRID/.test(nuevoPedido));
});

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
