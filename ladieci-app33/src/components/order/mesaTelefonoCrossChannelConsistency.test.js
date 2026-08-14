// CANONICAL_MANUAL_PICKER_SLICE_2 — CROSS-CHANNEL CONSISTENCY TEST.
//
// Mounts Mesa's MesaOrderBuilder and Teléfono's ItemPickerModal separately,
// drives each through an EQUIVALENT configuration sequence (same product,
// same extra, same removal, same note -- then separately, a beverage, then
// a custom pizza), and asserts the resulting draft-line truth is the same
// regardless of which channel it came from. This is the empirical proof
// that "Mesa and Teléfono show the same item truth" -- not just an
// architectural claim because both happen to import the same primitives.
import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../mesa/mesaApi", () => ({
  __esModule: true,
  createMesaRequestId: jest.fn(() => "mesa_test_request"),
}));

const MesaOrderBuilder = require("../mesa/MesaOrderBuilder").default;
const ItemPickerModal = require("../ItemPickerModal").default;

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}
function typeInto(input, value) {
  const proto = input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  act(() => {
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
function byTestId(container, id) { return container.querySelector(`[data-testid="${id}"]`); }
function allByTestId(container, id) { return Array.from(container.querySelectorAll(`[data-testid="${id}"]`)); }
function buttonByText(container, text) {
  return Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim().startsWith(text));
}
function productCard(container, name) {
  return allByTestId(container, "catalog-product-card").find((el) => el.textContent.toLowerCase().includes(name.toLowerCase()));
}

async function mountMesa() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<MesaOrderBuilder target={{ sessionId: "s1", tableNumber: 3, coversTotal: 2 }} draft={null} onClose={() => {}} onConfirm={() => {}} />);
  });
  await flush();
  return { container, root };
}
async function mountTelefono() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ItemPickerModal visible onClose={() => {}} onAdd={() => {}} onUpdate={() => {}} itemEsistente={null} />);
  });
  await flush();
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

// Normalize away channel-specific chrome (quantity prefix formatting is
// identical -- showQuantityPrefix is used by both -- but strip whitespace
// noise for a robust comparison).
function normalizedLineText(container) {
  const line = byTestId(container, "draft-summary-line");
  return line.textContent.replace(/\s+/g, " ").trim();
}

test("same configured pizza (product + extra + removal + note) reads identically on Mesa and Teléfono", async () => {
  const mesa = await mountMesa();
  click(productCard(mesa.container, "El Pelusa"));
  await flush();
  click(byTestId(mesa.container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(mesa.container, "draft-summary-edit"));
  await flush();
  click(allByTestId(mesa.container, "configurator-extra-chip")[0]);
  await flush();
  click(allByTestId(mesa.container, "remove-ingredient-chip")[0]);
  await flush();
  typeInto(byTestId(mesa.container, "configurator-note-input"), "poco hecha");
  click(byTestId(mesa.container, "configurator-done"));
  await flush();
  click(byTestId(mesa.container, "mesa-ver-comanda"));
  await flush();
  const mesaLine = normalizedLineText(mesa.container);
  unmount(mesa.container, mesa.root);

  const tel = await mountTelefono();
  click(productCard(tel.container, "El Pelusa"));
  await flush();
  click(byTestId(tel.container, "ip-ver-pedido"));
  await flush();
  click(byTestId(tel.container, "draft-summary-edit"));
  await flush();
  click(allByTestId(tel.container, "configurator-extra-chip")[0]);
  await flush();
  click(allByTestId(tel.container, "remove-ingredient-chip")[0]);
  await flush();
  typeInto(byTestId(tel.container, "configurator-note-input"), "poco hecha");
  click(byTestId(tel.container, "configurator-done"));
  await flush();
  click(byTestId(tel.container, "ip-ver-pedido"));
  await flush();
  const telLine = normalizedLineText(tel.container);
  unmount(tel.container, tel.root);

  // Strip the leading "1× " quantity prefix (identical on both, irrelevant
  // to the comparison) and compare the configured-item truth itself.
  expect(mesaLine).toBe(telLine);
  expect(mesaLine).toContain("El Pelusa / Margherita Classica");
  expect(mesaLine).toContain("Albahaca fresca");
  expect(mesaLine).toContain("Sin: Tomate San Marzano");
  expect(mesaLine).toContain("Nota: poco hecha");
});

test("same beverage reads identically on Mesa and Teléfono -- no casing drift between channels", async () => {
  const mesa = await mountMesa();
  click(buttonByText(mesa.container, "Bebidas"));
  await flush();
  click(productCard(mesa.container, "Estrella Galicia"));
  await flush();
  click(byTestId(mesa.container, "mesa-ver-comanda"));
  await flush();
  const mesaLine = normalizedLineText(mesa.container);
  unmount(mesa.container, mesa.root);

  const tel = await mountTelefono();
  click(buttonByText(tel.container, "Bebidas"));
  await flush();
  click(productCard(tel.container, "Estrella Galicia"));
  await flush();
  click(byTestId(tel.container, "ip-ver-pedido"));
  await flush();
  const telLine = normalizedLineText(tel.container);
  unmount(tel.container, tel.root);

  expect(mesaLine).toBe(telLine);
});

test("same custom pizza (same ingredients) reads identically on Mesa and Teléfono", async () => {
  const addCustom = async (container) => {
    click(buttonByText(container, "⭐ Custom"));
    await flush();
    const ingredientButtons = Array.from(container.querySelectorAll("button")).filter((b) => b.textContent.includes("+0.50"));
    click(ingredientButtons[0]);
    await flush();
    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Añadir esta pizza")));
    await flush();
  };

  const mesa = await mountMesa();
  await addCustom(mesa.container);
  click(byTestId(mesa.container, "mesa-ver-comanda"));
  await flush();
  const mesaLine = normalizedLineText(mesa.container);
  unmount(mesa.container, mesa.root);

  const tel = await mountTelefono();
  await addCustom(tel.container);
  click(byTestId(tel.container, "ip-ver-pedido"));
  await flush();
  const telLine = normalizedLineText(tel.container);
  unmount(tel.container, tel.root);

  expect(mesaLine).toBe(telLine);
  expect(mesaLine).toContain("Pizza a tu gusto");
});
