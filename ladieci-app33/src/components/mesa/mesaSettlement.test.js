// R2 (Economy 147) — the Mesa per-comanda paid state is the backend's `settlement`,
// never rebuilt from historical lines. Fixtures are the REAL floor sessions the
// candidate backend returned on the PG17 bench (ids shortened), for:
//   A  100 -> pay 100 -> adjust 80 -> refund 20        settled, lines still owe 20
//   J  A (60 + 40) adjusted 100 -> 80, B 30, unpaid     A not payable by lines, B is
//   K  A (60 + 40), 60 paid by product, adjust 70, refund 20   owes 30, lines owe 60
import {
  commandSettlement, settlementLines, isCommandPaid, billPendingRows, selectionFitsOutstanding,
} from "./mesaSettlement";
import { groupTicketLines, selectionTotals, selectableCount } from "./paymentHubTicket";

const settlement = (o) => ({ currentObligation: 0, netCollected: 0, outstanding: 0, overCollected: 0, payState: "unpaid", payableByLines: false, ...o });

const A = {
  total: 80, paid: 80, outstanding: 0, overCollected: 0,
  commands: [{ id: "#A", commandNumber: 1, state: "EN_COCINA", total: 80,
    settlement: settlement({ currentObligation: 80, netCollected: 80, payState: "paid" }) }],
  lines: [{ id: "a1", orderId: "#A", description: "Pizza", amount: 100, paid: 80, remaining: 20 }],
};
const J = {
  total: 110, paid: 0, outstanding: 110, overCollected: 0,
  commands: [
    { id: "#A", commandNumber: 1, state: "EN_COCINA", total: 80, settlement: settlement({ currentObligation: 80, outstanding: 80 }) },
    { id: "#B", commandNumber: 2, state: "EN_COCINA", total: 30, settlement: settlement({ currentObligation: 30, outstanding: 30, payableByLines: true }) },
  ],
  lines: [
    { id: "a1", orderId: "#A", description: "Pizza", amount: 60, paid: 0, remaining: 60 },
    { id: "a2", orderId: "#A", description: "Vino", amount: 40, paid: 0, remaining: 40 },
    { id: "b1", orderId: "#B", description: "Postre", amount: 30, paid: 0, remaining: 30 },
  ],
};
const K = {
  total: 70, paid: 40, outstanding: 30, overCollected: 0,
  commands: [{ id: "#A", commandNumber: 1, state: "EN_COCINA", total: 70,
    settlement: settlement({ currentObligation: 70, netCollected: 40, outstanding: 30, payState: "partially_paid" }) }],
  lines: [
    { id: "a1", orderId: "#A", description: "Pizza", amount: 60, paid: 40, remaining: 20 },
    { id: "a2", orderId: "#A", description: "Vino", amount: 40, paid: 0, remaining: 40 },
  ],
};
// the same shapes WITHOUT settlement: an older backend
const withoutSettlement = (session) => ({ ...session, commands: session.commands.map(({ settlement: _s, ...rest }) => rest) });

test("A: a comanda settled after an adjustment is Pagada, its lines are not pending and the bill lists nothing", () => {
  expect(isCommandPaid(A.commands[0], A.lines)).toBe(true);
  const rows = groupTicketLines(settlementLines(A));
  expect(rows[0].paidInFull).toBe(true);
  expect(selectableCount(rows[0])).toBe(0);
  expect(billPendingRows(A)).toEqual([]);
  // the raw line is untouched: remaining still reads what the writer would charge
  expect(settlementLines(A)[0].remaining).toBe(20);
});

test("J: an adjusted comanda that still owes is pending but not chargeable by products; the untouched one is", () => {
  const lines = settlementLines(J);
  expect(lines.map((l) => [l.id, l.pending, l.selectable])).toEqual([["a1", true, false], ["a2", true, false], ["b1", true, true]]);
  const rows = groupTicketLines(lines);
  expect(rows.map((r) => [r.label.primary, r.paidInFull, selectableCount(r)])).toEqual([["Pizza", false, 0], ["Vino", false, 0], ["Postre", false, 1]]);
  // everything the hub can select is exactly the comanda B line, at its own remaining
  expect(selectionTotals(rows, new Set(rows.map((r) => r.key)))).toEqual({ amount: 30, lineIds: ["b1"] });
  expect(billPendingRows(J)).toEqual([{ label: "Comanda 1", value: 80 }, { label: "Postre", value: 30 }]);
  expect(isCommandPaid(J.commands[0], J.lines.slice(0, 2))).toBe(false);
});

test("K: refund after a by-product payment and an adjustment -> one bill row at the canonical balance, nothing selectable", () => {
  expect(billPendingRows(K)).toEqual([{ label: "Comanda 1", value: 30 }]);
  const rows = groupTicketLines(settlementLines(K));
  expect(rows.every((r) => !r.paidInFull && selectableCount(r) === 0)).toBe(true);
  expect(isCommandPaid(K.commands[0], K.lines)).toBe(false);
});

test("a cancelled comanda (obligation 0) that kept money is never labelled Pagada", () => {
  const cancelled = { id: "#X", state: "CANCELADO", settlement: settlement({ netCollected: 30, overCollected: 30, payState: "paid" }) };
  expect(isCommandPaid(cancelled, [])).toBe(false);
});

test("without settlement (older backend) every helper keeps the historical line-derived behaviour", () => {
  for (const session of [A, J, K]) {
    const legacy = withoutSettlement(session);
    expect(commandSettlement(legacy.commands[0])).toBeNull();
    expect(groupTicketLines(settlementLines(legacy))).toEqual(groupTicketLines(legacy.lines));
    expect(billPendingRows(legacy)).toEqual(legacy.lines.filter((l) => l.remaining > 0).map((l) => ({ label: l.description, value: l.remaining })));
    const own = legacy.lines.filter((l) => l.orderId === legacy.commands[0].id);
    expect(isCommandPaid(legacy.commands[0], own)).toBe(own.length > 0 && own.every((l) => !(l.remaining > 0)));
  }
});

test("a comanda never adjusted keeps exactly the same ticket, selection and bill as before", () => {
  const untouched = {
    total: 25.5, paid: 10.25, outstanding: 15.25,
    commands: [{ id: "#H", commandNumber: 1, total: 25.5,
      settlement: settlement({ currentObligation: 25.5, netCollected: 10.25, outstanding: 15.25, payState: "partially_paid", payableByLines: true }) }],
    lines: [
      { id: "h1", orderId: "#H", description: "Pizza", amount: 10.25, paid: 10.25, remaining: 0 },
      { id: "h2", orderId: "#H", description: "Pizza", amount: 10.25, paid: 0, remaining: 10.25 },
      { id: "h3", orderId: "#H", description: "Agua", amount: 5, paid: 0, remaining: 5 },
    ],
  };
  const legacy = withoutSettlement(untouched);
  expect(groupTicketLines(settlementLines(untouched)).map(({ pendingCount: _p, ...r }) => r))
    .toEqual(groupTicketLines(legacy.lines).map(({ pendingCount: _p, ...r }) => r));
  expect(billPendingRows(untouched)).toEqual(billPendingRows(legacy));
});

test("a Por productos selection above what the table still owes is not sent", () => {
  expect(selectionFitsOutstanding(30, 10)).toBe(false);
  expect(selectionFitsOutstanding(10, 10)).toBe(true);
  expect(selectionFitsOutstanding(0.1 + 0.2, 0.3)).toBe(true);
});
