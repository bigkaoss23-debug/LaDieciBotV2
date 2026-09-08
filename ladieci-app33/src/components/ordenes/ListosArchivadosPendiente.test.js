// UNIFIED_CASH_UI_SURFACE_V1 — BLOCCO 4. Archivados surfaces "Pendiente" for an
// archived order the backend /pendencies reader flagged — and ONLY then. No
// unpaid / overCollected / direction math in React.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ListosArchivados from "./ListosArchivados";

global.IS_REACT_ACT_ENVIRONMENT = true;

const UID_OWES = "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa";
const UID_CLEAN = "cccccccc-3333-4ccc-8ccc-cccccccccccc";
const UID_REFUNDABLE_BUT_SETTLED = "dddddddd-4444-4ddd-8ddd-dddddddddddd";

// language-guard: allow-legacy tipo_consegna/RITIRO/DOMICILIO are the existing order-type field name and enum values used verbatim in these fixtures, not new vocabulary
const recogidaOwes = { id: "r-owes", order_uid: UID_OWES, nombre: "Ana", tipo_consegna: "RITIRO", numero: 21, items: [{ n: "Marinara" }] };
// language-guard: allow-legacy tipo_consegna/RITIRO/DOMICILIO are the existing order-type field name and enum values used verbatim in these fixtures, not new vocabulary
const recogidaClean = { id: "r-clean", order_uid: UID_CLEAN, nombre: "Beto", tipo_consegna: "RITIRO", numero: 22, items: [{ n: "Diavola" }] };
// language-guard: allow-legacy tipo_consegna/RITIRO/DOMICILIO are the existing order-type field name and enum values used verbatim in these fixtures, not new vocabulary
const deliveryRefundable = { id: "d-ref", order_uid: UID_REFUNDABLE_BUT_SETTLED, nombre: "Cira", tipo_consegna: "DOMICILIO", numero: 23, items: [{ n: "Capricciosa" }] };

// Backend already decided membership. A settled-but-refundable order is simply
// NOT a key here — the test proves the component trusts that, not re-derives it.
const pendingByOrderUid = new Map([
  [UID_OWES, { direction: "POR_COBRAR", amount: 12.5 }],
]);

function render(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<ListosArchivados {...props} />));
  const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  return { container, root, click, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

describe("ListosArchivados — Pendiente from /pendencies only", () => {
  test("collapsed header shows '· N Pendiente' when some archived rows have an exposure", () => {
    const v = render({ retiradosTakeaway: [recogidaOwes, recogidaClean, deliveryRefundable], servedSala: [], onOpenCash: () => {}, pendingByOrderUid });
    expect(v.container.querySelector('[data-testid="archivados-pendiente-count"]').textContent).toBe("1 Pendiente");
    v.unmount();
  });

  test("no header Pendiente chip when nothing is flagged", () => {
    const v = render({ retiradosTakeaway: [recogidaClean, deliveryRefundable], servedSala: [], onOpenCash: () => {}, pendingByOrderUid });
    expect(v.container.querySelector('[data-testid="archivados-pendiente-count"]')).toBeNull();
    v.unmount();
  });

  test("expanded: the flagged row shows a Pendiente chip with the canonical amount from the payload", () => {
    const v = render({ retiradosTakeaway: [recogidaOwes, recogidaClean], servedSala: [], onOpenCash: () => {}, pendingByOrderUid });
    v.click(v.container.querySelector("button")); // expand
    const chips = [...v.container.querySelectorAll('[data-testid="archivados-pendiente"]')];
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toContain("Pendiente");
    expect(chips[0].textContent).toContain("12.50€");
    v.unmount();
  });

  test("a clean archived order stays neutral — no chip", () => {
    const v = render({ retiradosTakeaway: [recogidaClean], servedSala: [], onOpenCash: () => {}, pendingByOrderUid });
    v.click(v.container.querySelector("button"));
    expect(v.container.querySelector('[data-testid="archivados-pendiente"]')).toBeNull();
    v.unmount();
  });

  test("settled-but-still-refundable order is NOT Pendiente (backend excluded it; component does not second-guess)", () => {
    const v = render({ retiradosTakeaway: [deliveryRefundable], servedSala: [], onOpenCash: () => {}, pendingByOrderUid });
    v.click(v.container.querySelector("button"));
    expect(v.container.querySelector('[data-testid="archivados-pendiente"]')).toBeNull();
    v.unmount();
  });

  test("Abrir en caja is unchanged and still present next to the chip", () => {
    const seen = [];
    const v = render({ retiradosTakeaway: [recogidaOwes], servedSala: [], onOpenCash: (o, opts) => seen.push([o.id, opts]), pendingByOrderUid });
    v.click(v.container.querySelector("button")); // expand
    const cajaBtn = v.container.querySelector('[data-testid="archivados-abrir-caja"]');
    expect(cajaBtn).not.toBeNull();
    v.click(cajaBtn);
    expect(seen).toEqual([["r-owes", { allowDelivery: false }]]);
    v.unmount();
  });

  test("no pendingByOrderUid prop at all -> renders exactly as before (no crash, no chips)", () => {
    const v = render({ retiradosTakeaway: [recogidaOwes, recogidaClean], servedSala: [] });
    expect(v.container.querySelector('[data-testid="archivados-pendiente-count"]')).toBeNull();
    v.click(v.container.querySelector("button"));
    expect(v.container.querySelector('[data-testid="archivados-pendiente"]')).toBeNull();
    v.unmount();
  });
});
