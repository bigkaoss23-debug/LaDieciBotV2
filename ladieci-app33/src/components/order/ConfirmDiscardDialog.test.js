import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

const ConfirmDiscardDialog = require("./ConfirmDiscardDialog").default;

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}
function byTestId(container, id) { return container.querySelector(`[data-testid="${id}"]`); }

function mount(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const defaults = { onCancel: jest.fn(), onDiscard: jest.fn() };
  const finalProps = { ...defaults, ...props };
  act(() => { root.render(<ConfirmDiscardDialog {...finalProps} />); });
  return { container, root, props: finalProps };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

test("shows the Spanish copy", () => {
  const { container, root } = mount();
  expect(container.textContent).toContain("¿Eliminar este pedido?");
  expect(container.textContent).toContain("Se perderán los artículos añadidos.");
  unmount(container, root);
});

test("Cancelar calls onCancel, not onDiscard", () => {
  const onCancel = jest.fn();
  const onDiscard = jest.fn();
  const { container, root } = mount({ onCancel, onDiscard });
  click(byTestId(container, "confirm-discard-cancel"));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onDiscard).not.toHaveBeenCalled();
  unmount(container, root);
});

test("Eliminar calls onDiscard, not onCancel", () => {
  const onCancel = jest.fn();
  const onDiscard = jest.fn();
  const { container, root } = mount({ onCancel, onDiscard });
  click(byTestId(container, "confirm-discard-eliminar"));
  expect(onDiscard).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();
  unmount(container, root);
});

test("tapping the backdrop behaves like Cancelar (dismiss only, never discards)", () => {
  const onCancel = jest.fn();
  const onDiscard = jest.fn();
  const { container, root } = mount({ onCancel, onDiscard });
  click(byTestId(container, "confirm-discard-dialog"));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onDiscard).not.toHaveBeenCalled();
  unmount(container, root);
});

test("clicking inside the dialog panel itself does not trigger onCancel", () => {
  const onCancel = jest.fn();
  const { container, root } = mount({ onCancel });
  const panel = byTestId(container, "confirm-discard-dialog").firstElementChild;
  click(panel);
  expect(onCancel).not.toHaveBeenCalled();
  unmount(container, root);
});
