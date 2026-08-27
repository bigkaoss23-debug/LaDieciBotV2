// MesaCommercialAdjustments.test.js — Ajuste Comercial V1, Frontend Slice C.
// Shared admin-only, order-scoped adjustment component. Direct DOM tests (raw
// ReactDOM + act(), no @testing-library in this repo — same technique as
// MesaPaymentsList.test.js). Status-agnostic by construction: it takes
// sessionId / account / canAdjust / onAdjusted and nothing else.
import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../mesa/mesaApi", () => ({
  __esModule: true,
  createMesaRequestId: jest.fn(() => "mesa_test_adj"),
  describeMesaError: jest.fn((error) => error?.code || "error"),
  mesaApi: { adjust: jest.fn() },
}));

const MesaCommercialAdjustments = require("./MesaCommercialAdjustments").default;
const { mesaApi, describeMesaError, createMesaRequestId } = require("../../mesa/mesaApi");

beforeEach(() => {
  jest.clearAllMocks();
  describeMesaError.mockImplementation((error) => error?.code || "error");
  createMesaRequestId.mockImplementation(() => "mesa_test_adj");
});

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

async function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<MesaCommercialAdjustments {...props} />); });
  return { container, root };
}
function unmount(container, root) {
  act(() => { root.unmount(); });
  container.remove();
}

const fin = (o) => ({
  orderUid: o.orderUid ?? "11111111-1111-4111-8111-111111111111",
  originalObligation: o.original ?? o.current,
  currentObligation: o.current,
  commercialAdjustment: Math.round(((o.current) - (o.original ?? o.current)) * 100) / 100,
  obligationRevision: o.rev ?? 0,
  adjustable: o.adjustable ?? true,
});
const account = (over = {}) => ({
  paid: 30, overCollected: 0,
  commands: [{ commandNumber: 1, id: "#001", total: 30, financial: fin({ orderUid: "uid-1", original: 30, current: 30 }) }],
  ...over,
});
const baseProps = (over = {}) => ({
  sessionId: "session-1", account: account(), canAdjust: true, onAdjusted: jest.fn().mockResolvedValue(undefined),
  ...over,
});

// ── §30.1-5 — authorization ─────────────────────────────────────────────────
test("§30.1 — admin sees the Ajuste comercial action", async () => {
  const { container, root } = await mount(baseProps());
  expect(byTestId(container, "mesa-commercial-adjustments")).not.toBe(null);
  expect(byTestId(container, "mesa-adjustment-open-btn")).not.toBe(null);
  unmount(container, root);
});

test("§30.2-5 — canAdjust false renders NOTHING (no section, no disabled CTA)", async () => {
  const { container, root } = await mount(baseProps({ canAdjust: false }));
  expect(container.textContent).toBe("");
  expect(byTestId(container, "mesa-commercial-adjustments")).toBe(null);
  unmount(container, root);
});

// ── §30.6 / §10 — non-adjustable commands never get a CTA ───────────────────
test("§30.6 — a command with adjustable:false or no orderUid gets no row/CTA; nothing renders when none are adjustable", async () => {
  const acc = {
    paid: 0, overCollected: 0,
    commands: [
      { commandNumber: 1, id: "#001", total: 10, financial: fin({ current: 10, adjustable: false }) },
      { commandNumber: 2, id: "#002", total: 5, financial: { ...fin({ current: 5 }), orderUid: null } },
      { commandNumber: 3, id: "#003", total: 8 },
    ],
  };
  const { container, root } = await mount(baseProps({ account: acc }));
  expect(container.textContent).toBe("");
  unmount(container, root);
});

test("§10/§11 — the row shows Comanda N (context) and never the raw orderUid", async () => {
  const { container, root } = await mount(baseProps());
  const row = byTestId(container, "mesa-adjustment-command");
  expect(row.textContent).toContain("Comanda 1");
  expect(row.textContent).not.toContain("uid-1");
  expect(container.innerHTML).not.toContain("uid-1");
  unmount(container, root);
});

// ── §30.7-11 / §16 — payload + validation ──────────────────────────────────
test("§30.7/§16 — submit sends the ABSOLUTE new gross, orderUid, reason, expectedCurrentGross, clientRequestId — nothing else", async () => {
  mesaApi.adjust.mockResolvedValue({ ok: true, currentObligation: 20 });
  const props = baseProps();
  const { container, root } = await mount(props);
  click(byTestId(container, "mesa-adjustment-open-btn"));
  typeInto(byTestId(container, "mesa-adjustment-amount"), "20");
  typeInto(byTestId(container, "mesa-adjustment-reason"), "Cortesía de la casa");
  click(byTestId(container, "mesa-adjustment-confirm"));
  await flush();
  expect(mesaApi.adjust).toHaveBeenCalledTimes(1);
  const [sessionId, body] = mesaApi.adjust.mock.calls[0];
  expect(sessionId).toBe("session-1");
  expect(Object.keys(body).sort()).toEqual(
    ["clientRequestId", "expectedCurrentGross", "newGross", "orderUid", "reason"].sort());
  expect(body.orderUid).toBe("uid-1");
  expect(body.newGross).toBe(20);            // absolute, not -10
  expect(body.expectedCurrentGross).toBe(30);
  expect(body.reason).toBe("Cortesía de la casa");
  for (const forbidden of ["paymentMethod", "amount", "lineIds", "revision", "status", "cash"]) {
    expect(forbidden in body).toBe(false);
  }
  unmount(container, root);
});

test("§30.8 — an increase is rejected client-side (no request)", async () => {
  const { container, root } = await mount(baseProps());
  click(byTestId(container, "mesa-adjustment-open-btn"));
  typeInto(byTestId(container, "mesa-adjustment-amount"), "40");
  typeInto(byTestId(container, "mesa-adjustment-reason"), "algo");
  expect(byTestId(container, "mesa-adjustment-confirm").disabled).toBe(true);
  click(byTestId(container, "mesa-adjustment-confirm"));
  await flush();
  expect(mesaApi.adjust).not.toHaveBeenCalled();
  unmount(container, root);
});

test("§30.9 — an unchanged amount cannot submit", async () => {
  const { container, root } = await mount(baseProps());
  click(byTestId(container, "mesa-adjustment-open-btn")); // prefilled with 30,00
  typeInto(byTestId(container, "mesa-adjustment-reason"), "algo");
  expect(byTestId(container, "mesa-adjustment-confirm").disabled).toBe(true);
  unmount(container, root);
});

test("§30.10 — zero IS accepted (backend allows it): submit fires", async () => {
  mesaApi.adjust.mockResolvedValue({ ok: true, currentObligation: 0 });
  const { container, root } = await mount(baseProps());
  click(byTestId(container, "mesa-adjustment-open-btn"));
  typeInto(byTestId(container, "mesa-adjustment-amount"), "0");
  typeInto(byTestId(container, "mesa-adjustment-reason"), "Invitación completa");
  expect(byTestId(container, "mesa-adjustment-confirm").disabled).toBe(false);
  click(byTestId(container, "mesa-adjustment-confirm"));
  await flush();
  expect(mesaApi.adjust.mock.calls[0][1].newGross).toBe(0);
  unmount(container, root);
});

test("§30.11 — the reason is mandatory", async () => {
  const { container, root } = await mount(baseProps());
  click(byTestId(container, "mesa-adjustment-open-btn"));
  typeInto(byTestId(container, "mesa-adjustment-amount"), "20");
  expect(byTestId(container, "mesa-adjustment-confirm").disabled).toBe(true);
  typeInto(byTestId(container, "mesa-adjustment-reason"), "   ");
  expect(byTestId(container, "mesa-adjustment-confirm").disabled).toBe(true);
  unmount(container, root);
});

// ── §30.12-13 / §14 — load-bearing copy ────────────────────────────────────
test("§30.12 — the no-refund warning is always visible in the form", async () => {
  const { container, root } = await mount(baseProps());
  click(byTestId(container, "mesa-adjustment-open-btn"));
  expect(byTestId(container, "mesa-adjustment-no-refund").textContent)
    .toBe("Este ajuste cambia lo que debe el cliente. No devuelve dinero.");
  unmount(container, root);
});

test("§30.13 — projected over-collection warning appears only when the reduction would create it", async () => {
  // account: obligation 30, paid 30. Reduce to 20 -> 10 over-collected.
  const { container, root } = await mount(baseProps());
  click(byTestId(container, "mesa-adjustment-open-btn"));
  typeInto(byTestId(container, "mesa-adjustment-amount"), "25");
  typeInto(byTestId(container, "mesa-adjustment-reason"), "x");
  expect(byTestId(container, "mesa-adjustment-projected-over").textContent).toContain("Quedarán 5,00");
  expect(byTestId(container, "mesa-adjustment-projected-over").textContent).toContain("El reembolso se registra por separado.");
  // With paid 12 there is no projected over-collection.
  unmount(container, root);

  const { container: c2, root: r2 } = await mount(baseProps({ account: account({ paid: 12 }) }));
  click(byTestId(c2, "mesa-adjustment-open-btn"));
  typeInto(byTestId(c2, "mesa-adjustment-amount"), "20");
  typeInto(byTestId(c2, "mesa-adjustment-reason"), "x");
  expect(byTestId(c2, "mesa-adjustment-projected-over")).toBe(null);
  unmount(c2, r2);
});

// ── §30.14 — stable clientRequestId across rerender / retry ────────────────
test("§30.14 — the clientRequestId is stable across a failed retry, fresh only for a new logical attempt", async () => {
  createMesaRequestId.mockImplementationOnce(() => "adj_first").mockImplementationOnce(() => "adj_second");
  mesaApi.adjust
    .mockRejectedValueOnce({ code: "MESA_ADJUSTMENT_INVALID" })
    .mockResolvedValueOnce({ ok: true, currentObligation: 20 });
  const { container, root } = await mount(baseProps());
  click(byTestId(container, "mesa-adjustment-open-btn"));
  typeInto(byTestId(container, "mesa-adjustment-amount"), "20");
  typeInto(byTestId(container, "mesa-adjustment-reason"), "Cortesía");
  click(byTestId(container, "mesa-adjustment-confirm"));
  await flush();
  // retry the SAME open attempt after the failure
  click(byTestId(container, "mesa-adjustment-confirm"));
  await flush();
  expect(mesaApi.adjust).toHaveBeenCalledTimes(2);
  expect(mesaApi.adjust.mock.calls[0][1].clientRequestId).toBe("adj_first");
  expect(mesaApi.adjust.mock.calls[1][1].clientRequestId).toBe("adj_first"); // unchanged on retry
  unmount(container, root);
});

// ── §30.15 — stale conflict causes canonical refresh ──────────────────────
test("§30.15 — MESA_ADJUSTMENT_STALE_OBLIGATION shows the error AND refreshes the canonical account", async () => {
  mesaApi.adjust.mockRejectedValue({ code: "MESA_ADJUSTMENT_STALE_OBLIGATION" });
  const props = baseProps();
  const { container, root } = await mount(props);
  click(byTestId(container, "mesa-adjustment-open-btn"));
  typeInto(byTestId(container, "mesa-adjustment-amount"), "20");
  typeInto(byTestId(container, "mesa-adjustment-reason"), "Cortesía");
  click(byTestId(container, "mesa-adjustment-confirm"));
  await flush();
  expect(byTestId(container, "mesa-adjustment-error").textContent).toContain("MESA_ADJUSTMENT_STALE_OBLIGATION");
  expect(props.onAdjusted).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

// ── §30.16-17 — success refreshes; no optimistic mutation ─────────────────
test("§30.16/§17/§19 — on success it calls onAdjusted() and never patches the account locally", async () => {
  mesaApi.adjust.mockResolvedValue({ ok: true, currentObligation: 20, revision: 2 });
  const props = baseProps();
  const { container, root } = await mount(props);
  click(byTestId(container, "mesa-adjustment-open-btn"));
  typeInto(byTestId(container, "mesa-adjustment-amount"), "20");
  typeInto(byTestId(container, "mesa-adjustment-reason"), "Cortesía");
  click(byTestId(container, "mesa-adjustment-confirm"));
  await flush();
  expect(props.onAdjusted).toHaveBeenCalledTimes(1);
  // The row still shows the ORIGINAL 30,00 € the (unchanged) props carry — the
  // component renders backend truth after the parent re-reads, never its own guess.
  expect(byTestId(container, "mesa-adjustment-command").textContent).toContain("30,00");
  expect(byTestId(container, "mesa-adjustment-success").textContent).toContain("Comanda 1");
  unmount(container, root);
});

// ── §30.18 / §22 — the correct orderUid with multiple commands ────────────
test("§30.18/§22 — with two adjustable comandas, each Ajustar targets its OWN orderUid", async () => {
  mesaApi.adjust.mockResolvedValue({ ok: true, currentObligation: 10 });
  const acc = {
    paid: 0, overCollected: 0,
    commands: [
      { commandNumber: 1, id: "#001", total: 30, financial: fin({ orderUid: "uid-A", original: 30, current: 30 }) },
      { commandNumber: 2, id: "#002", total: 15, financial: fin({ orderUid: "uid-B", original: 15, current: 15 }) },
    ],
  };
  const { container, root } = await mount(baseProps({ account: acc }));
  const openBtns = allByTestId(container, "mesa-adjustment-open-btn");
  expect(openBtns).toHaveLength(2);
  // open the SECOND comanda's form
  click(openBtns[1]);
  typeInto(byTestId(container, "mesa-adjustment-amount"), "10");
  typeInto(byTestId(container, "mesa-adjustment-reason"), "Descuento comanda 2");
  click(byTestId(container, "mesa-adjustment-confirm"));
  await flush();
  expect(mesaApi.adjust.mock.calls[0][1].orderUid).toBe("uid-B");
  expect(mesaApi.adjust.mock.calls[0][1].expectedCurrentGross).toBe(15);
  unmount(container, root);
});
