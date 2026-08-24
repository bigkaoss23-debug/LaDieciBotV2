import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

const ItemPickerModal = require("./ItemPickerModal").default;

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
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
function byTestId(container, id) { return container.querySelector(`[data-testid="${id}"]`); }
function allByTestId(container, id) { return Array.from(container.querySelectorAll(`[data-testid="${id}"]`)); }
function buttonByText(container, text) {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent.trim().startsWith(text));
}
function productCard(container, name) {
  return allByTestId(container, "catalog-product-card").find((el) => el.textContent.toLowerCase().includes(name.toLowerCase()));
}

async function mount(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onClose = props.onClose || jest.fn();
  const onAdd = props.onAdd || jest.fn();
  const onUpdate = props.onUpdate || jest.fn();
  await act(async () => {
    root.render(<ItemPickerModal visible={props.visible !== false} onClose={onClose} onAdd={onAdd} onUpdate={onUpdate} itemEsistente={props.itemEsistente || null} />);
  });
  await flush();
  return { container, root, onClose, onAdd, onUpdate };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

// ── Create mode: proves parity with Mesa's own picker (same primitives) ──

test("renders nothing when not visible", async () => {
  const { container, root } = await mount({ visible: false });
  expect(container.textContent).toBe("");
  unmount(container, root);
});

test("opens straight to the canonical catalogue -- no covers step (that's Mesa-only, correctly stayed out of the picker)", async () => {
  const { container, root } = await mount();
  expect(container.textContent).toContain("Añadir al pedido");
  expect(container.textContent).toContain("Pizzas");
  expect(productCard(container, "El Pelusa")).toBeTruthy();
  unmount(container, root);
});

test("tapping a product accumulates in the cart; Ver pedido opens the same DraftSummary drawer Mesa uses", async () => {
  const { container, root } = await mount();
  click(productCard(container, "El Pelusa"));
  await flush();
  // CANONICAL_MANUAL_PICKER_FINAL_CORRECTION (Goal 6) -- the footer is now
  // the shared CartBar; "N item(s) seleccionados" was replaced by its own
  // "N artículo(s)" wording.
  expect(container.textContent).toContain("1 artículo");
  click(byTestId(container, "ip-ver-pedido"));
  await flush();
  expect(byTestId(container, "draft-summary-line")).toBeTruthy();
  expect(container.textContent).toContain("El Pelusa");
  unmount(container, root);
});

test("Añadir emits one onAdd per line (buildEmittedItem-shaped) and closes once", async () => {
  const onAdd = jest.fn();
  const onClose = jest.fn();
  const { container, root } = await mount({ onAdd, onClose });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "ip-ver-pedido"));
  await flush();
  click(byTestId(container, "draft-summary-primary-action"));
  await flush();
  expect(onAdd).toHaveBeenCalledTimes(1);
  const item = onAdd.mock.calls[0][0];
  expect(item.fantasyName).toBe("El Pelusa");
  expect(item.classicName).toBe("Margherita Classica");
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

test("extras + removed ingredient + note reach the emitted item, same shape as Mesa's", async () => {
  const onAdd = jest.fn();
  const { container, root } = await mount({ onAdd });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "ip-ver-pedido"));
  await flush();
  click(byTestId(container, "draft-summary-edit"));
  await flush();
  click(allByTestId(container, "configurator-extra-chip")[0]);
  await flush();
  click(allByTestId(container, "remove-ingredient-chip")[0]);
  await flush();
  typeInto(byTestId(container, "configurator-note-input"), "poco hecha");
  click(byTestId(container, "configurator-done"));
  await flush();
  click(byTestId(container, "ip-ver-pedido"));
  await flush();
  click(byTestId(container, "draft-summary-primary-action"));
  await flush();
  const item = onAdd.mock.calls[0][0];
  expect(item.extras.length).toBe(1);
  expect(item.removedIngredients.length).toBe(1);
  expect(item.notes).toBe("poco hecha");
  unmount(container, root);
});

// Deliberate, documented behavior change (see file header comment in
// ItemPickerModal.jsx): a custom pizza no longer auto-closes the modal --
// it accumulates like any other product, reviewed via the same drawer.
test("custom pizza accumulates in the cart instead of auto-closing the modal", async () => {
  const onAdd = jest.fn();
  const onClose = jest.fn();
  const { container, root } = await mount({ onAdd, onClose });
  click(buttonByText(container, "Custom"));
  await flush();
  click(allByTestId(container, "custom-ingredient-chip")[0]);
  await flush();
  click(byTestId(container, "custom-add-cta"));
  await flush();
  // Modal stays open -- onAdd/onClose not yet called.
  expect(onAdd).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  // GOAL 14 -- adding a configured Custom pizza opens the cart automatically,
  // no extra manual "Ver pedido" tap needed.
  expect(byTestId(container, "draft-summary-line")).toBeTruthy();
  expect(container.textContent).toContain("Pizza a tu gusto");
  click(byTestId(container, "draft-summary-primary-action"));
  await flush();
  expect(onAdd).toHaveBeenCalledTimes(1);
  expect(onAdd.mock.calls[0][0].id).toMatch(/^custom_/);
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

test("beverage/non-pizza cards render uppercase, matching Mesa's -- eliminates the original casing drift", async () => {
  const { container, root } = await mount();
  click(buttonByText(container, "Bebidas"));
  await flush();
  const card = productCard(container, "Estrella Galicia");
  expect(card.textContent).toContain("ESTRELLA GALICIA");
  unmount(container, root);
});

// ── Modifica mode: editing an already-placed line from NuevoPedidoModal's pencil ──

test("modifica mode on a configurable (pizza) item auto-opens the configurator, Listo saves and closes", async () => {
  const onUpdate = jest.fn();
  const onClose = jest.fn();
  const item = {
    id: 1, n: "El Pelusa", q: 1, cat: "Pizzas", p: 12,
    classicName: "Margherita Classica", fantasyName: "El Pelusa", baseUnitPrice: 12,
    extras: [], notes: "", removedIngredients: [], _uid: "existing-uid",
  };
  const { container, root } = await mount({ itemEsistente: item, onUpdate, onClose });
  expect(byTestId(container, "item-configurator")).toBeTruthy();
  click(allByTestId(container, "configurator-extra-chip")[0]);
  await flush();
  click(byTestId(container, "configurator-done"));
  await flush();
  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate.mock.calls[0][0].extras.length).toBe(1);
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

test("modifica mode on a non-configurable (beverage) item shows a single-line summary with a plain note field, no qty controls", async () => {
  const item = {
    id: 20, n: "Coca Cola", q: 2, cat: "Bebidas", p: 3,
    classicName: "0,33L", fantasyName: "Coca Cola", baseUnitPrice: 3,
    extras: [], notes: "", removedIngredients: [], _uid: "existing-uid-2",
  };
  const { container, root } = await mount({ itemEsistente: item });
  expect(byTestId(container, "item-configurator")).toBeNull();
  expect(byTestId(container, "draft-summary-line")).toBeTruthy();
  expect(byTestId(container, "draft-summary-minus")).toBeNull();
  expect(byTestId(container, "draft-summary-qty-readonly").textContent).toBe("× 2");
  expect(container.textContent).toContain("Actualizar");
  unmount(container, root);
});

test("modifica mode: Actualizar on a non-configurable item calls onUpdate with the plain note", async () => {
  const onUpdate = jest.fn();
  const item = {
    id: 20, n: "Coca Cola", q: 1, cat: "Bebidas", p: 3,
    classicName: "0,33L", fantasyName: "Coca Cola", baseUnitPrice: 3,
    extras: [], notes: "", removedIngredients: [], _uid: "existing-uid-3",
  };
  const { container, root } = await mount({ itemEsistente: item, onUpdate });
  typeInto(byTestId(container, "draft-summary-plain-note"), "bien fría");
  click(byTestId(container, "draft-summary-primary-action"));
  await flush();
  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate.mock.calls[0][0].notes).toBe("bien fría");
  unmount(container, root);
});

// ── GOAL 10 -- main picker ✕ destructive confirmation (Teléfono) ──────────
test("main picker ✕ with an EMPTY draft closes directly -- no confirmation", async () => {
  const { container, root, onClose } = await mount();
  click(byTestId(container, "ip-picker-close"));
  await flush();
  expect(byTestId(container, "confirm-discard-dialog")).toBeFalsy();
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

test("main picker ✕ with a NON-EMPTY draft shows the confirmation; Cancelar preserves the draft", async () => {
  const { container, root, onClose } = await mount();
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "ip-picker-close"));
  await flush();
  expect(onClose).not.toHaveBeenCalled();
  expect(byTestId(container, "confirm-discard-dialog")).toBeTruthy();
  click(byTestId(container, "confirm-discard-cancel"));
  await flush();
  expect(onClose).not.toHaveBeenCalled();
  click(byTestId(container, "ip-ver-pedido"));
  await flush();
  expect(byTestId(container, "draft-summary-line")).toBeTruthy();
  unmount(container, root);
});

test("Eliminar on the confirmation actually discards and closes", async () => {
  const { container, root, onClose } = await mount();
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "ip-picker-close"));
  await flush();
  click(byTestId(container, "confirm-discard-eliminar"));
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

// ── GOAL 16 -- the "Base Pelusa" bug, fixed at its actual root cause ───────
// The defect: ItemPickerModal.handleConfirm used to run EVERY cart item
// (customs included) through buildEmittedItem, which unconditionally
// re-derives extras/notes by parsing `sub` as "+Extra, note" tokens. A
// custom pizza's `sub` is generated description text ("Base Pelusa +
// Albahaca fresca, Orégano"), not that shape, so it landed entirely in
// `notes` -- surfacing as "⚠ Base Pelusa + Albahaca fresca, Orégano" on the
// outer Nuevo Pedido summary (which reads normalizeOrderLine(item).note).
// This proves the item actually handed to onAdd carries the real
// structured truth instead.
test("a custom pizza's emitted item carries NO bogus note -- the 'Base Pelusa' misparse is fixed", async () => {
  const onAdd = jest.fn();
  const { container, root } = await mount({ onAdd });
  click(buttonByText(container, "Custom"));
  await flush();
  click(allByTestId(container, "custom-ingredient-chip")[0]);
  await flush();
  click(byTestId(container, "custom-add-cta"));
  await flush();
  click(byTestId(container, "ip-ver-pedido"));
  await flush();
  click(byTestId(container, "draft-summary-primary-action"));
  await flush();
  const item = onAdd.mock.calls[0][0];
  expect(item.notes).toBe("");
  expect(item.custom).toBe(true);
  expect(item.extras.length).toBe(1);
  expect(item.customBase).toBeTruthy();
  unmount(container, root);
});
