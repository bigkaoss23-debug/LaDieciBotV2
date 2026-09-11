// NF-1 / NF-2 — canonical line editing helpers (pure). Fixture shapes are copied from
// real saved lines on staging (#999008, #999014), not synthesized field by field.
import {
  lineQuantity, lineExtras, addLineExtra, removeLineExtra, setLineSub, mergeAddedLines,
} from "./canonicalLineEdit";
import { applyLineQuantity } from "./itemSignature";

const ALBAHACA = { id: "ing_albahaca", n: "Albahaca fresca", e: "🌿", prezzo: 0.5 };
const RUCULA = { id: "ing_rucola", n: "Rúcula", e: "🥬", prezzo: 0.5 };
const CATALOGUE = [ALBAHACA, RUCULA];
const resolveExtra = (name) => CATALOGUE.find((g) => g.n === name) || null;

// Saved canonical line, verbatim from #999008.
const tulipano = () => ({
  e: "🧀", n: "Il Tulipano Nero", p: 14.5, q: 1, id: 8, alg: "Gluten, Lácteos, Huevo", cat: "Pizzas",
  ing: "Tomate San Marzano, Fior di latte, Gorgonzola, Provolone, Parmigiano", num: 8, sub: "",
  clave: null, emoji: "🧀", notes: "", extras: [], category: "Pizzas", legacyId: 8, quantity: 1,
  legacyKey: null, lineTotal: 14.5, productId: null, databaseId: null, classicName: "Quattro Formaggi",
  fantasyName: "Il Tulipano Nero", baseUnitPrice: 14.5, finalUnitPrice: 14.5, officialNumber: 8,
  baseIngredients: ["Tomate San Marzano", "Fior di latte", "Gorgonzola", "Provolone", "Parmigiano"],
  extrasUnitTotal: 0, snapshotVersion: 1, removedIngredients: [],
});

// Saved canonical line with five structured extras and a note, verbatim from #999014.
const divino = () => ({
  e: "🍖", n: "El Divino Codino", p: 15, q: 1, id: 6, cat: "Pizzas", num: 6,
  sub: "Nera, +Aceitunas negras, +Tomates confitados, +Parmigiano Reggiano, +Pancetta, +Atún",
  notes: "Nera", legacyId: 6, quantity: 1, lineTotal: 15, classicName: "Prosciutto", fantasyName: "El Divino Codino",
  extras: [
    { key: "ing_aceitunas", name: "Aceitunas negras", emoji: "🫒", price: 0.5, quantity: 1 },
    { key: "ing_tom_conf", name: "Tomates confitados", emoji: "🍯", price: 0.5, quantity: 1 },
    { key: "ing_parmigiano", name: "Parmigiano Reggiano", emoji: "🧀", price: 0.5, quantity: 1 },
    { key: "ing_pancetta", name: "Pancetta", emoji: "🥓", price: 0.5, quantity: 1 },
    { key: "ing_atun", name: "Atún", emoji: "🐟", price: 0.5, quantity: 1 },
  ],
  baseUnitPrice: 12.5, finalUnitPrice: 15, extrasUnitTotal: 2.5, snapshotVersion: 1, removedIngredients: [],
});

const consistent = (line) => {
  const extrasSum = Math.round(lineExtras(line).reduce((s, e) => s + e.price * e.quantity, 0) * 100) / 100;
  expect(line.q).toBe(line.quantity);
  expect(line.extrasUnitTotal).toBe(extrasSum);
  expect(line.finalUnitPrice).toBe(Math.round((line.baseUnitPrice + extrasSum) * 100) / 100);
  expect(line.p).toBe(line.finalUnitPrice);
  expect(line.lineTotal).toBe(Math.round(line.finalUnitPrice * line.quantity * 100) / 100);
};

describe("canonical quantity", () => {
  test("+1 on a saved line moves quantity, q and lineTotal together", () => {
    const line = applyLineQuantity(tulipano(), lineQuantity(tulipano()) + 1);
    expect(line).toMatchObject({ quantity: 2, q: 2, lineTotal: 29, finalUnitPrice: 14.5, p: 14.5 });
  });

  test("lineQuantity reads the canonical quantity first, the legacy mirror for a working line", () => {
    expect(lineQuantity({ quantity: 3, q: 3 })).toBe(3);
    expect(lineQuantity({ q: "2" })).toBe(2);
    expect(lineQuantity({})).toBe(1);
  });
});

describe("structured extras", () => {
  test("adding an extra updates extras[], extrasUnitTotal, finalUnitPrice, p, lineTotal and the tag", () => {
    const line = addLineExtra(tulipano(), ALBAHACA, resolveExtra);
    expect(line.extras).toEqual([{ key: "ing_albahaca", name: "Albahaca fresca", price: 0.5, emoji: "🌿", quantity: 1 }]);
    expect(line).toMatchObject({ baseUnitPrice: 14.5, extrasUnitTotal: 0.5, finalUnitPrice: 15, p: 15, lineTotal: 15, quantity: 1, sub: "+Albahaca fresca" });
    consistent(line);
  });

  test("two extras add up", () => {
    const line = addLineExtra(addLineExtra(tulipano(), ALBAHACA, resolveExtra), RUCULA, resolveExtra);
    expect(line).toMatchObject({ extrasUnitTotal: 1, finalUnitPrice: 15.5, p: 15.5, sub: "+Albahaca fresca, +Rúcula" });
    consistent(line);
  });

  test("an extra is priced per unit: quantity 2 + extra 0.50 → line 30.00", () => {
    const two = applyLineQuantity(tulipano(), 2);
    const line = addLineExtra(two, ALBAHACA, resolveExtra);
    expect(line).toMatchObject({ quantity: 2, finalUnitPrice: 15, lineTotal: 30 });
    expect(line.extras[0].quantity).toBe(1);
    consistent(line);
  });

  test("removing a saved structured extra lowers the price and keeps the note", () => {
    const line = removeLineExtra(divino(), "Aceitunas negras", resolveExtra);
    expect(line.extras.map((e) => e.name)).toEqual(["Tomates confitados", "Parmigiano Reggiano", "Pancetta", "Atún"]);
    expect(line).toMatchObject({ extrasUnitTotal: 2, finalUnitPrice: 14.5, p: 14.5, lineTotal: 14.5 });
    expect(line.sub).toBe("Nera, +Tomates confitados, +Parmigiano Reggiano, +Pancetta, +Atún");
    consistent(line);
  });

  test("removing one unit of a multiplied extra decrements both the extra and its tag", () => {
    const saved = { ...tulipano(), sub: "+Rúcula ×2", extras: [{ key: "ing_rucola", name: "Rúcula", price: 0.5, emoji: null, quantity: 2 }], extrasUnitTotal: 1, finalUnitPrice: 15.5, p: 15.5, lineTotal: 15.5 };
    const line = removeLineExtra(saved, "Rúcula", resolveExtra);
    expect(line.extras[0].quantity).toBe(1);
    expect(line.sub).toBe("+Rúcula");
    expect(line.finalUnitPrice).toBe(15);
    consistent(line);
  });

  test("adding then removing returns to the saved economic values", () => {
    const line = removeLineExtra(addLineExtra(tulipano(), ALBAHACA, resolveExtra), "Albahaca fresca", resolveExtra);
    expect(line).toMatchObject({ extras: [], extrasUnitTotal: 0, finalUnitPrice: 14.5, p: 14.5, lineTotal: 14.5, sub: "" });
  });

  test("removing an extra the line does not have changes nothing", () => {
    const saved = tulipano();
    expect(removeLineExtra(saved, "Albahaca fresca", resolveExtra)).toBe(saved);
  });
});

describe("free-text Variaciones field", () => {
  test("editing only the note text never moves extras or price", () => {
    const line = setLineSub(divino(), "Nera bien hecha, +Aceitunas negras, +Tomates confitados, +Parmigiano Reggiano, +Pancetta, +Atún", resolveExtra);
    expect(line.extras).toEqual(divino().extras);
    expect(line).toMatchObject({ finalUnitPrice: 15, p: 15, extrasUnitTotal: 2.5, lineTotal: 15 });
    expect(line.sub).toBe("Nera bien hecha, +Aceitunas negras, +Tomates confitados, +Parmigiano Reggiano, +Pancetta, +Atún");
  });

  test("a typed +tag becomes a priced structured extra (never uncharged text)", () => {
    const line = setLineSub(tulipano(), "+Rúcula", resolveExtra);
    expect(line.extras).toEqual([{ key: "ing_rucola", name: "Rúcula", price: 0.5, emoji: "🥬", quantity: 1 }]);
    expect(line).toMatchObject({ finalUnitPrice: 15, p: 15, lineTotal: 15 });
    consistent(line);
  });

  test("an unknown +tag is a structured extra at 0 (creation emitter rule), kept in sync with sub", () => {
    const line = setLineSub(tulipano(), "+picante", resolveExtra);
    expect(line.extras).toEqual([{ key: null, name: "picante", price: 0, emoji: null, quantity: 1 }]);
    expect(line.finalUnitPrice).toBe(14.5);
    consistent(line);
  });

  test("a working line without tags only changes its text", () => {
    const working = { id: 1, n: "El Pelusa", p: 12, q: 1, sub: "" };
    expect(setLineSub(working, "sin cebolla", resolveExtra)).toEqual({ ...working, sub: "sin cebolla" });
  });

  test("a saved extra keeps its accepted price even if the catalogue changed", () => {
    const line = setLineSub(divino(), `${divino().sub}, +Albahaca fresca`, (name) => (name === "Aceitunas negras" ? { id: "x", n: name, prezzo: 9 } : resolveExtra(name)));
    expect(line.extras.find((e) => e.name === "Aceitunas negras").price).toBe(0.5);
    expect(line.finalUnitPrice).toBe(15.5);
    consistent(line);
  });
});

describe("WhatsApp addition merge", () => {
  test("same plain product at the same price bumps the saved row canonically, without mutating it", () => {
    const saved = tulipano();
    const existing = [saved];
    const merged = mergeAddedLines(existing, [{ n: "Il Tulipano Nero", p: 14.5, q: 1 }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ quantity: 2, q: 2, lineTotal: 29 });
    expect(saved.q).toBe(1);
    expect(saved.quantity).toBe(1);
  });

  test("a row with extras is never folded into: the addition becomes its own row", () => {
    const configured = addLineExtra(tulipano(), ALBAHACA, resolveExtra);
    const merged = mergeAddedLines([configured], [{ n: "Il Tulipano Nero", p: 14.5, q: 1 }]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(configured);
  });

  test("an addition carrying its own extra or note is its own row", () => {
    expect(mergeAddedLines([tulipano()], [{ n: "Il Tulipano Nero", p: 15, q: 1, sub: "+Albahaca fresca" }])).toHaveLength(2);
    expect(mergeAddedLines([tulipano()], [{ n: "Il Tulipano Nero", p: 14.5, q: 1, sub: "sin cebolla" }])).toHaveLength(2);
  });

  test("a different accepted price is its own row", () => {
    expect(mergeAddedLines([tulipano()], [{ n: "Il Tulipano Nero", p: 15.5, q: 1 }])).toHaveLength(2);
  });

  test("a different product is appended", () => {
    const merged = mergeAddedLines([tulipano()], [{ n: "Misu Clásico", p: 5, q: 2 }]);
    expect(merged.map((l) => l.n)).toEqual(["Il Tulipano Nero", "Misu Clásico"]);
  });
});
