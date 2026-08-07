import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

const ListosArchivados = require("./ListosArchivados").default;

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

function render(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<ListosArchivados {...props} />); });
  return { container, root };
}

const servedSalaRow = {
  table: { number: 6 },
  command: { id: "c1", commandNumber: 2, items: [{ n: "El Pelusa", classicName: "Margherita Classica" }] },
};
// language-guard: allow-legacy existing backend field/enum (tipo_consegna/RITIRO), not new vocabulary
const recogidaOrder = { id: "r1", nombre: "Juan", tipo_consegna: "RITIRO", numero: 12, items: [{ n: "Marinara" }] };
// language-guard: allow-legacy existing backend field name (tipo_consegna), not new vocabulary
const deliveryOrder = { id: "d1", nombre: "Maria", tipo_consegna: "DOMICILIO", numero: 13, items: [{ n: "Diavola" }] };

test("closed by default, shows total count", () => {
  const { container, root } = render({ retiradosTakeaway: [recogidaOrder, deliveryOrder], servedSala: [servedSalaRow] });
  expect(container.textContent).toContain("Archivados");
  expect(container.textContent).toContain("3");
  expect(container.textContent).not.toContain("Juan");
  expect(container.textContent).not.toContain("Margherita Classica");
  act(() => { root.unmount(); });
  container.remove();
});

test("opens on click and distinguishes Sala / Recogida / Delivery", () => {
  const { container, root } = render({ retiradosTakeaway: [recogidaOrder, deliveryOrder], servedSala: [servedSalaRow] });
  const btn = container.querySelector("button");
  click(btn);
  expect(container.textContent).toContain("Sala (1)");
  expect(container.textContent).toContain("Recogida (1)");
  expect(container.textContent).toContain("Delivery (1)");
  expect(container.textContent).toContain("Margherita Classica");
  expect(container.textContent).toContain("Juan");
  expect(container.textContent).toContain("Maria");
  act(() => { root.unmount(); });
  container.remove();
});

test("zero archived items renders a count of 0, no crash", () => {
  const { container, root } = render({ retiradosTakeaway: [], servedSala: [] });
  expect(container.textContent).toContain("Archivados");
  expect(container.textContent).toContain("0");
  act(() => { root.unmount(); });
  container.remove();
});
