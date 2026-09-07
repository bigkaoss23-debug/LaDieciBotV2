// alreadyPaidRetiradoLifecycleOnly.test.js — CHECK-CENTRIC UNIVERSAL CASH V1
// fast-follow. Closes the blocker the final review found: an already-paid
// order's "Retirado" resent the order's own payment method, so the backend
// treated a pure lifecycle transition as a NEW collection.
//
// The chain that broke:
//   TabListos "Retirado"  ->  ServicioPage.setRetirado  ->  api.updateEstado
//   -> index.js `collecting = estado === "RETIRADO" && isCollectionMethod(metodo_pago)`
//   -> operatorPayments.registerPayment -> order_mark_paid / the legacy writer.
// For a CANONICALLY paid order the canonical evidence already exists, so the
// legacy writer answers AUTH_BASIS_EXISTS and the whole transition fails 409 —
// the order could never be handed over.
//
// This file tests the layer the other two cannot reach: the REQUEST ACTUALLY
// PUT ON THE WIRE. TabListosCashWiring.test.js proves the button calls
// onRetirado with no method; this proves that, once ServicioPage forwards it,
// the serialized body carries no payment intent at all. ServicioPage itself is
// a 2100-line page with ~40 imports and is not mountable in jsdom (which is
// why every other ServicioPage test in this repo is `.static`), so the seam
// between the two behavioral layers is bound by an explicit source assertion
// at the bottom rather than left to assumption.
//
// Transport pattern (mocked global.fetch against the REAL api module) is the
// one already used by apiAuthLogoutScope.test.js / draftGuardWriteLock.test.js.

const ORDER_ID = "#999041";

const loadApi = () => { jest.resetModules(); return require("../../api").api; };

const okResponse = () => ({
  status: 200, ok: true, json: async () => ({ success: true }),
});

let fetchSpy;
beforeEach(() => {
  fetchSpy = jest.fn().mockResolvedValue(okResponse());
  global.fetch = fetchSpy;
});
afterEach(() => { delete global.fetch; });

// The exact call ServicioPage.setRetirado makes for an ALREADY-PAID order:
// `metodo_pago` defaults to "" and is normalised to undefined before the call.
const proxyBodies = () =>
  fetchSpy.mock.calls
    .filter(([url]) => String(url) === "/api/proxy")
    .map(([, init]) => JSON.parse(init.body));

describe("already-paid Retirado is a lifecycle-only transition", () => {
  test("the request omits metodo_pago entirely — the key is absent, not empty", async () => {
    const api = loadApi();
    await api.updateEstado(ORDER_ID, "RETIRADO", undefined, null);

    const bodies = proxyBodies();
    expect(bodies).toHaveLength(1);
    const body = bodies[0];

    expect(body.action).toBe("updateEstado");
    expect(body.id).toBe(ORDER_ID);
    expect(body.estado).toBe("RETIRADO");

    // The load-bearing assertion. `in` (not `=== undefined`) is deliberate:
    // the backend's `for (k of [...]) if (req.body[k] !== undefined)` copies
    // the key into `extras` whenever it is PRESENT, so presence is what counts.
    expect("metodo_pago" in body).toBe(false);
    expect(JSON.stringify(body)).not.toContain("metodo_pago");
  });

  test("no payment payload of any kind rides along with the transition", async () => {
    const api = loadApi();
    await api.updateEstado(ORDER_ID, "RETIRADO", undefined, null);

    const body = proxyBodies()[0];
    // `cobrado`/`ya_pagado` are ledger-owned (S2-7D6E2) and a discount carried
    // by a collection is refused outright by N-5; none may appear here.
    for (const key of ["metodo_pago", "cobrado", "ya_pagado", "descuento_tipo", "descuento_valor", "importe", "monto"]) {
      expect(body[key]).toBeUndefined();
    }
    expect(Object.keys(body).sort()).toEqual(["action", "estado", "id"]);
  });

  test("the canonical cash API is NOT called — no second collection is attempted", async () => {
    const api = loadApi();
    await api.updateEstado(ORDER_ID, "RETIRADO", undefined, null);

    // cashApi.pay() posts to `${BACKEND_BASE_URL}/api/cash/v1/checks/<uid>/payments`.
    // A lifecycle-only handover must not touch it: the money already exists.
    const cashCalls = fetchSpy.mock.calls.filter(([url]) => /\/api\/cash\/v1\//.test(String(url)));
    expect(cashCalls).toEqual([]);
    const paymentPosts = fetchSpy.mock.calls.filter(([url]) => /\/payments\b/.test(String(url)));
    expect(paymentPosts).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("REGRESSION GUARD: an empty-string method would still serialize — why `|| undefined` is load-bearing", async () => {
    const api = loadApi();
    await api.updateEstado(ORDER_ID, "RETIRADO", "", null);

    // This is NOT the desired behavior; it documents the trap the fix avoids.
    // api.js omits the field only for `undefined` (`if (metodo_pago !== undefined)`),
    // and the backend's state-transition writer cambiaStato does
    // `if (extras.metodo_pago !== undefined)
    // upd.metodo_pago = extras.metodo_pago || ""` — so "" reaches the DB and
    // BLANKS the order's real payment method. `|| undefined` in setRetirado is
    // what prevents that; if this ever stops holding, the fix has been undone.
    const body = proxyBodies()[0];
    expect("metodo_pago" in body).toBe(true);
    expect(body.metodo_pago).toBe("");
  });

  test("a real collection still sends its method — the unpaid path is untouched", async () => {
    const api = loadApi();
    await api.updateEstado(ORDER_ID, "RETIRADO", "efectivo", null);

    const body = proxyBodies()[0];
    expect(body.metodo_pago).toBe("efectivo");
  });
});

describe("the ServicioPage seam that joins the two behavioral layers", () => {
  const src = () =>
    require("fs").readFileSync(
      require("path").join(__dirname, "..", "ServicioPage.jsx"), "utf8");

  test("setRetirado normalises an absent method to undefined before calling the API", () => {
    // Guards the one character that matters: `metodo_pago || undefined`, NOT
    // `metodo_pago || ""`. The transport tests above prove what each of those
    // two spellings puts on the wire.
    expect(src()).toContain(
      'api.updateEstado(id, ORDER_STATES.RETIRADO, metodo_pago || undefined, descuento)');
    expect(src()).not.toContain(
      'api.updateEstado(id, ORDER_STATES.RETIRADO, metodo_pago || "", descuento)');
  });

  test("the optimistic local mirror keeps the order's existing method instead of blanking it", () => {
    expect(src()).toContain("metodo_pago: metodo_pago || o.metodo_pago");
  });

  test("setRetirado is what the unified ready list calls as onRetirado", () => {
    // Binds TabListosCashWiring.test.js's onRetirado assertions to the real
    // handler whose request shape is asserted above.
    expect(src()).toContain("onRetirado={setRetirado}");
  });
});

// ── MICRO FAST-FOLLOW: confirmEntregaFromCash mirror preservation ─────────
// confirmEntregaFromCash is the ONLY caller CheckCashPanel.onDelivered ever
// reaches (both "Confirmar entrega" on a settled check and "Entregar sin
// cobrar" on an unpaid one wire to the SAME prop — see CheckCashPanel.test.js
// "Confirmar entrega calls onDelivered" / "'Entregar sin cobrar' ... calls
// onDelivered directly"). It used to call
// `api.updateEstado(order.id, ORDER_STATES.RETIRADO, "", null)` — an explicit
// "" survives api.js's `!== undefined` check and gets serialized. Concretely:
// an operator opens an unpaid Servicio order's check, pays it (the canonical
// writer correctly sets the compatibility mirror to "efectivo"/"tarjeta"/…),
// then confirms delivery — and THAT request would blank the mirror the
// payment had just written, one write later. Same "" vs undefined trap as
// setRetirado, different call site.
describe("confirmEntregaFromCash (the CheckCashPanel delivery handover) is lifecycle-only", () => {
  test("the request omits metodo_pago — a just-written payment mirror cannot be blanked", async () => {
    const api = loadApi();
    // Exactly what confirmEntregaFromCash calls today (order.id, RETIRADO, undefined, null).
    await api.updateEstado(ORDER_ID, "RETIRADO", undefined, null);

    const body = proxyBodies()[0];
    expect(body.action).toBe("updateEstado");
    expect(body.estado).toBe("RETIRADO");
    expect("metodo_pago" in body).toBe(false);
    expect(Object.keys(body).sort()).toEqual(["action", "estado", "id"]);
  });

  test("REGRESSION GUARD: the old \"\" call shape is what would have blanked the mirror", async () => {
    // Documents the exact defect fixed here — same guard shape as setRetirado's
    // equivalent test above, pinned to confirmEntregaFromCash's own former call.
    const api = loadApi();
    await api.updateEstado(ORDER_ID, "RETIRADO", "", null);
    const body = proxyBodies()[0];
    expect("metodo_pago" in body).toBe(true);
    expect(body.metodo_pago).toBe("");
  });
});

describe("the ServicioPage seam for confirmEntregaFromCash", () => {
  const src = () =>
    require("fs").readFileSync(
      require("path").join(__dirname, "..", "ServicioPage.jsx"), "utf8");

  test("confirmEntregaFromCash calls updateEstado with an omitted method, not an empty string", () => {
    expect(src()).toContain(
      'api.updateEstado(order.id, ORDER_STATES.RETIRADO, undefined, null)');
    expect(src()).not.toContain(
      'api.updateEstado(order.id, ORDER_STATES.RETIRADO, "", null)');
  });

  test("onDelivered is wired to confirmEntregaFromCash — the sole caller CheckCashPanel reaches", () => {
    expect(src()).toContain("await confirmEntregaFromCash(cashOrder.order)");
  });
});
