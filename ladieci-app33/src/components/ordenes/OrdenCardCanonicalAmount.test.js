// UNIFIED_CASH_UI_SURFACE_V1 — BLOCCO 2 + correction. OrdenCard shows the
// canonical current obligation for a persisted order; it NEVER reconstructs the
// price from items for one, and fails closed ("—") when no figure is available.
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
  items: [{ n: "Margherita", q: 3, p: 10 }], // sums to 30
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

describe("OrdenCard canonical amount (persisted order)", () => {
  test("1: financial.currentObligation 22 -> shows 22, not the legacy 30", () => {
    const v = mount({ ...base, totale: 30, financial: { orderUid: "u1", originalObligation: 30, currentObligation: 22, commercialAdjustment: -8 } });
    expect(v.text()).toContain("22.00€");
    expect(v.text()).not.toContain("30.00€");
    v.unmount();
  });

  test("2: financial.currentObligation 0 -> shows 0.00€ (not legacy 30, not an items sum)", () => {
    const v = mount({ ...base, totale: 30, financial: { orderUid: "u2", originalObligation: 30, currentObligation: 0, commercialAdjustment: -30 } });
    expect(v.text()).toContain("0.00€");
    expect(v.text()).not.toContain("30.00€");
    v.unmount();
  });

  test("3: no financial, totale 30 -> shows 30.00€ (declared legacy fallback)", () => {
    const v = mount({ ...base, totale: 30 });
    expect(v.text()).toContain("30.00€");
    v.unmount();
  });

  test("4: no financial, totale 0 -> shows 0.00€ (stored zero honoured; NOT the 30 items sum)", () => {
    const v = mount({ ...base, totale: 0 });
    expect(v.text()).toContain("0.00€");
    v.unmount();
  });

  test("5: persisted, no financial and no valid totale -> fails closed with — (no calcTotale, no items sum)", () => {
    const v = mount({ ...base, totale: null });
    expect(v.text()).toContain("—");
    expect(v.text()).not.toContain("30.00€"); // would be the items reconstruction
    v.unmount();
  });

  test("6: items sum to 30 but financial.currentObligation 10 -> card shows 10", () => {
    const v = mount({ ...base, totale: 30, financial: { orderUid: "u6", originalObligation: 30, currentObligation: 10, commercialAdjustment: -20 } });
    expect(v.text()).toContain("10.00€");
    expect(v.text()).not.toContain("30.00€");
    v.unmount();
  });

  test("7: a NOT-yet-persisted order (optimistic _temp, no id) still previews via calcTotale", () => {
    const v = mount({ ...base, id: undefined, _temp: true, totale: undefined, financial: undefined });
    // 3 x 10 = 30, and a pickup order has no delivery fee -> 30.00
    expect(v.text()).toContain("30.00€");
    v.unmount();
  });
});
