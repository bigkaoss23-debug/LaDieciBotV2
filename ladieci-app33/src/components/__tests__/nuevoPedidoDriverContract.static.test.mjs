// Test statico mirato — WARNING_LAYER_BACKEND_CONTRACT_B2A
// Standalone: `node nuevoPedidoDriverContract.static.test.mjs`.
// (1) Replica 1:1 della logica di blocking/rendering aggiunta a NuevoPedidoModal.jsx
//     (isDriverContractV2, deliveryStatus.blockedByBackend, driverWarningView).
// (2) Grep di sorgente: conferma che intended_giro_id viene da appliedGiroIntent?.giroId,
//     che la dependency list del fetch include appliedGiroIntent?.giroId, e che NESSUN
//     hide/unblock diretto basato su appliedGiroIntent/manual_giro_id/salida_ref esiste
//     nel blocco di logica driver (solo il threading esplicito verso il backend è ammesso).

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

// ── (1) Replica 1:1 di deliveryStatus.blockedByBackend (NuevoPedidoModal.jsx) ──
function computeBlockedByBackend({ isDriverContractV2, driver }) {
  return isDriverContractV2 ? !!driver?.block_confirm : !!driver?.has_conflict;
}
function computeIsBlocked({ isDriverContractV2, horaTouchedByOperator, driver }) {
  return horaTouchedByOperator && computeBlockedByBackend({ isDriverContractV2, driver });
}

// ── (1) Replica 1:1 di driverWarningView (NuevoPedidoModal.jsx) ─────────────
function computeDriverWarningView({ isDriverContractV2, horaTouchedByOperator, driver }) {
  const NONE_VIEW = { warningClass: "NONE", tone: null, text: null };
  if (!driver || !horaTouchedByOperator) return NONE_VIEW;

  if (!isDriverContractV2) {
    if (!driver.has_conflict) return NONE_VIEW;
    return { warningClass: "REAL_BLOCKER", tone: "urgent", text: driver.message || "Driver ocupado" };
  }

  switch (driver.warning_class) {
    case "REAL_BLOCKER":
      return { warningClass: "REAL_BLOCKER", tone: "urgent", text: driver.message || "Driver ocupado" };
    case "RIDER_POSITION_BLOCKER":
      return { warningClass: "RIDER_POSITION_BLOCKER", tone: "urgent", text: driver.message || "Rider ocupado" };
    case "ADVISORY_GIRO_AVAILABLE": {
      const base = driver.message || "Driver ocupado";
      const giroSuffix = driver.compatible_giro_label ? ` · compatible con ${driver.compatible_giro_label}` : "";
      return { warningClass: "ADVISORY_GIRO_AVAILABLE", tone: "urgent", text: `${base}${giroSuffix}` };
    }
    case "OVERRIDDEN_BY_GIRO": {
      const giroLabel = driver.compatible_giro_label || "giro compatible";
      return { warningClass: "OVERRIDDEN_BY_GIRO", tone: "info", text: `Resuelto por ${giroLabel} (no se aplica solo)` };
    }
    case "NONE":
    default:
      return NONE_VIEW;
  }
}

console.log("\n══ NUEVO PEDIDO DRIVER CONTRACT — static ══");

// ── Blocking logic ───────────────────────────────────────────────────────
ck("v2: isBlocked = horaTouchedByOperator && driver.block_confirm (true+true)", () => {
  const r = computeIsBlocked({ isDriverContractV2: true, horaTouchedByOperator: true, driver: { block_confirm: true, has_conflict: true } });
  assert.equal(r, true);
});
ck("v2: isBlocked = false se block_confirm=false anche con has_conflict=true (OVERRIDDEN_BY_GIRO)", () => {
  const r = computeIsBlocked({ isDriverContractV2: true, horaTouchedByOperator: true, driver: { block_confirm: false, has_conflict: true, warning_class: "OVERRIDDEN_BY_GIRO" } });
  assert.equal(r, false);
});
ck("v2: isBlocked = false se horaTouchedByOperator=false anche con block_confirm=true", () => {
  const r = computeIsBlocked({ isDriverContractV2: true, horaTouchedByOperator: false, driver: { block_confirm: true } });
  assert.equal(r, false);
});
ck("v1 fallback: isBlocked = horaTouchedByOperator && driver.has_conflict", () => {
  const r1 = computeIsBlocked({ isDriverContractV2: false, horaTouchedByOperator: true, driver: { has_conflict: true, block_confirm: false } });
  assert.equal(r1, true, "has_conflict=true deve bloccare in v1 anche se block_confirm=false (campo ignorato in v1)");
  const r2 = computeIsBlocked({ isDriverContractV2: false, horaTouchedByOperator: true, driver: { has_conflict: false } });
  assert.equal(r2, false);
});
ck("RIDER_POSITION_BLOCKER resta blocking anche con overridden_by_giro=false esplicito", () => {
  const r = computeIsBlocked({ isDriverContractV2: true, horaTouchedByOperator: true, driver: { block_confirm: true, warning_class: "RIDER_POSITION_BLOCKER", overridden_by_giro: false } });
  assert.equal(r, true);
});
ck("ADVISORY_GIRO_AVAILABLE resta blocking (non si sblocca da un giro solo suggerito)", () => {
  const r = computeIsBlocked({ isDriverContractV2: true, horaTouchedByOperator: true, driver: { block_confirm: true, warning_class: "ADVISORY_GIRO_AVAILABLE" } });
  assert.equal(r, true);
});
ck("REAL_BLOCKER blocca", () => {
  const r = computeIsBlocked({ isDriverContractV2: true, horaTouchedByOperator: true, driver: { block_confirm: true, warning_class: "REAL_BLOCKER" } });
  assert.equal(r, true);
});
ck("NONE non blocca", () => {
  const r = computeIsBlocked({ isDriverContractV2: true, horaTouchedByOperator: true, driver: { block_confirm: false, warning_class: "NONE" } });
  assert.equal(r, false);
});

// ── Warning rendering ────────────────────────────────────────────────────
ck("NONE → nessun warning renderizzato (warningClass=NONE, text=null)", () => {
  const v = computeDriverWarningView({ isDriverContractV2: true, horaTouchedByOperator: true, driver: { warning_class: "NONE" } });
  assert.equal(v.warningClass, "NONE");
  assert.equal(v.text, null);
});
ck("hora non toccata → NONE anche con conflitto reale", () => {
  const v = computeDriverWarningView({ isDriverContractV2: true, horaTouchedByOperator: false, driver: { warning_class: "REAL_BLOCKER", message: "x" } });
  assert.equal(v.warningClass, "NONE");
});
ck("REAL_BLOCKER → tone urgent, testo presente", () => {
  const v = computeDriverWarningView({ isDriverContractV2: true, horaTouchedByOperator: true, driver: { warning_class: "REAL_BLOCKER", message: "Driver en Q5 22:45" } });
  assert.equal(v.warningClass, "REAL_BLOCKER");
  assert.equal(v.tone, "urgent");
  assert.equal(v.text, "Driver en Q5 22:45");
});
ck("RIDER_POSITION_BLOCKER → tone urgent (stesso peso visivo di REAL_BLOCKER)", () => {
  const v = computeDriverWarningView({ isDriverContractV2: true, horaTouchedByOperator: true, driver: { warning_class: "RIDER_POSITION_BLOCKER", message: "Rider en reparto" } });
  assert.equal(v.warningClass, "RIDER_POSITION_BLOCKER");
  assert.equal(v.tone, "urgent");
});
ck("ADVISORY_GIRO_AVAILABLE → tone urgent, menziona compatible_giro_label se presente", () => {
  const v = computeDriverWarningView({ isDriverContractV2: true, horaTouchedByOperator: true, driver: { warning_class: "ADVISORY_GIRO_AVAILABLE", message: "Driver ocupado", compatible_giro_label: "Giro G7" } });
  assert.equal(v.warningClass, "ADVISORY_GIRO_AVAILABLE");
  assert.ok(v.text.includes("Giro G7"), v.text);
});
ck("ADVISORY_GIRO_AVAILABLE senza label → testo ancora valido (no crash)", () => {
  const v = computeDriverWarningView({ isDriverContractV2: true, horaTouchedByOperator: true, driver: { warning_class: "ADVISORY_GIRO_AVAILABLE", message: "Driver ocupado", compatible_giro_label: null } });
  assert.equal(v.text, "Driver ocupado");
});
ck("OVERRIDDEN_BY_GIRO → tone info (distinto da urgent), non usa driver.message grezzo", () => {
  const v = computeDriverWarningView({ isDriverContractV2: true, horaTouchedByOperator: true, driver: { warning_class: "OVERRIDDEN_BY_GIRO", message: "Driver ocupado", compatible_giro_label: "Giro G7" } });
  assert.equal(v.warningClass, "OVERRIDDEN_BY_GIRO");
  assert.equal(v.tone, "info");
  assert.ok(v.text.includes("Giro G7"));
  assert.notEqual(v.tone, "urgent");
});
ck("fallback legacy: has_conflict=true → REAL_BLOCKER byte-compatible", () => {
  const v = computeDriverWarningView({ isDriverContractV2: false, horaTouchedByOperator: true, driver: { has_conflict: true, message: "Driver ocupado" } });
  assert.equal(v.warningClass, "REAL_BLOCKER");
  assert.equal(v.tone, "urgent");
  assert.equal(v.text, "Driver ocupado");
});
ck("fallback legacy: has_conflict=false → NONE", () => {
  const v = computeDriverWarningView({ isDriverContractV2: false, horaTouchedByOperator: true, driver: { has_conflict: false } });
  assert.equal(v.warningClass, "NONE");
});

// ── Source guards (grep sul file reale) ──────────────────────────────────
ck("intended_giro_id è sourcato da appliedGiroIntent?.giroId", () => {
  assert.match(SRC, /intended_giro_id:\s*appliedGiroIntent\?\.giroId/);
});
ck("intended_giro_id NON invia salidaRef/entregaRef", () => {
  const intendedIdx = SRC.indexOf("intended_giro_id: appliedGiroIntent?.giroId");
  assert.ok(intendedIdx >= 0, "intended_giro_id assignment not found");
  // Isola la chiamata a previewOrderTiming che contiene intended_giro_id (ce n'è
  // un'altra per "Para ahora"/RITIRO, senza intent, da ignorare) e ne verifica
  // le sole righe di codice (no commenti) tra apertura e chiusura dell'oggetto.
  const callStart = SRC.lastIndexOf("api.previewOrderTiming({", intendedIdx);
  assert.ok(callStart >= 0, "previewOrderTiming call opening not found before intended_giro_id");
  const callEnd = SRC.indexOf("});", intendedIdx);
  const callBlock = SRC.slice(callStart, callEnd);
  const codeOnly = callBlock.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.ok(!/\bsalidaRef\s*:|\bentregaRef\s*:/.test(codeOnly), "salidaRef/entregaRef non devono essere campi inviati nella chiamata");
});
ck("la dependency list del fetch previewOrderTiming include appliedGiroIntent?.giroId", () => {
  assert.match(SRC, /\[visible, tipoConsegna, direccion, hora, zonaManuale, appliedGiroIntent\?\.giroId\]/);
});
ck("la dependency list NON usa l'intero oggetto appliedGiroIntent (solo .giroId)", () => {
  assert.ok(!/\[visible, tipoConsegna, direccion, hora, zonaManuale, appliedGiroIntent\]/.test(SRC));
});
ck("isDriverContractV2 è derivato da driver.contract_version === 2", () => {
  assert.match(SRC, /isDriverContractV2\s*=\s*backendTiming\?\.driver\?\.contract_version\s*===\s*2/);
});
ck("fallback legacy branch esiste esplicitamente (!isDriverContractV2)", () => {
  assert.match(SRC, /if\s*\(!isDriverContractV2\)/);
});
ck("nessun hide/unblock diretto basato su appliedGiroIntent nel blocco driver (solo threading verso il backend ammesso)", () => {
  // Le uniche occorrenze di "appliedGiroIntent" ammesse: dichiarazione useState,
  // persistenza pending_giro_intent, il threading intended_giro_id, il commento
  // esplicativo, la dependency list del fetch, e il callback onApplyHora del
  // planner popup (fuori dallo scope di questo task). Nessuna di queste è un
  // pattern "appliedGiroIntent &&"/"!appliedGiroIntent" usato per decidere
  // localmente se nascondere il warning o sbloccare la conferma.
  assert.ok(!/isBlocked[^;]*appliedGiroIntent/.test(SRC), "isBlocked non deve referenziare appliedGiroIntent direttamente");
  assert.ok(!/warningClass[^;]*appliedGiroIntent/.test(SRC), "warningClass non deve referenziare appliedGiroIntent direttamente");
  assert.ok(!/appliedGiroIntent\s*&&/.test(SRC) || /onApplyHora/.test(SRC.slice(SRC.search(/appliedGiroIntent\s*&&/) - 40, SRC.search(/appliedGiroIntent\s*&&/) + 60)),
    "qualunque 'appliedGiroIntent &&' trovato deve appartenere solo al callback onApplyHora del planner popup");
});
ck("manual_giro_id non è usato in nessuna logica di codice (solo nei commenti)", () => {
  const codeLines = SRC.split("\n").filter((l) => l.includes("manual_giro_id") && !l.trim().startsWith("//"));
  assert.equal(codeLines.length, 0, `righe di codice (non commento) con manual_giro_id: ${JSON.stringify(codeLines)}`);
});
ck("salida_ref non è usato in nessuna logica di codice (solo nei commenti)", () => {
  const codeLines = SRC.split("\n").filter((l) => l.includes("salida_ref") && !l.trim().startsWith("//"));
  assert.equal(codeLines.length, 0, `righe di codice (non commento) con salida_ref: ${JSON.stringify(codeLines)}`);
});
ck("TECH_GEO_WARN_RE non è stato toccato (stessa regex di sempre)", () => {
  assert.match(SRC, /TECH_GEO_WARN_RE = \/haversine\|google no disponible\|duraci\.n estimada\|geo\[_ \]\?source\/i/);
});
ck("il seed del dedup FIX_40 usa il testo renderizzato (driverWarnMsg = driverWarningView.text)", () => {
  assert.match(SRC, /const driverWarnMsg = driverWarningView\.text;/);
});

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══\n`);
process.exit(fail > 0 ? 1 : 0);
