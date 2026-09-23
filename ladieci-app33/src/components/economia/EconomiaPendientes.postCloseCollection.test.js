// EconomiaPendientes.postCloseCollection.test.js — DELIVERY x ECONOMY DECOUPLING V1, POST-CLOSE OPERATOR COLLECTION.
//
// THE PRODUCT RULE. An order was delivered (RETIRADO), the money was not collected, the service was finalized. Later the
// operator learns for certain that the customer paid. From ECONOMÍA → PENDIENTES the operator must be able to register
// it NOW -- without the rider, without waiting for a new service, without reopening the original one.
//
// What this pins:
//   * the button exists exactly where the BACKEND says COLLECT (delivered, non-Mesa, unpaid, permanent identity), for
//     the roles the payment writer accepts, and never on an "Entrega sin confirmar" item;
//   * it opens the EXISTING Cash V1 surface (CheckCashPanel) with delivery / refund / adjustment OFF, and pays through
//     cashApi.pay (POST /api/cash/v1/checks/:orderUid/payments): efectivo / tarjeta / bizum; `full` sends NO amount;
//   * one logical payment = one request id; a double click sends one request; a retry re-uses the same id;
//   * "already settled" elsewhere (rider / another tablet) never creates a second payment and refreshes the list;
//   * the FE never touches the delivery, the trip, the service or the sale;
//   * after the payment the list is RE-READ (the pendency leaves because the canonical read says so).
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/economia/EconomiaPendientes.postCloseCollection.test.js

import React, { act } from "react";
import fs from "fs";
import path from "path";
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
// The signed-in role is a presentation cache (sessionStorage) -- controllable here. `api` is a tripwire: ANY access to
// an api.js method (every delivery / trip / service / order-state writer lives there) is recorded, and none may happen
// from this surface.
const mockApiAccess = [];
jest.mock("../../api", () => ({
  __esModule: true,
  auth: { getRole: jest.fn(() => "operator") },
  api: new Proxy({}, { get: (_t, name) => { mockApiAccess.push(String(name)); return jest.fn(); } }),
}));

const EconomiaPendientes = require("./EconomiaPendientes").default;
const { economyApi } = require("../../economy/economyApi");
const { cashApi, createCashRequestId, describeCashError } = require("../../cash/cashApi");
const { auth } = require("../../api");

const UID = "11111111-1111-4111-8111-111111111111";
const UID_EN_ENTREGA = "22222222-2222-4222-8222-222222222222";

// Exactly the shape the backend emits (pendingExposures.buildPendingItem) for a CLOSED service.
const item = (over = {}) => ({
  direction: "POR_COBRAR", orderUid: UID, amount: 12.5, currentObligation: 12.5, netCollected: 0,
  originalDate: "2026-09-17T20:00:00.000Z", originalBusinessDate: "2026-09-17", serviceSessionId: "svc-closed",
  lastMovementAt: null, ageDays: 3, channel: "DOMICILIO", deliveryState: "ENTREGADO",
  display: { orderNumber: "#017", tableNumber: null, tableName: null, commandNumber: null },
  customer: { name: "Ana", phone: "600111222" }, allowedActions: ["COLLECT"], identityConfidence: "STABLE", ...over,
});
const list = (items) => ({
  ok: true, generatedAt: "2026-09-20T12:00:00.000Z", porCobrar: items, porDevolver: [], requiereRevision: [],
  counts: { porCobrar: items.length, porDevolver: 0, requiereRevision: 0 },
  totals: { porCobrar: items.reduce((s, i) => s + i.amount, 0), porDevolver: 0 }, scope: null, window: null,
});
const NOTHING = list([]);

const account = (over = {}) => ({
  ok: true, orderUid: UID, displayOrderId: "#017", estado: "RETIRADO", total: 12.5, paid: 0, outstanding: 12.5, overCollected: 0,
  commands: [{ id: "#017", orderUid: UID, commandNumber: "#017", state: "RETIRADO",
    financial: { orderUid: UID, originalObligation: 12.5, currentObligation: 12.5, commercialAdjustment: 0, adjustable: true } }],
  payments: [], legacyPayments: [], ...over,
});
const SETTLED = account({ paid: 12.5, outstanding: 0,
  payments: [{ id: "tx-1", kind: "payment", mode: "full", amount: 12.5, method: "efectivo", actor: "operator_1", createdAt: "2026-09-20T10:00:00Z", reversesTransactionId: null }] });

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
const byId = (c, id) => c.querySelector(`[data-testid="${id}"]`);
const allById = (c, id) => Array.from(c.querySelectorAll(`[data-testid="${id}"]`));
function click(el) { act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }
const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
function typeInto(el, value) {
  act(() => { nativeInputSetter.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}

async function mount(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<EconomiaPendientes {...props} />); });
  await flush();
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }
async function openPanel(container) {
  click(byId(container, "pendientes-collect"));
  await flush();
}

let reqSeq;
beforeEach(() => {
  jest.clearAllMocks();
  mockApiAccess.length = 0;
  reqSeq = 0;
  createCashRequestId.mockImplementation(() => `cashpay_test_${++reqSeq}`);
  describeCashError.mockImplementation((error) => error?.code || "error");
  auth.getRole.mockReturnValue("operator");
  economyApi.pendencies.mockResolvedValue(list([item()]));
  economyApi.snapshot.mockResolvedValue({});
  economyApi.listCashCounts.mockResolvedValue({ ok: true, counts: [], scope: null, window: null });
  cashApi.checkAccount.mockResolvedValue(account());
  cashApi.pay.mockResolvedValue({ ok: true, transactionId: "tx-1", amount: 12.5, paymentMethod: "efectivo", mode: "full" });
});

// ── 1 · CLOSED service, RETIRADO, unpaid 12,50 -> in Pendientes, button visible ─────────────────────────────────
test("1 · a delivered, unpaid order of a CLOSED service is listed as 'Entregado' with 12,50 € and a 'Registrar cobro' button", async () => {
  const { container, root } = await mount();
  const rows = allById(container, "pendientes-item-cobrar");
  expect(rows).toHaveLength(1);
  expect(rows[0].textContent).toContain("Ana");
  expect(rows[0].textContent).toContain("Entregado");
  expect(rows[0].textContent).toMatch(/12,50\s?€/);
  const btn = rows[0].querySelector('[data-testid="pendientes-collect"]');
  expect(btn).toBeTruthy();
  expect(btn.textContent).toBe("Registrar cobro");
  expect(container.textContent).not.toContain(UID);              // the stable identity stays internal
  expect(cashApi.checkAccount).not.toHaveBeenCalled();           // nothing is read or written until the operator asks
  unmount(container, root);
});

// ── 2 · Efectivo · payment once · pending 0 ─────────────────────────────────────────────────────────────────────
test("2 · 'Registrar cobro' opens the EXISTING Cash V1 surface with the three methods and NO delivery / refund / adjustment controls", async () => {
  const { container, root } = await mount();
  await openPanel(container);
  expect(cashApi.checkAccount).toHaveBeenCalledWith(UID);        // the permanent identity, never the display number
  expect(byId(container, "check-cash-panel")).toBeTruthy();
  expect(container.textContent).toContain("#017");
  for (const m of ["efectivo", "tarjeta", "bizum"]) expect(byId(container, `check-cash-method-${m}`)).toBeTruthy();
  expect(byId(container, "check-cash-mode-full").textContent).toMatch(/12,50\s?€/);
  // the collection records money and nothing else
  expect(byId(container, "check-cash-confirm-delivery")).toBeNull();
  expect(byId(container, "check-cash-deliver-unpaid")).toBeNull();
  expect(container.textContent).not.toMatch(/Confirmar entrega|Entregar sin cobrar|Reembolsar|Corregir importe/);
  unmount(container, root);
});

test("2b · Efectivo, full: ONE cashApi.pay for the order identity, NO amount on the wire, then the list is re-read and the pendency is gone", async () => {
  const onCollected = jest.fn();
  economyApi.pendencies.mockResolvedValueOnce(list([item()])).mockResolvedValue(NOTHING);
  cashApi.checkAccount.mockResolvedValueOnce(account()).mockResolvedValue(SETTLED);
  const { container, root } = await mount({ onCollected });
  await openPanel(container);
  click(byId(container, "check-cash-pay-submit"));
  await flush();
  expect(cashApi.pay).toHaveBeenCalledTimes(1);
  expect(cashApi.pay).toHaveBeenCalledWith(UID, { paymentMethod: "efectivo", mode: "full", clientRequestId: "cashpay_test_1" });
  const body = cashApi.pay.mock.calls[0][1];
  expect(Object.keys(body).sort()).toEqual(["clientRequestId", "mode", "paymentMethod"]);   // a full collection carries no arbitrary amount
  expect(economyApi.pendencies).toHaveBeenCalledTimes(2);        // initial read + the re-read after the payment
  expect(onCollected).toHaveBeenCalledTimes(1);                  // the shell refreshes its badge
  expect(allById(container, "pendientes-item-cobrar")).toHaveLength(0);
  expect(byId(container, "pendientes-empty")).toBeTruthy();      // the pendency left because the canonical read says so
  expect(byId(container, "check-cash-panel")).toBeTruthy();      // the panel is still up (settled), not torn down by the reload
  expect(byId(container, "check-cash-pay-submit")).toBeNull();   // ... and offers no further payment
  unmount(container, root);
});

// ── 3 · Tarjeta / Bizum -> the right method ─────────────────────────────────────────────────────────────────────
test.each([["tarjeta"], ["bizum"]])("3 · %s is sent as the payment method", async (method) => {
  const { container, root } = await mount();
  await openPanel(container);
  click(byId(container, `check-cash-method-${method}`));
  click(byId(container, "check-cash-pay-submit"));
  await flush();
  expect(cashApi.pay).toHaveBeenCalledTimes(1);
  expect(cashApi.pay.mock.calls[0][1]).toMatchObject({ paymentMethod: method, mode: "full" });
  unmount(container, root);
});

// ── 4 · double click / replay -> at most one payment ────────────────────────────────────────────────────────────
test("4 · a double click in the same tick sends ONE request", async () => {
  let release;
  cashApi.pay.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ ok: true }); }));
  const { container, root } = await mount();
  await openPanel(container);
  const submit = byId(container, "check-cash-pay-submit");
  act(() => {
    submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(cashApi.pay).toHaveBeenCalledTimes(1);
  await act(async () => { release(); await Promise.resolve(); });
  await flush();
  expect(cashApi.pay).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

test("4b · a retry after a network failure re-uses the SAME request id (server-side idempotent); a NEW payment gets a new one", async () => {
  cashApi.pay.mockRejectedValueOnce(Object.assign(new Error("CASH_NETWORK_ERROR"), { code: "CASH_NETWORK_ERROR" }));
  const { container, root } = await mount();
  await openPanel(container);
  click(byId(container, "check-cash-pay-submit"));
  await flush();
  expect(byId(container, "check-cash-pay-error").textContent).toBe("CASH_NETWORK_ERROR");
  click(byId(container, "check-cash-pay-submit"));
  await flush();
  expect(cashApi.pay).toHaveBeenCalledTimes(2);
  expect(cashApi.pay.mock.calls[0][1].clientRequestId).toBe("cashpay_test_1");
  expect(cashApi.pay.mock.calls[1][1].clientRequestId).toBe("cashpay_test_1");   // same logical payment, same id
  unmount(container, root);
});

// ── 5/6 · stale pages -> never a second payment ─────────────────────────────────────────────────────────────────
test("5 · already settled elsewhere (the rider / another tablet paid): NO second payment, the account shows settled and the list is re-read", async () => {
  const onCollected = jest.fn();
  economyApi.pendencies.mockResolvedValueOnce(list([item()])).mockResolvedValue(NOTHING);
  cashApi.checkAccount.mockResolvedValueOnce(account()).mockResolvedValue(SETTLED);
  cashApi.pay.mockRejectedValue(Object.assign(new Error("ORDER_PAYMENT_ALREADY_SETTLED"), { code: "ORDER_PAYMENT_ALREADY_SETTLED", status: 409 }));
  const { container, root } = await mount({ onCollected });
  await openPanel(container);
  click(byId(container, "check-cash-pay-submit"));
  await flush();
  expect(cashApi.pay).toHaveBeenCalledTimes(1);                                     // one attempt, refused; nothing recorded by the FE
  expect(cashApi.checkAccount).toHaveBeenCalledTimes(2);                           // the account was re-read: it is settled now
  expect(byId(container, "check-cash-pay-submit")).toBeNull();                     // no way to pay again
  expect(economyApi.pendencies).toHaveBeenCalledTimes(2);
  expect(onCollected).toHaveBeenCalledTimes(1);
  expect(allById(container, "pendientes-item-cobrar")).toHaveLength(0);            // the pendency is gone
  unmount(container, root);
});

test("6 · any OTHER refusal (forbidden, network, amount) leaves the list alone and does not refresh anything", async () => {
  const onCollected = jest.fn();
  cashApi.pay.mockRejectedValue(Object.assign(new Error("CASH_FORBIDDEN"), { code: "CASH_FORBIDDEN", status: 403 }));
  const { container, root } = await mount({ onCollected });
  await openPanel(container);
  click(byId(container, "check-cash-pay-submit"));
  await flush();
  expect(byId(container, "check-cash-pay-error").textContent).toBe("CASH_FORBIDDEN");
  expect(onCollected).not.toHaveBeenCalled();
  expect(economyApi.pendencies).toHaveBeenCalledTimes(1);
  expect(allById(container, "pendientes-item-cobrar")).toHaveLength(1);
  unmount(container, root);
});

// ── partial: the canonical Cash V1 rules, nothing invented ──────────────────────────────────────────────────────
test("6b · a partial collection is the canonical 'Importe libre': bounded by what is owed, sent as custom_amount", async () => {
  const { container, root } = await mount();
  await openPanel(container);
  click(byId(container, "check-cash-mode-custom"));
  typeInto(byId(container, "check-cash-custom-amount"), "99");
  click(byId(container, "check-cash-pay-submit"));
  await flush();
  expect(cashApi.pay).not.toHaveBeenCalled();                                       // more than 12,50 owed: refused client-side, nothing sent
  typeInto(byId(container, "check-cash-custom-amount"), "5,00");
  click(byId(container, "check-cash-pay-submit"));
  await flush();
  expect(cashApi.pay).toHaveBeenCalledTimes(1);
  expect(cashApi.pay.mock.calls[0][1]).toMatchObject({ paymentMethod: "efectivo", mode: "custom_amount", amount: 5 });
  unmount(container, root);
});

// ── 7/8 · the original service / the current service are irrelevant to the FE ───────────────────────────────────
test("7 · the FE never asks for, nor sends, a service: the payment is keyed by the order identity only", async () => {
  const { container, root } = await mount();
  await openPanel(container);
  click(byId(container, "check-cash-pay-submit"));
  await flush();
  const [uid, body] = cashApi.pay.mock.calls[0];
  expect(uid).toBe(UID);
  expect(JSON.stringify(body)).not.toMatch(/service|servicio|session|actor|role|by_|trip/i);   // the server resolves service, actor and role
  unmount(container, root);
});

test("7b · the FE writes NOTHING but the payment: no delivery, trip, close/open-service or order-state call, ever", async () => {
  const { container, root } = await mount();
  await openPanel(container);
  click(byId(container, "check-cash-pay-submit"));
  await flush();
  expect(mockApiAccess).toEqual([]);                             // not a single api.js method was even looked up
  expect(cashApi.refund).not.toHaveBeenCalled();
  expect(cashApi.adjust).not.toHaveBeenCalled();
  unmount(container, root);
});

// ── 9 · EN_ENTREGA stays "Entrega sin confirmar", never a plain collection ──────────────────────────────────────
test("9 · EN_ENTREGA + unpaid stays 'Entrega sin confirmar' and offers NO 'Registrar cobro'", async () => {
  economyApi.pendencies.mockResolvedValue(list([
    item({ orderUid: UID_EN_ENTREGA, deliveryState: "SIN_CONFIRMAR", allowedActions: [], display: { orderNumber: "#018", tableNumber: null, tableName: null, commandNumber: null } }),
  ]));
  const { container, root } = await mount();
  const rows = allById(container, "pendientes-item-cobrar");
  expect(rows).toHaveLength(1);
  expect(rows[0].textContent).toContain("Entrega sin confirmar");
  expect(rows[0].textContent).not.toContain("Entregado");
  expect(rows[0].querySelector("button")).toBeNull();
  unmount(container, root);
});

test("9b · defence in depth: even if COLLECT arrived on an unconfirmed delivery, or on a Mesa, or with no identity, there is NO button", async () => {
  economyApi.pendencies.mockResolvedValue(list([
    item({ orderUid: UID_EN_ENTREGA, deliveryState: "SIN_CONFIRMAR", allowedActions: ["COLLECT"] }),
    item({ orderUid: "33333333-3333-4333-8333-333333333333", channel: "MESA", deliveryState: null, allowedActions: ["COLLECT"],
      display: { orderNumber: "#999", tableNumber: 4, tableName: null, commandNumber: 1 }, customer: { name: null, phone: null } }),
    item({ orderUid: null, allowedActions: ["COLLECT"] }),
    item({ orderUid: "44444444-4444-4444-8444-444444444444", allowedActions: [] }),
  ]));
  const { container, root } = await mount();
  expect(allById(container, "pendientes-item-cobrar")).toHaveLength(4);
  expect(allById(container, "pendientes-collect")).toHaveLength(0);
  unmount(container, root);
});

// ── roles: exactly the payment writer's audience ────────────────────────────────────────────────────────────────
test.each([["admin", 1], ["operator", 1], ["owner", 0], ["cashier", 0], ["legacy_operator", 0], ["rider", 0], ["", 0]])(
  "roles · %s sees %i 'Registrar cobro' button(s) (mirrors ORDER_PAYMENT_ROLES = admin, operator)", async (role, expected) => {
    auth.getRole.mockReturnValue(role);
    const { container, root } = await mount();
    expect(allById(container, "pendientes-collect")).toHaveLength(expected);
    unmount(container, root);
  },
);

// ── closing the panel sends nothing ─────────────────────────────────────────────────────────────────────────────
test("close · closing the panel without paying sends no request and leaves the pendency in the list", async () => {
  const { container, root } = await mount();
  await openPanel(container);
  click(byId(container, "check-cash-close"));
  await flush();
  expect(byId(container, "check-cash-panel")).toBeNull();
  expect(cashApi.pay).not.toHaveBeenCalled();
  expect(economyApi.pendencies).toHaveBeenCalledTimes(1);
  expect(allById(container, "pendientes-item-cobrar")).toHaveLength(1);
  unmount(container, root);
});

// ── static guards ───────────────────────────────────────────────────────────────────────────────────────────────
test("static · Pendientes reaches money only through CheckCashPanel (the Cash V1 surface): no delivery / trip / service writer is referenced", () => {
  const source = fs.readFileSync(path.join(__dirname, "EconomiaPendientes.jsx"), "utf8");
  const code = source.split("\n").filter((line) => !/^\s*(\/\/|\{\/\*|\*)/.test(line)).join("\n");
  expect(code).toMatch(/<CheckCashPanel/);
  expect(code).toMatch(/allowDelivery=\{false\}/);
  expect(code).toMatch(/canRefund=\{false\}/);
  expect(code).toMatch(/canAdjust=\{false\}/);
  expect(code).not.toMatch(/cashApi|updateEstado|marcarEntregado|confirmarEntregaOperador|onDelivered|fetch\(|\bapi\./);
});
