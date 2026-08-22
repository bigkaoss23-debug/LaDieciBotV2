// PAYMENT HUB MESA V1 -- the "Resumen del ticket" projection.
//
// The backend models one line per unit; the approved mockup shows a quantity
// column. This projection is the only place that gap is closed, and it must
// close it WITHOUT ever becoming a source of money.
import { groupTicketLines } from "./paymentHubTicket";

// The exact ticket from the approved mockup: two beers arrive as two lines.
const MOCKUP_LINES = [
  { id: "l1", description: "El Pelusa", amount: 12, paid: 0, remaining: 12 },
  { id: "l2", description: "La Joya", amount: 15, paid: 0, remaining: 15 },
  { id: "l3", description: "Estrella Galicia", amount: 3, paid: 0, remaining: 3 },
  { id: "l4", description: "Estrella Galicia", amount: 3, paid: 0, remaining: 3 },
  { id: "l5", description: "Fanta Naranja", amount: 3.5, paid: 0, remaining: 3.5 },
  { id: "l6", description: "San Miguel 0,0", amount: 3, paid: 0, remaining: 3 },
];

test("reproduces the approved mockup ticket exactly, quantities included", () => {
  expect(groupTicketLines(MOCKUP_LINES)).toEqual([
    { key: "el pelusa", description: "El Pelusa", quantity: 1, amount: 12 },
    { key: "la joya", description: "La Joya", quantity: 1, amount: 15 },
    { key: "estrella galicia", description: "Estrella Galicia", quantity: 2, amount: 6 },
    { key: "fanta naranja", description: "Fanta Naranja", quantity: 1, amount: 3.5 },
    { key: "san miguel 0,0", description: "San Miguel 0,0", quantity: 1, amount: 3 },
  ]);
});

test("the grouped column sums to the session total, so the ticket reconciles", () => {
  const sum = groupTicketLines(MOCKUP_LINES).reduce((total, row) => total + row.amount, 0);
  expect(Math.round(sum * 100) / 100).toBe(39.5);
});

test("rows keep first-appearance order, not alphabetical", () => {
  const rows = groupTicketLines([
    { description: "Zumo", amount: 2 },
    { description: "Agua", amount: 1 },
    { description: "Zumo", amount: 2 },
  ]);
  expect(rows.map((row) => row.description)).toEqual(["Zumo", "Agua"]);
  expect(rows[0]).toMatchObject({ quantity: 2, amount: 4 });
});

test("the same product spelled differently is one row, shown as first seen", () => {
  const rows = groupTicketLines([
    { description: "Fanta Naranja", amount: 3.5 },
    { description: "fanta naranja", amount: 3.5 },
  ]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ description: "Fanta Naranja", quantity: 2, amount: 7 });
});

test("a backend-supplied quantity wins over counting rows", () => {
  const rows = groupTicketLines([{ description: "Estrella Galicia", quantity: 3, amount: 9 }]);
  expect(rows[0]).toMatchObject({ quantity: 3, amount: 9 });
});

test("a line with no amount still appears -- an item on the table belongs on the bill", () => {
  const rows = groupTicketLines([
    { description: "Pan", amount: null },
    { description: "Pizza", amount: 10 },
  ]);
  expect(rows.map((row) => row.description)).toEqual(["Pan", "Pizza"]);
  expect(rows[0]).toMatchObject({ quantity: 1, amount: 0 });
});

test("cent arithmetic never leaks float noise onto a bill a guest reads", () => {
  const rows = groupTicketLines([
    { description: "Café", amount: 1.1 },
    { description: "Café", amount: 2.2 },
  ]);
  expect(rows[0].amount).toBe(3.3);
  expect(String(rows[0].amount)).not.toContain("0000");
});

test("a missing, empty or non-array line list is an empty ticket, never a crash", () => {
  for (const input of [undefined, null, [], "nope", 7]) {
    expect(groupTicketLines(input)).toEqual([]);
  }
});

test("a line with no description is still shown rather than silently dropped", () => {
  const rows = groupTicketLines([{ id: "x", amount: 4 }]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ description: "—", quantity: 1, amount: 4 });
});

test("the projection is pure: it never mutates the lines it was given", () => {
  const lines = [{ description: "Pizza", amount: 10 }];
  const frozen = JSON.stringify(lines);
  groupTicketLines(lines);
  expect(JSON.stringify(lines)).toBe(frozen);
});
