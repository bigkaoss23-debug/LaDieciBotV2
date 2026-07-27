const fs = require("fs");
const path = require("path");

const srcRoot = path.join(__dirname, "..");
const orderModalPath = path.join(srcRoot, "components", "ModificaOrdenModal.jsx");
const printModalPath = path.join(__dirname, "components", "CustomerTicketPrintModal.jsx");
const printCssPath = path.join(__dirname, "components", "CustomerTicketPrintModal.css");
const browserAdapterPath = path.join(__dirname, "adapters", "browserPrintAdapter.js");

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

test("print CSS hides application chrome and prints only the selected 58/80 mm sheet", () => {
  const source = read(printCssPath);
  const printRules = source.slice(source.indexOf("@media print"));

  expect(printRules).toContain("body.customer-ticket-print-open> *:not(.customer-ticket-modal){display:none!important}");
  expect(printRules).toContain("body.customer-ticket-print-open *{visibility:hidden!important}");
  expect(printRules).toContain(".customer-ticket-print-sheet");
  expect(printRules).toContain(".customer-ticket-print-sheet.paper-58{--ticket-paper-width:58mm}");
  expect(printRules).toContain(".customer-ticket-print-sheet.paper-80{--ticket-paper-width:80mm}");
});
