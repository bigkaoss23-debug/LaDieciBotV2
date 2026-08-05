// Test statico mirato — COCINA_DELIVERY_VISUAL_CONTRACT
// Standalone: `node cocinaDeliveryVisualContract.static.test.mjs`
//
// Contratto visivo delivery UNIFICATO in Cocina (TabCocina.jsx + PanelCocina.jsx):
//   - OGNI delivery (singolo o giro manuale) riceve la STESSA fascia "DELIVERY";
//   - la differenza singolo vs giro manuale è SOLO: accent (zona vs giro) +
//     suffisso `· G{seq}`;
//   - LOCO/RITIRO (!isDelivery) NON riceve la fascia;
//   - label alto contrasto (#fff + textShadow scuro rinforzato);
//   - preservate le rifiniture precedenti (header su una riga, ora forno, LISTO,
//     niente zona Q*, niente scooter, niente vecchio "GIRO MANUAL").
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

console.log("\n══ COCINA DELIVERY — VISUAL CONTRACT (static) ══");

for (const [name, src] of [["TabCocina", tab], ["PanelCocina", panel]]) {
  // 1. giro manuale → `DELIVERY · G{seq}` (suffisso gated da o.manualGiro)
  ck(`${name}: giro manuale rende "DELIVERY · G{seq}"`, () => {
    assert.ok(
      /🚚 DELIVERY\{o\.manualGiro \? ` · \$\{formatManualGiroLabel\(o\.manualGiro\)\}` : ""\}/.test(src),
      "il suffisso · G{seq} deve essere condizionato a o.manualGiro"
    );
  });
  // 2. delivery singolo → "DELIVERY" senza `· G1` fisso (niente vecchia forma statica)
  ck(`${name}: delivery singolo rende "DELIVERY" senza · G1 fisso`, () => {
    assert.ok(/🚚 DELIVERY\{o\.manualGiro \?/.test(src), "base label 🚚 DELIVERY presente");
    assert.ok(!/🚚 DELIVERY · \{formatManualGiroLabel/.test(src), "niente suffisso · G{seq} statico");
  });
  // 3. TOP SLOT: delivery mostra la label; TabCocina può mostrare anche Mesa N.
  ck(`${name}: ribbon — DELIVERY solo delivery; Mesa consentita in TabCocina`, () => {
    assert.ok(
      /(?:o\.)?isDelivery\s*\?\s*<>🚚 DELIVERY/.test(src),
      "il contenuto DELIVERY del ribbon deve essere gated da isDelivery"
    );
    if (name === "TabCocina") {
      assert.ok(/: mesaNumber \? <>🍽 MESA \{mesaNumber\}<\/> : null\}/.test(src),
        "Mesa mostra numero; altro pickup resta muto");
    } else {
      assert.ok(/<>🚚 DELIVERY[\s\S]*?<\/>\s*: null\}/.test(src), "non-delivery = slot muto (else null)");
    }
    assert.ok(!/🏠/.test(src), "niente label/icona per non-delivery");
  });
  // 4. giro manuale usa accent giro (grouped/manual): background giroAccent-first + palette
  ck(`${name}: giro manuale usa accent giro (giroAccent-first + manualGiroAccentColor)`, () => {
    assert.ok(/background: (?:o\.)?isDelivery \? \(giroAccent \|\| zonaColore\)/.test(src), "ribbon: giroAccent ha precedenza per delivery");
    assert.ok(/manualGiroAccentColor\(o\.manualGiro\)/.test(src), "accent giro dal manualGiroAccentColor");
    assert.ok(/giroAccent \? `4px solid \$\{giroAccent\}`/.test(src), "border giro = 4px giroAccent");
  });
  // 5. delivery singolo usa accent zona: fallback zonaColore nel ribbon + border zona
  ck(`${name}: delivery singolo usa accent zona (zonaColore)`, () => {
    const ribbonBg = name === "TabCocina"
      ? /background: (?:o\.)?isDelivery \? \(giroAccent \|\| zonaColore\) : \(mesaNumber \? "#8B5CF6" : fc\.bg\)/
      : /background: (?:o\.)?isDelivery \? \(giroAccent \|\| zonaColore\) : fc\.bg(?:Light)?/;
    assert.ok(ribbonBg.test(src), "ribbon: fallback zonaColore delivery / Mesa o colore header non-delivery");
    assert.ok(/(?:o\.)?isDelivery \? `4px solid \$\{zonaColore\}`/.test(src), "border delivery = 4px zonaColore");
  });
  // 6. "GIRO MANUAL" assente
  ck(`${name}: "GIRO MANUAL" assente`, () => {
    assert.ok(!/GIRO MANUAL/.test(src));
  });
  // 7. fila hora scooter (🛵) assente in Cocina
  ck(`${name}: hora scooter (>🛵<) assente`, () => {
    assert.ok(!/>🛵</.test(src));
  });
  // 8. chip zona Q* assente in Cocina
  ck(`${name}: chip zona ({o.zona} en <span>) assente`, () => {
    assert.ok(!/\{o\.zona\}<\/span>/.test(src));
  });
  // 9. ora forno/uscita resta
  ck(`${name}: ora forno/uscita ({o.horaForno || o.hora}) presente`, () => {
    assert.ok(/\{o\.horaForno \|\| o\.hora\}/.test(src));
  });
  // 10. bottone LISTO resta
  ck(`${name}: bottone LISTO (✅ LISTO) presente`, () => {
    assert.ok(/✅ LISTO/.test(src));
  });
  // 11. header id + cliente STACKED (cliente sotto il numero ordine — pixel grid)
  ck(`${name}: header cliente sotto il numero ordine (stacked)`, () => {
    assert.ok(/\{formatOrderNumber\(o\)\}<\/div>\s*<div[^>]*textOverflow:"ellipsis"[^>]*>👤 \{o\.nombre\}<\/div>/.test(src),
      "id in un div e cliente nel div successivo (stacked)");
    assert.ok(!/alignItems:"baseline"[\s\S]{0,120}?👤 \{o\.nombre\}/.test(src),
      "niente baseline row attorno al cliente");
  });
  // 12. ribbon alto contrasto: #fff + textShadow scuro
  ck(`${name}: ribbon alto contrasto (#fff + textShadow)`, () => {
    assert.ok(
      /color:"#fff",fontSize:12,fontWeight:900,letterSpacing:\.7,textTransform:"uppercase",[\s\S]*?textShadow:"0 1px 3px rgba\(0,0,0,0\.55\)"/.test(src),
      "ribbon: #fff + textShadow scuro"
    );
  });
}

// ── Source guard: viste esterne NON toccate ──────────────────────────────
const entregas = readFileSync(join(COMP, "entregas", "TabEntregas.jsx"), "utf8");
const repartidor = readFileSync(join(COMP, "repartidor", "RepartidorPage.jsx"), "utf8");
const nuevoPedido = readFileSync(join(COMP, "NuevoPedidoModal.jsx"), "utf8");

ck("Entregas: hora scooter (🛵) ANCORA presente (no tocada)", () => {
  assert.ok(/🛵/.test(entregas));
});
ck("Repartidor: hora scooter (🛵) ANCORA presente (no tocada)", () => {
  assert.ok(/🛵/.test(repartidor));
});
ck("Fascia DELIVERY vive SOLO in Cocina (Entregas/Repartidor/NuevoPedido intatti)", () => {
  assert.ok(!/🚚 DELIVERY\{o\.manualGiro/.test(entregas));
  assert.ok(!/🚚 DELIVERY\{o\.manualGiro/.test(repartidor));
  assert.ok(!/🚚 DELIVERY\{o\.manualGiro/.test(nuevoPedido));
});

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
