import { belongsToPedidos, isWaSinConversacion, isWaOrigen } from './pedidosVisibility';

// HOTFIX prod-wa-orphan-visible — copertura dei requisiti del task.
const ord = (over) => ({ id: "#001", estado: "POR_CONFIRMAR", canal: "MANUAL", wa_id: "", ...over });

describe("belongsToPedidos (tab Pedidos/TabManual)", () => {
  test("MANUAL appare in Pedidos", () => {
    expect(belongsToPedidos(ord({ canal: "MANUAL" }))).toBe(true);
  });
  test("TEL appare in Pedidos", () => {
    expect(belongsToPedidos(ord({ canal: "TEL" }))).toBe(true);
  });
  test("canal vuoto/legacy appare in Pedidos", () => {
    expect(belongsToPedidos(ord({ canal: "" }))).toBe(true);
    expect(belongsToPedidos(ord({ canal: null }))).toBe(true);
    expect(belongsToPedidos(ord({ canal: undefined }))).toBe(true);
  });
  test("BANCO NON appare in Pedidos", () => {
    expect(belongsToPedidos(ord({ canal: "BANCO" }))).toBe(false);
  });
  test("WA CON wa_id (conversazione reale) resta nel flusso WhatsApp, NON in Pedidos", () => {
    expect(belongsToPedidos(ord({ canal: "WA", wa_id: "34600111222" }))).toBe(false);
  });
  test("WA SENZA wa_id (orfano) appare in Pedidos come fallback", () => {
    expect(belongsToPedidos(ord({ canal: "WA", wa_id: "" }))).toBe(true);
    expect(belongsToPedidos(ord({ canal: "WA", wa_id: null }))).toBe(true);
    expect(belongsToPedidos(ord({ canal: "WA", wa_id: "   " }))).toBe(true);
  });
  test("nessun ordine POR_CONFIRMAR resta invisibile (ogni canale è coperto da un tab)", () => {
    // Un ordine POR_CONFIRMAR deve apparire in Pedidos OPPURE essere instradato
    // a un altro tab noto (BANCO→Barra, WA-con-wa_id→WhatsApp). Mai "in nessun tab".
    const casi = [
      ord({ canal: "MANUAL" }),
      ord({ canal: "TEL" }),
      ord({ canal: "" }),
      ord({ canal: "WA", wa_id: "" }),         // orfano → Pedidos
      ord({ canal: "WA", wa_id: "34600111222" }), // → WhatsApp
      ord({ canal: "BANCO" }),                  // → Barra
    ];
    for (const o of casi) {
      const inPedidos = belongsToPedidos(o);
      const inBanco   = o.canal === "BANCO";
      const inWa      = o.canal === "WA" && !!String(o.wa_id || "").trim();
      expect(inPedidos || inBanco || inWa).toBe(true);
    }
  });
});

describe("badge helpers (OrdenCard)", () => {
  test("WA senza wa_id → badge 'WA sin conversación', NON badge WhatsApp", () => {
    const o = ord({ canal: "WA", wa_id: "" });
    expect(isWaSinConversacion(o)).toBe(true);
    expect(isWaOrigen(o)).toBe(false);
  });
  test("WA con conversazione → badge WhatsApp", () => {
    const o = ord({ canal: "WA", wa_id: "34600111222" });
    expect(isWaOrigen(o)).toBe(true);
    expect(isWaSinConversacion(o)).toBe(false);
  });
  // [ORIGINE-ORDINI 2026-09-22] Il badge si decide su `canal`, non su `wa_id`.
  // Prima un MANUAL con wa_id era "l'ordine creato dal bottone 💬 WhatsApp": quel
  // bottone non esiste più. E `wa_id` non è un marcatore d'origine affidabile,
  // perché il backend LIVE (agentOrdini.js:330) lo popola col telefono su OGNI
  // ordine — quindi la vecchia regola marchiava come WhatsApp anche i telefonici.
  test("MANUAL/TEL con wa_id popolato dal backend → nessun badge WhatsApp", () => {
    expect(isWaOrigen(ord({ canal: "MANUAL", wa_id: "34600111222" }))).toBe(false);
    expect(isWaOrigen(ord({ canal: "TEL", wa_id: "34600111222" }))).toBe(false);
  });
  test("MANUAL/TEL puro (telefono, senza wa_id) → nessun badge WhatsApp", () => {
    expect(isWaOrigen(ord({ canal: "MANUAL", wa_id: "" }))).toBe(false);
    expect(isWaOrigen(ord({ canal: "TEL", wa_id: "" }))).toBe(false);
  });
  test("BANCO con wa_id → nessun badge WhatsApp (è Barra)", () => {
    expect(isWaOrigen(ord({ canal: "BANCO", wa_id: "34600111222" }))).toBe(false);
  });
});
