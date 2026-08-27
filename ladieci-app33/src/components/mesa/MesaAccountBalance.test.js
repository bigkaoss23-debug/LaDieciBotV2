// MesaAccountBalance.test.js — OVER-COLLECTED / AJUSTE COMERCIAL V1 SLICE C.
//
// Raw ReactDOM + act(), same technique as MesaPaymentsList.test.js -- no
// @testing-library in this repo. Direct DOM tests: this component takes only
// `account` (the exact shape mesaService.js's projectSessionAccount returns)
// and renders, so every case below is a pure function of that shape.
import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

const MesaAccountBalance = require("./MesaAccountBalance").default;

async function mount(account) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<MesaAccountBalance account={account} />); });
  return { container, root };
}
function unmount(container, root) {
  act(() => { root.unmount(); });
  container.remove();
}
const byTestId = (c, id) => c.querySelector(`[data-testid="${id}"]`);

// A. obligation 30, collected 20 -> Pendiente 10, no Cobrado de más.
test("A. partial payment: outstanding shown, no overcollected row", async () => {
  const { container, root } = await mount({ total: 30, paid: 20, outstanding: 10, overCollected: 0, payments: [] });
  expect(byTestId(container, "mesa-hub-total").textContent).toMatch(/30,00\s?€/);
  expect(byTestId(container, "mesa-hub-paid").textContent).toMatch(/20,00\s?€/);
  expect(byTestId(container, "mesa-hub-outstanding").textContent).toMatch(/10,00\s?€/);
  expect(byTestId(container, "mesa-hub-overcollected")).toBe(null);
  unmount(container, root);
});

// B. obligation 30, collected 30 -> both zero, no overcollected row.
test("B. fully settled: outstanding 0,00 €, no overcollected row", async () => {
  const { container, root } = await mount({ total: 30, paid: 30, outstanding: 0, overCollected: 0, payments: [] });
  expect(byTestId(container, "mesa-hub-outstanding").textContent).toMatch(/0,00\s?€/);
  expect(byTestId(container, "mesa-hub-overcollected")).toBe(null);
  unmount(container, root);
});

// C. obligation 20, collected 30 -> Cobrado de más 10, no Pendiente row content
// beyond 0,00 € (outstanding row always renders, but at zero).
test("C. over-collected: Cobrado de más 10,00 €, outstanding reads 0,00 €", async () => {
  const { container, root } = await mount({ total: 20, paid: 30, outstanding: 0, overCollected: 10, payments: [] });
  expect(byTestId(container, "mesa-hub-outstanding").textContent).toMatch(/0,00\s?€/);
  const overRow = byTestId(container, "mesa-hub-overcollected");
  expect(overRow).not.toBe(null);
  expect(overRow.textContent).toContain("Cobrado de más");
  expect(overRow.textContent).toMatch(/10,00\s?€/);
  unmount(container, root);
});

// D. aggregate scopes (Economía) are covered separately in EconomiaGeneral's
// own test file -- this component is per-account, never per-aggregate, so
// there is no "both nonzero across two tables" case to construct here. What
// this component DOES prove: unpaid and overCollected are two independent
// props, never netted -- rendering both non-zero on the SAME account (a real
// shape a backend refund/cancellation timing edge could produce) shows BOTH,
// never a fake zero.
test("D. unpaid and overCollected both nonzero on the same account: both shown, never netted", async () => {
  const { container, root } = await mount({ total: 30, paid: 25, outstanding: 5, overCollected: 3, payments: [] });
  expect(byTestId(container, "mesa-hub-outstanding").textContent).toMatch(/5,00\s?€/);
  const overRow = byTestId(container, "mesa-hub-overcollected");
  expect(overRow).not.toBe(null);
  expect(overRow.textContent).toMatch(/3,00\s?€/);
  unmount(container, root);
});

// E. A force-closed order's payment remains visible: this component reads
// account.total/paid/outstanding/overCollected exactly as the backend
// computed them (Over-Collected Slice A already fixed that backend reader to
// never drop a force-closed order's money) -- it does not re-filter by
// order status itself, so a real collected amount on such an order is never
// hidden here.
test("E. a force-closed order's collected money is not hidden by this component", async () => {
  // 50 collected on an order the backend's reader correctly still counts
  // (Slice A), zero owed -- the account the backend hands over already
  // reflects that; this proves the component does not additionally filter.
  const { container, root } = await mount({ total: 0, paid: 50, outstanding: 0, overCollected: 50, payments: [] });
  expect(byTestId(container, "mesa-hub-paid").textContent).toMatch(/50,00\s?€/);
  expect(byTestId(container, "mesa-hub-overcollected").textContent).toMatch(/50,00\s?€/);
  unmount(container, root);
});

test("Reembolsado row is absent with no refund rows, present and summed once one exists", async () => {
  const noRefunds = await mount({ total: 30, paid: 30, outstanding: 0, overCollected: 0, payments: [
    { id: "pt-1", kind: "payment", amount: 30 },
  ] });
  expect(byTestId(noRefunds.container, "mesa-hub-refunded")).toBe(null);
  unmount(noRefunds.container, noRefunds.root);

  const withRefund = await mount({ total: 20, paid: 20, outstanding: 0, overCollected: 0, payments: [
    { id: "pt-1", kind: "payment", amount: 30 },
    { id: "pt-2", kind: "refund", amount: 10, reversesTransactionId: "pt-1" },
  ] });
  const row = byTestId(withRefund.container, "mesa-hub-refunded");
  expect(row).not.toBe(null);
  expect(row.textContent).toMatch(/10,00\s?€/);
  unmount(withRefund.container, withRefund.root);
});

test("a missing/null account renders safely at zero, not a crash", async () => {
  const { container, root } = await mount(null);
  expect(byTestId(container, "mesa-hub-total").textContent).toMatch(/0,00\s?€/);
  expect(byTestId(container, "mesa-hub-overcollected")).toBe(null);
  unmount(container, root);
});

// ── AJUSTE COMERCIAL SLICE C §20/§29 — the ITEMISED layout, driven ONLY by
// commands[].financial.commercialAdjustment !== 0. With no adjustment the
// layout is byte-for-byte the compact one above; the cases below prove the
// itemised one reads the canonical per-order obligation figures and derives
// Cobrado de más / Resta por pagar against account.paid.
const fin = (o) => ({
  orderUid: o.orderUid || `uid-${o.n || 1}`,
  originalObligation: o.original, currentObligation: o.current,
  commercialAdjustment: Math.round((o.current - o.original) * 100) / 100,
  obligationRevision: o.rev ?? 0, adjustable: o.adjustable ?? true,
});

test("§20 adjusted-case: Venta original 30 / Ajuste comercial -10 / Obligación actual 20 / Cobrado 30 / Cobrado de más 10", async () => {
  const { container, root } = await mount({
    total: 30, paid: 30, outstanding: 0, overCollected: 0, payments: [],
    commands: [{ commandNumber: 1, total: 20, financial: fin({ original: 30, current: 20, rev: 2 }) }],
  });
  const balance = byTestId(container, "mesa-account-balance");
  expect(balance.getAttribute("data-adjusted")).toBe("true");
  expect(byTestId(container, "mesa-hub-original-sale").textContent).toMatch(/30,00\s?€/);
  expect(byTestId(container, "mesa-hub-commercial-adjustment").textContent).toMatch(/-10,00\s?€/);
  expect(byTestId(container, "mesa-hub-current-obligation").textContent).toMatch(/20,00\s?€/);
  expect(byTestId(container, "mesa-hub-paid").textContent).toMatch(/30,00\s?€/);
  expect(byTestId(container, "mesa-hub-outstanding").textContent).toMatch(/0,00\s?€/);
  expect(byTestId(container, "mesa-hub-overcollected").textContent).toMatch(/10,00\s?€/);
  // the compact "Total" row is not shown in the itemised layout
  expect(byTestId(container, "mesa-hub-total")).toBe(null);
  unmount(container, root);
});

test("§20 adjusted, still unpaid: obligation 20 after -10, paid 12 -> Resta por pagar 8, no Cobrado de más", async () => {
  const { container, root } = await mount({
    total: 30, paid: 12, outstanding: 18, overCollected: 0, payments: [],
    commands: [{ commandNumber: 1, total: 20, financial: fin({ original: 30, current: 20 }) }],
  });
  expect(byTestId(container, "mesa-hub-outstanding").textContent).toMatch(/8,00\s?€/);
  expect(byTestId(container, "mesa-hub-overcollected")).toBe(null);
  unmount(container, root);
});

test("§22 multiple comandas, only one adjusted: figures aggregate across all commands", async () => {
  const { container, root } = await mount({
    total: 45, paid: 45, outstanding: 0, overCollected: 0, payments: [],
    commands: [
      { commandNumber: 1, total: 20, financial: fin({ n: 1, original: 30, current: 20 }) },
      { commandNumber: 2, total: 15, financial: fin({ n: 2, original: 15, current: 15 }) },
    ],
  });
  expect(byTestId(container, "mesa-hub-original-sale").textContent).toMatch(/45,00\s?€/);
  expect(byTestId(container, "mesa-hub-commercial-adjustment").textContent).toMatch(/-10,00\s?€/);
  expect(byTestId(container, "mesa-hub-current-obligation").textContent).toMatch(/35,00\s?€/);
  expect(byTestId(container, "mesa-hub-overcollected").textContent).toMatch(/10,00\s?€/);
  unmount(container, root);
});

test("commands present but NOTHING adjusted -> compact layout, byte-identical to the no-commands case", async () => {
  const { container, root } = await mount({
    total: 30, paid: 20, outstanding: 10, overCollected: 0, payments: [],
    commands: [
      { commandNumber: 1, total: 30, financial: fin({ original: 30, current: 30, rev: 1 }) },
    ],
  });
  expect(byTestId(container, "mesa-account-balance").getAttribute("data-adjusted")).toBe(null);
  expect(byTestId(container, "mesa-hub-total").textContent).toMatch(/30,00\s?€/);
  expect(byTestId(container, "mesa-hub-current-obligation")).toBe(null);
  unmount(container, root);
});
