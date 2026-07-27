import { MOCK_PRINT_STATUSES, PAPER_WIDTHS, TICKET_DOCUMENT_VERSION, TICKET_SNAPSHOT_VERSION, TICKET_TYPES, assertPaperWidth, assertTicketSnapshot, assertTicketType } from "./contracts";
import { createMockPrinterAdapter, MOCK_OUTCOMES } from "./adapters/mockPrinterAdapter";
import { getPrintFixture, PRINT_ORDER_FIXTURES } from "./fixtures/orders";
import { buildPrintIdempotencyKey } from "./idempotency";
import { wrapText } from "./layoutProfiles";
import { normalizeOrderForTicket } from "./normalizeOrderForTicket";
import { renderTicketDocument, ticketDocumentToPlainText } from "./renderTicketDocument";

const normalize = (fixtureId = "01", ticketType = TICKET_TYPES.KITCHEN, paperWidth = 80, overrides = {}) => {
  const fixture = getPrintFixture(fixtureId);
  return normalizeOrderForTicket({ ...fixture.order, ...overrides }, {
    ticketType, paperWidth, orderRevision: overrides.order_revision || fixture.order.order_revision,
    createdAt: fixture.order.snapshot_created_at,
  });
};

describe("printing contracts", () => {
  test("exposes supported enums and versions", () => {
    expect(Object.values(TICKET_TYPES)).toEqual(["KITCHEN", "KITCHEN_DELTA", "KITCHEN_CORRECTION", "CUSTOMER", "CANCELLATION"]);
    expect(PAPER_WIDTHS).toEqual([58, 80]);
    expect([TICKET_SNAPSHOT_VERSION, TICKET_DOCUMENT_VERSION]).toEqual([1, 1]);
  });
  test("rejects invalid types, widths, incomplete snapshots and versions", () => {
    expect(() => assertTicketType("RECEIPT")).toThrow("Unsupported ticket type");
    expect(() => assertPaperWidth(76)).toThrow("Unsupported paper width");
    expect(() => assertTicketSnapshot({ snapshot_version: 1 })).toThrow();
    expect(() => assertTicketSnapshot({ snapshot_version: 99 })).toThrow("Unsupported snapshot version");
  });
});

describe("normalization", () => {
  test("does not mutate input and deeply freezes the result", () => {
    const source = JSON.parse(JSON.stringify(getPrintFixture("06").order));
    const before = JSON.stringify(source);
    const snapshot = normalizeOrderForTicket(source, { ticketType: TICKET_TYPES.KITCHEN, paperWidth: 80, orderRevision: 1, createdAt: source.snapshot_created_at });
    expect(JSON.stringify(source)).toBe(before);
    expect(Object.isFrozen(snapshot.kitchen.items[0])).toBe(true);
  });
  test("normalizes quantity, extras, removals, notes and allergies", () => {
    const source = { ...getPrintFixture("01").order, items: [{ q: "2", n: "  Pizza   ñora ", extra: "queso", sin: ["cebolla"], sub: "muy hecha", allergies: ["GLUTEN"] }] };
    const item = normalizeOrderForTicket(source, { ticketType: TICKET_TYPES.KITCHEN, paperWidth: 58, orderRevision: 2, createdAt: source.snapshot_created_at }).kitchen.items[0];
    expect(item).toMatchObject({ quantity: 2, name: "Pizza ñora", extras: ["queso"], removed_ingredients: ["cebolla"], notes: ["muy hecha"], allergy_markers: ["GLUTEN"] });
  });
  test("separates delivery, table, prices and payment", () => {
    const snapshot = normalize("04", TICKET_TYPES.CUSTOMER, 80, { table_number: "M4" });
    expect(snapshot.order.table_number).toBe("M4");
    expect(snapshot.delivery.zone).toBe("Q-FICTICIA");
    expect(snapshot.customer.items[0].unit_price).toBe(9);
    expect(snapshot.kitchen.items[0]).not.toHaveProperty("unit_price");
  });
  test("rejects invalid quantities", () => {
    const raw = { ...getPrintFixture("01").order, items: [{ quantity: 0, name: "Inválida" }] };
    expect(() => normalizeOrderForTicket(raw, { ticketType: TICKET_TYPES.KITCHEN, paperWidth: 80, orderRevision: 1, createdAt: raw.snapshot_created_at })).toThrow("positive integer");
  });
  test("covers all 16 synthetic fixtures", () => {
    expect(PRINT_ORDER_FIXTURES).toHaveLength(16);
    PRINT_ORDER_FIXTURES.forEach(({ order }) => expect(normalizeOrderForTicket(order, {
      ticketType: TICKET_TYPES.KITCHEN, paperWidth: 58, orderRevision: order.order_revision, createdAt: order.snapshot_created_at,
    }).privacy.pii_classification).toBe("synthetic_fixture"));
  });
  test("accepts the demonstrated staging order and canonical cart shapes", () => {
    const base = getPrintFixture("04").order;
    const raw = {
      ...base,
      id: "#723",
      order_number: undefined,
      ordered_at: undefined,
      ts: 1768503600000,
      items: JSON.stringify([{
        q: 2, n: "Pelusa", finalUnitPrice: 13, lineTotal: 26,
        extras: [{ name: "Bufala", quantity: 2 }],
        removedIngredients: ["Cebolla"], notes: "Muy hecha",
      }]),
      pricing: undefined, payment: undefined, totale: 28, descuento_importe: 1, delivery_fee: 3,
      metodo_pago: "tarjeta", ya_pagado: true,
    };
    const snapshot = normalizeOrderForTicket(raw, {
      ticketType: TICKET_TYPES.CUSTOMER, paperWidth: 80,
      orderRevision: 1, createdAt: base.snapshot_created_at,
    });
    expect(snapshot.order).toMatchObject({ order_number: "#723", ordered_at: "2026-01-15T19:00:00.000Z" });
    expect(snapshot.customer.items[0]).toMatchObject({
      quantity: 2, extras: ["Bufala ×2"], removed_ingredients: ["Cebolla"],
      notes: ["Muy hecha"], unit_price: 13, line_total: 26,
    });
    expect(snapshot.customer.pricing).toMatchObject({ discount: 1, delivery_fee: 3, total: 28 });
    expect(snapshot.customer.payment).toMatchObject({ method: "tarjeta", status: "PAGADO" });
  });
});

describe("kitchen privacy", () => {
  test("never exposes PII or accounting in kitchen sections or document", () => {
    const secrets = ["PHONE-SECRET-991", "ADDRESS-SECRET-992", "9137.41", "9271.52", "9361.63", "PAYMENT-SECRET-993", "STATUS-SECRET-994"];
    const raw = {
      ...getPrintFixture("04").order, tel: secrets[0], direccion: secrets[1],
      items: [{ quantity: 1, name: "Pizza segura", unit_price: 9137.41, line_total: 9137.41 }],
      pricing: { subtotal: 9271.52, discount: 9361.63, total: 9271.52 },
      payment: { method: secrets[5], status: secrets[6] },
    };
    const snapshot = normalizeOrderForTicket(raw, { ticketType: TICKET_TYPES.KITCHEN, paperWidth: 80, orderRevision: 1, createdAt: raw.snapshot_created_at });
    const searchable = JSON.stringify({ snapshot, document: renderTicketDocument(snapshot) });
    secrets.forEach((secret) => expect(searchable).not.toContain(secret));
  });
});

describe("renderers", () => {
  test.each([
    ["kitchen 58", "01", TICKET_TYPES.KITCHEN, 58],
    ["kitchen 80", "01", TICKET_TYPES.KITCHEN, 80],
    ["customer 58", "11", TICKET_TYPES.CUSTOMER, 58],
    ["customer 80", "11", TICKET_TYPES.CUSTOMER, 80],
  ])("golden %s", (_label, fixtureId, ticketType, width) => {
    expect(ticketDocumentToPlainText(renderTicketDocument(normalize(fixtureId, ticketType, width)))).toMatchSnapshot();
  });
  test.each([
    ["13", TICKET_TYPES.KITCHEN_DELTA, "SOLO ARTÍCULOS NUEVOS"],
    ["14", TICKET_TYPES.KITCHEN_CORRECTION, "CORRECCIÓN"],
    ["15", TICKET_TYPES.CANCELLATION, "ANULACIÓN"],
  ])("renders special ticket %s", (fixtureId, type, marker) => {
    expect(ticketDocumentToPlainText(renderTicketDocument(normalize(fixtureId, type, 80)))).toContain(marker);
  });
  test("wraps long accented content within 58 mm", () => {
    const text = ticketDocumentToPlainText(renderTicketDocument(normalize("16", TICKET_TYPES.KITCHEN, 58)));
    expect(text).toContain("ñora");
    expect(text.split("\n").every((line) => line.length <= 32)).toBe(true);
    expect(wrapText("áéíóú ñ símbolo € texto", 8).every((line) => line.length <= 8)).toBe(true);
    const customer = ticketDocumentToPlainText(renderTicketDocument(normalize("16", TICKET_TYPES.CUSTOMER, 58)));
    expect(customer).toContain("extraordinariamente");
    expect(customer.split("\n").every((line) => line.length <= 32)).toBe(true);
  });
});

describe("idempotency", () => {
  const input = { locationId: "loc-1", orderId: "ord-1", ticketType: TICKET_TYPES.KITCHEN, orderRevision: 2, targetPrinter: "cocina-1", copyNumber: 1 };
  test("is deterministic and identity-sensitive", () => {
    const key = buildPrintIdempotencyKey(input);
    expect(key).toBe(buildPrintIdempotencyKey({ ...input }));
    [{ orderRevision: 3 }, { copyNumber: 2 }, { targetPrinter: "cocina-2" }, { ticketType: TICKET_TYPES.CUSTOMER }]
      .forEach((patch) => expect(buildPrintIdempotencyKey({ ...input, ...patch })).not.toBe(key));
  });
  test("rejects missing data", () => expect(() => buildPrintIdempotencyKey({ ...input, orderId: "" })).toThrow("orderId"));
});

describe("mock adapter", () => {
  const document = () => renderTicketDocument(normalize());
  test.each([
    [MOCK_OUTCOMES.SUCCESS, MOCK_PRINT_STATUSES.PRINTED],
    [MOCK_OUTCOMES.FAILED, MOCK_PRINT_STATUSES.FAILED],
    [MOCK_OUTCOMES.UNKNOWN, MOCK_PRINT_STATUSES.UNKNOWN],
  ])("simulates %s", async (outcome, status) => {
    await expect(createMockPrinterAdapter({ outcome }).print(document())).resolves.toMatchObject({ status });
  });
  test("supports controlled latency", async () => {
    jest.useFakeTimers();
    const promise = createMockPrinterAdapter({ latencyMs: 250 }).print(document());
    jest.advanceTimersByTime(250);
    await expect(promise).resolves.toMatchObject({ status: "printed" });
    jest.useRealTimers();
  });
  test("rejects invalid payload", async () => {
    await expect(createMockPrinterAdapter().print({})).rejects.toThrow("Unsupported document version");
  });
});
