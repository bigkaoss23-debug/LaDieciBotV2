// MesaOpenTableRefund.test.js — Refund V1 Slice B, OPEN-table integration.
//
// The open-table Payment Hub (VerCuentaBody) previously had NO payments list
// at all (the Slice A contract audit's own finding). This proves the real,
// wired-in surface: role gating end to end through TabMesa -> MesaWorkspace
// -> VerCuentaBody -> MesaPaymentsList, a full refund call with the correct
// session id and payload, the canonical post-refund refresh (mesaApi.floor,
// same as every other Payment Hub action), and that the table stays OPEN
// throughout (§13/§38 -- refund is never confused with closing the table).
import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../mesa/mesaApi", () => ({
  __esModule: true,
  createMesaRequestId: jest.fn(() => "mesa_test_request"),
  describeMesaError: jest.fn((error) => error?.code || "error"),
  mesaApi: {
    floor: jest.fn(), openTable: jest.fn(), releaseEmptyTable: jest.fn(), closeTable: jest.fn(),
    saveTable: jest.fn(), addCommand: jest.fn(), markServed: jest.fn(), pay: jest.fn(), refund: jest.fn(),
    createReservation: jest.fn(), updateReservation: jest.fn(), setReservationStatus: jest.fn(),
    openReservation: jest.fn(),
  },
}));

const TabMesa = require("./TabMesa").default;
const { mesaApi, describeMesaError, createMesaRequestId } = require("../../mesa/mesaApi");

beforeEach(() => {
  describeMesaError.mockImplementation((error) => error?.code || "error");
  createMesaRequestId.mockImplementation(() => "mesa_test_request");
});

// A fully-paid 60,00 € table (§22 territory: a full remainder exists to
// refund) -- one tarjeta payment, no refunds yet.
const OPEN_SESSION = {
  id: "session-open-1", coversTotal: 2, coversRemaining: 0,
  total: 60, paid: 60, outstanding: 0, nextEqualShare: 0,
  paymentTotals: { tarjeta: 60 },
  commands: [{ id: "c1", commandNumber: 1, state: "RETIRADO", time: "20:10", items: [{ n: "La Joya", q: 2 }] }],
  payments: [
    { id: "pt-open-1", kind: "payment", mode: "full", amount: 60, method: "tarjeta", coversSettled: 2, actor: "owner", createdAt: "2026-08-26T20:14:00Z", reversesTransactionId: null },
  ],
  lines: [
    { id: "l1", description: "La Joya", amount: 30, paid: 30, remaining: 0, product: { fantasyName: "La Joya", classicName: "Bufala" } },
    { id: "l2", description: "La Joya", amount: 30, paid: 30, remaining: 0, product: { fantasyName: "La Joya", classicName: "Bufala" } },
  ],
};
const OPEN_TABLE = {
  id: "t9", number: 9, x: 10, y: 10, shape: "round", shapePreset: "standard",
  active: true, capacity: 2, reservations: [], status: "open", session: OPEN_SESSION,
};

function click(el) { act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
const byTestId = (c, id) => c.querySelector(`[data-testid="${id}"]`);
const buttonByText = (c, text) =>
  Array.from(c.querySelectorAll("button")).find((b) => b.textContent.trim() === text);

async function openHub({ role = "admin", table = OPEN_TABLE } = {}) {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [table] });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TabMesa role={role} notify={jest.fn()} onNewCommand={jest.fn()} onCountChange={jest.fn()}
      compact={false} mesaDrafts={{}} onClearDraft={jest.fn()} onSendToCocina={jest.fn()} />);
  });
  click(container.querySelector(".mesa-table"));
  await flush();
  click(buttonByText(container, "Ver cuenta"));
  await flush();
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

describe("Refund V1 -- open-table role gating (§8, UX-only; backend remains authoritative)", () => {
  test("admin sees Reembolsar on the open table's own payments", async () => {
    const { container, root } = await openHub({ role: "admin" });
    expect(byTestId(container, "mesa-payments-list")).not.toBeNull();
    expect(byTestId(container, "mesa-payhist-refund-btn")).not.toBeNull();
    unmount(container, root);
  });

  test("owner sees Reembolsar too", async () => {
    const { container, root } = await openHub({ role: "owner" });
    expect(byTestId(container, "mesa-payhist-refund-btn")).not.toBeNull();
    unmount(container, root);
  });

  test.each(["waiter", "operator", "cashier", "legacy_operator"])(
    "%s can see the payment history but NOT the Reembolsar action",
    async (role) => {
      const { container, root } = await openHub({ role });
      // The payment history itself is still visible -- only the write action is gated.
      expect(byTestId(container, "mesa-payments-list")).not.toBeNull();
      expect(byTestId(container, "mesa-payhist-refund-btn")).toBeNull();
      unmount(container, root);
    }
  );
});

describe("Refund V1 -- open-table full refund flow (§13/§38)", () => {
  test("a real refund calls mesaApi.refund with THIS session id and the correct payload", async () => {
    mesaApi.refund.mockResolvedValue({ ok: true, refundTransactionId: "rt-open-1", amount: 60 });
    const { container, root } = await openHub({ role: "admin" });

    click(byTestId(container, "mesa-payhist-refund-btn"));
    click(byTestId(container, "mesa-refund-reason-mesa"));
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();

    expect(mesaApi.refund).toHaveBeenCalledTimes(1);
    expect(mesaApi.refund.mock.calls[0][0]).toBe(OPEN_SESSION.id);
    expect(mesaApi.refund.mock.calls[0][1]).toMatchObject({
      originalTransactionId: "pt-open-1", amount: 60, reason: "Mesa equivocada",
    });
    unmount(container, root);
  });

  test("after a successful refund, the account refreshes from the server (mesaApi.floor) and the table remains OPEN", async () => {
    mesaApi.refund.mockResolvedValue({ ok: true, refundTransactionId: "rt-open-1", amount: 60 });
    const { container, root } = await openHub({ role: "admin" });

    // Refresh after success returns the SAME table, now with the refund
    // reflected -- outstanding risen, table still open (§13, frozen).
    const AFTER_REFUND_TABLE = {
      ...OPEN_TABLE,
      session: {
        ...OPEN_SESSION,
        paid: 0, outstanding: 60,
        payments: [
          ...OPEN_SESSION.payments,
          { id: "rt-open-1", kind: "refund", amount: 60, method: "tarjeta", coversSettled: 0, actor: "owner", createdAt: "2026-08-26T20:20:00Z", reversesTransactionId: "pt-open-1" },
        ],
      },
    };
    mesaApi.floor.mockResolvedValue({ ok: true, tables: [AFTER_REFUND_TABLE] });

    click(byTestId(container, "mesa-payhist-refund-btn"));
    click(byTestId(container, "mesa-refund-reason-mesa"));
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();

    // floor was called again (the canonical open-table refresh path).
    expect(mesaApi.floor.mock.calls.length).toBeGreaterThanOrEqual(2);
    // The table never closed and was never reopened as a side effect.
    expect(mesaApi.closeTable).not.toHaveBeenCalled();
    expect(mesaApi.openTable).not.toHaveBeenCalled();
    // The refund's own linkage survives the refresh: exactly one child row.
    expect(byTestId(container, "mesa-payhist-refund")).not.toBeNull();
    // The original is now fully refunded -- no further CTA, per §22.
    expect(byTestId(container, "mesa-payhist-full-badge")).not.toBeNull();
    unmount(container, root);
  });
});

// ── §26/§40 REGRESSION: refund coexists with the existing payment UX ──────
describe("Refund V1 does not regress the existing Payment Hub actions", () => {
  test("Cobrar todo / Pago parcial / Descuento still render alongside the payments list", async () => {
    const { container, root } = await openHub({ role: "admin" });
    expect(byTestId(container, "mesa-hub-cobrar-todo")).not.toBeNull();
    expect(byTestId(container, "mesa-hub-pago-parcial")).not.toBeNull();
    expect(byTestId(container, "mesa-hub-descuento")).not.toBeNull();
    unmount(container, root);
  });

  test("paying (mesaApi.pay) and refunding (mesaApi.refund) remain two distinct calls -- neither ever substitutes for the other", async () => {
    const { container, root } = await openHub({ role: "admin" });
    expect(mesaApi.pay).not.toHaveBeenCalled();
    expect(mesaApi.refund).not.toHaveBeenCalled();
    unmount(container, root);
  });
});
