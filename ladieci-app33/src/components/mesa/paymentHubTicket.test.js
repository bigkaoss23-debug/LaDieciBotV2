// PAYMENT HUB V1.1 — the ticket projection: quantity, identity, selection and
// the person split. All display-only; the server decides what is charged.
import { groupTicketLines, orderedItemLabel, selectionTotals, personShares, amountForPersons }
  from "./paymentHubTicket";

// Real staging shapes. Pizzas carry officialNumber + classicName + fantasyName;
// drinks carry no number and use classicName for the format ("0,33L").
const pizza = (id, num, classic, fantasy, amount, remaining = amount) => ({
  id, description: fantasy, amount, remaining, paid: amount - remaining,
  product: { officialNumber: num, num, classicName: classic, fantasyName: fantasy, n: fantasy, category: "Pizzas" },
});
const drink = (id, name, format, amount, remaining = amount) => ({
  id, description: name, amount, remaining, paid: amount - remaining,
  product: { classicName: format, fantasyName: name, n: name, category: "Bebidas" },
});

// ── ORDERED ITEM LABEL ─────────────────────────────────────────────────────
// MESA V2.1.2 -- officialNumber is never printed here at all any more (it
// only matters in the picker, a genuinely separate formatter -- pizzaLabel()
// in constants.js -- that this file has never touched). `number` still
// selects which name leads (classic for a numbered pizza, fantasy otherwise),
// it is just never concatenated into the printed primary string.
describe("ordered item label", () => {
  test("a numbered pizza leads with its real/classic name, nickname underneath -- no number printed", () => {
    expect(orderedItemLabel(pizza("l", 9, "Vegetariana", "El Mago de Zadar", 14.5)))
      .toMatchObject({ primary: "Vegetariana", secondary: "El Mago de Zadar", number: 9 });
  });

  test("a drink leads with its recognisable name, format underneath", () => {
    expect(orderedItemLabel(drink("l", "Coca Cola", "0,33L", 3)))
      .toMatchObject({ primary: "Coca Cola", secondary: "0,33L" });
  });

  test("a secondary line that only repeats the primary is not shown", () => {
    // Aquarius is stored with classicName === fantasyName.
    expect(orderedItemLabel(drink("l", "Aquarius", "Aquarius", 3)).secondary).toBeNull();
  });

  test("with no product data at all it degrades to the description, never invents", () => {
    expect(orderedItemLabel({ id: "x", description: "TEST ITEM", amount: 2 }))
      .toMatchObject({ primary: "TEST ITEM", secondary: null, number: null });
    expect(orderedItemLabel({ id: "x", description: "TEST ITEM", product: {} }).primary).toBe("TEST ITEM");
  });

  test("a numbered item with no classic name still leads with the fantasy name -- number kept in the data, never printed", () => {
    expect(orderedItemLabel({ id: "x", description: "El Pelusa", product: { officialNumber: 1, fantasyName: "El Pelusa" } }))
      .toMatchObject({ primary: "El Pelusa", secondary: null, number: 1 });
  });

  test("a line with nothing at all renders a placeholder rather than crashing", () => {
    expect(orderedItemLabel(null).primary).toBe("—");
    expect(orderedItemLabel({}).primary).toBe("—");
  });

  // "Nº 0"/"#0" is not operational information (an uncatalogued test/UAT item
  // defaults officialNumber to 0, not to a real menu slot). 0/negative/non-
  // numeric all resolve the same way null already does: no number carried at
  // all, never a placeholder like "N/A" or "--" -- moot now that no number is
  // ever printed here, but the underlying `number` field must still stay
  // honest for any future caller that does read it.
  test("officialNumber 0 carries no number at all", () => {
    const result = orderedItemLabel({ id: "x", description: "O-1 UAT Test Item", product: { officialNumber: 0, fantasyName: "O-1 UAT Test Item" } });
    expect(result.number).toBeNull();
    expect(result.primary).toBe("O-1 UAT Test Item");
  });

  test("a negative or non-numeric officialNumber also carries no number", () => {
    expect(orderedItemLabel({ id: "x", description: "X", product: { officialNumber: -1, fantasyName: "X" } }).number).toBeNull();
    expect(orderedItemLabel({ id: "x", description: "X", product: { officialNumber: "n/a", fantasyName: "X" } }).number).toBeNull();
  });
});

// ── GROUPING ───────────────────────────────────────────────────────────────
describe("grouping", () => {
  test("identical units become one row with a quantity", () => {
    const rows = groupTicketLines([drink("a", "Estrella Galicia", "33cl", 3), drink("b", "Estrella Galicia", "33cl", 3)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ quantity: 2, amount: 6, remaining: 6 });
    expect(rows[0].lineIds).toEqual(["a", "b"]);
  });

  test("the same drink in two formats stays two rows — they are different products", () => {
    const rows = groupTicketLines([drink("a", "Coca Cola", "0,33L", 3), drink("b", "Coca Cola", "1L", 5)]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.label.secondary)).toEqual(["0,33L", "1L"]);
  });

  test("rows keep first-appearance order and cent-exact sums", () => {
    const rows = groupTicketLines([drink("a", "Café", "solo", 1.1), drink("b", "Café", "solo", 2.2)]);
    expect(rows[0].amount).toBe(3.3);
    expect(String(rows[0].amount)).not.toContain("0000");
  });

  test("a fully paid row is flagged and offers no selectable ids", () => {
    const rows = groupTicketLines([pizza("a", 1, "Margherita Classica", "El Pelusa", 12, 0)]);
    expect(rows[0]).toMatchObject({ paidInFull: true, remaining: 0 });
    expect(rows[0].selectableLineIds).toEqual([]);
  });

  test("a partly paid row stays selectable, but only its unpaid units", () => {
    const rows = groupTicketLines([
      pizza("a", 1, "Margherita Classica", "El Pelusa", 12, 0),
      pizza("b", 1, "Margherita Classica", "El Pelusa", 12, 12),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ quantity: 2, amount: 24, remaining: 12, paidInFull: false });
    expect(rows[0].lineIds).toEqual(["a", "b"]);
    expect(rows[0].selectableLineIds).toEqual(["b"]);
  });

  test("a missing or non-array line list is an empty ticket, never a crash", () => {
    for (const input of [undefined, null, [], "nope", 7]) expect(groupTicketLines(input)).toEqual([]);
  });

  test("the projection never mutates the lines it was given", () => {
    const lines = [pizza("a", 1, "Margherita Classica", "El Pelusa", 12)];
    const frozen = JSON.stringify(lines);
    groupTicketLines(lines);
    expect(JSON.stringify(lines)).toBe(frozen);
  });
});

// ── SELECTION ──────────────────────────────────────────────────────────────
describe("selection", () => {
  const rows = groupTicketLines([
    pizza("p1", 1, "Margherita Classica", "El Pelusa", 12, 0),   // already paid
    pizza("p2", 9, "Vegetariana", "El Mago de Zadar", 14.5),
    drink("d1", "Estrella Galicia", "33cl", 3),
    drink("d2", "Estrella Galicia", "33cl", 3),
  ]);

  test("selecting a row yields its REAL line ids and its remaining amount", () => {
    const { amount, lineIds } = selectionTotals(rows, new Set([rows[1].key]));
    expect(amount).toBe(14.5);
    expect(lineIds).toEqual(["p2"]);
  });

  test("a grouped row contributes every one of its unpaid units", () => {
    const beers = rows.find((r) => r.label.primary === "Estrella Galicia");
    const { amount, lineIds } = selectionTotals(rows, new Set([beers.key]));
    expect(amount).toBe(6);
    expect(lineIds).toEqual(["d1", "d2"]);
  });

  test("multi-selection sums, and the ids stay the originals", () => {
    const beers = rows.find((r) => r.label.primary === "Estrella Galicia");
    const { amount, lineIds } = selectionTotals(rows, new Set([rows[1].key, beers.key]));
    expect(amount).toBe(20.5);
    expect(lineIds.sort()).toEqual(["d1", "d2", "p2"]);
  });

  test("an already-paid row can never contribute, even if its key is passed", () => {
    const { amount, lineIds } = selectionTotals(rows, new Set([rows[0].key]));
    expect(amount).toBe(0);
    expect(lineIds).toEqual([]);
  });

  test("no selection is zero and empty, never a crash", () => {
    expect(selectionTotals(rows, new Set())).toEqual({ amount: 0, lineIds: [] });
    expect(selectionTotals(null, null)).toEqual({ amount: 0, lineIds: [] });
  });
});

// ── POR PERSONAS ───────────────────────────────────────────────────────────
describe("por personas", () => {
  test("4 covers / 80 € — 2 personas is 40,00 € and 1 persona is 20,00 €", () => {
    expect(amountForPersons(80, 4, 2)).toBe(40);
    expect(amountForPersons(80, 4, 1)).toBe(20);
    expect(amountForPersons(80, 4, 4)).toBe(80);
  });

  test("N shares can never overshoot the balance the way N × ceil(share) would", () => {
    // 10,00 / 3 = 3,34 + 3,33 + 3,33. Naive 3 × 3,34 would be 10,02 — which
    // the server would reject as greater than the outstanding balance.
    expect(personShares(10, 3)).toEqual([3.34, 3.33, 3.33]);
    expect(amountForPersons(10, 3, 3)).toBe(10);
    expect(amountForPersons(10, 3, 2)).toBe(6.67);
  });

  test("the denominator is the REMAINING covers, so the split follows the table", () => {
    // Two of four already settled: the rest of the bill splits across two.
    expect(personShares(40, 2)).toEqual([20, 20]);
    expect(amountForPersons(40, 2, 1)).toBe(20);
  });

  test("no covers, no balance or a nonsense count offers nothing to pay", () => {
    expect(personShares(80, 0)).toEqual([]);
    expect(personShares(0, 4)).toEqual([]);
    expect(personShares(80, null)).toEqual([]);
    expect(amountForPersons(80, 4, 0)).toBe(0);
    expect(amountForPersons(80, 4, 5)).toBe(0);
    expect(amountForPersons(80, 4, 1.5)).toBe(0);
  });
});
