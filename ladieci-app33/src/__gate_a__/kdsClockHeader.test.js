/**
 * [KDS 🕐] Header tempo: [ ORA ] [ COUNTDOWN ] affiancati, stessa altezza, nel banner 88px — delivery e RECOGIDA.
 * Colore del countdown = sola presentazione (deadlineState invariato). RECOGIDA = timer di ritiro esistente (calcTimer).
 * Priorità = un solo 🕐 nel footer accanto a LISTO (mai nell'header); RECOGIDA senza 🕐 (l'offset non ordina i RITIRO).
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("../api", () => ({
  api: {
    getManualGiros: jest.fn().mockResolvedValue([]), setUiOffset: jest.fn(), post: jest.fn(),
    priorityContract: jest.fn().mockResolvedValue({ ok: true, contract: { version: 2, min: -50, max: 50, margin_min: 0 } }),
    giroWarnings: jest.fn(), getOrdenes: jest.fn(),
  },
  auth: { getToken: () => "t", isAuthenticated: () => true },
}));
jest.mock("../sounds", () => ({ __esModule: true, default: { campanellaDieci: () => {} } }));

import TabCocina from "../components/cocina/TabCocina";
import PanelCocina from "../components/cocina/PanelCocina";
import { countdownTheme, pickupCountdown } from "../components/cocina/PizzeriaBlocks";
import { calcTimer } from "../components/ordenes/TabListos";
import { deadlineState } from "../components/cocina/manualGiroCocina";

const iso = (hhmm) => `2026-09-21T${String(Number(hhmm.slice(0, 2)) - 2).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;
const NOW = Date.parse(iso("21:00"));
const pizza = [{ n: "Margherita", q: 1, cat: "Pizzas" }];
const o = (id, deadline, extra = {}) => ({ id, nombre: "C", tipo_consegna: "DOMICILIO", estado: "EN_COCINA", zona: "Q1",
  hora: deadline, delivery_deadline_at: iso(deadline), ui_offset_min: 0, manual_giro_id: null, items: pizza, ts: 1, ...extra });
const pick = (id, hora) => ({ id, nombre: "R", tipo_consegna: "RITIRO", estado: "EN_COCINA", hora, forno_out: hora,
  delivery_deadline_at: null, zona: null, manual_giro_id: null, ui_offset_min: 0, items: pizza, ts: 1 });

let container = null, root = null, nowSpy = null;
beforeEach(() => { nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW); });
afterEach(() => { if (root) act(() => root.unmount()); root = null; if (container) container.remove(); container = null; nowSpy.mockRestore(); });
const mount = async (el) => {
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(el); await Promise.resolve(); await Promise.resolve(); });
  return container;
};
const M = 60000;

describe("countdownTheme — soglie di presentazione", () => {
  test(">15 neutro · ≤15 giallo · ≤10 rosso · <0 rosso scuro", () => {
    expect(countdownTheme(20 * M).level).toBe("normal");
    expect(countdownTheme(15 * M + 1).level).toBe("normal");
    expect(countdownTheme(15 * M).level).toBe("warn");
    expect(countdownTheme(10 * M + 1).level).toBe("warn");
    expect(countdownTheme(10 * M).level).toBe("alert");
    expect(countdownTheme(0).level).toBe("alert");
    expect(countdownTheme(-1).level).toBe("late");
    expect(countdownTheme(NaN).level).toBe("normal");
    // pillola sobria: fondo tenue, il colore di stato sta sul NUMERO (nessun fondo pieno rosso/giallo)
    expect(countdownTheme(14 * M)).toMatchObject({ bg: "#FEF3C7", ink: "#B45309" });
    expect(countdownTheme(9 * M)).toMatchObject({ bg: "#FEE2E2", ink: "#B91C1C" });
    expect(countdownTheme(-5 * M)).toMatchObject({ bg: "#FCA5A5", ink: "#7F1D1D" });
    for (const ms of [14 * M, 9 * M, -5 * M]) expect(["#FACC15", "#DC2626", "#7F1D1D"]).not.toContain(countdownTheme(ms).bg);
  });
  test("deadlineState NON cambia: 14 min resta 'normal' (LÍMITE), solo il box è giallo", () => {
    expect(deadlineState(o("#1", "21:14"), NOW).state).toBe("normal");
    expect(deadlineState(o("#1", "21:09"), NOW).state).toBe("near");
    expect(deadlineState(o("#1", "20:55"), NOW).state).toBe("late");
  });
});

describe("pickupCountdown = timer di ritiro esistente, solo reso grande", () => {
  test("stesso testo MM:SS / -MM:SS di calcTimer; ms solo per il colore", () => {
    const t1 = calcTimer({ hora: "21:14", tipo_consegna: "RITIRO" }, NOW);
    expect(pickupCountdown(t1)).toMatchObject({ text: "14:00", ms: 14 * M, late: false });
    const t2 = calcTimer({ hora: "20:57", tipo_consegna: "RITIRO" }, NOW);
    expect(pickupCountdown(t2)).toMatchObject({ text: "-03:00", ms: -3 * M, late: true });
    expect(pickupCountdown(null)).toBeNull();
  });
});

const levels = (el) => [...el.querySelectorAll('[data-testid="block-countdown-box"]')].map((b) => b.getAttribute("data-level"));

describe.each([
  ["Pizzeria", (ord) => <PanelCocina ordenes={ord} onListo={() => {}} onClose={() => {}} />],
  ["Cocina", (ord) => <TabCocina ordenes={ord} onListo={() => {}} />],
])("%s — header ORA | COUNTDOWN", (name, view) => {
  test("NORMAL / GIALLO / ROSSO / TARDE; ora e countdown nella stessa riga da 48px dentro il banner 88px", async () => {
    const el = await mount(view([o("#1", "21:20"), o("#2", "21:14", { zona: "Q5" }), o("#3", "21:09", { zona: "Q4" }), o("#4", "20:55", { zona: "Q3" })]));
    expect(levels(el).sort()).toEqual(["alert", "late", "normal", "warn"]);
    for (const row of el.querySelectorAll('[data-testid="block-time-row"]')) {
      expect(row.style.height).toBe("48px");
      expect(row.children).toHaveLength(2);
      expect(row.querySelector('[data-testid="block-main-time"]')).toBeTruthy();
      expect(row.querySelector('[data-testid="block-countdown"]')).toBeTruthy();
      expect(parseFloat(row.querySelector('[data-testid="block-main-time"]').style.fontSize)).toBeGreaterThanOrEqual(30);
      const cdPx = parseFloat(row.querySelector('[data-testid="block-countdown"]').firstChild.style.fontSize);
      expect(cdPx).toBeGreaterThanOrEqual(20);                                        // leggibile…
      expect(cdPx).toBeLessThanOrEqual(24);                                           // …ma secondario rispetto all'ora
      expect(cdPx).toBeLessThan(parseFloat(row.querySelector('[data-testid="block-main-time"]').style.fontSize));
      expect(row.closest('[data-state]').style.height).toBe("88px");
    }
    expect(el.textContent).toMatch(/TARDE/);
    // al massimo UNA etichetta piccola per blocco, nessun badge di stato ripetuto sulla card
    expect(el.querySelectorAll('[data-testid="card-state"]')).toHaveLength(0);
    for (const h of el.querySelectorAll('[data-state]')) {
      if (!h.getAttribute("data-testid") || !/header/.test(h.getAttribute("data-testid"))) continue;
      expect(h.textContent.match(/URGENTE|TARDE/g) || []).toHaveLength(h.getAttribute("data-state") === "normal" ? 0 : 1);
    }
  });

  test("RECOGIDA: stessa coppia ORA | COUNTDOWN, countdown = timer ritiro esistente, grande e colorato, niente 🕐 priorità", async () => {
    const el = await mount(view([pick("#5", "21:09"), pick("#6", "20:57")]));
    const rows = [...el.querySelectorAll('[data-pickup="1"] [data-testid="block-time-row"]')];
    expect(rows).toHaveLength(2);
    const txt = rows.map((r) => r.querySelector('[data-testid="pickup-prep"]').textContent).sort();
    expect(txt).toEqual(["-03:00", "09:00"]);
    for (const r of rows) {
      expect(parseFloat(r.querySelector('[data-testid="pickup-prep"]').firstChild.style.fontSize)).toBeGreaterThanOrEqual(20);   // non più microscopico
      expect(parseFloat(r.querySelector('[data-testid="block-main-time"]').style.fontSize)).toBeGreaterThanOrEqual(30);
      expect(r.querySelector('[data-testid="block-countdown"]')).toBeNull();          // nessun countdown di entrega
    }
    expect(levels(el).sort()).toEqual(["alert", "late"]);
    expect(el.querySelectorAll('[data-testid="pickup-prep"]')).toHaveLength(2);       // nessun duplicato piccolo nella card
    expect(el.querySelectorAll('[data-testid="priority-clock"]')).toHaveLength(0);
  });

  test("footer: [ LISTO ][ 🕐 ] — 🕐 48×48, mai nell'header, nessun ± separato", async () => {
    const el = await mount(view([o("#1", "21:20")]));
    const clock = el.querySelector('[data-testid="priority-clock"]');
    expect(clock.style.width).toBe("48px");
    expect(clock.style.height).toBe("48px");
    const footer = clock.closest('[data-testid="card-footer"]');
    expect(footer.textContent).toMatch(/LISTO/);
    expect(footer.lastElementChild.contains(clock)).toBe(true);                        // a destra di LISTO
    expect(clock.closest('[data-testid$="header"]')).toBeNull();
    expect(el.querySelectorAll('button[aria-label="Adelantar en la cola"],button[aria-label="Retrasar en la cola"]')).toHaveLength(0);
  });
});

describe("Cocina GIRO — un solo allarme per giro", () => {
  test("header del giro = ora + countdown del membro più urgente; membri senza pillola; un solo 🕐", async () => {
    const { api } = require("../api");
    api.getManualGiros.mockResolvedValue([{ id: "mg_260921_1", seq: 1, dissolved_at: null }]);
    const g = [o("#1", "21:09", { manual_giro_id: "mg_260921_1" }), o("#2", "21:30", { manual_giro_id: "mg_260921_1", zona: "Q4" })];
    const el = await mount(<TabCocina ordenes={g} onListo={() => {}} />);
    const grp = el.querySelector('[data-testid="giro-group"]');
    const head = grp.firstElementChild;
    expect(head.querySelector('[data-testid="block-main-time"]').textContent).toBe("21:09");
    expect(head.querySelector('[data-testid="block-countdown-box"]').getAttribute("data-level")).toBe("alert");
    const members = [...grp.querySelectorAll('[data-testid="deadline-header"]')];
    expect(members).toHaveLength(2);
    for (const m of members) expect(m.querySelector('[data-testid="block-countdown-box"]')).toBeNull();
    expect(grp.querySelectorAll('[data-testid="priority-clock"]')).toHaveLength(1);
  });
});
