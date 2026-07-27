// S2-7D6E2 — the Netlify proxy must carry the operator's Authorization bearer to Railway.
//
// WHY A BEHAVIOURAL TEST. `authV2Cutover.static.test.js` already asserts the SHAPE of
// netlify/functions/api.js by regex (3 occurrences of the Bearer literal). A regex cannot
// see a header dropped at runtime — by an early return, a rewritten headers object, or a
// branch that forgets it. And a dropped bearer is not a cosmetic bug here: Railway's legacy
// guard would answer 401, the collection would never reach the ledger, and the operator
// would be told the pedido was retired. So this test INVOKES the real handler with a fake
// global.fetch and inspects what actually goes out.
//
// Offline: no network (fetch is replaced), no secrets (RAILWAY_API_KEY is a test literal).

const STAGING_SITE_ID = "a3ad035a-e73f-4da3-8873-6403e31f04b6";

function loadHandler(env = {}) {
  let handler;
  jest.isolateModules(() => {
    // The module resolves its backend URL at require time, so the env must be in place first.
    process.env.RAILWAY_API_KEY = "test-transport-key";
    process.env.BACKEND_API_URL = "https://backend.test/api";
    process.env.SITE_ID = env.SITE_ID || STAGING_SITE_ID;
    ({ handler } = require("../netlify/functions/api"));
  });
  return handler;
}

function fakeFetch(response = { status: 200, body: { success: true } }) {
  const calls = [];
  const fn = jest.fn(async (url, init) => {
    calls.push({ url, init: init || {} });
    return { status: response.status, json: async () => response.body };
  });
  fn.calls = calls;
  return fn;
}

const BEARER = "eyJhbGciOiJIUzI1NiJ9.payload.signature";

describe("Netlify proxy — Authorization forwarding", () => {
  const OLD_ENV = process.env;
  let handler;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    handler = loadHandler();
  });
  afterEach(() => { process.env = OLD_ENV; delete global.fetch; });

  test("POST: the incoming bearer reaches the backend verbatim, alongside X-Api-Key", async () => {
    global.fetch = fakeFetch();
    const res = await handler({
      httpMethod: "POST",
      headers: { authorization: `Bearer ${BEARER}` },   // Netlify lowercases header names
      body: JSON.stringify({ action: "updateEstado", id: "#723", estado: "RETIRADO", metodo_pago: "efectivo" }),
    });

    expect(res.statusCode).toBe(200);
    expect(global.fetch.calls).toHaveLength(1);
    const { init } = global.fetch.calls[0];
    expect(init.headers.Authorization).toBe(`Bearer ${BEARER}`);
    expect(init.headers["X-Api-Key"]).toBe("test-transport-key");
  });

  test("POST: a capitalised Authorization header is honoured too", async () => {
    global.fetch = fakeFetch();
    await handler({
      httpMethod: "POST",
      headers: { Authorization: `Bearer ${BEARER}` },
      body: JSON.stringify({ action: "marcarEntregado", id: "#723", cobrado: true, metodo_pago: "efectivo" }),
    });
    expect(global.fetch.calls[0].init.headers.Authorization).toBe(`Bearer ${BEARER}`);
  });

  test("GET: the bearer is forwarded on the read path as well", async () => {
    global.fetch = fakeFetch({ status: 200, body: [] });
    await handler({
      httpMethod: "GET",
      headers: { authorization: `Bearer ${BEARER}` },
      queryStringParameters: { action: "getOrdenes" },
    });
    expect(global.fetch.calls[0].init.headers.Authorization).toBe(`Bearer ${BEARER}`);
  });

  test("no bearer → 401 and NOTHING is proxied (fail closed, never body-derived identity)", async () => {
    global.fetch = fakeFetch();
    const res = await handler({
      httpMethod: "POST",
      headers: {},
      // A body that tries to name its own actor must not become an identity.
      body: JSON.stringify({ action: "updateEstado", id: "#723", estado: "RETIRADO",
        metodo_pago: "efectivo", actor_id: "owner", actor_type: "operator" }),
    });
    expect(res.statusCode).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("the proxy never substitutes its own identity for a missing one", async () => {
    global.fetch = fakeFetch();
    await handler({ httpMethod: "POST", headers: { authorization: "Bearer " },
      body: JSON.stringify({ action: "updateEstado", id: "#1" }) });
    // "Bearer " with an empty token is no token at all.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("a backend refusal is passed through unchanged — no silent success", async () => {
    global.fetch = fakeFetch({ status: 409, body: { success: false, code: "PAYMENT_CONTEXT_UNAVAILABLE" } });
    const res = await handler({
      httpMethod: "POST",
      headers: { authorization: `Bearer ${BEARER}` },
      body: JSON.stringify({ action: "updateEstado", id: "#723", estado: "RETIRADO", metodo_pago: "efectivo" }),
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body)).toEqual({ success: false, code: "PAYMENT_CONTEXT_UNAVAILABLE" });
  });

  test("the transport key is never echoed back to the browser", async () => {
    global.fetch = fakeFetch();
    const res = await handler({
      httpMethod: "POST",
      headers: { authorization: `Bearer ${BEARER}` },
      body: JSON.stringify({ action: "updateEstado", id: "#723" }),
    });
    expect(res.body).not.toMatch(/test-transport-key/);
    expect(JSON.stringify(res.headers)).not.toMatch(/test-transport-key/);
  });
});
