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
// FAST-FOLLOW fixtures. `ya_pagado` is the ONLY thing TabListos branches on
// (see the `o.ya_pagado ?` ternary), so these three cover every settlement
// state the ready list can present:
//   - PAID_ORDER            legacy-paid: settled, carries a legacy method
//   - CANONICALLY_PAID_ORDER created with ya_pagado, settled through the
//     canonical writer, so it carries NO legacy metodo_pago mirror at all
//   - PARTIALLY_PAID_ORDER   money taken but the check is NOT settled
const CANONICALLY_PAID_ORDER = { ...UNPAID_ORDER, id: "#999043", ya_pagado: true, order_uid: "uid-999043" };
const PARTIALLY_PAID_ORDER = { ...UNPAID_ORDER, id: "#999044", ya_pagado: false, order_uid: "uid-999044" };

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

test("an already-paid order's Retirado button calls onRetirado as a lifecycle-only transition (no metodo_pago, no cash surface)", async () => {
  // FAST-FOLLOW -- an already-paid order used to resend its own metodo_pago,
  // which the backend read as a NEW collection attempt and rejected with a
  // 409 (AUTH_BASIS_EXISTS) for canonically-paid orders, blocking Retirado
  // entirely. The fix: send no metodo_pago at all, so the transition is
  // lifecycle-only and the order's existing payment stands untouched.
  const onOpenCash = jest.fn();
  const onRetirado = jest.fn();
  const { container, root } = await mount({ ordenes: [PAID_ORDER], onRetirado, onOpenCash });
  const btn = findButtonByText(container, "Retirado");
  expect(btn).toBeTruthy();
  click(btn);
  expect(onRetirado).toHaveBeenCalledTimes(1);
  const call = onRetirado.mock.calls[0];
  expect(call[0]).toBe("#999041");
  expect(call[1]).toBeUndefined();
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

// ── FAST-FOLLOW: the canonical creation-time scenario ─────────────────────
// An order created with ya_pagado is settled by the CANONICAL writer, so the
// legacy payment evidence the old code resent does not even exist on it. This
// is the case that failed hardest: resending `o.metodo_pago` (undefined here)
// or, worse, any real method made the backend attempt a second collection
// against an order whose canonical evidence already exists — AUTH_BASIS_EXISTS,
// 409, order stuck in LISTO forever.
test("a canonically-paid order (created ya_pagado, no legacy method) hands over lifecycle-only", async () => {
  const onOpenCash = jest.fn();
  const onRetirado = jest.fn();
  const { container, root } = await mount({ ordenes: [CANONICALLY_PAID_ORDER], onRetirado, onOpenCash });
  const btn = findButtonByText(container, "Retirado");
  expect(btn).toBeTruthy();
  click(btn);

  expect(onRetirado).toHaveBeenCalledTimes(1);
  const [id, metodo, descuento] = onRetirado.mock.calls[0];
  expect(id).toBe("#999043");
  // No payment intent whatsoever: not a method, not a discount.
  expect(metodo).toBeUndefined();
  expect(descuento).toBeUndefined();
  // And no second collection is offered or attempted.
  expect(onOpenCash).not.toHaveBeenCalled();
  unmount(container, root);
});

test("the already-paid handover never forwards the order's own stored method", async () => {
  // The precise defect: the button used to pass `o.metodo_pago`. A settled
  // order carrying "efectivo" therefore sent a REAL collection method, which
  // is exactly what flips `collecting` to true server-side.
  const onRetirado = jest.fn();
  const { container, root } = await mount({ ordenes: [PAID_ORDER], onRetirado, onOpenCash: jest.fn() });
  click(findButtonByText(container, "Retirado"));

  expect(onRetirado.mock.calls[0]).not.toContain("efectivo");
  expect(onRetirado.mock.calls[0].slice(1).every((a) => a === undefined)).toBe(true);
  unmount(container, root);
});

// ── FAST-FOLLOW non-regression: partial settlement ────────────────────────
test("a partially-paid order still opens the cash surface, never a direct handover", async () => {
  // Not settled -> ya_pagado is false -> it must take the SAME path as an
  // unpaid order. The fast-follow must not widen the "already paid" fast path
  // to anything that has merely taken some money.
  const onOpenCash = jest.fn();
  const onRetirado = jest.fn();
  const { container, root } = await mount({ ordenes: [PARTIALLY_PAID_ORDER], onRetirado, onOpenCash });
  click(findButtonByText(container, "Retirado"));

  expect(onOpenCash).toHaveBeenCalledTimes(1);
  expect(onOpenCash.mock.calls[0][0].id).toBe("#999044");
  expect(onRetirado).not.toHaveBeenCalled();
  unmount(container, root);
});

test("the ready list never passes a stored payment method into the handover callback", () => {
  // Source-level backstop for the whole class of defect: if anyone reinstates
  // `handleRetirado(o, o.metodo_pago)` on the settled-order button, this fails.
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "TabListos.jsx"), "utf8");
  expect(src).not.toContain("handleRetirado(o, o.metodo_pago)");
  expect(src).toContain("handleRetirado(o)");
});
