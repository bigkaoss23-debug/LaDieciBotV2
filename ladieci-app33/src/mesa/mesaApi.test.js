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
});
