/**
 * [HOTFIX 2026-09-22] canal="MANUAL" spurio dopo un ordine Barra.
 *
 * Bug reale osservato in produzione (LIVE evening-soak 2026-09-22): il bottone
 * NUEVO PEDIDO in ServicioPage iniettava `prefill.canal = "BARRA"` quando il tab
 * esterno era "banco". "BARRA" non combacia con nessuno dei tre id di canale
 * validi usati da NuevoPedidoModal ("TEL" | "WA" | "BANCO"), quindi il ternario
 * di persistenza (riga ~309) collassava silenziosamente su "MANUAL" — un ordine
 * telefonico salvato come canale sbagliato, indistinguibile in UI (stesso tab
 * "Tel" mostra sia TEL che MANUAL) ma sbagliato in Economía.
 *
 * `canalTelPersistence.test.js` non l'ha intercettato perché testa solo
 * NuevoPedidoModal.jsx in isolamento (pattern statico sul file), non
 * l'integrazione con ServicioPage.jsx da cui arriva il prefill. Qui i due file
 * vengono letti insieme e i valori REALI estratti dal sorgente (non hardcoded
 * nel test) vengono fatti passare dentro una simulazione fedele delle regole
 * di NuevoPedidoModal (stessi rami, stesse condizioni) e di ServicioPage
 * (switch di tab dopo la creazione, righe ~354-355) per riprodurre la
 * sequenza reale che ha causato il bug.
 *
 * Non è un render DOM: questo repo non ha @testing-library/react installato
 * (vedi package.json — solo react-scripts, nessuna dipendenza di testing).
 * Aggiungerla è una scelta di scope più ampia della patch minima richiesta:
 * se in futuro si vuole un vero render-test, va introdotta esplicitamente.
 */
const fs = require("fs");
const path = require("path");
const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

const servicioSrc = read("components/ServicioPage.jsx");
const modalSrc = read("components/NuevoPedidoModal.jsx");

// ── Estrazione dal sorgente reale (non hardcoded) ──────────────────────────

// Il valore che il bottone NUEVO PEDIDO inietta come prefill.canal quando il
// tab esterno è "banco".
const prefillMatch = servicioSrc.match(
  /setPrefillCliente\(tab===\s*"banco"\s*\?\s*\{canal:\s*"([A-Z]+)"\}\s*:\s*null\)/
);
if (!prefillMatch) {
  throw new Error(
    "Pattern del bottone NUEVO PEDIDO non trovato in ServicioPage.jsx — " +
    "aggiornare la regex di estrazione di questo test insieme al codice."
  );
}
const PREFILL_CANAL_WHEN_TAB_BANCO = prefillMatch[1];

// Gli id di canale realmente riconosciuti dai tab del modal (riga ~849).
const idsMatch = modalSrc.match(
  /\[\{ id: "TEL"[^\]]*id: "BANCO"[^}]*\}\]\.map/
);
if (!idsMatch) {
  throw new Error(
    "Array dei tab canale non trovato in NuevoPedidoModal.jsx — " +
    "aggiornare la regex di estrazione di questo test insieme al codice."
  );
}
const VALID_CANAL_IDS = [...idsMatch[0].matchAll(/id:\s*"([A-Z]+)"/g)].map(m => m[1]);

// La regola di persistenza reale (riga ~309): stesso identico pattern già
// verificato da canalTelPersistence.test.js, qui trasformato in funzione pura
// per poterlo eseguire su valori sintetici.
// [ORIGINE-ORDINI 2026-09-22] Il fallback è TEL, non più MANUAL.
if (!/canal:\s*canal === "BANCO" \? "BANCO" : "TEL"/.test(modalSrc)) {
  throw new Error("Ternario di persistenza canal non trovato/cambiato in NuevoPedidoModal.jsx");
}
function persistCanal(canalState) {
  return canalState === "BANCO" ? "BANCO" : "TEL";
}

// Stato iniziale/di reset di `canal` nel modal (righe ~102 e ~187).
if (!/const \[canal,\s*setCanal\]\s*=\s*useState\("TEL"\)/.test(modalSrc)) {
  throw new Error("Stato iniziale di canal cambiato in NuevoPedidoModal.jsx");
}
const MODAL_DEFAULT_CANAL = "TEL";

// La regola di switch-tab dopo la creazione (ServicioPage, ~riga 354).
// [ORIGINE-ORDINI 2026-09-22] Prima il ramo era su "MANUAL" e per un TEL non
// scattava nulla; ora BANCO → Barra e tutto il resto → Tel.
if (!/if \(o\.canal===\s*"BANCO"\) setTab\("banco"\);\s*\n\s*else setTab\("manual"\);/.test(servicioSrc)) {
  throw new Error("Regola di switch-tab post-creazione cambiata in ServicioPage.jsx");
}
function tabAfterCreation(currentTab, orderCanal) {
  if (orderCanal === "BANCO") return "banco";
  return "manual"; // TEL, e MANUAL legacy, vivono nel tab Tel
}

// ── Simulazione del ciclo di vita del modal per un click su NUEVO PEDIDO ───
// Rispecchia l'effetto di prefill reale (NuevoPedidoModal.jsx riga ~715):
// `if (prefill.canal) setCanal(prefill.canal)`, altrimenti resta il default.
function openModalCanal(externalTab, explicitClick /* "TEL" | "BANCO" | null */) {
  const prefill = externalTab === "banco" ? { canal: PREFILL_CANAL_WHEN_TAB_BANCO } : null;
  let canal = MODAL_DEFAULT_CANAL;
  if (prefill && prefill.canal) canal = prefill.canal;
  if (explicitClick) canal = explicitClick; // operatore clicca esplicitamente un tab
  return canal;
}

describe("Cross-check ServicioPage → NuevoPedidoModal: id di canale coerenti", () => {
  test("il valore iniettato come prefill.canal è uno dei 2 id validi del modal", () => {
    // [ORIGINE-ORDINI 2026-09-22] "WA" non è più un'opzione di Nuevo Pedido.
    expect(VALID_CANAL_IDS).toEqual(["TEL", "BANCO"]);
    expect(VALID_CANAL_IDS).toContain(PREFILL_CANAL_WHEN_TAB_BANCO);
  });

  test("nessuno dei tre tab del modal risulterebbe visivamente selezionato per un id sconosciuto (es. il vecchio 'BARRA')", () => {
    // Riproduce la condizione di rendering reale (riga ~851): `canal === c.id`.
    const UNKNOWN_LEGACY_VALUE = "BARRA";
    const anyTabActive = VALID_CANAL_IDS.some(id => UNKNOWN_LEGACY_VALUE === id);
    expect(anyTabActive).toBe(false); // conferma: con l'id sbagliato, "Teléfono" NON risulterebbe evidenziato
  });
});

describe("CASE 1 — tab esterno = banco al click di NUEVO PEDIDO", () => {
  test("prefill.canal deve essere BANCO valido, mai BARRA, mai un fallback accidentale su MANUAL", () => {
    const canal = openModalCanal("banco", null);
    expect(canal).toBe("BANCO");
    expect(persistCanal(canal)).toBe("BANCO");
    expect(persistCanal(canal)).not.toBe("MANUAL");
  });
});

describe("CASE 2 — dopo un ordine BANCO, l'operatore seleziona esplicitamente TEL", () => {
  test("il payload salvato deve essere canal=TEL", () => {
    const canalDopoPrefillBanco = openModalCanal("banco", null);
    expect(persistCanal(canalDopoPrefillBanco)).toBe("BANCO");

    // L'operatore clicca "Teléfono" nel modal, sovrascrivendo il prefill.
    const canalDopoClickEsplicito = openModalCanal("banco", "TEL");
    expect(persistCanal(canalDopoClickEsplicito)).toBe("TEL");
  });
});

describe("CASE 3 — sequenza TEL → BANCO → TEL: il terzo ordine deve produrre TEL, non MANUAL", () => {
  test("simulazione fedele di 3 ordini consecutivi con lo switch di tab reale", () => {
    let tab = "wa"; // stato iniziale di ServicioPage (useState("wa"))

    // Ordine 1: TEL (nessun click necessario, tab non è "banco")
    const canal1 = openModalCanal(tab, null);
    const persisted1 = persistCanal(canal1);
    expect(persisted1).toBe("TEL");
    tab = tabAfterCreation(tab, persisted1);
    expect(tab).toBe("manual"); // [ORIGINE-ORDINI] ora un TEL porta sul tab Tel

    // Ordine 2: BANCO (operatore clicca esplicitamente "Barra" nel modal)
    const canal2 = openModalCanal(tab, "BANCO");
    const persisted2 = persistCanal(canal2);
    expect(persisted2).toBe("BANCO");
    tab = tabAfterCreation(tab, persisted2);
    expect(tab).toBe("banco"); // precondizione esatta che ha causato il bug originale

    // Ordine 3: TEL, aperto mentre il tab esterno è ancora "banco" — qui il
    // vecchio bug avrebbe prodotto MANUAL anche con click esplicito su TEL,
    // perché il prefill scriveva "BARRA" PRIMA che l'operatore potesse
    // correggerlo con lo stato "TEL" — il fix garantisce che il click
    // esplicito vinca comunque, e che pure senza click il prefill sia già
    // un id valido.
    const canal3 = openModalCanal(tab, "TEL");
    const persisted3 = persistCanal(canal3);
    expect(persisted3).toBe("TEL");
    expect(persisted3).not.toBe("MANUAL");
  });
});
