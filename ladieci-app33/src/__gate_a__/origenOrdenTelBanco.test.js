/**
 * [ORIGINE-ORDINI 2026-09-22] Nuevo Pedido = due sole origini: TEL e BANCO.
 *
 * Decisione business: il bottone "💬 WhatsApp" del modal manuale sparisce. Un
 * ordine arrivato via WhatsApp sul telefono della pizzeria e trascritto a mano
 * è, a tutti gli effetti operativi, un TEL. BANCO resta il codice interno per
 * tutto ciò che nasce fisicamente nel locale (banco, terrazza), con label UI
 * "Barra".
 *
 * I due tab restano SEPARATI (nessuna fusione Tel/Barra) e il pannello bot
 * WhatsApp non viene toccato.
 *
 * Copertura richiesta A–G. Come gli altri gate di questo repo, non è un render
 * DOM (@testing-library/react non è installato — vedi package.json): le regole
 * reali vengono ESTRATTE dal sorgente e rieseguite come funzioni pure su ordini
 * sintetici, così un cambio di codice che le violi rompe il test invece di
 * passare inosservato.
 */
import { belongsToPedidos, isWaOrigen, isWaSinConversacion } from "../utils/pedidosVisibility";

const fs = require("fs");
const path = require("path");
const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

const modalSrc = read("components/NuevoPedidoModal.jsx");
const servicioSrc = read("components/ServicioPage.jsx");
const tabManualSrc = read("components/ordenes/TabManual.jsx");
const tabBancoSrc = read("components/ordenes/TabBanco.jsx");
const tabListosSrc = read("components/ordenes/TabListos.jsx");
const tabWaSrc = read("components/wa/TabWA.jsx");

const POR_CONFIRMAR = "POR_CONFIRMAR";
const EN_COCINA = "EN_COCINA";

// ── Estrazione delle regole reali dal sorgente ─────────────────────────────

// Opzioni di origine offerte dal modal (~riga 849).
const optionsBlock = modalSrc.match(/\[\{ id: "TEL"[^\]]*\}\]\.map/);
if (!optionsBlock) throw new Error("Array delle opzioni di canale non trovato in NuevoPedidoModal.jsx");
const MODAL_OPTION_IDS = [...optionsBlock[0].matchAll(/id:\s*"([A-Z]+)"/g)].map(m => m[1]);
const MODAL_OPTION_LABELS = [...optionsBlock[0].matchAll(/label:\s*"([^"]+)"/g)].map(m => m[1]);

// Regola di persistenza del canale (~riga 309).
if (!/canal:\s*canal === "BANCO" \? "BANCO" : "TEL"/.test(modalSrc)) {
  throw new Error("Ternario di persistenza canal cambiato in NuevoPedidoModal.jsx");
}
const persistCanal = (canalState) => (canalState === "BANCO" ? "BANCO" : "TEL");

// Stato iniziale e di reset del modal (~righe 102 e 187).
if (!/const \[canal,\s*setCanal\]\s*=\s*useState\("TEL"\)/.test(modalSrc)) {
  throw new Error("Stato iniziale di canal cambiato in NuevoPedidoModal.jsx");
}
if (!/setCanal\("TEL"\);/.test(modalSrc)) {
  throw new Error("reset() non riporta più canal a TEL in NuevoPedidoModal.jsx");
}

// Prefill iniettato dal bottone NUEVO PEDIDO (~riga 1315).
const prefillMatch = servicioSrc.match(
  /setPrefillCliente\(tab===\s*"banco"\s*\?\s*\{canal:\s*"([A-Z]+)"\}\s*:\s*null\)/
);
if (!prefillMatch) throw new Error("Prefill del bottone NUEVO PEDIDO non trovato in ServicioPage.jsx");
const PREFILL_WHEN_TAB_BANCO = prefillMatch[1];

// Auto-switch dopo la creazione (~riga 354).
if (!/if \(o\.canal===\s*"BANCO"\) setTab\("banco"\);\s*\n\s*else setTab\("manual"\);/.test(servicioSrc)) {
  throw new Error("Regola di auto-switch post-creazione cambiata in ServicioPage.jsx");
}
const tabAfterCreation = (orderCanal) => (orderCanal === "BANCO" ? "banco" : "manual");

// Contatore del tab Tel: DEVE usare lo stesso criterio della lista.
if (!/ordenes\.filter\(o=>belongsToPedidos\(o\) && o\.estado===ORDER_STATES\.POR_CONFIRMAR\)/.test(servicioSrc)) {
  throw new Error("Contatore del tab Tel cambiato in ServicioPage.jsx");
}
const telCounter = (ordenes) =>
  ordenes.filter(o => belongsToPedidos(o) && o.estado === POR_CONFIRMAR).length;

// Contatore del tab Barra: semantica storica invariata.
if (!/ordenes\.filter\(o=>o\.canal==="BANCO" &&\(o\.estado===ORDER_STATES\.POR_CONFIRMAR\|\|o\.estado===ORDER_STATES\.EN_COCINA\)\)/.test(servicioSrc)) {
  throw new Error("Contatore del tab Barra cambiato in ServicioPage.jsx");
}
const barraCounter = (ordenes) =>
  ordenes.filter(o => o.canal === "BANCO" && (o.estado === POR_CONFIRMAR || o.estado === EN_COCINA)).length;

// Filtro della lista Barra (TabBanco ~riga 16).
if (!/ordenes\.filter\(o=>o\.canal==="BANCO"\)/.test(tabBancoSrc)) {
  throw new Error("Filtro di TabBanco cambiato");
}
const inBarraList = (o) => o.canal === "BANCO";

// ── Ciclo di vita del modal per un click su NUEVO PEDIDO ──────────────────
// Rispecchia l'effetto prefill reale (~riga 715): `if (prefill.canal) setCanal(...)`,
// altrimenti resta il default/reset "TEL".
function openModalCanal(externalTab, explicitClick /* "TEL" | "BANCO" | null */) {
  let canal = "TEL"; // useState("TEL") + reset()
  const prefill = externalTab === "banco" ? { canal: PREFILL_WHEN_TAB_BANCO } : null;
  if (prefill && prefill.canal) canal = prefill.canal;
  if (explicitClick) canal = explicitClick;
  return canal;
}

// Un ordine come lo costruisce il modal, per la parte che ci interessa.
const nuevoPedido = (canalState) => ({
  canal: persistCanal(canalState),
  wa_id: "",
  estado: POR_CONFIRMAR,
});

// ── A ─────────────────────────────────────────────────────────────────────
describe("A — Nuevo Pedido offre solo Teléfono e Barra", () => {
  test("le opzioni sono esattamente TEL e BANCO", () => {
    expect(MODAL_OPTION_IDS).toEqual(["TEL", "BANCO"]);
  });

  test("le label mostrate sono Teléfono e Barra", () => {
    expect(MODAL_OPTION_LABELS).toEqual(["📞 Teléfono", "🏪 Barra"]);
  });

  test("nessuna opzione WhatsApp nel modal", () => {
    expect(MODAL_OPTION_IDS).not.toContain("WA");
    expect(optionsBlock[0]).not.toMatch(/WhatsApp/);
  });
});

// ── B ─────────────────────────────────────────────────────────────────────
describe("B — TEL: persistenza, lista, contatore, auto-switch", () => {
  const ordine = nuevoPedido(openModalCanal("manual", null));

  test("persistenza = TEL", () => {
    expect(ordine.canal).toBe("TEL");
  });

  test("visibile nella vista Tel", () => {
    expect(belongsToPedidos(ordine)).toBe(true);
  });

  test("non visibile nella vista Barra", () => {
    expect(inBarraList(ordine)).toBe(false);
  });

  test("contatore Tel +1", () => {
    const prima = [];
    expect(telCounter([...prima, ordine])).toBe(telCounter(prima) + 1);
  });

  test("non incrementa il contatore Barra", () => {
    expect(barraCounter([ordine])).toBe(0);
  });

  test("auto-switch sul tab Tel", () => {
    expect(tabAfterCreation(ordine.canal)).toBe("manual");
  });
});

// ── C ─────────────────────────────────────────────────────────────────────
describe("C — BANCO: persistenza, lista, contatore, auto-switch", () => {
  const ordine = nuevoPedido(openModalCanal("banco", null));

  test("persistenza = BANCO", () => {
    expect(ordine.canal).toBe("BANCO");
  });

  test("visibile nella vista Barra", () => {
    expect(inBarraList(ordine)).toBe(true);
  });

  test("NON visibile nella vista Tel", () => {
    expect(belongsToPedidos(ordine)).toBe(false);
  });

  test("contatore Barra +1", () => {
    const prima = [];
    expect(barraCounter([...prima, ordine])).toBe(barraCounter(prima) + 1);
  });

  test("non incrementa il contatore Tel", () => {
    expect(telCounter([ordine])).toBe(0);
  });

  test("auto-switch sul tab Barra", () => {
    expect(tabAfterCreation(ordine.canal)).toBe("banco");
  });
});

// ── D ─────────────────────────────────────────────────────────────────────
describe("D — MANUAL legacy resta visibile e contato nel tab Tel", () => {
  const legacyManual = { canal: "MANUAL", wa_id: "", estado: POR_CONFIRMAR };
  const legacyVuoto = { canal: "", wa_id: "", estado: POR_CONFIRMAR };
  const legacyAssente = { wa_id: "", estado: POR_CONFIRMAR };

  test("MANUAL legacy appartiene alla vista Tel", () => {
    expect(belongsToPedidos(legacyManual)).toBe(true);
  });

  test("canal vuoto / assente legacy appartiene alla vista Tel", () => {
    expect(belongsToPedidos(legacyVuoto)).toBe(true);
    expect(belongsToPedidos(legacyAssente)).toBe(true);
  });

  test("il contatore Tel li conta insieme ai TEL nuovi", () => {
    const ordenes = [
      { canal: "TEL", wa_id: "", estado: POR_CONFIRMAR },
      legacyManual,
      legacyVuoto,
      { canal: "BANCO", wa_id: "", estado: POR_CONFIRMAR },              // Barra
      { canal: "WA", wa_id: "34600111222", estado: POR_CONFIRMAR },      // bot
      { canal: "TEL", wa_id: "", estado: EN_COCINA },                    // già in cucina
    ];
    expect(telCounter(ordenes)).toBe(3);
    expect(barraCounter(ordenes)).toBe(1);
  });

  test("un MANUAL legacy, se mai ricomparisse, porta sul tab Tel", () => {
    expect(tabAfterCreation("MANUAL")).toBe("manual");
  });
});

// ── E ─────────────────────────────────────────────────────────────────────
describe("E — WA non è più producibile da Nuevo Pedido, il bot resta invariato", () => {
  test("nessuno stato del modal può produrre canal=WA", () => {
    ["WA", "BARRA", "whatsapp", "", null, undefined, "QUALSIASI"].forEach(v => {
      expect(persistCanal(v)).not.toBe("WA");
      expect(persistCanal(v)).not.toBe("MANUAL");
      expect(["TEL", "BANCO"]).toContain(persistCanal(v));
    });
  });

  test("il payload del modal non scrive mai wa_id", () => {
    expect(modalSrc).toMatch(/wa_id:\s*""/);
    expect(modalSrc).not.toMatch(/wa_id:\s*canal === "WA"/);
  });

  test("la regola di visibilità del flusso bot è invariata", () => {
    expect(belongsToPedidos({ canal: "WA", wa_id: "34600111222" })).toBe(false);
    expect(belongsToPedidos({ canal: "WA", wa_id: "" })).toBe(true); // orfano #014
    expect(isWaSinConversacion({ canal: "WA", wa_id: "" })).toBe(true);
    expect(isWaOrigen({ canal: "WA", wa_id: "34600111222" })).toBe(true);
  });

  test("TabWA non ragiona su canal (disegna da wa_msgs)", () => {
    expect(tabWaSrc).not.toMatch(/\bcanal\b/);
  });

  test("i produttori di canal=WA restano solo i percorsi bot", () => {
    const waProducers = [...servicioSrc.matchAll(/canal:\s*"WA"/g)].length;
    expect(waProducers).toBe(2); // waConfirm (~430) e crea-da-chat zona manuale (~897)
  });
});

// ── F ─────────────────────────────────────────────────────────────────────
describe("F — sequenza TEL, BANCO, TEL, BANCO, TEL", () => {
  test("produce esattamente la stessa sequenza, senza MANUAL / BARRA / WA", () => {
    const voluto = ["TEL", "BANCO", "TEL", "BANCO", "TEL"];
    let tab = "wa"; // ServicioPage parte da useState("wa")
    const ottenuto = [];

    voluto.forEach(origine => {
      // L'operatore clicca l'origine che vuole; il prefill dipende dal tab corrente.
      const canalState = openModalCanal(tab, origine);
      const canal = persistCanal(canalState);
      ottenuto.push(canal);
      tab = tabAfterCreation(canal);
    });

    expect(ottenuto).toEqual(voluto);
    expect(ottenuto).not.toContain("MANUAL");
    expect(ottenuto).not.toContain("BARRA");
    expect(ottenuto).not.toContain("WA");
  });

  test("ogni ordine della sequenza atterra sul tab giusto", () => {
    let tab = "wa";
    const tabs = ["TEL", "BANCO", "TEL", "BANCO", "TEL"].map(origine => {
      const canal = persistCanal(openModalCanal(tab, origine));
      tab = tabAfterCreation(canal);
      return tab;
    });
    expect(tabs).toEqual(["manual", "banco", "manual", "banco", "manual"]);
  });

  test("i contatori restano allineati alla sequenza", () => {
    let tab = "wa";
    const ordenes = ["TEL", "BANCO", "TEL", "BANCO", "TEL"].map(origine => {
      const o = nuevoPedido(openModalCanal(tab, origine));
      tab = tabAfterCreation(o.canal);
      return o;
    });
    expect(telCounter(ordenes)).toBe(3);
    expect(barraCounter(ordenes)).toBe(2);
  });
});

// ── G ─────────────────────────────────────────────────────────────────────
describe("G — dopo un BANCO il TEL successivo non eredita stato errato", () => {
  test("col tab su banco, il click esplicito su Teléfono vince sul prefill", () => {
    expect(persistCanal(openModalCanal("banco", "TEL"))).toBe("TEL");
  });

  test("tornando sul tab Tel, il modal riparte da TEL senza click", () => {
    expect(persistCanal(openModalCanal("manual", null))).toBe("TEL");
  });

  test("il prefill del tab banco è un id valido, non il vecchio BARRA", () => {
    expect(PREFILL_WHEN_TAB_BANCO).toBe("BANCO");
    expect(MODAL_OPTION_IDS).toContain(PREFILL_WHEN_TAB_BANCO);
  });

  test("nessun residuo BANCO dopo due TEL consecutivi creati dal tab Tel", () => {
    let tab = "banco";
    const o1 = nuevoPedido(openModalCanal(tab, "TEL"));
    tab = tabAfterCreation(o1.canal);
    const o2 = nuevoPedido(openModalCanal(tab, null));
    expect([o1.canal, o2.canal]).toEqual(["TEL", "TEL"]);
  });
});

// ── Label operative ───────────────────────────────────────────────────────
describe("Label — tre origini distinte, nessun BANCO mostrato come Tel", () => {
  test("TabListos distingue WA / BANCO / TEL", () => {
    expect(tabListosSrc).toMatch(
      /o\.canal==="WA" \? "💬 WA" : o\.canal==="BANCO" \? "🏪 Barra" : "📞 Tel"/
    );
  });

  test("la lista Tel e il suo contatore usano la stessa funzione, senza logica duplicata", () => {
    expect(tabManualSrc).toMatch(/ordenes\.filter\(belongsToPedidos\)/);
    expect(servicioSrc).toMatch(/import \{ belongsToPedidos \} from '\.\.\/utils\/pedidosVisibility'/);
  });
});
