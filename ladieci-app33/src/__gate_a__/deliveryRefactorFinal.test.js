/**
 * [DELIVERY-REFACTOR 2026-09-22] Gate del nuovo contratto Delivery.
 *
 *   Flusso operativo: POR_CONFIRMAR → EN_COCINA → LISTO → RETIRADO.
 *   EN_ENTREGA non ha più writer nella UI; gli ordini legacy già in EN_ENTREGA
 *   restano finalizzabili.
 *   DOMICILIO: UI "Entregado" (driver e operatore, stessa azione business).
 *   Pagamento: metodo reale se non già pagato; mai un secondo pagamento; mai "manual".
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("../api", () => ({
  api: {
    getManualGiros: jest.fn().mockResolvedValue([]),
    giroWarnings: jest.fn().mockResolvedValue({ warnings: [] }),
    getOrdenes: jest.fn().mockResolvedValue([]),
    marcarEntregado: jest.fn().mockResolvedValue({ success: true }),
  },
  auth: { getToken: () => "t", isAuthenticated: () => true },
}));

import TabEntregas from "../components/entregas/TabEntregas";
import { api } from "../api";

const fs = require("fs");
const path = require("path");
const SRC = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");

let container = null, root = null;
const mount = (el) => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); act(() => { root.render(el); }); return container; };
afterEach(() => { if (root) { act(() => root.unmount()); root = null; } if (container) { container.remove(); container = null; } jest.clearAllMocks(); });
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const click = async (el) => act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });
const buttons = (el) => [...el.querySelectorAll("button")];
const btn = (el, text) => buttons(el).find((b) => b.textContent.trim() === text);
const btnLike = (el, re) => buttons(el).find((b) => re.test(b.textContent.trim()));

const iso = (hhmm) => `2026-09-21T${String(Number(hhmm.slice(0, 2)) - 2).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;
const mk = (id, extra = {}) => ({
  id, nombre: id, tipo_consegna: "DOMICILIO", estado: "LISTO", direccion: "Calle " + id, zona: "Q1",
  hora: "21:00", delivery_deadline_at: iso("21:00"), manual_giro_id: null, items: [], ya_pagado: false, ...extra,
});

// ─── 1) STATIC GATE: nessun writer di EN_ENTREGA nella UI ────────────────────
describe("static — EN_ENTREGA non ha più writer nella UI", () => {
  const WRITER_FILES = [
    "components/entregas/TabEntregas.jsx",
    "components/repartidor/RepartidorPage.jsx",
    "components/ServicioPage.jsx",
    "components/ordenes/OrdenCard.jsx",
    "api.js",
  ];

  test("nessun file della UI chiama marcarEnEntrega", () => {
    for (const rel of WRITER_FILES) {
      expect(read(rel)).not.toMatch(/api\.marcarEnEntrega\s*\(/);
    }
  });

  test("api.js non espone più marcarEnEntrega", () => {
    expect(read("api.js")).not.toMatch(/marcarEnEntrega\s*:\s*function/);
  });

  test("nessuna transizione FE verso EN_ENTREGA (buildEnEntregaTransition non usato)", () => {
    for (const rel of WRITER_FILES) {
      expect(read(rel)).not.toMatch(/buildEnEntregaTransition\s*\(/);
    }
  });

  // NB: si cercano gli IDENTIFICATORI, non le stringhe in prosa — i commenti di
  // questa release citano "Enviar"/"Salgo" per spiegare perché non ci sono più.
  test('gli handler dei controlli "Enviar" / "Salgo" / "Forzar entrega" non esistono più', () => {
    const entregas = read("components/entregas/TabEntregas.jsx");
    expect(entregas).not.toMatch(/onSendRepartidor/);
    expect(entregas).not.toMatch(/const handleSendRepartidor/);
    const driver = read("components/repartidor/RepartidorPage.jsx");
    expect(driver).not.toMatch(/onSalgo/);
    expect(driver).not.toMatch(/const handleSalgo/);
    expect(read("components/ordenes/OrdenCard.jsx")).not.toMatch(/onForzarEntrega/);
    expect(read("components/ServicioPage.jsx")).not.toMatch(/onForzarEntrega=/);
    expect(read("components/ServicioPage.jsx")).not.toMatch(/const forzaEntrega/);
  });

  test('il placeholder "manual" non viene più inviato come metodo di pagamento', () => {
    for (const rel of WRITER_FILES) {
      expect(read(rel)).not.toMatch(/marcarEntregado\([^)]*["']manual["']/s);
    }
    expect(read("components/entregas/TabEntregas.jsx")).not.toMatch(/metodo_pago:\s*["']manual["']/);
  });

  test("il FE non manda più `cobrado`: lo deriva il backend", () => {
    expect(read("api.js")).not.toMatch(/cobrado:\s*cobrado\s*!==\s*false/);
  });

  test("copy stale rimossa (driver volvió / driver rientrato / giro chiuso)", () => {
    const t = read("components/entregas/TabEntregas.jsx");
    expect(t).not.toMatch(/Driver volvió/i);
    expect(t).not.toMatch(/driver rientrato/i);
  });
});

// ─── 2) OPERATORE — DOMICILIO non pagato ─────────────────────────────────────
describe("Entregas operatore — DOMICILIO non pagato", () => {
  test('su LISTO mostra "✓ Entregado" e NON mostra "Enviar"', async () => {
    const el = mount(<TabEntregas ordenes={[mk("#A")]} setOrdenes={() => {}} notify={() => {}} />);
    await flush();
    expect(btn(el, "Enviar")).toBeUndefined();
    expect(btnLike(el, /^✓ Entregado$/)).toBeTruthy();
  });

  test("Entregado apre il picker inline e NON finalizza subito", async () => {
    const el = mount(<TabEntregas ordenes={[mk("#A")]} setOrdenes={() => {}} notify={() => {}} />);
    await flush();
    await click(btnLike(el, /^✓ Entregado$/));
    expect(el.textContent).toMatch(/¿Cómo paga\?/);
    expect(api.marcarEntregado).not.toHaveBeenCalled();
  });

  test.each([["💵", "efectivo"], ["💳", "tarjeta"], ["📱", "bizum"]])(
    "scegliendo %s finalizza con metodo %s, actor operator, senza cobrado",
    async (icon, metodo) => {
      const el = mount(<TabEntregas ordenes={[mk("#A")]} setOrdenes={() => {}} notify={() => {}} />);
      await flush();
      await click(btnLike(el, /^✓ Entregado$/));
      await click(btn(el, icon));
      expect(api.marcarEntregado).toHaveBeenCalledTimes(1);
      const [id, opts] = api.marcarEntregado.mock.calls[0];
      expect(id).toBe("#A");
      expect(opts.metodo_pago).toBe(metodo);
      expect(opts.actor).toBe("operator");
      expect(opts.origin).toBe("entregas");
      expect(opts).not.toHaveProperty("cobrado");
    }
  );

  test("il picker si può annullare senza finalizzare", async () => {
    const el = mount(<TabEntregas ordenes={[mk("#A")]} setOrdenes={() => {}} notify={() => {}} />);
    await flush();
    await click(btnLike(el, /^✓ Entregado$/));
    await click(btn(el, "cancelar"));
    expect(el.textContent).not.toMatch(/¿Cómo paga\?/);
    expect(api.marcarEntregado).not.toHaveBeenCalled();
  });
});

// ─── 3) OPERATORE — DOMICILIO già pagato ─────────────────────────────────────
describe("Entregas operatore — DOMICILIO già pagato", () => {
  const confirmYes = () => { window.confirm = jest.fn(() => true); };

  test("nessun picker: finalizza senza metodo, il canonico resta al backend", async () => {
    confirmYes();
    const el = mount(<TabEntregas ordenes={[mk("#A", { ya_pagado: true, metodo_pago: "tarjeta" })]} setOrdenes={() => {}} notify={() => {}} />);
    await flush();
    const b = btnLike(el, /Entregado/);
    expect(b.textContent).toMatch(/pagado/);
    await click(b);
    expect(el.textContent).not.toMatch(/¿Cómo paga\?/);
    expect(api.marcarEntregado).toHaveBeenCalledTimes(1);
    const [, opts] = api.marcarEntregado.mock.calls[0];
    expect(opts.metodo_pago).toBeUndefined();
    expect(opts.actor).toBe("operator");
  });

  test("annullando la conferma non finalizza", async () => {
    window.confirm = jest.fn(() => false);
    const el = mount(<TabEntregas ordenes={[mk("#A", { ya_pagado: true })]} setOrdenes={() => {}} notify={() => {}} />);
    await flush();
    await click(btnLike(el, /Entregado/));
    expect(api.marcarEntregado).not.toHaveBeenCalled();
  });
});

// ─── 4) COMPATIBILITÀ LEGACY EN_ENTREGA ──────────────────────────────────────
describe("compatibilità — ordine legacy già in EN_ENTREGA", () => {
  test('resta finalizzabile e mostra il marcatore "Legacy"', async () => {
    const el = mount(<TabEntregas ordenes={[mk("#L", { estado: "EN_ENTREGA" })]} setOrdenes={() => {}} notify={() => {}} />);
    await flush();
    expect(el.textContent).toMatch(/Legacy/);
    await click(btnLike(el, /^✓ Entregado$/));
    await click(btn(el, "💵"));
    expect(api.marcarEntregado).toHaveBeenCalledTimes(1);
    expect(api.marcarEntregado.mock.calls[0][1].metodo_pago).toBe("efectivo");
  });
});

// ─── 5) RIFIUTO DEL BACKEND ──────────────────────────────────────────────────
describe("il backend può rifiutare la finalizzazione", () => {
  test("payment_method_required → rollback dello stato e messaggio all'operatore", async () => {
    api.marcarEntregado.mockResolvedValueOnce({ success: false, error: "payment_method_required" });
    const notify = jest.fn();
    const setOrdenes = jest.fn();
    const el = mount(<TabEntregas ordenes={[mk("#A")]} setOrdenes={setOrdenes} notify={notify} />);
    await flush();
    await click(btnLike(el, /^✓ Entregado$/));
    await click(btn(el, "💵"));
    await flush();
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/método de pago/i), expect.any(String));
    // due chiamate a setOrdenes: update ottimistico + rollback
    expect(setOrdenes.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── 6) EN_COCINA non è finalizzabile ────────────────────────────────────────
describe("un ordine ancora in cocina non si può consegnare", () => {
  test("nessun bottone Entregado su EN_COCINA", async () => {
    const el = mount(<TabEntregas ordenes={[mk("#C", { estado: "EN_COCINA" })]} setOrdenes={() => {}} notify={() => {}} />);
    await flush();
    expect(btnLike(el, /Entregado/)).toBeUndefined();
    expect(el.textContent).toMatch(/En cocina/);
  });
});
