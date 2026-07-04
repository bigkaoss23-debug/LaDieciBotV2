// Test statico mirato — NUEVO_PEDIDO_DEFAULT_HORA (A1)
// Standalone: `node nuevoPedidoDefaultHora.static.test.mjs`.
// (1) Replica 1:1 la decisione di snap del default hora all'earliest fattibile
//     e la soppressione della superficie "requested_hora_too_soon" quando la
//     hora è un DEFAULT di sistema (!horaTouchedByOperator).
// (2) Grep di sorgente: snap usa setHora (NON setHoraFromOperator), RITIRO usa
//     backendTiming.earliest_hora, DOMICILIO clampa a recommended_hora,
//     showPlannerBlockerMsg + render 🚫 gatati su !suppressTooEarly, e
//     plannerBlocksConfirm (gate di conferma) NON è stato indebolito.

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

const hhmmToMin = (t) => {
  if (!t || typeof t !== "string") return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

// ── (1) Replica 1:1 della decisione di snap (default → earliest) ─────────────
// Ritorna { nextHora, touchedChanged } dove touchedChanged=false SEMPRE (il
// default di sistema non tocca horaTouchedByOperator).
function computeSnap({ tipoConsegna, horaTouchedByOperator, hora, backendTiming, plannerPreview }) {
  if (horaTouchedByOperator) return { nextHora: hora, snapped: false };
  const earliest = tipoConsegna === "DOMICILIO"
    ? (plannerPreview?.recommendation?.recommended_hora || null)
    : (backendTiming?.earliest_hora || null);
  const minE = hhmmToMin(earliest);
  if (minE == null) return { nextHora: hora, snapped: false };
  const cur = hhmmToMin(hora);
  if (cur == null || cur < minE) return { nextHora: earliest, snapped: true };
  return { nextHora: hora, snapped: false };
}

// ── (1) Replica 1:1 di suppressTooEarly + showPlannerBlockerMsg ──────────────
function computeSuppress({ plannerRecommendation, plannerBlockers, horaTouchedByOperator }) {
  const isTooEarly = plannerRecommendation?.reason === "requested_hora_too_soon"
    || (plannerBlockers || []).some((b) => b?.code === "requested_hora_too_soon");
  return isTooEarly && !horaTouchedByOperator;
}
function computeShowBlocker({ plannerBlockers, shownBefore, plannerRecommendation, horaTouchedByOperator }) {
  const msg = (plannerBlockers || []).length ? (plannerBlockers[0]?.message || String(plannerBlockers[0])) : null;
  const suppress = computeSuppress({ plannerRecommendation, plannerBlockers, horaTouchedByOperator });
  return !!msg && !(shownBefore || new Set()).has(msg) && !suppress;
}

console.log("\n══ NUEVO PEDIDO DEFAULT HORA (A1) — static ══");

// ── Snap logic ───────────────────────────────────────────────────────────
ck("RITIRO: default (untouched) sotto earliest → snap a earliest, touched invariato", () => {
  const r = computeSnap({ tipoConsegna: "RITIRO", horaTouchedByOperator: false, hora: "12:40", backendTiming: { earliest_hora: "12:45" }, plannerPreview: null });
  assert.equal(r.nextHora, "12:45");
  assert.equal(r.snapped, true);
});
ck("RITIRO: hora valida (>= earliest) NON viene anticipata", () => {
  const r = computeSnap({ tipoConsegna: "RITIRO", horaTouchedByOperator: false, hora: "13:00", backendTiming: { earliest_hora: "12:45" }, plannerPreview: null });
  assert.equal(r.nextHora, "13:00");
  assert.equal(r.snapped, false);
});
ck("DOMICILIO: default sotto recommended → snap a recommended_hora", () => {
  const r = computeSnap({ tipoConsegna: "DOMICILIO", horaTouchedByOperator: false, hora: "12:43", backendTiming: { hora_proposta: "12:43" }, plannerPreview: { recommendation: { recommended_hora: "13:06" } } });
  assert.equal(r.nextHora, "13:06");
});
ck("operatore ha toccato la hora → snap NON interviene (default disattivato)", () => {
  const r = computeSnap({ tipoConsegna: "RITIRO", horaTouchedByOperator: true, hora: "12:30", backendTiming: { earliest_hora: "12:45" }, plannerPreview: null });
  assert.equal(r.nextHora, "12:30");
  assert.equal(r.snapped, false);
});
ck("earliest non disponibile → nessuno snap (fallback sicuro)", () => {
  const r = computeSnap({ tipoConsegna: "DOMICILIO", horaTouchedByOperator: false, hora: "12:43", backendTiming: null, plannerPreview: null });
  assert.equal(r.nextHora, "12:43");
  assert.equal(r.snapped, false);
});

// ── Suppression logic ────────────────────────────────────────────────────
ck("apertura (untouched) con too-early → warning 'muy pronto' NON mostrato", () => {
  const show = computeShowBlocker({
    plannerBlockers: [{ code: "requested_hora_too_soon", message: "Hora pedida muy pronta · mínimo 12:45 (cocina)" }],
    plannerRecommendation: { reason: "requested_hora_too_soon" },
    horaTouchedByOperator: false,
  });
  assert.equal(show, false);
});
ck("operatore tocca hora troppo presto → warning 'muy pronto' RIAPPARE", () => {
  const show = computeShowBlocker({
    plannerBlockers: [{ code: "requested_hora_too_soon", message: "Hora pedida muy pronta · mínimo 12:45 (cocina)" }],
    plannerRecommendation: { reason: "requested_hora_too_soon" },
    horaTouchedByOperator: true,
  });
  assert.equal(show, true);
});
ck("blocker NON-too-early resta sempre visibile (non soppresso)", () => {
  const show = computeShowBlocker({
    plannerBlockers: [{ code: "separate", message: "Otro bloqueo cualquiera" }],
    plannerRecommendation: { reason: "other" },
    horaTouchedByOperator: false,
  });
  assert.equal(show, true);
});
ck("suppressTooEarly = isTooEarly && !horaTouchedByOperator (matrice)", () => {
  const base = { plannerRecommendation: { reason: "requested_hora_too_soon" }, plannerBlockers: [] };
  assert.equal(computeSuppress({ ...base, horaTouchedByOperator: false }), true);
  assert.equal(computeSuppress({ ...base, horaTouchedByOperator: true }), false);
  assert.equal(computeSuppress({ plannerRecommendation: { reason: "valid" }, plannerBlockers: [], horaTouchedByOperator: false }), false);
});

// ── Source guards ─────────────────────────────────────────────────────────
ck("snap RITIRO usa backendTiming.earliest_hora", () => {
  assert.match(SRC, /backendTiming\?\.earliest_hora/);
  assert.match(SRC, /setHora\(backendTiming\.earliest_hora\)/);
});
ck("DOMICILIO clampa a plannerPreview.recommendation.recommended_hora", () => {
  assert.match(SRC, /plannerPreview\?\.recommendation\?\.recommended_hora/);
});
ck("snap NON usa setHoraFromOperator (default di sistema, non tocco operatore)", () => {
  // Isola il corpo dell'effetto snap RITIRO A1 (dalla riga `useEffect` dopo il
  // commento fino a `}, [`) e verifica — SOLO sulle righe di codice, non sui
  // commenti — che non usi setHoraFromOperator né setHoraTouchedByOperator(true).
  const a1Idx = SRC.indexOf("A1 (NUEVO_PEDIDO_DEFAULT_HORA): RITIRO");
  assert.ok(a1Idx >= 0, "effetto snap RITIRO A1 non trovato");
  const effStart = SRC.indexOf("useEffect(() => {", a1Idx);
  const effEnd = SRC.indexOf("}, [", effStart);
  assert.ok(effStart >= 0 && effEnd > effStart, "corpo effetto snap RITIRO non delimitato");
  const codeOnly = SRC.slice(effStart, effEnd)
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.ok(/setHora\(backendTiming\.earliest_hora\)/.test(codeOnly), "lo snap deve usare setHora(earliest)");
  assert.ok(!/setHoraFromOperator/.test(codeOnly), "lo snap non deve usare setHoraFromOperator");
  assert.ok(!/setHoraTouchedByOperator\(true\)/.test(codeOnly), "lo snap non deve settare touched=true");
});
ck("showPlannerBlockerMsg gatato su !suppressTooEarly", () => {
  assert.match(SRC, /const showPlannerBlockerMsg = [^\n]*&& !suppressTooEarly/);
});
ck("render 🚫 confirmBlockReason gatato su !suppressTooEarly", () => {
  assert.match(SRC, /plannerBlocksConfirm && !suppressTooEarly &&/);
});
ck("suppressTooEarly definito come isRequestedTooEarly && !horaTouchedByOperator", () => {
  assert.match(SRC, /const suppressTooEarly = isRequestedTooEarly && !horaTouchedByOperator/);
});
ck("gate di conferma plannerBlocksConfirm NON indebolito (logica invariata)", () => {
  // canConfirmOrder resta ok && !plannerBlocksConfirm; plannerBlocksConfirm non
  // viene gatato su horaTouchedByOperator (sicurezza: default non-snappato resta
  // non confermabile). Solo il TESTO è soppresso, non il blocco.
  assert.match(SRC, /const canConfirmOrder = ok && !plannerBlocksConfirm;/);
  assert.ok(!/plannerBlocksConfirm = [^\n]*horaTouchedByOperator/.test(SRC),
    "plannerBlocksConfirm non deve dipendere da horaTouchedByOperator");
});

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══\n`);
process.exit(fail > 0 ? 1 : 0);
