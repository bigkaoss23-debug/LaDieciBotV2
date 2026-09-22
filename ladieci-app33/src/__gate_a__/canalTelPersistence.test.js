/**
 * [DELIVERY-REFACTOR 2026-09-22 / Phase 4] Canale TEL.
 *
 * Prima: il tab "📞 Teléfono" di Nuevo Pedido salvava canal="MANUAL", quindi il
 * bucket TEL di Economía non riceveva mai un ordine nuovo. Ora TEL viene
 * persistito come TEL.
 *
 * [ORIGINE-ORDINI 2026-09-22] Il tab "💬 WhatsApp" di Nuevo Pedido è stato
 * RIMOSSO per decisione business: un ordine WhatsApp trascritto a mano è un TEL.
 * Con quel bottone sparisce anche il motivo per cui il modal scriveva "MANUAL"
 * (hotfix prod-wa-orphan-visible, caso #014): non esistendo più un percorso
 * manuale con origine WhatsApp, non c'è più nulla da salvare come MANUAL.
 *
 * VINCOLO DA NON ROMPERE: la regola di visibilità resta invariata. Un ordine
 * canal="WA" CON wa_id non appartiene a Pedidos (belongsToPedidos → false) e non
 * compare in TabWA, che disegna solo dalla tabella wa_msgs: resterebbe invisibile
 * ovunque. Per questo Nuevo Pedido non deve MAI produrre "WA" — ed è ora
 * strutturalmente impossibile, perché il ternario collassa su TEL.
 */
import { belongsToPedidos, isWaSinConversacion, isWaOrigen } from "../utils/pedidosVisibility";

const fs = require("fs");
const path = require("path");
const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

describe("pedidosVisibility regge già canal=TEL", () => {
  test("un ordine TEL appartiene a Pedidos", () => {
    expect(belongsToPedidos({ canal: "TEL" })).toBe(true);
  });

  test("TEL non viene scambiato per un orfano WhatsApp", () => {
    expect(isWaSinConversacion({ canal: "TEL" })).toBe(false);
  });

  test("TEL senza wa_id non porta il badge WhatsApp", () => {
    expect(isWaOrigen({ canal: "TEL", wa_id: "" })).toBe(false);
  });

  // [ORIGINE-ORDINI 2026-09-22] Il backend LIVE (agentOrdini.js:330) popola
  // wa_id col telefono su OGNI ordine: il badge "💬 WhatsApp" non deve dedurre
  // l'origine da wa_id, altrimenti ogni ordine telefonico si marchia come
  // WhatsApp appena il polling lo rilegge dal DB.
  test("TEL CON wa_id (popolato dal fallback backend) non porta il badge WhatsApp", () => {
    expect(isWaOrigen({ canal: "TEL", wa_id: "34600111222" })).toBe(false);
  });

  test("BANCO con wa_id sintetico non porta il badge WhatsApp", () => {
    expect(isWaOrigen({ canal: "BANCO", wa_id: "BARRA-K3F1" })).toBe(false);
  });

  test("il badge WhatsApp resta per il flusso bot (canal=WA con conversazione)", () => {
    expect(isWaOrigen({ canal: "WA", wa_id: "34600111222" })).toBe(true);
    expect(isWaOrigen({ canal: "WA", wa_id: "" })).toBe(false); // orfano: badge dedicato
  });

  test("le altre appartenenze restano invariate", () => {
    expect(belongsToPedidos({ canal: "MANUAL" })).toBe(true);
    expect(belongsToPedidos({ canal: "BANCO" })).toBe(false);          // tab Barra
    expect(belongsToPedidos({ canal: "WA", wa_id: "34600" })).toBe(false); // flusso WhatsApp
    expect(belongsToPedidos({ canal: "WA", wa_id: "" })).toBe(true);   // orfano → fallback Pedidos
  });
});

describe("NuevoPedidoModal persiste il canale scelto", () => {
  const src = read("components/NuevoPedidoModal.jsx");

  test("TEL viene salvato come TEL, non più appiattito su MANUAL", () => {
    expect(src).toMatch(/canal:\s*canal === "BANCO" \? "BANCO" : "TEL"/);
  });

  test("BANCO resta BANCO", () => {
    expect(src).toMatch(/canal === "BANCO" \? "BANCO"/);
  });

  // [ORIGINE-ORDINI 2026-09-22]
  test("il ternario non può più produrre MANUAL né WA", () => {
    const ternario = src.match(/canal:\s*canal === "BANCO"[^\n]*/)[0];
    expect(ternario).not.toMatch(/MANUAL/);
    expect(ternario).not.toMatch(/"WA"/);
  });

  test("wa_id non viene più usato come marcatore d'origine", () => {
    expect(src).toMatch(/wa_id:\s*""/);
    expect(src).not.toMatch(/wa_id:\s*canal === "WA"/);
  });
});

describe("Economía ha già il bucket TEL", () => {
  test("api.js classifica TEL come canale proprio", () => {
    expect(read("api.js")).toMatch(/r\.canal === "TEL" \? "TEL"/);
  });
  test("EconomiaPage riconosce TEL", () => {
    expect(read("components/EconomiaPage.jsx")).toMatch(/canal==="TEL"/);
  });
});
