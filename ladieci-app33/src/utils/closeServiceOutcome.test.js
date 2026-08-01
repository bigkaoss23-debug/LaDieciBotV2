import { classifyCloseOutcome, closeFailureMessage } from "./closeServiceOutcome";

describe("classifyCloseOutcome — no false success", () => {
  test("only success:true is a real success", () => {
    expect(classifyCloseOutcome({ success: true, summary: {} }).kind).toBe("success");
  });

  test("success:false is a failure, never a success (verify_failed)", () => {
    const o = classifyCloseOutcome({ success: false, error: "verify_failed" });
    expect(o.kind).toBe("failure");
    expect(o.message).toMatch(/verificación fallida/i);
    expect(o.message).not.toMatch(/verify_failed/); // no raw code leaked
  });

  test("close before 22:00 shows the backend message without the &force hint", () => {
    const res = {
      success: false,
      error: "Chiusura permessa solo dopo le 22:00 Madrid (ora attuale: 10:00). Per forzare aggiungere &force=true.",
    };
    const o = classifyCloseOutcome(res);
    expect(o.kind).toBe("failure");
    expect(o.message).toMatch(/22:00/);
    expect(o.message).not.toMatch(/&force=true/);
    expect(o.message).not.toMatch(/Per forzare/i);
  });

  test("skipped (already closed) is its own benign outcome", () => {
    expect(classifyCloseOutcome({ skipped: true, reason: "already_closed_session" }).kind).toBe("skipped");
  });

  test("empty / undefined response is a failure, not a success", () => {
    expect(classifyCloseOutcome(undefined).kind).toBe("failure");
    expect(classifyCloseOutcome({}).kind).toBe("failure");
    expect(classifyCloseOutcome(null).kind).toBe("failure");
  });

  test("a bare unknown error code never leaks raw to the operator", () => {
    const o = classifyCloseOutcome({ success: false, error: "some_internal_token" });
    expect(o.kind).toBe("failure");
    expect(o.message).toBe("No se pudo cerrar el servicio.");
  });

  test("known operational codes map to clean Spanish", () => {
    expect(closeFailureMessage({ error: "ordenes_delete_failed" })).toMatch(/no se pudieron eliminar los pedidos/i);
    expect(closeFailureMessage({ error: "active_rider_trip" })).toMatch(/reparto en curso/i);
    expect(closeFailureMessage({ error: "NO_SERVICE_SESSION" })).toMatch(/no hay un servicio abierto/i);
    // S2-7D5: the DB trigger raises the NO_OPEN_ variant; it must map too.
    expect(closeFailureMessage({ error: "NO_OPEN_SERVICE_SESSION" })).toMatch(/no hay un servicio abierto/i);
    const mesaMessage = closeFailureMessage({ error: "MESSA_TABLES_NOT_RELEASED" });
    expect(mesaMessage).toMatch(/mesas con la cuenta abierta/i);
    expect(mesaMessage).toMatch(/cobra esas cuentas/i);
    expect(mesaMessage).not.toMatch(/ocupad|libre|márca/i);
  });
});
