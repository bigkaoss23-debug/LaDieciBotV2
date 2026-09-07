// CheckCashPanel.test.js — CHECK-CENTRIC UNIVERSAL CASH V1. Direct DOM tests
// (raw ReactDOM + act(), same technique as MesaPaymentsList.test.js -- no
// @testing-library in this repo). Mocks only ../../cash/cashApi: the reused
// MesaPaymentsList/MesaCommercialAdjustments/MesaAccountBalance run for real
// against the injected `api={cashApi}` prop, proving the extraction actually
// wires through rather than asserting on a mock of Mesa's own components.
import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../cash/cashApi", () => ({
  __esModule: true,
  cashApi: { checkAccount: jest.fn(), pay: jest.fn(), refund: jest.fn(), adjust: jest.fn() },
  createCashRequestId: jest.fn(() => "cash_test_req"),
  describeCashError: jest.fn((error) => error?.code || "error"),
  CASH_DUPLICATE_PAYMENT_CODE: "ORDER_PAYMENT_POSSIBLE_DUPLICATE",
}));

const CheckCashPanel = require("./CheckCashPanel").default;
const { cashApi, describeCashError, createCashRequestId } = require("../../cash/cashApi");

beforeEach(() => {
  jest.clearAllMocks();
  describeCashError.mockImplementation((error) => error?.code || "error");
  createCashRequestId.mockImplementation(() => "cash_test_req");
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

async function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<CheckCashPanel {...props} />); });
  return { container, root };
}
function unmount(container, root) {
  act(() => { root.unmount(); });
  container.remove();
}

const ORDER_UID = "11111111-1111-4111-8111-111111111111";

const UNPAID_ACCOUNT = {
  ok: true, orderUid: ORDER_UID, displayOrderId: "#999040", estado: "LISTO",
  total: 85, paid: 0, outstanding: 85, overCollected: 0,
  commands: [{ id: "#999040", orderUid: ORDER_UID, commandNumber: "#999040", state: "LISTO",
    financial: { orderUid: ORDER_UID, originalObligation: 85, currentObligation: 85, commercialAdjustment: 0, adjustable: true } }],
  payments: [], legacyPayments: [],
};

const PAID_ACCOUNT = {
  ...UNPAID_ACCOUNT, paid: 85, outstanding: 0,
  payments: [{ id: "tx-1", kind: "payment", mode: "full", amount: 85, method: "efectivo", actor: "operator_1", createdAt: "2026-09-07T10:00:00Z", reversesTransactionId: null }],
};

const LEGACY_ACCOUNT = {
  ...UNPAID_ACCOUNT, paid: 85, outstanding: 0,
  payments: [], legacyPayments: [{ id: 1, amount: 85, method: "efectivo", createdAt: "2026-09-07T10:00:00Z", legacy: true, refundable: false }],
};

test("loads the check account on mount and renders the balance", async () => {
  cashApi.checkAccount.mockResolvedValue(UNPAID_ACCOUNT);
  const { container, root } = await mount({ orderUid: ORDER_UID, displayOrderId: "#999040", onClose: jest.fn() });
  await flush();
  expect(cashApi.checkAccount).toHaveBeenCalledWith(ORDER_UID);
  expect(container.textContent).toContain("#999040");
  unmount(container, root);
});

test("close button calls onClose and nothing else (§20 case D — no payment, no delivery)", async () => {
  cashApi.checkAccount.mockResolvedValue(UNPAID_ACCOUNT);
  const onClose = jest.fn();
  const onDelivered = jest.fn();
  const { container, root } = await mount({ orderUid: ORDER_UID, onClose, onDelivered });
  await flush();
  click(byTestId(container, "check-cash-close"));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(cashApi.pay).not.toHaveBeenCalled();
  expect(onDelivered).not.toHaveBeenCalled();
  unmount(container, root);
});

test("unpaid order shows the payment form and an explicit 'Entregar sin cobrar', never 'Confirmar entrega'", async () => {
  cashApi.checkAccount.mockResolvedValue(UNPAID_ACCOUNT);
  const { container, root } = await mount({ orderUid: ORDER_UID, onClose: jest.fn(), onDelivered: jest.fn() });
  await flush();
  expect(byTestId(container, "check-cash-pay-submit")).toBeTruthy();
  expect(byTestId(container, "check-cash-deliver-unpaid")).toBeTruthy();
  expect(byTestId(container, "check-cash-confirm-delivery")).toBeFalsy();
  unmount(container, root);
});

test("full payment charges mode=full and refreshes the account (no local mutation)", async () => {
  cashApi.checkAccount.mockResolvedValueOnce(UNPAID_ACCOUNT).mockResolvedValueOnce(PAID_ACCOUNT);
  cashApi.pay.mockResolvedValue({ ok: true, amount: 85 });
  const { container, root } = await mount({ orderUid: ORDER_UID, onClose: jest.fn(), onDelivered: jest.fn() });
  await flush();
  click(byTestId(container, "check-cash-pay-submit"));
  await flush();
  expect(cashApi.pay).toHaveBeenCalledWith(ORDER_UID, expect.objectContaining({
    paymentMethod: "efectivo", mode: "full", clientRequestId: "cash_test_req",
  }));
  expect(cashApi.checkAccount).toHaveBeenCalledTimes(2);
  // after refresh, outstanding is 0 -> the delivery footer flips to "Confirmar entrega"
  expect(byTestId(container, "check-cash-confirm-delivery")).toBeTruthy();
  expect(byTestId(container, "check-cash-deliver-unpaid")).toBeFalsy();
  unmount(container, root);
});

test("custom amount payment sends the typed amount, not the full outstanding", async () => {
  cashApi.checkAccount.mockResolvedValue(UNPAID_ACCOUNT);
  cashApi.pay.mockResolvedValue({ ok: true, amount: 30 });
  const { container, root } = await mount({ orderUid: ORDER_UID, onClose: jest.fn(), onDelivered: jest.fn() });
  await flush();
  click(byTestId(container, "check-cash-mode-custom"));
  typeInto(byTestId(container, "check-cash-custom-amount"), "30");
  click(byTestId(container, "check-cash-pay-submit"));
  await flush();
  expect(cashApi.pay).toHaveBeenCalledWith(ORDER_UID, expect.objectContaining({
    mode: "custom_amount", amount: 30,
  }));
  unmount(container, root);
});

test("a custom amount above outstanding is rejected client-side, no request sent", async () => {
  cashApi.checkAccount.mockResolvedValue(UNPAID_ACCOUNT);
  const { container, root } = await mount({ orderUid: ORDER_UID, onClose: jest.fn(), onDelivered: jest.fn() });
  await flush();
  click(byTestId(container, "check-cash-mode-custom"));
  typeInto(byTestId(container, "check-cash-custom-amount"), "999");
  click(byTestId(container, "check-cash-pay-submit"));
  await flush();
  expect(cashApi.pay).not.toHaveBeenCalled();
  expect(byTestId(container, "check-cash-pay-error")).toBeTruthy();
  unmount(container, root);
});

test("payment failure shows an error and never calls onDelivered (§20 case E)", async () => {
  cashApi.checkAccount.mockResolvedValue(UNPAID_ACCOUNT);
  cashApi.pay.mockRejectedValue({ code: "ORDER_PAYMENT_AMOUNT_INVALID" });
  const onDelivered = jest.fn();
  const { container, root } = await mount({ orderUid: ORDER_UID, onClose: jest.fn(), onDelivered });
  await flush();
  click(byTestId(container, "check-cash-pay-submit"));
  await flush();
  expect(byTestId(container, "check-cash-pay-error")).toBeTruthy();
  expect(onDelivered).not.toHaveBeenCalled();
  unmount(container, root);
});

test("possible-duplicate payment opens the confirm banner; confirming resends the SAME clientRequestId with confirmDuplicate:true", async () => {
  cashApi.checkAccount.mockResolvedValue(UNPAID_ACCOUNT);
  cashApi.pay
    .mockRejectedValueOnce({ code: "ORDER_PAYMENT_POSSIBLE_DUPLICATE" })
    .mockResolvedValueOnce({ ok: true, amount: 85 });
  const { container, root } = await mount({ orderUid: ORDER_UID, onClose: jest.fn(), onDelivered: jest.fn() });
  await flush();
  click(byTestId(container, "check-cash-pay-submit"));
  await flush();
  expect(byTestId(container, "check-cash-duplicate")).toBeTruthy();
  click(byTestId(container, "check-cash-duplicate-confirm"));
  await flush();
  expect(cashApi.pay).toHaveBeenNthCalledWith(2, ORDER_UID, expect.objectContaining({
    clientRequestId: "cash_test_req", confirmDuplicate: true,
  }));
  unmount(container, root);
});

test("Cancelar on the duplicate banner sends no second request", async () => {
  cashApi.checkAccount.mockResolvedValue(UNPAID_ACCOUNT);
  cashApi.pay.mockRejectedValue({ code: "ORDER_PAYMENT_POSSIBLE_DUPLICATE" });
  const { container, root } = await mount({ orderUid: ORDER_UID, onClose: jest.fn(), onDelivered: jest.fn() });
  await flush();
  click(byTestId(container, "check-cash-pay-submit"));
  await flush();
  click(byTestId(container, "check-cash-duplicate-cancel"));
  await flush();
  expect(cashApi.pay).toHaveBeenCalledTimes(1);
  expect(byTestId(container, "check-cash-duplicate")).toBeFalsy();
  unmount(container, root);
});

test("fully-paid order shows no payment form, only 'Confirmar entrega'", async () => {
  cashApi.checkAccount.mockResolvedValue(PAID_ACCOUNT);
  const { container, root } = await mount({ orderUid: ORDER_UID, onClose: jest.fn(), onDelivered: jest.fn() });
  await flush();
  expect(byTestId(container, "check-cash-pay-submit")).toBeFalsy();
  expect(byTestId(container, "check-cash-confirm-delivery")).toBeTruthy();
  unmount(container, root);
});

test("Confirmar entrega calls onDelivered and nothing pays again", async () => {
  cashApi.checkAccount.mockResolvedValue(PAID_ACCOUNT);
  const onDelivered = jest.fn().mockResolvedValue(undefined);
  const { container, root } = await mount({ orderUid: ORDER_UID, onClose: jest.fn(), onDelivered });
  await flush();
  click(byTestId(container, "check-cash-confirm-delivery"));
  await flush();
  expect(onDelivered).toHaveBeenCalledTimes(1);
  expect(cashApi.pay).not.toHaveBeenCalled();
  unmount(container, root);
});

test("a delivery-transition failure shows an error and leaves the payment untouched (§20 case F)", async () => {
  cashApi.checkAccount.mockResolvedValue(PAID_ACCOUNT);
  const onDelivered = jest.fn().mockRejectedValue(new Error("transition failed"));
  const { container, root } = await mount({ orderUid: ORDER_UID, onClose: jest.fn(), onDelivered });
  await flush();
  click(byTestId(container, "check-cash-confirm-delivery"));
  await flush();
  expect(byTestId(container, "check-cash-deliver-error")).toBeTruthy();
  expect(cashApi.pay).not.toHaveBeenCalled();
  unmount(container, root);
});

test("'Entregar sin cobrar' on an unpaid order calls onDelivered directly, no payment required (§20 case G)", async () => {
  cashApi.checkAccount.mockResolvedValue(UNPAID_ACCOUNT);
  const onDelivered = jest.fn().mockResolvedValue(undefined);
  const { container, root } = await mount({ orderUid: ORDER_UID, onClose: jest.fn(), onDelivered });
  await flush();
  click(byTestId(container, "check-cash-deliver-unpaid"));
  await flush();
  expect(onDelivered).toHaveBeenCalledTimes(1);
  expect(cashApi.pay).not.toHaveBeenCalled();
  unmount(container, root);
});

test("allowDelivery=false (terminal re-entry / Abrir en caja) never renders a delivery button, even fully paid", async () => {
  cashApi.checkAccount.mockResolvedValue(PAID_ACCOUNT);
  const { container, root } = await mount({ orderUid: ORDER_UID, onClose: jest.fn(), allowDelivery: false });
  await flush();
  expect(byTestId(container, "check-cash-confirm-delivery")).toBeFalsy();
  expect(byTestId(container, "check-cash-deliver-unpaid")).toBeFalsy();
  unmount(container, root);
});

test("allowDelivery=false still allows a later canonical payment if the order is unpaid (§24)", async () => {
  cashApi.checkAccount.mockResolvedValue(UNPAID_ACCOUNT);
  cashApi.pay.mockResolvedValue({ ok: true, amount: 85 });
  const { container, root } = await mount({ orderUid: ORDER_UID, onClose: jest.fn(), allowDelivery: false });
  await flush();
  expect(byTestId(container, "check-cash-pay-submit")).toBeTruthy();
  click(byTestId(container, "check-cash-pay-submit"));
  await flush();
  expect(cashApi.pay).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

test("a legacy event-only payment is shown but marked not refundable, and never reaches MesaPaymentsList", async () => {
  cashApi.checkAccount.mockResolvedValue(LEGACY_ACCOUNT);
  const { container, root } = await mount({ orderUid: ORDER_UID, onClose: jest.fn(), canRefund: true });
  await flush();
  expect(byTestId(container, "check-cash-legacy-payments")).toBeTruthy();
  expect(byTestId(container, "check-cash-legacy-not-refundable")).toBeTruthy();
  // MesaPaymentsList renders null on an empty `payments` array (no canonical tx).
  expect(container.querySelector('[data-testid="mesa-payments-list"]')).toBeFalsy();
  unmount(container, root);
});

test("passes canRefund/canAdjust through to the reused Mesa components (no capability widening)", async () => {
  cashApi.checkAccount.mockResolvedValue(PAID_ACCOUNT);
  const { container, root } = await mount({ orderUid: ORDER_UID, onClose: jest.fn(), canRefund: true, canAdjust: false });
  await flush();
  expect(container.querySelector('[data-testid="mesa-payments-list"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="mesa-payhist-refund-btn"]')).toBeTruthy();
  // canAdjust false -> MesaCommercialAdjustments renders nothing (adjustableCommands still non-empty).
  expect(container.querySelector('[data-testid="mesa-commercial-adjustments"]')).toBeFalsy();
  unmount(container, root);
});
