jest.mock("../utils/backendBase", () => ({ BACKEND_BASE_URL: "https://staging.example" }));

import { createMessaRequestId, describeMessaError, messaApi } from "./messaApi";

describe("Mesa client helpers", () => {
  test("creates API-safe idempotency keys", () => {
    const id = createMessaRequestId("pay");
    expect(id).toMatch(/^pay_[A-Za-z0-9_-]+$/);
    expect(id.length).toBeLessThanOrEqual(128);
  });

  test("gives the operator a specific message when the table is already settled", () => {
    expect(describeMessaError({ code: "MESSA_ALREADY_SETTLED" })).toContain("ya está pagada");
  });

  test("explains that an open account prevents another opening", () => {
    expect(describeMessaError({ code: "MESSA_TABLE_NOT_RELEASED" })).toContain("cuenta abierta");
  });

  test("describes concurrent and overlapping reservation changes", () => {
    expect(describeMessaError({ code: "MESSA_RESERVATION_OVERLAP" })).toContain("dos horas");
    expect(describeMessaError({ code: "MESSA_RESERVATION_VERSION_CONFLICT" })).toContain("Otro operador");
  });
});
