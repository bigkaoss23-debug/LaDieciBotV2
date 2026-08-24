// S2-7D6E — collection outcome helpers.
//
// The regression these lock down is concrete: a 12.00 cash sale on staging (#723) was
// reported to the operator as retired-and-paid while the backend had recorded no payment
// at all. Any response that is not unambiguously a success must read as a failure.
import {
  isPaymentFailure,
  describePaymentFailure,
  PAYMENT_FAILURE_MESSAGES,
  PAYMENT_GENERIC_FAILURE,
} from "./paymentOutcome";

describe("isPaymentFailure", () => {
  test("a clean success is not a failure", () => {
    expect(isPaymentFailure({ success: true, _ok: true, _status: 200 })).toBe(false);
  });

  test("HTTP failure with an EMPTY body is a failure (the silent-success bug)", () => {
    // proxyPost never throws; before this helper `!res.error` made this look successful.
    expect(isPaymentFailure({ _ok: false, _status: 409 })).toBe(true);
  });

  test("backend success:false is a failure even when _ok is absent", () => {
    expect(isPaymentFailure({ success: false, code: "AUTH_SESSION_STALE" })).toBe(true);
  });

  test("legacy error field is still honoured", () => {
    expect(isPaymentFailure({ error: "boom" })).toBe(true);
  });

  test("null/undefined/non-object responses fail closed", () => {
    expect(isPaymentFailure(null)).toBe(true);
    expect(isPaymentFailure(undefined)).toBe(true);
    expect(isPaymentFailure("ok")).toBe(true);
  });
});

describe("describePaymentFailure", () => {
  test("maps every known code to a specific operator message", () => {
    for (const code of Object.keys(PAYMENT_FAILURE_MESSAGES)) {
      const d = describePaymentFailure({ success: false, code });
      expect(d.code).toBe(code);
      expect(d.message).toBe(PAYMENT_FAILURE_MESSAGES[code]);
      expect(d.message).not.toBe(PAYMENT_GENERIC_FAILURE);
    }
  });

  test("an unknown code falls back to the generic sentence, never echoing the token", () => {
    const d = describePaymentFailure({ success: false, code: "SOME_NEW_SQL_CODE" });
    expect(d.message).toBe(PAYMENT_GENERIC_FAILURE);
    expect(d.message).not.toMatch(/SOME_NEW_SQL_CODE/);
  });

  test("falls back to the error field when no code is present", () => {
    expect(describePaymentFailure({ error: "AUTH_SESSION_STALE" }).message)
      .toBe(PAYMENT_FAILURE_MESSAGES.AUTH_SESSION_STALE);
  });

  test("a shapeless response still yields a usable message", () => {
    const d = describePaymentFailure(null);
    expect(d.code).toBeNull();
    expect(d.message).toBe(PAYMENT_GENERIC_FAILURE);
  });

  test("every failure is retryable — the backend key is deterministic per order", () => {
    expect(describePaymentFailure({ code: "AUTH_SESSION_STALE" }).retryable).toBe(true);
    expect(describePaymentFailure({}).retryable).toBe(true);
  });

  test("messages are operator-facing Spanish, not raw codes", () => {
    for (const msg of Object.values(PAYMENT_FAILURE_MESSAGES)) {
      expect(msg).not.toMatch(/^[A-Z_]+$/);
      expect(msg.length).toBeGreaterThan(15);
    }
  });

  // N-5 — refusing a collection that would ALSO move the order's economic basis. Without
  // its own entry the operator would get the generic sentence, which says nothing about
  // the discount and gives them no way forward.
  test("the paid-order economic refusal has its own explanation, not the generic one", () => {
    const d = describePaymentFailure({
      success: false,
      code: "PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN",
      error: "PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN",
    });
    expect(d.code).toBe("PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN");
    expect(d.message).not.toBe(PAYMENT_GENERIC_FAILURE);
    expect(d.message).toBe(PAYMENT_FAILURE_MESSAGES.PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN);
    // It must tell the operator what to do instead, not just that it failed.
    expect(d.message).toMatch(/descuento/i);
  });

  test("that refusal is recognised as a failure at all (nothing was charged)", () => {
    expect(isPaymentFailure({ success: false, code: "PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN" })).toBe(true);
  });
});
