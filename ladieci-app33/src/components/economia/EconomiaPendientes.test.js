// EconomiaPendientes.test.js — PENDENCIAS ECONÓMICAS SLICE 1, the read-only
// operator surface.
//
// This suite pins the contract of the new "Pendientes" view: it renders
// exactly what /api/economy/v1/pendencies returns, in three semantically
// distinct groups, with no write action anywhere; it never invents a
// zero-balance item; it shows a real customer name when there is one and
// never a Mesa's synthetic identity; it keeps the stable orderUid internal;
// and it degrades to isolated loading / empty / error states.
//
// Same mocking seam as EconomiaGeneral.test.js: the component reaches the
// network only through economyApi (here: economyApi.pendencies).
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/economia/EconomiaPendientes.test.js

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

const EconomiaPendientes = require("./EconomiaPendientes").default;
const EconomiaGeneral = require("./EconomiaGeneral").default;
const { economyApi, EconomyApiError } = require("../../economy/economyApi");

// ── fixtures — the shape the deployed reader actually emits ────────────────
const COBRAR_MESA = Object.freeze({
  direction: "POR_COBRAR", orderUid: "uid-cobrar-999001", amount: 50, currentObligation: 50,
  netCollected: 0, originalDate: "2026-08-15T18:06:18.546Z", originalBusinessDate: "2026-08-15",
  lastMovementAt: "2026-08-15T18:10:00.000Z", ageDays: 18, channel: "MESA",
  display: { orderNumber: "#999001", tableNumber: 999, tableName: null, commandNumber: 1 },
  // A defensively-hostile payload: even if the backend leaked a Mesa's
  // synthetic identity, this view must not surface it.
  customer: { name: "Mesa 999", phone: "MESA-DEADBEEF" },
  allowedActions: [], identityConfidence: "STABLE",
});
const DEVOLVER_MESA = Object.freeze({
  direction: "POR_DEVOLVER", orderUid: "uid-devolver-999034", amount: 10, currentObligation: 60,
  netCollected: 70, originalDate: "2026-08-25T19:30:27.733Z", originalBusinessDate: "2026-08-25",
  lastMovementAt: "2026-08-28T12:00:00.000Z", ageDays: 8, channel: "MESA",
  display: { orderNumber: "#999034", tableNumber: 6, tableName: null, commandNumber: 1 },
  customer: { name: null, phone: null }, allowedActions: ["REFUND"], identityConfidence: "STABLE",
});
const DEVOLVER_NAMED = Object.freeze({
  direction: "POR_DEVOLVER", orderUid: "uid-devolver-123", amount: 15, currentObligation: 0,
  netCollected: 15, originalDate: "2026-08-28T20:42:00.000Z", originalBusinessDate: "2026-08-28",
  lastMovementAt: null, ageDays: 5, channel: "RETIRO",
  display: { orderNumber: "#123", tableNumber: null, tableName: null, commandNumber: null },
  customer: { name: "Juan Pérez", phone: "600123123" }, allowedActions: [], identityConfidence: "STABLE",
});
const REVISION = Object.freeze({
  status: "REQUIERE_REVISION", reasonCode: "ORPHANED_LEDGER_EVENT", amount: 5, direction: null,
  orderDisplay: "#999004", originalDate: "2026-08-19T15:03:38.721Z", channel: null,
  note: "Movimiento del libro económico sin ningún pedido correspondiente en ningún registro conocido.",
});

const FULL = Object.freeze({
  ok: true, generatedAt: "2026-09-02T12:00:00.000Z",
  porCobrar: [COBRAR_MESA], porDevolver: [DEVOLVER_MESA, DEVOLVER_NAMED], requiereRevision: [REVISION],
  counts: { porCobrar: 1, porDevolver: 2, requiereRevision: 1 },
  // CANONICAL totals — summed by the deployed backend from these same items.
  totals: { porCobrar: 50, porDevolver: 25 },
  scope: null, window: null,
});
const NOTHING = Object.freeze({
  ok: true, generatedAt: "2026-09-02T12:00:00.000Z",
  porCobrar: [], porDevolver: [], requiereRevision: [],
  counts: { porCobrar: 0, porDevolver: 0, requiereRevision: 0 },
  totals: { porCobrar: null, porDevolver: null },
  scope: null, window: null,
});
const snapshotStub = Object.freeze({
  ok: true,
  window: { preset: "hoy", from: "2026-09-02T02:00:00.000Z", to: "2026-09-03T02:00:00.000Z", businessDate: "2026-09-02", timezone: "Europe/Madrid", bounds: "[from,to)" },
  obligation: { gross: 0, unpaid: 0, voided: 0, refunded: 0 },
  receipts: { collected: 0, refunded: 0, byMethod: { efectivo: 0, tarjeta: 0, bizum: 0, other: 0 } },
  balance: { unpaid: 0, overCollected: 0 },
  counts: { obligations: 0 }, drillDown: { obligations: [] }, serviceProvenance: [],
});

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}
const byId = (c, id) => c.querySelector(`[data-testid="${id}"]`);
const allById = (c, id) => Array.from(c.querySelectorAll(`[data-testid="${id}"]`));

// React tracks the input value via a property setter — a bare `el.value = x`
// is invisible to it. Same idiom as EconomiaSnapshotPanel.test.js.
const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
async function typeInto(el, value) {
  await act(async () => {
    nativeInputSetter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function mount(Comp = EconomiaPendientes) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<Comp />); });
  await flush();
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

beforeEach(() => {
  economyApi.pendencies.mockResolvedValue(FULL);
  economyApi.snapshot.mockResolvedValue(snapshotStub);
  economyApi.listCashCounts.mockResolvedValue({ ok: true, counts: [], scope: null, window: null });
});

// ── B · POR_COBRAR ───────────────────────────────────────────────────────
test("B · a POR_COBRAR item renders in its own group with amount and Mesa identity", async () => {
  const { container, root } = await mount();
  const group = byId(container, "pendientes-group-cobrar");
  expect(group).toBeTruthy();
  const rows = allById(container, "pendientes-item-cobrar");
  expect(rows).toHaveLength(1);
  expect(rows[0].textContent).toContain("Mesa 999");
  expect(rows[0].textContent).toContain("#999001");
  expect(rows[0].textContent).toMatch(/50,00\s?€/);
  unmount(container, root);
});

// ── C · POR_DEVOLVER ─────────────────────────────────────────────────────
test("C · a POR_DEVOLVER Mesa item renders in its own group, distinct from cobrar", async () => {
  const { container, root } = await mount();
  const group = byId(container, "pendientes-group-devolver");
  expect(group).toBeTruthy();
  const rows = allById(container, "pendientes-item-devolver");
  expect(rows).toHaveLength(2);
  expect(rows[0].textContent).toContain("Mesa 6");
  expect(rows[0].textContent).toContain("#999034");
  expect(rows[0].textContent).toMatch(/10,00\s?€/);
  // never merged with the second devolver item
  expect(rows[1].textContent).toMatch(/15,00\s?€/);
});

// ── D · REQUIERE_REVISION ────────────────────────────────────────────────
test("D · REQUIERE_REVISION renders in its own group with mapped human copy; the raw reasonCode is never rendered", async () => {
  const { container, root } = await mount();
  const group = byId(container, "pendientes-group-revision");
  expect(group).toBeTruthy();
  const rows = allById(container, "pendientes-item-revision");
  expect(rows).toHaveLength(1);
  expect(rows[0].textContent).toContain("Movimiento económico sin pedido identificable.");
  expect(rows[0].textContent).toMatch(/5,00\s?€/);
  // the revision group is visually/semantically its own thing — not folded
  // into cobrar/devolver
  expect(byId(container, "pendientes-item-cobrar")).toBeTruthy();
  expect(group.contains(allById(container, "pendientes-item-cobrar")[0])).toBe(false);
  // raw backend vocabulary never reaches the DOM, anywhere in the view
  expect(container.textContent).not.toContain("ORPHANED_LEDGER_EVENT");
  expect(container.textContent).not.toMatch(/reasonCode|POR_DEVOLVER|POR_COBRAR/);
  // and the row carries no interactive control
  expect(rows[0].querySelector("button")).toBeNull();
  unmount(container, root);
});

// ── E · real customer name ───────────────────────────────────────────────
test("E · a real customer name is shown as the identity when present", async () => {
  const { container, root } = await mount();
  const rows = allById(container, "pendientes-item-devolver");
  // second devolver item is the non-Mesa named one
  expect(rows[1].textContent).toContain("Juan Pérez");
  expect(rows[1].textContent).toContain("Retiro");
  // its display number is not the primary identity line, but may still appear as metadata
  unmount(container, root);
});

// ── F · Mesa synthetic identity is never shown ───────────────────────────
test("F · a Mesa order never shows a name or a MESA- phone as customer identity", async () => {
  const { container, root } = await mount();
  const cobrar = allById(container, "pendientes-item-cobrar")[0];
  expect(cobrar.textContent).toContain("Mesa 999");
  expect(cobrar.textContent).not.toContain("MESA-DEADBEEF");
  // "Mesa 999" here is the table label, not the injected customer.name — the
  // whole component never prints the raw MESA- phone anywhere.
  expect(container.textContent).not.toMatch(/MESA-[0-9A-F]/i);
  unmount(container, root);
});

// ── G · display order number is metadata; orderUid stays internal ────────
test("G · the display #NNN is shown but the stable orderUid never reaches the DOM", async () => {
  const { container, root } = await mount();
  expect(container.textContent).toContain("#999001");
  expect(container.textContent).toContain("#999034");
  expect(container.textContent).not.toContain("uid-cobrar-999001");
  expect(container.textContent).not.toContain("uid-devolver-999034");
  unmount(container, root);
});

// ── H · stable identity keys rows; same #NNN, different uid = two rows ────
test("H · two exposures sharing a display number but not an orderUid render as two independent rows", async () => {
  economyApi.pendencies.mockResolvedValue({
    ok: true, generatedAt: "2026-09-02T12:00:00.000Z",
    porCobrar: [
      { ...COBRAR_MESA, orderUid: "uid-A", amount: 30, display: { orderNumber: "#500", tableNumber: 5, tableName: null, commandNumber: 1 }, customer: { name: null, phone: null } },
      { ...COBRAR_MESA, orderUid: "uid-B", amount: 40, display: { orderNumber: "#500", tableNumber: 5, tableName: null, commandNumber: 2 }, customer: { name: null, phone: null } },
    ],
    porDevolver: [], requiereRevision: [],
    counts: { porCobrar: 2, porDevolver: 0, requiereRevision: 0 },
  });
  const { container, root } = await mount();
  const rows = allById(container, "pendientes-item-cobrar");
  expect(rows).toHaveLength(2);
  expect(rows[0].textContent).toMatch(/30,00\s?€/);
  expect(rows[1].textContent).toMatch(/40,00\s?€/);
  unmount(container, root);
});

// ── I · items are never merged into one customer balance ─────────────────
test("I · multiple POR_DEVOLVER items stay separate — the group total is a sum, never a merge", async () => {
  const { container, root } = await mount();
  const rows = allById(container, "pendientes-item-devolver");
  expect(rows).toHaveLength(2);
  // presentation total = 10 + 15, computed from the returned items
  expect(byId(container, "pendientes-group-devolver").textContent).toMatch(/25,00\s?€/);
  expect(byId(container, "pendientes-summary-devolver").textContent).toMatch(/25,00\s?€/);
  unmount(container, root);
});

// ── J · no invented zero-balance item; empty group shows — not 0,00 € ────
test("J · an empty group shows an em dash in the summary, never a fabricated 0,00 €", async () => {
  economyApi.pendencies.mockResolvedValue(NOTHING);
  const { container, root } = await mount();
  expect(byId(container, "pendientes-summary-cobrar").textContent).toContain("—");
  expect(byId(container, "pendientes-summary-cobrar").textContent).not.toMatch(/0,00\s?€/);
  expect(byId(container, "pendientes-summary-devolver").textContent).toContain("—");
  unmount(container, root);
});

// ── K · empty states ────────────────────────────────────────────────────
test("K · per-group empty copy when one group is empty, global empty copy when all are", async () => {
  economyApi.pendencies.mockResolvedValue({
    ok: true, generatedAt: "2026-09-02T12:00:00.000Z",
    porCobrar: [COBRAR_MESA], porDevolver: [], requiereRevision: [],
    counts: { porCobrar: 1, porDevolver: 0, requiereRevision: 0 },
  });
  const one = await mount();
  expect(byId(one.container, "pendientes-group-devolver-empty").textContent).toBe("Nada pendiente de devolución.");
  expect(byId(one.container, "pendientes-group-revision-empty").textContent).toBe("Sin incidencias pendientes de revisión.");
  expect(byId(one.container, "pendientes-group-cobrar-empty")).toBeNull();
  expect(byId(one.container, "pendientes-empty")).toBeNull();
  unmount(one.container, one.root);

  economyApi.pendencies.mockResolvedValue(NOTHING);
  const none = await mount();
  // VISUAL CONSISTENCY PASS 1 — the marker survives (a consumer must still be
  // able to tell "nothing pending" apart from "not loaded"), but it no longer
  // carries a sentence: the three zero tiles directly above already say it,
  // and "No hay pendientes. Todo cuadra." was only restating them.
  expect(byId(none.container, "pendientes-empty")).toBeTruthy();
  expect(byId(none.container, "pendientes-empty").textContent).toBe("");
  expect(none.container.textContent).not.toMatch(/todo cuadra/i);
  expect(byId(none.container, "pendientes-group-cobrar")).toBeNull();
  unmount(none.container, none.root);
});

// ── L · loading state ───────────────────────────────────────────────────
test("L · while the reader is in flight, a local loading marker shows and no group renders", async () => {
  let release;
  economyApi.pendencies.mockImplementation(() => new Promise((r) => { release = r; }));
  const { container, root } = await mount();
  expect(byId(container, "pendientes-loading")).toBeTruthy();
  expect(byId(container, "pendientes-group-cobrar")).toBeNull();
  expect(byId(container, "pendientes-error")).toBeNull();
  await act(async () => { release(FULL); });
  await flush();
  expect(byId(container, "pendientes-loading")).toBeNull();
  expect(byId(container, "pendientes-group-cobrar")).toBeTruthy();
  unmount(container, root);
});

// ── M · error state, isolated + retryable ───────────────────────────────
test("M · a failed reader shows a safe message and a working Reintentar, no raw detail", async () => {
  economyApi.pendencies.mockRejectedValueOnce(new EconomyApiError("ECONOMY_READ_FORBIDDEN", 403));
  const { container, root } = await mount();
  const err = byId(container, "pendientes-error");
  expect(err).toBeTruthy();
  expect(err.textContent).toContain("Tu perfil no tiene acceso a la economía.");
  expect(err.textContent).not.toMatch(/SELECT|null|undefined|stack/i);
  expect(byId(container, "pendientes-group-cobrar")).toBeNull();
  // retry re-hits the reader; this time it succeeds
  economyApi.pendencies.mockResolvedValue(FULL);
  await act(async () => { byId(container, "pendientes-retry").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await flush();
  expect(byId(container, "pendientes-error")).toBeNull();
  expect(byId(container, "pendientes-group-cobrar")).toBeTruthy();
  unmount(container, root);
});

test("M2 · an unknown error code falls back to a generic operator-safe line", async () => {
  economyApi.pendencies.mockRejectedValue(new EconomyApiError("ECONOMY_SOMETHING_NEW", 500));
  const { container, root } = await mount();
  expect(byId(container, "pendientes-error").textContent).toContain("No se han podido cargar los pendientes.");
  unmount(container, root);
});

// ── N · no write action anywhere ────────────────────────────────────────
test("N · on the loaded view there is NO button at all — the only control is the search box", async () => {
  const { container, root } = await mount();
  expect(byId(container, "pendientes-group-cobrar")).toBeTruthy(); // loaded, not error/loading
  const buttons = Array.from(container.querySelectorAll("button"));
  expect(buttons).toHaveLength(0);
  expect(byId(container, "pendientes-search")).toBeTruthy();
  // and no action-shaped affordance smuggled in as a link or role=button
  const affordances = Array.from(container.querySelectorAll("a, [role='button']"));
  for (const el of affordances) {
    expect(el.textContent).not.toMatch(/cobrar|reembols|devolver|corregir|marcar|resolver|cerrar|finalizar|reabrir/i);
  }
  unmount(container, root);
});

test("N2 · the ONLY button that ever appears is Reintentar, and only on error", async () => {
  economyApi.pendencies.mockRejectedValue(new EconomyApiError("ECONOMY_READ_FORBIDDEN", 403));
  const { container, root } = await mount();
  const buttons = Array.from(container.querySelectorAll("button"));
  expect(buttons).toHaveLength(1);
  expect(buttons[0].getAttribute("data-testid")).toBe("pendientes-retry");
  unmount(container, root);
});

// ── O · search is wired to the backend q param (debounced) ──────────────
test("O · typing in the search box re-queries the reader with q after a short pause", async () => {
  jest.useFakeTimers();
  try {
    const { container, root } = await mount();
    expect(economyApi.pendencies).toHaveBeenCalledWith(expect.objectContaining({ q: undefined }));
    const input = byId(container, "pendientes-search");
    await typeInto(input, "juan");
    // not yet — the debounce has not elapsed
    expect(economyApi.pendencies).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(300); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(economyApi.pendencies).toHaveBeenCalledWith(expect.objectContaining({ q: "juan" }));
    unmount(container, root);
  } finally {
    jest.useRealTimers();
  }
});

// ── O2 · a slow earlier search never overwrites a newer one ─────────────
test("O2 · when an earlier search resolves after a newer one, the newer result stays on screen", async () => {
  jest.useFakeTimers();
  try {
    let resolveA;
    let resolveAb;
    economyApi.pendencies
      .mockResolvedValueOnce(NOTHING)                                        // mount, q=undefined
      .mockImplementationOnce(() => new Promise((r) => { resolveA = r; }))   // q="a"  (slow)
      .mockImplementationOnce(() => new Promise((r) => { resolveAb = r; })); // q="ab" (fast)

    const { container, root } = await mount();
    const input = byId(container, "pendientes-search");

    await typeInto(input, "a");
    await act(async () => { jest.advanceTimersByTime(300); });
    await act(async () => { await Promise.resolve(); });
    await typeInto(input, "ab");
    await act(async () => { jest.advanceTimersByTime(300); });
    await act(async () => { await Promise.resolve(); });

    const mk = (amount) => ({
      ok: true, generatedAt: "2026-09-02T12:00:00.000Z",
      porCobrar: [{ ...COBRAR_MESA, orderUid: `uid-${amount}`, amount, customer: { name: null, phone: null } }],
      porDevolver: [], requiereRevision: [],
      counts: { porCobrar: 1, porDevolver: 0, requiereRevision: 0 },
      totals: { porCobrar: amount, porDevolver: null }, scope: null, window: null,
    });

    // newer ("ab") resolves first…
    await act(async () => { resolveAb(mk(40)); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(byId(container, "pendientes-summary-cobrar").textContent).toMatch(/40,00\s?€/);

    // …then the stale ("a") resolves — it must NOT clobber the screen
    await act(async () => { resolveA(mk(99)); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(byId(container, "pendientes-summary-cobrar").textContent).toMatch(/40,00\s?€/);
    expect(byId(container, "pendientes-summary-cobrar").textContent).not.toMatch(/99,00\s?€/);

    unmount(container, root);
  } finally {
    jest.useRealTimers();
  }
});

// ── P · narrow rendering — identity and amount coexist in one row ───────
test("P · each item keeps identity and amount together (no wide table split)", async () => {
  const { container, root } = await mount();
  const row = allById(container, "pendientes-item-cobrar")[0];
  // amount and identity are both inside the single row element
  expect(row.textContent).toContain("Mesa 999");
  expect(row.textContent).toMatch(/50,00\s?€/);
  // the row is a flex container (structural, not pixel)
  expect(row.getAttribute("style") || "").toMatch(/display:\s*flex/);
  unmount(container, root);
});

// ── T · the API adapter uses the existing transport, not a second one ───
test("T · economyApi.pendencies goes through the shared request helper, no bespoke fetch", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "economy", "economyApi.js"), "utf8");
  expect(src).toMatch(/pendencies\s*\(\s*\{[^}]*\}\s*=\s*\{\}\s*\)\s*\{[\s\S]*?request\("GET",\s*`\/pendencies/);
  const hook = fs.readFileSync(path.join(__dirname, "..", "..", "economy", "useEconomyPendencies.js"), "utf8");
  expect(hook).not.toMatch(/\bfetch\s*\(/);
  expect(hook).toMatch(/from '\.\/economyApi'/);
});

// ═══════════════════════════════════════════════════════════════════════════
// GENERAL — Pendientes is NO LONGER a view here; it is its own destination.
// General only READS totals.porCobrar for the selected scope, and links out.
// ═══════════════════════════════════════════════════════════════════════════
describe("General · Pendientes left the internal tabs", () => {
  const clickTestId = async (c, id) => {
    await act(async () => { byId(c, id).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await flush();
  };

  test("the internal selector is exactly Resumen / Ventas — no Pendientes segment", async () => {
    const { container, root } = await mount(EconomiaGeneral);
    const tabs = Array.from(container.querySelectorAll('[data-testid^="general-view-"]'))
      .filter((el) => el.getAttribute("role") === "tab");
    expect(tabs.map((el) => el.textContent.trim())).toEqual(["Resumen", "Ventas"]);
    expect(byId(container, "general-view-pendientes")).toBeNull();
    expect(byId(container, "general-view-panel-pendientes")).toBeNull();
    unmount(container, root);
  });

  test("the period scope card is always visible (both Resumen and Ventas are period-scoped)", async () => {
    const { container, root } = await mount(EconomiaGeneral);
    expect(byId(container, "general-scope")).toBeTruthy();
    await clickTestId(container, "general-view-ventas");
    expect(byId(container, "general-scope")).toBeTruthy();
    unmount(container, root);
  });

  test("PENDIENTE is sourced from a scoped Pendencias read (totals.porCobrar), not obligation.unpaid", async () => {
    economyApi.snapshot.mockResolvedValue({ ...snapshotStub, obligation: { gross: 500, unpaid: 500, voided: 0, refunded: 0 } });
    economyApi.pendencies.mockResolvedValue({
      ...NOTHING,
      counts: { porCobrar: 1, porDevolver: 0, requiereRevision: 0 },
      totals: { porCobrar: 20, porDevolver: null },
    });
    const { container, root } = await mount(EconomiaGeneral);
    expect(byId(container, "general-kpi-pendiente").textContent).toMatch(/20,00\s?€/);
    // The scoped read went out with the canonical preset, no client window math.
    expect(economyApi.pendencies).toHaveBeenCalledWith(expect.objectContaining({ preset: "hoy" }));
    unmount(container, root);
  });

  test("clicking PENDIENTE calls onNavigateToPendientes with the canonical scope params", async () => {
    economyApi.pendencies.mockResolvedValue({
      ...NOTHING, counts: { porCobrar: 1, porDevolver: 0, requiereRevision: 0 }, totals: { porCobrar: 20, porDevolver: null },
    });
    const onNav = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<EconomiaGeneral onNavigateToPendientes={onNav} />); });
    await flush();
    await clickTestId(container, "general-kpi-pendiente");
    expect(onNav).toHaveBeenCalledWith(expect.objectContaining({ preset: "hoy" }));
    act(() => { root.unmount(); }); container.remove();
  });
});
