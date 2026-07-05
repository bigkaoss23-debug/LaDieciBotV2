// Test statico mirato — B2C_GIRO_CONFIRMED_CHIP
//
// Il progetto non ha un harness (nessun `test` script). Eseguibile con:
//   node ladieci-app33/src/components/__tests__/giroConfirmedChip.static.test.mjs
//
// Verifica la condizione `giroConfirmed` di NuevoPedidoModal.jsx: il chip
// "Próximo giro" diventa verde "Giro … confirmado" SOLO se il backend B1C
// conferma esplicitamente l'override (contract_version=2 + warning_class
// OVERRIDDEN_BY_GIRO + block_confirm=false) E l'id dell'intent applicato
// corrisponde all'opportunità mostrata. Backend-gated, MAI frontend-only.
//
// Due livelli:
//   1) logica pura (copia 1:1) contro la matrice richiesta dal gate;
//   2) asserzioni sul SORGENTE reale, così non può regredire a un verde
//      frontend-only (deve contenere i 3 gate backend + il match su anchorOrderId,
//      NON deve esistere un `if (appliedGiroIntent) ...green`).

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODAL = join(__dirname, "..", "NuevoPedidoModal.jsx");
const PANEL = join(__dirname, "..", "DireccionInlinePanel.jsx");
const modalSrc = readFileSync(MODAL, "utf8");
const panelSrc = readFileSync(PANEL, "utf8");

// ── Logica sotto test (copia 1:1 di NuevoPedidoModal.jsx giroConfirmed) ──────
function deriveGiroConfirmed(appliedGiroIntent, plannerNextGiro, backendTiming) {
  if (!appliedGiroIntent || !plannerNextGiro) return false;
  const ngAnchor = plannerNextGiro.anchorOrderId != null ? String(plannerNextGiro.anchorOrderId) : null;
  if (ngAnchor == null) return false;
  const intentAnchor = appliedGiroIntent.anchorOrderId != null ? String(appliedGiroIntent.anchorOrderId) : null;
  const intentGiro = appliedGiroIntent.giroId != null ? String(appliedGiroIntent.giroId) : null;
  const idMatch = intentAnchor === ngAnchor || intentGiro === ngAnchor;
  if (!idMatch) return false;
  const driver = backendTiming?.driver;
  return !!driver
    && driver.contract_version === 2
    && driver.warning_class === "OVERRIDDEN_BY_GIRO"
    && driver.block_confirm === false;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
const NG = { kind: "future_giro", zone: "Q5", hora: "22:11", anchorOrderId: "#500", label: "Próximo giro Q5 22:11" };
const INTENT_ANCHOR = { giroId: "#500", anchorOrderId: "#500", salidaRef: null, entregaRef: "22:11" };
const INTENT_GIRO_ONLY = { giroId: "#500", anchorOrderId: null };       // fallback giroId===anchorOrderId
const INTENT_MISMATCH = { giroId: "#777", anchorOrderId: "#777" };
const DRV = (over = {}) => ({ driver: { contract_version: 2, warning_class: "OVERRIDDEN_BY_GIRO", block_confirm: false, ...over } });

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`); }
};

console.log("\n══ B2C GIRO CONFIRMED CHIP — static ══");

// 1. Non applicato → NON confirmed (resta ámbar)
check("1. non applicato (appliedGiroIntent null) → NON confirmed",
  deriveGiroConfirmed(null, NG, DRV()) === false);

// 2. Applicato + match anchorOrderId + backend OVERRIDDEN + block_confirm=false → confirmed
check("2a. applicato + match anchorOrderId + OVERRIDDEN + block_confirm=false → confirmed",
  deriveGiroConfirmed(INTENT_ANCHOR, NG, DRV()) === true);
check("2b. match via fallback giroId===anchorOrderId (anchorOrderId dell'intent null) → confirmed",
  deriveGiroConfirmed(INTENT_GIRO_ONLY, NG, DRV()) === true);

// 3. Applicato + match ma backend NON è OVERRIDDEN → NON confirmed
check("3a. REAL_BLOCKER → NON confirmed",
  deriveGiroConfirmed(INTENT_ANCHOR, NG, DRV({ warning_class: "REAL_BLOCKER", block_confirm: true })) === false);
check("3b. ADVISORY_GIRO_AVAILABLE → NON confirmed",
  deriveGiroConfirmed(INTENT_ANCHOR, NG, DRV({ warning_class: "ADVISORY_GIRO_AVAILABLE", block_confirm: true })) === false);
check("3c. RIDER_POSITION_BLOCKER → NON confirmed",
  deriveGiroConfirmed(INTENT_ANCHOR, NG, DRV({ warning_class: "RIDER_POSITION_BLOCKER", block_confirm: true })) === false);

// 4. Mismatch id → NON confirmed anche con backend OVERRIDDEN
check("4. mismatch id (intent #777 vs opp #500) → NON confirmed",
  deriveGiroConfirmed(INTENT_MISMATCH, NG, DRV()) === false);

// 5. Backend vecchio/missing contract_version → NON confirmed
check("5a. contract_version !== 2 (v1) → NON confirmed",
  deriveGiroConfirmed(INTENT_ANCHOR, NG, { driver: { warning_class: "OVERRIDDEN_BY_GIRO", block_confirm: false, has_conflict: true } }) === false);
check("5b. backendTiming null → NON confirmed",
  deriveGiroConfirmed(INTENT_ANCHOR, NG, null) === false);

// 6. block_confirm=true → NON confirmed (anche con warning_class OVERRIDDEN, caso incoerente)
check("6. block_confirm=true → NON confirmed",
  deriveGiroConfirmed(INTENT_ANCHOR, NG, DRV({ block_confirm: true })) === false);

// 7. plannerNextGiro senza anchorOrderId → NON confirmed (nessun match stabile)
check("7. plannerNextGiro senza anchorOrderId → NON confirmed",
  deriveGiroConfirmed(INTENT_ANCHOR, { zone: "Q5", hora: "22:11" }, DRV()) === false);

// ── B2C dedup: soppressione del doblón "Resuelto por Giro …" ─────────────────
// Replica 1:1 del gate di render del blocco driverWarningView in NuevoPedidoModal:
//   render se DOMICILIO && warningClass !== "NONE" && !giroConfirmed
// (giroConfirmed è già backend-gated: OVERRIDDEN_BY_GIRO + block_confirm=false +
// id-match + contract v2). Qui verifichiamo la MATRICE di visibilità.
function driverNoticeShown(warningClass, giroConfirmed, tipo = "DOMICILIO") {
  return tipo === "DOMICILIO" && warningClass !== "NONE" && !giroConfirmed;
}

console.log("\n── B2C dedup: driver notice visibility ──");
// 1. OVERRIDDEN + block_confirm=false + giroConfirmed=true → notice NON mostrato
check("1. OVERRIDDEN_BY_GIRO + giroConfirmed=true → notice NASCOSTO (no doblón)",
  driverNoticeShown("OVERRIDDEN_BY_GIRO", true) === false);
// 2. OVERRIDDEN + giroConfirmed=false → notice ancora mostrato (fallback sicuro)
check("2. OVERRIDDEN_BY_GIRO + giroConfirmed=false → notice mostrato (fallback)",
  driverNoticeShown("OVERRIDDEN_BY_GIRO", false) === true);
// 3. REAL_BLOCKER → mostrato (giroConfirmed sempre false per questo caso)
check("3. REAL_BLOCKER → notice mostrato",
  driverNoticeShown("REAL_BLOCKER", false) === true);
// 4. ADVISORY_GIRO_AVAILABLE → mostrato
check("4. ADVISORY_GIRO_AVAILABLE → notice mostrato",
  driverNoticeShown("ADVISORY_GIRO_AVAILABLE", false) === true);
// 5. RIDER_POSITION_BLOCKER → mostrato
check("5. RIDER_POSITION_BLOCKER → notice mostrato",
  driverNoticeShown("RIDER_POSITION_BLOCKER", false) === true);
// 6. block_confirm=true → giroConfirmed è false → notice mostrato (mai nascosto)
//    (l'unico modo per nascondere è giroConfirmed=true, che richiede block_confirm=false)
check("6a. block_confirm=true ⇒ giroConfirmed=false (derivazione)",
  deriveGiroConfirmed(INTENT_ANCHOR, NG, DRV({ block_confirm: true })) === false);
check("6b. block_confirm=true ⇒ notice mostrato (non nascosto)",
  driverNoticeShown("OVERRIDDEN_BY_GIRO", deriveGiroConfirmed(INTENT_ANCHOR, NG, DRV({ block_confirm: true }))) === true);
// 7. NONE → nessun notice a prescindere (coerenza)
check("7. warningClass=NONE → notice non mostrato (indipendente da giroConfirmed)",
  driverNoticeShown("NONE", false) === false);

// ── Asserzioni sul SORGENTE (anti-regressione a verde frontend-only) ─────────
console.log("\n── source guards ──");
// il gating backend deve esistere letteralmente nel modal
check("src: gate contract_version === 2", /contract_version\s*===\s*2/.test(modalSrc));
check("src: gate warning_class === \"OVERRIDDEN_BY_GIRO\"", /warning_class\s*===\s*["']OVERRIDDEN_BY_GIRO["']/.test(modalSrc));
check("src: gate block_confirm === false", /block_confirm\s*===\s*false/.test(modalSrc));
check("src: match su anchorOrderId presente", /anchorOrderId/.test(modalSrc) && /giroConfirmed/.test(modalSrc));
// il chip verde NON deve dipendere solo da appliedGiroIntent (no frontend-only)
check("src: nessun verde da solo-appliedGiroIntent (no `if (appliedGiroIntent) ...confirmado`)",
  !/if\s*\(\s*appliedGiroIntent\s*\)[^\n]*confirmado/i.test(modalSrc));
// il panel rende il verde SOLO via prop giroConfirmed
check("panel: usa la prop giroConfirmed", /giroConfirmed/.test(panelSrc));
check("panel: label verde 'confirmado' gated su giroConfirmed",
  /giroConfirmed[\s\S]{0,120}confirmado/.test(panelSrc));
// A1/A2 non toccati: i loro marker restano nel modal
check("src: A2 default pizza-ready intatto (recommended_hora)", /recommended_hora/.test(modalSrc));
check("src: A1 too-soon suppression intatta (suppressTooEarly / horaTouchedByOperator)",
  /horaTouchedByOperator/.test(modalSrc));
// driverWarningView renderizzato, ma dedup-gated su !giroConfirmed
check("src: driverWarningView render gate presente (warningClass !== NONE)", /driverWarningView\.warningClass\s*!==\s*["']NONE["']/.test(modalSrc));
check("src: dedup B2C — render gate include !giroConfirmed",
  /driverWarningView\.warningClass\s*!==\s*["']NONE["'][\s\S]{0,40}!giroConfirmed/.test(modalSrc));

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══\n`);
assert.strictEqual(fail, 0, `${fail} assertion(s) failed`);
process.exit(0);
