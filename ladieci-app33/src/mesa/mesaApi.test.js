jest.mock("../utils/backendBase", () => ({ BACKEND_BASE_URL: "https://staging.example" }));
jest.mock("../api", () => ({ auth: { getToken: () => "test-token", clear: jest.fn() } }));

import { createMesaRequestId, describeMesaError, mesaApi, MESA_API_ROOT } from "./mesaApi";

describe("Mesa client helpers", () => {
  test("creates API-safe idempotency keys", () => {
    const id = createMesaRequestId("pay");
    expect(id).toMatch(/^pay_[A-Za-z0-9_-]+$/);
    expect(id.length).toBeLessThanOrEqual(128);
  });

  test("gives the operator a specific message when the table is already settled", () => {
    expect(describeMesaError({ code: "MESA_ALREADY_SETTLED" })).toContain("ya está pagada");
  });

  test("explains that an open account prevents another opening", () => {
    expect(describeMesaError({ code: "MESA_TABLE_NOT_RELEASED" })).toContain("cuenta abierta");
  });

  test("describes concurrent and overlapping reservation changes", () => {
    expect(describeMesaError({ code: "MESA_RESERVATION_OVERLAP" })).toContain("dos horas");
    expect(describeMesaError({ code: "MESA_RESERVATION_VERSION_CONFLICT" })).toContain("Otro operador");
  });

  test("describes the deferred-covers guards", () => {
    expect(describeMesaError({ code: "MESA_COVERS_REQUIRED" })).toContain("comensales");
    expect(describeMesaError({ code: "MESA_COVERS_NOT_SET" })).toContain("comensales");
    expect(describeMesaError({ code: "MESA_TABLE_HAS_ORDERS" })).toContain("comandas");
  });

  // Backend order-intake schedule gate (17:30-18:00 buffer between lunch and
  // dinner service) -- this is NOT a Mesa-specific/balance guard, and must
  // never render as the generic fallback (it used to, since
  // ORDER_INTAKE_CLOSED had no ERROR_MESSAGES entry, which is exactly what
  // made the buffer window look like a Mesa bug during real UAT).
  test("explains the order-intake schedule buffer instead of the generic fallback", () => {
    const message = describeMesaError({ code: "ORDER_INTAKE_CLOSED" });
    expect(message).toBe("Ahora no se pueden enviar nuevas comandas. El servicio vuelve a abrir a las 18:00.");
    expect(message).not.toBe("No se pudo completar la operación. Actualiza e inténtalo de nuevo.");
  });
});

// REFUND V1 -- every domain code mesa_post_refund_v1 / order_refund's
// containment guard can raise must have a specific, operator-safe Spanish
// message in THIS slice (the Slice A audit's own requirement). None may fall
// through to the generic fallback, and none may leak SQL/technical detail.
describe("Refund V1 -- error dictionary completeness", () => {
  const GENERIC_FALLBACK = "No se pudo completar la operación. Actualiza e inténtalo de nuevo.";
  const REQUIRED_CODES = [
    "MESA_REFUND_INVALID", "MESA_REFUND_META_INVALID", "MESA_REFUND_AMOUNT_INVALID",
    "MESA_REFUND_REASON_REQUIRED", "MESA_RELOGIN_REQUIRED", "MESA_REFUND_FORBIDDEN",
    "MESA_TRANSACTION_NOT_FOUND", "MESA_SESSION_NOT_FOUND", "MESA_REFUND_TRANSACTION_MISMATCH",
    "MESA_REFUND_NOT_REFUNDABLE", "MESA_REFUND_EXCEEDS_REMAINING", "MESA_REFUND_ALREADY_FULL",
    "MESA_REFUND_IDEMPOTENCY_CONFLICT", "MESA_REFUND_ALLOCATION_MISMATCH", "AUTH_REFUND_TRANSACTION_BACKED",
  ];

  test.each(REQUIRED_CODES)("%s has a specific message, never the generic fallback", (code) => {
    const message = describeMesaError({ code });
    expect(message).not.toBe(GENERIC_FALLBACK);
    expect(typeof message).toBe("string");
    expect(message.length).toBeGreaterThan(0);
  });

  test("no message leaks SQL/technical vocabulary to the operator", () => {
    for (const code of REQUIRED_CODES) {
      const message = describeMesaError({ code });
      expect(message).not.toMatch(/SELECT|INSERT|RAISE|SQLSTATE|constraint|null pointer|undefined/i);
    }
  });

  test("specific UX semantics for the state-conflict codes (contract §7 examples)", () => {
    expect(describeMesaError({ code: "MESA_REFUND_ALREADY_FULL" })).toContain("reembolsado por completo");
    expect(describeMesaError({ code: "MESA_REFUND_EXCEEDS_REMAINING" })).toContain("disponible");
    expect(describeMesaError({ code: "MESA_REFUND_FORBIDDEN" })).toContain("permiso");
  });

  test("a defensive guard against the DUP-01 undefined===undefined trap: an error with NO code never matches any refund code by accident", () => {
    // err?.code is falsy here, so describeMesaError must fall through to its
    // own MESA_SERVER_ERROR default -- never to whatever REQUIRED_CODES[0]
    // happens to be (which is exactly the bug class an `err.code === undefined`
    // comparison would produce).
    expect(describeMesaError({})).not.toBe(describeMesaError({ code: REQUIRED_CODES[0] }));
    expect(describeMesaError(undefined)).toBe(describeMesaError({}));
  });
});

describe("Refund V1 -- mesaApi.refund() request shape", () => {
  const jsonResponse = (body, ok = true, status = 200) => Promise.resolve({
    ok, status, json: () => Promise.resolve(body),
  });

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("posts to the exact Slice A endpoint for this session", async () => {
    global.fetch.mockReturnValue(jsonResponse({ ok: true, refundTransactionId: "rt-1" }));
    await mesaApi.refund("session-9", {
      originalTransactionId: "pt-1", amount: 10, reason: "Error de importe", clientRequestId: "refund_abc",
    });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe(`https://staging.example${MESA_API_ROOT}/sessions/session-9/refunds`);
    expect(init.method).toBe("POST");
  });

  test("sends exactly originalTransactionId/amount/reason/clientRequestId -- nothing else", async () => {
    global.fetch.mockReturnValue(jsonResponse({ ok: true }));
    await mesaApi.refund("session-9", {
      originalTransactionId: "pt-1", amount: 10, reason: "Error de importe", clientRequestId: "refund_abc",
    });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(Object.keys(body).sort()).toEqual(["amount", "clientRequestId", "originalTransactionId", "reason"].sort());
    expect(body.originalTransactionId).toBe("pt-1");
    expect(body.amount).toBe(10);
    expect(body.reason).toBe("Error de importe");
    expect(body.clientRequestId).toBe("refund_abc");
  });

  test("NEVER sends paymentMethod, lineIds, coversSettled or confirmDuplicate -- backend is authoritative for all four", async () => {
    global.fetch.mockReturnValue(jsonResponse({ ok: true }));
    await mesaApi.refund("session-9", {
      originalTransactionId: "pt-1", amount: 10, reason: "Error de importe", clientRequestId: "refund_abc",
    });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect("paymentMethod" in body).toBe(false);
    expect("lineIds" in body).toBe(false);
    expect("coversSettled" in body).toBe(false);
    expect("confirmDuplicate" in body).toBe(false);
  });

  test("a session id with reserved URL characters is encoded", async () => {
    global.fetch.mockReturnValue(jsonResponse({ ok: true }));
    await mesaApi.refund("session with spaces/9", { originalTransactionId: "pt-1", amount: 1, reason: "Otro", clientRequestId: "r1" });
    const [url] = global.fetch.mock.calls[0];
    expect(url).toBe(`https://staging.example${MESA_API_ROOT}/sessions/${encodeURIComponent("session with spaces/9")}/refunds`);
  });

  test("a domain error from the backend surfaces as a MesaApiError carrying the exact code", async () => {
    global.fetch.mockReturnValue(jsonResponse({ ok: false, code: "MESA_REFUND_ALREADY_FULL" }, false, 409));
    await expect(mesaApi.refund("session-9", {
      originalTransactionId: "pt-1", amount: 1, reason: "Otro", clientRequestId: "r1",
    })).rejects.toMatchObject({ code: "MESA_REFUND_ALREADY_FULL", status: 409 });
  });
});

// OVER-COLLECTED / AJUSTE COMERCIAL SLICE C -- close acknowledgement + adjust route.
describe("Slice C -- close over-collected acknowledgement", () => {
  const jsonResponse = (body, ok = true, status = 200) => Promise.resolve({
    ok, status, json: () => Promise.resolve(body),
  });
  beforeEach(() => { global.fetch = jest.fn(); });

  test("the FIRST close attempt sends an empty body -- never confirmOverCollected", async () => {
    global.fetch.mockReturnValue(jsonResponse({ ok: true, status: "closed" }));
    await mesaApi.closeTable("s9");
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe(`https://staging.example${MESA_API_ROOT}/sessions/s9/close`);
    expect(JSON.parse(init.body)).toEqual({});
  });

  test("the acknowledged retry sends { confirmOverCollected: true } -- and ONLY on === true", async () => {
    global.fetch.mockReturnValue(jsonResponse({ ok: true, status: "closed" }));
    await mesaApi.closeTable("s9", { confirmOverCollected: true });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ confirmOverCollected: true });

    global.fetch.mockClear();
    await mesaApi.closeTable("s9", { confirmOverCollected: "yes" });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({});
    global.fetch.mockClear();
    await mesaApi.closeTable("s9", { confirmOverCollected: 1 });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({});
  });

  test("MESA_CLOSE_OVER_COLLECTED carries the parsed overCollected number onto the thrown error", async () => {
    global.fetch.mockReturnValue(jsonResponse({ ok: false, code: "MESA_CLOSE_OVER_COLLECTED", overCollected: 10 }, false, 409));
    await expect(mesaApi.closeTable("s9")).rejects.toMatchObject({
      code: "MESA_CLOSE_OVER_COLLECTED", status: 409, overCollected: 10,
    });
  });

  test("no other rejection carries overCollected -- it stays null", async () => {
    global.fetch.mockReturnValue(jsonResponse({ ok: false, code: "MESA_TABLE_NOT_SETTLED" }, false, 409));
    await mesaApi.closeTable("s9").catch((err) => {
      expect(err.code).toBe("MESA_TABLE_NOT_SETTLED");
      expect(err.overCollected).toBeNull();
    });
  });

  test("MESA_CLOSE_OVER_COLLECTED / MESA_CLOSE_INCIDENT_PERSISTENCE_FAILED have specific, non-technical copy", () => {
    const generic = "No se pudo completar la operación. Actualiza e inténtalo de nuevo.";
    expect(describeMesaError({ code: "MESA_CLOSE_OVER_COLLECTED" })).not.toBe(generic);
    expect(describeMesaError({ code: "MESA_CLOSE_INCIDENT_PERSISTENCE_FAILED" })).not.toBe(generic);
    expect(describeMesaError({ code: "MESA_CLOSE_INCIDENT_PERSISTENCE_FAILED" })).not.toMatch(/SQL|SELECT|INSERT|constraint|null/i);
  });
});

describe("Ajuste Comercial V1 -- mesaApi.adjust() request shape", () => {
  const jsonResponse = (body, ok = true, status = 200) => Promise.resolve({
    ok, status, json: () => Promise.resolve(body),
  });
  beforeEach(() => { global.fetch = jest.fn(); });

  test("posts to /sessions/:id/adjustments", async () => {
    global.fetch.mockReturnValue(jsonResponse({ ok: true, currentObligation: 20 }));
    await mesaApi.adjust("session-9", {
      orderUid: "11111111-1111-4111-8111-111111111111", newGross: 20, reason: "Cortesía",
      expectedCurrentGross: 30, clientRequestId: "adj_abc",
    });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe(`https://staging.example${MESA_API_ROOT}/sessions/session-9/adjustments`);
    expect(init.method).toBe("POST");
  });

  test("passes exactly the fields it is given -- and never a payment/refund/line/cash field", async () => {
    global.fetch.mockReturnValue(jsonResponse({ ok: true }));
    await mesaApi.adjust("session-9", {
      orderUid: "11111111-1111-4111-8111-111111111111", newGross: 20, reason: "Cortesía",
      expectedCurrentGross: 30, clientRequestId: "adj_abc",
    });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(Object.keys(body).sort()).toEqual(
      ["clientRequestId", "expectedCurrentGross", "newGross", "orderUid", "reason"].sort());
    for (const forbidden of ["paymentMethod", "lineIds", "coversSettled", "confirmDuplicate",
      "originalTransactionId", "amount", "status", "revision", "cash", "id"]) {
      expect(forbidden in body).toBe(false);
    }
  });

  test("every MESA_ADJUSTMENT_* code + ORDER_WITHOUT_STABLE_IDENTITY has specific copy, no SQL leak", () => {
    const generic = "No se pudo completar la operación. Actualiza e inténtalo de nuevo.";
    const codes = [
      "MESA_ADJUSTMENT_FORBIDDEN", "MESA_ADJUSTMENT_REASON_REQUIRED", "MESA_ADJUSTMENT_INVALID",
      "MESA_ADJUSTMENT_META_INVALID", "MESA_ADJUSTMENT_EXCEEDS_OBLIGATION", "MESA_ADJUSTMENT_NO_CHANGE",
      "MESA_ADJUSTMENT_STALE_OBLIGATION", "MESA_ADJUSTMENT_IDEMPOTENCY_CONFLICT",
      "MESA_ADJUSTMENT_ORDER_NOT_FOUND", "MESA_ADJUSTMENT_ORDER_MISMATCH", "ORDER_WITHOUT_STABLE_IDENTITY",
    ];
    for (const code of codes) {
      const message = describeMesaError({ code });
      expect(message).not.toBe(generic);
      expect(message).not.toMatch(/SQL|SELECT|INSERT|constraint|pg_|prosrc/i);
    }
    expect(describeMesaError({ code: "MESA_ADJUSTMENT_EXCEEDS_OBLIGATION" })).toMatch(/reducir/i);
    expect(describeMesaError({ code: "MESA_ADJUSTMENT_FORBIDDEN" })).toMatch(/permiso/i);
  });

  test("a domain error surfaces as a MesaApiError with the exact code", async () => {
    global.fetch.mockReturnValue(jsonResponse({ ok: false, code: "MESA_ADJUSTMENT_STALE_OBLIGATION" }, false, 409));
    await expect(mesaApi.adjust("session-9", {
      orderUid: "u", newGross: 1, reason: "x", clientRequestId: "r",
    })).rejects.toMatchObject({ code: "MESA_ADJUSTMENT_STALE_OBLIGATION", status: 409 });
  });
});
