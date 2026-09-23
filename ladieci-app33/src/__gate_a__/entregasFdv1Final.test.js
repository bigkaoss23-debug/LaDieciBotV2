/**
 * [FDV1 FE final] Entregas + warning:
 *   A1 — header dei blocchi (standalone e giro) = límite (delivery_deadline_at), non la hora cliente; ordine per límite.
 *   A2 — nessun warning locale sulle hora ("Horarios >25 / >15 min").
 *   A3 — nessuna rappresentazione rider (Repartidor tarde / salida / entrega est. / Repartidor en camino / rientro).
 *   A4 — le warning di deadline nominano solo gli ordini realmente a rischio (output reali di giroWarnings del BE).
 * + static search guard sul percorso FDV1 (stringhe, caller, colonne rider).
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("../api", () => ({
  api: {
    getManualGiros: jest.fn().mockResolvedValue([]),
    giroWarnings: jest.fn(),
    getOrdenes: jest.fn(),
    createManualGiro: jest.fn().mockResolvedValue({ ok: true, giro: { id: "mg_1", seq: 1 } }),
    addOrderToManualGiro: jest.fn().mockResolvedValue({ ok: true }),
    removeOrderFromManualGiro: jest.fn().mockResolvedValue({ ok: true }),
    dissolveManualGiro: jest.fn().mockResolvedValue({ ok: true }),
  },
  auth: { getToken: () => "t", isAuthenticated: () => true },
}));

import TabEntregas from "../components/entregas/TabEntregas";
import { filterFdv1Warnings } from "../components/entregas/fdv1Warnings";
import { api } from "../api";

const fs = require("fs");
const path = require("path");

let container = null, root = null;
const mount = (el) => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); act(() => { root.render(el); }); return container; };
afterEach(() => { if (root) { act(() => root.unmount()); root = null; } if (container) { container.remove(); container = null; } jest.clearAllMocks(); });
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const click = async (el) => act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });
const btn = (el, text) => [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === text);

const iso = (hhmm) => `2026-09-21T${String(Number(hhmm.slice(0, 2)) - 2).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;
const RIDER_LEGACY = { salida_driver_estimada: "20:05", entrega_estimada: "20:15", retraso_estimado_min: 9, conflicto_driver: true, forno_out: "20:00" };
const mk = (id, deadline, extra = {}) => ({ id, nombre: id, tipo_consegna: "DOMICILIO", estado: "EN_COCINA", direccion: "Calle " + id, zona: "Q1",
  hora: deadline, delivery_deadline_at: iso(deadline), manual_giro_id: null, items: [], ...RIDER_LEGACY, ...extra });
const W = 15;

describe("A4 — filterFdv1Warnings su output reali di giroWarnings", () => {
  test("0 a rischio → 0 warning", () => {
    expect(filterFdv1Warnings([], [mk("A", "21:00"), mk("B", "21:05")])).toEqual([]);
  });
  test("solo A a rischio (outlier) → A", () => {
    const m = [mk("A", "20:30"), mk("B", "21:00"), mk("C", "21:05")];
    const out = filterFdv1Warnings([{ code: "deadline_much_closer", member_ids: ["A"], data: { delta_min: 30 } }], m);
    expect(out.map((w) => w.member_ids)).toEqual([["A"]]);
  });
  test("A + B a rischio (spread, BE nomina primo+ultimo) → A, B; ultimo non nominato", () => {
    const m = [mk("A", "20:40"), mk("B", "20:45"), mk("C", "21:20")];
    const out = filterFdv1Warnings([{ code: "spread_over_window", member_ids: ["A", "C"], data: { spread_min: 40, window_min: W } }], m);
    expect(out).toHaveLength(1);
    expect(out[0].member_ids).toEqual(["A", "B"]);
  });
  test("anchor sicuro (add a un giro esistente) → non nominato; ultimo sicuro → non nominato", () => {
    // giro esistente: X (anchor, 21:00) + Y (21:05); si aggiungono Z 20:30 e W 20:35 → BE: spread [Z, Y]
    const m = [mk("X", "21:00"), mk("Y", "21:05"), mk("Z", "20:30"), mk("W", "20:35")];
    const out = filterFdv1Warnings([{ code: "spread_over_window", member_ids: ["Z", "Y"], data: { spread_min: 35, window_min: W } }], m);
    expect(out[0].member_ids).toEqual(["Z", "W"]);
    expect(out[0].member_ids).not.toContain("X");
    expect(out[0].member_ids).not.toContain("Y");
  });
  test("deadline_passed resta; warning di composizione invariate; nessun campo orario modificato", () => {
    const m = [mk("A", "20:30"), mk("B", "20:35")];
    const snap = JSON.stringify(m);
    const out = filterFdv1Warnings([{ code: "deadline_passed", member_ids: ["A", "B"] }, { code: "zones_differ", data: { zones: ["Q1", "Q2"] } },
      { code: "capacity_exceeded", data: { used: 5, max: 4 } }], m);
    expect(out.map((w) => w.code)).toEqual(["deadline_passed", "zones_differ", "capacity_exceeded"]);
    expect(out[0].member_ids).toEqual(["A", "B"]);
    expect(JSON.stringify(m)).toBe(snap);
  });
});

describe("Entregas — render", () => {
  test("A1: header standalone e giro = límite; ordine per límite, non per hora", async () => {
    api.getManualGiros.mockResolvedValue([{ id: "mg_1", seq: 1, dissolved_at: null, order_ids: ["G-1", "G-2"] }]);
    const ordenes = [
      mk("S-1", "21:40", { hora: "20:10" }),                                  // hora precoce, límite tardo
      mk("S-2", "21:00", { hora: "21:30" }),
      mk("G-1", "21:20", { manual_giro_id: "mg_1", hora: "20:50" }),
      mk("G-2", "21:25", { manual_giro_id: "mg_1" }),
    ];
    const el = mount(<TabEntregas ordenes={ordenes} notify={() => {}} setOrdenes={() => {}} />);
    await flush();
    const txt = el.textContent;
    const heads = [...el.querySelectorAll('span[title="Hora límite de entrega"], span[title="Hora límite más urgente del giro"]')].map((n) => n.textContent.replace("Hora límite ", ""));
    expect(heads).toEqual(["21:00", "21:20", "21:40"]);                       // S-2, giro (earliest 21:20), S-1
    expect(txt).not.toMatch(/⏱/);
    expect(txt).toMatch(/cliente 20:10/);                                      // hora solo come dato secondario
  });
  test("A2/A3: nessun 'Horarios >', nessuna UI rider, anche con colonne legacy popolate", async () => {
    api.getManualGiros.mockResolvedValue([{ id: "mg_1", seq: 1, dissolved_at: null, order_ids: ["A", "B"] }]);
    const ordenes = [mk("A", "21:00", { manual_giro_id: "mg_1", hora: "20:00" }), mk("B", "21:01", { manual_giro_id: "mg_1", hora: "21:59" }),
      mk("C", "21:30", { estado: "EN_ENTREGA" }), mk("D", "21:35", { estado: "LISTO" })];
    const el = mount(<TabEntregas ordenes={ordenes} notify={() => {}} setOrdenes={() => {}} />);
    await flush();
    const txt = el.textContent;
    expect(txt).not.toMatch(/Horarios\s*>/);
    expect(txt).not.toMatch(/Repartidor tarde|Repartidor en camino|entrega est|salida|Driver volvió|Driver de vuelta|Rider volviendo|rientro/i);
    expect(txt).not.toMatch(/20:05|20:15|\+9 min/);                            // valori delle colonne rider mai renderizzati
  });
  test("A4 in UI: la revisione nomina solo i membri a rischio; override crea comunque il giro", async () => {
    api.giroWarnings.mockResolvedValue({ ok: true, warnings: [{ code: "spread_over_window", member_ids: ["A", "C"], data: { spread_min: 40, window_min: W } }] });
    const ordenes = [mk("A", "20:40"), mk("B", "20:45"), mk("C", "21:20")];
    const el = mount(<TabEntregas ordenes={ordenes} notify={() => {}} setOrdenes={() => {}} />);
    await flush();
    const sel = [...el.querySelectorAll("button[aria-pressed]")].filter((b) => /Elegir para un giro nuevo|Quitar de la selección/i.test(b.getAttribute("title") || ""));
    for (const b of sel) await click(b);
    await click([...el.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Crear giro con"))); await flush();
    expect(el.textContent).toContain("En riesgo: A, B (horas límite separadas 40 min)");
    expect(el.textContent).not.toMatch(/En riesgo: A, B, C|En riesgo: A, C/);
    await click(btn(el, "Confirmar igualmente"));
    expect(api.createManualGiro).toHaveBeenCalledWith(["A", "B", "C"]);
  });
});

describe("Static search — percorso FDV1", () => {
  const SRC = path.join(__dirname, "..");
  const code = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8").split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");
  const FDV1 = ["components/entregas/TabEntregas.jsx", "components/entregas/fdv1Warnings.js", "components/cocina/TabCocina.jsx",
    "components/cocina/PanelCocina.jsx", "components/cocina/manualGiroCocina.js", "components/ordenes/TabListos.jsx"];
  test("stringhe rider / hora-warning assenti (ACTIVE = 0)", () => {
    for (const rel of FDV1) expect(code(rel)).not.toMatch(/Repartidor tarde|Repartidor en camino|Driver volvió|Driver de vuelta|Horarios >|entrega est|al horno"/);
  });
  test("colonne rider mai lette nel percorso FDV1", () => {
    for (const rel of FDV1) expect(code(rel)).not.toMatch(/salida_driver_estimada|entrega_estimada|retraso_estimado_min|conflicto_driver/);
  });
  test("nessun caller di getDriverStatus / registrarSalidaDriver / chiudiGiro nel FE", () => {
    for (const rel of [...FDV1, "components/NuevoPedidoModal.jsx", "components/ServicioPage.jsx", "components/repartidor/RepartidorPage.jsx"]) {
      expect(code(rel)).not.toMatch(/getDriverStatus\s*\(|registrarSalidaDriver|['"]chiudiGiro['"]/);
    }
  });
  // [DELIVERY-REFACTOR 2026-09-22] Il guard FDV1_NO_RIDER_SIM non serve più:
  // il corpo che disattivava è stato rimosso del tutto, quindi la disponibilità
  // basata sulla simulazione rider non è "spenta" ma inesistente.
  test("Nuevo Pedido: la disponibilità basata sulla simulazione rider non esiste più", () => {
    const src = code("components/NuevoPedidoModal.jsx");
    // [ENTREGA-MODAL 2026-09-23] Lo stub `buildDisponibilidad = () => []` è stato rimosso insieme
    // al vecchio popup: nessuna definizione e nessun caller devono tornare.
    expect(src).not.toMatch(/buildDisponibilidad|findRecommendedCompatibleGiro/);
    for (const campo of ["salida_driver_estimada", "entrega_estimada", "conflicto_driver"]) {
      const righeCodice = src.split("\n").filter((l) => !l.trim().startsWith("//"));
      expect(righeCodice.some((l) => l.includes(campo))).toBe(false);
    }
  });
});

describe("Entregas — blocchi con stesso límite e stessa zona", () => {
  test("nessuna card duplicata dopo re-sort / realtime (chiave per ordine, non per zona|minuto)", async () => {
    api.getManualGiros.mockResolvedValue([]);
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const base = [mk("P-1", "14:52"), mk("P-2", "14:52"), mk("P-3", "14:52"), mk("P-4", "14:53")];
    const el = mount(<TabEntregas ordenes={base} notify={() => {}} setOrdenes={() => {}} />);
    await flush();
    const count = () => { const c = {}; for (const m of el.textContent.matchAll(/(P-\d)(?=Calle|\s|#|🛵)/g)) c[m[1]] = (c[m[1]] || 0) + 1; return c; };
    const cards = () => [...el.querySelectorAll('button[aria-pressed]')].length;
    expect(cards()).toBe(4);
    await act(async () => { root.render(<TabEntregas ordenes={[base[2], base[0], { ...base[1], hora: "14:30" }, base[3]]} notify={() => {}} setOrdenes={() => {}} />); await Promise.resolve(); });
    await flush();
    expect(cards()).toBe(4);
    await act(async () => { root.render(<TabEntregas ordenes={[base[3], base[1], base[2]]} notify={() => {}} setOrdenes={() => {}} />); await Promise.resolve(); });
    await flush();
    expect(cards()).toBe(3);
    const dupKey = errSpy.mock.calls.filter((c) => String(c[0]).includes("same key"));
    errSpy.mockRestore();
    expect(dupKey).toEqual([]);
    void count;
  });
});

describe("R3 — modal solo in Entregas, esiti certi/incerti", () => {
  const pick = (el) => [...el.querySelectorAll("button[aria-pressed]")].filter((b) => /Elegir para un giro nuevo|Quitar de la selección/i.test(b.getAttribute("title") || ""));
  const openCreate = async (el) => { for (const b of pick(el).slice(0, 2)) await click(b); await click([...el.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Crear giro con"))); await flush(); };
  test("Pizzeria aperta (suspended) → revisione smontata; risposta tardiva scartata", async () => {
    api.getManualGiros.mockResolvedValue([]);
    let resolveLate; api.giroWarnings.mockImplementation(() => new Promise((r) => { resolveLate = r; }));
    const ordenes = [mk("A", "21:00"), mk("B", "21:05")];
    const el = mount(<TabEntregas ordenes={ordenes} notify={() => {}} setOrdenes={() => {}} />);
    await flush();
    for (const b of pick(el)) await click(b);
    await click([...el.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Crear giro con")));
    await act(async () => { root.render(<TabEntregas ordenes={ordenes} notify={() => {}} setOrdenes={() => {}} suspended />); });
    await act(async () => { resolveLate({ ok: true, warnings: [] }); await Promise.resolve(); await Promise.resolve(); });
    await flush();
    expect(el.textContent).not.toMatch(/Crear giro · 2 pedidos/);
    await act(async () => { root.render(<TabEntregas ordenes={ordenes} notify={() => {}} setOrdenes={() => {}} />); });
    await flush();
    expect(el.textContent).not.toMatch(/Crear giro · 2 pedidos/);         // nessun modal "fantasma" al ritorno
  });
  test("503 sul create → 'Sin confirmar', verifica: giro presente → successo (nessun errore falso)", async () => {
    api.getManualGiros.mockResolvedValue([]);
    api.giroWarnings.mockResolvedValue({ ok: true, warnings: [] });
    api.createManualGiro.mockResolvedValueOnce({ error: "upstream", _status: 503, _ok: false });
    api.getOrdenes.mockResolvedValueOnce({ ordenes: [mk("A", "21:00", { manual_giro_id: "mg_9" }), mk("B", "21:05", { manual_giro_id: "mg_9" })] });
    const notify = jest.fn();
    const el = mount(<TabEntregas ordenes={[mk("A", "21:00"), mk("B", "21:05")]} notify={notify} setOrdenes={() => {}} />);
    await flush(); await openCreate(el);
    await click(btn(el, "Crear giro")); await flush();
    const msgs = notify.mock.calls.map((c) => c[0]);
    expect(msgs[0]).toBe("Sin confirmar — comprobando…");
    expect(msgs[1]).toMatch(/^Giro .* creado$/);
    expect(msgs.join("|")).not.toMatch(/Error|No se/);
  });
  test("timeout/rete sul create e verifica negativa → 'No se guardó — reintenta', modal resta aperto", async () => {
    api.getManualGiros.mockResolvedValue([]);
    api.giroWarnings.mockResolvedValue({ ok: true, warnings: [] });
    api.createManualGiro.mockResolvedValueOnce({ error: "TypeError: Failed to fetch", _status: 0, _ok: false });
    api.getOrdenes.mockResolvedValueOnce({ ordenes: [mk("A", "21:00"), mk("B", "21:05")] });
    const notify = jest.fn();
    const el = mount(<TabEntregas ordenes={[mk("A", "21:00"), mk("B", "21:05")]} notify={notify} setOrdenes={() => {}} />);
    await flush(); await openCreate(el);
    await click(btn(el, "Crear giro")); await flush();
    expect(notify.mock.calls.map((c) => c[0])).toEqual(["Sin confirmar — comprobando…", "No se guardó — reintenta"]);
    expect(btn(el, "Crear giro")).toBeTruthy();
  });
  test("card nel giro: nessun badge 'giro manual', azione 'Separar'; header 'Deshacer giro'", async () => {
    api.getManualGiros.mockResolvedValue([{ id: "mg_1", seq: 1, dissolved_at: null, order_ids: ["A", "B"] }]);
    const el = mount(<TabEntregas ordenes={[mk("A", "21:00", { manual_giro_id: "mg_1" }), mk("B", "21:05", { manual_giro_id: "mg_1" })]} notify={() => {}} setOrdenes={() => {}} />);
    await flush();
    expect(el.textContent).not.toMatch(/giro manual ·|disolver|🛵|🔥/i);
    expect([...el.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Separar")).toHaveLength(2);
    expect(btn(el, "Deshacer giro")).toBeTruthy();
  });
});
