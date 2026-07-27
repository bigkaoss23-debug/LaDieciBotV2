import { BROWSER_PRINT_OUTCOMES, createBrowserPrintAdapter } from "./adapters/browserPrintAdapter";
import { CUSTOMER_TICKET_BUSINESS_PROFILE } from "./businessProfile";
import { createCustomerTicket } from "./createCustomerTicket";
import { getPrintFixture } from "./fixtures/orders";
import { ticketDocumentToPlainText } from "./renderTicketDocument";

const createdAt = "2026-01-15T19:05:00.000Z";

describe("customer ticket production flow", () => {
  test("uses the safe business profile, 58 mm default and mandatory disclaimer", () => {
    const order = { ...getPrintFixture("11").order };
    const { snapshot, document } = createCustomerTicket(order, { createdAt });
    const text = ticketDocumentToPlainText(document);
    expect(snapshot.paper_width).toBe(58);
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

  test("rejects temporary orders", () => {
    const order = { ...getPrintFixture("11").order, _temp: true };
    expect(() => createCustomerTicket(order, { createdAt })).toThrow("persisted order");
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
