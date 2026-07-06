// Test statico mirato — COCINA_MANUAL_GIRO_VISUAL_GROUPING (Option 1)
// Standalone: `node cocinaGiroGrouping.static.test.mjs`.
// (1) Replica 1:1 di manualGiroAccentColor: stabile/deterministico per giro.
// (2) Grep di sorgente: TabCocina/PanelCocina usano l'accent per i membri giro,
//     mantengono zonaColore per i non-giro, e le semantiche ⏱/🛵 restano intatte.

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COCINA = join(HERE, "..", "cocina");

// ── (1) Replica 1:1 di manualGiroCocina.manualGiroAccentColor ───────────────
const MANUAL_GIRO_ACCENT_PALETTE = ["#F59E0B", "#06B6D4", "#8B5CF6", "#22C55E", "#EC4899", "#3B82F6"];
const manualGiroAccentColor = (giro) => {
  const P = MANUAL_GIRO_ACCENT_PALETTE;
  if (!giro) return P[0];
  const seq = Number(giro.seq);
  if (Number.isFinite(seq) && seq >= 1) return P[(Math.floor(seq) - 1) % P.length];
  const id = String(giro.id || "");
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % P.length;
  return P[h];
};

let pass = 0, fail = 0;
const ck = (label, fn) => {
  try { fn(); pass++; console.log("  ✓", label); }
  catch (e) { fail++; console.log("  ✗", label, "—", e.message); }
};

console.log("\n══ COCINA GIRO GROUPING — static ══");

ck("1. stesso seq → stesso accent (indipendente dall'id)", () => {
  assert.equal(manualGiroAccentColor({ seq: 1, id: "mg_a" }), manualGiroAccentColor({ seq: 1, id: "mg_b" }));
  assert.equal(manualGiroAccentColor({ seq: 1, id: "mg_260702_1" }), "#F59E0B");
});

ck("2. seq diversi → mapping deterministico + wrap sul palette", () => {
  assert.equal(manualGiroAccentColor({ seq: 1 }), "#F59E0B");
  assert.equal(manualGiroAccentColor({ seq: 2 }), "#06B6D4");
  assert.equal(manualGiroAccentColor({ seq: 6 }), "#3B82F6");
  assert.equal(manualGiroAccentColor({ seq: 7 }), "#F59E0B"); // wrap (7-1)%6=0
  // stabile su chiamate ripetute
  assert.equal(manualGiroAccentColor({ seq: 3 }), manualGiroAccentColor({ seq: 3 }));
});

ck("3. fallback per id deterministico quando seq manca", () => {
  const g = { id: "mg_260702_1" };
  assert.equal(manualGiroAccentColor(g), manualGiroAccentColor(g)); // deterministico
  // corrisponde alla formula hash
  let h = 0; for (const c of "mg_260702_1") h = (h + c.charCodeAt(0)) % 6;
  assert.equal(manualGiroAccentColor(g), MANUAL_GIRO_ACCENT_PALETTE[h]);
  assert.equal(manualGiroAccentColor(null), "#F59E0B"); // no crash
});

ck("4. nessun rosso puro nel palette (rosso riservato a aggiunta/urgent)", () => {
  assert.ok(!MANUAL_GIRO_ACCENT_PALETTE.some(c => /^#E8341C$/i.test(c) || /^#(FF0000|F00)$/i.test(c)));
});

// ── (2) Grep di sorgente ────────────────────────────────────────────────────
const mgCocina = readFileSync(join(COCINA, "manualGiroCocina.js"), "utf8");
const tab = readFileSync(join(COCINA, "TabCocina.jsx"), "utf8");
const panel = readFileSync(join(COCINA, "PanelCocina.jsx"), "utf8");

ck("5. manualGiroCocina esporta manualGiroAccentColor + palette", () => {
  assert.ok(/export const manualGiroAccentColor/.test(mgCocina));
  assert.ok(/export const MANUAL_GIRO_ACCENT_PALETTE/.test(mgCocina));
});

for (const [name, src] of [["TabCocina", tab], ["PanelCocina", panel]]) {
  ck(`6. ${name}: usa manualGiroAccentColor(o.manualGiro) per l'accent giro`, () => {
    assert.ok(/manualGiroAccentColor\(o\.manualGiro\)/.test(src));
    assert.ok(/giroAccent \? `4px solid \$\{giroAccent\}`/.test(src)); // border membri giro
    // COCINA_DELIVERY_VISUAL_CONTRACT: la fascia in alto dice "DELIVERY" unificata
    // (suffisso `· G{seq}` condizionato al giro manuale); nessuna label legacy.
    assert.ok(/🚚 DELIVERY\{o\.manualGiro \?/.test(src)); // top stripe (unified)
    assert.ok(!/GIRO MANUAL/.test(src)); // etichetta vecchia rimossa
  });
  ck(`7. ${name}: path non-giro mantiene ancora zonaColore (border/halo)`, () => {
    assert.ok(/4px solid \$\{zonaColore\}/.test(src));
  });
  ck(`8. ${name}: oven ready-by (resolveGiroReadyBy) intatto — hora clave cocina`, () => {
    assert.ok(/resolveGiroReadyBy\(manualGiro\)/.test(src));
  });
  ck(`9. ${name}: fila hora scooter (🛵) NON renderizzata in Cocina (compact)`, () => {
    assert.ok(!/>🛵</.test(src)); // render rimosso (i commenti col simbolo non contano)
  });
}

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
