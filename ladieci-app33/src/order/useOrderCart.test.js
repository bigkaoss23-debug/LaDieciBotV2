// CANONICAL_MANUAL_PICKER_FINAL_CORRECTION -- Goal 5 (signature-based
// aggregation + split-on-edit) and Goal 4 (catalogue-card quick decrement).
//
// Mounts a bare harness around a real useOrderCart() instance -- these are
// the primitives every shell (MesaOrderBuilder, ItemPickerModal) composes,
// so proving them here once is more precise than re-deriving the same
// assertions through a full picker mount for every scenario.
import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

const { useOrderCart } = require("./useOrderCart");

const PIZZA = { id: "fx-p", n: "Fixture Pie", sub: "Fixture Classic", p: 10, cat: "Pizzas" };
const DRINK = { id: "fx-d", n: "Fixture Cola", sub: "33cl", p: 3, cat: "Bebidas" };
const INGREDIENTI = [{ id: "ing-a", n: "Fixture Basil", e: "🌿", prezzo: 0.6, gruppo: "g1" }];

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let api = null;
  function Harness() {
    api = useOrderCart({ MENU: [PIZZA, DRINK], INGREDIENTI });
    return null;
  }
  act(() => { root.render(<Harness />); });
  return {
    unmount: () => { act(() => { root.unmount(); }); container.remove(); },
    get: () => api,
  };
}

test("increment merges a second bare tap on the same product into one line at qty 2", () => {
  const h = mount();
  act(() => { h.get().increment(PIZZA); });
  act(() => { h.get().increment(PIZZA); });
  expect(h.get().cartItems.length).toBe(1);
  expect(h.get().cartItems[0].q).toBe(2);
  h.unmount();
});

test("increment does NOT merge a bare tap into an already-configured line for the same product", () => {
  const h = mount();
  let uid;
  act(() => { uid = h.get().increment(PIZZA); });
  act(() => { h.get().addExtra(uid, INGREDIENTI[0]); });
  act(() => { h.get().increment(PIZZA); });
  expect(h.get().cartItems.length).toBe(2);
  expect(h.get().cartItems.find((i) => i._uid === uid).q).toBe(1);
  const bareLine = h.get().cartItems.find((i) => i._uid !== uid);
  expect(bareLine.q).toBe(1);
  expect(bareLine.sub).toBe("");
  h.unmount();
});

test("increment does not merge two different products", () => {
  const h = mount();
  act(() => { h.get().increment(PIZZA); });
  act(() => { h.get().increment(DRINK); });
  expect(h.get().cartItems.length).toBe(2);
  h.unmount();
});

test("decrementBare mirrors increment's target: 0→1→2 then 2→1→0 via the card's quick +/-", () => {
  const h = mount();
  act(() => { h.get().increment(PIZZA); });
  act(() => { h.get().increment(PIZZA); });
  expect(h.get().qtyOf(PIZZA.id)).toBe(2);
  act(() => { h.get().decrementBare(PIZZA); });
  expect(h.get().qtyOf(PIZZA.id)).toBe(1);
  act(() => { h.get().decrementBare(PIZZA); });
  expect(h.get().qtyOf(PIZZA.id)).toBe(0);
  expect(h.get().cartItems.length).toBe(0);
  h.unmount();
});

test("decrementBare only ever removes unconfigured units, never a configured line", () => {
  const h = mount();
  let uid;
  act(() => { uid = h.get().increment(PIZZA); });
  act(() => { h.get().addExtra(uid, INGREDIENTI[0]); });
  // No bare line exists (the only line for this product is configured) --
  // the quick "-" has nothing bare to decrement.
  act(() => { h.get().decrementBare(PIZZA); });
  expect(h.get().cartItems.length).toBe(1);
  expect(h.get().cartItems[0]._uid).toBe(uid);
  h.unmount();
});

test("splitForEdit on a qty>1 line peels off exactly one unit into a new line, same config", () => {
  const h = mount();
  act(() => { h.get().increment(PIZZA); });
  act(() => { h.get().increment(PIZZA); }); // merges -> qty 2
  const uid = h.get().cartItems[0]._uid;
  let newUid;
  act(() => { newUid = h.get().splitForEdit(uid); });
  expect(newUid).not.toBe(uid);
  expect(h.get().cartItems.length).toBe(2);
  const original = h.get().cartItems.find((i) => i._uid === uid);
  const split = h.get().cartItems.find((i) => i._uid === newUid);
  expect(original.q).toBe(1);
  expect(split.q).toBe(1);
  h.unmount();
});

test("splitForEdit on a qty===1 line is a no-op, returns the same uid", () => {
  const h = mount();
  let uid;
  act(() => { uid = h.get().increment(PIZZA); });
  let returned;
  act(() => { returned = h.get().splitForEdit(uid); });
  expect(returned).toBe(uid);
  expect(h.get().cartItems.length).toBe(1);
  h.unmount();
});

test("IMPORTANT RULE: split then edit only the split unit -> 1x plain + 1x configured, two distinct lines", () => {
  const h = mount();
  act(() => { h.get().increment(PIZZA); });
  act(() => { h.get().increment(PIZZA); }); // qty 2
  const uid = h.get().cartItems[0]._uid;
  let newUid;
  act(() => { newUid = h.get().splitForEdit(uid); });
  act(() => { h.get().addExtra(newUid, INGREDIENTI[0]); });
  expect(h.get().cartItems.length).toBe(2);
  const plain = h.get().cartItems.find((i) => i._uid === uid);
  const configured = h.get().cartItems.find((i) => i._uid === newUid);
  expect(plain.q).toBe(1);
  expect(plain.sub).toBe("");
  expect(configured.q).toBe(1);
  expect(configured.sub).toContain("+Fixture Basil");
  h.unmount();
});

test("split then close WITHOUT changing anything -> consolidate() re-merges back into one qty-2 line", () => {
  const h = mount();
  act(() => { h.get().increment(PIZZA); });
  act(() => { h.get().increment(PIZZA); }); // qty 2
  const uid = h.get().cartItems[0]._uid;
  act(() => { h.get().splitForEdit(uid); }); // now 2 lines, both bare/identical
  expect(h.get().cartItems.length).toBe(2);
  act(() => { h.get().consolidate(); });
  expect(h.get().cartItems.length).toBe(1);
  expect(h.get().cartItems[0].q).toBe(2);
  h.unmount();
});

test("consolidate merges two independently-configured lines that end up with the same extra, summing quantity", () => {
  const h = mount();
  let uidA, uidB;
  act(() => { uidA = h.get().increment(PIZZA); });
  // A second, genuinely separate bare line (splitForEdit peels a qty-1 line
  // off without merging), so its uid differs from uidA's on purpose.
  act(() => { h.get().increment(PIZZA); });
  act(() => { uidB = h.get().splitForEdit(h.get().cartItems[0]._uid); });
  expect(h.get().cartItems.length).toBe(2);
  act(() => { h.get().addExtra(uidA, INGREDIENTI[0]); });
  act(() => { h.get().addExtra(uidB, INGREDIENTI[0]); });
  // Two distinct uids, now byte-identical configuration -- still 2 lines
  // until the commit-point consolidate() runs.
  expect(h.get().cartItems.length).toBe(2);
  act(() => { h.get().consolidate(); });
  expect(h.get().cartItems.length).toBe(1);
  expect(h.get().cartItems[0].q).toBe(2);
  h.unmount();
});
