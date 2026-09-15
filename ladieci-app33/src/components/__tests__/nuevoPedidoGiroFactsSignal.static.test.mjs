// W5 Packet 01 — static structural test for NuevoPedidoModal.jsx's cross-tablet
// invalidation polling. Standalone: node nuevoPedidoGiroFactsSignal.static.test.mjs
//
// Proves, by source inspection:
//   W5-X01: openPlannerLab() records the current signal version on open.
//   W5-X02/X03: a poll effect exists, scoped to showPlannerLabPopup, at a fixed
//     interval, comparing against the previously-seen version.
//   W5-X04/X05: on a version change it calls the SAME canonical fetch
//     (fetchStrategicPreview) — never a second/different endpoint.
//   W5-X06: it does NOT unconditionally refetch every tick — the refetch is
//     gated behind an actual version inequality check.
//   W5-X08: the signal is never assigned into strategicPreview or any Giro-fact
//     state — only into the version-tracking ref.

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODAL_PATH = join(HERE, "..", "NuevoPedidoModal.jsx");
const SRC = readFileSync(MODAL_PATH, "utf8");
const jsCode = (s) => s.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const CODE = jsCode(SRC);

let pass = 0, fail = 0;
const ck = (label, fn) => {
  try { fn(); pass++; console.log("  ✓", label); }
  catch (e) { fail++; console.log("  ✗", label, "—", e.message); }
};

ck("imports readGiroFactsSignalVersion from the shared helper", () => {
  assert.ok(/import\s*\{\s*readGiroFactsSignalVersion\s*\}\s*from\s*['"]\.\.\/api\/giroFactsSignal['"]/.test(CODE));
});

ck("W5-X01: openPlannerLab() records the signal version at open time (plannerSignalVersionRef)", () => {
  const openBody = (CODE.match(/const openPlannerLab = async[\s\S]*?\n  \};/) || [""])[0];
  assert.ok(/plannerSignalVersionRef\.current\s*=\s*await\s*readGiroFactsSignalVersion\(sb\)/.test(openBody), openBody);
});

ck("W5-X02: a poll interval exists, scoped by an early-return on !showPlannerLabPopup", () => {
  assert.ok(/if\s*\(!showPlannerLabPopup\)\s*return\s+undefined;/.test(CODE));
});

ck("W5-X02: polls at a fixed 5s cadence (setInterval(..., 5000))", () => {
  assert.ok(/setInterval\(async \(\) => \{[\s\S]*?\}, 5000\)/.test(CODE));
});

ck("W5-X06: the refetch is gated behind an ACTUAL inequality check against the last-seen version (not unconditional)", () => {
  assert.ok(/v\s*!==\s*plannerSignalVersionRef\.current/.test(CODE));
});

ck("W5-X04/X05: on a real version change it calls fetchStrategicPreview (the SAME canonical endpoint), never a second data source", () => {
  const pollEffect = (CODE.match(/useEffect\(\(\) => \{\s*if \(!showPlannerLabPopup\)[\s\S]*?\}, \[showPlannerLabPopup\]\);/) || [""])[0];
  assert.ok(/fetchStrategicPreview\(\{\s*silent:\s*true\s*\}\)/.test(pollEffect), pollEffect);
  assert.ok(!/api\.(?!previewStrategicOpportunities)/.test(pollEffect.replace(/api\.previewStrategicOpportunities/g, "")), "no other api.* call inside the poll effect");
});

ck("W5-X07: a null signal read (failure) is a no-op tick, never touches state", () => {
  assert.ok(/if\s*\(cancelled \|\| v == null\)\s*return;/.test(CODE));
});

ck("W5-X08: the signal version is never assigned into strategicPreview or any *Giro/*proposal state (only into the ref)", () => {
  const pollEffect = (CODE.match(/useEffect\(\(\) => \{\s*if \(!showPlannerLabPopup\)[\s\S]*?\}, \[showPlannerLabPopup\]\);/) || [""])[0];
  assert.ok(!/setStrategicPreview\(/.test(pollEffect), "poll effect must never set strategic preview data directly");
  assert.ok(/plannerSignalVersionRef\.current\s*=\s*v;/.test(pollEffect));
});

ck("fetchStrategicPreview(silent) uses strategicRefreshing, not the full strategicLoading, to disable-not-remount", () => {
  const fetchFn = (CODE.match(/const fetchStrategicPreview = async[\s\S]*?\n  \};/) || [""])[0];
  assert.ok(/setStrategicRefreshing\(true\)/.test(fetchFn), fetchFn);
});

ck("PremiumPlannerPopup receives strategicRefreshing as its loading prop (wires the disable-state through)", () => {
  assert.ok(/loading=\{strategicRefreshing\}/.test(CODE));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
