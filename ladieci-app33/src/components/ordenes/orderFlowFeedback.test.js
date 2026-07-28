import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import OrdenCard from "./OrdenCard";
import { ORDER_STATES } from "../../core/orders";

global.IS_REACT_ACT_ENVIRONMENT = true;

const persisted = {
  id: "#725",
  nombre: "Cliente QA",
  canal: "MANUAL",
  estado: ORDER_STATES.POR_CONFIRMAR,
  items: [{ n: "El Divino Codino", q: 1, p: 12.5 }],
  totale: 12.5,
  _temp: false,
};

const mount = (order, props = {}) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <OrdenCard
      o={order}
      onModifica={jest.fn()}
      onConfirm={jest.fn()}
      vipIds={new Set()}
      {...props}
    />
  ));
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
};

describe("OrdenCard order-flow feedback", () => {
  test("a persisted POR_CONFIRMAR card has no saving hourglass and exposes A Cocina", () => {
    const view = mount(persisted);
    expect(view.container.textContent).not.toContain("Guardando pedido…");
    expect(view.container.textContent).not.toContain("⏳");
    expect(view.container.textContent).toContain("Listo para cocina");
    const action = [...view.container.querySelectorAll("button")]
      .find(button => button.textContent.includes("A Cocina"));
    expect(action).toBeTruthy();
    expect(action.disabled).toBe(false);
    view.unmount();
  });

  test("A Cocina pending remains on the card, disables the action and shows local progress", () => {
    const onConfirm = jest.fn();
    const view = mount(persisted, {
      onConfirm,
      loadingIds: new Set([persisted.id]),
    });
    expect(view.container.textContent).toContain("Cliente QA");
    const action = [...view.container.querySelectorAll("button")]
      .find(button => button.textContent.includes("Enviando a cocina…"));
    expect(action).toBeTruthy();
    expect(action.disabled).toBe(true);
    act(() => action.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onConfirm).not.toHaveBeenCalled();
    view.unmount();
  });

  test("a local saving card has no Ticket or A Cocina action", () => {
    const view = mount({
      ...persisted,
      id: undefined,
      _temp: true,
      _localPhase: "saving",
    }, { onOpenTicket: jest.fn() });
    expect(view.container.textContent).toContain("Guardando pedido…");
    expect(view.container.textContent).not.toContain("A Cocina");
    expect(view.container.textContent).not.toContain("Ticket");
    view.unmount();
  });
});
