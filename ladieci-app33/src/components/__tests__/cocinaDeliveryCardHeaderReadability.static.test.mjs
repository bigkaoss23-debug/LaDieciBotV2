// Test statico mirato — COCINA_DELIVERY_CARD_HEADER_READABILITY
// Standalone: `node cocinaDeliveryCardHeaderReadability.static.test.mjs`
//
// Rifinitura leggibilità header della card Cocina delivery/giro (Cocina-only).
// Verifica sul SORGENTE di TabCocina.jsx + PanelCocina.jsx che:
//   1. la fascia in alto dice ancora "DELIVERY ·" (no ritorno a "GIRO MANUAL");
//   2. la label giro è ALTO CONTRASTO: bianco pieno (#fff) + textShadow scuro
//      (niente opacity/grigio attenuato) sopra gli accenti chiari della palette;
//   3. número ordine + nome cliente stanno nella STESSA fila header (baseline
//      condivisa): número dominante + cliente secondario troncato con ellipsis;
//   4. il chip zona (Q2/Q5) NON torna;
//   5. la fila hora scooter (🛵) NON torna;
//   6. l'ora forno/uscita resta (hora clave cocina);
//   7. il bottone LISTO resta;
//   8. Entregas/Repartidor/NuevoPedido NON toccati (source guard): la fascia
//      DELIVERY vive solo nei due file Cocina; scooter resta in Entregas/Repartidor.
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

console.log("\n══ COCINA DELIVERY CARD — HEADER READABILITY (static) ══");

for (const [name, src] of [["TabCocina", tab], ["PanelCocina", panel]]) {
  // 1. fascia "DELIVERY" unificata ancora renderizzata (suffisso `· G{seq}` solo giro)
  ck(`${name}: fascia "DELIVERY" (unificada) presente`, () => {
    assert.ok(/🚚 DELIVERY\{o\.manualGiro \? ` · \$\{formatManualGiroLabel\(o\.manualGiro\)\}` : ""\}/.test(src));
  });
  // 2. "GIRO MANUAL" assente
  ck(`${name}: "GIRO MANUAL" assente`, () => {
    assert.ok(!/GIRO MANUAL/.test(src));
  });
  // 3. label ALTO CONTRASTO: bianco pieno + textShadow scuro rinforzato nella fascia
  ck(`${name}: label alto contrasto (#fff + textShadow scuro rinforzato)`, () => {
    assert.ok(
      /background:giroAccent \|\| zonaColore,color:"#fff"[\s\S]*?textShadow:"0 1px 3px rgba\(0,0,0,0\.6\)"[\s\S]*?🚚 DELIVERY/.test(src),
      "banner deve avere color #fff + textShadow scuro rinforzato prima del testo DELIVERY"
    );
  });
  // 3b. niente label attenuata/grigia (no opacity sul testo della fascia)
  ck(`${name}: label senza opacity attenuata`, () => {
    assert.ok(
      !/background:giroAccent \|\| zonaColore,color:"#fff"[^>]*opacity:/.test(src),
      "la fascia DELIVERY non deve usare opacity sul testo"
    );
  });
  // 4. número + cliente nella STESSA fila (flex baseline) con id-span e nombre-span
  ck(`${name}: número + cliente stessa fila header (baseline)`, () => {
    assert.ok(
      /display:"flex",alignItems:"baseline"[\s\S]*?\{o\.id\}<\/span>[\s\S]*?👤 \{o\.nombre\}<\/span>/.test(src),
      "id e nombre devono stare in una riga flex baseline condivisa"
    );
  });
  // 4b. cliente secondario troncato con ellipsis (sin wrap) nella riga header
  ck(`${name}: cliente troncato ellipsis/nowrap`, () => {
    assert.ok(
      /whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",minWidth:0\}\}>👤 \{o\.nombre\}<\/span>/.test(src),
      "il nombre deve troncare con ellipsis senza andare a capo"
    );
  });
  // 5. chip zona Q* NON torna
  ck(`${name}: chip zona ({o.zona} en <span>) assente`, () => {
    assert.ok(!/\{o\.zona\}<\/span>/.test(src));
  });
  // 6. fila hora scooter (🛵) NON torna
  ck(`${name}: hora scooter (>🛵<) assente`, () => {
    assert.ok(!/>🛵</.test(src));
  });
  // 7. ora forno/uscita resta
  ck(`${name}: ora forno/uscita ({o.horaForno || o.hora}) presente`, () => {
    assert.ok(/\{o\.horaForno \|\| o\.hora\}/.test(src));
  });
  // 8. bottone LISTO resta
  ck(`${name}: bottone LISTO (✅ LISTO) presente`, () => {
    assert.ok(/✅ LISTO/.test(src));
  });
  // 9. grouping visivo giro (accent/border) preservato
  ck(`${name}: grouping visivo giro (giroAccent border) preservato`, () => {
    assert.ok(/giroAccent \? `4px solid \$\{giroAccent\}`/.test(src));
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
  assert.ok(!/DELIVERY · \{formatManualGiroLabel/.test(entregas));
  assert.ok(!/DELIVERY · \{formatManualGiroLabel/.test(repartidor));
  assert.ok(!/DELIVERY · \{formatManualGiroLabel/.test(nuevoPedido));
});

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
