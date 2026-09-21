/**
 * [FDV1 R3 §24] Fixture visiva Pizzeria: 16 ordini, 4 zone + Recogida en local, 1 giro3, 2 giro2,
 * standalone, stati NORMAL / URGENTE / TARDE. Renderizza PanelCocina e scrive l'HTML statico in
 * `fixture-out/pizzeria-fixture.html` per il controllo visuale prima del draft. Verifica anche le
 * invarianti di layout (niente buchi assurdi, giro mai spezzato, un solo orario grande per blocco).
 */
import React from "react";
import fs from "fs";
import path from "path";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("../api", () => ({
  api: {
    getManualGiros: jest.fn().mockResolvedValue([
      { id: "mg_260921_1", seq: 1, dissolved_at: null },
      { id: "mg_260921_2", seq: 2, dissolved_at: null },
      { id: "mg_260921_3", seq: 3, dissolved_at: null },
    ]),
    setUiOffset: jest.fn(), priorityContract: jest.fn().mockResolvedValue({ ok: true, contract: { version: 2, min: -50, max: 50, margin_min: 0 } }), post: jest.fn(),
  },
  auth: { getToken: () => "t", isAuthenticated: () => true },
}));
jest.mock("../sounds", () => ({ __esModule: true, default: { campanellaDieci: () => {} } }));

import PanelCocina from "../components/cocina/PanelCocina";

const iso = (hhmm) => `2026-09-21T${String(Number(hhmm.slice(0, 2)) - 2).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;
const NOW = Date.parse(iso("21:00"));
const P = (n, sub, q = 1) => ({ n, sub, q, cat: "Pizzas" });
const dom = (id, nombre, hhmm, zona, items, extra = {}) => ({
  id, nombre, tipo_consegna: "DOMICILIO", estado: "EN_COCINA", zona,
  hora: hhmm, delivery_deadline_at: iso(hhmm), ui_offset_min: 0, manual_giro_id: null, items, ts: 1, ...extra });
const rit = (id, nombre, hhmm, items) => ({
  id, nombre, tipo_consegna: "RITIRO", estado: "EN_COCINA", zona: null,
  hora: hhmm, forno_out: hhmm, delivery_deadline_at: null, ui_offset_min: 0, manual_giro_id: null, items, ts: 1 });

// 16 ordini: Q1 CENTRO · Q5 LAS MARINAS · Q4 CORTIJOS · sin zona · Recogida en local
export const FIXTURE = [
  // giro3 CENTRO — TARDE (blocco rosso zona, orario del più urgente)
  dom("#001", "Marta",  "20:52", "Q1", [P("Margherita", "Tomate, mozzarella"), P("Diavola", "Salami picante", 2)], { manual_giro_id: "mg_260921_1" }),
  dom("#003", "Luis",   "20:56", "Q1", [P("Cuatro Quesos", "Mozzarella, gorgonzola, brie, parmesano")], { manual_giro_id: "mg_260921_1" }),
  dom("#004", "Nuria",  "20:58", "Q1", [P("Capricciosa", "Jamón, champiñones, alcachofas", 2)], { manual_giro_id: "mg_260921_1" }),
  // giro2 LAS MARINAS — URGENTE
  dom("#010", "Jose",   "21:08", "Q5", [P("Margherita", "Tomate, mozzarella")], { manual_giro_id: "mg_260921_2" }),
  dom("#011", "Rocío",  "21:10", "Q5", [P("Prosciutto", "Jamón cocido", 2)], { manual_giro_id: "mg_260921_2" }),
  // giro2 CORTIJOS — normale
  dom("#008", "Andrés", "21:35", "Q4", [P("Barbacoa", "Pollo, bacon, salsa BBQ")], { manual_giro_id: "mg_260921_3" }),
  dom("#002", "Pilar",  "21:38", "Q4", [P("Vegetariana", "Verduras de temporada")], { manual_giro_id: "mg_260921_3" }),
  // standalone
  dom("#006", "Kevin",  "21:15", null, [P("Margherita", "Tomate, mozzarella")]),
  dom("#012", "Sonia",  "21:18", "Q1", [P("Diavola", "Salami picante")]),
  dom("#013", "Marc",   "21:22", "Q3", [P("Calzone", "Cerrada, jamón y queso")]),
  dom("#014", "Elena",  "21:26", "Q5", [P("Cuatro Estaciones", "Cuatro sabores", 2)]),
  dom("#015", "Toni",   "21:44", "Q4", [P("Margherita", "Tomate, mozzarella", 3)]),
  dom("#016", "Berta",  "21:52", "Q1", [P("Tartufo", "Crema de trufa, champiñones")]),
  // recogida en local
  rit("#007", "Cliente barra", "21:20", [P("Diavola", "Salami picante")]),
  rit("#009", "Cliente barra", "21:40", [P("Capricciosa", "Jamón, champiñones", 2)]),
  rit("#017", "Cliente barra", "22:00", [P("Margherita", "Tomate, mozzarella")]),
];

describe("[FDV1 R3 §24] fixture visiva Pizzeria (16 ordini)", () => {
  let container = null, root = null, nowSpy = null, html = "";
  beforeAll(async () => {
    nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW);
    container = document.createElement("div"); document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(<PanelCocina ordenes={FIXTURE} pizzeFatte={23} onListo={() => {}} onClose={() => {}} />); await Promise.resolve(); await Promise.resolve(); });
    html = container.innerHTML;
  });
  afterAll(async () => { if (root) await act(async () => root.unmount()); container.remove(); nowSpy.mockRestore(); });

  const blocks = () => [...container.querySelectorAll('[data-testid="kitchen-block"]')];

  test("scrive l'HTML della fixture per il controllo visuale", () => {
    const out = path.join(process.cwd(), "fixture-out");
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "pizzeria-fixture.html"),
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Pizzeria — FDV1 R3 fixture</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>html,body{margin:0;background:#EEF1F5;font-family:-apple-system,'Satoshi',sans-serif}
.stage{width:1460px;margin:0 auto;padding:16px 0 40px}
.frame{width:1440px;height:1500px;box-shadow:0 10px 40px rgba(0,0,0,.18);border-radius:14px;overflow:hidden;background:#fff;position:relative}
.frame > div{position:absolute !important;top:0;left:0;right:0;bottom:0;width:1440px;height:1500px}
.frame [style*="overflow-y"]{overflow:visible !important}</style></head><body><div class="stage"><div class="frame">${html}</div></div></body></html>`, "utf8");
    expect(fs.existsSync(path.join(out, "pizzeria-fixture.html"))).toBe(true);
  });

  test("16 ordini, 12 blocchi, nessuna card persa o duplicata", () => {
    const ids = blocks().flatMap((b) => b.textContent.match(/#0\d\d/g) || []);
    expect(ids).toHaveLength(16);
    expect(new Set(ids).size).toBe(16);
    expect(blocks()).toHaveLength(12);
  });

  test("un solo orario grande e un solo ± per blocco; i giri non sono mai spezzati", () => {
    for (const b of blocks()) {
      expect(b.querySelectorAll('[data-testid="block-main-time"]')).toHaveLength(1);
      expect(b.querySelectorAll('button[aria-label="Retrasar en la cola"]').length).toBeLessThanOrEqual(1);
    }
    const g = (id) => blocks().find((b) => b.getAttribute("data-giro") === id);
    expect((g("mg_260921_1").textContent.match(/#0\d\d/g) || []).sort()).toEqual(["#001", "#003", "#004"]);
    expect(g("mg_260921_1").getAttribute("data-span")).toBe("3");
    expect((g("mg_260921_2").textContent.match(/#0\d\d/g) || []).sort()).toEqual(["#010", "#011"]);
    expect((g("mg_260921_3").textContent.match(/#0\d\d/g) || []).sort()).toEqual(["#002", "#008"]);
  });

  test("le 4 zone operative + Recogida en local sono riconoscibili, senza codici Q", () => {
    const ident = blocks().map((b) => b.getAttribute("data-identity"));
    expect(new Set(ident)).toEqual(new Set(["Q1", "Q3", "Q4", "Q5", "SIN_ZONA", "RECOGIDA"]));
    expect(container.textContent).toMatch(/CENTRO/);
    expect(container.textContent).toMatch(/MARINAS/);
    expect(container.textContent).toMatch(/CORTIJOS/);
    expect(container.textContent).toMatch(/SIN ZONA/);
    expect(container.textContent).toMatch(/Recogida en local/);
    expect(container.textContent).not.toMatch(/\bQ[1-5]\b/);
  });

  test("stati presenti: TARDE, URGENTE e normale; i pickup non hanno countdown", () => {
    const states = blocks().map((b) => b.querySelector('[data-testid="block-header"]').getAttribute("data-state"));
    expect(states).toEqual(expect.arrayContaining(["late", "near", "normal"]));
    for (const b of blocks().filter((x) => x.getAttribute("data-identity") === "RECOGIDA")) {
      expect(b.querySelector('[data-testid="block-countdown"]')).toBeNull();
      expect(b.querySelector('[data-testid="pickup-tag"]')).toBeTruthy();
    }
    for (const b of blocks().filter((x) => x.getAttribute("data-identity") !== "RECOGIDA")) {
      expect(b.querySelector('[data-testid="block-countdown"]')).toBeTruthy();
    }
  });

  test("la top bar resta quella originale: nessun contatore Q1/Q3/Q4, nessun pannello zona nuovo", () => {
    expect(container.textContent).toMatch(/PIZZERIA/i);
    expect(container.textContent).toMatch(/16 pedidos · 24 pizzas/);
    expect(container.textContent).toMatch(/Hechas/);
    expect(container.textContent).not.toMatch(/EN PREPARACIÓN|Dashboard|zona:/i);
  });
});
