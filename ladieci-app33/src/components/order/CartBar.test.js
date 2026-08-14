import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

const CartBar = require("./CartBar").default;

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}
function byTestId(container, id) { return container.querySelector(`[data-testid="${id}"]`); }

function mount(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const defaults = { totalQty: 0, totalCart: 0, actionLabel: "Ver comanda", onOpen: jest.fn() };
  const finalProps = { ...defaults, ...props };
  act(() => { root.render(<CartBar {...finalProps} />); });
  return { container, root, props: finalProps };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

test("empty cart shows the hint, is disabled, and hides count/total/action", () => {
  const { container, root } = mount({ totalQty: 0, totalCart: 0 });
  const btn = byTestId(container, "cart-bar-open");
  expect(btn.disabled).toBe(true);
  expect(container.textContent).toContain("Selecciona productos");
  expect(byTestId(container, "cart-bar-count")).toBeNull();
  expect(byTestId(container, "cart-bar-total")).toBeNull();
  unmount(container, root);
});

test("non-empty cart shows item count, total and the action label; button enabled", () => {
  const { container, root } = mount({ totalQty: 4, totalCart: 27.5, actionLabel: "Ver comanda" });
  const btn = byTestId(container, "cart-bar-open");
  expect(btn.disabled).toBe(false);
  expect(byTestId(container, "cart-bar-count").textContent).toBe("4 artículos");
  expect(byTestId(container, "cart-bar-total").textContent).toBe("27.50€");
  expect(byTestId(container, "cart-bar-action").textContent).toContain("Ver comanda");
  unmount(container, root);
});

test("singular '1 artículo' wording", () => {
  const { container, root } = mount({ totalQty: 1, totalCart: 10 });
  expect(byTestId(container, "cart-bar-count").textContent).toBe("1 artículo");
  unmount(container, root);
});

test("tapping the bar calls onOpen only when non-empty", () => {
  const onOpen = jest.fn();
  const { container, root } = mount({ totalQty: 0, onOpen });
  click(byTestId(container, "cart-bar-open"));
  expect(onOpen).not.toHaveBeenCalled();
  unmount(container, root);

  const onOpen2 = jest.fn();
  const two = mount({ totalQty: 2, totalCart: 5, onOpen: onOpen2 });
  click(byTestId(two.container, "cart-bar-open"));
  expect(onOpen2).toHaveBeenCalledTimes(1);
  unmount(two.container, two.root);
});

// GOAL 7 -- safe-area + breathing room, applied uniformly regardless of
// channel. JSDOM's style engine cannot parse calc()/env() at all (confirmed:
// even a plain `calc(10px + 5px)` assignment is silently rejected -- a
// jsdom/cssstyle limitation, not a React or app bug), so the exact
// `calc(... env(safe-area-inset-bottom, 0px))` expression is verified by
// source inspection and the real-device mobile QA pass, not here. What IS
// asserted: a dedicated wrapper element exists for the safe-area treatment
// (not inlined into the button itself) and carries real top/side padding,
// so the bar is never glued flush to the screen edges.
test("the outer wrapper is a dedicated safe-area element with real padding, not glued to the edges", () => {
  const { container, root } = mount({});
  const wrapper = byTestId(container, "cart-bar-safe-area");
  expect(wrapper).toBeTruthy();
  expect(wrapper.style.paddingTop).toBe("10px");
  expect(wrapper.style.paddingLeft).toBe("12px");
  expect(wrapper.style.paddingRight).toBe("12px");
  unmount(container, root);
});

// GOAL 6 -- more physical hierarchy than a flat footer strip: a distinct
// icon zone, a raised/shadowed pill, not just a bare button.
test("renders a distinct cart icon zone and a raised (shadowed) pill, not a flat strip", () => {
  const { container, root } = mount({ totalQty: 2, totalCart: 9 });
  const icon = byTestId(container, "cart-bar-icon");
  const btn = byTestId(container, "cart-bar-open");
  expect(icon).toBeTruthy();
  expect(btn.style.borderRadius).not.toBe("0px");
  expect(btn.style.boxShadow).toBeTruthy();
  unmount(container, root);
});
