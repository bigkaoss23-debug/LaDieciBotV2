/**
 * [FDV1 R3] Contratto priorità ±50 (finestra prima della HORA LÍMITE) + contratto visivo Cocina / Pizzeria / Entregas.
 * Mock del solo `../api`. Orologio fissato alle 21:00 Madrid.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("../api", () => ({
  api: {
    getManualGiros: jest.fn().mockResolvedValue([{ id: "g1", seq: 1, dissolved_at: null }, { id: "g2", seq: 2, dissolved_at: null }]),
    setUiOffset: jest.fn(), priorityContract: jest.fn(), post: jest.fn(),
    giroWarnings: jest.fn(), getOrdenes: jest.fn(),
  },
  auth: { getToken: () => "t", isAuthenticated: () => true },
}));
jest.mock("../sounds", () => ({ __esModule: true, default: { campanellaDieci: () => {} } }));

import TabCocina from "../components/cocina/TabCocina";
import PanelCocina from "../components/cocina/PanelCocina";
import TabEntregas from "../components/entregas/TabEntregas";
import PriorityControl, { priorityOptions } from "../components/ui/PriorityControl";
import { __resetPriorityContractCache, normalizeContract } from "../components/ui/usePriorityContract";
import { maxPlusMinutes, kitchenSortMs, sortKitchenCards } from "../components/cocina/manualGiroCocina";
import { giroColor } from "../components/cocina/kitchenVisual";
import { api } from "../api";

const iso = (hhmm) => `2026-09-21T${String(Number(hhmm.slice(0, 2)) - 2).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;
const NOW = Date.parse(iso("21:00"));
const V2 = { ok: true, contract: { version: 2, min: -50, max: 50, margin_min: 0 } };   // §16/17: nessun buffer artificiale
const V1 = normalizeContract(null);

let container = null, root = null, nowSpy = null;
beforeEach(() => { nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW); __resetPriorityContractCache(); api.priorityContract.mockReset(); api.setUiOffset.mockReset(); });
afterEach(() => { if (root) act(() => root.unmount()); root = null; if (container) container.remove(); container = null; nowSpy.mockRestore(); });
const mount = async (el) => {
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(el); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  return container;
};
const pizza = [{ n: "Margherita", q: 1, cat: "Pizzas" }];
const o = (id, deadline, extra = {}) => ({ id, nombre: "Cliente " + id.replace("#", "n"), tipo_consegna: "DOMICILIO", estado: "EN_COCINA", zona: "Q1",
  hora: deadline, delivery_deadline_at: iso(deadline), ui_offset_min: 0, manual_giro_id: null, items: pizza, ts: 1, ...extra });
const openPicker = async (el, dir) => { await act(async () => { el.querySelector(`button[aria-label="${dir === "add" ? "Retrasar" : "Adelantar"} en la cola"]`).click(); }); };
const menu = (el) => [...el.querySelectorAll('[role="menu"] button')].map((b) => ({ t: b.textContent, on: !b.disabled }));

describe("contratto ± (pure)", () => {
  test("v2: + options 5..50, allowed only ≤ window; lowering an existing + allowed; − always allowed", () => {
    const c = normalizeContract(V2);
    expect(c).toMatchObject({ version: 2, min: -50, max: 50, margin_min: 0 });
    const add = priorityOptions({ dir: "add", current: 30, maxPlus: 20, contract: c });
    expect(add.map((x) => x.minutes)).toEqual([5, 10, 15, 20, 30, 40, 50]);
    expect(add.filter((x) => x.allowed).map((x) => x.minutes)).toEqual([5, 10, 15, 20]);     // 30 = current (no-op), 40/50 > window
    const lower = priorityOptions({ dir: "add", current: 50, maxPlus: 0, contract: c });
    expect(lower.filter((x) => x.allowed).map((x) => x.minutes)).toEqual([5, 10, 15, 20, 30, 40]);   // < current → reducing is fine
    const sub = priorityOptions({ dir: "sub", current: 0, maxPlus: 0, contract: c });
    expect(sub.every((x) => x.allowed)).toBe(true);
    expect(sub.map((x) => x.value)).toEqual([-5, -10, -15, -20, -30, -40, -50]);
  });
  test("BE without priorityContract (LIVE v1) → ±30: 40/50 never offered", () => {
    expect(normalizeContract({ error: "unknown action" })).toEqual(V1);
    expect(priorityOptions({ dir: "add", current: 0, maxPlus: 50, contract: V1 }).map((x) => x.minutes)).toEqual([5, 10, 15, 20, 30]);
  });
  test("§17 window = minuti REALI fino alla hora límite; nessun buffer di 10 min; solo TARDE azzera", () => {
    const c = normalizeContract(V2);
    expect(c.margin_min).toBe(0);
    expect(maxPlusMinutes([o("#1", "22:30")], NOW, c)).toBe(50);                 // clamp al contratto
    expect(maxPlusMinutes([o("#1", "21:35")], NOW, c)).toBe(35);                 // era 25 col buffer: ora i minuti veri
    expect(maxPlusMinutes([o("#1", "21:25"), o("#2", "22:30")], NOW, c)).toBe(25);   // membro più urgente
    expect(maxPlusMinutes([o("#1", "21:08")], NOW, c)).toBe(8);                  // URGENTE è visivo, non vietato
    expect(maxPlusMinutes([o("#1", "20:50")], NOW, c)).toBe(0);                  // TARDE = superamento reale
    expect(maxPlusMinutes([{ id: "#x", tipo_consegna: "DOMICILIO" }], NOW, c)).toBe(0);
  });
  test("§16 ordine appena entrato (deadline ts+55) → +50 resta valido, anche se lascia 5 minuti", () => {
    const c = normalizeContract(V2);
    expect(maxPlusMinutes([o("#1", "21:55")], NOW, c)).toBe(50);
    const opts = priorityOptions({ dir: "add", current: 0, maxPlus: maxPlusMinutes([o("#1", "21:55")], NOW, c), contract: c });
    expect(opts.filter((x) => x.allowed).map((x) => x.minutes)).toEqual([5, 10, 15, 20, 30, 40, 50]);
  });
  test("sort: a + never pushes a card past its safe window (effective + shrinks as time passes); − always full", () => {
    const a = o("#A", "21:20", { ui_offset_min: 50 });                  // 20 left → effective +20 (nessun buffer)
    expect((kitchenSortMs(a, NOW) - Date.parse(iso("21:20"))) / 60000).toBe(20);
    expect((kitchenSortMs(o("#B", "21:20", { ui_offset_min: -50 }), NOW) - Date.parse(iso("21:20"))) / 60000).toBe(-50);
    const out = sortKitchenCards([a, o("#C", "21:45")], NOW).map((x) => x.id);
    expect(out).toEqual(["#A", "#C"]);                                    // +50 would have put #A after #C (21:45)
  });
});

describe("PriorityControl mounted", () => {
  test("−/+ buttons carry no minutes; v2 contract shows 5..50; values beyond the window disabled", async () => {
    api.priorityContract.mockResolvedValue(V2);
    const el = await mount(<PriorityControl orden={o("#1", "21:30")} nowMs={NOW} />);
    const btns = [...el.querySelectorAll("button")].map((b) => b.textContent);
    expect(btns).toEqual(["−", "+"]);
    await openPicker(el, "add");
    expect(menu(el)).toEqual([["5", true], ["10", true], ["15", true], ["20", true], ["30", true], ["40", false], ["50", false]].map(([t, on]) => ({ t, on })));
    expect(el.textContent).toMatch(/Máx\. \+30 ahora/);
  });
  test("giro window = most urgent member; applying sends the absolute value once", async () => {
    api.priorityContract.mockResolvedValue(V2);
    api.setUiOffset.mockResolvedValue({ success: true, ui_offset_min: 15, _ok: true, _status: 200 });
    const members = [o("#1", "22:30", { manual_giro_id: "mg_260921_1" }), o("#2", "21:25", { manual_giro_id: "mg_260921_1" })];
    const el = await mount(<PriorityControl orden={members[0]} windowOrders={members} nowMs={NOW} />);
    await openPicker(el, "add");
    expect(menu(el).filter((x) => x.on).map((x) => x.t)).toEqual(["5", "10", "15", "20"]);   // #2 = 25 min reali
    await act(async () => { [...el.querySelectorAll('[role="menu"] button')].find((b) => b.textContent === "15").click(); await Promise.resolve(); });
    expect(api.setUiOffset).toHaveBeenCalledTimes(1);
    expect(api.setUiOffset).toHaveBeenCalledWith("#1", 15);
  });
  test("BE refuses (offset_exceeds_window, HTTP 200 body) → rollback + 'Máx. +N ahora', never shown as saved", async () => {
    api.priorityContract.mockResolvedValue(V2);
    api.setUiOffset.mockResolvedValue({ success: false, status: 409, error: "offset_exceeds_window", max_allowed: 5, _ok: true, _status: 200 });
    const onUpdate = jest.fn();
    const el = await mount(<PriorityControl orden={o("#1", "21:30")} nowMs={NOW} onUpdate={onUpdate} />);
    await openPicker(el, "add");
    await act(async () => { [...el.querySelectorAll('[role="menu"] button')].find((b) => b.textContent === "10").click(); await Promise.resolve(); await Promise.resolve(); });
    expect(onUpdate.mock.calls).toEqual([["#1", 10], ["#1", 0]]);
    expect(el.textContent).toMatch(/Máx\. \+5 ahora/);
  });
  test("network error → 'Sin confirmar', no rollback (realtime decides)", async () => {
    api.priorityContract.mockResolvedValue(V2);
    api.setUiOffset.mockResolvedValue({ error: "TypeError: Failed to fetch", _ok: false, _status: 0 });
    const onUpdate = jest.fn();
    const el = await mount(<PriorityControl orden={o("#1", "22:30")} nowMs={NOW} onUpdate={onUpdate} />);
    await openPicker(el, "sub");
    await act(async () => { [...el.querySelectorAll('[role="menu"] button')].find((b) => b.textContent === "20").click(); await Promise.resolve(); await Promise.resolve(); });
    expect(onUpdate.mock.calls).toEqual([["#1", -20]]);
    expect(el.textContent).toMatch(/Sin confirmar/);
  });
});

// 10+ card: Q1 / Q3 / Q4 / sin zona, 2 giri, standalone, NORMAL / URGENTE / TARDE
const SERVICE = () => [
  o("#001", "20:50", { zona: "Q3" }),                                          // TARDE standalone Q3
  o("#002", "21:05", { zona: "Q1", manual_giro_id: "mg_260921_1" }),                    // URGENTE, G1
  o("#003", "21:30", { zona: "Q4", manual_giro_id: "mg_260921_1" }),                    // G1 normal
  o("#004", "21:08", { zona: null }),                                          // URGENTE sin zona
  o("#005", "21:40", { zona: "Q1" }),
  o("#006", "20:55", { zona: "Q4", manual_giro_id: "mg_260921_2" }),                    // TARDE, G2
  o("#007", "21:50", { zona: "Q3", manual_giro_id: "mg_260921_2" }),
  o("#008", "21:45", { zona: null, manual_giro_id: "mg_260921_2" }),
  o("#009", "22:10", { zona: "Q4" }),
  o("#010", "22:20", { zona: "Q3" }),
];
const ZONE_COLOR = { Q1: "#0097A7", Q3: "#E65100", Q4: "#C2185B", SIN_ZONA: "#6B7280" };
const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };

describe.each([["Cocina", TabCocina]])("%s — contratto visivo (10 card)", (name, Comp) => {
  test("zona sempre visibile (badge + banda) anche in URGENTE / TARDE; stati corretti", async () => {
    api.priorityContract.mockResolvedValue(V2);
    const el = await mount(<Comp ordenes={SERVICE()} onListo={() => {}} onClose={() => {}} />);
    const cards = [...el.querySelectorAll('[data-testid="deadline-header"]')];
    expect(cards).toHaveLength(10);
    const byId = {};
    for (const h of cards) {
      const id = (h.textContent.match(/#0\d\d/) || [])[0];
      const zb = h.querySelector('[data-testid="zone-badge"]');
      expect(zb).toBeTruthy();
      expect(zb.textContent).not.toMatch(/^Q\d/);                       // §7: nome operativo, mai il codice tecnico
      byId[id] = { state: h.getAttribute("data-state"), zone: zb.getAttribute("data-zone"), zbg: zb.style.background, card: h.parentElement };
    }
    expect(Object.keys(byId)).toHaveLength(10);
    expect(byId["#001"]).toMatchObject({ state: "late", zone: "Q3" });
    expect(byId["#006"]).toMatchObject({ state: "late", zone: "Q4" });
    expect(byId["#002"]).toMatchObject({ state: "near", zone: "Q1" });
    expect(byId["#004"]).toMatchObject({ state: "near", zone: "SIN_ZONA" });
    expect(byId["#009"]).toMatchObject({ state: "normal", zone: "Q4" });
    for (const [id, v] of Object.entries(byId)) {
      expect([hexToRgb(ZONE_COLOR[v.zone]), ZONE_COLOR[v.zone].toLowerCase()]).toContain(v.zbg.toLowerCase());                           // badge = colore zona, indipendente dallo stato
      const band = v.card.style.borderLeft.toLowerCase();
      expect(band.includes(ZONE_COLOR[v.zone].toLowerCase()) || band.includes(hexToRgb(ZONE_COLOR[v.zone]))).toBe(true);   // banda = colore zona
      if (v.state === "late") expect(cards.find((h) => h.textContent.includes(id)).textContent).toMatch(/TARDE/);
    }
  });
  test("due giri = due blocchi distinguibili (G1/G2, colori diversi), membri contigui, un solo ± per giro", async () => {
    api.priorityContract.mockResolvedValue(V2);
    const el = await mount(<Comp ordenes={SERVICE()} onListo={() => {}} onClose={() => {}} />);
    const groups = [...el.querySelectorAll('[data-testid="giro-group"]')];
    expect(groups.map((g) => g.getAttribute("data-giro"))).toEqual(expect.arrayContaining(["G1", "G2"]));
    expect(groups).toHaveLength(2);
    expect(groups[0].style.border).not.toBe(groups[1].style.border);
    expect(giroColor({ seq: 1 })).not.toBe(giroColor({ seq: 2 }));
    const inG = (g) => (g.textContent.match(/#0\d\d/g) || []);
    expect(inG(groups.find((g) => g.getAttribute("data-giro") === "G1")).sort()).toEqual(["#002", "#003"]);
    expect(inG(groups.find((g) => g.getAttribute("data-giro") === "G2")).sort()).toEqual(["#006", "#007", "#008"]);
    for (const g of groups) expect(g.querySelectorAll('button[aria-label="Retrasar en la cola"]')).toHaveLength(1);
    // standalone DOMICILIO: #001 #004 #005 #009 #010 → 5 controlli + 2 giri
    expect(el.querySelectorAll('button[aria-label="Retrasar en la cola"]')).toHaveLength(7);
    expect(el.textContent).not.toMatch(/giro manual|🛵|Repartidor|salida|al horno/i);
  });
});

describe("Entregas — header giro semplice, zona per membro", () => {
  test("'Giro G1 · Hora límite HH:MM · N pedidos · Deshacer giro'; zona su ogni card del giro; nessuna chip zone nell'header", async () => {
    api.getManualGiros.mockResolvedValue([{ id: "mg_260921_1", seq: 1, dissolved_at: null, order_ids: ["#002", "#003"] }]);
    const ord = [o("#002", "21:05", { zona: "Q1", manual_giro_id: "mg_260921_1", estado: "EN_COCINA", direccion: "C1" }),
      o("#003", "21:30", { zona: null, manual_giro_id: "mg_260921_1", estado: "EN_COCINA", direccion: "C2" })];
    const el = await mount(<TabEntregas ordenes={ord} notify={() => {}} setOrdenes={() => {}} />);
    const txt = el.textContent;
    expect(txt).toMatch(/Giro G1\s*Hora límite 21:05/);
    expect(txt).toMatch(/2 pedidos/);
    expect([...el.querySelectorAll("button")].some((b) => b.textContent.trim() === "Deshacer giro")).toBe(true);
    expect([...el.querySelectorAll('[data-testid="entregas-zone"]')].map((n) => n.textContent)).toEqual(["Q1", "SIN ZONA"]);
    expect(txt).not.toMatch(/🛵|Repartidor|giro manual ·/);
  });
});

// ─── [FDV1 R3] Pizzeria: blocchi, orario unico, countdown, pickup, zone name, packing ────────────────────
const pick = (id, hora, extra = {}) => ({ id, nombre: "Cliente", tipo_consegna: "RITIRO", estado: "EN_COCINA",
  hora, forno_out: hora, delivery_deadline_at: null, zona: null, manual_giro_id: null, ui_offset_min: 0, items: pizza, ts: 1, ...extra });

const blocks = (el) => [...el.querySelectorAll('[data-testid="kitchen-block"]')];
const idsIn = (n) => (n.textContent.match(/#0\d\d/g) || []);

describe("Pizzeria — blocco = unità visiva", () => {
  test("§7 nessun codice Q: il blocco e le card mostrano il nome operativo della zona", async () => {
    api.priorityContract.mockResolvedValue(V2);
    const el = await mount(<PanelCocina ordenes={SERVICE()} onListo={() => {}} onClose={() => {}} />);
    const heads = [...el.querySelectorAll('[data-testid="block-header"]')];
    expect(heads.length).toBeGreaterThan(0);
    for (const h of heads) expect(h.textContent).not.toMatch(/\bQ[1-5]\b/);
    expect(el.textContent).not.toMatch(/\bQ[1-5]\b/);
    expect(el.textContent).toMatch(/CENTRO|CORTIJOS|IES|SIN ZONA|VARIAS ZONAS/);
  });

  test("§9 giro monozona → tutto il blocco prende il colore della zona; zone diverse → VARIAS ZONAS, nessuna zona inventata", async () => {
    api.priorityContract.mockResolvedValue(V2);
    const mono = [o("#101", "21:30", { zona: "Q1", manual_giro_id: "mg_260921_7" }), o("#102", "21:35", { zona: "Q1", manual_giro_id: "mg_260921_7" })];
    const el1 = await mount(<PanelCocina ordenes={mono} onListo={() => {}} onClose={() => {}} />);
    const b1 = blocks(el1)[0];
    expect(b1.getAttribute("data-identity")).toBe("Q1");
    expect(b1.style.border.toLowerCase()).toContain("#0097a7");
    expect(b1.querySelector('[data-testid="block-header"]').textContent).toMatch(/CENTRO/);
    expect(b1.querySelectorAll('[data-testid="card-zone"]')).toHaveLength(0);   // zona unica: nessuna ripetizione per card
    await act(async () => root.unmount()); root = null; container.remove(); container = null;

    const mixed = [o("#201", "21:30", { zona: "Q1", manual_giro_id: "mg_260921_8" }), o("#202", "21:35", { zona: "Q4", manual_giro_id: "mg_260921_8" })];
    const el2 = await mount(<PanelCocina ordenes={mixed} onListo={() => {}} onClose={() => {}} />);
    const b2 = blocks(el2)[0];
    expect(b2.getAttribute("data-identity")).toBe("MIXTA");
    expect(b2.textContent).toMatch(/VARIAS ZONAS/);
    expect([...b2.querySelectorAll('[data-testid="card-zone"]')].map((n) => n.getAttribute("data-zone"))).toEqual(["Q1", "Q4"]);
  });

  test("§10 un solo orario grande per blocco = membro PIÙ urgente; le deadline individuali restano nei dati", async () => {
    api.priorityContract.mockResolvedValue(V2);
    const ord = [o("#301", "20:55", { zona: "Q1", manual_giro_id: "mg_260921_9" }),
      o("#302", "21:45", { zona: "Q1", manual_giro_id: "mg_260921_9" }),
      o("#303", "21:50", { zona: "Q1", manual_giro_id: "mg_260921_9" })];
    const el = await mount(<PanelCocina ordenes={ord} onListo={() => {}} onClose={() => {}} />);
    const b = blocks(el)[0];
    const mains = [...b.querySelectorAll('[data-testid="block-main-time"]')];
    expect(mains).toHaveLength(1);
    expect(mains[0].textContent).toBe("20:55");                                  // membro più urgente
    expect(b.textContent).not.toMatch(/21:45[\s\S]*21:50[\s\S]*20:55/);
    // i límite individuali restano disponibili, in piccolo, solo dove differiscono
    expect([...b.querySelectorAll('[data-testid="card-own-limit"]')].map((n) => n.textContent))
      .toEqual(["límite 21:45", "límite 21:50"]);
    expect(ord.map((x) => x.delivery_deadline_at)).toEqual([iso("20:55"), iso("21:45"), iso("21:50")]);   // dati immutati
  });

  test("§11 countdown accanto all'orario principale, dal clock; TARDE → minuti di ritardo", async () => {
    api.priorityContract.mockResolvedValue(V2);
    const el = await mount(<PanelCocina ordenes={[o("#401", "21:08", { zona: "Q1" }), o("#402", "20:52", { zona: "Q4" })]} onListo={() => {}} onClose={() => {}} />);
    const cds = [...el.querySelectorAll('[data-testid="block-countdown"]')].map((n) => n.textContent);
    expect(cds).toEqual(expect.arrayContaining([expect.stringMatching(/faltan 8 min/), expect.stringMatching(/8 min tarde/)]));
    const states = [...el.querySelectorAll('[data-testid="block-header"]')].map((n) => n.getAttribute("data-state"));
    expect(states.sort()).toEqual(["late", "near"]);
  });

  test("§12 RITIRO = 'Recogida en local', contrasto dedicato, NESSUN countdown de entrega", async () => {
    api.priorityContract.mockResolvedValue(V2);
    const el = await mount(<PanelCocina ordenes={[pick("#501", "21:20"), o("#502", "21:30", { zona: "Q1" })]} onListo={() => {}} onClose={() => {}} />);
    const pb = blocks(el).find((b) => b.getAttribute("data-identity") === "RECOGIDA");
    expect(pb).toBeTruthy();
    expect(pb.textContent).toMatch(/Recogida en local/);
    expect(pb.querySelector('[data-testid="block-main-time"]').textContent).toBe("21:20");   // hora de recogida mantenida
    expect(pb.querySelector('[data-testid="block-countdown"]')).toBeNull();
    expect(pb.querySelector('[data-testid="pickup-tag"]')).toBeTruthy();
    expect(pb.querySelectorAll('button[aria-label="Retrasar en la cola"]')).toHaveLength(0);
    const db = blocks(el).find((b) => b.getAttribute("data-identity") === "Q1");
    expect(db.querySelector('[data-testid="block-countdown"]')).toBeTruthy();
    expect(pb.style.border).not.toBe(db.style.border);
  });

  test("§15 un solo controllo ± per blocco (giro o standalone); nessun '−5/+5' scritto", async () => {
    api.priorityContract.mockResolvedValue(V2);
    const el = await mount(<PanelCocina ordenes={SERVICE()} onListo={() => {}} onClose={() => {}} />);
    for (const b of blocks(el)) expect(b.querySelectorAll('button[aria-label="Retrasar en la cola"]').length).toBeLessThanOrEqual(1);
    expect(el.querySelectorAll('button[aria-label="Retrasar en la cola"]')).toHaveLength(7);   // 5 standalone + 2 giri
    expect(el.textContent).not.toMatch(/[−+-]5\b/);
    expect(el.textContent).not.toMatch(/giro manual|GIRO MANUAL|🛵|Repartidor|al horno/i);
  });

  test("§13 il giro non si spezza mai: span = n membri, membri tutti nello stesso blocco", async () => {
    api.priorityContract.mockResolvedValue(V2);
    const el = await mount(<PanelCocina ordenes={SERVICE()} onListo={() => {}} onClose={() => {}} />);
    const bs = blocks(el);
    const g1 = bs.find((b) => b.getAttribute("data-giro") === "mg_260921_1");
    const g2 = bs.find((b) => b.getAttribute("data-giro") === "mg_260921_2");
    expect(idsIn(g1).sort()).toEqual(["#002", "#003"]);
    expect(g1.getAttribute("data-span")).toBe("2");
    expect(idsIn(g2).sort()).toEqual(["#006", "#007", "#008"]);
    expect(g2.getAttribute("data-span")).toBe("3");
    expect(bs).toHaveLength(7);
    expect(bs.flatMap(idsIn)).toHaveLength(10);                                   // nessuna card duplicata / persa
  });
});
