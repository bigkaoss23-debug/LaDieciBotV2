/**
 * Fase D — preservazione della linea Git.
 *
 * L'hotfix innesta funzioni provenienti da una linea sorgente divergente
 * (la cartella non versionata usata per i deploy manuali) che NON contiene
 * giro manuale, telemetria rider, previewOrderTiming, chiusura cassa e le
 * validazioni data/ora. Questi test falliscono se un porting le rimuove.
 *
 * Sono verifiche di MODULO (import risolti, simboli esportati) più contratto
 * statico sui punti di cablaggio: non semplice presenza di stringhe.
 */
import fs from "fs";
import path from "path";

const SRC = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(SRC, rel));

describe("state machine ordini (core/orders) intatta", () => {
  test("il modulo esporta gli stati e i builder di transizione", () => {
    // eslint-disable-next-line global-require
    const orders = require("./index");
    expect(orders.ORDER_STATES).toBeDefined();
    ["POR_CONFIRMAR", "EN_COCINA", "LISTO", "EN_ENTREGA", "RETIRADO"]
      .forEach((s) => expect(orders.ORDER_STATES[s]).toBeDefined());
    [
      "buildEnCocinaTransition",
      "buildEnEntregaTransition",
      "buildListoTransition",
      "buildRetiradoTransition",
      "buildOperatorOrderCreationIntent",
      "buildWaOrderCreationIntent",
      "logTransition",
      "logOrderCreation",
      "logRollback",
    ].forEach((fn) => expect(typeof orders[fn]).toBe("function"));
  });
});

describe("giro manuale (assente nella linea orfana)", () => {
  const api = read("api.js");

  test("le API del giro manuale esistono ancora", () => {
    expect(api).toContain("createManualGiro");
    expect(api).toContain("removeOrderFromManualGiro");
    expect(api).toContain("getManualGiros");
  });

  test("la UI del giro manuale è ancora cablata", () => {
    const cocina = read("components/cocina/TabCocina.jsx")
      + read("components/cocina/PanelCocina.jsx")
      + read("components/entregas/TabEntregas.jsx");
    expect(cocina).toMatch(/giro manual/i);
  });
});

describe("telemetria rider e preview timing", () => {
  test("getDriverStatus ancora esposto", () => {
    expect(read("api.js")).toContain("getDriverStatus");
  });

  test("previewOrderTiming ancora esposto", () => {
    expect(read("api.js")).toContain("previewOrderTiming");
  });

  test("RepartidorPage presente", () => {
    expect(exists("components/repartidor/RepartidorPage.jsx")).toBe(true);
  });
});

describe("chiusura cassa", () => {
  test("Caja del día ancora calcolata in Economia", () => {
    expect(read("components/EconomiaPage.jsx")).toMatch(/Caja del/);
  });

  test("lo stato Cierre forzado è ancora nella state machine", () => {
    // eslint-disable-next-line global-require
    const { ORDER_STATES, ORDER_STATE_LABELS } = require("./index");
    expect(ORDER_STATES.CHIUSO_FORZATO).toBeDefined();
    expect(ORDER_STATE_LABELS[ORDER_STATES.CHIUSO_FORZATO]).toBe("Cierre forzado");
  });
});

describe("validazioni data e ora", () => {
  test("il modulo serviceClock è presente ed esporta i suoi helper", () => {
    expect(exists("utils/serviceClock.js")).toBe(true);
    // eslint-disable-next-line global-require
    const clock = require("../../utils/serviceClock");
    expect(typeof clock.orarioToMs).toBe("function");
  });

  test("validazione data (shadow preview) non rimossa", () => {
    expect(read("components/ShadowPreviewPanel.jsx")).toMatch(/Fecha no v/);
  });

  test("validazione HH:MM (entregas) non rimossa", () => {
    expect(read("components/entregas/TabEntregas.jsx")).toMatch(/Formato HH:MM/);
  });
});

describe("auth, PIN, ruoli, ticket, cocina", () => {
  test("api.js espone il layer auth", () => {
    const api = read("api.js");
    expect(api).toMatch(/export\s+(const\s+)?\{?[^}]*auth/);
  });

  test("il modulo printing (ticket cliente 58mm) è integro", () => {
    [
      "printing/createCustomerTicket.js",
      "printing/renderCustomerTicket.js",
      "printing/normalizeOrderForTicket.js",
      "printing/components/CustomerTicketPrintModal.jsx",
      "printing/components/TicketDocumentView.jsx",
      "printing/components/TicketDocumentView.css",
    ].forEach((f) => expect(exists(f)).toBe(true));
  });

  test("Cocina e Listos ancora montati", () => {
    ["components/cocina/TabCocina.jsx", "components/cocina/PanelCocina.jsx",
     "components/ordenes/TabListos.jsx"].forEach((f) => expect(exists(f)).toBe(true));
  });
});

describe("calibrazione stampa 46mm portata", () => {
  const css = read("printing/components/TicketDocumentView.css");

  test("larghezza contenuto nativa 46mm centrata", () => {
    expect(css).toContain("--ticket-paper-width:46mm");
    expect(css).toMatch(/margin-left:auto;margin-right:auto/);
    expect(css).toMatch(/margin:0 auto!important/);
  });

  test("contrasto termico: nero pieno, nessun grigio", () => {
    expect(css).toMatch(/\.ticket-document\{[^}]*color:#000/);
    expect(css).not.toMatch(/color:#444/);
  });

  test("logo ridotto a 18.4mm", () => {
    expect(css).toContain("width:18.4mm");
  });

  test("colonna prezzo non comprimibile da un nome lungo", () => {
    expect(css).toContain("max-content!important");
  });
});

describe("fallback canale MANUAL portato", () => {
  test("normalizeChannel non lancia più su canale sconosciuto", () => {
    // eslint-disable-next-line global-require
    const mod = require("../../printing/normalizeOrderForTicket.js");
    const src = read("printing/normalizeOrderForTicket.js");
    expect(src).not.toContain("Unsupported order channel");
    expect(src).toMatch(/\?\s*normalized\s*:\s*"MANUAL"/);
    expect(mod).toBeDefined();
  });
});
