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
const createdAt = "2026-01-15T19:05:00.000Z";

describe("customer ticket print-ready CSS", () => {
  test("preview and final print use the same semantic document component and stylesheet", () => {
    expect(previewSource).toMatch(/import TicketDocumentView/);
    expect(modalSource).toMatch(/import TicketDocumentView/);
    expect(viewCss).toMatch(/@media print/);
    expect(modalCss).not.toMatch(/@media print/);
  });

  test("defines safe 58/80 mm paper, dynamic height and horizontal containment", () => {
    // Native content width ~46mm (48mm printable page * 0.96, per physical print
    // testing), centered with symmetric horizontal padding - no per-side bias, no
    // scale/transform. Extra bottom padding is a thermal-feed safety margin for
    // the footer.
    expect(viewCss).toMatch(/paper-58[^}]*width:46mm[^}]*padding:1\.5mm 1\.5mm 4\.5mm 1\.5mm/);
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
    expect(viewCss).toMatch(/role-business-logo img\{[^}]*width:18.4mm[^}]*height:auto[^}]*image-rendering:pixelated/);
    expect(viewCss).toMatch(/@media print[\s\S]*role-business-logo img\{[^}]*width:18.4mm!important[^}]*height:auto!important[^}]*filter:none!important/);
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
      channel: "TEL",
      tel: "+34 600 123 456",
      nombre: "Ana María",
    });
    const text = ticketDocumentToPlainText(document);
    expect(text).toContain(tipo_consegna);
    expect(text).toContain(status);
    // Identification header: full name, uppercase, no "Cliente:" line; phone stays masked.
    expect(text).toContain("ANA MARÍA");
    expect(text).not.toContain("A*** M***");
    expect(text).not.toContain("Cliente:");
    expect(text).toContain("*** *** 456");
    expect(text).not.toContain("600 123");
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

  test("keeps products before totals and operational metadata in the minimal 58 mm order (BANCO counter pickup: legacy layout)", () => {
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

describe("customer ticket identification header markup", () => {
  const order = (patch) => ({
    ...getPrintFixture("12").order, // channel WA, RITIRO
    service_order_number: 42,
    tel: "+34 600 123 456",
    ...patch,
  });

  test.each([58, 80])("renders PEDIDO + name right under the business header on %i mm", (paperWidth) => {
    const { document } = createCustomerTicket(
      order({ channel: "TEL", fulfilment_type: "DOMICILIO", nombre: "Juan Pérez García" }),
      { createdAt, paperWidth },
    );
    const types = document.blocks.map((block) => block.type);
    const firstSeparator = types.indexOf("separator");
    expect(document.blocks[firstSeparator + 1]).toMatchObject({ value: "PEDIDO #042", align: "center", emphasis: "bold", size: "xlarge" });
    expect(document.blocks[firstSeparator + 2]).toMatchObject({ value: "JUAN PÉREZ GARCÍA", align: "center", emphasis: "bold", size: "xlarge" });
    expect(types[firstSeparator + 3]).toBe("separator");
    // no ellipsis, name is never cut
    expect(JSON.stringify(document)).not.toMatch(/…|\.\.\./);
  });

  test("markup: xlarge for a short name and large for a long name on 58 mm", () => {
    const short = createCustomerTicket(order({ channel: "TEL", fulfilment_type: "DOMICILIO", nombre: "Juan Pérez García" }), { createdAt, paperWidth: 58 });
    const long = createCustomerTicket(order({ channel: "TEL", fulfilment_type: "DOMICILIO", nombre: "María Concepción Fernández Rodríguez" }), { createdAt, paperWidth: 58 });
    const shortMarkup = renderToStaticMarkup(<TicketDocumentView document={short.document} />);
    const longMarkup = renderToStaticMarkup(<TicketDocumentView document={long.document} />);
    expect(shortMarkup).toContain('emphasis-bold size-xlarge">JUAN PÉREZ GARCÍA<');
    expect(longMarkup).toContain('emphasis-bold size-large">MARÍA CONCEPCIÓN FERNÁNDEZ RODRÍGUEZ<');
    expect(longMarkup).toMatchSnapshot();
  });

  test("identification blocks match no positional CSS rule (separator/margin selectors stay untouched)", () => {
    // .align-left.emphasis-bold.size-normal is reserved for the payment line, and
    // separator + .role-secondary.align-center for the footer: the new blocks are
    // center/bold/xlarge|large without a role, so neither selector can match them.
    const { document } = createCustomerTicket(order({ channel: "TEL", nombre: "Juan" }), { createdAt });
    const [pedido, name] = document.blocks.filter((block) => block.type === "text" && block.size !== "normal" || block.value === "JUAN");
    for (const block of [pedido, name]) {
      expect(block.align).toBe("center");
      expect(block.role).toBeNull();
    }
  });
});
