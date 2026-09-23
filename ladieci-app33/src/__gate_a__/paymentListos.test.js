/**
 * [PAYMENT-IDEMPOTENCY 2026-09-23] Listos / Caja lato FE.
 *   - RETIRADO è lo stesso stato per DOMICILIO e RITIRO: copy "Entregado" / "Retirado".
 *   - Non pagato: picker con esattamente 3 metodi. Già pagato: nessun picker, nessun metodo inviato.
 *   - Cambio pago = azione esplicita (onCambiaPago con metodo atteso) → api.cambiarMetodoPago,
 *     mai un secondo updateEstado(RETIRADO).
 *   - Caja (riepilogo Listos + api.getSerata): bucket esatti, la correzione sposta solo il bucket.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import TabListos from "../components/ordenes/TabListos";
import OrdenCard from "../components/ordenes/OrdenCard";
import { api } from "../api";
import { isAlreadyPaid, terminalLabel, PAYMENT_METHODS, isValidPaymentMethod } from "../core/orders";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const fs = require("fs");
const path = require("path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

let container = null, root = null;
const mount = (el) => {
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
  return container;
};
afterEach(() => {
  if (root) { act(() => root.unmount()); root = null; }
  if (container) { container.remove(); container = null; }
  jest.restoreAllMocks();
});
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const buttons = () => [...container.querySelectorAll("button")];
const btn = (txt) => buttons().find((b) => b.textContent.includes(txt));
const METHOD_LABELS = ["💵 Efectivo", "💳 Tarjeta", "📱 Bizum"];
const methodButtons = () => buttons().map((b) => b.textContent.trim()).filter((t) => METHOD_LABELS.includes(t) || /manual/i.test(t));

const base = (o) => ({ nombre: "ZZTEST", items: [{ n: "Margherita", q: 2, p: 8.25, cat: "Pizzas" }], totale: 16.5, ...o });

describe("helper pagamento", () => {
  test("metodi canonici = efectivo | tarjeta | bizum; manual non valido", () => {
    expect(PAYMENT_METHODS).toEqual(["efectivo", "tarjeta", "bizum"]);
    expect(isValidPaymentMethod("manual")).toBe(false);
    expect(isValidPaymentMethod(" Bizum ")).toBe(true);
  });
  test("isAlreadyPaid: ya_pagado, oppure cobrado con metodo reale", () => {
    expect(isAlreadyPaid({ ya_pagado: true })).toBe(true);
    expect(isAlreadyPaid({ cobrado: true, metodo_pago: "bizum" })).toBe(true);
    expect(isAlreadyPaid({ cobrado: true, metodo_pago: "manual" })).toBe(false);
    expect(isAlreadyPaid({ cobrado: false, metodo_pago: "" })).toBe(false);
  });
  test("terminalLabel: DOMICILIO Entregado, RITIRO Retirado", () => {
    expect(terminalLabel({ tipo_consegna: "DOMICILIO" })).toBe("Entregado");
    expect(terminalLabel({ tipo_consegna: "RITIRO" })).toBe("Retirado");
    expect(terminalLabel({})).toBe("Retirado");
  });
});

describe("Listos · label terminale (stesso stato RETIRADO)", () => {
  test("RITIRO RETIRADO → '✅ Retirado', DOMICILIO RETIRADO → '✅ Entregado'", () => {
    mount(<TabListos ordenes={[
      base({ id: "#R", estado: "RETIRADO", tipo_consegna: "RITIRO", cobrado: true, metodo_pago: "bizum" }),
      base({ id: "#D", estado: "RETIRADO", tipo_consegna: "DOMICILIO", cobrado: true, metodo_pago: "efectivo" }),
    ]} onRetirado={jest.fn()} onCambiaPago={jest.fn()} />);
    const cards = [...container.querySelectorAll("span")].map((s) => s.textContent.trim());
    expect(cards).toContain("✅ Retirado");
    expect(cards).toContain("✅ Entregado");
    expect(cards.filter((t) => t === "✅ Entregado")).toHaveLength(1);
  });
  test("OrdenCard (Tel/Barra): RETIRADO RITIRO → Retirado", () => {
    mount(<OrdenCard o={base({ id: "#R", estado: "RETIRADO", tipo_consegna: "RITIRO", ts: Date.now() })} />);
    expect(container.textContent).toContain("✅ Retirado");
    expect(container.textContent).not.toContain("Entregado");
  });
});

describe("Listos · finalizzazione", () => {
  test("RITIRO non pagato: picker con esattamente 3 metodi, Bizum → onRetirado(id,'bizum')", () => {
    const onRetirado = jest.fn();
    mount(<TabListos ordenes={[base({ id: "#1", estado: "LISTO", tipo_consegna: "RITIRO" })]} onRetirado={onRetirado} />);
    expect(methodButtons()).toEqual([]);
    click(btn("🛍 Retirado"));
    expect(methodButtons()).toEqual(METHOD_LABELS);
    click(btn("📱 Bizum"));
    expect(onRetirado).toHaveBeenCalledTimes(1);
    expect(onRetirado.mock.calls[0][0]).toBe("#1");
    expect(onRetirado.mock.calls[0][1]).toBe("bizum");
  });

  test.each([
    ["Ya pagado bizum", { ya_pagado: true, metodo_pago: "bizum" }],
    ["cobrado + tarjeta", { cobrado: true, metodo_pago: "tarjeta" }],
  ])("RITIRO già pagato (%s): nessun picker, nessun metodo inviato", (_n, pay) => {
    const onRetirado = jest.fn();
    mount(<TabListos ordenes={[base({ id: "#2", estado: "LISTO", tipo_consegna: "RITIRO", ...pay })]} onRetirado={onRetirado} />);
    click(btn("🛍 Retirado"));
    expect(methodButtons()).toEqual([]);
    expect(onRetirado).toHaveBeenCalledTimes(1);
    expect(onRetirado.mock.calls[0][0]).toBe("#2");
    expect(onRetirado.mock.calls[0][1]).toBeUndefined();
  });

  test("badge Ya pagado Bizum mostra 📱 (non 💵)", () => {
    mount(<TabListos ordenes={[base({ id: "#3", estado: "LISTO", tipo_consegna: "RITIRO", ya_pagado: true, metodo_pago: "bizum" })]} onRetirado={jest.fn()} />);
    expect(container.textContent).toContain("📱 Ya pagado");
    expect(container.textContent).not.toContain("💵 Ya pagado");
  });
});

describe("Listos · cambio pago esplicito", () => {
  const retirado = base({ id: "#7", estado: "RETIRADO", tipo_consegna: "RITIRO", cobrado: true, metodo_pago: "efectivo" });
  test("✎ apre 3 metodi; scelta diversa → onCambiaPago(id, nuovo, atteso), mai onRetirado", () => {
    const onRetirado = jest.fn(), onCambiaPago = jest.fn();
    mount(<TabListos ordenes={[retirado]} onRetirado={onRetirado} onCambiaPago={onCambiaPago} />);
    click(btn("💵 Efectivo"));                       // badge corrente ✎
    expect(container.textContent).toContain("¿Cambiar pago?");
    expect(methodButtons()).toEqual(METHOD_LABELS);
    click(btn("💳 Tarjeta"));
    expect(onCambiaPago).toHaveBeenCalledWith("#7", "tarjeta", "efectivo");
    expect(onRetirado).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("¿Cambiar pago?");  // picker chiuso: niente doppio click
  });
  test("scelta dello STESSO metodo → nessuna richiesta", () => {
    const onCambiaPago = jest.fn();
    mount(<TabListos ordenes={[retirado]} onRetirado={jest.fn()} onCambiaPago={onCambiaPago} />);
    click(btn("💵 Efectivo"));
    const again = buttons().filter((b) => b.textContent.trim() === "💵 Efectivo").at(-1);
    click(again);
    expect(onCambiaPago).not.toHaveBeenCalled();
  });
  test("ServicioPage: onCambiaPago usa api.cambiarMetodoPago, non updateEstado(RETIRADO)", () => {
    const src = read("components/ServicioPage.jsx");
    const block = src.slice(src.indexOf("onCambiaPago={async"), src.indexOf("onViewChat="));
    expect(block).toContain("api.cambiarMetodoPago(id, nuovoMetodo, metodoAtteso)");
    expect(block).not.toMatch(/updateEstado/);
    expect(block).toContain("beginAction(id)");
    expect(block).toContain("endAction(id)");
    // esito sconosciuto della RPC: nessun update locale, avviso dedicato
    expect(block).toMatch(/res\.outcome_unknown\)\s*\{[\s\S]*?notify\("⚠️ Respuesta incierta/);
    expect(block.slice(block.indexOf("res.outcome_unknown"), block.indexOf("} else {", block.indexOf("res.outcome_unknown")))).not.toMatch(/setOrdenes/);
  });
  test("api.cambiarMetodoPago invia l'azione dedicata con metodo atteso", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true, metodo_pago: "bizum" }) });
    const r = await api.cambiarMetodoPago("#7", "bizum", "efectivo");
    expect(r.success).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ action: "cambiarMetodoPago", id: "#7", metodo_pago: "bizum", metodo_pago_esperado: "efectivo", actor_type: "operator", origin: "dashboard" });
  });
});

// ── Caja lato FE ─────────────────────────────────────────────────────────────
// Fixture A–F: A/B/C pagati alla finalizzazione, D/E/F Ya pagado.
const FX = [
  ["A", "efectivo", false, 16.5, "RITIRO", [{ n: "Margherita", q: 2, p: 8.25, cat: "Pizzas" }]],
  ["B", "tarjeta", false, 21.0, "DOMICILIO", [{ n: "Diavola", q: 2, p: 9.25, cat: "Pizzas" }]],
  ["C", "bizum", false, 12.0, "RITIRO", [{ n: "Tiramisu", q: 2, p: 6, cat: "Postres" }]],
  ["D", "efectivo", true, 10.0, "RITIRO", [{ n: "Margherita", q: 1, p: 8, cat: "Pizzas" }, { n: "Agua", q: 1, p: 2, cat: "Bebidas" }]],
  ["E", "tarjeta", true, 13.75, "DOMICILIO", [{ n: "Quattro", q: 1, p: 11.25, cat: "Pizzas" }]],
  ["F", "bizum", true, 9.5, "RITIRO", [{ n: "Coca", q: 1, p: 2.5, cat: "Bebidas" }, { n: "Nutella", q: 1, p: 7, cat: "Postres" }]],
];
const fixture = (overrides = {}) => FX.map(([id, m, ya, tot, tipo, items]) => ({
  id, nombre: "ZZTEST " + id, estado: "RETIRADO", tipo_consegna: tipo, totale: tot, items,
  ya_pagado: ya, cobrado: true, metodo_pago: m, canal: "TEL", ts: Date.now(), ...(overrides[id] || {}),
}));
const listosSummary = () => {
  const txt = container.textContent;
  const num = (re) => Number((txt.match(re) || [])[1]);
  return {
    gross: num(/([\d.]+)€\s*en caja/), efectivo: num(/💵([\d.]+)€/), tarjeta: num(/💳([\d.]+)€/),
    bizum: num(/📱([\d.]+)€/), pedidos: num(/(\d+)\s*pedidos/), pizzas: num(/(\d+)\s*pizzas/),
  };
};

describe("Caja · riepilogo Listos", () => {
  test("fixture A–F: bucket esatti; correzione A efectivo→bizum sposta solo 16,50", () => {
    mount(<TabListos ordenes={fixture()} onRetirado={jest.fn()} />);
    const s0 = listosSummary();
    expect(s0).toEqual({ gross: 82.75, efectivo: 26.5, tarjeta: 34.75, bizum: 21.5, pedidos: 6, pizzas: 6 });
    act(() => root.render(<TabListos ordenes={fixture({ A: { metodo_pago: "bizum" } })} onRetirado={jest.fn()} />));
    const s1 = listosSummary();
    expect(s1).toEqual({ ...s0, efectivo: 10, bizum: 38 });
  });
});

describe("Caja · api.getSerata (Economía 'Caja del día')", () => {
  const serata = async (rows) => {
    jest.spyOn(global, "fetch").mockImplementation(async (url) => ({
      ok: true, status: 200,
      json: async () => (String(url).includes("/rest/v1/ordenes") ? rows : []),
    }));
    return api.getSerata();
  };
  test("fixture A–F → pagamenti esatti; correzione A sposta solo il bucket; prodotti/consegne invariati", async () => {
    const r0 = await serata(fixture());
    expect(r0.fonte).toBe("live");
    expect(r0.incasso).toBe(82.75);
    expect(r0.pagamenti.efectivo).toEqual({ incasso: 26.5, count: 2 });
    expect(r0.pagamenti.tarjeta).toEqual({ incasso: 34.75, count: 2 });
    expect(r0.pagamenti.bizum).toEqual({ incasso: 21.5, count: 2 });
    expect(r0.pagamenti.no_especificado).toEqual({ incasso: 0, count: 0 });
    jest.restoreAllMocks();
    const r1 = await serata(fixture({ A: { metodo_pago: "bizum" } }));
    expect(r1.incasso).toBe(r0.incasso);
    expect(r1.pagamenti.efectivo).toEqual({ incasso: 10, count: 1 });
    expect(r1.pagamenti.bizum).toEqual({ incasso: 38, count: 3 });
    expect(r1.pagamenti.tarjeta).toEqual(r0.pagamenti.tarjeta);
    expect(r1.prodotti).toEqual(r0.prodotti);
    expect(r1.consegne).toEqual(r0.consegne);
    expect([r1.pizzeTot, r1.bevandeTot]).toEqual([r0.pizzeTot, r0.bevandeTot]);
  });
});

describe("nessun writer FE di 'manual'", () => {
  test("nessun file sorgente scrive metodo_pago 'manual'", () => {
    const files = ["api.js", "components/ServicioPage.jsx", "components/ordenes/TabListos.jsx", "components/NuevoPedidoModal.jsx",
      "components/entregas/TabEntregas.jsx", "components/repartidor/RepartidorPage.jsx"];
    for (const f of files) expect(read(f)).not.toMatch(/metodo_pago\s*[:=]\s*["']manual["']/);
  });
});
