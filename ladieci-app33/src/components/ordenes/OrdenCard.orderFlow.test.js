import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import OrdenCard from "./OrdenCard";

global.IS_REACT_ACT_ENVIRONMENT = true;

const base = {
  id: "DB-200",
  client_req_id: "request-200",
  nombre: "Cliente",
  canal: "MANUAL",
  estado: "POR_CONFIRMAR",
  tipo_consegna: "RITIRO",
  items: [{ n: "Margherita", q: 1, p: 10 }],
};

const mount = props => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<OrdenCard
    o={base}
    onModifica={jest.fn()}
    onElimina={jest.fn()}
    onConfirm={jest.fn()}
    onOpenTicket={jest.fn()}
    vipIds={new Set()}
    {...props}
  />));
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
};

describe("OrdenCard async order flow", () => {
  test("pending creation is readable but exposes no operational action", () => {
    const onModifica = jest.fn();
    const view = mount({
      o: { ...base, id: undefined, _temp: true, _localPhase: "saving" },
      onModifica,
    });
    expect(view.container.textContent).toContain("Guardando pedido…");
    expect(view.container.textContent).toContain("Margherita");
    expect(view.container.textContent).not.toContain("Ticket");
    expect(view.container.textContent).not.toContain("A Cocina");
    expect(view.container.textContent).not.toContain("Editar");
    expect(view.container.textContent).not.toContain("Eliminar");
    act(() => view.container.firstChild.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onModifica).not.toHaveBeenCalled();
    view.unmount();
  });

  test("persisted card restores Ticket and A Cocina", () => {
    const view = mount();
    expect(view.container.textContent).toContain("Ticket");
    expect(view.container.textContent).toContain("A Cocina");
    view.unmount();
  });

  test("A Cocina pending keeps the card visible and disables its transition button", () => {
    const view = mount({ loadingIds: new Set([base.id]) });
    expect(view.container.textContent).toContain("Cliente");
    const button = [...view.container.querySelectorAll("button")]
      .find(node => node.textContent.includes("Enviando a cocina…"));
    expect(button).toBeTruthy();
    expect(button.disabled).toBe(true);
    view.unmount();
  });
});
