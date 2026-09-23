/**
 * [ENTREGA-MODAL 2026-09-23] Popup "Entrega a domicilio": DIRECTO · PROGRAMADO · GIRO.
 *
 * Render reale di NuevoPedidoModal (react-dom + act, come entregasFdv1Final) con api mockata.
 * Il backend è la sola fonte di: proposta DIRECTO (hora_preview della preview SENZA hora) e giri
 * compatibili (giro_candidates, oppure il solo giro_suggestion col BE live). Il popup non calcola
 * deadline né compatibilità: sceglie e passa `hora` (+ `giro_intent` solo per GIRO) a onConfirm.
 *
 * Orologio fisso: 2026-09-21T17:50:00Z = 19:50 Europe/Madrid.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../api", () => ({
  api: {
    previewDeliveryV1: jest.fn(),
    resolveAddress: jest.fn(),
    getClientes: jest.fn().mockResolvedValue([]),
    getClientePorTel: jest.fn().mockResolvedValue(null),
    upsertCliente: jest.fn().mockResolvedValue(null),
    previewOrderTiming: jest.fn().mockResolvedValue(null),
  },
  auth: { getToken: () => "t", isAuthenticated: () => true },
}));
// Il picker vero apre il menu completo: qui basta un bottone che aggiunge una pizza.
jest.mock("../components/ItemPickerModal", () => (props) =>
  props.visible ? <button data-testid="stub-add" onClick={() => props.onAdd({ id: "p1", n: "Margherita", p: 9, q: 1 })}>add</button> : null);

import NuevoPedidoModal from "../components/NuevoPedidoModal";
import { api } from "../api";

const fs = require("fs");
const path = require("path");
const modalSrc = fs.readFileSync(path.join(__dirname, "..", "components/NuevoPedidoModal.jsx"), "utf8");

const T0 = Date.parse("2026-09-21T17:50:00.000Z"); // 19:50 Madrid
const iso = (hhmm) => `2026-09-21T${String(Number(hhmm.slice(0, 2)) - 2).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;

// Ordini attivi (prop `ordenes`): servono SOLO per l'etichetta oraria dei candidati.
const ORDENES = [
  { id: "#002", tipo_consegna: "DOMICILIO", estado: "EN_COCINA", zona: "Q1", delivery_deadline_at: iso("20:56"), manual_giro_id: null },
  { id: "#004", tipo_consegna: "DOMICILIO", estado: "EN_COCINA", zona: "Q1", delivery_deadline_at: iso("20:40"), manual_giro_id: "mg_260921_3" },
  { id: "#005", tipo_consegna: "DOMICILIO", estado: "LISTO", zona: "Q1", delivery_deadline_at: iso("20:50"), manual_giro_id: "mg_260921_3" },
  { id: "#007", tipo_consegna: "DOMICILIO", estado: "POR_CONFIRMAR", zona: "Q1", delivery_deadline_at: iso("21:00"), manual_giro_id: null },
];
const C_GIRO = { kind: "GIRO", giro_id: "mg_260921_3", member_ids: ["#004", "#005"], delta_min: 5, used: 2, max: 3, zona: "Q1", window_min: 15, label: "G3" };
const C_002 = { kind: "ORDINE", order_id: "#002", member_ids: ["#002"], delta_min: 11, used: 1, max: 3, zona: "Q1", window_min: 15 };
const C_007 = { kind: "ORDINE", order_id: "#007", member_ids: ["#007"], delta_min: 15, used: 1, max: 3, zona: "Q1", window_min: 15 };

let scenario = { candidates: [], exposeList: true };
const asapHoraAt = () => {
  // Il mock rappresenta il backend: hora_preview = now + 55 (Madrid). Il FE non fa questo calcolo.
  const d = new Date(Date.now() + 55 * 60000);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
};
const previewImpl = async (body) => {
  if (body.hora) return { ok: true, deadline_min: 55, hora_preview: body.hora, giro_suggestion: null };
  const c = body.zona === "Q1" ? scenario.candidates : [];
  const sugg = c.length ? { ...c[0], alternatives: c.length - 1 } : null;
  return { ok: true, deadline_min: 55, hora_preview: asapHoraAt(), giro_suggestion: sugg, ...(scenario.exposeList ? { giro_candidates: c } : {}) };
};

let container = null, root = null, onConfirm = null;
const flush = async (ms = 0) => act(async () => {
  if (ms) jest.advanceTimersByTime(ms);
  for (let i = 0; i < 6; i++) await Promise.resolve();
});
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await flush(); };
const q = (id) => container.querySelector(`[data-testid="${id}"]`);
const setValue = async (el, value) => {
  const proto = el.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
  await flush();
};

async function openPopup({ candidates = [], exposeList = true } = {}) {
  scenario = { candidates, exposeList };
  onConfirm = jest.fn();
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<NuevoPedidoModal visible onClose={() => {}} onConfirm={onConfirm} ordenes={ORDENES}
      prefill={{ nombre: "Ana", direccion: "Plaza de Toros 1" }} />);
  });
  await flush(1000);                 // debounce geocode → zona Q1
  await flush(500);                  // preview con hora (prefill iniziale)
  const trigger = [...container.querySelectorAll("button")].find(b => b.textContent.includes("Plaza de Toros 1"));
  await click(trigger);
  await flush();
  return container;
}
async function submit() {
  const addBtn = [...container.querySelectorAll("button")].find(b => b.textContent.includes("Añadir") && !b.textContent.includes("dirección"));
  await click(addBtn);                                                               // apre il picker (stub)
  await click(q("stub-add"));                                                        // aggiunge una pizza
  const confirmBtn = [...container.querySelectorAll("button")].find(b => b.textContent.includes("Confirmar pedido"));
  expect(confirmBtn.disabled).toBe(false);
  await click(confirmBtn);
  await flush();
  expect(onConfirm).toHaveBeenCalledTimes(1);
  return onConfirm.mock.calls[0][0];
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(T0);
  api.previewDeliveryV1.mockImplementation(previewImpl);
  api.resolveAddress.mockResolvedValue({ zona: "Q1", source: "google", lat: 36.7, lon: -2.6, durataAndataMin: 6 });
  jest.spyOn(window, "confirm").mockReturnValue(true);
  jest.spyOn(window, "alert").mockImplementation(() => {});
});
afterEach(() => {
  if (root) { act(() => root.unmount()); root = null; }
  if (container) { container.remove(); container = null; }
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe("struttura e copy", () => {
  test("tre blocchi esatti + AHORA, niente testo tecnico del vecchio popup", async () => {
    await openPopup();
    const modal = q("entrega-modal");
    expect(modal).not.toBeNull();
    ["entrega-directo", "entrega-programado", "entrega-giro", "entrega-ahora"].forEach(id => expect(q(id)).not.toBeNull());
    const text = modal.textContent;
    expect(text).toContain("Entrega a domicilio");
    for (const s of ["DIRECTO", "PROGRAMADO", "GIRO", "Ahora", "Dirección", "Zona", "Elegir", "Unir"]) expect(text).toContain(s);
    for (const s of ["Hora límite", "Creación + 55", "se fija al guardar", "Pedido compatible", "Δ", "Crear giro con",
      "Dejar separado", "Hora prometida", "cliente ", "+55", "ningún giro", "no compatible", "Confirmar entrega"]) {
      expect(text).not.toContain(s);
    }
  });
});

describe("1 — AHORA", () => {
  test("mostra l'ora reale, si aggiorna col timer, non è cliccabile e non contiene controlli", async () => {
    await openPopup();
    const ahora = q("entrega-ahora");
    expect(ahora.textContent).toContain("19:50");
    expect(ahora.style.pointerEvents).toBe("none");
    expect(ahora.querySelectorAll("button, input, select, a").length).toBe(0);
    await flush(61 * 1000);
    expect(q("entrega-ahora").textContent).toContain("19:51");
    // Un click su AHORA non cambia nulla (nessun handler, nessuna scelta).
    const before = container.innerHTML;
    await click(q("entrega-ahora"));
    expect(container.innerHTML).toBe(before);
  });
});

describe("2/3 — DIRECTO", () => {
  test("propone la hora ASAP del backend (preview SENZA hora) e segue l'orologio", async () => {
    await openPopup();
    expect(api.previewDeliveryV1).toHaveBeenCalledWith({ zona: "Q1" });           // chiamata ASAP: nessuna chiave hora
    expect(q("entrega-directo-hora").textContent).toBe("20:45");
    await flush(60 * 1000);
    expect(q("entrega-directo-hora").textContent).toBe("20:46");
  });

  test("Elegir persiste esattamente la hora proposta, senza giro_intent", async () => {
    await openPopup({ candidates: [C_002] });
    await click(q("entrega-directo-elegir"));
    expect(q("entrega-modal")).toBeNull();                                        // il popup si chiude
    const payload = await submit();
    expect(payload.hora).toBe("20:45");
    expect(payload.tipo_consegna).toBe("DOMICILIO");
    expect(payload).not.toHaveProperty("giro_intent");
  });
});

describe("4/5 — PROGRAMADO", () => {
  test("l'ora è modificabile (input + ▲▼) ed Elegir persiste esattamente quella", async () => {
    await openPopup({ candidates: [C_002] });
    const input = q("entrega-programado-hora");
    expect(input.tagName).toBe("INPUT");
    expect(input.type).toBe("time");
    await setValue(input, "21:30");
    expect(q("entrega-programado-hora").value).toBe("21:30");
    await click(container.querySelector("[aria-label='+5']"));
    expect(q("entrega-programado-hora").value).toBe("21:35");
    await click(container.querySelector("[aria-label='-5']"));
    expect(q("entrega-programado-hora").value).toBe("21:30");
    await click(q("entrega-programado-elegir"));
    const payload = await submit();
    expect(payload.hora).toBe("21:30");
    expect(payload).not.toHaveProperty("giro_intent");
  });

  test("è l'unica ora editabile del popup", async () => {
    await openPopup({ candidates: [C_002, C_007] });
    const inputs = [...q("entrega-modal").querySelectorAll("input[type='time']")];
    expect(inputs).toHaveLength(1);
    expect(inputs[0].getAttribute("data-testid")).toBe("entrega-programado-hora");
  });
});

describe("6/7/8/9 — GIRO", () => {
  test("nessun giro compatibile → colonna disabilitata, solo «—», nessun messaggio", async () => {
    await openPopup({ candidates: [] });
    const g = q("entrega-giro");
    expect(g.getAttribute("aria-disabled")).toBe("true");
    expect(q("entrega-giro-vacio").textContent).toBe("—");
    expect(q("entrega-giro-unir").disabled).toBe(true);
    expect(q("entrega-giro-select")).toBeNull();
  });

  test("un solo giro → opzione singola, niente selettore", async () => {
    await openPopup({ candidates: [C_002] });
    expect(q("entrega-giro-select")).toBeNull();
    expect(q("entrega-giro-unico").textContent).toBe("#002 · Q1 · 20:56");
    expect(q("entrega-giro-unir").disabled).toBe(false);
  });

  test("più giri → selettore con TUTTI i compatibili restituiti dal backend, nello stesso ordine", async () => {
    await openPopup({ candidates: [C_GIRO, C_002, C_007] });
    const sel = q("entrega-giro-select");
    expect(sel).not.toBeNull();
    expect([...sel.options].map(o => o.textContent)).toEqual(["G3 · Q1 · 20:40", "#002 · Q1 · 20:56", "#007 · Q1 · 21:00"]);
    expect(sel.value).toBe("g:mg_260921_3");                                     // preselezione = primo del backend
  });

  test("UNIR usa esattamente il giro scelto (ORDINE → with_order_id) con la hora ASAP", async () => {
    await openPopup({ candidates: [C_GIRO, C_002, C_007] });
    await setValue(q("entrega-giro-select"), "o:#007");
    await click(q("entrega-giro-unir"));
    const payload = await submit();
    expect(payload.giro_intent).toEqual({ with_order_id: "#007" });
    expect(payload.hora).toBe("20:45");
  });

  test("UNIR su un giro esistente → giro_id", async () => {
    await openPopup({ candidates: [C_GIRO, C_002] });
    await click(q("entrega-giro-unir"));
    const payload = await submit();
    expect(payload.giro_intent).toEqual({ giro_id: "mg_260921_3" });
  });

  test("BE live senza giro_candidates: fallback sul solo giro_suggestion", async () => {
    await openPopup({ candidates: [C_GIRO, C_002], exposeList: false });
    expect(q("entrega-giro-select")).toBeNull();
    expect(q("entrega-giro-unico").textContent).toBe("G3 · Q1 · 20:40");
  });
});

describe("10 — nessun auto-grouping", () => {
  test("con giri compatibili ma senza UNIR, l'ordine parte senza giro_intent", async () => {
    await openPopup({ candidates: [C_GIRO, C_002, C_007] });
    await click(q("entrega-modal").parentElement);                                 // chiude dal backdrop
    const payload = await submit();
    expect(payload).not.toHaveProperty("giro_intent");
  });

  test("scegliere PROGRAMADO dopo UNIR annulla il giro", async () => {
    await openPopup({ candidates: [C_002] });
    await click(q("entrega-giro-unir"));
    const trigger = [...container.querySelectorAll("button")].find(b => b.textContent.includes("Plaza de Toros 1"));
    await click(trigger);
    await setValue(q("entrega-programado-hora"), "21:30");
    await click(q("entrega-programado-elegir"));
    const payload = await submit();
    expect(payload.hora).toBe("21:30");
    expect(payload).not.toHaveProperty("giro_intent");
  });
});

describe("11 — contratto deadline invariato (nessuna logica BE nel FE)", () => {
  test("il popup non calcola deadline né compatibilità", () => {
    expect(modalSrc).not.toMatch(/madridWallToInstant|legacyDeadlineFromHora|effectiveDeadline|suggestGiro|listGiroCandidates/);
    expect(modalSrc).not.toMatch(/55\s*\*\s*60000/);
    expect(modalSrc).not.toMatch(/delivery_deadline_at\s*:/);                       // il FE non invia mai una deadline
  });
  test("DIRECTO = hora_preview del backend; GIRO = giro_candidates | giro_suggestion del backend", () => {
    expect(modalSrc).toMatch(/const directoHora = entregaAsap\?\.hora_preview \|\| null;/);
    expect(modalSrc).toMatch(/api\.previewDeliveryV1\(\{ zona: zonaRichiesta \}\)/);
    expect(modalSrc).toMatch(/Array\.isArray\(entregaAsap\.giro_candidates\)/);
  });
});
