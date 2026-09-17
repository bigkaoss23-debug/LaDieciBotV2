/**
 * EXTRAS HOTFIX 01 — parità con la carta fisica degli extra pizza (2026-09-17).
 *
 * Contratto verificato qui:
 * - INGREDIENTI è il catalogo UNICO: stessi nomi e stessi prezzi per la pizza
 *   normale (pannello extra dei picker) e per la Pizza a tu gusto (builder);
 * - ogni extra canonico compare UNA sola volta, al prezzo esatto della carta;
 * - gli extra a 0,00 € sono selezionabili e non alzano il totale;
 * - la stessa quantità ripetuta moltiplica il supplemento;
 * - `sub` resta la stringa "+Nome, +Nome" letta da Cocina/Pizzeria;
 * - il MENU di 99992b3 non è stato toccato da questa hotfix.
 */
import fs from "fs";
import path from "path";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import crypto from "crypto";

jest.mock("../../api", () => ({
  api: { getManualGiros: jest.fn(() => Promise.resolve([])), post: jest.fn(() => Promise.resolve({})) },
  sb: {},
  auth: {},
}));
jest.mock("../../sounds", () => ({ __esModule: true, default: { campanellaDieci: jest.fn(), preload: jest.fn() } }));

/* eslint-disable import/first */
import { INGREDIENTI, EXTRAS_DULCES, GRUPPI_ING, MENU, findExtra } from "../../constants";
import ItemPickerModal from "../../components/ItemPickerModal";
import PizzaCustomBuilder from "../../components/PizzaCustomBuilder";
/* eslint-enable import/first */

// Carta fisica: [nome, prezzo, gruppo]
const CANONICAL = [
  ["Provola ahumada", 1.0, "Quesos"],
  ["Lascas Parmigiano Reggiano DOP", 1.0, "Quesos"],
  ["Gorgonzola dulce DOP", 1.0, "Quesos"],
  ["Gorgonzola picante", 1.0, "Quesos"],
  ["Provolone", 1.0, "Quesos"],
  ["Grana Padano rallado", 0.0, "Quesos"],
  ["Pecorino Romano rallado", 0.0, "Quesos"],
  ["Prosciutto cotto (Jamón cocido)", 1.0, "Carnes"],
  ["Prosciutto crudo (Jamón serrano)", 2.0, "Carnes"],
  ["Coppa", 2.0, "Carnes"],
  ["Spianata Calabra picante", 1.0, "Carnes"],
  ["Salami picante", 1.0, "Carnes"],
  ["Mortadela", 1.0, "Carnes"],
  ["Salami Napoli", 1.0, "Carnes"],
  ["Atún", 1.0, "Pescados"],
  ["Yema de huevo", 0.5, "Verduras y hierbas"],
  ["Aceitunas negras", 0.5, "Verduras y hierbas"],
  ["Tomate confitado", 0.5, "Verduras y hierbas"],
  ["Cebolla morada", 0.5, "Verduras y hierbas"],
  ["Pimiento", 0.5, "Verduras y hierbas"],
  ["Berenjena", 0.5, "Verduras y hierbas"],
  ["Albahaca", 0.0, "Verduras y hierbas"],
  ["Alcachofas", 0.5, "Verduras y hierbas"],
  ["Champiñones", 0.5, "Verduras y hierbas"],
  ["Rúcula", 0.5, "Verduras y hierbas"],
];

const SRC = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");
const extras = () => INGREDIENTI.filter((i) => i.tipo !== "base");
const byName = (n) => INGREDIENTI.find((i) => i.n === n);

let container = null;
let root = null;
const mount = (el) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
  return container;
};
afterEach(() => {
  if (root) { act(() => root.unmount()); root = null; }
  if (container) { container.remove(); container = null; }
});
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const buttons = (el) => Array.from(el.querySelectorAll("button"));
const byText = (el, text) => buttons(el).find((b) => b.textContent.trim() === text);

describe("catalogo extra — parità con la carta", () => {
  test("ogni extra canonico è presente UNA sola volta, al prezzo esatto", () => {
    CANONICAL.forEach(([n, prezzo]) => {
      const hits = INGREDIENTI.filter((i) => i.n === n);
      expect(hits).toHaveLength(1);
      expect(hits[0].prezzo).toBe(prezzo);
    });
  });

  test("nessun extra fuori carta e nessun nome duplicato", () => {
    expect(extras().map((i) => i.n).sort()).toEqual(CANONICAL.map(([n]) => n).sort());
    const ids = INGREDIENTI.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("prezzi puntuali della carta", () => {
    expect(findExtra("Prosciutto crudo (Jamón serrano)").prezzo).toBe(2.0);
    expect(findExtra("Coppa").prezzo).toBe(2.0);
    expect(findExtra("Provola ahumada").prezzo).toBe(1.0);
    expect(findExtra("Yema de huevo").prezzo).toBe(0.5);
    expect(findExtra("Rúcula").prezzo).toBe(0.5);
    expect(findExtra("Grana Padano rallado").prezzo).toBe(0);
    expect(findExtra("Pecorino Romano rallado").prezzo).toBe(0);
    expect(findExtra("Albahaca").prezzo).toBe(0);
  });

  test("non esiste una tariffa unica: la carta ha 0,00 / 0,50 / 1,00 / 2,00", () => {
    expect([...new Set(extras().map((i) => i.prezzo))].sort((a, b) => a - b)).toEqual([0, 0.5, 1, 2]);
  });

  test("gruppi invariati e coerenti con la carta", () => {
    expect(GRUPPI_ING).toEqual(["Base", "Verduras y hierbas", "Carnes", "Pescados", "Quesos"]);
    CANONICAL.forEach(([n, , gruppo]) => expect(byName(n).gruppo).toBe(gruppo));
    INGREDIENTI.forEach((i) => expect(GRUPPI_ING).toContain(i.gruppo));
    expect(INGREDIENTI.filter((i) => i.tipo === "base").map((i) => i.n)).toEqual(["Tomate San Marzano", "Fior di latte"]);
  });

  test("ogni extra ha un'emoji", () => {
    extras().forEach((i) => expect(i.e).toBeTruthy());
  });

  test("gli extra dolci restano una lista separata e invariata", () => {
    expect(EXTRAS_DULCES.map((e) => [e.n, e.prezzo])).toEqual([
      ["Nutella", 0.5], ["Kinder", 0.5], ["KitKat", 0.5], ["Pistacho", 0.5], ["Almendra", 0.5],
    ]);
    const salati = extras().map((i) => i.n);
    EXTRAS_DULCES.forEach((d) => expect(salati).not.toContain(d.n));
  });
});

describe("pizza normale — aritmetica del supplemento nel picker", () => {
  const openExtras = (el) => {
    click(byText(el, "MARGHERITA")?.parentElement ? byText(el, "MARGHERITA") : Array.from(el.querySelectorAll("span")).find((s) => s.textContent === "MARGHERITA"));
    const apri = buttons(el).find((b) => /Añadir ingrediente extra/.test(b.textContent));
    click(apri);
    return apri;
  };
  const addExtra = (el, nome) => {
    const b = buttons(el).find((x) => x.textContent.includes(nome) && /€/.test(x.textContent));
    expect(b).toBeDefined();
    click(b);
  };
  const confirmItem = (el, onAdd) => {
    const conferma = buttons(el).find((b) => /Añadir \d+ item/.test(b.textContent));
    click(conferma);
    return onAdd.mock.calls[0][0];
  };

  test("pizza base + Prosciutto crudo + Coppa + Yema = +4,50 € esatti", () => {
    const onAdd = jest.fn();
    const el = mount(<ItemPickerModal visible onClose={() => {}} onAdd={onAdd} />);
    openExtras(el);
    addExtra(el, "Prosciutto crudo (Jamón serrano)");
    openExtras(el); addExtra(el, "Coppa");
    openExtras(el); addExtra(el, "Yema de huevo");
    const item = confirmItem(el, onAdd);
    expect(item.p).toBe(16.5); // El Pelusa 12,00 + 4,50
    expect(item.sub).toBe("+Prosciutto crudo (Jamón serrano), +Coppa, +Yema de huevo");
  });

  test("lo stesso extra due volte raddoppia il supplemento", () => {
    const onAdd = jest.fn();
    const el = mount(<ItemPickerModal visible onClose={() => {}} onAdd={onAdd} />);
    openExtras(el); addExtra(el, "Coppa");
    openExtras(el); addExtra(el, "Coppa");
    expect(el.textContent).toContain("Coppa +4.00€"); // riepilogo: ×2 aggregato
    const item = confirmItem(el, onAdd);
    expect(item.p).toBe(16); // 12,00 + 2,00 + 2,00
    expect(item.sub).toBe("+Coppa, +Coppa");
  });

  test("un extra da 0 € è selezionabile e NON cambia il totale", () => {
    const onAdd = jest.fn();
    const el = mount(<ItemPickerModal visible onClose={() => {}} onAdd={onAdd} />);
    openExtras(el);
    ["Albahaca", "Grana Padano rallado", "Pecorino Romano rallado"].forEach((n) => {
      expect(buttons(el).some((b) => b.textContent.includes(n))).toBe(true);
    });
    addExtra(el, "Grana Padano rallado");
    const item = confirmItem(el, onAdd);
    expect(item.p).toBe(12);
    expect(item.sub).toBe("+Grana Padano rallado");
  });

  test("la ✕ sull'extra storna esattamente il suo prezzo", () => {
    const onAdd = jest.fn();
    const el = mount(<ItemPickerModal visible onClose={() => {}} onAdd={onAdd} />);
    openExtras(el); addExtra(el, "Coppa");
    const rimuovi = buttons(el).find((b) => b.textContent.trim() === "✕" && /Coppa/.test(b.parentElement.textContent));
    click(rimuovi);
    const item = confirmItem(el, onAdd);
    expect(item.p).toBe(12);
    expect(item.sub).toBe("");
  });
});

describe("Pizza a tu gusto — stesso catalogo, stessi prezzi", () => {
  test("base 12,00 + Prosciutto crudo + Coppa + Yema = 16,50 €", () => {
    const setItems = jest.fn();
    const el = mount(<PizzaCustomBuilder setItems={setItems} />);
    const pick = (gruppo, nome) => {
      click(byText(el, gruppo));
      const b = buttons(el).find((x) => x.textContent.includes(nome));
      expect(b).toBeDefined();
      click(b);
    };
    pick("Carnes", "Prosciutto crudo (Jamón serrano)");
    pick("Carnes", "Coppa");
    pick("Verduras y hierbas", "Yema de huevo");
    expect(el.textContent).toContain("16.50€");
    expect(el.textContent).toContain("+4.50€ extras");
    const aggiungi = buttons(el).find((b) => /Añadir|Agregar|AÑADIR/i.test(b.textContent) && !/Carnes|Quesos/.test(b.textContent));
    click(aggiungi);
    const updater = setItems.mock.calls[0][0];
    const item = typeof updater === "function" ? updater([])[0] : updater;
    expect(item.p).toBe(16.5);
    expect(item.n).toBe("Pizza a tu gusto");
    expect(item.sub).toContain("Prosciutto crudo (Jamón serrano)");
  });

  test("gli extra a 0 € restano selezionabili anche nel builder e non alzano il prezzo", () => {
    const setItems = jest.fn();
    const el = mount(<PizzaCustomBuilder setItems={setItems} />);
    click(byText(el, "Quesos"));
    const grana = buttons(el).find((b) => b.textContent.includes("Grana Padano rallado"));
    expect(grana).toBeDefined();
    expect(grana.textContent).toContain("+0.00€");
    click(grana);
    expect(el.textContent).toContain("12.00€");
  });

  test("picker e builder leggono lo STESSO catalogo (nessuna lista parallela)", () => {
    const builder = read("components/PizzaCustomBuilder.jsx");
    expect(builder).toMatch(/import\s*{[^}]*INGREDIENTI[^}]*}\s*from\s*'\.\.\/constants'/);
    ["components/ItemPickerModal.jsx", "components/ModificaOrdenModal.jsx", "components/wa/WADettaglio.jsx"].forEach((f) => {
      const src = read(f);
      expect(src).toMatch(/EXTRAS_DULCES\s*:\s*INGREDIENTI/);
      // il vecchio filtro nascondeva gli extra a 0 €
      expect(src).not.toMatch(/filter\(\s*ing\s*=>\s*ing\.prezzo\s*>\s*0\s*\)/);
      expect(src).not.toMatch(/filter\(ing=>ing\.prezzo>0\)/);
    });
    // nessun secondo elenco di ingredienti hardcodato fuori da constants.js
    ["components/ItemPickerModal.jsx", "components/ModificaOrdenModal.jsx", "components/wa/WADettaglio.jsx", "components/PizzaCustomBuilder.jsx"].forEach((f) => {
      expect(read(f)).not.toMatch(/prezzo:\s*[0-9]/);
    });
  });

  test("i nomi con parentesi sono escapati nel contatore di WADettaglio", () => {
    const src = read("components/wa/WADettaglio.jsx");
    expect(src).toMatch(/const ingRe = ing\.n\.replace\(/);
    const esc = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sub = "+Prosciutto cotto (Jamón cocido), +Coppa, +Coppa";
    expect((sub.match(new RegExp(`\\+${esc("Prosciutto cotto (Jamón cocido)")}`, "g")) || []).length).toBe(1);
    expect((sub.match(new RegExp(`\\+${esc("Coppa")}`, "g")) || []).length).toBe(2);
  });
});

describe("guardie: la hotfix non tocca altro", () => {
  test("il MENU di 99992b3 è invariato (impronta del blocco)", () => {
    const block = read("constants.js").match(/const MENU = \[[\s\S]*?\n\];/)[0];
    expect(crypto.createHash("sha256").update(block).digest("hex"))
      .toBe("142d638c6516a2a5bf092a4d32abe8213b1b4c9acab582fe862ddc53cde98934");
    expect(MENU.filter((m) => m.cat === "Pizzas")).toHaveLength(16);
    expect(MENU.filter((m) => m.cat === "Cocina")).toHaveLength(4);
  });

  test("`sub` resta la stringa che leggono Cocina e Pizzeria", () => {
    // formato storico: "+Nome, +Nome" separato da virgola, nessun nome contiene virgole
    extras().forEach((i) => expect(i.n).not.toContain(","));
    const sub = ["+Coppa", "+Yema de huevo"].join(", ");
    expect(sub.split(",").map((s) => s.trim())).toEqual(["+Coppa", "+Yema de huevo"]);
  });
});
