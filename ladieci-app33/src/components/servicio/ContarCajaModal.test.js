// ===============================================================
// ContarCajaModal — the OPERATIONAL cash count, in the current-service area.
//
// It replaces the cash-count half of the old Economía "Caja" panel. The two
// tests that matter most are the last ones: this control sits in the same
// operational area as Finalizar, and it must never read as a close, and it
// must never let the frontend name the authoritative service — the backend
// resolves that from the current Operational Service.
// ===============================================================

import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../economy/economyApi", () => ({
  __esModule: true,
  EconomyApiError: class EconomyApiError extends Error {
    constructor(code, status = 0) { super(code); this.name = "EconomyApiError"; this.code = code; this.status = status; }
  },
  createEconomyRequestId: jest.fn(() => "cash_testrequestid0001"),
  economyApi: { snapshot: jest.fn(), listCashCounts: jest.fn(), createCashCount: jest.fn() },
}));

const ContarCajaModal = require("./ContarCajaModal").default;
const { economyApi, EconomyApiError, createEconomyRequestId } = require("../../economy/economyApi");

const SNAPSHOT = Object.freeze({
  ok: true,
  window: { preset: "hoy", from: "2026-09-05T02:00:00.000Z", to: "2026-09-06T02:00:00.000Z", timezone: "Europe/Madrid", businessDate: "2026-09-05", bounds: "[from,to)" },
  obligation: { gross: 262.5, unpaid: 0, voided: 0, refunded: 0 },
  receipts: { collected: 262.5, refunded: 0, byMethod: { efectivo: 85, tarjeta: 130, bizum: 47.5, other: 0 } },
  balance: { unpaid: 0, overCollected: 0 },
  counts: { obligations: 5 },
});
const SAVED = Object.freeze({
  ok: true, created: true,
  count: { id: "cc-1", countedAt: "2026-09-05T20:00:00.000Z", actor: "owner",
    countedCash: 80, recordedCashReceipts: 85, variance: -5, note: null },
});

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}
const byId = (c, id) => c.querySelector(`[data-testid="${id}"]`);
const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
async function typeInto(el, value) {
  await act(async () => { nativeSetter.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<ContarCajaModal onClose={() => {}} />); });
  await flush();
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

beforeEach(() => {
  jest.clearAllMocks();
  createEconomyRequestId.mockImplementation(() => "cash_testrequestid0001");
  economyApi.snapshot.mockResolvedValue(SNAPSHOT);
  economyApi.listCashCounts.mockResolvedValue({ ok: true, counts: [] });
  economyApi.createCashCount.mockResolvedValue(SAVED);
});

test("the comparison figure is RECORDED cash receipts of the day, never an expected drawer balance", async () => {
  const { container, root } = await mount();
  expect(byId(container, "contar-caja-recorded").textContent).toMatch(/85,00\s?€/);
  expect(container.textContent).not.toMatch(/esperado en caja|expected/i);
  unmount(container, root);
});

test("the difference previews live, before anything is recorded", async () => {
  const { container, root } = await mount();
  await typeInto(byId(container, "contar-caja-input"), "80");
  expect(byId(container, "contar-caja-variance-preview").textContent).toMatch(/-5,00\s?€/);
  expect(economyApi.createCashCount).not.toHaveBeenCalled();
  unmount(container, root);
});

test("confirm stays disabled until a real amount is present", async () => {
  const { container, root } = await mount();
  expect(byId(container, "contar-caja-confirm").disabled).toBe(true);
  await typeInto(byId(container, "contar-caja-input"), "abc");
  expect(byId(container, "contar-caja-confirm").disabled).toBe(true);
  await typeInto(byId(container, "contar-caja-input"), "80");
  expect(byId(container, "contar-caja-confirm").disabled).toBe(false);
  unmount(container, root);
});

test("confirming records exactly ONE count — preset 'hoy', NO window, NO service id", async () => {
  const { container, root } = await mount();
  await typeInto(byId(container, "contar-caja-input"), "80");
  await act(async () => { byId(container, "contar-caja-confirm").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
  expect(economyApi.createCashCount).toHaveBeenCalledTimes(1);
  const arg = economyApi.createCashCount.mock.calls[0][0];
  expect(arg).toEqual(expect.objectContaining({ preset: "hoy", countedCash: 80, clientRequestId: expect.any(String) }));
  // The frontend does NOT decide the authoritative service, and offers no
  // historical selector: no from/to, no serviceSessionId, no other preset.
  expect(arg.from).toBeUndefined();
  expect(arg.to).toBeUndefined();
  expect(arg.serviceSessionId).toBeUndefined();
  expect(arg.businessDate).toBeUndefined();
  unmount(container, root);
});

test("a comma decimal is accepted, as a Spanish keypad produces it", async () => {
  const { container, root } = await mount();
  await typeInto(byId(container, "contar-caja-input"), "84,55");
  await act(async () => { byId(container, "contar-caja-confirm").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
  expect(economyApi.createCashCount).toHaveBeenCalledWith(expect.objectContaining({ countedCash: 84.55 }));
  unmount(container, root);
});

test("a refused count is reported and nothing is claimed to have been saved", async () => {
  economyApi.createCashCount.mockRejectedValue(new EconomyApiError("ECONOMY_CASH_COUNT_FORBIDDEN", 403));
  const { container, root } = await mount();
  await typeInto(byId(container, "contar-caja-input"), "80");
  await act(async () => { byId(container, "contar-caja-confirm").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
  expect(byId(container, "contar-caja-error")).toBeTruthy();
  expect(byId(container, "contar-caja-saved")).toBeNull();
  unmount(container, root);
});

test("history is listed and is immutable BY STRUCTURE — no edit, no delete control on any row", async () => {
  economyApi.listCashCounts.mockResolvedValue({
    ok: true, counts: [
      { id: "a", countedAt: "2026-09-05T13:35:00Z", actor: "laura", countedCash: 65, recordedCashReceipts: 65, variance: 0, note: null },
      { id: "b", countedAt: "2026-09-05T16:00:00Z", actor: "mario", countedCash: 116, recordedCashReceipts: 116, variance: 0, note: "recuento" },
    ],
  });
  const { container, root } = await mount();
  const hist = byId(container, "contar-caja-history");
  expect(hist).toBeTruthy();
  expect(hist.textContent).toMatch(/laura/);
  expect(hist.textContent).toMatch(/mario/);
  // Immutability is proven by the ABSENCE of any mutation control, not by a
  // sentence saying so. The history region carries no buttons at all, and no
  // button anywhere in the modal edits or deletes a count.
  expect(hist.querySelectorAll("button")).toHaveLength(0);
  const buttons = Array.from(container.querySelectorAll("button")).map((b) => b.textContent.toLowerCase());
  expect(buttons.some((t) => /editar|borrar|eliminar/.test(t))).toBe(false);
  // And the API client itself exposes no update/delete cash-count method.
  const apiSrc = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "economy", "economyApi.js"), "utf8");
  expect(apiSrc).not.toMatch(/updateCashCount|deleteCashCount|patchCashCount/);
  unmount(container, root);
});

test("the read on open reads and writes nothing until Confirmar", async () => {
  const { container, root } = await mount();
  expect(economyApi.snapshot).toHaveBeenCalledWith({ preset: "hoy" });
  expect(economyApi.listCashCounts).toHaveBeenCalledWith({ preset: "hoy" });
  expect(economyApi.createCashCount).not.toHaveBeenCalled();
  unmount(container, root);
});

test("nothing on this modal can be read as finalizing a service — proven by structure, not by copy", async () => {
  const { container, root } = await mount();
  // No control here closes, finalizes or transitions anything. (There is no
  // longer a helper sentence saying so — the absence of the control is the
  // proof.)
  for (const el of Array.from(container.querySelectorAll("button"))) {
    expect(el.textContent).not.toMatch(/finalizar|cerrar\s+servicio|cierre|fin\s+de\s+servicio/i);
  }
  // The one write it can do is a cash count; it never calls Finalizar or any
  // lifecycle path (a static guard on the source covers that below).
  expect(economyApi.createCashCount).not.toHaveBeenCalled();
  unmount(container, root);
});

test("the source invokes NO lifecycle / Finalizar path — cash count only", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "ContarCajaModal.jsx"), "utf8");
  // Only economy reads + the single append; nothing that closes a service.
  for (const forbidden of [
    /reconciliation\s*\(/,
    /close_service_session/, /complete_service_session/, /begin_service_session/,
    /ensureCurrentServiceSession/, /serviceSessionLifecycle/, /serviceLifecycleEngine/,
    /onFinalizar|closeService|cerrarServicio/,
  ]) {
    expect(src).not.toMatch(forbidden);
  }
  // …and it does not reach into the Servicio close handlers either.
  expect(src).not.toMatch(/handleChiudi/); // language-guard: allow-legacy handleChiudi* is ServicioPage's existing close-handler name, asserted ABSENT here, not new vocabulary
  expect(src).not.toMatch(/scanServizio/); // language-guard: allow-legacy scanServizio is ServicioPage's existing close-scan action name, asserted ABSENT here, not new vocabulary
  // The write it does make is createCashCount, and only that.
  expect(src).toMatch(/economyApi\.createCashCount\(/);
  expect(src).not.toMatch(/economyApi\.(update|delete|patch)CashCount/);
});

test("the component source carries no historical window selector and no close vocabulary in rendered copy", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "ContarCajaModal.jsx"), "utf8");
  const rendered = src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  // No preset/window picker: the request is fixed to 'hoy'.
  expect(rendered).not.toMatch(/mediodia|noche|datetime-local|PRESETS/);
  expect(rendered).toMatch(/preset:\s*'hoy'/);
  // No close vocabulary in rendered copy.
  for (const forbidden of [/\bcierre\b/i, /\bcerrar\b/i, /\bfinalizar\b/i, /fin de servicio/i]) {
    expect(rendered).not.toMatch(forbidden);
  }
});
