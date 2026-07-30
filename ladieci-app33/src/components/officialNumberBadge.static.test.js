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
  const picker = read("ItemPickerModal.jsx");
  const modifica = read("ModificaOrdenModal.jsx");

  test("ItemPickerModal rende il badge solo per le pizze, con slot ad altezza fissa", () => {
    expect(picker).toMatch(/\{p\.num\s*&&\s*\(/);
    expect(picker).toContain("Nº {p.num}");
    expect(picker).toMatch(/height:\s*22/);
    expect(picker).toMatch(/borderTop:/);
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
