import { BROWSER_PRINT_OUTCOMES, createBrowserPrintAdapter } from "./adapters/browserPrintAdapter";
import { CUSTOMER_TICKET_BUSINESS_PROFILE } from "./businessProfile";
import { createCustomerTicket } from "./createCustomerTicket";
import { getPrintFixture } from "./fixtures/orders";
import { ticketDocumentToPlainText } from "./renderTicketDocument";
import { formatServiceOrderNumber, normalizeServiceOrderNumber, resolveServiceOrderNumber } from "./orderNumber";
import { maskCustomerName, maskCustomerPhone } from "./privacy";

const createdAt = "2026-01-15T19:05:00.000Z";

describe("customer ticket production flow", () => {
  test("uses the safe business profile, 58 mm default and mandatory disclaimer", () => {
    const order = { ...getPrintFixture("11").order };
    const { snapshot, document } = createCustomerTicket(order, { createdAt });
    const text = ticketDocumentToPlainText(document);
    expect(snapshot.paper_width).toBe(58);
    expect(text).toContain("LA 10 PIZZERÍA");
    expect(text).toContain(CUSTOMER_TICKET_BUSINESS_PROFILE.document_label);
    expect(text).toContain(CUSTOMER_TICKET_BUSINESS_PROFILE.non_fiscal_label);
    expect(text.replace(/\s+/g, " ")).toContain(CUSTOMER_TICKET_BUSINESS_PROFILE.footer_message);
  });

  test("supports 80 mm and strips address and phone from the normal copy snapshot", () => {
    const order = { ...getPrintFixture("04").order };
    const { snapshot, document } = createCustomerTicket(order, { createdAt, paperWidth: 80 });
    const searchable = JSON.stringify({ snapshot, document });
    expect(snapshot.paper_width).toBe(80);
    expect(searchable).not.toContain(order.direccion);
    expect(searchable).not.toContain(order.tel);
  });

  test("prints masked customer data, removes free-form delivery notes and never doubles the order prefix", () => {
    const order = {
      ...getPrintFixture("04").order,
      id: "#723",
      service_order_number: "Pedido ##723",
      nombre: "Mario Rossi",
      tel: "+34 600 123 456",
      direccion_note: "SECRETO-PII-NOTA",
    };
    const { snapshot, document } = createCustomerTicket(order, { createdAt });
    const text = ticketDocumentToPlainText(document);
    expect(snapshot.order.order_number).toBe("723");
    expect(snapshot.customer).toMatchObject({
      display_name: "M*** R***",
      masked_phone: "*** *** 456",
    });
    expect(snapshot.delivery.delivery_notes).toEqual([]);
    expect(text).toContain("PEDIDO #723");
    expect(text).not.toContain("##723");
    expect(JSON.stringify({ snapshot, document })).not.toContain("SECRETO-PII-NOTA");
  });

  test("rejects temporary orders", () => {
    const order = { ...getPrintFixture("11").order, _temp: true };
    expect(() => createCustomerTicket(order, { createdAt })).toThrow("persisted order");
  });

  test("renders artistic then classic names with configuration and notes", () => {
    const order = {
      ...getPrintFixture("11").order,
      items: [{
        q: 2,
        n: "La Tentación",
        classicName: "Prosciutto e funghi",
        finalUnitPrice: 12.5,
        extras: [{ name: "Búfala", quantity: 2 }],
        removedIngredients: ["Cebolla"],
        notes: "Cortar en cuatro",
      }],
      totale: 25,
      pricing: { total: 25 },
    };
    const { snapshot, document } = createCustomerTicket(order, { createdAt });
    const text = ticketDocumentToPlainText(document);
    expect(snapshot.customer.items[0]).toMatchObject({
      primary_name: "La Tentación",
      secondary_name: "Prosciutto e funghi",
    });
    expect(text).toContain("La Tentación");
    expect(text).toContain("Prosciutto e funghi");
    expect(text).toContain("+ Búfala ×2");
    expect(text).toContain("SIN Cebolla");
    expect(text).toContain("Nota: Cortar en cuatro");
  });

  test("browser adapter opens only the supplied print function and never confirms printing", async () => {
    const statuses = [];
    const printFunction = jest.fn();
    const result = await createBrowserPrintAdapter({ printFunction }).print({
      onStatus: (status) => statuses.push(status),
    });
    expect(printFunction).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual([
      BROWSER_PRINT_OUTCOMES.DIALOG_OPENED,
      BROWSER_PRINT_OUTCOMES.USER_OUTCOME_UNKNOWN,
    ]);
    expect(result).toEqual({
      status: BROWSER_PRINT_OUTCOMES.USER_OUTCOME_UNKNOWN,
      ok: false,
      error_code: null,
    });
  });

  test("browser adapter blocks a concurrent dialog", async () => {
    let concurrent;
    const second = createBrowserPrintAdapter({ printFunction: jest.fn() });
    const first = createBrowserPrintAdapter({
      printFunction: () => { concurrent = second.print(); },
    });
    await first.print();
    await expect(concurrent).resolves.toMatchObject({
      status: BROWSER_PRINT_OUTCOMES.FAILED,
      error_code: "PRINT_DIALOG_IN_PROGRESS",
    });
  });

  test("browser adapter reports failure without a false confirmation", async () => {
    const result = await createBrowserPrintAdapter({
      printFunction: () => { throw new Error("dialog unavailable"); },
    }).print();
    expect(result).toMatchObject({
      status: BROWSER_PRINT_OUTCOMES.FAILED,
      ok: false,
      error_code: "PRINT_DIALOG_FAILED",
    });
  });
});

describe("customer ticket display helpers", () => {
  test.each([
    ["723", "723"],
    ["#723", "723"],
    ["##723", "723"],
    ["Pedido #723", "723"],
    [" Orden ##723 ", "723"],
  ])("normalizes legacy service number %s", (input, expected) => {
    expect(normalizeServiceOrderNumber(input)).toBe(expected);
    expect(formatServiceOrderNumber(input)).toBe(`#${expected}`);
  });

  test("prefers service_order_number and masks customer fields", () => {
    expect(resolveServiceOrderNumber({ service_order_number: "#42", id: "#99" })).toBe("42");
    expect(maskCustomerName("Ana María")).toBe("A*** M***");
    expect(maskCustomerPhone("+34 600 123 456")).toBe("*** *** 456");
  });
});
