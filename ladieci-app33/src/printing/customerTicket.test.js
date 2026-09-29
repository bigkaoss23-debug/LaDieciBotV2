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
    expect(text).toContain("PIZZERÍA");
    expect(text).toContain("Plaza Itálica 8");
    expect(text).toContain("Roquetas de Mar");
    expect(text).not.toMatch(/LA 10 PIZZERÍA|LA DIECI/);
    expect(text).toContain(CUSTOMER_TICKET_BUSINESS_PROFILE.non_fiscal_label);
    expect(text).toContain("Gracias por tu pedido");
    expect(text).toContain("¡Hasta pronto!");
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

describe("customer ticket identification header (PEDIDO + full name)", () => {
  const make = (patch, paperWidth = 58) => createCustomerTicket({
    ...getPrintFixture("12").order, // channel WA, RITIRO, PENDIENTE
    service_order_number: 42,
    tel: "+34 600 123 456",
    ...patch,
  }, { createdAt, paperWidth });
  const nameBlock = (document) => document.blocks[document.blocks.findIndex((block) => block.type === "separator") + 2];
  const count = (text, needle) => text.split(needle).length - 1;

  test.each([
    ["Juan", "JUAN", "xlarge", "xlarge"],
    ["Juan Pérez", "JUAN PÉREZ", "xlarge", "xlarge"],
    ["Juan Pérez García", "JUAN PÉREZ GARCÍA", "xlarge", "xlarge"],
    ["Nuño Peña Ñáñez", "NUÑO PEÑA ÑÁÑEZ", "xlarge", "xlarge"],
    ["María Concepción Fernández", "MARÍA CONCEPCIÓN FERNÁNDEZ", "large", "xlarge"],
    ["María Concepción Fernández Rodríguez de la Torre", "MARÍA CONCEPCIÓN FERNÁNDEZ RODRÍGUEZ DE LA TORRE", "large", "large"],
  ])("DOMICILIO and RITIRO print %p as %p (58 mm: %s, 80 mm: %s)", (nombre, printed, size58, size80) => {
    for (const fulfilment_type of ["DOMICILIO", "RITIRO"]) {
      for (const channel of ["TEL", "WA", "MANUAL", "BANCO"]) {
        const on58 = make({ nombre, fulfilment_type, channel }, 58);
        const on80 = make({ nombre, fulfilment_type, channel }, 80);
        expect(nameBlock(on58.document)).toMatchObject({ value: printed, size: size58, align: "center", emphasis: "bold" });
        expect(nameBlock(on80.document)).toMatchObject({ value: printed, size: size80, align: "center", emphasis: "bold" });
        expect(ticketDocumentToPlainText(on58.document).replace(/\s+/g, " ")).toContain(printed);
        expect(on58.snapshot.customer.full_name).toBe(nombre);
      }
    }
  });

  test("xlarge/large switch is exactly 19 characters on 58 mm and 30 on 80 mm", () => {
    const n19 = "A".repeat(19);
    const n20 = "A".repeat(20);
    const n30 = "A".repeat(30);
    const n31 = "A".repeat(31);
    expect(nameBlock(make({ nombre: n19 }, 58).document).size).toBe("xlarge");
    expect(nameBlock(make({ nombre: n20 }, 58).document).size).toBe("large");
    expect(nameBlock(make({ nombre: n30 }, 80).document).size).toBe("xlarge");
    expect(nameBlock(make({ nombre: n31 }, 80).document).size).toBe("large");
  });

  test.each([{ nombre: "" }, { nombre: "   " }, { nombre: null }, {}])("empty name %j prints CLIENTE SIN NOMBRE", (patch) => {
    const { document } = make({ ...patch, fulfilment_type: "DOMICILIO", channel: "TEL" });
    expect(nameBlock(document)).toMatchObject({ value: "CLIENTE SIN NOMBRE", align: "center", emphasis: "bold" });
  });

  test("PEDIDO appears exactly once, above the products, and the masked Cliente line is gone", () => {
    for (const fulfilment_type of ["DOMICILIO", "RITIRO"]) {
      const { document } = make({ nombre: "Juan Pérez", fulfilment_type, channel: "TEL" });
      const text = ticketDocumentToPlainText(document);
      expect(count(text, "PEDIDO #042")).toBe(1);
      expect(text.indexOf("PEDIDO #042")).toBeLessThan(text.indexOf("JUAN PÉREZ"));
      expect(text.indexOf("JUAN PÉREZ")).toBeLessThan(text.indexOf("Margarita de"));
      expect(text.indexOf("PIZZERÍA")).toBeLessThan(text.indexOf("PEDIDO #042"));
      expect(text).not.toContain("Cliente:");
      expect(text).not.toContain("J*** P***");
    }
  });

  test("keeps the phone masked, the fulfilment line, date, reprint marker and footer", () => {
    const { document } = make({ nombre: "Juan Pérez", fulfilment_type: "DOMICILIO", channel: "TEL" });
    const text = ticketDocumentToPlainText(document);
    expect(text).toContain("Tel: *** *** 456");
    expect(text).not.toContain("600 123");
    expect(text).toContain("DOMICILIO · 20:20");
    expect(text).toContain("TICKET NO FISCAL");
    const reprint = ticketDocumentToPlainText(createCustomerTicket({
      ...getPrintFixture("12").order, nombre: "Juan", fulfilment_type: "RITIRO", channel: "TEL", service_order_number: 42,
    }, { createdAt, isReprint: true, copyNumber: 2 }).document);
    expect(reprint).toContain("REIMPRESIÓN · COPIA 2");
    expect(count(reprint, "PEDIDO #042")).toBe(1);
  });

  test.each([
    ["BANCO counter pickup", { channel: "BANCO", fulfilment_type: "RITIRO" }, "RITIRO · 20:20"],
    ["BANCO with delivery", { channel: "BANCO", fulfilment_type: "DOMICILIO" }, "DOMICILIO · 20:20"],
    ["MESA", { channel: "BANCO", fulfilment_type: "RITIRO", table_number: "T-12" }, "MESA T-12 · 20:20"],
  ])("%s gets the same identification header (PEDIDO + name once, no masked Cliente line)", (_label, patch, context) => {
    for (const paperWidth of [58, 80]) {
      const { document, snapshot } = make({ nombre: "Juan Pérez García", ...patch }, paperWidth);
      const text = ticketDocumentToPlainText(document);
      expect(nameBlock(document)).toMatchObject({ value: "JUAN PÉREZ GARCÍA", size: "xlarge", align: "center", emphasis: "bold" });
      expect(count(text, "PEDIDO #042")).toBe(1);
      expect(count(text, "JUAN PÉREZ GARCÍA")).toBe(1);
      expect(text.indexOf("PIZZERÍA")).toBeLessThan(text.indexOf("PEDIDO #042"));
      expect(text.indexOf("JUAN PÉREZ GARCÍA")).toBeLessThan(text.indexOf("Margarita de"));
      // the context line stays where it was, after the payment line
      expect(text).toContain(context);
      expect(text.indexOf("PAGO: PENDIENTE")).toBeLessThan(text.indexOf(context));
      expect(text).not.toContain("Cliente:");
      expect(text).not.toContain("J*** P*** G***");
      expect(text).toContain("Tel: *** *** 456");
      expect(text).toContain("TICKET NO FISCAL");
      expect(snapshot.customer.full_name).toBe("Juan Pérez García");
    }
  });

  test("BANCO and MESA: empty name prints CLIENTE SIN NOMBRE and long names wrap at large", () => {
    for (const patch of [{ channel: "BANCO", fulfilment_type: "RITIRO" }, { channel: "BANCO", fulfilment_type: "RITIRO", table_number: "T-12" }]) {
      expect(nameBlock(make({ ...patch, nombre: "" }).document).value).toBe("CLIENTE SIN NOMBRE");
      const long = make({ ...patch, nombre: "María Concepción Fernández Rodríguez" });
      expect(nameBlock(long.document)).toMatchObject({ value: "MARÍA CONCEPCIÓN FERNÁNDEZ RODRÍGUEZ", size: "large" });
      expect(nameBlock(make({ ...patch, nombre: "Nuño Peña Ñáñez" }).document).value).toBe("NUÑO PEÑA ÑÁÑEZ");
    }
  });

  test("BANCO order with delivery gets the identification header before the products", () => {
    const text = ticketDocumentToPlainText(make({ nombre: "Juan Pérez", fulfilment_type: "DOMICILIO", channel: "BANCO" }).document);
    expect(text).toContain("JUAN PÉREZ");
    expect(text.indexOf("PEDIDO #042")).toBeLessThan(text.indexOf("Margarita de"));
  });

  test("address, phone and delivery notes never reach the ticket", () => {
    const { snapshot, document } = make({
      nombre: "Juan Pérez", fulfilment_type: "DOMICILIO", channel: "TEL",
      direccion: "CALLE-SECRETA 9", direccion_note: "NOTA-SECRETA",
    });
    const searchable = JSON.stringify({ snapshot, document });
    expect(searchable).not.toContain("CALLE-SECRETA");
    expect(searchable).not.toContain("NOTA-SECRETA");
    expect(searchable).not.toContain("+34 600 123 456");
  });
});
