// TabMesa.commercialAdjustment.test.js — Ajuste Comercial V1, Frontend Slice C.
// Integration: mounts the REAL <TabMesa> and proves the admin-only, order-scoped
// adjustment surface is wired into BOTH the open-table Payment Hub (Ver cuenta)
// and — for a non-admin — is not there at all. Component-level behaviour of the
// form itself lives in MesaCommercialAdjustments.test.js.
import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../mesa/mesaApi", () => ({
  __esModule: true,
  createMesaRequestId: jest.fn(() => "mesa_test_request"),
  describeMesaError: jest.fn((error) => error?.code || "error"),
  MESA_DUPLICATE_PAYMENT_CODE: "MESA_POSSIBLE_DUPLICATE_PAYMENT",
  MESA_CLOSE_OVER_COLLECTED_CODE: "MESA_CLOSE_OVER_COLLECTED",
  mesaApi: {
    floor: jest.fn(),
    openTable: jest.fn(),
    releaseEmptyTable: jest.fn(),
    closeTable: jest.fn(),
    adjust: jest.fn(),
    refund: jest.fn(),
    saveTable: jest.fn(),
    addCommand: jest.fn(),
    markServed: jest.fn(),
    pay: jest.fn(),
    sessionAccount: jest.fn(),
    recentClosedSessions: jest.fn(),
    createReservation: jest.fn(),
    updateReservation: jest.fn(),
    setReservationStatus: jest.fn(),
    openReservation: jest.fn(),
  },
}));

const TabMesa = require("./TabMesa").default;
const { mesaApi, createMesaRequestId, describeMesaError } = require("../../mesa/mesaApi");

function click(el) { act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }
function typeInto(el, value) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
const byTestId = (c, id) => c.querySelector(`[data-testid="${id}"]`);
const allByTestId = (c, id) => Array.from(c.querySelectorAll(`[data-testid="${id}"]`));

async function mount(role) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TabMesa role={role} notify={jest.fn()} onNewCommand={jest.fn()} onCountChange={jest.fn()} />);
  });
  await flush();
  return { container, root };
}
function unmount(container, root) {
  act(() => { root.unmount(); });
  container.remove();
}

const fin = (o) => ({
  orderUid: o.orderUid,
  originalObligation: o.original ?? o.current,
  currentObligation: o.current,
  commercialAdjustment: Math.round(((o.current) - (o.original ?? o.current)) * 100) / 100,
  obligationRevision: o.rev ?? 0,
  adjustable: o.adjustable ?? true,
});

const openSession = (commands) => ({
  id: "session-adj", coversTotal: 2, coversRemaining: 0,
  total: commands.reduce((s, c) => s + c.total, 0),
  paid: 0, outstanding: commands.reduce((s, c) => s + c.total, 0), overCollected: 0,
  nextEqualShare: 0, paymentTotals: {},
  commands, lines: [], payments: [],
});

const floorWith = (session) => ({
  ok: true,
  tables: [
    { id: "t1", number: 1, name: "Mesa 1", capacity: 4, x: 15, y: 20, shape: "square", active: true, status: "open", session },
    { id: "t2", number: 2, name: "Mesa 2", capacity: 4, x: 40, y: 20, shape: "square", active: true, status: "free", session: null },
  ],
});

const ONE_ADJUSTABLE = [{
  id: "#001", commandNumber: 1, state: "RETIRADO", total: 30, time: "20:00", items: [],
  financial: fin({ orderUid: "uid-A", original: 30, current: 30 }),
}];
const TWO_COMMANDS = [
  { id: "#001", commandNumber: 1, state: "RETIRADO", total: 30, time: "20:00", items: [], financial: fin({ orderUid: "uid-A", original: 30, current: 30 }) },
  { id: "#003", commandNumber: 2, state: "RETIRADO", total: 15, time: "20:10", items: [], financial: fin({ orderUid: "uid-B", original: 15, current: 15 }) },
];

beforeAll(() => {
  jest.useFakeTimers({
    doNotFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "nextTick", "setImmediate", "queueMicrotask", "hrtime", "performance"],
  });
  jest.setSystemTime(new Date("2026-08-05T12:00:00.000Z"));
});
afterAll(() => { jest.useRealTimers(); });
beforeEach(() => {
  jest.clearAllMocks();
  createMesaRequestId.mockImplementation((p) => `${p}_test`);
  describeMesaError.mockImplementation((error) => error?.code || "error");
  mesaApi.saveTable.mockResolvedValue({ ok: true });
});

// Opens Mesa 1 -> Ver cuenta.
function openVerCuenta(container) {
  click(container.querySelector(".mesa-table"));
  const verCuenta = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Ver cuenta"));
  click(verCuenta);
}

// ── §28 / §29 — admin sees the section in Ver cuenta, non-admin never does ──
test("admin sees 'Ajustes comerciales' in Ver cuenta for an adjustable comanda", async () => {
  mesaApi.floor.mockResolvedValue(floorWith(openSession(ONE_ADJUSTABLE)));
  const { container, root } = await mount("admin");
  openVerCuenta(container);
  await flush();
  const section = byTestId(container, "mesa-commercial-adjustments");
  expect(section).not.toBe(null);
  expect(section.textContent).toContain("Ajustes comerciales");
  expect(byTestId(container, "mesa-adjustment-open-btn")).not.toBe(null);
  unmount(container, root);
});

test.each(["waiter", "cashier", "operator", "shift_manager", "rider"])(
  "%s does NOT see the Ajuste comercial section (backend stays authoritative)",
  async (role) => {
    mesaApi.floor.mockResolvedValue(floorWith(openSession(ONE_ADJUSTABLE)));
    const { container, root } = await mount(role);
    openVerCuenta(container);
    await flush();
    expect(byTestId(container, "mesa-commercial-adjustments")).toBe(null);
    expect(byTestId(container, "mesa-adjustment-open-btn")).toBe(null);
    unmount(container, root);
  });

// ── §10 — targets financial.orderUid, never the display #NNN ──────────────
test("§10 — submitting an adjustment targets financial.orderUid, never '#001'", async () => {
  mesaApi.floor.mockResolvedValueOnce(floorWith(openSession(ONE_ADJUSTABLE)));
  mesaApi.floor.mockResolvedValueOnce(floorWith(openSession(ONE_ADJUSTABLE)));
  mesaApi.adjust.mockResolvedValue({ ok: true, currentObligation: 20 });
  const { container, root } = await mount("admin");
  openVerCuenta(container);
  await flush();
  click(byTestId(container, "mesa-adjustment-open-btn"));
  typeInto(byTestId(container, "mesa-adjustment-amount"), "20");
  typeInto(byTestId(container, "mesa-adjustment-reason"), "Cortesía de la casa");
  click(byTestId(container, "mesa-adjustment-confirm"));
  await flush();
  expect(mesaApi.adjust).toHaveBeenCalledTimes(1);
  const [sessionId, body] = mesaApi.adjust.mock.calls[0];
  expect(sessionId).toBe("session-adj");
  expect(body.orderUid).toBe("uid-A");
  expect(body.orderUid).not.toBe("#001");
  expect(body.newGross).toBe(20);
  // canonical refresh after success
  expect(mesaApi.floor).toHaveBeenCalledTimes(2);
  unmount(container, root);
});

// ── §22 — two comandas, each row its own orderUid ────────────────────────
test("§22 — two adjustable comandas render two rows, each targeting its own orderUid", async () => {
  mesaApi.floor.mockResolvedValueOnce(floorWith(openSession(TWO_COMMANDS)));
  mesaApi.floor.mockResolvedValueOnce(floorWith(openSession(TWO_COMMANDS)));
  mesaApi.adjust.mockResolvedValue({ ok: true, currentObligation: 5 });
  const { container, root } = await mount("admin");
  openVerCuenta(container);
  await flush();
  const openBtns = allByTestId(container, "mesa-adjustment-open-btn");
  expect(openBtns).toHaveLength(2);
  click(openBtns[1]); // comanda 2 (uid-B)
  typeInto(byTestId(container, "mesa-adjustment-amount"), "5");
  typeInto(byTestId(container, "mesa-adjustment-reason"), "Rebaja comanda 2");
  click(byTestId(container, "mesa-adjustment-confirm"));
  await flush();
  expect(mesaApi.adjust.mock.calls[0][1].orderUid).toBe("uid-B");
  expect(mesaApi.adjust.mock.calls[0][1].expectedCurrentGross).toBe(15);
  unmount(container, root);
});

// ── §29 — a non-adjustable comanda gets no CTA even for an admin ─────────
test("§29 — an admin gets NO adjustment section when no comanda is adjustable", async () => {
  const notAdjustable = [{
    id: "#001", commandNumber: 1, state: "CANCELADO", total: 0, time: "20:00", items: [],
    financial: fin({ orderUid: "uid-A", original: 30, current: 0, adjustable: false }),
  }];
  mesaApi.floor.mockResolvedValue(floorWith(openSession(notAdjustable)));
  const { container, root } = await mount("admin");
  openVerCuenta(container);
  await flush();
  expect(byTestId(container, "mesa-commercial-adjustments")).toBe(null);
  unmount(container, root);
});

// ── §28 — the adjustment gate is SEPARATE from the refund gate ──────────
test("§28 — Ajuste Comercial and Refund are independent gates (both admin-only, distinct checks)", async () => {
  // A payment history so MesaPaymentsList would render its own "Reembolsar" CTA.
  const session = {
    ...openSession(ONE_ADJUSTABLE),
    paid: 30, outstanding: 0,
    payments: [{ id: "pt-1", kind: "payment", amount: 30, method: "efectivo", createdAt: "2026-08-05T12:00:00Z" }],
  };
  mesaApi.floor.mockResolvedValue(floorWith(session));
  const { container, root } = await mount("admin");
  openVerCuenta(container);
  await flush();
  // admin: BOTH surfaces present
  expect(byTestId(container, "mesa-commercial-adjustments")).not.toBe(null);
  expect(byTestId(container, "mesa-payments-list")).not.toBe(null);
  unmount(container, root);

  mesaApi.floor.mockResolvedValue(floorWith(session));
  const { container: c2, root: r2 } = await mount("waiter");
  openVerCuenta(c2);
  await flush();
  // waiter: neither the adjustment section NOR the refund CTA (payments list may
  // still render read-only, but no adjust section and no Reembolsar button)
  expect(byTestId(c2, "mesa-commercial-adjustments")).toBe(null);
  expect(byTestId(c2, "mesa-payhist-refund-btn")).toBe(null);
  unmount(c2, r2);
});
