// Test statico mirato — COCINA_DELIVERY_CARD_COMPACT_UI
// Standalone: `node cocinaDeliveryCardCompact.static.test.mjs`
//
// Verifica il micro-fix UI Cocina-only sui card delivery/giro-manual:
//   - la fascia in alto dice "DELIVERY" (no più "GIRO MANUAL");
//   - la fila hora scooter (🛵 entrega) NON è renderizzata in Cocina;
//   - il chip zona (Q2/Q5) NON è renderizzato in Cocina;
//   - l'ora forno/uscita resta visibile (la hora clave per la cucina);
//   - il bottone LISTO resta invariato;
//   - il raggruppamento visivo (accent/border condiviso per giro) resta.
//
// Solo SORGENTE Cocina (TabCocina.jsx + PanelCocina.jsx). NON tocca
// Entregas/Repartidor/Nuevo Pedido: asserzioni negative mirate al render, non
// ai commenti (che possono citare i simboli).

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COCINA = join(HERE, "..", "cocina");
const tab = readFileSync(join(COCINA, "TabCocina.jsx"), "utf8");
const panel = readFileSync(join(COCINA, "PanelCocina.jsx"), "utf8");

let pass = 0, fail = 0;
const ck = (label, fn) => {
  try { fn(); pass++; console.log("  ✓", label); }
  catch (e) { fail++; console.log("  ✗", label, "—", e.message); }
};

console.log("\n══ COCINA DELIVERY CARD — COMPACT UI (static) ══");

for (const [name, src] of [["TabCocina", tab], ["PanelCocina", panel]]) {
  // 1. niente "GIRO MANUAL" letterale
  ck(`${name}: no renderiza "GIRO MANUAL"`, () => {
    assert.ok(!/GIRO MANUAL/.test(src));
  });
  // 2. renderizza la fascia "DELIVERY" (con id giro)
  ck(`${name}: renderiza fascia "DELIVERY ·"`, () => {
    assert.ok(/🚚 DELIVERY · \{formatManualGiroLabel\(o\.manualGiro\)\}/.test(src));
  });
  // 3. niente fila hora scooter renderizzata (il render era <span ...>🛵</span>)
  ck(`${name}: no renderiza bloque hora scooter (>🛵<)`, () => {
    assert.ok(!/>🛵</.test(src));
  });
  // 4. niente chip zona Q* renderizzato (il render era <span ...>{o.zona}</span>)
  ck(`${name}: no renderiza chip zona ({o.zona} en <span>)`, () => {
    assert.ok(!/\{o\.zona\}<\/span>/.test(src));
  });
  // 5. ora forno/uscita ancora visibile (hora clave cocina)
  ck(`${name}: mantiene ora forno/uscita ({o.horaForno || o.hora})`, () => {
    assert.ok(/\{o\.horaForno \|\| o\.hora\}/.test(src));
  });
  // 6. bottone LISTO invariato
  ck(`${name}: bottone LISTO presente (✅ LISTO)`, () => {
    assert.ok(/✅ LISTO/.test(src));
  });
  // 7. raggruppamento visivo giro (accent/border) preservato
  ck(`${name}: grouping visivo giro preservato (giroAccent border)`, () => {
    assert.ok(/giroAccent \? `4px solid \$\{giroAccent\}`/.test(src));
  });
}

// 8. guardia anti-scope: la hora scooter resta in Entregas/Repartidor (NON toccati).
//    (verifica che il render 🛵 esista ancora in quelle viste)
const entregas = readFileSync(join(HERE, "..", "entregas", "TabEntregas.jsx"), "utf8");
const repartidor = readFileSync(join(HERE, "..", "repartidor", "RepartidorPage.jsx"), "utf8");
ck("Entregas: hora scooter (🛵) ANCORA presente (no tocada)", () => {
  assert.ok(/🛵/.test(entregas));
});
ck("Repartidor: hora scooter (🛵) ANCORA presente (no tocada)", () => {
  assert.ok(/🛵/.test(repartidor));
});

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
