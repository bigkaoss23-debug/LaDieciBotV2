// EconomiaControlCaja — the READ-ONLY cash-count evidence inside General.
//
// Compact by default: a label, the record count, and a status glyph. It
// expands to the exact persisted rows. NO write control. The `⚠ N` count is
// "N rows with a non-zero STORED variance" — never recomputed, and a later
// clean count never hides an earlier discrepancy.

import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../economy/economyApi", () => ({
  __esModule: true,
  EconomyApiError: class EconomyApiError extends Error {
    constructor(code, status = 0) { super(code); this.name = "EconomyApiError"; this.code = code; this.status = status; }
  },
  economyApi: { listCashCounts: jest.fn() },
}));

const EconomiaControlCaja = require("./EconomiaControlCaja").default;
const { economyApi } = require("../../economy/economyApi");

const row = (over) => ({
  id: `r${Math.random()}`, countedAt: "2026-09-05T13:35:00.000Z", actor: "laura",
  countedCash: 65, recordedCashReceipts: 65, variance: 0, note: null, ...over,
});

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
const byId = (c, id) => c.querySelector(`[data-testid="${id}"]`);
const allById = (c, id) => Array.from(c.querySelectorAll(`[data-testid="${id}"]`));

async function mount(scope) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<EconomiaControlCaja scope={scope} />); });
  await flush();
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

beforeEach(() => {
  jest.clearAllMocks();
  economyApi.listCashCounts.mockResolvedValue({ ok: true, counts: [], scope: null, window: null });
});

test("zero records → CONTROL CAJA 0, and no explanatory paragraph", async () => {
  const { container, root } = await mount({ preset: "hoy" });
  expect(byId(container, "control-caja-count").textContent).toBe("0");
  expect(byId(container, "control-caja-ok")).toBeNull();
  expect(byId(container, "control-caja-warn")).toBeNull();
  const txt = byId(container, "general-control-caja").textContent;
  expect(txt).not.toMatch(/sin conteos|no se han registrado|no hay datos|todo está/i);
  unmount(container, root);
});

test("one clean record → count 1 with the ✓ mark", async () => {
  economyApi.listCashCounts.mockResolvedValue({ ok: true, counts: [row({ variance: 0 })] });
  const { container, root } = await mount({ preset: "hoy" });
  expect(byId(container, "control-caja-count").textContent).toBe("1");
  expect(byId(container, "control-caja-ok")).toBeTruthy();
  expect(byId(container, "control-caja-warn")).toBeNull();
  unmount(container, root);
});

test("multiple clean records → count reflects all, still ✓", async () => {
  economyApi.listCashCounts.mockResolvedValue({ ok: true, counts: [row({ variance: 0 }), row({ variance: 0 }), row({ variance: 0 })] });
  const { container, root } = await mount({ preset: "ayer" });
  expect(byId(container, "control-caja-count").textContent).toBe("3");
  expect(byId(container, "control-caja-ok")).toBeTruthy();
  unmount(container, root);
});

test("an earlier discrepancy + a later clean count → CONTROL CAJA 2 ⚠ 1 (the later one never hides it)", async () => {
  economyApi.listCashCounts.mockResolvedValue({ ok: true, counts: [
    row({ countedAt: "2026-09-05T11:00:00Z", variance: -7.5 }),
    row({ countedAt: "2026-09-05T16:00:00Z", variance: 0 }),
  ] });
  const { container, root } = await mount({ preset: "hoy" });
  expect(byId(container, "control-caja-count").textContent).toBe("2");
  expect(byId(container, "control-caja-warn").textContent.trim()).toMatch(/1$/);
  expect(byId(container, "control-caja-ok")).toBeNull();
  unmount(container, root);
});

test("the stored variance is used — not recomputed from registered − counted", async () => {
  // registered 65, counted 65 would recompute to 0, but the STORED variance
  // says -7.50. The row must be treated as a discrepancy.
  economyApi.listCashCounts.mockResolvedValue({ ok: true, counts: [row({ recordedCashReceipts: 65, countedCash: 65, variance: -7.5 })] });
  const { container, root } = await mount({ preset: "hoy" });
  expect(byId(container, "control-caja-warn")).toBeTruthy();
  unmount(container, root);
});

test("expanding shows the exact persisted rows; note only when present; no write controls", async () => {
  economyApi.listCashCounts.mockResolvedValue({ ok: true, counts: [
    row({ actor: "laura", recordedCashReceipts: 65, countedCash: 65, variance: 0, note: null }),
    row({ actor: "mario", recordedCashReceipts: 100, countedCash: 92.5, variance: -7.5, note: "faltan monedas" }),
  ] });
  const { container, root } = await mount({ preset: "hoy" });
  await act(async () => { byId(container, "control-caja-toggle").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const rows = allById(container, "control-caja-row");
  expect(rows).toHaveLength(2);
  expect(rows[0].textContent).toMatch(/laura/);
  expect(rows[0].textContent).toMatch(/registrado 65,00\s?€/);
  expect(rows[0].textContent).toMatch(/contado 65,00\s?€/);
  expect(rows[1].textContent).toMatch(/faltan monedas/);
  expect(rows[0].textContent).not.toMatch(/faltan monedas/);
  // read-only: no edit/delete/register controls
  const buttons = Array.from(container.querySelectorAll("button")).map((b) => b.textContent.toLowerCase());
  expect(buttons.some((t) => /registrar conteo|editar|borrar|eliminar/.test(t))).toBe(false);
  unmount(container, root);
});

test("Servicio scope sends the EXACT serviceSessionId, never a from/to time range", async () => {
  await mount({ preset: "servicio", serviceSessionId: "svc-123" });
  expect(economyApi.listCashCounts).toHaveBeenCalledWith(expect.objectContaining({ preset: "servicio", serviceSessionId: "svc-123" }));
  const arg = economyApi.listCashCounts.mock.calls[0][0];
  expect(arg.from).toBeUndefined();
  expect(arg.to).toBeUndefined();
});

test("hoy / ayer / personalizado send the canonical preset, no client window math", async () => {
  await mount({ preset: "hoy" });
  expect(economyApi.listCashCounts).toHaveBeenLastCalledWith(expect.objectContaining({ preset: "hoy" }));
  jest.clearAllMocks();
  economyApi.listCashCounts.mockResolvedValue({ ok: true, counts: [] });
  await mount({ preset: "personalizado", from: "2026-09-01T10:00:00.000Z", to: "2026-09-01T14:00:00.000Z" });
  expect(economyApi.listCashCounts).toHaveBeenLastCalledWith(expect.objectContaining({
    preset: "personalizado", from: "2026-09-01T10:00:00.000Z", to: "2026-09-01T14:00:00.000Z",
  }));
});
