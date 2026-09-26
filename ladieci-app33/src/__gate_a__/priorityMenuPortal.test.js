/**
 * [KDS tablet] Regressione 58fb386: il menu ± (5…50) era figlio del BlockHeader (height 88, overflow:hidden) e veniva
 * tagliato → l'operatore non lo vedeva. Il menu ora vive in un portal su document.body, position:fixed.
 * Contratto: bottoni invariati nell'header, menu fuori da ogni contenitore clippante, outside-click chiude, un tocco
 * DENTRO il menu non lo chiude prima della scelta, valore assoluto inviato una volta (anche per il GIRO).
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("../api", () => ({
  api: {
    getManualGiros: jest.fn().mockResolvedValue([{ id: "mg_260921_1", seq: 1, dissolved_at: null }]),
    setUiOffset: jest.fn(), priorityContract: jest.fn(), post: jest.fn(),
    giroWarnings: jest.fn(), getOrdenes: jest.fn(),
  },
  auth: { getToken: () => "t", isAuthenticated: () => true },
}));
jest.mock("../sounds", () => ({ __esModule: true, default: { campanellaDieci: () => {} } }));

import TabCocina from "../components/cocina/TabCocina";
import PanelCocina from "../components/cocina/PanelCocina";
import { __resetPriorityContractCache } from "../components/ui/usePriorityContract";
import { api } from "../api";

const iso = (hhmm) => `2026-09-21T${String(Number(hhmm.slice(0, 2)) - 2).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;
const NOW = Date.parse(iso("21:00"));
const V2 = { ok: true, contract: { version: 2, min: -50, max: 50, margin_min: 0 } };
const pizza = [{ n: "Margherita", q: 1, cat: "Pizzas" }];
const o = (id, deadline, extra = {}) => ({ id, nombre: "Cliente " + id, tipo_consegna: "DOMICILIO", estado: "EN_COCINA", zona: "Q1",
  hora: deadline, delivery_deadline_at: iso(deadline), ui_offset_min: 0, manual_giro_id: null, items: pizza, ts: 1, ...extra });
const ORDERS = () => [
  o("#001", "21:40", { manual_giro_id: "mg_260921_1" }),
  o("#002", "21:50", { manual_giro_id: "mg_260921_1" }),
  o("#003", "21:45", { zona: "Q4", ui_offset_min: 10 }),
];

let container = null, root = null, nowSpy = null;
beforeEach(() => {
  nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW);
  __resetPriorityContractCache(); api.priorityContract.mockReset().mockResolvedValue(V2);
  api.setUiOffset.mockReset().mockResolvedValue({ success: true, _ok: true, _status: 200 });
});
afterEach(() => { if (root) act(() => root.unmount()); root = null; if (container) container.remove(); container = null; nowSpy.mockRestore(); });
const mount = async (el) => {
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(el); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  return container;
};
const menuEl = () => document.querySelector('[role="menu"]');
const item = (label) => [...menuEl().querySelectorAll("button")].find((b) => b.textContent === label);
const pointerdown = (target) => act(async () => { target.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
const tap = async (target) => { await pointerdown(target); await act(async () => { target.click(); await Promise.resolve(); await Promise.resolve(); }); };
const HEADERS = '[data-testid="block-header"],[data-testid="deadline-header"],[data-testid="giro-group"],[data-testid="kitchen-block"]';

describe.each([
  ["Pizzeria", () => <PanelCocina ordenes={ORDERS()} onListo={() => {}} onClose={() => {}} />],
  ["Cocina", () => <TabCocina ordenes={ORDERS()} onListo={() => {}} />],
])("%s — menu ± fuori dal clipping del banner", (name, view) => {
  test("− e + aprono un menu in portal su body (fixed), mai dentro header/card con overflow:hidden", async () => {
    const el = await mount(view());
    for (const label of ["Adelantar en la cola", "Retrasar en la cola"]) {
      const btn = el.querySelector(`button[aria-label="${label}"]`);
      expect(btn.closest(HEADERS)).toBeTruthy();                        // il bottone resta dov'era
      await tap(btn);
      const m = menuEl();
      expect(m).toBeTruthy();
      expect(m.parentElement).toBe(document.body);
      expect(m.closest(HEADERS)).toBeNull();
      expect(container.contains(m)).toBe(false);
      expect(m.style.position).toBe("fixed");
      expect(Number(m.style.zIndex)).toBeGreaterThan(800);              // sopra l'overlay Pizzeria (zIndex 800)
      await pointerdown(document.body);                                  // outside click → chiude
      expect(menuEl()).toBeNull();
    }
  });

  test("tocco dentro il menu non lo chiude prima della scelta; 5 / −10 / Sin prioridad inviano il valore assoluto", async () => {
    const el = await mount(view());
    const btns = [...el.querySelectorAll('button[aria-label="Retrasar en la cola"]')];
    expect(btns).toHaveLength(2);                                        // 1 per il GIRO + 1 per #003
    const single = btns.find((b) => !b.closest('[data-giro="mg_260921_1"],[data-testid="giro-group"]'));
    const sub = single.parentElement.querySelector('button[aria-label="Adelantar en la cola"]');

    await tap(single);
    await pointerdown(item("5"));
    expect(menuEl()).toBeTruthy();                                       // pointerdown nel portal ≠ outside
    await act(async () => { item("5").click(); await Promise.resolve(); await Promise.resolve(); });
    expect(api.setUiOffset).toHaveBeenLastCalledWith("#003", 5);
    expect(menuEl()).toBeNull();

    await tap(sub); await tap(item("10"));
    expect(api.setUiOffset).toHaveBeenLastCalledWith("#003", -10);

    await tap(sub); await tap(item("Sin prioridad"));
    expect(api.setUiOffset).toHaveBeenLastCalledWith("#003", 0);
    expect(api.setUiOffset).toHaveBeenCalledTimes(3);
  });

  test("GIRO: un solo controllo, valore applicato una volta sul primo membro; orari e header invariati", async () => {
    const el = await mount(view());
    const giroBtn = [...el.querySelectorAll('button[aria-label="Retrasar en la cola"]')]
      .find((b) => b.closest('[data-giro="mg_260921_1"],[data-testid="giro-group"]'));
    const timesBefore = [...el.querySelectorAll('[data-testid="block-main-time"]')].map((t) => t.textContent).sort();
    await tap(giroBtn); await tap(item("10"));
    expect(api.setUiOffset).toHaveBeenCalledTimes(1);
    expect(api.setUiOffset).toHaveBeenCalledWith("#001", 10);
    expect([...el.querySelectorAll('[data-testid="block-main-time"]')].map((t) => t.textContent).sort()).toEqual(timesBefore);
    for (const h of el.querySelectorAll('[data-testid="block-header"],[data-testid="deadline-header"]')) {
      expect(h.style.height).toBe("88px");
      expect(h.style.overflow).toBe("hidden");                           // il banner NON è stato toccato
    }
  });
});
