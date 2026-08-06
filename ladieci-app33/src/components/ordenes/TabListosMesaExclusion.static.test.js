// Regression guard for the Mesa/table-order exclusion in TabListos.jsx.
//
// This filter (added 2026-08-01, commit 2ddd8376, the same commit that
// introduced Mesa) is a deliberate financial-safety decision, not an
// oversight: Mesa comandas are served and charged from the table screen
// (payment_transactions/payment_allocations, partial payments across a
// table session). Letting a table order into TabListos's legacy Retirado
// flow would register a second, legacy single-order payment on top of the
// table's own ledger. Before this test, NOTHING in the suite exercised this
// line -- a silent removal of `!o.table_session_id` would have shipped
// clean. This is read-only verification for the "Para servir" slice
// (ServicioPage.jsx now also exposes WaiterListos as a stopgap aggregate
// queue for table orders -- see ServicioPageParaServirTab.static.test.js);
// TabListos.jsx itself is NOT modified by that slice.
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "TabListos.jsx"), "utf8");

test("the listos array excludes any order carrying a table_session_id", () => {
  const line = src.split("\n").find((l) => l.includes("const listos"));
  expect(line).toMatch(/!o\.table_session_id/);
});

test("the retirados array (the Retirado flow) excludes table orders too", () => {
  const line = src.split("\n").find((l) => l.includes("const retirados"));
  expect(line).toMatch(/!o\.table_session_id/);
});
