// TabListosCashWiring.test.js — CHECK-CENTRIC UNIVERSAL CASH V1. Direct DOM
// test (raw ReactDOM + act(), no @testing-library in this repo), filling the
// pre-existing gap the audit found: "zero comportamental tests su TabListos /
// setRetirado (solo test statici di wiring)". Proves the ONE thing that
// changed here: the inline "¿Cómo paga?" popup is gone, the unpaid-order
// button opens the shared cash surface instead of calling onRetirado
// directly, the already-paid fast path is UNCHANGED, and terminal cards gain
// "Abrir en caja" without touching estado.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ORDER_STATES } from "../../core/orders";

global.IS_REACT_ACT_ENVIRONMENT = true;

const TabListos = require("./TabListos").default;

function click(el) { act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }
const byTestId = (c, id) => c.querySelector(`[data-testid="${id}"]`);
const findButtonByText = (c, text) =>
  Array.from(c.querySelectorAll("button")).find((b) => b.textContent.includes(text));

async function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<TabListos {...props} />); });
  return { container, root };
}
function unmount(container, root) {
  act(() => { root.unmount(); });
  container.remove();
}

const UNPAID_ORDER = {
  id: "#999040", nombre: "Cliente Uno", tel: "600000000", canal: "TEL", hora: "20:30",
  // language-guard: allow-legacy tipo_consegna/RITIRO are the existing backend order field/value, used verbatim by every other TabListos fixture, not new vocabulary
  estado: ORDER_STATES.LISTO, totale: 25, tipo_consegna: "RITIRO", items: [], ya_pagado: false,
};
const PAID_ORDER = { ...UNPAID_ORDER, id: "#999041", ya_pagado: true, metodo_pago: "efectivo" };
const RETIRADO_ORDER = { ...UNPAID_ORDER, id: "#999042", estado: ORDER_STATES.RETIRADO, ya_pagado: true, metodo_pago: "tarjeta" };

test("an unpaid order's Retirado button opens the cash surface (onOpenCash), never calls onRetirado directly", async () => {
  const onOpenCash = jest.fn();
  const onRetirado = jest.fn();
  const { container, root } = await mount({ ordenes: [UNPAID_ORDER], onRetirado, onOpenCash });
  const btn = findButtonByText(container, "Retirado");
  expect(btn).toBeTruthy();
  click(btn);
  expect(onOpenCash).toHaveBeenCalledTimes(1);
  expect(onOpenCash.mock.calls[0][0].id).toBe("#999040");
  expect(onRetirado).not.toHaveBeenCalled();
  unmount(container, root);
});

test("an already-paid order's Retirado button calls onRetirado directly (unchanged fast path, no cash surface)", async () => {
  const onOpenCash = jest.fn();
  const onRetirado = jest.fn();
  const { container, root } = await mount({ ordenes: [PAID_ORDER], onRetirado, onOpenCash });
  const btn = findButtonByText(container, "Retirado");
  expect(btn).toBeTruthy();
  click(btn);
  expect(onRetirado).toHaveBeenCalledWith("#999041", "efectivo", undefined);
  expect(onOpenCash).not.toHaveBeenCalled();
  unmount(container, root);
});

test("a terminal (RETIRADO) card shows 'Abrir en caja' and opens the cash surface with allowDelivery:false, never touching estado", async () => {
  const onOpenCash = jest.fn();
  const onRetirado = jest.fn();
  const { container, root } = await mount({ ordenes: [RETIRADO_ORDER], onRetirado, onOpenCash });
  const btn = findButtonByText(container, "Abrir en caja");
  expect(btn).toBeTruthy();
  click(btn);
  expect(onOpenCash).toHaveBeenCalledWith(expect.objectContaining({ id: "#999042" }), { allowDelivery: false });
  expect(onRetirado).not.toHaveBeenCalled();
  unmount(container, root);
});

test("without onOpenCash, a terminal card renders no 'Abrir en caja' button (backward compatible)", async () => {
  const { container, root } = await mount({ ordenes: [RETIRADO_ORDER], onRetirado: jest.fn() });
  expect(findButtonByText(container, "Abrir en caja")).toBeFalsy();
  unmount(container, root);
});

test("the inline payment popup's state/component are gone from the source (retired, not just hidden)", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "TabListos.jsx"), "utf8");
  expect(src).not.toContain("DescuentoInput");
  expect(src).not.toContain("pendingPago");
  expect(src).not.toContain("finalizar(metodo)");
});
