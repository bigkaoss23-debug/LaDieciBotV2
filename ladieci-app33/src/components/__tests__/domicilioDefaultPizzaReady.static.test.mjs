// Test statico mirato — DOMICILIO_DEFAULT_PIZZA_READY (A2)
// Standalone: `node domicilioDefaultPizzaReady.static.test.mjs`.
// (1) Replica 1:1 la NUOVA selezione del default DOMICILIO: pizza-ready
//     (recommended_hora) prima, hora_proposta come fallback; suggested_hora
//     (cascata rider) NON è più sorgente del default.
// (2) Grep di sorgente: l'effetto default DOMICILIO usa `recDom || hora_proposta`
//     e NON referenzia `backendTiming.suggested_hora` nella scelta del default;
//     suggested_hora resta usato SOLO come warning/proposta; il gate di conferma
//     e le superfici A1/B2a restano invariate.

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODAL_PATH = join(HERE, "..", "NuevoPedidoModal.jsx");
const SRC = readFileSync(MODAL_PATH, "utf8");

let pass = 0, fail = 0;
const ck = (label, fn) => {
  try { fn(); pass++; console.log("  ✓", label); }
  catch (e) { fail++; console.log("  ✗", label, "—", e.message); }
};

// ── (1) Replica 1:1 della NUOVA scelta del default DOMICILIO (A2) ────────────
// firstAvailable = recommended_hora (pizza-ready) || hora_proposta (fallback).
// suggested_hora NON entra qui.
function computeDomicilioDefault({ horaTouchedByOperator, hora, backendTiming, plannerPreview }) {
  if (horaTouchedByOperator || !backendTiming) return { nextHora: hora, changed: false };
  const recDom = plannerPreview?.recommendation?.recommended_hora || null;
  const firstAvailable = recDom || backendTiming.hora_proposta || null;
  if (!firstAvailable || firstAvailable === hora) return { nextHora: hora, changed: false };
  return { nextHora: firstAvailable, changed: true };
}

console.log("\n══ DOMICILIO DEFAULT PIZZA-READY (A2) — static ══");

// ── Precedenza pizza-ready ─────────────────────────────────────────────────
ck("recommended_hora presente → default = recommended (NON suggested_hora rider-cascade)", () => {
  const r = computeDomicilioDefault({
    horaTouchedByOperator: false, hora: "14:30",
    backendTiming: { suggested_hora: "15:50", hora_proposta: "14:30" },
    plannerPreview: { recommendation: { recommended_hora: "14:51" } },
  });
  assert.equal(r.nextHora, "14:51", "il default deve essere la pizza-ready 14:51, non 15:50");
  assert.notEqual(r.nextHora, "15:50");
});
ck("suggested_hora NON diventa mai il default quando recommended_hora esiste", () => {
  const r = computeDomicilioDefault({
    horaTouchedByOperator: false, hora: "14:30",
    backendTiming: { suggested_hora: "16:20", hora_proposta: "14:30" },
    plannerPreview: { recommendation: { recommended_hora: "14:51" } },
  });
  assert.equal(r.nextHora, "14:51");
});
ck("recommended_hora assente → fallback a hora_proposta (NON suggested_hora)", () => {
  const r = computeDomicilioDefault({
    horaTouchedByOperator: false, hora: "13:00",
    backendTiming: { suggested_hora: "15:50", hora_proposta: "14:20" },
    plannerPreview: null,
  });
  assert.equal(r.nextHora, "14:20", "senza recommended, fallback a hora_proposta, mai suggested_hora");
  assert.notEqual(r.nextHora, "15:50");
});
ck("operatore ha toccato la hora → effetto default non interviene", () => {
  const r = computeDomicilioDefault({
    horaTouchedByOperator: true, hora: "14:00",
    backendTiming: { suggested_hora: "15:50", hora_proposta: "14:30" },
    plannerPreview: { recommendation: { recommended_hora: "14:51" } },
  });
  assert.equal(r.changed, false);
  assert.equal(r.nextHora, "14:00");
});
ck("default già = recommended → nessun re-set (idempotente, no loop)", () => {
  const r = computeDomicilioDefault({
    horaTouchedByOperator: false, hora: "14:51",
    backendTiming: { suggested_hora: "15:50", hora_proposta: "14:51" },
    plannerPreview: { recommendation: { recommended_hora: "14:51" } },
  });
  assert.equal(r.changed, false);
});

// ── Source guards ──────────────────────────────────────────────────────────
ck("l'effetto default DOMICILIO usa recDom || hora_proposta (pizza-ready first)", () => {
  assert.match(SRC, /let firstAvailable = recDom \|\| backendTiming\.hora_proposta \|\| null;/);
});
ck("la scelta del default DOMICILIO NON referenzia backendTiming.suggested_hora", () => {
  // Isola il corpo dell'effetto default DOMICILIO (marcato A2) e verifica che
  // suggested_hora non compaia nella selezione del default.
  const a2Idx = SRC.indexOf("A2 (DOMICILIO_DEFAULT_PIZZA_READY)");
  assert.ok(a2Idx >= 0, "marcatore effetto A2 non trovato");
  const effStart = SRC.lastIndexOf("useEffect(() => {", a2Idx);
  const effEnd = SRC.indexOf("}, [", a2Idx);
  assert.ok(effStart >= 0 && effEnd > effStart, "corpo effetto default DOMICILIO non delimitato");
  // Solo righe di CODICE (i commenti citano suggested_hora per spiegare l'esclusione).
  const bodyCode = SRC.slice(effStart, effEnd)
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.ok(!/suggested_hora/.test(bodyCode), "il default DOMICILIO non deve leggere suggested_hora");
});
ck("suggested_hora resta usato come warning/proposta (superficie driver 'sugerido …')", () => {
  assert.match(SRC, /backendTiming\.suggested_hora && \(/);
  assert.match(SRC, /sugerido \{backendTiming\.suggested_hora\}/);
});
ck("gate di conferma invariato (canConfirmOrder = ok && !plannerBlocksConfirm)", () => {
  assert.match(SRC, /const canConfirmOrder = ok && !plannerBlocksConfirm;/);
});
ck("A1 preservato: suppressTooEarly + showPlannerBlockerMsg gating intatti", () => {
  assert.match(SRC, /const suppressTooEarly = isRequestedTooEarly && !horaTouchedByOperator/);
  assert.match(SRC, /const showPlannerBlockerMsg = [^\n]*&& !suppressTooEarly/);
});
ck("B2a preservato: contract v2 + block_confirm + intended_giro_id intatti", () => {
  assert.match(SRC, /isDriverContractV2\s*=\s*backendTiming\?\.driver\?\.contract_version\s*===\s*2/);
  assert.match(SRC, /intended_giro_id:\s*appliedGiroIntent\?\.giroId/);
});

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══\n`);
process.exit(fail > 0 ? 1 : 0);
