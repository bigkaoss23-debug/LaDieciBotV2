import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import TicketQuickAction, { isTicketQuickActionOrderValid } from "./TicketQuickAction";
import OperationalSuccessSplash from "./OperationalSuccessSplash";

global.IS_REACT_ACT_ENVIRONMENT = true;

const validOrder = { id: "2042", items: [{ n: "Prosciutto e funghi", q: 1 }] };

function mount(node) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("TicketQuickAction", () => {
  afterEach(() => jest.useRealTimers());

  test("requires a persisted id, a non-temporary order and a valid item", () => {
    expect(isTicketQuickActionOrderValid(validOrder)).toBe(true);
    expect(isTicketQuickActionOrderValid({ ...validOrder, id: " " })).toBe(false);
    expect(isTicketQuickActionOrderValid({ ...validOrder, _temp: true })).toBe(false);
    expect(isTicketQuickActionOrderValid({ ...validOrder, items: [{ n: "", q: 1 }] })).toBe(false);
    expect(isTicketQuickActionOrderValid({ ...validOrder, items: "not-json" })).toBe(false);
    expect(isTicketQuickActionOrderValid({ ...validOrder, items: JSON.stringify(validOrder.items) })).toBe(true);
  });

  test("renders no action for an invalid order", () => {
    const view = mount(<TicketQuickAction order={{ id: "x", items: [] }} onOpenTicket={jest.fn()} />);
    expect(view.container.querySelector("button")).toBeNull();
    view.unmount();
  });

  test("stops propagation and synchronously guards a double click", () => {
    jest.useFakeTimers();
    const onOpenTicket = jest.fn();
    const parentClick = jest.fn();
    const view = mount(
      <div onClick={parentClick}>
        <TicketQuickAction order={validOrder} onOpenTicket={onOpenTicket} />
      </div>
    );
    const button = view.container.querySelector("button");
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(onOpenTicket).toHaveBeenCalledTimes(1);
    expect(onOpenTicket).toHaveBeenCalledWith(validOrder);
    expect(parentClick).not.toHaveBeenCalled();
    expect(button.disabled).toBe(true);
    act(() => jest.advanceTimersByTime(600));
    expect(button.disabled).toBe(false);
    view.unmount();
  });
});

describe("OperationalSuccessSplash", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test("uses a status portal, has no buttons, and auto-completes once", () => {
    const onComplete = jest.fn();
    const view = mount(
      <OperationalSuccessSplash
        title="¡Pedido confirmado!"
        subtitle="Listo para cocina."
        duration={900}
        onComplete={onComplete}
      />
    );
    const status = document.body.querySelector('[role="status"]');
    expect(status).toBeTruthy();
    expect(status.textContent).toContain("¡Pedido confirmado!");
    expect(status.textContent).toContain("Listo para cocina.");
    expect(status.querySelector("button")).toBeNull();
    act(() => jest.advanceTimersByTime(900));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('[role="status"]')).toBeNull();
    view.unmount();
  });

  test("cleans its timer on unmount", () => {
    const onComplete = jest.fn();
    const view = mount(<OperationalSuccessSplash title="OK" duration={900} onComplete={onComplete} />);
    view.unmount();
    act(() => jest.advanceTimersByTime(900));
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("a concurrent splash replaces the previous one without false completion", () => {
    const firstDone = jest.fn();
    const secondDone = jest.fn();
    const first = mount(<OperationalSuccessSplash title="First" duration={900} onComplete={firstDone} />);
    const second = mount(<OperationalSuccessSplash title="Second" duration={900} onComplete={secondDone} />);
    expect(document.body.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(document.body.querySelector('[role="status"]').textContent).toContain("Second");
    act(() => jest.advanceTimersByTime(900));
    expect(firstDone).not.toHaveBeenCalled();
    expect(secondDone).toHaveBeenCalledTimes(1);
    first.unmount();
    second.unmount();
  });
});
