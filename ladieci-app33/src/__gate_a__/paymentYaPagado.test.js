/**
 * [PAYMENT-IDEMPOTENCY 2026-09-23] "Ya pagado" in Nuevo Pedido: i metodi sono
 * ESATTAMENTE efectivo | tarjeta | bizum (Bizum mancava nel torture test), mai "manual".
 * Render reale di NuevoPedidoModal con api mockata, come entregaModalRedesign.test.js.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../api", () => ({
  api: {
    previewDeliveryV1: jest.fn().mockResolvedValue({ ok: true, deadline_min: 55, hora_preview: null, giro_suggestion: null }),
    resolveAddress: jest.fn().mockResolvedValue(null),
    getClientes: jest.fn().mockResolvedValue([]),
    getClientePorTel: jest.fn().mockResolvedValue(null),
    upsertCliente: jest.fn().mockResolvedValue(null),
    previewOrderTiming: jest.fn().mockResolvedValue(null),
  },
  auth: { getToken: () => "t", isAuthenticated: () => true },
}));
jest.mock("../components/ItemPickerModal", () => (props) =>
  props.visible ? <button data-testid="stub-add" onClick={() => props.onAdd({ id: "p1", n: "Margherita", p: 9, q: 1 })}>add</button> : null);

import NuevoPedidoModal from "../components/NuevoPedidoModal";

let container = null, root = null, onConfirm = null;
const flush = async (ms = 0) => act(async () => {
  if (ms) jest.advanceTimersByTime(ms);
  for (let i = 0; i < 6; i++) await Promise.resolve();
});
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await flush(); };
const btn = (txt) => [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === txt || b.textContent.includes(txt));
const methodButtons = () => [...container.querySelectorAll("button")]
  .map((b) => b.textContent.trim())
  .filter((t) => ["💵 Efectivo", "💳 Tarjeta", "📱 Bizum"].includes(t) || /manual/i.test(t));

async function mountModal() {
  onConfirm = jest.fn();
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<NuevoPedidoModal visible onClose={() => {}} onConfirm={onConfirm} ordenes={[]} prefill={{ nombre: "ZZTEST Pago" }} />);
  });
  await flush(1000);
}
async function addPizza() {
  const addBtn = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Añadir") && !b.textContent.includes("dirección"));
  await click(addBtn);
  await click(container.querySelector('[data-testid="stub-add"]'));
}
const confirmBtn = () => [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Confirmar pedido"));

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(Date.parse("2026-09-23T17:50:00.000Z"));
  jest.spyOn(window, "confirm").mockReturnValue(true);
  jest.spyOn(window, "alert").mockImplementation(() => {});
});
afterEach(() => {
  if (root) { act(() => root.unmount()); root = null; }
  if (container) { container.remove(); container = null; }
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("Ya pagado offre esattamente Efectivo · Tarjeta · Bizum (niente manual)", async () => {
  await mountModal();
  expect(methodButtons()).toEqual([]);            // chiuso: nessun picker
  await click(btn("Ya pagado"));
  expect(methodButtons()).toEqual(["💵 Efectivo", "💳 Tarjeta", "📱 Bizum"]);
});

test("Ya pagado senza metodo scelto: conferma bloccata", async () => {
  await mountModal();
  await addPizza();
  expect(confirmBtn().disabled).toBe(false);
  await click(btn("Ya pagado"));
  expect(confirmBtn().disabled).toBe(true);
});

test.each([["💵 Efectivo", "efectivo"], ["💳 Tarjeta", "tarjeta"], ["📱 Bizum", "bizum"]])(
  "Ya pagado %s → payload ya_pagado=true, metodo_pago=%s", async (label, metodo) => {
    await mountModal();
    await addPizza();
    await click(btn("Ya pagado"));
    await click(btn(label));
    expect(confirmBtn().disabled).toBe(false);
    await click(confirmBtn());
    await flush();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const payload = onConfirm.mock.calls[0][0];
    expect(payload.ya_pagado).toBe(true);
    expect(payload.metodo_pago).toBe(metodo);
  });

test("ordine NON pagato: nessun metodo nel payload", async () => {
  await mountModal();
  await addPizza();
  await click(confirmBtn());
  await flush();
  const payload = onConfirm.mock.calls[0][0];
  expect(payload.ya_pagado).toBe(false);
  expect(payload.metodo_pago).toBe("");
});
