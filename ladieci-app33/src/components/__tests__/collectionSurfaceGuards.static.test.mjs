// S2-7D6E2 — every surface that COLLECTS money must read the backend's answer.
//
// Standalone, run with: node src/components/__tests__/collectionSurfaceGuards.static.test.mjs
//
// WHY. `proxyPost` never throws. On a 409 it returns `{...body, _ok:false}` — a truthy
// object — so a `try/await/catch` around an api call sees a SUCCESS. That is precisely how
// a 12.00 cash sale (#723) was announced to the operator as collected while the ledger had
// no row. ServicioPage.setRetirado was fixed with isPaymentFailure(); the other surface
// that books a collection was not, and a `catch` block is not a substitute:
//   - RepartidorPage.handleEntregado   — the rider's Efectivo / Tarjeta buttons
//
// TabEntregas.handleForzaEntregado ("driver volvió") is NO LONGER a collection surface at
// all (POST_OPUS_REVIEW_REMEDIATION, Scope A, 2026-09-18): it used to call marcarEntregado
// with a forced "manual" method, which is exactly this test's #723 shape. The product
// correction went further than fixing the payment-outcome check — it removed the ability
// to collect from this control entirely: only the physical rider can know a delivery
// happened, so the operator's control now calls ONLY close_rider_trip (a trip-lifecycle
// action, not a collection one) and never references marcarEntregado at all. See the
// dedicated block below, which proves that removal, not merely a guarded collection.
//
// This test is source-static on purpose: these handlers live inside 1000+ line components
// with heavy context, and the contract being protected is structural (guard BEFORE the
// optimistic update is kept and BEFORE the success notify), not visual.

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "..", "..");
const read = (p) => fs.readFileSync(path.join(SRC, p), "utf8");

// Strip line comments so a promise written in a comment cannot satisfy an assertion.
const code = (s) => s.replace(/^\s*\/\/.*$/gm, "");

const SERVICIO = code(read("components/ServicioPage.jsx"));
const REPARTIDOR = code(read("components/repartidor/RepartidorPage.jsx"));
const ENTREGAS = code(read("components/entregas/TabEntregas.jsx"));
const OUTCOME = code(read("utils/paymentOutcome.js"));

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "  -> " + e.message); }
};

// The body of a named arrow-function handler, up to the next top-level `const x =`.
function handlerBody(source, name) {
  const start = source.indexOf(`const ${name} = async`);
  assert.ok(start >= 0, `handler ${name} not found`);
  const rest = source.slice(start + 10);
  const end = rest.search(/\n  const \w+ = /);
  return rest.slice(0, end === -1 ? rest.length : end);
}

console.log("\n[collection surfaces must not invent a successful collection]");

check("the shared outcome helper still fails closed on a transport-level error", () => {
  assert.match(OUTCOME, /res\._ok === false/);
  assert.match(OUTCOME, /res\.success === false/);
});

for (const [label, source, handler] of [
  ["ServicioPage.setRetirado", SERVICIO, "setRetirado"],
  ["RepartidorPage.handleEntregado", REPARTIDOR, "handleEntregado"],
]) {
  const body = handlerBody(source, handler);

  check(label + " imports and applies isPaymentFailure", () => {
    assert.match(source, /isPaymentFailure/, "isPaymentFailure is never referenced in this file");
    assert.match(body, /isPaymentFailure\(/, "the collection handler does not check the response");
  });

  check(label + " keeps the response instead of discarding it", () => {
    // `await api.x(...)` with no assignment cannot be inspected: the bug in one line.
    assert.doesNotMatch(body, /\n\s*await api\.(marcarEntregado|updateEstado)\(/,
      "the api response is discarded — a 409 refusal becomes a success");
  });

  check(label + " does not announce success before checking the answer", () => {
    const guard = body.search(/isPaymentFailure\(/);
    const notify = body.search(/notify\(\s*["'`][^"'`]*(Entregado|Retirado|volvió|Buon)/);
    assert.ok(guard >= 0 && (notify === -1 || guard < notify),
      "the success notification is reachable without passing the payment guard");
  });

  check(label + " reports the backend's own reason, not a generic one", () => {
    assert.match(body, /describePaymentFailure\(/,
      "the typed backend code is dropped, so the operator cannot know why the cobro failed");
  });
}

console.log("\n[TabEntregas.handleForzaEntregado is no longer a collection surface at all]");

check("the handler never references marcarEntregado — the #723 risk is removed, not guarded", () => {
  // The strongest possible fix to "a collection could be invented here": there is no
  // collection call left to invent one from. If this ever regresses (someone re-adds a
  // marcarEntregado call to this handler), the isPaymentFailure/describePaymentFailure
  // guard above must come back with it — this assertion is the tripwire for that.
  const forced = handlerBody(ENTREGAS, "handleForzaEntregado");
  assert.doesNotMatch(forced, /marcarEntregado/,
    "TabEntregas.handleForzaEntregado references marcarEntregado again — it must either stay a non-collection trip action, or regain the isPaymentFailure guard");
});

check("the handler calls the canonical trip-closure action, not a payment one", () => {
  const forced = handlerBody(ENTREGAS, "handleForzaEntregado");
  assert.match(forced, /api\.chiudiGiro\(\)/,
    "expected the handler to call the canonical close_rider_trip action (api.chiudiGiro)");
});

console.log("\n[the frontend never invents a collection]");

check("no component assigns cobrado: true on its own", () => {
  for (const [label, source] of [["ServicioPage", SERVICIO], ["RepartidorPage", REPARTIDOR], ["TabEntregas", ENTREGAS]]) {
    assert.doesNotMatch(source, /cobrado:\s*true/, `${label} sets cobrado:true locally`);
  }
});

check("the optimistic RETIRADO patch is never treated as an accounting fact", () => {
  // Optimistic state is allowed (it is operative), but it must not carry payment fields.
  assert.doesNotMatch(SERVICIO, /estado:\s*ORDER_STATES\.RETIRADO,\s*cobrado/);
  assert.doesNotMatch(REPARTIDOR, /estado:\s*ORDER_STATES\.RETIRADO,\s*cobrado/);
});

console.log("");
console.log("Totale: " + (pass + fail) + " | PASS: " + pass + " | FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);
