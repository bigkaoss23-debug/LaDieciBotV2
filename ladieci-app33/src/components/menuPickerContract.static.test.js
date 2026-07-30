/**
 * Contratto statico UI del picker e della modifica ordine.
 *
 * Verifica sul SORGENTE (non sul bundle) che le modifiche UI della sessione
 * menu 2026-07-08 (e1b5b08 / 6741e58) siano cablate nei due modali, e che il
 * wiring TicketQuickAction portato dalla linea orfana sia presente.
 */
import fs from "fs";
import path from "path";

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8");

const picker = read("ItemPickerModal.jsx");
const modifica = read("ModificaOrdenModal.jsx");
const servicio = read("ServicioPage.jsx");
const ordenCard = read("ordenes/OrdenCard.jsx");
const tabListos = read("ordenes/TabListos.jsx");
const tabManual = read("ordenes/TabManual.jsx");

describe("ItemPickerModal — contratto menu", () => {
  test("importa i tre helper della sessione menu", () => {
    expect(picker).toMatch(/import\s*{[^}]*pizzaLabel[^}]*}\s*from\s*'\.\.\/constants'/);
    expect(picker).toMatch(/import\s*{[^}]*esDulce[^}]*}\s*from\s*'\.\.\/constants'/);
    expect(picker).toMatch(/import\s*{[^}]*findExtra[^}]*}\s*from\s*'\.\.\/constants'/);
    expect(picker).toMatch(/import\s*{[^}]*EXTRAS_DULCES[^}]*}\s*from\s*'\.\.\/constants'/);
  });

  test("usa pizzaLabel per il titolo della card", () => {
    expect(picker).toContain("const lbl = pizzaLabel(p)");
    expect(picker).toContain("{lbl.primary}");
    expect(picker).toContain("{lbl.secondary}");
  });

  test("badge numero ufficiale reso solo per le pizze, in footer ad altezza fissa", () => {
    expect(picker).toMatch(/\{p\.num\s*&&\s*\(/);
    expect(picker).toContain("Nº {p.num}");
    expect(picker).toMatch(/height:\s*22/);
    expect(picker).toMatch(/borderTop:/);
  });

  test("gerarchia tipografica: classico in grassetto pieno, soprannome corsivo e più piccolo", () => {
    // Stato finale della sessione (6741e58 compatta le card rispetto a e1b5b08):
    // il classico resta il testo dominante via fontWeight 800 + slot ad altezza
    // minima fissa, il soprannome è secondario (corsivo, grigio, corpo minore).
    expect(picker).toMatch(/fontWeight:\s*800[\s\S]{0,400}\{lbl\.primary\}/);
    expect(picker).toMatch(/minHeight:\s*p\.num\s*\?\s*\d+/);
    expect(picker).toMatch(/fontStyle:\s*p\.num\s*\?\s*"italic"\s*:\s*"normal"/);
  });

  test("extra dolci abilitati sulle pizze dessert e sorgente lista condizionale", () => {
    expect(picker).toMatch(/esDulce\(item\)\s*\?\s*EXTRAS_DULCES\s*:\s*INGREDIENTI/);
    expect(picker).toContain("Añadir extra dulce");
  });

  test("prezzo/emoji extra risolti con findExtra (copre anche i dolci)", () => {
    expect(picker).toContain("findExtra(ingName)");
    expect(picker).toContain("findExtra(name)");
    expect(picker).not.toMatch(/INGREDIENTI\.find\(g\s*=>\s*g\.n\s*===/);
  });
});

describe("ModificaOrdenModal — contratto menu", () => {
  test("usa pizzaLabel e badge numero", () => {
    expect(modifica).toContain("const lbl = pizzaLabel(p)");
    expect(modifica).toContain("Nº {p.num}");
  });

  test("extra dolci disponibili anche in modifica ordine", () => {
    expect(modifica).toMatch(/esDulce\(it\)\s*\?\s*EXTRAS_DULCES\s*:\s*INGREDIENTI/);
  });

  test("nessun lookup diretto in INGREDIENTI residuo (riepilogo e rimozione)", () => {
    expect(modifica).not.toMatch(/INGREDIENTI\.find\(g\s*=>\s*g\.n\s*===/);
    expect(modifica).toContain("findExtra(");
  });
});

describe("wiring portato dalla linea orfana", () => {
  test("ServicioPage monta il modal ticket e lo splash, e usa la coda di creazione", () => {
    expect(servicio).toContain("import CustomerTicketPrintModal");
    expect(servicio).toContain("import OperationalSuccessSplash");
    expect(servicio).toContain("useOrderCreationQueue");
    expect(servicio).toContain("{ticketOrder&&<CustomerTicketPrintModal");
    expect(servicio).toContain("{successSplash&&<OperationalSuccessSplash");
  });

  test("ServicioPage conserva la state machine ordini della linea Git", () => {
    expect(servicio).toContain("buildOperatorOrderCreationIntent");
    expect(servicio).toContain("logOrderCreation");
    expect(servicio).toContain("ORDER_STATES.EN_COCINA");
  });

  test("TicketQuickAction cablato nelle card ordine", () => {
    expect(ordenCard).toContain("import TicketQuickAction");
    expect(ordenCard).toContain("<TicketQuickAction");
    expect(tabListos).toContain("import TicketQuickAction");
    expect(tabListos).toContain("<TicketQuickAction");
    expect(tabManual).toContain("onOpenTicket");
  });
});
