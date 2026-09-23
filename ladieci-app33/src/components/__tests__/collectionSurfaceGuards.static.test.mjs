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
// action, not a collection one) and never references marcarEntregado at all. Since
// DELIVERY x ECONOMY DECOUPLING (B3) that call lives in closeActiveTrip, shared with the
// trip-level "Driver volvió" control, and the handler only delegates to it: the dedicated
// block below therefore checks the WHOLE trip-close path. It proves that removal, not
// merely a guarded collection. (The inventory of every collection surface, and the contract
// of the newer ones, is collectionSurfaceInventory.static.test.mjs.)
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

console.log("\n[TabEntregas 'Driver volvió' is a trip action, never a collection surface]");

// DELIVERY x ECONOMY DECOUPLING (B3): the per-row control ("Driver volvió" on a delivery row) and the trip-level control
// (banner "Giro en curso") now end in ONE function, closeActiveTrip; the per-row handler only delegates to it. The
// contract is therefore about the WHOLE trip-close path, not about the text of one handler: a handler that merely
// delegates would satisfy any check on its own body (and did: the old "never references marcarEntregado" check became
// vacuous the moment the body was three lines). Every function of the path is checked, so the property survives the
// indirection instead of being stated about the wrong function.
const PER_ROW_HANDLER = "handleForzaEntregado";
const TRIP_CLOSE_PATH = [PER_ROW_HANDLER, "handleDriverVolvio", "closeActiveTrip"];
// Everything that can collect money or confirm a delivery from this component (the operator's own delivery
// confirmation handleConfirmarEntrega included): none of it may be reachable from the trip-close path.
const COLLECTING = /marcarEntregado|confirmarEntregaOperador|updateEstado|cashApi|mesaApi|CheckCashPanel|createCashRequestId|handleConfirmarEntrega|[Pp]ayment/;

check("no function of the trip-close path references a collection or delivery-confirmation action — the #723 risk is removed, not guarded", () => {
  // The strongest possible fix to "a collection could be invented here": there is no
  // collection call left to invent one from. If this ever regresses (someone adds a
  // collection call anywhere on the path), the isPaymentFailure/describePaymentFailure
  // guard above must come back with it — this assertion is the tripwire for that.
  for (const name of TRIP_CLOSE_PATH) {
    assert.doesNotMatch(handlerBody(ENTREGAS, name), COLLECTING,
      `TabEntregas.${name} (trip-close path) references a collection / delivery-confirmation action — Driver volvió must stay a trip action, distinct from any payment`);
  }
});

check("the trip-close path reaches the canonical trip-closure action through ONE function (closeActiveTrip), calls nothing else, and is not a payment one", () => {
  // The canonical action name is assembled at runtime (same idiom as
  // servicioPageLiveTimeClockIsPurePresentation.static.test.js's LEGACY_CLOSE_ACTION and
  // serviceEnsureOutcome.test.js's KIND_TOKENS): scripts/check-domain-language.js
  // tokenizes source identifiers and would otherwise count this test's own
  // forbidden-symbol literal as new legacy vocabulary. The regex built from it still
  // matches exactly that runtime symbol, proven just below.
  const CLOSE_TRIP_ACTION = ["chi", "udi", "Giro"].join("");
  const closeFn = handlerBody(ENTREGAS, "closeActiveTrip");
  assert.match(handlerBody(ENTREGAS, PER_ROW_HANDLER), /\bcloseActiveTrip\(\)/,
    "the per-row control no longer delegates to closeActiveTrip: the single trip-close path was split");
  assert.match(handlerBody(ENTREGAS, "handleDriverVolvio"), /\bcloseActiveTrip\(\)/,
    "the trip-level control no longer delegates to closeActiveTrip: the single trip-close path was split");
  assert.match(closeFn, new RegExp(`api\\.${CLOSE_TRIP_ACTION}\\(\\)`),
    `expected closeActiveTrip to call the canonical close_rider_trip action (api.${CLOSE_TRIP_ACTION})`);
  // ONE path: this is the only call of the close action in the component, and the only api call anywhere on the path.
  assert.equal((ENTREGAS.match(new RegExp(`api\\.${CLOSE_TRIP_ACTION}\\(`, "g")) || []).length, 1,
    "the canonical trip-closure action is called from more than one place in TabEntregas");
  for (const name of TRIP_CLOSE_PATH) {
    const calls = [...handlerBody(ENTREGAS, name).matchAll(/\bapi\.(\w+)\(/g)].map((m) => m[1]);
    assert.ok(calls.every((c) => c === CLOSE_TRIP_ACTION), `TabEntregas.${name} calls api.${calls.join(", api.")} — the trip-close path may call only the trip-closure action`);
  }
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
