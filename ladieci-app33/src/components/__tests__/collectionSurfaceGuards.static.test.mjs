// S2-7D6E2 — every surface that COLLECTS money must read the backend's answer.
//
// Standalone, run with: node src/components/__tests__/collectionSurfaceGuards.static.test.mjs
//
// WHY. `proxyPost` never throws. On a 409 it returns `{...body, _ok:false}` — a truthy
// object — so a `try/await/catch` around an api call sees a SUCCESS. That is precisely how
// a 12.00 cash sale (#723) was announced to the operator as collected while the ledger had
// no row. ServicioPage.setRetirado was fixed with isPaymentFailure(); the OTHER two
// surfaces that book a collection were not, and a `catch` block is not a substitute:
//   - RepartidorPage.handleEntregado   — the rider's Efectivo / Tarjeta buttons
//   - TabEntregas.handleForzaEntregado — the operator's "driver volvió" button
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
  ["TabEntregas.handleForzaEntregado", ENTREGAS, "handleForzaEntregado"],
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

console.log("\n[the frontend never invents a collection]");

check("no surface sends cobrado:true together with a non-collection method", () => {
  // "manual" is not a payment method: the backend registrar rejects it, so no ledger row is
  // written — but `cobrado:true` would still be persisted, recreating the exact #723 state
  // (RETIRADO + collected boolean + zero ledger events).
  const forced = handlerBody(ENTREGAS, "handleForzaEntregado");
  assert.doesNotMatch(forced, /marcarEntregado\([^)]*true[^)]*["']manual["']/,
    'TabEntregas books cobrado:true with metodo_pago:"manual" — a collection with no ledger event');
});

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
