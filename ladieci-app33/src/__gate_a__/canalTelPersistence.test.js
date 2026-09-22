/**
 * [DELIVERY-REFACTOR 2026-09-22 / Phase 4] Canale TEL.
 *
 * Prima: il tab "📞 Teléfono" di Nuevo Pedido salvava canal="MANUAL", quindi il
 * bucket TEL di Economía non riceveva mai un ordine nuovo. Ora TEL viene
 * persistito come TEL.
 *
 * VINCOLO DA NON ROMPERE (hotfix prod-wa-orphan-visible, caso #014):
 * il tab "💬 WhatsApp" deve continuare a salvare MANUAL. Un ordine canal="WA"
 * CON wa_id non appartiene a Pedidos (belongsToPedidos → false) e non compare in
 * TabWA, che disegna solo dalla tabella wa_msgs: resterebbe invisibile ovunque.
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
    expect(src).toMatch(/canal === "TEL" \? "TEL"/);
  });

  test("BANCO resta BANCO", () => {
    expect(src).toMatch(/canal === "BANCO" \? "BANCO"/);
  });

  test("il tab WhatsApp continua a salvare MANUAL (hotfix orphan intatto)", () => {
    // il ternario termina con MANUAL: è il ramo che raccoglie WA e ogni altro caso
    expect(src).toMatch(/canal:\s*canal === "BANCO" \? "BANCO" : canal === "TEL" \? "TEL" : "MANUAL"/);
    // e l'origine WhatsApp resta tracciata in wa_id
    expect(src).toMatch(/wa_id:\s*canal === "WA"/);
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
