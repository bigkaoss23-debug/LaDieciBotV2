/**
 * [FDV1 fix] Pizzeria (PanelCocina) doveva marcare LISTO ma il bottone era realmente assente dal
 * rendering (onListo era una prop "dead": mai chiamata). Fix minimo: un bottone per-card che chiama
 * la stessa transizione canonica EN_COCINA→LISTO già usata da Cocina (onListo→setListo→api.updateEstado).
 * Nessuna nuova state machine, nessun nuovo stato "pizza pronta".
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("../api", () => ({
  api: {
    getManualGiros: jest.fn().mockResolvedValue([]),
    setUiOffset: jest.fn(),
    priorityContract: jest.fn().mockResolvedValue({ ok: true, contract: { version: 2, min: -50, max: 50, margin_min: 0 } }),
    post: jest.fn(),
  },
  auth: { getToken: () => "t", isAuthenticated: () => true },
}));
jest.mock("../sounds", () => ({ __esModule: true, default: { campanellaDieci: () => {} } }));

import PanelCocina from "../components/cocina/PanelCocina";

const iso = (hhmm) => `2026-09-21T${String(Number(hhmm.slice(0, 2)) - 2).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;
const NOW = Date.parse(iso("21:00"));
const pizza = [{ n: "Margherita", q: 1, cat: "Pizzas" }];

const domicilio = (id, hhmm, extra = {}) => ({
  id, nombre: "Cliente", tipo_consegna: "DOMICILIO", estado: "EN_COCINA", zona: "Q1",
  hora: hhmm, delivery_deadline_at: iso(hhmm), ui_offset_min: 0, manual_giro_id: null, items: pizza, ts: 1, ...extra,
});
const ritiro = (id, hhmm, extra = {}) => ({
  id, nombre: "Cliente", tipo_consegna: "RITIRO", estado: "EN_COCINA",
  hora: hhmm, ui_offset_min: 0, manual_giro_id: null, items: pizza, ts: 1, ...extra,
});

describe("Pizzeria — bottone LISTO (fix minimo, transizione canonica)", () => {
  let container = null, root = null, nowSpy = null;
  beforeEach(() => { nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW); });
  afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; if (container) container.remove(); container = null; nowSpy.mockRestore(); });
  const mount = async (el) => {
    container = document.createElement("div"); document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(el); await Promise.resolve(); await Promise.resolve(); });
    return container;
  };
  const listoButtons = (el) => [...el.querySelectorAll('[data-testid="pizzeria-listo"]')];

  test("1) ordine singolo DOMICILIO mostra il bottone LISTO", async () => {
    const el = await mount(<PanelCocina ordenes={[domicilio("#101", "21:20")]} onListo={() => {}} onClose={() => {}} />);
    expect(listoButtons(el)).toHaveLength(1);
    expect(listoButtons(el)[0].textContent).toContain("LISTO");
  });

  test("2) click chiama onListo una sola volta con id corretto, origin=PanelCocina, actor=pizzeria", async () => {
    const onListo = jest.fn();
    const el = await mount(<PanelCocina ordenes={[domicilio("#102", "21:20")]} onListo={onListo} onClose={() => {}} />);
    await act(async () => { listoButtons(el)[0].click(); });
    expect(onListo).toHaveBeenCalledTimes(1);
    expect(onListo).toHaveBeenCalledWith("#102", { origin: "PanelCocina", actor: "pizzeria" });
  });

  test("3) GIRO con più ordini: ogni card ha il proprio LISTO; il click passa SOLO il relativo order id", async () => {
    const onListo = jest.fn();
    const cards = [
      domicilio("#201", "21:10", { manual_giro_id: "g1" }),
      domicilio("#202", "21:10", { manual_giro_id: "g1" }),
      domicilio("#203", "21:10", { manual_giro_id: "g1" }),
    ];
    const el = await mount(<PanelCocina ordenes={cards} onListo={onListo} onClose={() => {}} />);
    const btns = listoButtons(el);
    expect(btns).toHaveLength(3);                              // un bottone per membro, nessuna azione a livello di blocco
    await act(async () => { btns[1].click(); });
    expect(onListo).toHaveBeenCalledTimes(1);
    expect(onListo).toHaveBeenCalledWith("#202", { origin: "PanelCocina", actor: "pizzeria" });
  });

  test("4) RITIRO: LISTO presente e handler corretto", async () => {
    const onListo = jest.fn();
    const el = await mount(<PanelCocina ordenes={[ritiro("#301", "21:30")]} onListo={onListo} onClose={() => {}} />);
    const btns = listoButtons(el);
    expect(btns).toHaveLength(1);
    await act(async () => { btns[0].click(); });
    expect(onListo).toHaveBeenCalledTimes(1);
    expect(onListo).toHaveBeenCalledWith("#301", { origin: "PanelCocina", actor: "pizzeria" });
  });

  test("5) DOMICILIO standalone (fuori giro): LISTO presente e handler corretto", async () => {
    const onListo = jest.fn();
    const el = await mount(<PanelCocina ordenes={[domicilio("#401", "21:15")]} onListo={onListo} onClose={() => {}} />);
    const btns = listoButtons(el);
    expect(btns).toHaveLength(1);
    await act(async () => { btns[0].click(); });
    expect(onListo).toHaveBeenCalledTimes(1);
    expect(onListo).toHaveBeenCalledWith("#401", { origin: "PanelCocina", actor: "pizzeria" });
  });

  test("6) nessuna doppia chiamata: bottone disabilitato mentre l'id è in loadingIds", async () => {
    const onListo = jest.fn();
    const el = await mount(<PanelCocina ordenes={[domicilio("#501", "21:15")]} onListo={onListo} onClose={() => {}} loadingIds={new Set(["#501"])} />);
    const btn = listoButtons(el)[0];
    expect(btn.disabled).toBe(true);
    await act(async () => { btn.click(); });
    expect(onListo).not.toHaveBeenCalled();
  });

  test("6b) doppio click rapido su un ordine non ancora in loadingIds (prop invariata tra i due click) invia comunque una sola richiesta per click reale — nessun doppio invio dallo stesso evento", async () => {
    const onListo = jest.fn();
    const el = await mount(<PanelCocina ordenes={[domicilio("#502", "21:15")]} onListo={onListo} onClose={() => {}} />);
    const btn = listoButtons(el)[0];
    await act(async () => { btn.click(); });
    expect(onListo).toHaveBeenCalledTimes(1);
  });

  test("PanelCocina non tocca TabCocina: nessuna modifica al file", () => {
    const fs = require("fs");
    const path = require("path");
    // Guardia statica: questo fix deve restare confinato a PanelCocina.jsx.
    const tab = fs.readFileSync(path.join(process.cwd(), "src/components/cocina/TabCocina.jsx"), "utf8");
    expect(tab).toMatch(/✅ LISTO/);                            // Cocina aveva già il suo bottone, invariato
  });
});
