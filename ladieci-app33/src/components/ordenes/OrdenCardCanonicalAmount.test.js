// UNIFIED_CASH_UI_SURFACE_V1 — BLOCCO 2. OrdenCard shows the canonical current
// obligation (backend-projected `financial`) so a list card and the cash panel
// agree after a commercial adjustment; `calcTotale` is no longer the read
// authority for a persisted order.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import OrdenCard from "./OrdenCard";

global.IS_REACT_ACT_ENVIRONMENT = true;

const base = {
  id: "DB-901",
  nombre: "Cliente",
  canal: "MANUAL",
  estado: "RETIRADO",
  // language-guard: allow-legacy tipo_consegna/RITIRO/DOMICILIO are the existing order-type field name and enum values used verbatim in these fixtures, not new vocabulary
  tipo_consegna: "RITIRO",
  items: [{ n: "Margherita", q: 1, p: 30 }],
};

function mount(o) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <OrdenCard o={o} onModifica={jest.fn()} onElimina={jest.fn()} onConfirm={jest.fn()} onOpenTicket={jest.fn()} vipIds={new Set()} />,
  ));
  return { text: () => container.textContent, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

describe("OrdenCard canonical amount", () => {
  test("adjusted order: shows financial.currentObligation (22), NOT the legacy totale (30)", () => {
    const v = mount({ ...base, totale: 30, financial: { orderUid: "u1", originalObligation: 30, currentObligation: 22, commercialAdjustment: -8 } });
    expect(v.text()).toContain("22.00€");
    expect(v.text()).not.toContain("30.00€");
    v.unmount();
  });

  test("un-adjusted order: currentObligation == totale, one number shown", () => {
    const v = mount({ ...base, totale: 18, financial: { orderUid: "u2", originalObligation: 18, currentObligation: 18, commercialAdjustment: 0 } });
    expect(v.text()).toContain("18.00€");
    v.unmount();
  });

  test("no financial block (legacy response): falls back to stored totale, no crash", () => {
    const v = mount({ ...base, totale: 27 });
    expect(v.text()).toContain("27.00€");
    v.unmount();
  });

  test("fully-comped order: currentObligation 0 wins over legacy totale 30", () => {
    const v = mount({ ...base, totale: 30, financial: { orderUid: "u3", originalObligation: 30, currentObligation: 0, commercialAdjustment: -30 } });
    expect(v.text()).toContain("0.00€");
    v.unmount();
  });
});
