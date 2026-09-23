/**
 * Patch LIVE carta 2026-09-17 — categoria Cocina.
 *
 * Contratto verificato qui:
 * - i piatti Cocina si ordinano come ogni altro prodotto e totalizzano giusto;
 * - carico forno ZERO: non contano come pizze né consumano capacità;
 * - Pizzeria (PanelCocina) mostra SOLO le pizze da forno e ha LISTO per-card (stessa
 *   transizione canonica EN_COCINA→LISTO di Cocina, nessuna nuova state machine);
 * - Cocina (TabCocina) vede l'ordine completo e ha LISTO anch'essa;
 * - Economía "Comparar semanas": pizze = solo cat "Pizzas".
 */
import fs from "fs";
import path from "path";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("../../api", () => ({
  api: { getManualGiros: jest.fn(() => Promise.resolve([])), post: jest.fn(() => Promise.resolve({})) },
  sb: {},
  auth: {},
}));
jest.mock("../../sounds", () => ({
  __esModule: true,
  default: { campanellaDieci: jest.fn(), preload: jest.fn() },
}));

/* eslint-disable import/first */
import { MENU, CATS, calcTotale } from "../../constants";
import { isDessertPizza } from "../dessertPizza";
import {
  isPizzaItem,
  countPizzasForKitchenWindow,
  getKitchenCapacityStatus,
} from "../../core/kitchen/capacity";
import { caricoTotale } from "../../components/ordenes/TabListos";
import PanelCocina from "../../components/cocina/PanelCocina";
import TabCocina from "../../components/cocina/TabCocina";
import ItemPickerModal from "../../components/ItemPickerModal";
import { aggrega } from "../../components/EconomiaPage";
/* eslint-enable import/first */

const SRC = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");
const byId = (id) => MENU.find((m) => String(m.id) === String(id));
const line = (id, q = 1) => {
  const m = byId(id);
  return { id: m.id, n: m.n, q, p: m.p, e: m.e, sub: "", cat: m.cat, ...(m.dulce ? { dulce: true } : {}) };
};

const PIZZA = 1;      // El Pelusa
const COCA = 26;      // Coca Cola
const LASAGNA = 50;   // Lasagna Bolognese
const COCINA_IDS = [47, 48, 49, 50];

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

const mixedOrder = {
  id: "M-1", nombre: "Mixto", estado: "EN_COCINA", tipo_consegna: "RITIRO",
  hora: "20:30", forno_out: "20:30",
  items: [line(PIZZA), line(COCA), line(LASAGNA)],
};

describe("Cocina — catalogo e ordine", () => {
  test("la scheda Cocina è presente nei due selettori prodotto (derivano da CATS)", () => {
    expect(CATS).toContain("Cocina");
    expect(read("components/ItemPickerModal.jsx")).toMatch(/\[\.\.\.CATS,\s*"⭐ Custom"\]/);
    expect(read("components/ModificaOrdenModal.jsx")).toMatch(/\[\.\.\.CATS,"⭐ Custom"\]/);
  });

  test("un piatto Cocina si aggiunge all'ordine dal selettore", () => {
    const onAdd = jest.fn();
    const el = mount(<ItemPickerModal visible onClose={() => {}} onAdd={onAdd} />);
    const tab = buttons(el).find((b) => b.textContent === "Cocina");
    expect(tab).toBeDefined();
    click(tab);
    // La griglia mostra i 4 piatti Cocina e non le pizze.
    COCINA_IDS.forEach((id) => expect(el.textContent).toContain(byId(id).n));
    expect(el.textContent).not.toContain("«El Pelusa»");
    const card = Array.from(el.querySelectorAll("span")).find((s) => s.textContent === "Lasagna Bolognese");
    click(card);
    const confirm = buttons(el).find((b) => /Añadir 1 item al pedido/.test(b.textContent));
    expect(confirm).toBeDefined();
    click(confirm);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toEqual(expect.objectContaining({ id: 50, n: "Lasagna Bolognese", cat: "Cocina", p: 11, q: 1, sub: "" }));
  });

  test("totali: Pizza + Coca-Cola + Lasagna = 25,00 (27,50 a domicilio)", () => {
    expect(calcTotale([line(LASAGNA)], "RITIRO")).toBe(11);
    expect(calcTotale(mixedOrder.items, "RITIRO")).toBe(25);
    expect(calcTotale(mixedOrder.items, "DOMICILIO")).toBe(27.5);
  });
});

describe("Cocina — carico forno ZERO", () => {
  test("nessun piatto Cocina è pizza da forno", () => {
    COCINA_IDS.forEach((id) => expect(isPizzaItem(line(id))).toBe(false));
  });

  test("pizze e pizze dolci restano pizze da forno; bevande e postres non pizza no", () => {
    [1, 2, 11, 38, 39, 51, 52].forEach((id) => expect(isPizzaItem(line(id))).toBe(true));
    [16, 40, 41].forEach((id) => expect(isPizzaItem(line(id))).toBe(true));
    [12, 14, 17, 26, 57].forEach((id) => expect(isPizzaItem(line(id))).toBe(false));
    expect(isPizzaItem({ n: "Margherita", q: 1 })).toBe(true); // legacy senza cat
  });

  test("le pizze dolci col nome nuovo contano anche senza flag `dulce`", () => {
    ["Pizza de Nutella (28cm)", "Pizza de KitKat (28cm)", "Pizza de Kinder (28cm)"].forEach((n) => {
      expect(isDessertPizza({ n, cat: "Postres" })).toBe(true);
      expect(isPizzaItem({ n, cat: "Postres", q: 1 })).toBe(true);
    });
  });

  test("4 pizze + 10 lasagne = carico forno di 4 pizze, non 14", () => {
    const order = {
      id: "F-1", estado: "EN_COCINA", forno_out: "20:30", hora: "20:30",
      items: [line(PIZZA, 4), line(LASAGNA, 10)],
    };
    expect(countPizzasForKitchenWindow([order], "20:30")).toBe(4);
    expect(caricoTotale([order])).toBe(4);
    const status = getKitchenCapacityStatus([order], "20:30");
    expect(status.pizzas).toBe(4);
    expect(status.overloaded).toBe(false);
  });

  test("le lasagne non riducono la capacità del forno", () => {
    const soloCocina = { id: "F-2", estado: "EN_COCINA", forno_out: "20:30", items: [line(LASAGNA, 10)] };
    const pieno = { id: "F-3", estado: "EN_COCINA", forno_out: "20:30", items: [line(PIZZA, 8), line(LASAGNA, 10)] };
    expect(getKitchenCapacityStatus([soloCocina], "20:30")).toEqual(
      expect.objectContaining({ pizzas: 0, available: 8, overloaded: false })
    );
    expect(getKitchenCapacityStatus([pieno], "20:30")).toEqual(
      expect.objectContaining({ pizzas: 8, available: 0, overloaded: false })
    );
  });

  test("contatori pizze e slot forno usano la stessa regola (nessun `!== \"Bebidas\"` residuo)", () => {
    expect(read("components/NuevoPedidoModal.jsx")).toMatch(/\.filter\(isPizzaItem\)/);
    ["components/NuevoPedidoModal.jsx", "components/ServicioPage.jsx", "components/ordenes/TabListos.jsx",
     "core/kitchen/capacity.js", "components/cocina/PanelCocina.jsx"].forEach((f) => {
      const src = read(f);
      expect(src).not.toMatch(/it\.cat\s*!==\s*"Bebidas"\)/);
      expect(src).not.toMatch(/cat\s*!==\s*"Bebidas"\s*&&/);
      expect(src).not.toMatch(/if\s*\(cat\s*===\s*"Bebidas"\)\s*return false;/);
    });
  });
});

describe("Pizzeria vs Cocina — ordine misto Pizza + Coca-Cola + Lasagna", () => {
  test("Pizzeria (PanelCocina) vede SOLO la pizza e ha LISTO su ogni card", () => {
    const onListo = jest.fn();
    const el = mount(
      <PanelCocina ordenes={[mixedOrder]} convConfermata={[]} onListo={onListo} onClose={() => {}} loadingIds={new Set()} pizzeFatte={0} />
    );
    expect(el.textContent).toContain("El Pelusa");
    expect(el.textContent).not.toContain("Coca Cola");
    expect(el.textContent).not.toContain("Lasagna");
    expect(el.textContent).not.toContain("Bebidas / Postres");
    expect(buttons(el).some((b) => /LISTO/.test(b.textContent))).toBe(true);
    expect(el.textContent).toContain("1 pedido · 1 pizza");
  });

  test("Pizzeria non mostra un ordine senza pizze", () => {
    const soloCocina = { ...mixedOrder, id: "M-2", nombre: "SoloCocina", items: [line(COCA), line(LASAGNA)] };
    const el = mount(
      <PanelCocina ordenes={[soloCocina]} convConfermata={[]} onListo={() => {}} onClose={() => {}} loadingIds={new Set()} pizzeFatte={0} />
    );
    expect(el.textContent).not.toContain("SoloCocina");
    expect(el.textContent).not.toContain("Lasagna");
  });

  test("Cocina (TabCocina) vede Pizza + Coca-Cola + Lasagna e porta l'ordine a LISTO", () => {
    const onListo = jest.fn();
    const el = mount(<TabCocina ordenes={[mixedOrder]} onListo={onListo} loadingIds={new Set()} />);
    expect(el.textContent).toContain("El Pelusa");
    expect(el.textContent).toContain("Coca Cola");
    expect(el.textContent).toContain("Lasagna Bolognese");
    const listo = buttons(el).find((b) => /LISTO/.test(b.textContent));
    expect(listo).toBeDefined();
    click(listo);
    expect(onListo).toHaveBeenCalledWith("M-1", { origin: "TabCocina", actor: "cocina" });
  });
});

describe("Economía — Comparar semanas conta come pizze solo cat Pizzas", () => {
  test("Postres, Cocina e Bebidas non entrano nelle pizze del giorno", () => {
    const a = aggrega([{
      id: "E-1", fecha: "2026-09-10", totale: 60, estado: "RETIRADO", tipo_consegna: "RITIRO",
      items: [
        line(PIZZA, 2),
        { n: "Margherita", q: 1, p: 12 },   // legacy senza cat = pizza
        line(12, 1),                         // Tiramisú
        line(16, 1),                         // Pizza de Nutella (Postres)
        line(LASAGNA, 3),
        line(COCA, 1),
      ],
    }]);
    const giorno = a.giorniDettaglio.find((d) => d.data === "2026-09-10");
    expect(giorno.pizze).toBe(3);
    expect(giorno.bevande).toBe(1);
  });

  test("anche l'accumulatore di getStorico (api.js) usa la regola stretta", () => {
    const api = read("api.js");
    expect(api).toMatch(/if\(it\.cat==="Bebidas"\) bevandeG\+=q; else if\(\(it\.cat\|\|"Pizzas"\)==="Pizzas"\) pizzeG\+=q;/);
    expect(api).not.toMatch(/if\(it\.cat==="Bebidas"\) bevandeG\+=q; else pizzeG\+=q;/);
  });
});
