// Test statico mirato — ManualGiroSalidaRefProxy (Cocina)
// Standalone: `node cocinaGiroSalida.static.test.mjs`.
// (1) Replica 1:1 la precedenza approvata (decisione A) letta da TabCocina/PanelCocina:
//        hora_ref (operatore) > salida_ref (proxy) > forno_out (fallback per-ordine)
//     e la regola 🛵 = hora cliente del singolo stop (niente entrega_ref unico).
// (2) Grep di sorgente: verifica che i file reali usino resolveGiroReadyBy e non
//     più manualGiro.hora_ref inline / GIRO ${entrega_ref}.

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COCINA = join(HERE, "..", "cocina");

// ── (1) Replica 1:1 di manualGiroCocina.resolveGiroReadyBy ──────────────────
const resolveGiroReadyBy = (giro) => (giro && (giro.hora_ref || giro.salida_ref)) || null;

// Replica del calcolo horaForno (⏱) di TabCocina/PanelCocina.
const cocinaReadyBy = (giro, fornoFallback) => resolveGiroReadyBy(giro) || fornoFallback;
// Replica della consegna (🛵): sempre la hora cliente del singolo stop.
const cocinaEntrega = (o) => o.hora;

let pass = 0, fail = 0;
const ck = (label, fn) => {
  try { fn(); pass++; console.log("  ✓", label); }
  catch (e) { fail++; console.log("  ✗", label, "—", e.message); }
};

console.log("\n══ COCINA GIRO SALIDA — static ══");

ck("1. precedenza: hora_ref (operatore) vince su salida_ref", () => {
  assert.equal(resolveGiroReadyBy({ hora_ref: "22:30", salida_ref: "23:17" }), "22:30");
});

ck("2. precedenza: salida_ref (proxy) quando hora_ref null", () => {
  assert.equal(resolveGiroReadyBy({ hora_ref: null, salida_ref: "23:17" }), "23:17");
});

ck("3. nessun tempo giro (hora_ref+salida_ref null) → null → fallback forno per-ordine", () => {
  assert.equal(resolveGiroReadyBy({ hora_ref: null, salida_ref: null }), null);
  assert.equal(resolveGiroReadyBy(null), null);
  // il ⏱ cade sul forno_out del singolo ordine (23:08), NON finge un piano giro
  assert.equal(cocinaReadyBy({ salida_ref: null }, "23:08"), "23:08");
});

ck("4. giro con proxy → entrambi i membri mostrano lo STESSO ⏱ (23:17), non 23:08/23:17", () => {
  const giro = { hora_ref: null, salida_ref: "23:17" };
  assert.equal(cocinaReadyBy(giro, "23:17"), "23:17"); // #001
  assert.equal(cocinaReadyBy(giro, "23:08"), "23:17"); // #002 allineato (era il bug)
});

ck("5. 🛵 = hora cliente del singolo stop (no entrega_ref unico: #001 resta 23:30)", () => {
  assert.equal(cocinaEntrega({ hora: "23:30" }), "23:30");
  assert.equal(cocinaEntrega({ hora: "23:24" }), "23:24");
});

// ── (2) Grep di sorgente (anti-regressione) ─────────────────────────────────
const mgCocina = readFileSync(join(COCINA, "manualGiroCocina.js"), "utf8");
const tabCocina = readFileSync(join(COCINA, "TabCocina.jsx"), "utf8");
const panelCocina = readFileSync(join(COCINA, "PanelCocina.jsx"), "utf8");

ck("6. manualGiroCocina esporta resolveGiroReadyBy (hora_ref || salida_ref)", () => {
  assert.ok(/export const resolveGiroReadyBy/.test(mgCocina));
  assert.ok(/giro\.hora_ref\s*\|\|\s*giro\.salida_ref/.test(mgCocina));
});

ck("7. TabCocina usa resolveGiroReadyBy e NON più `manualGiro.hora_ref ?` inline per ⏱", () => {
  assert.ok(/resolveGiroReadyBy\(manualGiro\)/.test(tabCocina));
  assert.ok(!/manualGiro && manualGiro\.hora_ref\)\s*\n\s*\?\s*manualGiro\.hora_ref/.test(tabCocina));
});

ck("8. TabCocina 🛵 non usa più `GIRO ${...entrega...}` (mostra o.horaEntrega = o.hora)", () => {
  assert.ok(!/GIRO \$\{o\.horaEntrega\}/.test(tabCocina));
  assert.ok(/const horaEntrega = o\.hora;/.test(tabCocina));
});

ck("9. PanelCocina usa resolveGiroReadyBy per ⏱", () => {
  assert.ok(/resolveGiroReadyBy\(manualGiro\)/.test(panelCocina));
});

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
