// UNIFIED_CASH_UI_SURFACE_V1 — BLOCCO 2 + correction. TabListos ready-list rows
// (persisted: LISTO here, so the RETIRADO-only RESUMEN footer — an untouched
// separate debt — does not render) show the canonical current obligation,
// never an items-sum reconstruction, and fail closed ("—") when no figure is
// available.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ORDER_STATES } from "../../core/orders";

global.IS_REACT_ACT_ENVIRONMENT = true;

const TabListos = require("./TabListos").default;

async function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<TabListos {...props} />); });
  return { container, text: () => container.textContent, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

const rowBase = {
  id: "#999050", nombre: "Cliente", tel: "600000000", canal: "TEL", hora: "20:30",
  // language-guard: allow-legacy tipo_consegna/RITIRO are the existing backend order field/value, used verbatim by every other TabListos fixture, not new vocabulary
  estado: ORDER_STATES.LISTO, tipo_consegna: "RITIRO", ya_pagado: true, metodo_pago: "efectivo",
  items: [{ n: "Margherita", q: 3, p: 10 }], // sums to 30
};

describe("TabListos ready-list canonical amount", () => {
  test("adjusted order: shows financial.currentObligation (22), not legacy 30, not items 30", async () => {
    const v = await mount({ ordenes: [{ ...rowBase, totale: 30, financial: { orderUid: "u1", originalObligation: 30, currentObligation: 22, commercialAdjustment: -8 } }] });
    expect(v.text()).toContain("22.00€");
    expect(v.text()).not.toContain("30.00€");
    v.unmount();
  });

  test("fully comped: financial.currentObligation 0 -> 0.00€ (not 30)", async () => {
    const v = await mount({ ordenes: [{ ...rowBase, totale: 30, financial: { orderUid: "u2", originalObligation: 30, currentObligation: 0, commercialAdjustment: -30 } }] });
    expect(v.text()).toContain("0.00€");
    expect(v.text()).not.toContain("30.00€");
    v.unmount();
  });

  test("no financial: legacy totale 27 -> 27.00€", async () => {
    const v = await mount({ ordenes: [{ ...rowBase, totale: 27 }] });
    expect(v.text()).toContain("27.00€");
    v.unmount();
  });

  test("no financial and no valid totale -> fails closed with —, never the 30 items sum", async () => {
    const v = await mount({ ordenes: [{ ...rowBase, totale: null }] });
    expect(v.text()).toContain("—");
    expect(v.text()).not.toContain("30.00€");
    v.unmount();
  });
});
