/**
 * [FDV1] Entregas: create / add / move passano da una revisione con warning fattuali del backend.
 * Nessun orario da scegliere (hora_ref ritirato). Conferma = override. Mock del solo `../api`.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("../api", () => ({
  api: {
    getManualGiros: jest.fn().mockResolvedValue([]),
    getDriverStatus: jest.fn().mockResolvedValue(null),
    giroWarnings: jest.fn(),
    createManualGiro: jest.fn().mockResolvedValue({ ok: true, giro: { id: "mg_260921_1", seq: 1 } }),
    addOrderToManualGiro: jest.fn().mockResolvedValue({ ok: true }),
    removeOrderFromManualGiro: jest.fn().mockResolvedValue({ ok: true }),
    dissolveManualGiro: jest.fn().mockResolvedValue({ ok: true }),
  },
  auth: { getToken: () => "t", isAuthenticated: () => true },
}));

import TabEntregas from "../components/entregas/TabEntregas";
import { api } from "../api";

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
  jest.clearAllMocks();
});
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const click = async (el) => act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });
const btn = (el, text) => [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === text);

const dl = (hhmm) => `2026-09-21T${String(Number(hhmm.slice(0, 2)) - 2).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;
const deliveries = [
  { id: "D-1", nombre: "Uno", tipo_consegna: "DOMICILIO", estado: "EN_COCINA", direccion: "Calle A", zona: "Q1", hora: "20:40", delivery_deadline_at: dl("20:40"), items: [] },
  { id: "D-2", nombre: "Dos", tipo_consegna: "DOMICILIO", estado: "EN_COCINA", direccion: "Calle B", zona: "Q1", hora: "21:20", delivery_deadline_at: dl("21:20"), items: [] },
];

const openReview = async (ordenes = deliveries) => {
  const el = mount(<TabEntregas ordenes={ordenes} notify={() => {}} setOrdenes={() => {}} />);
  await flush();
  const selectors = [...el.querySelectorAll("button[aria-pressed]")].filter((b) => /giro manual|seleccion manual/i.test(b.getAttribute("title") || ""));
  expect(selectors.length).toBeGreaterThanOrEqual(2);
  await click(selectors[0]); await click(selectors[1]);
  await click(btn(el, "Crear giro manual"));
  await flush();
  return el;
};

test("create senza warning: nessun input orario, 'Crear giro' chiama createManualGiro con i soli id", async () => {
  api.giroWarnings.mockResolvedValue({ ok: true, warnings: [] });
  const el = await openReview();
  expect(api.giroWarnings).toHaveBeenCalledWith({ order_ids: ["D-1", "D-2"] });
  expect(el.querySelector('input[placeholder="HH:MM"]')).toBeNull();
  expect(el.textContent).not.toContain("REVISAR");
  expect(el.textContent).toContain("límite 20:40");
  await click(btn(el, "Crear giro"));
  expect(api.createManualGiro).toHaveBeenCalledTimes(1);
  expect(api.createManualGiro.mock.calls[0]).toEqual([["D-1", "D-2"]]);
});

test("create con rischio: REVISAR con l'ordine realmente a rischio; 'Confirmar igualmente' = override", async () => {
  api.giroWarnings.mockResolvedValue({ ok: true, warnings: [{ code: "spread_over_window", member_ids: ["D-1", "D-2"], data: { spread_min: 40, window_min: 15 } }] });
  const el = await openReview();
  expect(el.textContent).toContain("REVISAR");
  expect(el.textContent).toContain("Límites separados 40 min (> 15): D-1, D-2");
  expect(btn(el, "Crear giro")).toBeUndefined();
  await click(btn(el, "Confirmar igualmente"));
  expect(api.createManualGiro).toHaveBeenCalledTimes(1);
});

test("Cancelar non crea nulla", async () => {
  api.giroWarnings.mockResolvedValue({ ok: true, warnings: [] });
  const el = await openReview();
  await click(btn(el, "Cancelar"));
  expect(api.createManualGiro).not.toHaveBeenCalled();
});

test("warning non disponibili: lo dice, ma l'operatore può comunque decidere", async () => {
  api.giroWarnings.mockResolvedValue({ ok: false, status: 502, error: "warnings_read_failed" });
  const el = await openReview();
  expect(el.textContent).toContain("Avisos no disponibles");
  await click(btn(el, "Crear giro"));
  expect(api.createManualGiro).toHaveBeenCalledTimes(1);
});

test("ADD: un ordine standalone si aggiunge a un giro esistente via '→ giro' (addOrderToManualGiro)", async () => {
  api.getManualGiros.mockResolvedValue([{ id: "mg_1", seq: 1, dissolved_at: null, order_ids: ["D-1", "D-2"] }]);
  api.giroWarnings.mockResolvedValue({ ok: true, warnings: [] });
  const ordenes = [
    { ...deliveries[0], manual_giro_id: "mg_1" }, { ...deliveries[1], manual_giro_id: "mg_1" },
    { id: "D-3", nombre: "Tres", tipo_consegna: "DOMICILIO", estado: "EN_COCINA", direccion: "Calle C", zona: "Q1", hora: "20:50", delivery_deadline_at: dl("20:50"), items: [] },
  ];
  const el = mount(<TabEntregas ordenes={ordenes} notify={() => {}} setOrdenes={() => {}} />);
  await flush();
  const sel = el.querySelector('select[aria-label="Añadir a un giro"]');
  expect(sel).toBeTruthy();
  await act(async () => {
    sel.value = "mg_1";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve(); await Promise.resolve();
  });
  await flush();
  expect(api.giroWarnings).toHaveBeenCalledWith({ giro_id: "mg_1", order_ids: ["D-3"] });
  await click(btn(el, "Añadir al giro"));
  expect(api.addOrderToManualGiro).toHaveBeenCalledWith("mg_1", "D-3");
});

test("MOVE G1 → G2, REMOVE (giro → suelto), DISSOLVE: ognuno chiama la sua azione atomica; nessuna UI rider", async () => {
  api.getManualGiros.mockResolvedValue([
    { id: "mg_1", seq: 1, dissolved_at: null, order_ids: ["D-1", "D-2"] },
    { id: "mg_2", seq: 2, dissolved_at: null, order_ids: ["D-3", "D-4"] },
  ]);
  api.giroWarnings.mockResolvedValue({ ok: true, warnings: [] });
  const mk = (id, g, hh) => ({ id, nombre: id, tipo_consegna: "DOMICILIO", estado: "EN_COCINA", direccion: "C", zona: "Q1", hora: hh, delivery_deadline_at: dl(hh), manual_giro_id: g, items: [] });
  const ordenes = [mk("D-1", "mg_1", "20:40"), mk("D-2", "mg_1", "20:45"), mk("D-3", "mg_2", "21:10"), mk("D-4", "mg_2", "21:15")];
  const el = mount(<TabEntregas ordenes={ordenes} notify={() => {}} setOrdenes={() => {}} />);
  await flush();
  // MOVE
  const sel = el.querySelector('select[aria-label="Mover a otro giro"]');
  expect(sel).toBeTruthy();
  await act(async () => { sel.value = "mg_2"; sel.dispatchEvent(new Event("change", { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });
  await flush();
  expect(api.giroWarnings).toHaveBeenCalledWith({ giro_id: "mg_2", order_ids: ["D-1"] });
  expect(el.textContent).toContain("Mover D-1 → G2");
  await click(btn(el, "Mover"));
  expect(api.addOrderToManualGiro).toHaveBeenCalledWith("mg_2", "D-1");
  // REMOVE
  const quitar = [...el.querySelectorAll('button[title="Quitar este pedido del giro"]')][0];
  await click(quitar);
  expect(api.removeOrderFromManualGiro).toHaveBeenCalledTimes(1);
  // DISSOLVE
  const dis = [...el.querySelectorAll('button[title="Disolver giro manual"]')][0];
  await click(dis);
  expect(api.dissolveManualGiro).toHaveBeenCalledTimes(1);
  // nessuna UI rider
  expect(api.getDriverStatus).not.toHaveBeenCalled();
  expect(el.textContent).not.toMatch(/Registrar salida|Rider volviendo|Driver volvió/);
});
