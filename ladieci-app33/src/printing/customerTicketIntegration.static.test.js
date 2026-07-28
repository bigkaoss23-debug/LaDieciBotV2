const fs = require("fs");
const path = require("path");

const srcRoot = path.join(__dirname, "..");
const orderModalPath = path.join(srcRoot, "components", "ModificaOrdenModal.jsx");
const printModalPath = path.join(__dirname, "components", "CustomerTicketPrintModal.jsx");
const printCssPath = path.join(__dirname, "components", "TicketDocumentView.css");
const browserAdapterPath = path.join(__dirname, "adapters", "browserPrintAdapter.js");
const semanticViewPath = path.join(__dirname, "components", "TicketDocumentView.jsx");

const read = (file) => fs.readFileSync(file, "utf8");

test("customer ticket CTA is limited to persisted orders and mounts only the customer modal", () => {
  const source = read(orderModalPath);

  expect(source).toContain("!!String(orden.id ?? \"\").trim() && !orden._temp && parseItems(orden.items).length > 0");
  expect(source).toContain("setShowCustomerTicket(true)");
  expect(source).toContain("<CustomerTicketPrintModal order={orden}");
  expect(source).not.toMatch(/CustomerTicketPrintModal[^]*ticketType\s*=\s*["'{]?(?:KITCHEN|COCINA)/i);
  expect(source).not.toMatch(/(?:A Cocina|handleCocina|set.*Cocina)[^]*setShowCustomerTicket\(true\)/);
});

test("window.print is isolated in the browser adapter and the UI never claims success", () => {
  const modalSource = read(printModalPath);
  const adapterSource = read(browserAdapterPath);

  expect(modalSource).not.toMatch(/\bwindow\.print\s*\(/);
  expect(adapterSource.match(/\bwindow\.print\s*\(/g)).toHaveLength(1);
  expect(modalSource).toContain("Resultado no verificable");
  expect(modalSource).not.toMatch(/\b(?:Impreso|Ticket stampato|Stampante online|Stampante offline)\b/i);
  expect(adapterSource).not.toMatch(/\bprinted\b/i);
});

test("print CSS hides application chrome and locks the customer sheet to 58 mm", () => {
  const source = read(printCssPath);
  const printRules = source.slice(source.indexOf("@media print"));

  expect(printRules).toContain("body.customer-ticket-print-open> *:not(.customer-ticket-modal){display:none!important}");
  expect(printRules).toContain("body.customer-ticket-print-open *{visibility:hidden!important}");
  expect(printRules).toContain("body.customer-ticket-print-open .customer-ticket-modal,");
  expect(printRules).toContain("position:static!important");
  expect(printRules).toContain(".customer-ticket-print-sheet");
  expect(printRules).toContain("@page{size:58mm auto;margin:0}");
  expect(printRules).toContain("width:58mm!important");
  expect(printRules).toContain("padding:3mm 5mm!important");
  expect(printRules).toContain(".customer-ticket-print-sheet.paper-58{--ticket-paper-width:58mm;--ticket-content-width:48mm}");
  expect(printRules).not.toContain(".customer-ticket-print-sheet.paper-80");
});

test("preview and print share the semantic TicketDocument renderer", () => {
  const modalSource = read(printModalPath);
  const previewSource = read(path.join(__dirname, "components", "TicketPreview.jsx"));
  const semanticSource = read(semanticViewPath);

  expect(modalSource).toContain('<TicketDocumentView document={prepared.document}');
  expect(previewSource).toContain('<TicketDocumentView document={document}');
  expect(semanticSource).toContain("block.type === \"columns\"");
  expect(semanticSource).toContain("block.type === \"separator\"");
});
