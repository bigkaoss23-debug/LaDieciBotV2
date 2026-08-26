// DUP-01 — MESA DUPLICATE-PAYMENT CONFIRMATION.
//
// mesa_post_payment_v1 has been able to tell a double-submit from a real second
// payment since 2026-08-15: it raises MESA_POSSIBLE_DUPLICATE_PAYMENT when the
// same table session already took a payment with the SAME kind/mode/amount/
// payment_method/covers_settled under a DIFFERENT client_request_id inside 120
// seconds, and proceeds when the caller passes p_confirm_duplicate. The whole
// backend chain (mesaHttpHandlers -> mesaService -> mesaDao -> RPC) has shipped.
// The frontend never sent the flag and had no copy for the code, so the single
// commonest real split — two guests each paying 30,00 tarjeta on a 60,00 check —
// died on a generic "actualiza e inténtalo de nuevo" that stayed true for two
// minutes. This file is the guard for the half that was missing.
//
// THE ECONOMICS ARE NOT THIS SLICE. Every assertion here is about WHICH request
// leaves the browser. No amount is recomputed, no mode is invented, and the
// backend contract is untouched.
import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

const DUPLICATE_CODE = "MESA_POSSIBLE_DUPLICATE_PAYMENT";

jest.mock("../../mesa/mesaApi", () => ({
  __esModule: true,
  createMesaRequestId: jest.fn(() => "mesa_test_request"),
  describeMesaError: jest.fn((error) => error?.code || "error"),
  // The component imports the code from the api module so both ends spell it
  // once. Mocking it here keeps that single source of truth honest.
  MESA_DUPLICATE_PAYMENT_CODE: "MESA_POSSIBLE_DUPLICATE_PAYMENT",
  mesaApi: {
    floor: jest.fn(), openTable: jest.fn(), releaseEmptyTable: jest.fn(), closeTable: jest.fn(),
    saveTable: jest.fn(), addCommand: jest.fn(), markServed: jest.fn(), pay: jest.fn(),
    createReservation: jest.fn(), updateReservation: jest.fn(), setReservationStatus: jest.fn(),
    openReservation: jest.fn(),
  },
}));

const TabMesa = require("./TabMesa").default;
const { mesaApi, describeMesaError, createMesaRequestId } = require("../../mesa/mesaApi");

// react-scripts sets resetMocks:true, which strips factory implementations
// before every test — without re-arming, describeMesaError returns undefined
// and no error banner ever mounts, so the "different error" assertions would
// pass vacuously. Same reasoning as PaymentHub.test.js.
beforeEach(() => {
  describeMesaError.mockImplementation((error) => error?.code || "error");
  createMesaRequestId.mockImplementation(() => "mesa_test_request");
});

const failWith = (code) => Object.assign(new Error(code || "boom"), code ? { code } : {});

// The manual-smoke fixture, mid-scenario: a 60,00 € check for 2 covers on which
// guest 1 has already paid 30,00. Guest 2's identical 30,00 tarjeta is exactly
// the payment the backend cannot tell apart from a double-tap.
const SPLIT_SESSION = {
  id: "session-split", coversTotal: 2, coversRemaining: 1,
  total: 60, paid: 30, outstanding: 30, nextEqualShare: 30,
  paymentTotals: { tarjeta: 30 },
  commands: [{ id: "c1", commandNumber: 1, state: "RETIRADO", time: "21:10", items: [{ n: "La Joya", q: 2 }] }],
  payments: [{ id: "p1", kind: "payment", mode: "custom_amount", amount: 30, method: "tarjeta", coversSettled: 1, createdAt: "2026-08-25T21:12:00Z" }],
  lines: [
    { id: "l1", description: "La Joya", amount: 30, paid: 30, remaining: 0, product: { fantasyName: "La Joya", classicName: "Bufala" } },
    { id: "l2", description: "La Joya", amount: 15, paid: 0, remaining: 15, product: { fantasyName: "La Joya", classicName: "Bufala" } },
    { id: "l3", description: "El Pelusa", amount: 15, paid: 0, remaining: 15, product: { fantasyName: "El Pelusa", classicName: "Margherita" } },
  ],
};
const TABLE = {
  id: "t7", number: 7, x: 40, y: 40, shape: "square", shapePreset: "standard",
  active: true, capacity: 2, reservations: [], status: "open", session: SPLIT_SESSION,
};

function click(el) { act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
const byTestId = (c, id) => c.querySelector(`[data-testid="${id}"]`);
const buttonByText = (c, text) =>
  Array.from(c.querySelectorAll("button")).find((b) => b.textContent.trim() === text);

async function openHub({ table = TABLE } = {}) {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [table] });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TabMesa role="admin" notify={jest.fn()} onNewCommand={jest.fn()} onCountChange={jest.fn()}
      compact={false} mesaDrafts={{}} onClearDraft={jest.fn()} onSendToCocina={jest.fn()} />);
  });
  click(container.querySelector(".mesa-table"));
  await flush();
  click(buttonByText(container, "Ver cuenta"));
  await flush();
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

// Guest 2 pays 30,00 tarjeta via Por personas, and the backend flags it.
async function triggerDuplicateViaPersonas(container) {
  click(byTestId(container, "mesa-hub-pago-parcial"));
  click(byTestId(container, "mesa-hub-mode-personas"));
  click(byTestId(container, "mesa-hub-person-1"));
  click(Array.from(container.querySelectorAll(".mesa-method")).find((b) => b.textContent.includes("Tarjeta")));
  click(buttonByText(container, "Confirmar cobro"));
  await flush();
}

// ── A. ERROR RECOGNITION ───────────────────────────────────────────────────
test("A · a duplicate-flagged payment opens the confirmation, not a generic failure", async () => {
  mesaApi.pay.mockRejectedValue(failWith(DUPLICATE_CODE));
  const { container, root } = await openHub();
  await triggerDuplicateViaPersonas(container);

  const dialog = byTestId(container, "mesa-hub-duplicate");
  expect(dialog).not.toBeNull();
  expect(dialog.textContent).toContain("Posible pago duplicado");
  expect(dialog.textContent).toContain("¿Es realmente un segundo pago?");
  // The operator is never shown the wire code, and this is NOT the error path.
  expect(dialog.textContent).not.toContain("MESA_");
  expect(byTestId(container, "mesa-hub-error")).toBeNull();
  // Both actions exist and are readable.
  expect(byTestId(container, "mesa-hub-duplicate-cancel").textContent).toBe("Cancelar");
  expect(byTestId(container, "mesa-hub-duplicate-confirm").textContent).toBe("Registrar igualmente");
  unmount(container, root);
});

test("A · the amount at stake is shown, so the operator confirms a figure and not a dialog", async () => {
  mesaApi.pay.mockRejectedValue(failWith(DUPLICATE_CODE));
  const { container, root } = await openHub();
  await triggerDuplicateViaPersonas(container);
  // Intl separates the amount from € with a NON-BREAKING space.
  expect(byTestId(container, "mesa-hub-duplicate-amount").textContent).toMatch(/30,00\s?€/);
  unmount(container, root);
});

// ── B. CANCEL ──────────────────────────────────────────────────────────────
test("B · Cancelar issues no second request and leaves the account untouched", async () => {
  mesaApi.pay.mockRejectedValue(failWith(DUPLICATE_CODE));
  const { container, root } = await openHub();
  await triggerDuplicateViaPersonas(container);
  expect(mesaApi.pay).toHaveBeenCalledTimes(1);

  click(byTestId(container, "mesa-hub-duplicate-cancel"));
  await flush();

  // No retry, ever — this is the whole point of the cancel arm.
  expect(mesaApi.pay).toHaveBeenCalledTimes(1);
  expect(byTestId(container, "mesa-hub-duplicate")).toBeNull();
  // And nothing was optimistically marked collected: the hub still reads the
  // session the backend gave it — 30,00 paid of 60,00, 30,00 outstanding.
  expect(byTestId(container, "mesa-hub-paid").textContent).toMatch(/30,00\s?€/);
  expect(byTestId(container, "mesa-hub-outstanding").textContent).toMatch(/30,00\s?€/);
  unmount(container, root);
});

// ── D. REQUEST IDENTITY, PROVEN AGAINST A MOVING GENERATOR ────────────────
// The suite's default mock returns one constant id, which would make
// "the retry reuses the first id" pass even if the code regenerated it. These
// two tests hand out a DIFFERENT id on every call, so the assertion can only
// hold if the component really is holding one id across the confirmation.
function serialIds() {
  let n = 0;
  createMesaRequestId.mockImplementation(() => `mesa_pay_${++n}`);
}

test("D · the confirmed retry reuses the FIRST attempt's id, against a generator that never repeats", async () => {
  serialIds();
  mesaApi.pay
    .mockRejectedValueOnce(failWith(DUPLICATE_CODE))
    .mockResolvedValueOnce({ amount: 30, outstandingAfter: 0 });
  const { container, root } = await openHub();
  await triggerDuplicateViaPersonas(container);
  const firstId = mesaApi.pay.mock.calls[0][1].clientRequestId;

  click(byTestId(container, "mesa-hub-duplicate-confirm"));
  await flush();

  expect(mesaApi.pay.mock.calls[1][1].clientRequestId).toBe(firstId);
  // And the generator really was capable of producing something else.
  expect(createMesaRequestId.mock.results.map((r) => r.value)).toContain("mesa_pay_2");
  unmount(container, root);
});

test("B · Cancelar abandons the attempt without renumbering it — the next charge still replays", async () => {
  serialIds();
  mesaApi.pay.mockRejectedValue(failWith(DUPLICATE_CODE));
  const { container, root } = await openHub();
  await triggerDuplicateViaPersonas(container);
  const firstId = mesaApi.pay.mock.calls[0][1].clientRequestId;

  click(byTestId(container, "mesa-hub-duplicate-cancel"));
  await flush();
  expect(mesaApi.pay).toHaveBeenCalledTimes(1);

  // Re-confirming the SAME drawer without reopening the action is still the
  // same logical payment, so the backend must still see the same key and
  // replay rather than double-charge.
  click(buttonByText(container, "Confirmar cobro"));
  await flush();
  expect(mesaApi.pay).toHaveBeenCalledTimes(2);
  expect(mesaApi.pay.mock.calls[1][1].clientRequestId).toBe(firstId);
  expect("confirmDuplicate" in mesaApi.pay.mock.calls[1][1]).toBe(false);
  unmount(container, root);
});

// ── C + D + E. CONFIRM, IDENTITY, PAYLOAD ──────────────────────────────────
test("C+D+E · Registrar igualmente re-sends the SAME payment plus confirmDuplicate", async () => {
  mesaApi.pay
    .mockRejectedValueOnce(failWith(DUPLICATE_CODE))
    .mockResolvedValueOnce({ amount: 30, outstandingAfter: 0 });
  const { container, root } = await openHub();
  await triggerDuplicateViaPersonas(container);

  const first = mesaApi.pay.mock.calls[0][1];
  click(byTestId(container, "mesa-hub-duplicate-confirm"));
  await flush();

  expect(mesaApi.pay).toHaveBeenCalledTimes(2);
  const [sessionId, retry] = mesaApi.pay.mock.calls[1];
  expect(sessionId).toBe("session-split");

  // C — the flag, and it is the ONLY semantic addition.
  expect(retry.confirmDuplicate).toBe(true);
  // D — SAME logical payment attempt. This is what keeps every existing
  // idempotency guarantee (unique key, request_hash, double-tap, network
  // retry) intact instead of turning a confirmation into a fresh charge.
  expect(retry.clientRequestId).toBe(first.clientRequestId);
  expect(retry.clientRequestId).toBe("mesa_test_request");
  // E — everything else re-sent verbatim, proven as a whole-object identity so
  // a silently dropped field cannot slip through.
  expect(retry).toEqual({ ...first, confirmDuplicate: true });
  expect(retry).toEqual({
    paymentMethod: "tarjeta", mode: "custom_amount", amount: 30, coversSettled: 1,
    clientRequestId: "mesa_test_request", confirmDuplicate: true,
  });
  // The confirmation closes on success and no error is shown.
  expect(byTestId(container, "mesa-hub-duplicate")).toBeNull();
  unmount(container, root);
});

test("C · a confirmed payment that fails for a DIFFERENT reason shows that error, and does not re-ask", async () => {
  mesaApi.pay
    .mockRejectedValueOnce(failWith(DUPLICATE_CODE))
    .mockRejectedValueOnce(failWith("MESA_SESSION_NOT_OPEN"));
  const { container, root } = await openHub();
  await triggerDuplicateViaPersonas(container);
  click(byTestId(container, "mesa-hub-duplicate-confirm"));
  await flush();

  expect(byTestId(container, "mesa-hub-error").textContent).toBe("MESA_SESSION_NOT_OPEN");
  expect(byTestId(container, "mesa-hub-duplicate")).toBeNull();
  unmount(container, root);
});

test("C · a confirmed retry is never re-asked, so the confirmation cannot loop", async () => {
  // The backend cannot return this once p_confirm_duplicate is true, but if it
  // ever did, re-opening would trap the operator in the dialog forever. The
  // answered question stays answered and the code is reported honestly.
  mesaApi.pay.mockRejectedValue(failWith(DUPLICATE_CODE));
  const { container, root } = await openHub();
  await triggerDuplicateViaPersonas(container);
  click(byTestId(container, "mesa-hub-duplicate-confirm"));
  await flush();

  expect(byTestId(container, "mesa-hub-duplicate")).toBeNull();
  expect(byTestId(container, "mesa-hub-error").textContent).toBe(DUPLICATE_CODE);
  expect(mesaApi.pay).toHaveBeenCalledTimes(2);
  unmount(container, root);
});

// ── F. NORMAL PATH ─────────────────────────────────────────────────────────
test("F · an ordinary payment shows no confirmation and carries no confirmDuplicate flag", async () => {
  mesaApi.pay.mockResolvedValue({ amount: 30, outstandingAfter: 0 });
  const { container, root } = await openHub();
  await triggerDuplicateViaPersonas(container);

  expect(byTestId(container, "mesa-hub-duplicate")).toBeNull();
  const [, body] = mesaApi.pay.mock.calls[0];
  // Absent, not `false`: a payment nobody was asked about must not carry an
  // operator decision that was never made.
  expect("confirmDuplicate" in body).toBe(false);
  expect(body).toEqual({
    paymentMethod: "tarjeta", mode: "custom_amount", amount: 30, coversSettled: 1,
    clientRequestId: "mesa_test_request",
  });
  unmount(container, root);
});

test("F · Cobrar todo — the untouched full-payment payload gains nothing", async () => {
  mesaApi.pay.mockResolvedValue({ amount: 30, outstandingAfter: 0 });
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-hub-cobrar-todo"));
  click(Array.from(container.querySelectorAll(".mesa-method")).find((b) => b.textContent.includes("Tarjeta")));
  click(buttonByText(container, "Confirmar cobro"));
  await flush();
  expect(mesaApi.pay).toHaveBeenCalledWith("session-split", {
    paymentMethod: "tarjeta", mode: "full", coversSettled: 1,
    clientRequestId: "mesa_test_request",
  });
  unmount(container, root);
});

// ── G. OTHER ERRORS ────────────────────────────────────────────────────────
test("G · every other backend code keeps the existing inline-error behaviour", async () => {
  for (const code of ["MESA_ALREADY_SETTLED", "MESA_PAYMENT_AMOUNT_INVALID", "MESA_NETWORK_ERROR"]) {
    mesaApi.pay.mockReset();
    describeMesaError.mockImplementation((error) => error?.code || "error");
    createMesaRequestId.mockImplementation(() => "mesa_test_request");
    mesaApi.pay.mockRejectedValue(failWith(code));
    const { container, root } = await openHub();
    await triggerDuplicateViaPersonas(container);
    expect(byTestId(container, "mesa-hub-duplicate")).toBeNull();
    expect(byTestId(container, "mesa-hub-error").textContent).toBe(code);
    unmount(container, root);
  }
});

test("G · a rejection with NO code never fabricates a duplicate question", async () => {
  // Guards the shape a stale module mock produces: if the imported constant
  // were undefined, `err?.code === CONSTANT` would be undefined === undefined.
  mesaApi.pay.mockRejectedValue(new Error("network blew up"));
  const { container, root } = await openHub();
  await triggerDuplicateViaPersonas(container);
  expect(byTestId(container, "mesa-hub-duplicate")).toBeNull();
  expect(byTestId(container, "mesa-hub-error")).not.toBeNull();
  unmount(container, root);
});

// ── H. THE OTHER MODES SHARE THE PATH ──────────────────────────────────────
test("H · Por productos — item_selection is confirmed with its line ids intact", async () => {
  mesaApi.pay
    .mockRejectedValueOnce(failWith(DUPLICATE_CODE))
    .mockResolvedValueOnce({ amount: 15, outstandingAfter: 15 });
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-hub-pago-parcial"));
  click(byTestId(container, "mesa-hub-mode-productos"));
  const rows = Array.from(container.querySelectorAll('[data-testid="mesa-hub-line"]'));
  click(rows.find((r) => r.textContent.includes("El Pelusa")));
  click(buttonByText(container, "Confirmar cobro"));
  await flush();

  expect(byTestId(container, "mesa-hub-duplicate")).not.toBeNull();
  // Two identically-priced 15,00 selections look just as duplicate as two
  // identical card payments, which is why this mode needs the same escape.
  expect(byTestId(container, "mesa-hub-duplicate-amount").textContent).toMatch(/15,00\s?€/);

  click(byTestId(container, "mesa-hub-duplicate-confirm"));
  await flush();
  expect(mesaApi.pay.mock.calls[1][1]).toEqual({
    paymentMethod: "efectivo", mode: "item_selection", lineIds: ["l3"], coversSettled: 0,
    clientRequestId: "mesa_test_request", confirmDuplicate: true,
  });
  unmount(container, root);
});

test("H · Importe libre — custom_amount is confirmed with its own amount", async () => {
  mesaApi.pay
    .mockRejectedValueOnce(failWith(DUPLICATE_CODE))
    .mockResolvedValueOnce({ amount: 12.5, outstandingAfter: 17.5 });
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-hub-pago-parcial"));
  click(byTestId(container, "mesa-hub-mode-libre"));
  const input = byTestId(container, "mesa-hub-free-input") || container.querySelector('.mesa-hub-drawer input');
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "12,50");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  click(buttonByText(container, "Confirmar cobro"));
  await flush();

  expect(byTestId(container, "mesa-hub-duplicate-amount").textContent).toMatch(/12,50\s?€/);
  click(byTestId(container, "mesa-hub-duplicate-confirm"));
  await flush();
  expect(mesaApi.pay.mock.calls[1][1]).toEqual({
    paymentMethod: "efectivo", mode: "custom_amount", amount: 12.5, coversSettled: 0,
    clientRequestId: "mesa_test_request", confirmDuplicate: true,
  });
  unmount(container, root);
});

// ── THE PRIMARY ACTION IS BLOCKED WHILE THE QUESTION IS OPEN ───────────────
test("· Confirmar cobro is inert until the duplicate question is answered", async () => {
  mesaApi.pay.mockRejectedValue(failWith(DUPLICATE_CODE));
  const { container, root } = await openHub();
  await triggerDuplicateViaPersonas(container);
  const confirmCharge = buttonByText(container, "Confirmar cobro");
  expect(confirmCharge.disabled).toBe(true);
  click(confirmCharge);
  await flush();
  expect(mesaApi.pay).toHaveBeenCalledTimes(1);
  unmount(container, root);
});
