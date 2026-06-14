// Test statico mirato — CONFIRMAR_GATING_01
//
// Il progetto non ha un harness (nessun `test` script in package.json). Questo
// è un test statico standalone eseguibile con: `node confirmGating.static.test.mjs`
// Replica ESATTAMENTE la logica di gating introdotta in NuevoPedidoModal.jsx
// (plannerBlocksConfirm / canConfirmOrder) e la verifica contro i contract REALI
// del backend planner (previewOrderPlanner) catturati il 2026-06-14 dal live.
//
// Scopo: regredire mai sul fix del bug critico "Confirmar attivo su ordine
// non confermabile" senza bloccare per errore gli ordini confermabili (B/C).

import assert from "node:assert";

// ── Logica sotto test (copia 1:1 di NuevoPedidoModal.jsx) ──────────────────
function deriveConfirmGate(plannerPreview, ok) {
  const plannerRecommendation = plannerPreview?.recommendation || null;
  const plannerBlockers = plannerPreview?.blockers || [];

  const plannerBlocksConfirm = plannerRecommendation
    ? (plannerRecommendation.can_confirm_requested_hora === false
       || plannerBlockers.some(b => b?.code === "requested_hora_too_soon"))
    : false;

  const confirmBlockReason = plannerBlocksConfirm
    ? (plannerBlockers[0]?.message
       || (plannerRecommendation?.reason === "requested_hora_too_soon"
            ? "Hora pedida muy pronta · usa la hora sugerida o cambia hora"
            : "Hora no confirmable · revisa el planner"))
    : "";

  const canConfirmOrder = ok && !plannerBlocksConfirm;
  return { plannerBlocksConfirm, confirmBlockReason, canConfirmOrder };
}

// ── Fixtures = contract reali backend live (2026-06-14) ────────────────────
const FX = {
  // Caso A — Q1 same-zone valido
  A_q1_valid: { ok: true, recommendation: { can_confirm_requested_hora: true, reason: "valid" }, blockers: [] },
  // Caso B — Q2 cross-zone, driver conflict ma giro compatibile
  B_q2_driverconflict: { ok: true, recommendation: { can_confirm_requested_hora: true, reason: "recommended" }, blockers: [{ code: "separate", message: "no llega a la hora pedida" }] },
  // Caso C — Q5 far, "no llega" separate ma giro compatibile
  C_q5_nollega: { ok: true, recommendation: { can_confirm_requested_hora: true, reason: "recommended" }, blockers: [{ code: "separate", message: "no llega a la hora pedida" }] },
  // Caso D — DOMICILIO too-early
  D_dom_tooearly: { ok: true, recommendation: { can_confirm_requested_hora: false, reason: "requested_hora_too_soon" }, blockers: [{ code: "separate", message: "Hora pedida muy pronta · mínimo 12:37 (cocina + andata)" }] },
  // Caso D — RITIRO too-early
  D_ritiro_tooearly: { ok: true, recommendation: { can_confirm_requested_hora: false, reason: "requested_hora_too_soon" }, blockers: [{ code: "requested_hora_too_soon", message: "Hora pedida muy pronta · mínimo 12:33 (cocina)" }] },
  // Caso E — RITIRO valido
  E_ritiro_valid: { ok: true, recommendation: { can_confirm_requested_hora: true, reason: "valid" }, blockers: [] },
};

const cases = [
  // [nome, fixture, ok, attesoBlocco, attesoCanConfirm]
  ["A Q1 valido → enabled",                FX.A_q1_valid,        true,  false, true],
  ["B Q2 driver-conflict (giro) → enabled", FX.B_q2_driverconflict, true, false, true],
  ["C Q5 no-llega (giro) → enabled",        FX.C_q5_nollega,      true,  false, true],
  ["D DOMICILIO too-early → BLOCKED",       FX.D_dom_tooearly,    true,  true,  false],
  ["D RITIRO too-early → BLOCKED",          FX.D_ritiro_tooearly, true,  true,  false],
  ["E RITIRO valido → enabled",             FX.E_ritiro_valid,    true,  false, true],
  // ok=false (es. mancano prodotti) → mai confermabile, qualsiasi planner
  ["A valido ma ok=false → not confirmable", FX.A_q1_valid,       false, false, false],
  // Preview non disponibile (null) → NON blocca per il planner (non-regressivo)
  ["preview null + ok=true → enabled",      null,                 true,  false, true],
  ["preview null + ok=false → not confirmable", null,             false, false, false],
];

let pass = 0, fail = 0;
for (const [name, fx, ok, expBlock, expCan] of cases) {
  try {
    const r = deriveConfirmGate(fx, ok);
    assert.strictEqual(r.plannerBlocksConfirm, expBlock, `plannerBlocksConfirm atteso ${expBlock}`);
    assert.strictEqual(r.canConfirmOrder, expCan, `canConfirmOrder atteso ${expCan}`);
    if (expBlock) assert.ok(r.confirmBlockReason.length > 0, "confirmBlockReason deve essere non vuoto quando bloccato");
    console.log(`✅ ${name}`);
    pass++;
  } catch (e) {
    console.error(`❌ ${name} → ${e.message}`);
    fail++;
  }
}

console.log(`\n${pass}/${pass + fail} test passati`);
if (fail > 0) process.exit(1);
