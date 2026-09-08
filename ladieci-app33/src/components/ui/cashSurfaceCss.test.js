// UNIFIED_CASH_UI_SURFACE_V1 — BLOCCO 3. The shared cash sub-surface CSS has one
// home; TabMesa's effective stylesheet is unchanged; CheckCashPanel injects it
// without mounting TabMesa.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { CASH_SURFACE_CSS } from "./cashSurfaceCss";
import { mesaCss } from "../mesa/TabMesa";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../cash/cashApi", () => ({
  __esModule: true,
  cashApi: { checkAccount: jest.fn(), pay: jest.fn(), refund: jest.fn(), adjust: jest.fn() },
  createCashRequestId: jest.fn(() => "cash_test_req"),
  describeCashError: jest.fn((e) => e?.code || "error"),
  CASH_DUPLICATE_PAYMENT_CODE: "ORDER_PAYMENT_POSSIBLE_DUPLICATE",
}));

const CheckCashPanel = require("../cash/CheckCashPanel").default;
const { cashApi } = require("../../cash/cashApi");

// Every rule the three shared components (MesaAccountBalance / MesaPaymentsList /
// MesaCommercialAdjustments) actually emit.
const REQUIRED_SELECTORS = [
  ".mesa-btn{", ".mesa-btn:hover{", ".mesa-btn:disabled{",
  ".mesa-btn.primary{", ".mesa-btn.green{", ".mesa-btn.small{", ".mesa-btn.small.active{",
  ".mesa-input{", ".mesa-input:focus{",
  ".mesa-banner{", ".mesa-error{",
  ".mesa-hub-mode{", ".mesa-hub-mode:hover:not(:disabled){", ".mesa-hub-mode:disabled{", ".mesa-hub-mode.active{",
  ".mesa-hub-totals{", ".mesa-hub-total-row{", ".mesa-hub-total-row strong{",
  ".mesa-hub-total-row.outstanding{", ".mesa-hub-total-row.outstanding strong{",
  ".mesa-hub-total-row.overcollected{", ".mesa-hub-total-row.overcollected strong{",
  ".mesa-hub-field{", ".mesa-hub-field:last-child{", ".mesa-hub-field-label{",
  ".mesa-payhist{", ".mesa-payhist-title{", ".mesa-payhist-item{", ".mesa-payhist-item:last-child{",
  ".mesa-payhist-row{", ".mesa-payhist-meta{", ".mesa-payhist-amount{", ".mesa-payhist-amount.refund{",
  ".mesa-payhist-child{", ".mesa-payhist-child .mesa-payhist-meta{",
  ".mesa-payhist-full{", ".mesa-payhist-remaining{", ".mesa-payhist-refund-btn{", ".mesa-payhist-success{",
  ".mesa-payhist-form{", ".mesa-payhist-form-row{", ".mesa-payhist-form-row strong{", ".mesa-payhist-reasons{",
  ".mesa-payhist-warning{", ".mesa-payhist-external{",
  ".mesa-payhist-form-actions{", ".mesa-payhist-form-actions .mesa-btn{",
];

describe("cashSurfaceCss — single home for the shared cash rules", () => {
  test("CASH_SURFACE_CSS defines every rule the shared components emit", () => {
    for (const sel of REQUIRED_SELECTORS) expect(CASH_SURFACE_CSS.includes(sel)).toBe(true);
  });

  test("TabMesa's effective stylesheet still contains every one of those rules", () => {
    for (const sel of REQUIRED_SELECTORS) expect(mesaCss.includes(sel)).toBe(true);
  });

  test("no duplication: the shared block appears exactly once in TabMesa's stylesheet", () => {
    const count = (hay, needle) => hay.split(needle).length - 1;
    // the whole extracted block is interpolated verbatim, exactly once
    expect(count(mesaCss, CASH_SURFACE_CSS.trim())).toBe(1);
    // and a few representative FULL rule bodies are single-defined
    const FULL = [
      ".mesa-hub-totals{border-top:1px dashed rgba(255,255,255,.14);margin-top:8px;padding-top:10px}",
      ".mesa-payhist{margin-top:16px;border-top:1px dashed rgba(255,255,255,.14);padding-top:14px}",
      ".mesa-input{width:100%;box-sizing:border-box;border:1px solid rgba(208,184,145,.28);border-radius:11px;background:#0b0b0a;color:#fff;padding:12px 13px;font:inherit;outline:none}",
      ".mesa-btn.small{padding:7px 10px;border-radius:10px;font-size:12px}",
    ];
    for (const rule of FULL) expect(count(mesaCss, rule)).toBe(1);
  });

  test("TabMesa keeps its own floor-plan + hub-only rules (not accidentally dropped)", () => {
    expect(mesaCss).toContain(".mesa-board{");
    expect(mesaCss).toContain(".mesa-table{");
    expect(mesaCss).toContain(".mesa-btn.red{");        // reservation-only, stayed put
    expect(mesaCss).toContain(".mesa-hub-actions{");    // hub actions, TabMesa-only
    expect(mesaCss).toContain(".mesa-hub-modes{");      // the grid container, TabMesa-only
  });

  test("the shared block is the SAME text in both places (prepended verbatim)", () => {
    expect(mesaCss).toContain(CASH_SURFACE_CSS.trim());
  });
});

describe("CheckCashPanel injects the shared CSS without TabMesa mounted", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cashApi.checkAccount.mockResolvedValue({
      ok: true, orderUid: "u1", displayOrderId: "#900", estado: "RETIRADO",
      total: 20, paid: 0, outstanding: 20, overCollected: 0,
      commands: [{ id: "#900", orderUid: "u1", commandNumber: "#900", state: "RETIRADO",
        financial: { orderUid: "u1", originalObligation: 20, currentObligation: 20, commercialAdjustment: 0, obligationRevision: 1, adjustable: true } }],
      payments: [], legacyPayments: [],
    });
  });

  test("a <style> with the cash rules is present in the panel subtree; TabMesa is not", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<CheckCashPanel orderUid="u1" displayOrderId="#900" onClose={() => {}} />); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const styleTags = [...container.querySelectorAll("style")];
    const styled = styleTags.some((s) => s.textContent.includes(".mesa-hub-totals{") && s.textContent.includes(".mesa-payhist{"));
    expect(styled).toBe(true);
    expect(container.querySelector(".mesa-board")).toBeNull();
    // and the real shared components rendered (balance + payments list markers)
    expect(container.querySelector('[data-testid="mesa-account-balance"]')).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });
});
