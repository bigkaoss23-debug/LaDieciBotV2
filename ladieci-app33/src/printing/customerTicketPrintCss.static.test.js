import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createCustomerTicket } from "./createCustomerTicket";
import { getPrintFixture } from "./fixtures/orders";
import { ticketDocumentToPlainText } from "./renderTicketDocument";
import { businessHeaderLines, customerPaymentLine, shouldShowCustomerSubtotal } from "./renderCustomerTicket";
import TicketDocumentView from "./components/TicketDocumentView";

const read = (relative) => fs.readFileSync(path.join(__dirname, relative), "utf8");
const viewCss = read("components/TicketDocumentView.css");
const modalCss = read("components/CustomerTicketPrintModal.css");
const previewSource = read("components/TicketPreview.jsx");
const modalSource = read("components/CustomerTicketPrintModal.jsx");
const calibrationSource = fs.readFileSync(path.join(__dirname, "../../scripts/calibration/58mm-print-calibration.html"), "utf8");
const createdAt = "2026-01-15T19:05:00.000Z";

describe("customer ticket print-ready CSS", () => {
  test("preview and final print use the same semantic document component and stylesheet", () => {
    expect(previewSource).toMatch(/import TicketDocumentView/);
    expect(modalSource).toMatch(/import TicketDocumentView/);
    expect(viewCss).toMatch(/@media print/);
    expect(modalCss).not.toMatch(/@media print/);
  });

  test("defines the approved 58 mm paper with a centered 48 mm safe content width", () => {
    expect(viewCss).toMatch(/paper-58[^}]*--ticket-content-width:48mm[^}]*width:58mm[^}]*padding:3mm 5mm/);
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

  test("locks physical print to unscaled 58 mm geometry independently of the preview", () => {
    const printRules = viewCss.slice(viewCss.indexOf("@media print"));
    expect(printRules).toContain("@page{size:58mm auto;margin:0}");
    expect(printRules).toMatch(/html,body\{[^}]*width:58mm!important[^}]*margin:0!important[^}]*padding:0!important/);
    expect(printRules).toMatch(/customer-ticket-modal,[\s\S]*customer-ticket-panel\{[^}]*position:static!important[^}]*width:58mm!important[^}]*transform:none!important/);
    expect(printRules).toMatch(/customer-ticket-print-sheet\{[^}]*width:58mm!important[^}]*padding:3mm 5mm!important/);
    expect(printRules).toMatch(/customer-ticket-print-sheet\{[^}]*position:static!important[^}]*transform:none!important/);
    expect(printRules).not.toMatch(/\bzoom\s*:/);
    expect(modalCss).not.toMatch(/@media print|zoom\s*:/);
    expect(previewSource).toContain('<TicketDocumentView document={document}');
    expect(modalSource).toContain('<TicketDocumentView document={prepared.document}');
  });

  test("keeps product text wrappable while protecting monetary values and rows", () => {
    expect(viewCss).toMatch(/ticket-document-columns\{[^}]*break-inside:avoid/);
    expect(viewCss).toMatch(/ticket-document-columns>span\{[^}]*overflow-wrap:anywhere/);
    expect(viewCss).toMatch(/role-money\{white-space:nowrap;overflow-wrap:normal;word-break:normal\}/);
    expect(viewCss).toMatch(/@media print[\s\S]*role-money\{[\s\S]*white-space:nowrap!important/);
  });

  test("provides a development-only calibration sheet outside the production UI bundle", () => {
    expect(calibrationSource).toContain("@page { size: 58mm auto; margin: 0; }");
    expect(calibrationSource).toMatch(/\.reference\s*\{[^}]*width: 48mm/);
    expect(calibrationSource).toContain("left: 24mm");
    expect(calibrationSource).toContain("10 mm");
    expect(calibrationSource).toContain("width: 20mm");
    expect(previewSource).not.toContain("58mm-print-calibration");
    expect(modalSource).not.toContain("58mm-print-calibration");
  });

  test("uses the exact thermal PNG at the same 20 mm size in preview and physical print", () => {
    const logoPath = path.join(__dirname, "../../public/printing/la-dieci-thermal-logo.png");
    const png = fs.readFileSync(logoPath);
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(774);
    expect(png.readUInt32BE(20)).toBe(640);

    const { document } = createCustomerTicket(getPrintFixture("11").order, { createdAt, paperWidth: 58 });
    const markup = renderToStaticMarkup(<TicketDocumentView document={document} />);
    expect(markup).toContain('src="/printing/la-dieci-thermal-logo.png"');
    expect(markup).toContain('alt="La Dieci"');
    expect(markup).toMatchSnapshot();
    expect(viewCss).toMatch(/role-business-logo img\{[^}]*width:20mm[^}]*height:auto[^}]*image-rendering:pixelated/);
    expect(viewCss).toMatch(/@media print[\s\S]*role-business-logo img\{[^}]*width:20mm!important[^}]*height:auto!important[^}]*filter:none!important/);
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
      business_type: "PIZZERÍA",
      address: "Calle Ejemplo 1",
      town: "Madrid",
      phone: "+34 900 000 000",
    })).toEqual(["PIZZERÍA", "Calle Ejemplo 1", "Madrid", "Tel. +34 900 000 000"]);
    expect(businessHeaderLines({
      business_type: "PIZZERÍA",
      address: "Calle Ejemplo 1",
      town: null,
      phone: "",
    })).toEqual(["PIZZERÍA", "Calle Ejemplo 1"]);
  });

  test("keeps products before totals and operational metadata in the minimal 58 mm order", () => {
    const text = ticketDocumentToPlainText(make({ service_order_number: 1 }).document);
    expect(text.indexOf("Margarita de")).toBeLessThan(text.indexOf("TOTAL"));
    expect(text.indexOf("TOTAL")).toBeLessThan(text.indexOf("RITIRO · 20:20"));
    expect(text.indexOf("RITIRO · 20:20")).toBeLessThan(text.indexOf("PEDIDO #001"));
    expect(text.indexOf("PEDIDO #001")).toBeLessThan(text.indexOf("Gracias por tu pedido"));
    expect(text).not.toMatch(/COPIA DEL PEDIDO|Canal:|Estado:|NO VÁLIDA COMO FACTURA/);
  });

  test("shows MESA only for an actual banco table order, never for a stale TEL table number", () => {
    const table = ticketDocumentToPlainText(make({ channel: "BANCO", table_number: "T-12" }).document);
    const tel = ticketDocumentToPlainText(make({ channel: "TEL", table_number: "B2" }).document);
    expect(table).toContain("MESA T-12 · 20:20");
    expect(table).not.toContain("RITIRO · 20:20");
    expect(tel).toContain("RITIRO · 20:20");
    expect(tel).not.toContain("MESA");
  });

  test("prints subtotal only when it adds useful information", () => {
    expect(shouldShowCustomerSubtotal({ subtotal: 9, discount: 0, delivery_fee: 0, total: 9 })).toBe(false);
    expect(shouldShowCustomerSubtotal({ subtotal: 9, discount: 1, delivery_fee: 0, total: 8 })).toBe(true);
    expect(shouldShowCustomerSubtotal({ subtotal: 9, discount: 0, delivery_fee: 2.5, total: 11.5 })).toBe(true);
    expect(shouldShowCustomerSubtotal({ subtotal: 9, discount: 0, delivery_fee: 0, total: 8 })).toBe(true);
  });

  test.each([
    [{ status: "PENDIENTE", method: "EFECTIVO" }, "PAGO: PENDIENTE"],
    [{ status: "PAGADO", method: "EFECTIVO" }, "PAGADO · EFECTIVO"],
    [{ status: "PAGADO", method: "TARJETA" }, "PAGADO · TARJETA"],
    [{ status: "PAGADO", method: "BIZUM" }, "PAGADO · BIZUM"],
  ])("renders payment truthfully: %#", (payment, expected) => {
    expect(customerPaymentLine(payment)).toBe(expected);
  });

  test("footer is exactly the approved three lines", () => {
    const text = ticketDocumentToPlainText(make({}).document);
    expect(text).toContain("Gracias por tu pedido\n");
    expect(text).toContain("¡Hasta pronto!\n");
    expect(text).toContain("TICKET NO FISCAL");
    expect(text).not.toContain("NO VÁLIDA COMO FACTURA");
  });

  test("euro values use a non-breaking separator", () => {
    const { document } = make({ totale: 1234.56, pricing: { subtotal: 1234.56, total: 1234.56 } });
    const serialized = JSON.stringify(document);
    expect(serialized).toContain("\u00a0€");
    expect(serialized).not.toMatch(/\d €/);
  });
});
