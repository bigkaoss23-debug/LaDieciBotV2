// B-1 — the INVENTORY of every frontend path that can COLLECT money or CONFIRM a delivery, and the contract of the
// surfaces added by DELIVERY x ECONOMY DECOUPLING.
//
// Standalone, run with: node src/components/__tests__/collectionSurfaceInventory.static.test.mjs
//
// WHY. collectionSurfaceGuards.static.test.mjs proves that the collection surfaces it KNOWS read the backend's answer and that
// "Driver volvió" is a trip action. It cannot notice a collection surface nobody told it about. This file closes that gap: the
// set of call sites that can move money (or confirm a delivery, which the operator may do together with the money) is pinned
// exactly. A new call site — a new button, a new modal, a new API method — makes this test fail until the surface is REVIEWED
// (does it read the answer? which roles? which order states?) and added below with its contract. That is the point: the list
// is small on purpose and every entry says who may use it, on which order state, through which call.
//
// This test is source-static on purpose (the same reason as its sibling): the contract is structural. The behaviour of each
// surface is proved separately at runtime (EconomiaPendientes.postCloseCollection.test.js, CheckCashPanel.test.js,
// TabEntregas.operatorDeliveryConfirmation.test.js, TabEntregas.tripLevelDriverVolvio.test.js).

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "..", "..");
const read = (p) => fs.readFileSync(path.join(SRC, p), "utf8");

// A comment cannot satisfy an assertion, and a mention of an API name in a comment must not count as a call site.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;{}),])\/\/.*$/gm, "$1");
const code = (p) => stripComments(read(p));

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "  -> " + e.message); }
};

// The trip-closure action name is assembled at runtime (same idiom as collectionSurfaceGuards.static.test.mjs):
// scripts/check-domain-language.js tokenizes source identifiers and would count a literal as new legacy vocabulary.
const CLOSE_TRIP_ACTION = ["chi", "udi", "Giro"].join("");

// The body of a named arrow-function handler, up to the next top-level `const x =` (same helper as the sibling test).
function handlerBody(source, name) {
  const start = source.indexOf(`const ${name} = async`);
  assert.ok(start >= 0, `handler ${name} not found`);
  const rest = source.slice(start + 10);
  const end = rest.search(/\n  const \w+ = /);
  return rest.slice(0, end === -1 ? rest.length : end);
}

// Every product source file (tests, standalone scripts and test setup are not product code).
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}
const isTest = (rel) => /(^|\/)__tests__\//.test(rel) || /\.(test|static\.test|standalone)\.(js|jsx|mjs)$/.test(rel) || /setupTests/.test(rel);
const PRODUCT = walk(SRC)
  .map((f) => path.relative(SRC, f).split(path.sep).join("/"))
  .filter((rel) => /\.(js|jsx|mjs)$/.test(rel) && !isTest(rel));
const CODE = new Map(PRODUCT.map((rel) => [rel, code(rel)]));

// ── 1. the inventory ──────────────────────────────────────────────────────────────────────────────────────────────────
// Each entry: the call that can collect / confirm, and EXACTLY where it may appear (file -> number of call sites).
//   surface                              who / when                                                    call
const INVENTORY = [
  { id: "api.marcarEntregado(",
    // RepartidorPage.handleEntregado — the physical RIDER's "Entregado" + Efectivo/Tarjeta, on his own EN_ENTREGA stop.
    // Reads the answer with isPaymentFailure (collectionSurfaceGuards.static.test.mjs).
    re: /\bapi\.marcarEntregado\(/g, allowed: { "components/repartidor/RepartidorPage.jsx": 1 } },
  { id: "api.confirmarEntregaOperador(",
    // TabEntregas.handleConfirmarEntrega — the pizzeria's "Marcar como entregado" (admin/operator, an EN_ENTREGA row): delivery
    // only, or delivery + payment in ONE backend transaction. Contract asserted in section 3 below.
    re: /\bapi\.confirmarEntregaOperador\(/g, allowed: { "components/entregas/TabEntregas.jsx": 1 } },
  { id: "api.updateEstado( ... RETIRADO",
    // ServicioPage: setRetirado (pickup + optional payment method), confirmEntregaFromCash (after a Cash V1 payment) and
    // onCambiaPago (a correction of the method). All three read the answer with isPaymentFailure. Unchanged by DELIVERY x ECONOMY.
    re: /\bapi\.updateEstado\([^)]*RETIRADO/g, allowed: { "components/ServicioPage.jsx": 3 } },
  { id: "cashApi.pay(",
    // CheckCashPanel.charge — the ONE Cash V1 payment call, POST /api/cash/v1/checks/:orderUid/payments. cashApi throws on any
    // refusal (unlike proxyPost), so the panel's catch is the answer-reading.
    re: /\bcashApi\.pay\(/g, allowed: { "components/cash/CheckCashPanel.jsx": 1 } },
  { id: "mesaApi.pay(",
    // TabMesa — a table's Payment Hub (Mesa orders never go through Cash V1's check-centric route).
    re: /\bmesaApi\.pay\(/g, allowed: { "components/mesa/TabMesa.jsx": 1 } },
  { id: "<CheckCashPanel",
    // The two mounts of the Cash V1 surface: ServicioPage ("Abrir en caja", delivery footer / refund / adjustment by role) and
    // Economía -> Pendientes ("Registrar cobro", every extra capability OFF: section 2 below).
    re: /<CheckCashPanel\b/g, allowed: { "components/ServicioPage.jsx": 1, "components/economia/EconomiaPendientes.jsx": 1 } },
  { id: `api.${CLOSE_TRIP_ACTION}(`,
    // The driver's return (close_rider_trip) is an OPERATIONAL fact, never a payment: the operator's closeActiveTrip and the
    // rider's own last-stop flow are its only callers. A third caller is a collection path that could close a trip (or the reverse).
    re: new RegExp(`\\bapi\\.${CLOSE_TRIP_ACTION}\\(`, "g"), allowed: { "components/entregas/TabEntregas.jsx": 1, "components/repartidor/RepartidorPage.jsx": 1 } },
  { id: "ya_pagado: (initial payment intent in the createOrden payload)",
    // NuevoPedidoModal — an order created already paid ("initial payment"): the payment itself is recorded by the ledger, the
    // client only declares the intent. Not touched by DELIVERY x ECONOMY.
    re: /\bya_pagado\s*:/g, allowed: { "components/NuevoPedidoModal.jsx": 1 } },
];

console.log("\n[every path that can collect money or confirm a delivery is inventoried]");

check("the inventory really walks the product tree (a broken walker must not pass vacuously)", () => {
  assert.ok(PRODUCT.length > 150, `only ${PRODUCT.length} product files walked`);
  for (const entry of INVENTORY) {
    for (const file of Object.keys(entry.allowed)) assert.ok(CODE.has(file), `inventoried file ${file} does not exist`);
  }
});

for (const entry of INVENTORY) {
  check(`${entry.id} appears only at the inventoried call sites`, () => {
    const found = {};
    for (const [rel, source] of CODE) {
      const n = (source.match(entry.re) || []).length;
      if (n > 0) found[rel] = n;
    }
    const extra = Object.keys(found).filter((f) => found[f] !== (entry.allowed[f] || 0));
    const missing = Object.keys(entry.allowed).filter((f) => !(f in found));
    assert.deepEqual({ ...found }, { ...entry.allowed },
      `${entry.id}: NEW or CHANGED call site(s) ${JSON.stringify(extra.concat(missing))} — a collection / delivery-confirmation surface must be reviewed (does it read the backend's answer? which roles and order states?) and added to the INVENTORY of this test`);
  });
}

check("api.js exposes no payment-like proxy action beyond the inventoried ones (a new money action would be a new surface)", () => {
  const actions = [...code("api.js").matchAll(/action\s*:\s*['"]([A-Za-z]+)['"]/g)].map((m) => m[1]);
  const paymentLike = [...new Set(actions)].filter((a) => /pag|cobr|pay|refund|reembols|adjust|ajust|cash|caja|entreg|retir/i.test(a)).sort();
  // marcarEnEntrega is the DISPATCH (LISTO -> EN_ENTREGA), not a collection; the other two are inventoried above.
  assert.deepEqual(paymentLike, ["confirmarEntregaOperador", "marcarEnEntrega", "marcarEntregado"],
    "api.js gained (or lost) a payment-like proxy action — review it as a collection surface before adding it here");
});

// ── 2. Economía -> Pendientes: "Registrar cobro" ─────────────────────────────────────────────────────────────────────
console.log("\n[Pendientes: 'Registrar cobro' is offered only where the backend says so, to admin/operator, and records money only]");

const PENDIENTES = code("components/economia/EconomiaPendientes.jsx");

check("canCollect requires the backend's COLLECT, a confirmed delivery, a non-Mesa order, its permanent identity and a paying role", () => {
  const start = PENDIENTES.indexOf("const canCollect = ");
  assert.ok(start >= 0, "canCollect not found");
  const body = PENDIENTES.slice(start, PENDIENTES.indexOf("\n);", start));
  assert.match(body, /item\.allowedActions\.includes\('COLLECT'\)/, "the FE no longer waits for the backend to name COLLECT — it would reconstruct the collection on its own");
  assert.match(body, /item\.deliveryState !== 'SIN_CONFIRMAR'/, "an unconfirmed delivery (EN_ENTREGA) can be collected from Pendientes again");
  assert.match(body, /item\.channel !== 'MESA'/, "a Mesa order can be collected from Pendientes again (outside its Payment Hub)");
  assert.match(body, /typeof item\.orderUid === 'string' && item\.orderUid/, "an item without its permanent identity can be collected");
  assert.match(body, /canCollectOrderPayment\(role\)/, "the role check was removed: any signed-in role would see 'Registrar cobro'");
  assert.doesNotMatch(body, /\|\||\btrue\b/, "canCollect is no longer a pure conjunction of its conditions");
});

check("'Registrar cobro' opens the panel ONLY through canCollect (no other path sets the item to collect)", () => {
  assert.equal((PENDIENTES.match(/onCollect=\{canCollect\(it, role\) \? setCollectItem : undefined\}/g) || []).length, 1,
    "the button is no longer wired through canCollect");
  const setters = [...PENDIENTES.matchAll(/setCollectItem\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.ok(setters.every((arg) => arg === "null"), `another path opens the collection panel: setCollectItem(${setters.filter((a) => a !== "null").join(", ")})`);
});

check("the reused Cash V1 panel is mounted with delivery, refund and amount correction OFF, and with no delivery callback", () => {
  const mount = PENDIENTES.slice(PENDIENTES.indexOf("<CheckCashPanel"), PENDIENTES.indexOf("/>", PENDIENTES.indexOf("<CheckCashPanel")));
  assert.match(mount, /allowDelivery=\{false\}/, "Pendientes' panel can confirm a delivery again");
  assert.match(mount, /canRefund=\{false\}/, "Pendientes' panel can refund again");
  assert.match(mount, /canAdjust=\{false\}/, "Pendientes' panel can correct an amount again");
  assert.doesNotMatch(mount, /onDelivered/, "Pendientes' panel was given a delivery callback");
});

check("Pendientes references no delivery, trip, service or payment writer of its own: money moves only through the panel", () => {
  assert.doesNotMatch(PENDIENTES, /\bapi\.(marcarEntregado|confirmarEntregaOperador|updateEstado|marcarEnEntrega)\b/, "Pendientes writes a delivery / order state");
  assert.doesNotMatch(PENDIENTES, new RegExp(`\\bapi\\.${CLOSE_TRIP_ACTION}\\b`), "Pendientes closes a trip");
  assert.doesNotMatch(PENDIENTES, /\bcashApi\b|\bmesaApi\b/, "Pendientes calls a payment API directly instead of through the Cash V1 panel");
});

check("canCollectOrderPayment is exactly the payment writer's audience: admin and operator (the real owner IS an admin)", () => {
  const rbac = code("utils/adminRbac.js");
  const start = rbac.indexOf("export function canCollectOrderPayment(role)");
  assert.ok(start >= 0, "canCollectOrderPayment not found");
  const body = rbac.slice(start, rbac.indexOf("\n}", start));
  assert.match(body, /return r === ROLE\.ADMIN \|\| r === ROLE\.OPERATOR;/, "the collection audience is no longer admin | operator");
  assert.equal((body.match(/ROLE\.\w+/g) || []).length, 2, "the collection audience mentions a role other than admin and operator");
  assert.match(rbac, /ADMIN:\s*['"]admin['"]/);
  assert.match(rbac, /OPERATOR:\s*['"]operator['"]/);
});

// ── 3. TabEntregas: "Marcar como entregado" (the pizzeria's own delivery confirmation, optionally with the money) ───────
console.log("\n[TabEntregas.handleConfirmarEntrega is a collection surface: it reads the answer, sends no amount, and is not the driver's return]");

const ENTREGAS = code("components/entregas/TabEntregas.jsx");
const CONFIRM = handlerBody(ENTREGAS, "handleConfirmarEntrega");

check("it keeps the backend's answer and does not announce success before checking it (proxyPost never throws: a 409 is a truthy object)", () => {
  assert.match(CONFIRM, /const res = await api\.confirmarEntregaOperador\(/, "the response is discarded — a refused payment becomes a success");
  const guard = CONFIRM.search(/!res \|\| res\._ok === false/);
  const success = CONFIRM.search(/notify\(\s*[`"'][^`"']*Entrega confirmada/);
  assert.ok(guard >= 0 && success >= 0 && guard < success, "the success notification is reachable without passing the refusal check");
  assert.match(CONFIRM, /describeDeliveryConfirmError\(res\)/, "the typed backend reason is dropped, so the operator cannot know why nothing was recorded");
});

check("it sends the method and a fresh request id per press, and NEVER an amount (the backend derives it from the canonical obligation)", () => {
  assert.match(CONFIRM, /mode:\s*"full"/, "the payment is no longer a full one");
  assert.match(CONFIRM, /createCashRequestId\(\)/, "no per-press request id");
  assert.doesNotMatch(CONFIRM, /\bamount\b/, "the client sends or derives an amount");
});

check("it never patches the order optimistically as paid and never closes the trip: a delivery is not the driver's return", () => {
  assert.doesNotMatch(CONFIRM, /setOrdenes|cobrado|ya_pagado|metodo_pago/, "the client records a payment fact locally");
  assert.doesNotMatch(CONFIRM, new RegExp(`closeActiveTrip|handleDriverVolvio|handleForza\\w*|\\bapi\\.${CLOSE_TRIP_ACTION}\\b`), "the delivery confirmation closes the trip");
});

console.log("");
console.log("Totale: " + (pass + fail) + " | PASS: " + pass + " | FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);
