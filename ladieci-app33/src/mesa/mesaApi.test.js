jest.mock("../utils/backendBase", () => ({ BACKEND_BASE_URL: "https://staging.example" }));

import { createMesaRequestId, describeMesaError, mesaApi } from "./mesaApi";

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
