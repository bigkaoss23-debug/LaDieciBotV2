// ===============================================================
// J-1 — what the Finalizar confirmation PROMISES.
//
// A close must never advertise something it does not do. The V3 close ends the
// Operational Service; it does not delete orders, does not cancel them, does
// not reset money and does not touch cash counts — an unresolved order becomes
// an incident carrying its real economic exposure (proven live on 2026-08-20,
// when #999008 stayed POR_CONFIRMAR through a real close).
//
// The modal used to read "Se archivarán y eliminarán" directly above the
// figures, which told an operator their records were about to be destroyed on
// the very screen that now also shows the day's economy and their cash count.
// This file pins the corrected promise.
const fs = require("fs");
const path = require("path");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "ServicioPage.jsx"), "utf8",
);
// Only RENDERED copy counts. The source necessarily quotes the wording these
// rules forbid — inside the JSX comment that explains why it was removed — so
// block comments ({/* ... */} and /* ... */) and line comments are all
// stripped before anything is asserted. Getting this wrong would make the test
// pass or fail on its own documentation rather than on the UI.
const RENDERED = SOURCE
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !/^\s*\/\//.test(line))
  .join("\n");

test("the confirmation never promises to delete or cancel anything", () => {
  for (const forbidden of [/Se archivar[áa]n y eliminar[áa]n/i, /se eliminar[áa]n los pedidos/i, /se anular[áa]n/i]) {
    expect(RENDERED).not.toMatch(forbidden);
  }
});

test("it states what actually happens: the Operational Service closes", () => {
  expect(RENDERED).toContain("Se cierra el servicio operativo");
  expect(RENDERED).toContain('data-testid="close-scope-note"');
});

test("and it states explicitly that the economic records survive", () => {
  expect(RENDERED).toContain("Los registros económicos y los conteos de caja se conservan.");
  expect(RENDERED).toContain('data-testid="records-preserved-note"');
});

test("the two economic scopes are rendered by the dedicated panel, above the buttons", () => {
  const panelAt = RENDERED.indexOf("<FinalizarReconciliationPanel");
  const confirmAt = RENDERED.indexOf("Confirmar — cerrar servicio");
  expect(panelAt).toBeGreaterThan(0);
  expect(confirmAt).toBeGreaterThan(0);
  // The operator sees the variance BEFORE the confirm control, never behind
  // a second screen.
  expect(panelAt).toBeLessThan(confirmAt);
});

test("the preflight never gates the close: it is fetched separately from the scan", () => {
  // A reconciliation read that fails must not prevent Finalizar, so it lives
  // in its own try/catch after the scan rather than inside it.
  expect(RENDERED).toContain("economyApi.reconciliation({})");
  expect(RENDERED).toContain("reconError");
  // And no confirm button is disabled by the reconciliation state.
  expect(RENDERED).not.toMatch(/disabled=\{[^}]*recon/);
});
