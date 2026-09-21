/**
 * [FDV1 FE final] Cocina (TabCocina) e Pizzeria (PanelCocina) montati davvero.
 *   C — DOMICILIO: UN solo orario principale = delivery_deadline_at (LÍMITE / LÍMITE CERCA / ⚠ TARDE); niente forno_out,
 *       niente countdown "al horno", niente rider, niente CLIENTE/⏱ doppi; ±5 non crea orari visibili.
 *   A5 — giro = blocco atomico: uno standalone allo stesso minuto non spezza mai il giro; membri per urgenza individuale.
 * Mock del solo `../api` (getManualGiros) e dei suoni. Orologio fissato a 21:00 Madrid.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("../api", () => ({
  api: { getManualGiros: jest.fn().mockResolvedValue([{ id: "g1", seq: 1, dissolved_at: null }, { id: "g2", seq: 2, dissolved_at: null }]),
    setUiOffset: jest.fn(), post: jest.fn() },
  auth: { getToken: () => "t", isAuthenticated: () => true },
}));
jest.mock("../sounds", () => ({ __esModule: true, default: { campanellaDieci: () => {} } }));

import TabCocina from "../components/cocina/TabCocina";
import PanelCocina from "../components/cocina/PanelCocina";
import { sortKitchenCards, deadlineState } from "../components/cocina/manualGiroCocina";

// orari Madrid (UTC+2 a settembre)
const iso = (hhmm) => `2026-09-21T${String(Number(hhmm.slice(0, 2)) - 2).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;
const NOW = Date.parse(iso("21:00"));

let container = null, root = null, nowSpy = null;
beforeEach(() => { nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW); });
const mount = async (el) => {
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(el); await Promise.resolve(); await Promise.resolve(); });
  return container;
};
const rerender = async (el) => { await act(async () => { root.render(el); await Promise.resolve(); }); return container; };
afterEach(() => { if (root) act(() => root.unmount()); root = null; if (container) container.remove(); container = null; nowSpy.mockRestore(); });

const pizza = [{ n: "Margherita", q: 1, cat: "Pizzas" }];
const o = (id, deadline, extra = {}) => ({ id, nombre: "TEST FDV1", tipo_consegna: "DOMICILIO", estado: "EN_COCINA", zona: "Q1",
  hora: deadline, delivery_deadline_at: iso(deadline), ui_offset_min: 0, manual_giro_id: null, items: pizza, ts: 1,
  forno_out: "20:40", salida_driver_estimada: "20:45", entrega_estimada: "20:58", retraso_estimado_min: 12, conflicto_driver: true, ...extra });
const ids = (arr) => arr.map((c) => c.id);
const cardsOrder = (el) => [...el.textContent.matchAll(/#(0\d\d)/g)].map((m) => "#" + m[1]);
const RIDER = /Repartidor|Driver|salida|entrega est|al horno|rientro|retorno/i;

describe("C — Cocina: una sola deadline", () => {
  test("DOMICILIO: il solo orario visibile è il límite; niente forno_out / hora / rider / countdown", async () => {
    const el = await mount(<TabCocina ordenes={[o("#001", "21:45", { hora: "21:30" })]} onListo={() => {}} />);
    const txt = el.textContent;
    expect(txt).toMatch(/21:45\s*HORA LÍMITE/);
    expect(txt.match(/\d\d:\d\d/g)).toEqual(["21:45"]);             // UN solo orario (no 21:30 cliente, no 20:40 forno_out, no rider)
    expect(txt).not.toMatch(RIDER);
    expect(txt).not.toMatch(/CLIENTE|⏱|-\d+:\d\d/);
  });
  test("stati: normale / LÍMITE CERCA (≤10 min) / ⚠ TARDE (superato)", async () => {
    const el = await mount(<TabCocina ordenes={[o("#001", "21:45"), o("#002", "21:08"), o("#003", "20:55")]} onListo={() => {}} />);
    const txt = el.textContent;
    expect(txt).toMatch(/21:45\s*HORA LÍMITE/);
    expect(txt).toMatch(/21:08\s*URGENTE/);
    expect(txt).toMatch(/20:55\s*TARDE/);
    expect(deadlineState(o("#9", "21:10"), NOW).state).toBe("near");
    expect(deadlineState(o("#9", "21:11"), NOW).state).toBe("normal");
    expect(deadlineState(o("#9", "20:59"), NOW).state).toBe("late");
  });
  test("±5 (standalone e giro intero) cambia solo la priorità: nessun nuovo orario, deadline immutata, nessun duplicato", async () => {
    const ord = [o("#001", "21:30", { manual_giro_id: "g1", ui_offset_min: 5 }), o("#002", "21:40", { manual_giro_id: "g1", ui_offset_min: 5 }),
      o("#003", "21:35", { ui_offset_min: -5 })];
    const el = await mount(<TabCocina ordenes={ord} onListo={() => {}} />);
    expect(el.textContent.match(/\d\d:\d\d/g).sort()).toEqual(["21:30", "21:35", "21:40"]);  // 21:35 / 21:30 (±5) mai mostrati come target
    expect(cardsOrder(el)).toEqual(["#003", "#001", "#002"]);       // −5 → 21:30 prima del giro (21:35)
  });
  test("RITIRO invariato (🕐 hora)", async () => {
    const el = await mount(<TabCocina ordenes={[{ id: "#004", nombre: "R", tipo_consegna: "RITIRO", estado: "EN_COCINA", hora: "21:20", items: pizza, ts: 1 }]} onListo={() => {}} />);
    expect(el.textContent).toMatch(/🕐\s*21:20/);
  });
});

describe("A5 — giro = blocco atomico (sortKitchenCards)", () => {
  test("giro + standalone allo stesso minuto: il giro resta contiguo", () => {
    const cards = [o("#003", "21:30", { manual_giro_id: "g1" }), o("#002", "21:30"), o("#001", "21:30", { manual_giro_id: "g1" }), o("#004", "21:50", { manual_giro_id: "g1" })];
    const out = ids(sortKitchenCards(cards));
    const pos = ["#001", "#003", "#004"].map((id) => out.indexOf(id)).sort((a, b) => a - b);
    expect(pos[2] - pos[0]).toBe(2);
    expect(out).toEqual(["#001", "#003", "#004", "#002"]);
  });
  test("standalone più urgente → prima del giro; giro più urgente → prima dello standalone", () => {
    expect(ids(sortKitchenCards([o("#001", "21:30", { manual_giro_id: "g1" }), o("#002", "21:40", { manual_giro_id: "g1" }), o("#003", "21:10")])))
      .toEqual(["#003", "#001", "#002"]);
    expect(ids(sortKitchenCards([o("#003", "21:45"), o("#002", "21:40", { manual_giro_id: "g1" }), o("#001", "21:20", { manual_giro_id: "g1" })])))
      .toEqual(["#001", "#002", "#003"]);
  });
  test("due giri allo stesso minuto: nessun interleaving", () => {
    const out = ids(sortKitchenCards([o("#001", "21:30", { manual_giro_id: "g1" }), o("#002", "21:30", { manual_giro_id: "g2" }),
      o("#003", "21:40", { manual_giro_id: "g1" }), o("#004", "21:35", { manual_giro_id: "g2" })]));
    expect(out).toEqual(["#001", "#003", "#002", "#004"]);
  });
  test("membri con deadline diverse: ordinati per urgenza individuale dentro il blocco", () => {
    const out = ids(sortKitchenCards([o("#001", "21:50", { manual_giro_id: "g1" }), o("#002", "21:20", { manual_giro_id: "g1" }), o("#003", "21:35", { manual_giro_id: "g1" })]));
    expect(out).toEqual(["#002", "#003", "#001"]);
  });
  test("input permutato (realtime / refresh) → stesso ordine", () => {
    const base = [o("#001", "21:30", { manual_giro_id: "g1" }), o("#002", "21:30"), o("#003", "21:30", { manual_giro_id: "g1" }), o("#004", "21:30", { manual_giro_id: "g2" })];
    const ref = ids(sortKitchenCards(base));
    for (const perm of [[3, 2, 1, 0], [1, 3, 0, 2], [2, 0, 3, 1]]) expect(ids(sortKitchenCards(perm.map((i) => base[i])))).toEqual(ref);
  });
});

describe("A5 — render reale + realtime", () => {
  test("TabCocina: giro contiguo con standalone allo stesso minuto; dopo remove il membro esce dal blocco", async () => {
    const g = [o("#001", "21:30", { manual_giro_id: "g1" }), o("#002", "21:30"), o("#003", "21:45", { manual_giro_id: "g1" })];
    const el = await mount(<TabCocina ordenes={g} onListo={() => {}} />);
    expect(cardsOrder(el)).toEqual(["#001", "#003", "#002"]);
    await rerender(<TabCocina ordenes={[g[2], g[1], g[0]]} onListo={() => {}} />);          // refresh con ordine diverso
    expect(cardsOrder(el)).toEqual(["#001", "#003", "#002"]);
    await rerender(<TabCocina ordenes={[g[0], g[1], { ...g[2], manual_giro_id: null }]} onListo={() => {}} />);  // remove #003
    expect(cardsOrder(el)).toEqual(["#001", "#002", "#003"]);
  });
  test("PanelCocina (Pizzeria): stesso raggruppamento, UN solo orario grande per blocco, nessun rider", async () => {
    const g = [o("#002", "21:30"), o("#003", "21:45", { manual_giro_id: "g1" }), o("#001", "21:30", { manual_giro_id: "g1", hora: "21:15" })];
    const el = await mount(<PanelCocina ordenes={g} onListo={() => {}} onClose={() => {}} />);
    expect(cardsOrder(el)).toEqual(["#001", "#003", "#002"]);
    const txt = el.textContent;
    // [FDV1 R3 §10] la Pizzeria non ripete più l'etichetta HORA LÍMITE su ogni card: ogni blocco ha UN orario
    // (quello del membro più urgente) più il countdown; il límite del membro diverso resta in piccolo.
    const blocks = [...el.querySelectorAll('[data-testid="kitchen-block"]')];
    expect(blocks.map((b) => b.querySelector('[data-testid="block-main-time"]').textContent)).toEqual(["21:30", "21:30"]);
    for (const b of blocks) expect(b.querySelectorAll('[data-testid="block-main-time"]')).toHaveLength(1);
    expect([...el.querySelectorAll('[data-testid="card-own-limit"]')].map((n) => n.textContent)).toEqual(["límite 21:45"]);
    expect(txt).not.toMatch(/HORA LÍMITE/);
    expect(txt).toMatch(/faltan 30 min/);
    expect(txt).not.toMatch(RIDER);
    // ⏱ qui è il countdown del blocco (§11), non il vecchio "target di produzione" per-card
    expect(txt).not.toMatch(/CLIENTE|20:40|21:15/);
  });
});

describe("R3 — ± una sola volta per giro, scelta rapida, nessuna animazione", () => {
  test("TabCocina: controllo ± sulla prima card del giro e sugli standalone, non sugli altri membri", async () => {
    const g = [o("#001", "21:30", { manual_giro_id: "g1" }), o("#002", "21:30"), o("#003", "21:45", { manual_giro_id: "g1" })];
    const el = await mount(<TabCocina ordenes={g} onListo={() => {}} />);
    expect([...el.querySelectorAll('button[aria-label="Retrasar en la cola"]')]).toHaveLength(2);   // #001 (giro) + #002 (standalone)
    expect(el.querySelectorAll('[data-testid="giro-group"]')).toHaveLength(1);
    expect(el.textContent).not.toMatch(/Cancelar snooze|−5|\+5/);
    expect([...el.querySelectorAll("div")].filter((d) => /blink/.test(d.style.animation || ""))).toHaveLength(0);
  });
  test("picker: valori assoluti 5..30, 'Sin prioridad' solo con offset, setUiOffset col valore scelto", async () => {
    const { api } = require("../api");
    api.setUiOffset.mockResolvedValue({ _ok: true, _status: 200 });
    const el = await mount(<TabCocina ordenes={[o("#001", "21:30", { ui_offset_min: 10 })]} onListo={() => {}} />);
    expect(el.querySelector('[data-testid="priority-chip"]').textContent).toBe("+10");
    await act(async () => { el.querySelector('button[aria-label="Adelantar en la cola"]').click(); });
    expect([...el.querySelectorAll('[role="menu"] button')].map((b) => b.textContent)).toEqual(["5", "10", "15", "20", "30", "Sin prioridad"]);
    await act(async () => { [...el.querySelectorAll('[role="menu"] button')].find((b) => b.textContent === "15").click(); await Promise.resolve(); });
    expect(api.setUiOffset).toHaveBeenCalledWith("#001", -15);
  });
});
