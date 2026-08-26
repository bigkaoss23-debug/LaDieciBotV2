// MesaPaymentsList.test.js — Refund V1 Slice B, the shared payments/refund
// component used identically by the open-table Payment Hub and the closed-
// session detail. Direct DOM tests (raw ReactDOM + act(), same technique as
// PaymentHubDuplicate.test.js -- no @testing-library in this repo).
//
// THIS COMPONENT NEVER BRANCHES ON TABLE/SESSION STATUS (§12, frozen): it is
// handed sessionId/payments/canRefund/onRefunded and nothing else, so its own
// tests below prove open-table and closed-table behavior are IDENTICAL by
// construction -- there is no status prop to even diverge on. Integration-
// level "does the real closed/open surface wire this in" proof lives in
// TabMesa.ultimasCuentas.test.js and PaymentHub.test.js.
import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../mesa/mesaApi", () => ({
  __esModule: true,
  createMesaRequestId: jest.fn(() => "mesa_test_refund"),
  describeMesaError: jest.fn((error) => error?.code || "error"),
  mesaApi: { refund: jest.fn() },
}));

const MesaPaymentsList = require("./MesaPaymentsList").default;
const { mesaApi, describeMesaError, createMesaRequestId } = require("../../mesa/mesaApi");

beforeEach(() => {
  jest.clearAllMocks();
  // CRA's resetMocks:true wipes factory implementations before every test.
  describeMesaError.mockImplementation((error) => error?.code || "error");
  createMesaRequestId.mockImplementation(() => "mesa_test_refund");
});

function click(el) { act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }
function typeInto(el, value) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
const byTestId = (c, id) => c.querySelector(`[data-testid="${id}"]`);
const allByTestId = (c, id) => Array.from(c.querySelectorAll(`[data-testid="${id}"]`));

async function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<MesaPaymentsList {...props} />);
  });
  return { container, root };
}
function unmount(container, root) {
  act(() => { root.unmount(); });
  container.remove();
}

const ORIGINAL_TARJETA = {
  id: "pt-1", kind: "payment", mode: "full", amount: 33.5, method: "tarjeta",
  actor: "owner", createdAt: "2026-08-22T20:14:00Z", reversesTransactionId: null,
};
const ORIGINAL_EFECTIVO = {
  id: "pt-2", kind: "payment", mode: "full", amount: 30, method: "efectivo",
  actor: "owner", createdAt: "2026-08-22T20:20:00Z", reversesTransactionId: null,
};
const ORIGINAL_BIZUM = {
  id: "pt-3", kind: "payment", mode: "full", amount: 20, method: "bizum",
  actor: "owner", createdAt: "2026-08-22T20:25:00Z", reversesTransactionId: null,
};

// ── §30 ELIGIBILITY ─────────────────────────────────────────────────────────
describe("eligibility (§11/§30)", () => {
  test("a payment with refundableRemaining > 0 shows the Reembolsar CTA when canRefund", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    expect(byTestId(container, "mesa-payhist-refund-btn")).not.toBeNull();
    unmount(container, root);
  });

  test("a fully refunded payment shows NO CTA, only the completion badge", async () => {
    const payments = [ORIGINAL_TARJETA, { id: "rt-1", kind: "refund", amount: 33.5, method: "tarjeta", createdAt: "2026-08-22T20:47:00Z", reversesTransactionId: "pt-1" }];
    const { container, root } = await mount({ sessionId: "s1", payments, canRefund: true, onRefunded: jest.fn() });
    expect(byTestId(container, "mesa-payhist-refund-btn")).toBeNull();
    expect(byTestId(container, "mesa-payhist-full-badge")).not.toBeNull();
    expect(container.textContent).toContain("Reembolsado por completo");
    unmount(container, root);
  });

  test("a refund transaction never shows its own CTA (it is a child row, never a top-level refundable one)", async () => {
    const payments = [ORIGINAL_TARJETA, { id: "rt-1", kind: "refund", amount: 10, method: "tarjeta", createdAt: "2026-08-22T20:47:00Z", reversesTransactionId: "pt-1" }];
    const { container, root } = await mount({ sessionId: "s1", payments, canRefund: true, onRefunded: jest.fn() });
    // Exactly one item (the original) is a top-level entry with its own row.
    expect(allByTestId(container, "mesa-payhist-item").length).toBe(1);
    expect(allByTestId(container, "mesa-payhist-refund").length).toBe(1);
    unmount(container, root);
  });

  test("§12 -- refundable regardless of any table/session status: this component has no such prop to even branch on", async () => {
    // No status/tableStatus/isOpen prop exists in this component's contract.
    // Passing one is simply ignored -- proving eligibility can never be
    // gated on it by construction.
    const { container, root } = await mount({
      sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn(),
      tableStatus: "closed", isOpen: false,
    });
    expect(byTestId(container, "mesa-payhist-refund-btn")).not.toBeNull();
    unmount(container, root);
  });

  test("unauthorized role (canRefund=false) hides the CTA -- backend remains the real authority", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: false, onRefunded: jest.fn() });
    expect(byTestId(container, "mesa-payhist-refund-btn")).toBeNull();
    unmount(container, root);
  });

  test("empty payments renders nothing (not even the section header)", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [], canRefund: true, onRefunded: jest.fn() });
    expect(container.textContent).toBe("");
    unmount(container, root);
  });
});

// ── §31 REFUND CALCULATION (integration through the real component) ───────
describe("refund calculation surfaces correctly in the DOM (§31)", () => {
  test("30 original, 10 + 5 refunded -> shows refunded 15 available 15, never from a table aggregate", async () => {
    const payments = [
      { id: "pt-1", kind: "payment", amount: 30, method: "efectivo", createdAt: "t0", reversesTransactionId: null },
      { id: "rt-1", kind: "refund", amount: 10, method: "efectivo", createdAt: "t1", reversesTransactionId: "pt-1" },
      { id: "rt-2", kind: "refund", amount: 5, method: "efectivo", createdAt: "t2", reversesTransactionId: "pt-1" },
    ];
    const { container, root } = await mount({ sessionId: "s1", payments, canRefund: true, onRefunded: jest.fn() });
    expect(byTestId(container, "mesa-payhist-remaining").textContent).toContain("15,00");
    expect(allByTestId(container, "mesa-payhist-refund").length).toBe(2);
    unmount(container, root);
  });
});

// ── §14/§32 FORM ────────────────────────────────────────────────────────────
describe("refund form (§14/§32)", () => {
  test("default amount is the FULL refundable remaining", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    expect(byTestId(container, "mesa-refund-amount").value).toBe("33,50");
    unmount(container, root);
  });

  test("the operator may reduce the amount for a partial refund", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    typeInto(byTestId(container, "mesa-refund-amount"), "10,00");
    expect(byTestId(container, "mesa-refund-amount").value).toBe("10,00");
    unmount(container, root);
  });

  test("zero amount is refused before any request is sent", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    typeInto(byTestId(container, "mesa-refund-amount"), "0");
    click(byTestId(container, "mesa-refund-reason-importe"));
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();
    expect(mesaApi.refund).not.toHaveBeenCalled();
    expect(byTestId(container, "mesa-refund-error")).not.toBeNull();
    unmount(container, root);
  });

  test("a negative amount is refused before any request is sent", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    typeInto(byTestId(container, "mesa-refund-amount"), "-5");
    click(byTestId(container, "mesa-refund-reason-importe"));
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();
    expect(mesaApi.refund).not.toHaveBeenCalled();
    unmount(container, root);
  });

  test("an amount above what is available is refused before any request is sent", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    typeInto(byTestId(container, "mesa-refund-amount"), "999");
    click(byTestId(container, "mesa-refund-reason-importe"));
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();
    expect(mesaApi.refund).not.toHaveBeenCalled();
    unmount(container, root);
  });

  test("decimal comma parsing/rounding matches the rest of Mesa's amount inputs", async () => {
    mesaApi.refund.mockResolvedValue({ ok: true, amount: 12.34 });
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    typeInto(byTestId(container, "mesa-refund-amount"), "12,34");
    click(byTestId(container, "mesa-refund-reason-importe"));
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();
    expect(mesaApi.refund.mock.calls[0][1].amount).toBe(12.34);
    unmount(container, root);
  });

  test("reason is required -- no preset selected refuses submission", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();
    expect(mesaApi.refund).not.toHaveBeenCalled();
    unmount(container, root);
  });

  test('"Otro" requires free-text detail; a standard preset needs none', async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    click(byTestId(container, "mesa-refund-reason-otro"));
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();
    expect(mesaApi.refund).not.toHaveBeenCalled();
    expect(byTestId(container, "mesa-refund-reason-detail")).not.toBeNull();
    unmount(container, root);
  });

  test('"Devolución de producto" is not offered as a reason preset', async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    expect(container.textContent).not.toContain("Devolución de producto");
    unmount(container, root);
  });
});

// ── §16/§33 ECONOMIC WARNING (regression coverage, not just a comment) ─────
describe("economic warning (§16/§33, load-bearing)", () => {
  test("the warning is visible the moment the refund form opens", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    const warning = byTestId(container, "mesa-refund-warning");
    expect(warning.textContent).toMatch(/pendiente/i);
    expect(warning.textContent).toMatch(/no modifica el valor de la venta/i);
    unmount(container, root);
  });
});

// ── §17/§34 EXTERNAL METHOD COPY ────────────────────────────────────────────
describe("payment method: read-only, no tender selector, external-settlement copy (§17/§34)", () => {
  test("tarjeta: method shown read-only, datáfono warning visible", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    expect(byTestId(container, "mesa-refund-method").textContent).toBe("Tarjeta");
    expect(byTestId(container, "mesa-refund-external").textContent).toMatch(/datáfono/i);
    unmount(container, root);
  });

  test("bizum: external-settlement copy visible", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_BIZUM], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    expect(byTestId(container, "mesa-refund-external").textContent).toMatch(/Bizum/i);
    unmount(container, root);
  });

  test("efectivo: method shown read-only, NO POS/bank warning", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_EFECTIVO], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    expect(byTestId(container, "mesa-refund-method").textContent).toBe("Efectivo");
    expect(byTestId(container, "mesa-refund-external")).toBeNull();
    unmount(container, root);
  });

  test("no tender selector of any kind renders anywhere in the form", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    expect(container.querySelector(".mesa-method")).toBeNull();
    expect(container.querySelector(".mesa-methods")).toBeNull();
    unmount(container, root);
  });
});

// ── §18/§35 SUBMISSION / IDEMPOTENCY ────────────────────────────────────────
function serialIds() {
  let n = 0;
  createMesaRequestId.mockImplementation(() => `mesa_refund_${++n}`);
}

describe("submission and idempotency (§6/§18/§35, DUP-01 discipline)", () => {
  async function openAndFillValid(container) {
    click(byTestId(container, "mesa-payhist-refund-btn"));
    click(byTestId(container, "mesa-refund-reason-importe"));
  }

  // NOTE ON useRef(fn()): the initializer EXPRESSION (createMesaRequestId(...))
  // is evaluated on every render (JS evaluates arguments before useRef sees
  // them), even though useRef only ever stores the value from the first call
  // -- exactly the trap DUP-01's own tests already document. So the ACTUAL id
  // sent is never assumed to be a specific absolute serial number here; only
  // that it is a real, well-formed value the generator produced (never
  // undefined, never hardcoded), and -- in the tests below -- that it is
  // STABLE across a retry and DIFFERENT across a genuinely new attempt.
  test("the clientRequestId sent is a REAL generated value, never undefined or a stale default", async () => {
    serialIds();
    mesaApi.refund.mockResolvedValue({ ok: true, amount: 33.5 });
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    await openAndFillValid(container);
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();
    const sentId = mesaApi.refund.mock.calls[0][1].clientRequestId;
    expect(sentId).toMatch(/^mesa_refund_\d+$/);
    expect(createMesaRequestId.mock.results.map((r) => r.value)).toContain(sentId);
    unmount(container, root);
  });

  test("a failed attempt retried WITHOUT closing the form reuses the SAME id -- proven against a generator that never repeats", async () => {
    serialIds();
    mesaApi.refund.mockRejectedValueOnce({ code: "MESA_NETWORK_ERROR" }).mockResolvedValueOnce({ ok: true, amount: 33.5 });
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    await openAndFillValid(container);
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();
    const firstId = mesaApi.refund.mock.calls[0][1].clientRequestId;

    click(byTestId(container, "mesa-refund-confirm"));
    await flush();
    expect(mesaApi.refund.mock.calls[1][1].clientRequestId).toBe(firstId);
    // And the generator really was capable of producing something else.
    expect(createMesaRequestId.mock.results.map((r) => r.value)).toContain("mesa_refund_2");
    unmount(container, root);
  });

  test("double-clicking Reembolsar does not submit twice (busy disables the button)", async () => {
    let resolvePromise;
    mesaApi.refund.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve; }));
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    await openAndFillValid(container);
    const confirmBtn = byTestId(container, "mesa-refund-confirm");
    click(confirmBtn);
    await flush();
    expect(confirmBtn.disabled).toBe(true);
    click(confirmBtn); // no-op: disabled
    await flush();
    expect(mesaApi.refund).toHaveBeenCalledTimes(1);
    await act(async () => { resolvePromise({ ok: true, amount: 33.5 }); await Promise.resolve(); });
    unmount(container, root);
  });

  test("Cancelar sends NO request and creates no refund", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    typeInto(byTestId(container, "mesa-refund-amount"), "10,00");
    click(byTestId(container, "mesa-refund-cancel"));
    await flush();
    expect(mesaApi.refund).not.toHaveBeenCalled();
    expect(byTestId(container, "mesa-refund-form")).toBeNull();
    unmount(container, root);
  });

  test("a genuinely new attempt (reopen after Cancelar) sends a DIFFERENT id than a later reopen, against a generator that never repeats", async () => {
    serialIds();
    mesaApi.refund.mockResolvedValue({ ok: true, amount: 33.5 });
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });

    // Attempt 1: opened, then abandoned via Cancelar -- no request, its id
    // (whatever it was) is never observable and must never be reused.
    click(byTestId(container, "mesa-payhist-refund-btn"));
    click(byTestId(container, "mesa-refund-cancel"));
    await flush();

    // Attempt 2: a genuinely new logical attempt -- submitted for real.
    click(byTestId(container, "mesa-payhist-refund-btn"));
    click(byTestId(container, "mesa-refund-reason-importe"));
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();
    const secondSentId = mesaApi.refund.mock.calls[0][1].clientRequestId;

    // Attempt 3: reopening the SAME transaction again (this isolated test's
    // static `payments` prop still shows it refundable -- the real app would
    // have refreshed via onRefunded) is ALSO a new logical attempt and must
    // get yet another fresh id, never attempt 2's.
    click(byTestId(container, "mesa-payhist-refund-btn"));
    click(byTestId(container, "mesa-refund-reason-importe"));
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();
    const thirdSentId = mesaApi.refund.mock.calls[1][1].clientRequestId;

    expect(thirdSentId).not.toBe(secondSentId);
    unmount(container, root);
  });

  test("success calls onRefunded (server refresh) and never fabricates state locally", async () => {
    mesaApi.refund.mockResolvedValue({ ok: true, amount: 33.5 });
    const onRefunded = jest.fn().mockResolvedValue(undefined);
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded });
    await openAndFillValid(container);
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();
    expect(onRefunded).toHaveBeenCalledTimes(1);
    expect(byTestId(container, "mesa-refund-success")).not.toBeNull();
    expect(byTestId(container, "mesa-refund-form")).toBeNull(); // form closes on success
    unmount(container, root);
  });

  test("a server error does NOT call onRefunded and does not fabricate a refund row locally", async () => {
    mesaApi.refund.mockRejectedValue({ code: "MESA_TRANSACTION_NOT_FOUND" });
    const onRefunded = jest.fn();
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded });
    await openAndFillValid(container);
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();
    expect(onRefunded).not.toHaveBeenCalled();
    expect(byTestId(container, "mesa-refund-error").textContent).toBe("MESA_TRANSACTION_NOT_FOUND");
    unmount(container, root);
  });
});

// ── §23/§39 STALE SERVER STATE ───────────────────────────────────────────────
describe("server-conflict refresh (§23/§39)", () => {
  test.each(["MESA_REFUND_EXCEEDS_REMAINING", "MESA_REFUND_ALREADY_FULL"])(
    "%s refreshes the account from the server instead of keeping stale availability",
    async (code) => {
      mesaApi.refund.mockRejectedValue({ code });
      const onRefunded = jest.fn().mockResolvedValue(undefined);
      const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded });
      click(byTestId(container, "mesa-payhist-refund-btn"));
      click(byTestId(container, "mesa-refund-reason-importe"));
      click(byTestId(container, "mesa-refund-confirm"));
      await flush();
      expect(onRefunded).toHaveBeenCalledTimes(1);
      unmount(container, root);
    }
  );

  test("an unrelated error does NOT trigger a refresh", async () => {
    mesaApi.refund.mockRejectedValue({ code: "MESA_REFUND_FORBIDDEN" });
    const onRefunded = jest.fn();
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    click(byTestId(container, "mesa-refund-reason-importe"));
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();
    expect(onRefunded).not.toHaveBeenCalled();
    unmount(container, root);
  });
});

// ── §21/§36 PARTIAL / MULTIPLE REFUNDS ──────────────────────────────────────
describe("partial and multiple refunds (§21/§36)", () => {
  test("reopening after a partial refund's fresh payments prop defaults the amount to the NEW remaining", async () => {
    const { container, root, } = await mount({
      sessionId: "s1",
      payments: [ORIGINAL_TARJETA, { id: "rt-1", kind: "refund", amount: 10, method: "tarjeta", createdAt: "t1", reversesTransactionId: "pt-1" }],
      canRefund: true, onRefunded: jest.fn(),
    });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    expect(byTestId(container, "mesa-refund-amount").value).toBe("23,50");
    unmount(container, root);
  });

  test("re-rendering with updated payments (simulating a server refresh) recomputes remaining, never keeping a one-refund assumption", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<MesaPaymentsList sessionId="s1" payments={[ORIGINAL_TARJETA]} canRefund={true} onRefunded={jest.fn()} />);
    });
    expect(byTestId(container, "mesa-payhist-refund-btn")).not.toBeNull();

    const afterFirst = [ORIGINAL_TARJETA, { id: "rt-1", kind: "refund", amount: 10, method: "tarjeta", createdAt: "t1", reversesTransactionId: "pt-1" }];
    await act(async () => {
      root.render(<MesaPaymentsList sessionId="s1" payments={afterFirst} canRefund={true} onRefunded={jest.fn()} />);
    });
    expect(byTestId(container, "mesa-payhist-remaining").textContent).toContain("23,50");

    const afterSecond = [...afterFirst, { id: "rt-2", kind: "refund", amount: 5, method: "tarjeta", createdAt: "t2", reversesTransactionId: "pt-1" }];
    await act(async () => {
      root.render(<MesaPaymentsList sessionId="s1" payments={afterSecond} canRefund={true} onRefunded={jest.fn()} />);
    });
    expect(byTestId(container, "mesa-payhist-remaining").textContent).toContain("18,50");
    expect(byTestId(container, "mesa-payhist-refund-btn")).not.toBeNull(); // still refundable

    unmount(container, root);
  });
});

// ── §25 ACCESSIBILITY ────────────────────────────────────────────────────────
describe("accessibility (§25)", () => {
  test("every action is a real <button>, none icon-only, none nested inside another button", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    for (const button of container.querySelectorAll("button")) {
      expect(button.querySelector("button")).toBeNull();
      expect(button.textContent.trim().length).toBeGreaterThan(0);
    }
    unmount(container, root);
  });

  test("Cancelar and Reembolsar are disabled (not merely visually) while a request is in flight", async () => {
    mesaApi.refund.mockReturnValue(new Promise(() => {}));
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    click(byTestId(container, "mesa-refund-reason-importe"));
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();
    expect(byTestId(container, "mesa-refund-cancel").disabled).toBe(true);
    expect(byTestId(container, "mesa-refund-confirm").disabled).toBe(true);
    unmount(container, root);
  });

  test("reason preset buttons expose aria-pressed for the selected state", async () => {
    const { container, root } = await mount({ sessionId: "s1", payments: [ORIGINAL_TARJETA], canRefund: true, onRefunded: jest.fn() });
    click(byTestId(container, "mesa-payhist-refund-btn"));
    click(byTestId(container, "mesa-refund-reason-duplicado"));
    expect(byTestId(container, "mesa-refund-reason-duplicado").getAttribute("aria-pressed")).toBe("true");
    expect(byTestId(container, "mesa-refund-reason-importe").getAttribute("aria-pressed")).toBe("false");
    unmount(container, root);
  });
});
