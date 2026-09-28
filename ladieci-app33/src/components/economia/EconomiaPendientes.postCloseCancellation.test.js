// EconomiaPendientes.postCloseCancellation.test.js — POST-ASTRA CORRECTIVE CYCLE, FINDING F1 (front end half).
//
// THE PRODUCT RULE. An order of an already-closed service was never handed over (a pickup nobody collected, a delivery
// that failed after Finalizar). Migration 151 freezes the closed service's obligations, so the ordinary cancellation is
// refused; the backend records it instead as the post-close resolution fact (migration 152). This surface is where the
// operator finds such an order (Por cobrar, "Sin entregar") and resolves it.
//
// What this pins:
//   * "Anular pedido" exists exactly where the BACKEND says CANCEL, for admin/operator, never on a Mesa, never without
//     both identities (the display id locates the row, the orderUid is pinned);
//   * nothing is sent without a stated reason; one confirmation = one request;
//   * success re-reads the list (the pendency leaves because the canonical read says so);
//   * a refusal is shown typed and the list is NOT re-read (nothing changed).
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/economia/EconomiaPendientes.postCloseCancellation.test.js

import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../economy/economyApi", () => ({
  __esModule: true,
  EconomyApiError: class EconomyApiError extends Error {
    constructor(code, status = 0) { super(code); this.name = "EconomyApiError"; this.code = code; this.status = status; }
  },
  economyApi: { pendencies: jest.fn(), snapshot: jest.fn(), listCashCounts: jest.fn() },
}));
jest.mock("../../cash/cashApi", () => ({
  __esModule: true,
  cashApi: { checkAccount: jest.fn(), pay: jest.fn(), refund: jest.fn(), adjust: jest.fn() },
  createCashRequestId: jest.fn(),
  describeCashError: jest.fn((error) => error?.code || "error"),
  CASH_DUPLICATE_PAYMENT_CODE: "ORDER_PAYMENT_POSSIBLE_DUPLICATE",
}));
jest.mock("../../api", () => ({
  __esModule: true,
  auth: { getRole: jest.fn(() => "operator") },
  api: { anularPedidoPendiente: jest.fn() },
}));

const EconomiaPendientes = require("./EconomiaPendientes").default;
const { economyApi } = require("../../economy/economyApi");
const { auth, api } = require("../../api");

const UID = "33333333-3333-4333-8333-333333333333";
const item = (over = {}) => ({
  direction: "POR_COBRAR", orderUid: UID, amount: 18, currentObligation: 18, netCollected: 0,
  originalDate: "2026-09-25T20:00:00.000Z", originalBusinessDate: "2026-09-25", serviceSessionId: "svc-closed",
  lastMovementAt: null, ageDays: 1, channel: "RITIRO", deliveryState: "SIN_ENTREGAR",
  display: { orderNumber: "#042", tableNumber: null, tableName: null, commandNumber: null },
  customer: { name: "Luis", phone: null }, allowedActions: ["CANCEL"], identityConfidence: "STABLE", ...over,
});
const list = (items) => ({
  ok: true, generatedAt: "2026-09-26T12:00:00.000Z", porCobrar: items, porDevolver: [], requiereRevision: [],
  counts: { porCobrar: items.length, porDevolver: 0, requiereRevision: 0 },
  totals: { porCobrar: items.reduce((s, i) => s + i.amount, 0), porDevolver: 0 }, scope: null, window: null,
});

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
const byId = (c, id) => c.querySelector(`[data-testid="${id}"]`);
function click(el) { act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }
const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
function typeInto(el, value) {
  act(() => { nativeInputSetter.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<EconomiaPendientes />); });
  await flush();
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

beforeEach(() => {
  jest.clearAllMocks();
  auth.getRole.mockReturnValue("operator");
  economyApi.pendencies.mockResolvedValue(list([item()]));
  api.anularPedidoPendiente.mockResolvedValue({ success: true });
});

test("visible · a CANCEL item shows 'Sin entregar' and 'Anular pedido' (and no 'Registrar cobro')", async () => {
  const { container, root } = await mount();
  expect(byId(container, "pendientes-item-cobrar").textContent).toMatch(/Sin entregar/);
  expect(byId(container, "pendientes-cancel")).not.toBeNull();
  expect(byId(container, "pendientes-collect")).toBeNull();
  unmount(container, root);
});

test.each([
  ["no CANCEL action", { allowedActions: [] }],
  ["a Mesa", { channel: "MESA", allowedActions: ["CANCEL"] }],
  ["no orderUid", { orderUid: null }],
  ["no display id", { display: { orderNumber: null } }],
])("hidden · %s -> no 'Anular pedido'", async (_label, over) => {
  economyApi.pendencies.mockResolvedValue(list([item(over)]));
  const { container, root } = await mount();
  expect(byId(container, "pendientes-cancel")).toBeNull();
  unmount(container, root);
});

test.each(["owner", "cashier", "rider", ""])("hidden · role %p cannot see it (UX only, the server decides)", async (role) => {
  auth.getRole.mockReturnValue(role);
  const { container, root } = await mount();
  expect(byId(container, "pendientes-cancel")).toBeNull();
  unmount(container, root);
});

test("reason · nothing is sent without a stated reason", async () => {
  const { container, root } = await mount();
  click(byId(container, "pendientes-cancel"));
  await flush();
  expect(byId(container, "pendientes-cancel-submit").disabled).toBe(true);
  click(byId(container, "pendientes-cancel-submit"));
  await flush();
  typeInto(byId(container, "pendientes-cancel-reason"), "   ");
  click(byId(container, "pendientes-cancel-submit"));
  await flush();
  expect(api.anularPedidoPendiente).not.toHaveBeenCalled();
  unmount(container, root);
});

test("success · sends display id + pinned orderUid + reason once, closes and re-reads the list", async () => {
  const { container, root } = await mount();
  expect(economyApi.pendencies).toHaveBeenCalledTimes(1);
  click(byId(container, "pendientes-cancel"));
  await flush();
  typeInto(byId(container, "pendientes-cancel-reason"), "  No vino a recoger  ");
  click(byId(container, "pendientes-cancel-submit"));
  await flush();
  expect(api.anularPedidoPendiente).toHaveBeenCalledTimes(1);
  expect(api.anularPedidoPendiente).toHaveBeenCalledWith("#042", UID, "No vino a recoger");
  expect(byId(container, "pendientes-cancel-confirm")).toBeNull();
  expect(economyApi.pendencies).toHaveBeenCalledTimes(2);
  unmount(container, root);
});

test.each([
  [{ success: false, code: "ORDER_IDENTITY_MISMATCH" }, /ya no es el mismo/],
  [{ success: false, code: "ORDER_POST_CLOSE_SERVICE_STILL_OPEN" }, /sigue abierto/],
  [{ success: false, error: "ORDER_POST_CLOSE_FORBIDDEN" }, /rol no puede/],
  [{ success: false, code: "SOMETHING_ELSE" }, /No se ha cambiado nada/],
  [null, /No se ha cambiado nada/],
])("refusal · %p is shown typed and the list is not re-read", async (response, message) => {
  api.anularPedidoPendiente.mockResolvedValue(response);
  const { container, root } = await mount();
  click(byId(container, "pendientes-cancel"));
  await flush();
  typeInto(byId(container, "pendientes-cancel-reason"), "Entrega fallida");
  click(byId(container, "pendientes-cancel-submit"));
  await flush();
  expect(byId(container, "pendientes-cancel-error").textContent).toMatch(message);
  expect(byId(container, "pendientes-cancel-confirm")).not.toBeNull();
  expect(economyApi.pendencies).toHaveBeenCalledTimes(1);
  unmount(container, root);
});
