// S2-7D4E-A — static contract for the two modals that perform final persistence.
// Standalone: `node modalSubmissionContract.static.test.mjs`
//
// These assert the ARCHITECTURAL invariants of R1 on the real source, the ones a
// unit test of the pure lifecycle cannot see:
//   - neither modal knows draft mode exists;
//   - no native alert is used for submission feedback;
//   - there is exactly one in-modal result surface;
//   - cleanup happens on SUCCESS only;
//   - timing effects yield to an attempt.

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMP = join(dirname(HERE), "..", "components");
const nuevo = readFileSync(join(COMP, "NuevoPedidoModal.jsx"), "utf8");
const modifica = readFileSync(join(COMP, "ModificaOrdenModal.jsx"), "utf8");
const codeOnly = (s) => s.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

let pass = 0, fail = 0;
const ck = (label, fn) => {
  try { fn(); pass++; console.log("  ✓", label); }
  catch (e) { fail++; console.log("  ✗", label, "—", e.message); }
};

console.log("\n══ S2-7D4E-A — submission contract (static) ══");

for (const [name, raw] of [["NuevoPedidoModal", nuevo], ["ModificaOrdenModal", modifica]]) {
  const src = codeOnly(raw);

  ck(`${name}: uses the canonical lifecycle`, () => {
    assert.ok(/from '\.\.\/order\/submissionLifecycle'/.test(src), "imports the lifecycle");
    assert.ok(/runSubmission\(\{/.test(src), "runs it");
    assert.ok(/useReducer\(submissionReducer, initialSubmissionState\)/.test(src), "one submission state");
  });

  ck(`${name}: does NOT know that draft mode exists`, () => {
    assert.ok(!/DRAFT_NO_PERSIST/.test(src), "no draft flag read in the modal");
    assert.ok(!/DRAFT_NOTICE/.test(src), "no draft copy in the modal");
    assert.ok(!/from '\.\.\/draftGuard'/.test(src), "no draftGuard import");
  });

  ck(`${name}: persists through the gateway only`, () => {
    assert.ok(/submitOrderPayload\(/.test(src), "gateway call present");
  });

  ck(`${name}: no native alert for submission feedback`, () => {
    // window.confirm survives for the two business questions; window.alert as a
    // submission RESULT channel is gone (it is invisible where dialogs are
    // suppressed, which is how "Confirmar does nothing" was experienced).
    // Match an actual CALL, not the word inside an explanatory JSX comment.
    assert.ok(!/window\.alert\s*\(/.test(src), "no window.alert(...) call remains");
  });

  ck(`${name}: exactly one in-modal result surface, keyed to avoid stacking`, () => {
    const hits = src.match(/data-testid="submission-feedback"/g) || [];
    assert.strictEqual(hits.length, 1, `expected 1 feedback surface, found ${hits.length}`);
    assert.ok(/key=\{submission\.feedbackSeq\}/.test(src), "keyed by sequence");
  });

  ck(`${name}: the action reflects the phase, never implies success`, () => {
    assert.ok(/data-phase=\{submission\.phase\}/.test(src), "phase exposed on the control");
    assert.ok(/submissionBusy/.test(src), "disabled while busy");
    assert.ok(/PHASE\.SUBMITTING \? "Guardando…"/.test(src), "progress label");
  });

  ck(`${name}: cleanup runs on SUCCESS only`, () => {
    assert.ok(/submission\.phase !== PHASE\.SUCCESS\) return;/.test(src),
      "success-gated effect present");
  });
}

// NuevoPedido-specific invariants
const n = codeOnly(nuevo);

ck("NuevoPedidoModal: business protections preserved inside the lifecycle", () => {
  assert.ok(/code: "outside_hours"/.test(n), "closing-time confirmation kept");
  assert.ok(/code: "distant_time"/.test(n), "distant-time confirmation kept");
  assert.ok(/code: "planner_blocked"/.test(n), "planner gate kept");
  assert.ok(/askConfirmation: async \(q\) => window\.confirm\(q\.message\)/.test(n),
    "native confirm answers feed the machine");
});

ck("NuevoPedidoModal: timing effects yield while an attempt owns the form", () => {
  const hits = n.match(/if \(attemptOwnsForm\(submission\)\) return;/g) || [];
  assert.strictEqual(hits.length, 2, `both clamp effects must yield, found ${hits.length}`);
});

ck("NuevoPedidoModal: the submitted hora comes from the snapshot", () => {
  assert.ok(/hora: snap\.hora/.test(n), "payload uses the attempt snapshot, not live state");
});

ck("NuevoPedidoModal: the standalone `submitting` boolean is gone", () => {
  assert.ok(!/setSubmitting\(/.test(n), "no competing submitting state");
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
