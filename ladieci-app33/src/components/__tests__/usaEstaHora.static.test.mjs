// Test statico mirato — USA_ESTA_HORA_BUG_A_01
//
// Standalone, eseguibile con: `node usaEstaHora.static.test.mjs`.
// Replica 1:1 la derivazione `plannerSuggestedHora` e la condizione di render del
// bottone "Usa esta hora" / "Usa giro compatible" introdotte in NuevoPedidoModal.jsx.
//
// Scopo BUG A: il backend live previewOrderPlanner manda l'ora consigliata come
// `recommended_hora`; il frontend leggeva solo `hora_proposta`/`suggested_hora` →
// bottone mai mostrato. Il fix aggiunge `recommended_hora` come fallback SENZA
// rompere "Usa giro compatible" né cambiare nomi del contract backend.

import assert from "node:assert";

// ── Logica sotto test (copia 1:1 di NuevoPedidoModal.jsx) ──────────────────
function derivePlannerHints(plannerPreview) {
  const plannerRecommendation = plannerPreview?.recommendation || null;
  const plannerGiro = plannerPreview?.giro || null;
  const plannerOk = plannerPreview ? plannerPreview.ok !== false : null;

  const plannerSuggestedHora = plannerRecommendation
    ? (plannerRecommendation.hora_proposta || plannerRecommendation.suggested_hora || plannerRecommendation.recommended_hora || null)
    : null;

  // Condizioni di render (display-only)
  const showUsaEstaHora = plannerOk !== false && !!plannerSuggestedHora;
  const showUsaGiro = plannerOk !== false && !!plannerGiro?.slot_hora;
  const giroHora = plannerGiro?.slot_hora || null;

  return { plannerSuggestedHora, showUsaEstaHora, showUsaGiro, giroHora };
}

const cases = [
  // [nome, preview, expSuggested, expShowHora, expShowGiro, expGiroHora]
  // BUG A core: backend manda SOLO recommended_hora → bottone DEVE apparire
  ["recommended_hora only → Usa esta hora aparece",
    { ok: true, recommendation: { recommended_hora: "21:45", can_confirm_requested_hora: false } },
    "21:45", true, false, null],
  // Backward-compat: hora_proposta prevale (contract vecchio)
  ["hora_proposta prevale (legacy)",
    { ok: true, recommendation: { hora_proposta: "20:10", recommended_hora: "21:45" } },
    "20:10", true, false, null],
  // Backward-compat: suggested_hora intermedio
  ["suggested_hora fallback (legacy)",
    { ok: true, recommendation: { suggested_hora: "20:30", recommended_hora: "21:45" } },
    "20:30", true, false, null],
  // Nessuna ora in nessun campo → bottone NON appare
  ["nessuna hora → bottone no aparece",
    { ok: true, recommendation: { can_confirm_requested_hora: true, reason: "valid" } },
    null, false, false, null],
  // Usa giro compatible NON rotto: slot_hora presente
  ["giro.slot_hora → Usa giro compatible invariato",
    { ok: true, recommendation: { recommended_hora: "21:45" }, giro: { slot_hora: "21:50", zona: "Q3" } },
    "21:45", true, true, "21:50"],
  // ok=false → nessun hint mostrato (display gated da plannerOk)
  ["ok=false → nessun hint",
    { ok: false, recommendation: { recommended_hora: "21:45" }, giro: { slot_hora: "21:50" } },
    "21:45", false, false, "21:50"],
  // preview null → niente derivato, niente bottoni
  ["preview null → niente", null, null, false, false, null],
];

let pass = 0, fail = 0;
for (const [name, fx, expSug, expHora, expGiro, expGiroHora] of cases) {
  try {
    const r = derivePlannerHints(fx);
    assert.strictEqual(r.plannerSuggestedHora, expSug, `plannerSuggestedHora atteso ${expSug}`);
    assert.strictEqual(r.showUsaEstaHora, expHora, `showUsaEstaHora atteso ${expHora}`);
    assert.strictEqual(r.showUsaGiro, expGiro, `showUsaGiro atteso ${expGiro}`);
    assert.strictEqual(r.giroHora, expGiroHora, `giroHora atteso ${expGiroHora}`);
    console.log(`✅ ${name}`);
    pass++;
  } catch (e) {
    console.error(`❌ ${name} → ${e.message}`);
    fail++;
  }
}

console.log(`\n${pass}/${pass + fail} test passati`);
if (fail > 0) process.exit(1);
