/**
 * [FDV1 R3 §13–14] Pizzeria: il giro è un BLOCCO ATOMICO e la griglia non deve lasciare buchi assurdi.
 * Algoritmo sotto test: greedy row-fill con bounded lookahead (vedi cocina/kitchenPacking.js).
 * Invariante di sicurezza: nessun blocco viene MAI mostrato più in basso di dove sarebbe finito senza packing.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("../api", () => ({
  api: { getManualGiros: jest.fn().mockResolvedValue([]), setUiOffset: jest.fn(), priorityContract: jest.fn().mockResolvedValue({ ok: true, contract: { version: 2, min: -50, max: 50, margin_min: 0 } }), post: jest.fn() },
  auth: { getToken: () => "t", isAuthenticated: () => true },
}));
jest.mock("../sounds", () => ({ __esModule: true, default: { campanellaDieci: () => {} } }));

import PanelCocina from "../components/cocina/PanelCocina";
import { packKitchenSegments, packRows, segmentWidth, segmentUrgencyMs, slotCompatible, countdownLabel, blockDeadline, PACK_LOOKAHEAD } from "../components/cocina/kitchenPacking";
import { groupKitchenSegments, sortKitchenCards } from "../components/cocina/manualGiroCocina";

const iso = (hhmm) => `2026-09-21T${String(Number(hhmm.slice(0, 2)) - 2).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;
const NOW = Date.parse(iso("21:00"));
const pizza = [{ n: "Margherita", q: 1, cat: "Pizzas" }];
const o = (id, deadline, extra = {}) => ({ id, nombre: "Cliente", tipo_consegna: "DOMICILIO", estado: "EN_COCINA", zona: "Q1",
  hora: deadline, delivery_deadline_at: iso(deadline), ui_offset_min: 0, manual_giro_id: null, items: pizza, ts: 1, ...extra });

// segmenti sintetici (l'algoritmo è puro: gli basta type/cards)
const S = (id, hhmm) => ({ type: "single", card: o(id, hhmm) });
const G = (gid, ids, hhmm) => ({ type: "giro", giroId: gid, cards: ids.map((id, i) => o(id, hhmm, { manual_giro_id: gid })) });

const shape = (segs, cols = 3) => packRows(packKitchenSegments(segs, cols), cols)
  .map((row) => row.map((p) => (p.seg.type === "giro" ? p.seg.giroId : p.seg.card.id) + ":" + p.width));
const holes = (segs, cols = 3) => packRows(packKitchenSegments(segs, cols), cols)
  .slice(0, -1)                                                    // l'ultima riga può essere parziale: non è un buco
  .reduce((n, row) => n + (cols - row.reduce((a, p) => a + p.width, 0)), 0);

// Invariante: nessun blocco arretra rispetto all'ordine operativo d'ingresso.
const noBlockPushedDown = (segs, cols = 3) => {
  const packed = packKitchenSegments(segs, cols).map((p) => (p.seg.type === "giro" ? p.seg.giroId : p.seg.card.id));
  const input = segs.map((sg) => (sg.type === "giro" ? sg.giroId : sg.card.id));
  return input.every((k, i) => packed.indexOf(k) <= i + PACK_LOOKAHEAD && packed.indexOf(k) >= 0);
};

describe("packing (puro, 3 colonne)", () => {
  test("larghezze: standalone = 1, giro2 = 2, giro3 = 3; un giro più largo della riga occupa la riga, mai spezzato", () => {
    expect(segmentWidth(S("#1", "21:10"), 3)).toBe(1);
    expect(segmentWidth(G("g", ["#1", "#2"], "21:10"), 3)).toBe(2);
    expect(segmentWidth(G("g", ["#1", "#2", "#3"], "21:10"), 3)).toBe(3);
    expect(segmentWidth(G("g", ["#1", "#2", "#3", "#4"], "21:10"), 3)).toBe(3);     // 4 membri, 3 colonne → un solo box
  });

  test("1 + giro3: il giro3 non viene mai spezzato; con un riempitivo compatibile il buco sparisce", () => {
    const only = [S("#1", "21:05"), G("g1", ["#2", "#3", "#4"], "21:06")];
    expect(shape(only)).toEqual([["#1:1"], ["g1:3"]]);                               // niente da promuovere: il giro resta intero
    const withFiller = [S("#1", "21:05"), G("g1", ["#2", "#3", "#4"], "21:06"), S("#5", "21:12"), S("#6", "21:14")];
    expect(shape(withFiller)).toEqual([["#1:1", "#5:1", "#6:1"], ["g1:3"]]);
    expect(holes(withFiller)).toBe(0);
    expect(noBlockPushedDown(withFiller)).toBe(true);
  });

  test("2 + giro2", () => {
    const segs = [S("#1", "21:05"), S("#2", "21:06"), G("g1", ["#3", "#4"], "21:08")];
    expect(shape(segs)).toEqual([["#1:1", "#2:1"], ["g1:2"]]);
    const segs2 = [S("#1", "21:05"), S("#2", "21:06"), G("g1", ["#3", "#4"], "21:08"), S("#5", "21:09")];
    expect(shape(segs2)).toEqual([["#1:1", "#2:1", "#5:1"], ["g1:2"]]);              // #5 promosso, g1 NON arretra
    expect(holes(segs2)).toBe(0);
  });

  test("1 + giro2 + standalone: riga piena senza promozioni", () => {
    const segs = [S("#1", "21:05"), G("g1", ["#2", "#3"], "21:06"), S("#4", "21:20")];
    expect(shape(segs)).toEqual([["#1:1", "g1:2"], ["#4:1"]]);
    expect(holes(segs)).toBe(0);
  });

  test("giro3 + giro2 e due giro3: ogni giro resta intero", () => {
    expect(shape([G("g1", ["#1", "#2", "#3"], "21:05"), G("g2", ["#4", "#5"], "21:10")]))
      .toEqual([["g1:3"], ["g2:2"]]);
    expect(shape([G("g1", ["#1", "#2", "#3"], "21:05"), G("g2", ["#4", "#5", "#6"], "21:10")]))
      .toEqual([["g1:3"], ["g2:3"]]);
  });

  test("standalone misti: righe piene, nessun buco", () => {
    const segs = ["#1", "#2", "#3", "#4", "#5"].map((id, i) => S(id, `21:0${i}`));
    expect(shape(segs)).toEqual([["#1:1", "#2:1", "#3:1"], ["#4:1", "#5:1"]]);
    expect(holes(segs)).toBe(0);
  });

  test("§14 nessun ordine realmente più urgente viene nascosto: la promozione non arretra nessuno e non salta urgenze lontane", () => {
    // il solo candidato per il buco è a 70 minuti di distanza → meglio il buco
    const far = [S("#1", "21:05"), G("g1", ["#2", "#3", "#4"], "21:06"), S("#9", "22:20")];
    expect(shape(far)).toEqual([["#1:1"], ["g1:3"], ["#9:1"]]);
    expect(slotCompatible(126, 128)).toBe(true);
    expect(slotCompatible(126, 129)).toBe(false);
    expect(slotCompatible(126, 125)).toBe(false);                                    // mai promuovere qualcosa più urgente sopra la testa
    // la testa non arretra mai
    const segs = [S("#1", "21:05"), G("g1", ["#2", "#3", "#4"], "21:06"), S("#5", "21:12")];
    const packed = packKitchenSegments(segs, 3);
    expect(packed[0].seg.card.id).toBe("#1");
    expect(packed.findIndex((p) => p.seg.giroId === "g1")).toBeLessThanOrEqual(2);
    expect(noBlockPushedDown(segs)).toBe(true);
  });

  test("pickup: un blocco senza deadline non sale mai sopra lavoro a scadenza", () => {
    const ritiro = { type: "single", card: { id: "#R", tipo_consegna: "RITIRO", hora: "21:30", items: pizza } };
    expect(segmentUrgencyMs(ritiro)).toBe(Number.MAX_SAFE_INTEGER);
    const segs = [S("#1", "21:05"), G("g1", ["#2", "#3", "#4"], "21:06"), ritiro];
    expect(shape(segs)).toEqual([["#1:1"], ["g1:3"], ["#R:1"]]);
  });

  test("1 e 2 colonne (tablet stretto): il giro resta un blocco unico", () => {
    const segs = [S("#1", "21:05"), G("g1", ["#2", "#3", "#4"], "21:06")];
    expect(shape(segs, 1)).toEqual([["#1:1"], ["g1:1"]]);
    expect(shape(segs, 2)).toEqual([["#1:1"], ["g1:2"]]);
  });

  test("idempotenza: stesso input → stesso layout (refresh); permutazione dell'input → stesso layout", () => {
    const cards = [o("#1", "21:05"), o("#2", "21:06", { manual_giro_id: "g1" }), o("#3", "21:07", { manual_giro_id: "g1" }), o("#4", "21:12")];
    const layout = (arr) => shape(groupKitchenSegments(sortKitchenCards(arr, NOW)));
    expect(layout(cards)).toEqual(layout(cards));
    expect(layout([...cards].reverse())).toEqual(layout(cards));
  });
});

describe("blocco: orario e countdown (puro)", () => {
  test("orario del blocco = membro più urgente; countdown dal clock; TARDE = ritardo reale", () => {
    const cards = [o("#1", "21:45"), o("#2", "21:08"), o("#3", "21:50")];
    const dl = blockDeadline(cards, NOW);
    expect(dl.hhmm).toBe("21:08");
    expect(dl.state).toBe("near");
    expect(countdownLabel(dl.ms, NOW)).toMatchObject({ text: "−8 min", late: false });          // formato compatto
    expect(countdownLabel(dl.ms, NOW + 20 * 60000)).toMatchObject({ text: "+12 min", late: true });
    expect(countdownLabel(dl.ms, dl.ms)).toMatchObject({ text: "0 min" });
    expect(blockDeadline([{ id: "#R", tipo_consegna: "RITIRO", hora: "21:30" }], NOW)).toBeNull();
  });
});

describe("Pizzeria montata: realtime / refresh", () => {
  let container = null, root = null, nowSpy = null;
  beforeEach(() => { nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW); });
  afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; if (container) container.remove(); container = null; nowSpy.mockRestore(); });
  const mount = async (el) => {
    container = document.createElement("div"); document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(el); await Promise.resolve(); await Promise.resolve(); });
    return container;
  };
  const layout = (el) => [...el.querySelectorAll('[data-testid="kitchen-block"]')]
    .map((b) => (b.getAttribute("data-giro") || (b.textContent.match(/#\d+/) || [])[0]) + ":" + b.getAttribute("data-span"));

  test("un ordine che entra durante il servizio ricompone i blocchi senza spezzare il giro", async () => {
    const base = [o("#1", "21:05"), o("#2", "21:06", { manual_giro_id: "g1" }), o("#3", "21:07", { manual_giro_id: "g1" }), o("#4", "21:08", { manual_giro_id: "g1" })];
    const el = await mount(<PanelCocina ordenes={base} onListo={() => {}} onClose={() => {}} />);
    expect(layout(el)).toEqual(["#1:1", "g1:3"]);
    await act(async () => { root.render(<PanelCocina ordenes={[...base, o("#5", "21:12"), o("#6", "21:13")]} onListo={() => {}} onClose={() => {}} />); await Promise.resolve(); });
    expect(layout(el)).toEqual(["#1:1", "#5:1", "#6:1", "g1:3"]);                     // buco chiuso, giro intero
    const g = [...el.querySelectorAll('[data-testid="kitchen-block"]')].find((b) => b.getAttribute("data-giro") === "g1");
    expect((g.textContent.match(/#\d/g) || []).sort()).toEqual(["#2", "#3", "#4"]);
  });

  test("refresh (stesso input in ordine diverso) → stesso layout, nessuna card duplicata", async () => {
    const base = [o("#1", "21:05"), o("#2", "21:06", { manual_giro_id: "g1" }), o("#3", "21:07", { manual_giro_id: "g1" }), o("#4", "21:20")];
    const el = await mount(<PanelCocina ordenes={base} onListo={() => {}} onClose={() => {}} />);
    const before = layout(el);
    await act(async () => { root.render(<PanelCocina ordenes={[...base].reverse()} onListo={() => {}} onClose={() => {}} />); await Promise.resolve(); });
    expect(layout(el)).toEqual(before);
    expect(el.textContent.match(/#\d/g).length).toBe(4);
  });
});

// ─── [FDV1 R3 §19] Il tempo che passa NON riscrive la scelta dell'operatore ───────────────────────────────
describe("§19 offset già attivo e tempo che passa", () => {
  const fs = require("fs");
  const path = require("path");
  const read = (rel) => fs.readFileSync(path.join(process.cwd(), "src", rel), "utf8");

  test("nessun timer/effetto scrive ui_offset_min: l'unica scrittura è il click dell'operatore", () => {
    const panel = read("components/cocina/PanelCocina.jsx");
    const tab = read("components/cocina/TabCocina.jsx");
    const ctrl = read("components/ui/PriorityControl.jsx");
    for (const src of [panel, tab]) {
      expect(src).not.toMatch(/setUiOffset/);                         // Cocina/Pizzeria non scrivono mai da sole
      for (const m of src.match(/setInterval\([\s\S]{0,160}?\)/g) || []) expect(m).not.toMatch(/setUiOffset|ui_offset_min\s*:/);
    }
    // PriorityControl: setUiOffset solo dentro `apply`, che parte da un onClick
    expect((ctrl.match(/api\.setUiOffset/g) || [])).toHaveLength(1);
    expect(ctrl).not.toMatch(/useEffect\([\s\S]{0,400}?setUiOffset/);
  });

  test("il valore persistito resta invariato mentre il clock avanza; cambia solo urgenza e ordinamento", () => {
    const a = { ...o("#A", "21:40", { ui_offset_min: 30 }) };
    const before = a.ui_offset_min;
    const { kitchenSortMs, deadlineState } = require("../components/cocina/manualGiroCocina");
    const t0 = kitchenSortMs(a, NOW);
    const t1 = kitchenSortMs(a, NOW + 25 * 60000);                    // 25 minuti dopo
    expect(a.ui_offset_min).toBe(before);                             // nessun auto-rewrite
    expect(t1).toBeLessThan(t0);                                      // il + effettivo si riduce: la card risale
    expect(deadlineState(a, NOW).state).toBe("normal");
    expect(deadlineState(a, NOW + 35 * 60000).state).toBe("near");    // solo lo stato visivo evolve
    expect(deadlineState(a, NOW + 45 * 60000).state).toBe("late");
    expect(a.delivery_deadline_at).toBe(iso("21:40"));
    expect(a.hora).toBe("21:40");
  });
});
