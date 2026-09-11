/**
 * @jest-environment jsdom
 */
// NF-1 / NF-2 — the REAL Modificar pedido modal. Its +/− controls, extras panel and
// extras removal must save lines whose canonical quantity, structured extras and price
// move together, row by row; the saved payload must reload into the same structure.
// Fixture lines are copied from real saved staging orders (#999008, #999014).
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ModificaOrdenModal from "./ModificaOrdenModal";

jest.mock("../api", () => ({ api: { resolveAddress: jest.fn(async () => null) }, sb: {} }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const MINUS = "−";
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const tulipano = () => ({
  e: "🧀", n: "Il Tulipano Nero", p: 14.5, q: 1, id: 8, cat: "Pizzas", num: 8, sub: "", notes: "", extras: [],
  legacyId: 8, quantity: 1, lineTotal: 14.5, classicName: "Quattro Formaggi", fantasyName: "Il Tulipano Nero",
  baseUnitPrice: 14.5, finalUnitPrice: 14.5, extrasUnitTotal: 0, snapshotVersion: 1, removedIngredients: [],
  ing: "Tomate San Marzano, Fior di latte, Gorgonzola, Provolone, Parmigiano",
});
const misu = () => ({
  e: "🍰", n: "Misu Clásico", p: 5, q: 1, id: 12, cat: "Postres", sub: "", notes: "", extras: [], legacyId: 12,
  quantity: 1, lineTotal: 5, classicName: "Tiramisú", fantasyName: "Misu Clásico", baseUnitPrice: 5,
  finalUnitPrice: 5, extrasUnitTotal: 0, snapshotVersion: 1, removedIngredients: [], ing: "",
});
const magoX2 = () => ({
  e: "🥦", n: "El Mago de Zadar", p: 14.5, q: 2, id: 9, cat: "Pizzas", num: 9, sub: "", notes: "", extras: [],
  legacyId: 9, quantity: 2, lineTotal: 29, classicName: "Vegetariana", fantasyName: "El Mago de Zadar",
  baseUnitPrice: 14.5, finalUnitPrice: 14.5, extrasUnitTotal: 0, snapshotVersion: 1, removedIngredients: [], ing: "",
});
const divino = () => ({
  e: "🍖", n: "El Divino Codino", p: 15, q: 1, id: 6, cat: "Pizzas", num: 6, notes: "Nera",
  sub: "Nera, +Aceitunas negras, +Tomates confitados, +Parmigiano Reggiano, +Pancetta, +Atún",
  extras: [
    { key: "ing_aceitunas", name: "Aceitunas negras", emoji: "🫒", price: 0.5, quantity: 1 },
    { key: "ing_tom_conf", name: "Tomates confitados", emoji: "🍯", price: 0.5, quantity: 1 },
    { key: "ing_parmigiano", name: "Parmigiano Reggiano", emoji: "🧀", price: 0.5, quantity: 1 },
    { key: "ing_pancetta", name: "Pancetta", emoji: "🥓", price: 0.5, quantity: 1 },
    { key: "ing_atun", name: "Atún", emoji: "🐟", price: 0.5, quantity: 1 },
  ],
  legacyId: 6, quantity: 1, lineTotal: 15, classicName: "Prosciutto", fantasyName: "El Divino Codino",
  baseUnitPrice: 12.5, finalUnitPrice: 15, extrasUnitTotal: 2.5, snapshotVersion: 1, removedIngredients: [], ing: "",
});
const tulipanoWithAlbahaca = () => ({
  ...tulipano(), p: 15, finalUnitPrice: 15, extrasUnitTotal: 0.5, lineTotal: 15, sub: "+Albahaca fresca",
  extras: [{ key: "ing_albahaca", name: "Albahaca fresca", emoji: "🌿", price: 0.5, quantity: 1 }],
});

const order = (items) => ({
  id: "#999008", estado: "POR_CONFIRMAR", canal: "BANCO", hora: "11:41", nota: "", nombre: "TEST", items,
});

async function mount(orden) {
  const saved = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ModificaOrdenModal orden={orden} onClose={() => {}} onSave={async (snap) => { saved.push(JSON.parse(JSON.stringify(snap))); }} />);
  });
  return { container, root, saved };
}
async function unmount({ container, root }) {
  await act(async () => { root.unmount(); });
  container.remove();
}
const buttons = (c) => Array.from(c.querySelectorAll("button"));
async function click(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}
function rows(c) {
  return buttons(c).filter((b) => b.textContent === MINUS).map((minus) => ({
    qty: minus.nextElementSibling.textContent,
    minus,
    plus: minus.nextElementSibling.nextElementSibling,
    block: minus.parentElement.parentElement,
  }));
}
function uiTotal(c) {
  const label = Array.from(c.querySelectorAll("div")).find((d) => d.textContent === "Total" && d.children.length === 0);
  return label.nextElementSibling.textContent;
}
async function addExtra(c, row, name) {
  await click(Array.from(rows(c)[row].block.querySelectorAll("button")).find((b) => b.textContent.startsWith("➕")));
  const option = Array.from(rows(c)[row].block.querySelectorAll("button")).find((b) => {
    const spans = b.querySelectorAll("span");
    return spans.length === 3 && spans[1].textContent === name;
  });
  await click(option);
}
async function removeExtra(c, row, name) {
  const line = Array.from(rows(c)[row].block.querySelectorAll("div")).find((d) =>
    d.children.length === 3 && d.children[0].tagName === "SPAN" && d.children[0].textContent.includes(name) && d.children[2].tagName === "BUTTON");
  await click(line.children[2]);
}
async function save(c, saved) {
  await click(buttons(c).find((b) => b.textContent === "✅ Salva modifiche"));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return saved[saved.length - 1].items;
}

// Every saved line is internally coherent: no stale canonical copy, no uncharged "+Name" tag.
function expectCoherent(items) {
  for (const it of items) {
    expect(it.q).toBe(it.quantity);
    const unit = it.finalUnitPrice ?? it.p;
    expect(it.p).toBe(unit);
    if (it.lineTotal !== undefined) expect(it.lineTotal).toBe(round2(unit * it.quantity));
    if (it.baseUnitPrice !== undefined && Array.isArray(it.extras)) {
      const extrasSum = round2(it.extras.reduce((s, e) => s + e.price * e.quantity, 0));
      expect(it.extrasUnitTotal).toBe(extrasSum);
      expect(it.finalUnitPrice).toBe(round2(it.baseUnitPrice + extrasSum));
      const tags = String(it.sub || "").split(",").map((s) => s.trim()).filter((s) => s.startsWith("+")).map((s) => s.slice(1)).sort();
      const structured = it.extras.flatMap((e) => Array(e.quantity).fill(e.name)).sort();
      expect(tags).toEqual(structured);
    }
  }
}
// Order economics: line quantity × unit price, extras amount, subtotal, no delivery fee or
// discount on these fixtures, total equal to what the modal shows.
function economics(items) {
  const subtotal = round2(items.reduce((s, it) => s + it.lineTotal, 0));
  return { subtotal, deliveryFee: 0, discount: 0, total: subtotal };
}

describe("NF-1 — canonical quantity, row by row", () => {
  test("F1: Pizza A ×1, click + → saved quantity 2", async () => {
    const m = await mount(order([tulipano(), misu()]));
    await click(rows(m.container)[0].plus);
    expect(rows(m.container)[0].qty).toBe("2");
    expect(uiTotal(m.container)).toBe("34.00€");
    const items = await save(m.container, m.saved);
    expect(items[0]).toMatchObject({ quantity: 2, q: 2, finalUnitPrice: 14.5, lineTotal: 29 });
    expect(items[1]).toMatchObject({ quantity: 1, lineTotal: 5 });
    expectCoherent(items);
    expect(economics(items)).toEqual({ subtotal: 34, deliveryFee: 0, discount: 0, total: 34 });
    await unmount(m);
  });

  test("F2: ×2, click − → saved quantity 1", async () => {
    const m = await mount(order([magoX2(), misu()]));
    await click(rows(m.container)[0].minus);
    const items = await save(m.container, m.saved);
    expect(items[0]).toMatchObject({ quantity: 1, q: 1, lineTotal: 14.5 });
    expectCoherent(items);
    expect(economics(items).total).toBe(19.5);
    await unmount(m);
  });

  test("F3: two rows of the same product with different configurations → only the clicked row changes", async () => {
    const m = await mount(order([tulipano(), tulipanoWithAlbahaca(), misu()]));
    await click(rows(m.container)[1].plus);
    expect(rows(m.container).map((r) => r.qty)).toEqual(["1", "2", "1"]);
    const items = await save(m.container, m.saved);
    expect(items[0]).toMatchObject({ quantity: 1, lineTotal: 14.5, extras: [] });
    expect(items[1]).toMatchObject({ quantity: 2, finalUnitPrice: 15, lineTotal: 30 });
    expect(items[1].extras).toEqual([{ key: "ing_albahaca", name: "Albahaca fresca", emoji: "🌿", price: 0.5, quantity: 1 }]);
    expectCoherent(items);
    expect(economics(items).total).toBe(49.5);
    await unmount(m);
  });

  test("a row without a product id is still editable", async () => {
    const m = await mount(order([{ ...tulipano(), id: null, legacyId: null }, misu()]));
    await click(rows(m.container)[0].plus);
    const items = await save(m.container, m.saved);
    expect(items[0]).toMatchObject({ quantity: 2, lineTotal: 29 });
    await unmount(m);
  });
});

describe("NF-2 — structured extras and price", () => {
  test("F4: add an extra (+0.50) → structured extra, finalUnitPrice +0.50", async () => {
    const m = await mount(order([tulipano(), misu()]));
    await addExtra(m.container, 0, "Albahaca fresca");
    expect(uiTotal(m.container)).toBe("20.00€");
    const items = await save(m.container, m.saved);
    expect(items[0].extras).toEqual([expect.objectContaining({ name: "Albahaca fresca", price: 0.5, quantity: 1 })]);
    expect(items[0]).toMatchObject({ baseUnitPrice: 14.5, extrasUnitTotal: 0.5, finalUnitPrice: 15, p: 15, lineTotal: 15, sub: "+Albahaca fresca" });
    expectCoherent(items);
    expect(economics(items).total).toBe(20);
    await unmount(m);
  });

  test("F5: remove a saved structured extra → extras[] updated, finalUnitPrice −0.50", async () => {
    const m = await mount(order([divino(), misu()]));
    await removeExtra(m.container, 0, "Aceitunas negras");
    expect(uiTotal(m.container)).toBe("19.50€");
    const items = await save(m.container, m.saved);
    expect(items[0].extras.map((e) => e.name)).toEqual(["Tomates confitados", "Parmigiano Reggiano", "Pancetta", "Atún"]);
    expect(items[0]).toMatchObject({ baseUnitPrice: 12.5, extrasUnitTotal: 2, finalUnitPrice: 14.5, lineTotal: 14.5, notes: "Nera" });
    expectCoherent(items);
    expect(economics(items).total).toBe(19.5);
    await unmount(m);
  });

  test("F6: two extras → amounts add up", async () => {
    const m = await mount(order([tulipano(), misu()]));
    await addExtra(m.container, 0, "Albahaca fresca");
    await addExtra(m.container, 0, "Rúcula");
    const items = await save(m.container, m.saved);
    expect(items[0]).toMatchObject({ extrasUnitTotal: 1, finalUnitPrice: 15.5, lineTotal: 15.5 });
    expectCoherent(items);
    expect(economics(items).total).toBe(20.5);
    await unmount(m);
  });

  test("F7: quantity 2 + extra 0.50 → the extra is charged per unit", async () => {
    const m = await mount(order([tulipano(), misu()]));
    await addExtra(m.container, 0, "Albahaca fresca");
    await click(rows(m.container)[0].plus);
    const items = await save(m.container, m.saved);
    expect(items[0]).toMatchObject({ quantity: 2, finalUnitPrice: 15, extrasUnitTotal: 0.5, lineTotal: 30 });
    expect(items[0].extras[0].quantity).toBe(1);
    expectCoherent(items);
    expect(economics(items).total).toBe(35);
    await unmount(m);
  });

  test("F8: save → reload the saved lines → save again → identical structure", async () => {
    const first = await mount(order([tulipano(), divino(), misu()]));
    await addExtra(first.container, 0, "Albahaca fresca");
    await click(rows(first.container)[0].plus);
    await removeExtra(first.container, 1, "Atún");
    const savedOnce = await save(first.container, first.saved);
    await unmount(first);

    const again = await mount(order(savedOnce));
    expect(uiTotal(again.container)).toBe(`${economics(savedOnce).total.toFixed(2)}€`);
    const savedTwice = await save(again.container, again.saved);
    expect(savedTwice).toEqual(savedOnce);
    expectCoherent(savedTwice);
    await unmount(again);
  });
});
