import fs from "fs";
import path from "path";
import { createCustomerTicket } from "./createCustomerTicket";
import { getPrintFixture } from "./fixtures/orders";
import { ticketDocumentToPlainText } from "./renderTicketDocument";
import { businessHeaderLines } from "./renderCustomerTicket";

const read = (relative) => fs.readFileSync(path.join(__dirname, relative), "utf8");
const viewCss = read("components/TicketDocumentView.css");
const modalCss = read("components/CustomerTicketPrintModal.css");
const previewSource = read("components/TicketPreview.jsx");
const modalSource = read("components/CustomerTicketPrintModal.jsx");
const createdAt = "2026-01-15T19:05:00.000Z";

describe("customer ticket print-ready CSS", () => {
  test("preview and final print use the same semantic document component and stylesheet", () => {
    expect(previewSource).toMatch(/import TicketDocumentView/);
    expect(modalSource).toMatch(/import TicketDocumentView/);
    expect(viewCss).toMatch(/@media print/);
    expect(modalCss).not.toMatch(/@media print/);
  });

  test("defines safe 58/80 mm paper, dynamic height and horizontal containment", () => {
    expect(viewCss).toMatch(/paper-58[^}]*width:58mm[^}]*padding:3mm/);
    expect(viewCss).toMatch(/paper-80[^}]*width:80mm[^}]*padding:3mm/);
    expect(viewCss).toMatch(/height:auto/);
    expect(viewCss).toMatch(/overflow-x:hidden/);
    expect(viewCss).toMatch(/break-inside:avoid/);
    expect(viewCss).not.toMatch(/height:\s*\d+(?:px|mm|cm)/);
  });

  test("prints only the ticket in monochrome without UI controls", () => {
    expect(viewCss).toMatch(/body\.customer-ticket-print-open> \*:not\(\.customer-ticket-modal\)\{display:none!important\}/);
    expect(viewCss).toMatch(/background:#fff!important;color:#000!important/);
    expect(viewCss).toMatch(/\.role-money\{[\s\S]*white-space:nowrap!important/);
  });
});

describe("customer ticket print-ready content matrix", () => {
  const make = (patch, paperWidth = 58) => {
    const base = getPrintFixture("11").order;
    return createCustomerTicket({ ...base, ...patch }, { createdAt, paperWidth });
  };

  test.each([58, 80])("renders short and long content on %i mm with #001", (paperWidth) => {
    const short = make({ service_order_number: 1 }, paperWidth);
    const long = make({
      service_order_number: "001",
      items: [{
        q: 3,
        n: "La Pizza Extraordinariamente Larga de Prueba",
        classicName: "Prosciutto e funghi",
        finalUnitPrice: 12.5,
        extras: [{ name: "Mozzarella di búfala", quantity: 2 }],
        removedIngredients: ["Cebolla"],
        notes: "Cortar en cuatro porciones iguales",
      }],
      totale: 37.5,
      pricing: { subtotal: 40, discount: 2.5, total: 37.5 },
    }, paperWidth);
    expect(ticketDocumentToPlainText(short.document)).toContain("PEDIDO #001");
    const text = ticketDocumentToPlainText(long.document);
    const serialized = JSON.stringify(long.document);
    expect(text).toContain("3×");
    expect(serialized).toContain("Prosciutto e funghi");
    expect(serialized).toContain("+ Mozzarella di búfala ×2");
    expect(text).toContain("SIN Cebolla");
    expect(text).toContain("Nota: Cortar en cuatro");
    expect(text).toContain("Descuento");
  });

  test.each([
    ["RITIRO", "PAGADO"],
    ["DOMICILIO", "PENDIENTE"],
  ])("renders fulfilment %s and payment %s", (tipo_consegna, status) => {
    const { document } = make({
      fulfilment_type: tipo_consegna,
      delivery_fee: tipo_consegna === "DOMICILIO" ? 2.5 : 0,
      payment: { method: status === "PAGADO" ? "TARJETA" : null, status },
      tel: "+34 600 123 456",
      nombre: "Ana María",
    });
    const text = ticketDocumentToPlainText(document);
    expect(text).toContain(tipo_consegna);
    expect(text).toContain(status);
    expect(text).toContain("A*** M***");
    expect(text).toContain("*** *** 456");
  });

  test("business header supports complete and partial future configuration without blank rows", () => {
    expect(businessHeaderLines({
      address: "Calle Ejemplo 1",
      town: "Madrid",
      phone: "+34 900 000 000",
    })).toEqual(["Calle Ejemplo 1", "Madrid", "+34 900 000 000"]);
    expect(businessHeaderLines({
      address: "Calle Ejemplo 1",
      town: null,
      phone: "",
    })).toEqual(["Calle Ejemplo 1"]);
  });

  test("euro values use a non-breaking separator", () => {
    const { document } = make({ totale: 1234.56, pricing: { subtotal: 1234.56, total: 1234.56 } });
    const serialized = JSON.stringify(document);
    expect(serialized).toContain("\u00a0€");
    expect(serialized).not.toMatch(/\d €/);
  });
});
