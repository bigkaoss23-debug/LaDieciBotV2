import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import fs from "fs";
import path from "path";
import TicketQuickAction, { isTicketQuickActionOrderValid } from "./TicketQuickAction";
import OperationalSuccessSplash, { OPERATIONAL_SUCCESS_DURATION_MS } from "./OperationalSuccessSplash";

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

  test("pending uses a status portal, has no buttons, and never auto-completes", () => {
    const onComplete = jest.fn();
    const view = mount(
      <OperationalSuccessSplash
        phase="pending"
        title="Confirmando pedido…"
        onComplete={onComplete}
      />
    );
    const status = document.body.querySelector('[role="status"]');
    expect(status).toBeTruthy();
    expect(status.textContent).toContain("Confirmando pedido…");
    expect(status.textContent).not.toContain("✓");
    expect(status.querySelector("button")).toBeNull();
    act(() => jest.advanceTimersByTime(5000));
    expect(onComplete).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="status"]')).toBeTruthy();
    view.unmount();
  });

  test("success stays visible at 450 ms and completes once at 500 ms", () => {
    const onComplete = jest.fn();
    const view = mount(
      <OperationalSuccessSplash
        phase="success"
        title="¡Pedido confirmado!"
        subtitle="Listo para cocina."
        duration={OPERATIONAL_SUCCESS_DURATION_MS}
        onComplete={onComplete}
      />
    );
    const status = document.body.querySelector('[role="status"]');
    expect(status).toBeTruthy();
    expect(status.textContent).toContain("¡Pedido confirmado!");
    expect(status.textContent).toContain("Listo para cocina.");
    expect(status.querySelector("button")).toBeNull();
    act(() => jest.advanceTimersByTime(450));
    expect(onComplete).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="status"]')).toBeTruthy();
    act(() => jest.advanceTimersByTime(50));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('[role="status"]')).toBeNull();
    act(() => jest.advanceTimersByTime(50));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('[role="status"]')).toBeNull();
    view.unmount();
  });

  test("cleans its timer on unmount", () => {
    const onComplete = jest.fn();
    const view = mount(<OperationalSuccessSplash title="OK" onComplete={onComplete} />);
    view.unmount();
    act(() => jest.advanceTimersByTime(OPERATIONAL_SUCCESS_DURATION_MS + 50));
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("a concurrent splash replaces the previous one without false completion", () => {
    const firstDone = jest.fn();
    const secondDone = jest.fn();
    const first = mount(<OperationalSuccessSplash title="First" onComplete={firstDone} />);
    const second = mount(<OperationalSuccessSplash title="Second" onComplete={secondDone} />);
    expect(document.body.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(document.body.querySelector('[role="status"]').textContent).toContain("Second");
    act(() => jest.advanceTimersByTime(OPERATIONAL_SUCCESS_DURATION_MS));
    expect(firstDone).not.toHaveBeenCalled();
    expect(secondDone).toHaveBeenCalledTimes(1);
    first.unmount();
    second.unmount();
  });

  test("parent rerenders and callback identity changes do not restart the timer", () => {
    const firstDone = jest.fn();
    const latestDone = jest.fn();
    const view = mount(<OperationalSuccessSplash title="Stable" onComplete={firstDone} />);

    act(() => jest.advanceTimersByTime(300));
    act(() => view.root.render(<OperationalSuccessSplash title="Stable" onComplete={latestDone} />));
    act(() => jest.advanceTimersByTime(150));
    expect(document.body.querySelector('[role="status"]')).toBeTruthy();
    act(() => jest.advanceTimersByTime(50));

    expect(firstDone).not.toHaveBeenCalled();
    expect(latestDone).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('[role="status"]')).toBeNull();
    view.unmount();
  });

  test("reduced-motion CSS disables every splash animation", () => {
    const css = fs.readFileSync(path.join(__dirname, "OperationalSuccessSplash.css"), "utf8");
    const media = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(media).toContain(".operational-success-splash");
    expect(media).toContain(".operational-success-splash__card");
    expect(media).toContain("animation: none");
  });
});
