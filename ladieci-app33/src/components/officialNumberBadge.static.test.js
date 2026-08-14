/**
 * Il numero ufficiale deve restare visibile.
 *
 * pizzaLabel non lo mette più nel titolo; sulla linea staging NON esisteva
 * ancora alcun badge alternativo, quindi il solo allineamento di constants.js
 * lo avrebbe fatto sparire dalla card. Questi test statici verificano che il
 * footer badge sia cablato in entrambi i modali.
 */
import fs from "fs";
import path from "path";

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8");

describe("badge numero ufficiale", () => {
  const modifica = read("ModificaOrdenModal.jsx");
  // CANONICAL_MANUAL_PICKER_SLICE_2 -- ItemPickerModal no longer renders its
  // own picker grid (its footer-badge numbering lived there); it composes
  // the shared components/order/CatalogBrowser.jsx, also used by Mesa's
  // MesaOrderBuilder.jsx, which renders the number as a corner badge
  // (Mesa's own proven style, adopted as the one shared convention instead
  // of Teléfono keeping a second, different footer-row style for the same
  // catalogue -- see CANONICAL_MANUAL_PICKER_SLICE_2_MESA_TELEFONO_REPORT_
  // 2026-08-14.md).
  const catalogBrowser = read("order/CatalogBrowser.jsx");

  test("the canonical CatalogBrowser (shared by Mesa and Teléfono) renders the official number as a corner badge, pizzas only", () => {
    expect(catalogBrowser).toMatch(/\{p\.num\s*&&\s*\(/);
    expect(catalogBrowser).toContain("data-testid=\"catalog-pizza-number-badge\"");
    expect(catalogBrowser).toContain("{p.num}");
  });

  test("ModificaOrdenModal rende il badge solo per le pizze", () => {
    expect(modifica).toMatch(/\{p\.num&&\(/);
    expect(modifica).toContain("Nº {p.num}");
    expect(modifica).toMatch(/height:20/);
  });

  test("il numero non è più concatenato nel titolo", () => {
    const constants = read("../constants.js");
    expect(constants).not.toMatch(/primary:\s*`\$\{p\.num\}\./);
  });
});
