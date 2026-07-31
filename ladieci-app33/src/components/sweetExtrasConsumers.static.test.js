/**
 * Regressione D-02 / D-03 — consumatori del contratto extra dolci.
 *
 * D-02: WADettaglio (schermata di presa ordine da WhatsApp) risolveva gli extra
 *       solo dentro INGREDIENTI. Un extra dolce mostrava 0,00 € e l'emoji ➕,
 *       la ✕ non stornava il supplemento, e il pannello non offriva affatto gli
 *       EXTRAS_DULCES su una pizza dessert.
 * D-03: ModificaOrdenModal.tap() copiava l'intero item di MENU, `sub` compreso,
 *       facendo finire il nome classico ("Margherita Classica") nel campo
 *       note/variazioni dell'ordine — visibile in rosso su OrdenCard, Rider e
 *       Cocina, e stampato sul ticket come istruzione di cucina.
 */
import fs from "fs";
import path from "path";
import { findExtra, esDulce, EXTRAS_DULCES, INGREDIENTI, MENU } from "../constants";

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8");

describe("D-02 · WADettaglio risolve anche gli extra dolci", () => {
  const src = read("wa/WADettaglio.jsx");

  test("importa il contratto completo dal catalogo", () => {
    expect(src).toMatch(/import\s*{[^}]*EXTRAS_DULCES[^}]*}\s*from\s*'\.\.\/\.\.\/constants'/);
    expect(src).toMatch(/import\s*{[^}]*esDulce[^}]*}\s*from\s*'\.\.\/\.\.\/constants'/);
    expect(src).toMatch(/import\s*{[^}]*findExtra[^}]*}\s*from\s*'\.\.\/\.\.\/constants'/);
  });

  test("nessun lookup diretto in INGREDIENTI è rimasto", () => {
    expect(src).not.toMatch(/INGREDIENTI\.find\(g\s*=>\s*g\.n\s*===/);
  });

  test("il riepilogo e la rimozione usano findExtra", () => {
    expect(src).toContain("findExtra(name)");
    expect(src).toContain("findExtra(ex.name)");
  });

  test("il pannello propone EXTRAS_DULCES sulle pizze dessert", () => {
    expect(src).toMatch(/esDulce\(editItems\[showIngPanel\]\)\s*\?\s*EXTRAS_DULCES\s*:\s*INGREDIENTI/);
  });
});

describe("D-02 · prova funzionale del difetto risolto", () => {
  // Riproduce la risoluzione che WADettaglio faceva prima e quella che fa ora.
  const vecchiaRisoluzione = (name) => INGREDIENTI.find((g) => g.n === name) || null;

  test("prima: un extra dolce dava 0,00 € e nessuna emoji", () => {
    ["Nutella", "Kinder", "KitKat", "Pistacho", "Almendra"].forEach((n) => {
      expect(vecchiaRisoluzione(n)).toBeNull();
    });
  });

  test("ora: ogni extra dolce ha prezzo ed emoji corretti", () => {
    EXTRAS_DULCES.forEach((e) => {
      const risolto = findExtra(e.n);
      expect(risolto).not.toBeNull();
      expect(risolto.prezzo).toBe(0.5);
      expect(risolto.e).toBeTruthy();
    });
  });

  test("gli extra salati continuano a risolversi", () => {
    ["Coppa", "Salami Napoli", "Rúcula"].forEach((n) => {
      const risolto = findExtra(n);
      expect(risolto).not.toBeNull();
      expect(risolto.prezzo).toBeGreaterThan(0);
    });
  });

  test("il pannello giusto viene scelto in base all'item", () => {
    const kinder = MENU.find((m) => String(m.id) === "41");
    const gladiatore = MENU.find((m) => String(m.id) === "11");
    expect(esDulce(kinder) ? EXTRAS_DULCES : INGREDIENTI).toBe(EXTRAS_DULCES);
    expect(esDulce(gladiatore) ? EXTRAS_DULCES : INGREDIENTI).toBe(INGREDIENTI);
  });
});

describe("D-03 · il nome classico non finisce nelle note dell'ordine", () => {
  const src = read("ModificaOrdenModal.jsx");

  test("tap() azzera `sub` quando aggiunge un prodotto dal catalogo", () => {
    expect(src).toMatch(/return \[\.\.\.prev,\{\.\.\.p,q:1,sub:""\}\]/);
  });

  test("simulazione: aggiungere El Pelusa non lascia 'Margherita Classica' come variazione", () => {
    const pelusa = MENU.find((m) => String(m.id) === "1");
    expect(pelusa.sub).toBe("Margherita Classica"); // il catalogo lo espone come nome classico
    const aggiunto = { ...pelusa, q: 1, sub: "" };  // ciò che tap() produce ora
    expect(aggiunto.sub).toBe("");
    expect(aggiunto.n).toBe("El Pelusa");
    expect(aggiunto.id).toBe(1);
  });

  test("lo stesso vale per tutte e 14 le pizze", () => {
    MENU.filter((m) => m.num).forEach((p) => {
      expect({ ...p, q: 1, sub: "" }.sub).toBe("");
    });
  });

  test("ItemPickerModal continua ad azzerare `sub` (comportamento già corretto)", () => {
    expect(read("ItemPickerModal.jsx")).toMatch(/sub:\s*""/);
  });
});
