/**
 * [FDV1] Cocina (TabCocina) e Pizzeria (PanelCocina) montati davvero:
 * target = deadline più urgente del giro + offset di blocco, LÍMITE / CLIENTE distinti, ordinamento, nessun duplicato,
 * nessun riferimento stale dopo 3→2. Mock del solo `../api` (getManualGiros) e dei suoni.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("../api", () => ({
  api: { getManualGiros: jest.fn().mockResolvedValue([{ id: "g1", seq: 1, dissolved_at: null }]), setUiOffset: jest.fn(), post: jest.fn() },
  auth: { getToken: () => "t", isAuthenticated: () => true },
}));
jest.mock("../sounds", () => ({ __esModule: true, default: { campanellaDieci: () => {} } }));

import TabCocina from "../components/cocina/TabCocina";
import PanelCocina from "../components/cocina/PanelCocina";

let container = null, root = null;
const mount = async (el) => {
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(el); await Promise.resolve(); await Promise.resolve(); });
  return container;
};
afterEach(() => { if (root) act(() => root.unmount()); root = null; if (container) container.remove(); container = null; });

// orari Madrid (UTC+2 a settembre)
const dl = (hhmm) => `2026-09-21T${String(Number(hhmm.slice(0, 2)) - 2).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;
const pizza = [{ n: "Margherita", q: 1, cat: "Pizzas" }];
const o = (id, deadline, extra = {}) => ({ id, nombre: "TEST FDV1", tipo_consegna: "DOMICILIO", estado: "EN_COCINA", zona: "Q1",
  hora: deadline, delivery_deadline_at: dl(deadline), ui_offset_min: 0, manual_giro_id: null, items: pizza, ts: 1, ...extra });

const cardsOrder = (el) => [...el.textContent.matchAll(/#(0\d\d)/g)].map((m) => m[1]);

test("TabCocina: giro → target = deadline più urgente + offset di blocco; LÍMITE e CLIENTE separati; ordine A,B,C; niente duplicati", async () => {
  const ordenes = [
    o("#003", "21:45"),                                                             // standalone
    o("#002", "21:25", { manual_giro_id: "g1", ui_offset_min: 5 }),                 // giro, limite 21:25, cliente = limite
    o("#001", "21:05", { manual_giro_id: "g1", ui_offset_min: 5, hora: "20:50" }),  // giro, limite 21:05, cliente 20:50
  ];
  const el = await mount(<TabCocina ordenes={ordenes} onListo={() => {}} />);
  const txt = el.textContent;
  expect((txt.match(/GIRO 21:05/g) || []).length).toBe(2);        // 🛵 del giro = earliest member deadline, su entrambi i membri
  expect((txt.match(/21:10/g) || []).length).toBeGreaterThanOrEqual(2);   // ⏱ = 21:05 + 5 (blocco)
  expect(txt).toMatch(/LÍMITE\s*21:25/);                            // limite del singolo #002 (≠ giro)
  expect(txt).toMatch(/CLIENTE\s*20:50/);                           // promessa di #001 (≠ suo limite)
  expect(txt).not.toMatch(/CLIENTE\s*21:25/);                       // #002: hora = limite → nessuna pillola CLIENTE
  expect(cardsOrder(el)).toEqual(["001", "002", "003"]);           // a pari target, cliente più urgente prima; standalone dopo
});

test("TabCocina 3→2: il membro uscito non lascia orari ereditati sul giro", async () => {
  const ordenes = [
    o("#001", "21:05"),                                            // uscito (ex anchor)
    o("#002", "21:25", { manual_giro_id: "g1" }),
    o("#003", "21:35", { manual_giro_id: "g1" }),
  ];
  const el = await mount(<TabCocina ordenes={ordenes} onListo={() => {}} />);
  expect(el.textContent).toMatch(/GIRO 21:25/);
  expect(el.textContent).not.toMatch(/GIRO 21:05/);
});

test("PanelCocina (Pizzeria): target di blocco, 🛵 limite del singolo, CLIENTE separato, nessun duplicato", async () => {
  const ordenes = [
    o("#002", "21:25", { manual_giro_id: "g1", ui_offset_min: -5 }),
    o("#001", "21:05", { manual_giro_id: "g1", ui_offset_min: -5, hora: "20:50" }),
  ];
  const el = await mount(<PanelCocina ordenes={ordenes} onListo={() => {}} onClose={() => {}} />);
  const txt = el.textContent;
  expect((txt.match(/21:00/g) || []).length).toBeGreaterThanOrEqual(2);    // ⏱ = 21:05 − 5 per tutto il blocco
  expect(txt).toMatch(/21:25/); expect(txt).toMatch(/CLIENTE\s*20:50/);
  expect(cardsOrder(el)).toEqual(["001", "002"]);
});
