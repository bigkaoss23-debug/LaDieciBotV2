/**
 * [EXTRA-PRICE-GHOST 2026-10-03] Regressione: il prezzo di una riga con extra è
 *   p = BASE + Σ extra (chip)
 * e NON dipende da quante volte l'operatore apre/chiude/modifica il modal.
 *
 * Caso reale: ticket fisico "Divino Codino 16,50 € + Salami Napoli + Atún" quando
 * catalogo = 12,50 + 1,00 + 1,00 = 14,50 € (+2,00 € fantasma).
 *
 * Causa (riprodotta su f59229c con i componenti reali, vedi report):
 *   RC1  p mutato in modo incrementale da tre editor indipendenti;
 *   RC2  il campo libero "Variaciones" riscriveva `sub` senza toccare `p`;
 *   RC3  tre implementazioni non equivalenti (ItemPicker / Modifica / WADettaglio);
 *   RC4  il tasto + della riga clonava `p` già gonfiato con `sub` vuoto; merge per `id`
 *        dentro righe con extra; `adj` di Modifica per `id` (agiva su tutte le righe).
 *
 * Qui: contratto puro di menu/itemExtras + scenari con ItemPickerModal, ModificaOrdenModal,
 * NuevoPedidoModal REALI (react-dom + act, api mockata), ticket cliente incluso.
 */
import fs from "fs";
import path from "path";
import {
  React, mountEl, unmountAll, click, buttons, btnMatch, btnExact, typeInto, r2, catalog, rowTrace, extrasSum,
  pickerCardClick, pickerRows, readPickerRow, pickerFooterTotal, pickerRowPlus, pickerRowMinus, pickerRowAddExtra,
  pickerRowSetVariaciones, pickerRowRemoveExtraChip, pickerConfirm,
  modRows, readModRow, modTotal, modRowPlus, modRowMinus, modRowSetVariaciones, modRowAddExtra, modRowRemoveExtra, modGridTap, modSave,
  MENU, INGREDIENTI, EXTRAS_DULCES, findExtra,
} from "./extraPriceGhostHarness";

jest.mock("../api", () => ({
  api: {
    previewDeliveryV1: jest.fn(),
    resolveAddress: jest.fn(),
    getClientes: jest.fn().mockResolvedValue([]),
    getClientePorTel: jest.fn().mockResolvedValue(null),
    upsertCliente: jest.fn().mockResolvedValue(null),
    previewOrderTiming: jest.fn().mockResolvedValue(null),
    getManualGiros: jest.fn(() => Promise.resolve([])),
    post: jest.fn(() => Promise.resolve({})),
  },
  sb: {},
  auth: { getToken: () => "t", isAuthenticated: () => true },
}));
jest.mock("../sounds", () => ({ __esModule: true, default: { campanellaDieci: jest.fn(), preload: jest.fn() } }));

/* eslint-disable import/first */
import ItemPickerModal from "../components/ItemPickerModal";
import ModificaOrdenModal from "../components/ModificaOrdenModal";
import NuevoPedidoModal from "../components/NuevoPedidoModal";
import {
  splitSub, buildSub, getItemExtras, getItemNote, extrasPrice, basePriceOf,
  addItemExtra, removeItemExtra, setItemNote, cloneBasePrice, isBareCatalogLine, catalogEntry,
} from "../menu/itemExtras";
import { createCustomerTicket } from "../printing/createCustomerTicket";
import { getPrintFixture } from "../printing/fixtures/orders";
import { ticketDocumentToPlainText } from "../printing/renderTicketDocument";
/* eslint-enable import/first */

afterEach(() => unmountAll());

const SRC = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");

const SALAMI = "Salami Napoli";
const ATUN = "Atún";
const DIVINO = { id: 6, n: "Divino Codino", e: "🍖", cat: "Pizzas" };
const GLADIATORE = { id: 11, n: "Il Gladiatore", e: "⚔️", cat: "Pizzas" };
const LABEL = { 6: "PROSCIUTTO", 11: "CAPRICCIOSA" }; // etichetta primaria della card nel picker
const ing = (n) => findExtra(n);
const orden = (items, extra = {}) => ({ id: "#T01", nombre: "ZZTEST", tel: "", estado: "NUEVO", tipo_consegna: "RITIRO", items, nota: "", hora: "21:00", ...extra });
const line = (base, q, sub, p) => ({ ...base, p, q, sub });

// ───────────────────────────────────────────────────────────────────────────
// 1. Contratto puro: menu/itemExtras
// ───────────────────────────────────────────────────────────────────────────
describe("menu/itemExtras — contratto puro", () => {
  test("splitSub: extra riconosciuti (esatti) e nota; il resto è nota verbatim", () => {
    expect(splitSub("")).toMatchObject({ extras: [], note: "" });
    expect(splitSub("+Salami Napoli, +Atún")).toMatchObject({ extras: [SALAMI, ATUN], note: "" });
    expect(splitSub("+Salami Napoli, +Atún, sin cebolla ")).toMatchObject({ extras: [SALAMI, ATUN], note: "sin cebolla " });
    expect(splitSub("sin cebolla")).toMatchObject({ extras: [], note: "sin cebolla" });
  });

  test("sub legacy con nota PRIMA dell'extra: extra riconosciuto, nota normalizzata", () => {
    const s = splitSub("sin cebolla, +Atún");
    expect(s.extras).toEqual([ATUN]);
    expect(s.note).toBe("sin cebolla");
  });

  test("testo libero ATTACCATO al token (uso reale degli operatori) è nota, non extra", () => {
    // "+Cebolla morada PICANTE": il prezzo era già stato pagato col bottone; non va rimborsato.
    const s = splitSub("+Cebolla morada PICANTE");
    expect(s.extras).toEqual([]);
    expect(s.note).toBe("+Cebolla morada PICANTE");
    expect(getItemExtras({ sub: "+Salami picante MITAD, +Atún" })).toEqual([ATUN]);
  });

  test("nomi del catalogo precedente al 17/09 (es. «Champiñones frescos») non sono extra", () => {
    expect(getItemExtras({ sub: "+Champiñones frescos" })).toEqual([]);
  });

  test("testo generato di una Pizza a tu gusto non produce extra", () => {
    const sub = "Base Pelusa + Prosciutto crudo (Jamón serrano), Coppa";
    expect(getItemExtras({ sub })).toEqual([]);
    expect(getItemNote({ sub })).toBe(sub);
  });

  test("buildSub / splitSub fanno round-trip sulla forma canonica", () => {
    const sub = buildSub([SALAMI, ATUN, ATUN], "sin cebolla");
    expect(sub).toBe("+Salami Napoli, +Atún, +Atún, sin cebolla");
    expect(splitSub(sub)).toMatchObject({ extras: [SALAMI, ATUN, ATUN], note: "sin cebolla" });
    expect(buildSub([], "solo nota")).toBe("solo nota");
    expect(buildSub([ATUN], "")).toBe("+Atún");
  });

  test("addItemExtra / removeItemExtra muovono p e sub insieme, una volta", () => {
    let it = { ...DIVINO, p: 12.5, q: 1, sub: "" };
    it = addItemExtra(it, ing(SALAMI));
    expect(it).toMatchObject({ p: 13.5, sub: "+Salami Napoli" });
    it = addItemExtra(it, ing(ATUN));
    expect(it).toMatchObject({ p: 14.5, sub: "+Salami Napoli, +Atún" });
    it = removeItemExtra(it, SALAMI);
    expect(it).toMatchObject({ p: 13.5, sub: "+Atún" });
    it = removeItemExtra(it, ATUN);
    expect(it).toMatchObject({ p: 12.5, sub: "" });
  });

  test("rimuovere un extra che non c'è non cambia nulla (nessun rimborso fantasma)", () => {
    const it = { ...DIVINO, p: 13.5, q: 1, sub: "+Salami Napoli" };
    expect(removeItemExtra(it, ATUN)).toBe(it);
  });

  test("setItemNote non tocca mai p né gli extra", () => {
    const it = { ...DIVINO, p: 14.5, q: 1, sub: "+Salami Napoli, +Atún" };
    ["", "sin cebolla", "sin cebolla, bien cocida", "x", " "].forEach((t) => {
      const r = setItemNote(it, t);
      expect(r.p).toBe(14.5);
      expect(getItemExtras(r)).toEqual([SALAMI, ATUN]);
    });
  });

  test("una nota non può contenere un extra: «+Atún» digitato a mano perde il +", () => {
    const it = setItemNote({ ...DIVINO, p: 12.5, q: 1, sub: "" }, "+Atún");
    expect(it.p).toBe(12.5);
    expect(getItemExtras(it)).toEqual([]);
    expect(it.sub).toBe("Atún");
    // un «+» non esatto resta com'è (non è un extra e non costa)
    expect(setItemNote(it, "+extra queso").sub).toBe("+extra queso");
  });

  test("la nota digitata è conservata verbatim (spazi finali compresi: campo controllato)", () => {
    let it = addItemExtra({ ...DIVINO, p: 12.5, q: 1, sub: "" }, ing(ATUN));
    it = setItemNote(it, "sin ");
    expect(getItemNote(it)).toBe("sin ");
    it = setItemNote(it, "sin c");
    expect(getItemNote(it)).toBe("sin c");
    expect(it.p).toBe(13.5);
  });

  test("basePriceOf = p − extra riconosciuti; riga legacy gonfiata NON viene ri-prezzata", () => {
    expect(basePriceOf({ p: 14.5, sub: "+Salami Napoli, +Atún" })).toBe(12.5);
    // legacy con +2,00 fantasma: la base derivata assorbe il fantasma, p non cambia
    const legacy = { ...DIVINO, p: 16.5, q: 1, sub: "+Salami Napoli, +Atún" };
    expect(basePriceOf(legacy)).toBe(14.5);
    expect(setItemNote(legacy, "x").p).toBe(16.5);
  });

  test("cloneBasePrice: righe nuove dal catalogo, mai dal p gonfiato; custom → base derivata", () => {
    expect(cloneBasePrice({ ...DIVINO, p: 16.5, sub: "+Salami Napoli, +Atún" })).toBe(12.5);
    expect(cloneBasePrice({ id: "custom_1", p: 15, sub: "Base Pelusa + Coppa" })).toBe(15);
  });

  test("isBareCatalogLine: solo il prodotto nudo al prezzo di catalogo è bersaglio di merge", () => {
    expect(isBareCatalogLine({ ...DIVINO, p: 12.5, sub: "" })).toBe(true);
    expect(isBareCatalogLine({ ...DIVINO, p: 14.5, sub: "+Salami Napoli, +Atún" })).toBe(false);
    expect(isBareCatalogLine({ ...DIVINO, p: 13.5, sub: "" })).toBe(false); // riga legacy con p gonfiato
    expect(isBareCatalogLine({ ...DIVINO, p: 12.5, sub: "sin cebolla" })).toBe(false);
    expect(isBareCatalogLine({ id: "custom_1", p: 12, sub: "" })).toBe(false);
  });

  // ── Proprietà: QUALSIASI pizza × QUALSIASI extra ──────────────────────────
  const pizzas = MENU.filter((m) => m.cat === "Pizzas" || m.dulce);
  const extrasFor = (m) => (m.dulce ? EXTRAS_DULCES : INGREDIENTI.filter((i) => i.tipo !== "base"));

  test("per ogni pizza e ogni extra: base + extra = prezzo esatto, e toglierlo torna alla base", () => {
    let combos = 0;
    pizzas.forEach((m) => extrasFor(m).forEach((e) => {
      const it = addItemExtra({ ...m, q: 1, sub: "" }, e);
      expect(it.p).toBe(r2(m.p + e.prezzo));
      expect(removeItemExtra(it, e.n).p).toBe(m.p);
      combos++;
    }));
    expect(combos).toBeGreaterThan(300);
  });

  test("per ogni pizza e ogni coppia di extra: somma esatta, ordine irrilevante", () => {
    const m = catalog(6);
    const all = INGREDIENTI.filter((i) => i.tipo !== "base");
    all.forEach((a) => all.forEach((b) => {
      const ab = addItemExtra(addItemExtra({ ...m, q: 1, sub: "" }, a), b);
      const ba = addItemExtra(addItemExtra({ ...m, q: 1, sub: "" }, b), a);
      expect(ab.p).toBe(r2(m.p + a.prezzo + b.prezzo));
      expect(ba.p).toBe(ab.p);
    }));
  });

  test("sequenze casuali (add/remove/nota/clone/apri-salva): p = base + Σ extra, sempre", () => {
    // PRNG deterministico (mulberry32): il test è riproducibile.
    let seed = 20261003;
    const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const salati = INGREDIENTI.filter((i) => i.tipo !== "base");
    const notes = ["", "sin cebolla", "bien cocida, cortar en 4", "+Atún", "+extra queso", "MITAD ", "x"];
    for (let run = 0; run < 400; run++) {
      const m = pick(pizzas.filter((x) => !x.dulce));
      let it = { ...m, q: 1, sub: "" };
      const base = m.p;
      for (let step = 0; step < 25; step++) {
        const op = Math.floor(rnd() * 5);
        if (op === 0) it = addItemExtra(it, pick(salati));
        else if (op === 1) it = removeItemExtra(it, pick(getItemExtras(it).concat(["Coppa"])));
        else if (op === 2) it = setItemNote(it, pick(notes));
        else if (op === 3) it = { ...it }; // apri → salva: identità
        else { // tasto +: riga nuova dal catalogo, mai dalla riga corrente
          const clone = { ...it, p: cloneBasePrice(it), q: 1, sub: "" };
          expect(clone.p).toBe(base);
        }
        expect(it.p).toBe(r2(base + extrasPrice(getItemExtras(it))));
        expect(basePriceOf(it)).toBe(base);
        expect(it.p).toBeGreaterThanOrEqual(base - 1e-9);
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. ItemPickerModal — scenari della forense (A..H) + minime sequenze fantasma
// ───────────────────────────────────────────────────────────────────────────
describe("ItemPickerModal — il prezzo segue gli extra", () => {
  const openCart = (onAdd = jest.fn()) => mountEl(<ItemPickerModal visible onClose={() => {}} onAdd={onAdd} onUpdate={() => {}} />);
  const confirmed = (onAdd) => onAdd.mock.calls.map(([it]) => it);

  test("1· Divino 12,50 + Salami Napoli 1 + Atún 1 = 14,50 (carrello e item emesso)", () => {
    const onAdd = jest.fn();
    const el = openCart(onAdd);
    pickerCardClick(el, LABEL[6]);
    pickerRowAddExtra(pickerRows(el)[0], SALAMI);
    pickerRowAddExtra(pickerRows(el)[0], ATUN);
    expect(pickerFooterTotal(el)).toBe(14.5);
    pickerConfirm(el);
    expect(confirmed(onAdd)).toHaveLength(1);
    expect(confirmed(onAdd)[0]).toMatchObject({ id: 6, p: 14.5, q: 1, sub: "+Salami Napoli, +Atún" });
  });

  test("2· open → save ×5 (modalità itemEsistente): stesso item, stesso prezzo", () => {
    let saved = { ...DIVINO, p: 14.5, q: 1, sub: "+Salami Napoli, +Atún", _uid: "u1" };
    const first = saved;
    for (let k = 0; k < 5; k++) {
      const onUpdate = jest.fn();
      const el = mountEl(<ItemPickerModal visible onClose={() => {}} onAdd={() => {}} onUpdate={onUpdate} itemEsistente={saved} />);
      pickerConfirm(el);
      saved = onUpdate.mock.calls[0][0];
      expect(saved).toEqual(first);
      unmountAll();
    }
  });

  test("3· add → remove → add: resta matematicamente corretto", () => {
    const onAdd = jest.fn();
    const el = openCart(onAdd);
    pickerCardClick(el, LABEL[6]);
    pickerRowAddExtra(pickerRows(el)[0], SALAMI);
    pickerRowAddExtra(pickerRows(el)[0], ATUN);
    pickerRowRemoveExtraChip(pickerRows(el)[0], ATUN);
    expect(pickerFooterTotal(el)).toBe(13.5);
    pickerRowAddExtra(pickerRows(el)[0], ATUN);
    expect(pickerFooterTotal(el)).toBe(14.5);
    pickerConfirm(el);
    expect(confirmed(onAdd)[0]).toMatchObject({ p: 14.5, sub: "+Salami Napoli, +Atún" });
  });

  test("4· stesso extra ×2: prezzo, chip e sub coerenti (nessun costo senza token)", () => {
    const onAdd = jest.fn();
    const el = openCart(onAdd);
    pickerCardClick(el, LABEL[6]);
    pickerRowAddExtra(pickerRows(el)[0], SALAMI);
    pickerRowAddExtra(pickerRows(el)[0], SALAMI);
    const r = readPickerRow(pickerRows(el)[0]);
    expect(r.unit).toBe(14.5);
    expect(el.textContent).toContain("Salami Napoli +2.00€"); // chip aggregato ×2
    pickerConfirm(el);
    expect(confirmed(onAdd)[0]).toMatchObject({ p: 14.5, sub: "+Salami Napoli, +Salami Napoli" });
    expect(extrasSum(confirmed(onAdd)[0].sub)).toBe(2);
  });

  test("5a· svuotare «Variaciones» NON toglie gli extra né cambia il prezzo; poi riaggiungere li conta 2×, visibili", () => {
    const onAdd = jest.fn();
    const el = openCart(onAdd);
    pickerCardClick(el, LABEL[6]);
    pickerRowAddExtra(pickerRows(el)[0], SALAMI);
    pickerRowAddExtra(pickerRows(el)[0], ATUN);
    pickerRowSetVariaciones(pickerRows(el)[0], "");
    expect(readPickerRow(pickerRows(el)[0]).unit).toBe(14.5);
    expect(el.textContent).toContain("Salami Napoli +1.00€");
    // riaggiungere gli stessi extra li raddoppia — in modo VISIBILE (chip ×2) e pagato ×2
    pickerRowAddExtra(pickerRows(el)[0], SALAMI);
    pickerRowAddExtra(pickerRows(el)[0], ATUN);
    pickerConfirm(el);
    const it = confirmed(onAdd)[0];
    expect(it.p).toBe(16.5);
    expect(getItemExtras(it)).toEqual([SALAMI, ATUN, SALAMI, ATUN]); // 4 token ⇒ 4 € di extra, nessun fantasma
    expect(it.p).toBe(r2(12.5 + extrasSum(it.sub)));
  });

  test("5b· digitare testo non cambia mai il prezzo; la nota resta nota", () => {
    const onAdd = jest.fn();
    const el = openCart(onAdd);
    pickerCardClick(el, LABEL[6]);
    pickerRowAddExtra(pickerRows(el)[0], ATUN);
    ["s", "si", "sin ", "sin c", "sin cebolla", "sin cebolla, bien cocida"].forEach((t) => {
      pickerRowSetVariaciones(pickerRows(el)[0], t);
      expect(readPickerRow(pickerRows(el)[0]).unit).toBe(13.5);
      expect(pickerRows(el)[0].querySelector("input").value).toBe(t); // campo controllato: nessun carattere mangiato
    });
    pickerConfirm(el);
    expect(confirmed(onAdd)[0]).toMatchObject({ p: 13.5, sub: "+Atún, sin cebolla, bien cocida" });
  });

  test("5c· «+Atún» digitato a mano nella nota non diventa un extra non pagato", () => {
    const onAdd = jest.fn();
    const el = openCart(onAdd);
    pickerCardClick(el, LABEL[6]);
    pickerRowSetVariaciones(pickerRows(el)[0], "+Atún");
    pickerConfirm(el);
    const it = confirmed(onAdd)[0];
    expect(it.p).toBe(12.5);
    expect(getItemExtras(it)).toEqual([]);
  });

  test("5d· riga legacy con testo attaccato al token: apri/modifica nota/salva non cambia p", () => {
    // storico reale: «+Cebolla morada PICANTE» a 15,00 su Gladiatore 14,50 (0,50 già pagati col bottone)
    const legacy = { ...GLADIATORE, p: 15, q: 1, sub: "+Cebolla morada PICANTE", _uid: "u9" };
    const onUpdate = jest.fn();
    const el = mountEl(<ItemPickerModal visible onClose={() => {}} onAdd={() => {}} onUpdate={onUpdate} itemEsistente={legacy} />);
    expect(pickerRows(el)[0].querySelector("input").value).toBe("+Cebolla morada PICANTE");
    pickerRowSetVariaciones(pickerRows(el)[0], "+Cebolla morada PICANTE Y SIN SAL");
    pickerConfirm(el);
    expect(onUpdate.mock.calls[0][0]).toMatchObject({ p: 15, sub: "+Cebolla morada PICANTE Y SIN SAL" });
  });

  test("H′ (sequenza che ha prodotto il ticket) · tasto + sulla riga: la riga nuova è NUDA a 12,50", () => {
    const onAdd = jest.fn();
    const el = openCart(onAdd);
    pickerCardClick(el, LABEL[6]);
    pickerRowAddExtra(pickerRows(el)[0], SALAMI);
    pickerRowAddExtra(pickerRows(el)[0], ATUN);
    pickerRowPlus(pickerRows(el)[0]);
    const [r1, r2row] = pickerRows(el).map(readPickerRow);
    expect(r1.unit).toBe(14.5);
    expect(r2row.unit).toBe(12.5);          // prima: 14,50 con sub vuoto (fantasma +2,00 già qui)
    expect(pickerFooterTotal(el)).toBe(27);  // prima: 29,00
    pickerRowAddExtra(pickerRows(el)[1], SALAMI);
    pickerRowAddExtra(pickerRows(el)[1], ATUN);
    pickerConfirm(el);
    const [a, b] = confirmed(onAdd);
    expect(a.p).toBe(14.5);
    expect(b.p).toBe(14.5);                  // prima: 16,50 con gli stessi due extra visibili
    expect(b.sub).toBe("+Salami Napoli, +Atún");
  });

  test("H′ con extra diversi: la riga clonata non eredita il supplemento della sorella (ordine #007 del 12/06)", () => {
    const onAdd = jest.fn();
    const el = openCart(onAdd);
    pickerCardClick(el, LABEL[6]);
    pickerRowAddExtra(pickerRows(el)[0], ATUN);
    pickerRowPlus(pickerRows(el)[0]);
    pickerRowAddExtra(pickerRows(el)[1], "Cebolla morada");
    pickerConfirm(el);
    const [a, b] = confirmed(onAdd);
    expect(a.p).toBe(13.5);
    expect(b.p).toBe(13); // 12,50 + 0,50 (prima: 13,50 + 0,50 = 14,00)
  });

  test("H· qty 1→2→1 dopo gli extra: prezzo unitario invariato (picker: righe separate, mai merge)", () => {
    const onAdd = jest.fn();
    const el = openCart(onAdd);
    pickerCardClick(el, LABEL[6]);
    pickerRowAddExtra(pickerRows(el)[0], SALAMI);
    pickerRowAddExtra(pickerRows(el)[0], ATUN);
    pickerRowPlus(pickerRows(el)[0]);
    pickerRowMinus(pickerRows(el)[1]);
    expect(pickerRows(el)).toHaveLength(1);
    expect(readPickerRow(pickerRows(el)[0])).toMatchObject({ q: 1, unit: 14.5 });
  });

  test("10· caso storico corretto: Il Gladiatore 14,50 + Atún = 15,50", () => {
    const onAdd = jest.fn();
    const el = openCart(onAdd);
    pickerCardClick(el, LABEL[11]);
    pickerRowAddExtra(pickerRows(el)[0], ATUN);
    pickerConfirm(el);
    expect(confirmed(onAdd)[0]).toMatchObject({ id: 11, p: 15.5, sub: "+Atún" });
  });

  test("11· ogni pizza senza extra: prezzo di catalogo invariato", () => {
    MENU.filter((m) => m.cat === "Pizzas").forEach((m) => {
      const onAdd = jest.fn();
      const el = openCart(onAdd);
      const lbl = (m.sub || "").toUpperCase();
      pickerCardClick(el, lbl);
      pickerConfirm(el);
      expect(confirmed(onAdd)[0]).toMatchObject({ id: m.id, p: m.p, sub: "" });
      unmountAll();
    });
  });

  test("12· extra da 0,50 / 1,00 / 2,00 € e da 0 €: supplemento esatto", () => {
    [["Yema de huevo", 0.5], ["Provola ahumada", 1], ["Coppa", 2], ["Albahaca", 0], ["Grana Padano rallado", 0]].forEach(([n, add]) => {
      const onAdd = jest.fn();
      const el = openCart(onAdd);
      pickerCardClick(el, LABEL[6]);
      pickerRowAddExtra(pickerRows(el)[0], n);
      pickerConfirm(el);
      expect(confirmed(onAdd)[0].p).toBe(r2(12.5 + add));
      unmountAll();
    });
  });

  test("pizza dolce: gli extra dolci seguono lo stesso contratto", () => {
    const onAdd = jest.fn();
    const el = openCart(onAdd);
    click(btnExact(el, "Postres"));
    pickerCardClick(el, "Pizza de Nutella (28cm)");
    pickerRowAddExtra(pickerRows(el)[0], "Kinder");
    pickerRowSetVariaciones(pickerRows(el)[0], "cortar en 4");
    pickerConfirm(el);
    expect(confirmed(onAdd)[0]).toMatchObject({ p: 9.5, sub: "+Kinder, cortar en 4" });
  });

  test("prodotti non-pizza: la nota resta testo libero e non tocca il prezzo", () => {
    const onAdd = jest.fn();
    const el = openCart(onAdd);
    click(btnExact(el, "Bebidas"));
    pickerCardClick(el, "Coca Cola");
    const input = pickerRows(el)[0].querySelector("input");
    typeInto(input, "+Coppa con hielo");
    pickerConfirm(el);
    expect(confirmed(onAdd)[0]).toMatchObject({ p: 2, sub: "+Coppa con hielo" });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. ModificaOrdenModal — stessa invariante + merge/adj per riga
// ───────────────────────────────────────────────────────────────────────────
describe("ModificaOrdenModal — stessa invariante, righe distinte", () => {
  const openMod = (items, onSave = jest.fn(), extra = {}) =>
    mountEl(<ModificaOrdenModal orden={orden(items, extra)} onClose={() => {}} onSave={onSave} />);

  test("1· pizza semplice → +Salami → +Atún → 14,50", () => {
    const onSave = jest.fn();
    const el = openMod([line(DIVINO, 1, "", 12.5)], onSave);
    modRowAddExtra(modRows(el)[0], SALAMI);
    modRowAddExtra(modRows(el)[0], ATUN);
    expect(modTotal(el)).toBe(14.5);
    modSave(el);
    expect(onSave.mock.calls[0][0].items[0]).toMatchObject({ p: 14.5, sub: "+Salami Napoli, +Atún" });
  });

  test("2· apri → salva ×5: identico", () => {
    let o = orden([line(DIVINO, 1, "+Salami Napoli, +Atún", 14.5)]);
    const first = o.items[0];
    for (let k = 0; k < 5; k++) {
      const onSave = jest.fn();
      const el = mountEl(<ModificaOrdenModal orden={o} onClose={() => {}} onSave={onSave} />);
      modSave(el);
      o = onSave.mock.calls[0][0];
      expect(o.items[0]).toEqual(first);
      unmountAll();
    }
  });

  test("5· svuotare «Variaciones» non lascia prezzo fantasma né toglie gli extra", () => {
    const onSave = jest.fn();
    const el = openMod([line(DIVINO, 1, "+Salami Napoli, +Atún", 14.5)], onSave);
    modRowSetVariaciones(modRows(el)[0], "");
    expect(modTotal(el)).toBe(14.5);
    expect(getItemExtras(onSave.mock.calls[0]?.[0]?.items?.[0] || { sub: "+Salami Napoli, +Atún" })).toEqual([SALAMI, ATUN]);
    modRowAddExtra(modRows(el)[0], SALAMI);
    modRowAddExtra(modRows(el)[0], ATUN);
    modSave(el);
    const it = onSave.mock.calls[0][0].items[0];
    expect(it.p).toBe(16.5);
    expect(it.p).toBe(r2(12.5 + extrasSum(it.sub))); // 4 token ⇒ 4 €: prezzo e rappresentazione coincidono
  });

  test("5d· riga legacy con testo attaccato: nessun rimborso/ricarico a apertura e salvataggio", () => {
    const onSave = jest.fn();
    const el = openMod([line(GLADIATORE, 1, "+Salami picante MITAD, +Atún", 16.5)], onSave);
    modSave(el);
    expect(onSave.mock.calls[0][0].items[0]).toMatchObject({ p: 16.5, sub: "+Salami picante MITAD, +Atún" });
  });

  test("6· NuevoPedido (picker reale) → Modifica: ✕ Atún + riaggiungi → riapri: invarianti conservati", async () => {
    const onConfirm = jest.fn();
    const np = mountEl(<NuevoPedidoModal visible onClose={() => {}} onConfirm={onConfirm} ordenes={[]} prefill={{ nombre: "ZZTEST" }} />);
    click(btnMatch(np, /Añadir pizza, bebida o postre/));
    pickerCardClick(np, LABEL[6]);
    pickerRowAddExtra(pickerRows(np)[0], SALAMI);
    pickerRowAddExtra(pickerRows(np)[0], ATUN);
    pickerConfirm(np);
    click(btnMatch(np, /Confirmar pedido/));
    await Promise.resolve();
    const created = onConfirm.mock.calls[0][0];
    expect(created.items[0]).toMatchObject({ p: 14.5, sub: "+Salami Napoli, +Atún" });
    unmountAll();

    const onSave = jest.fn();
    const m = openMod(created.items, onSave);
    modRowRemoveExtra(modRows(m)[0], ATUN);
    expect(modTotal(m)).toBe(13.5);
    modRowAddExtra(modRows(m)[0], ATUN);
    modSave(m);
    const saved = onSave.mock.calls[0][0];
    expect(saved.items[0]).toMatchObject({ p: 14.5, sub: "+Salami Napoli, +Atún" });
    unmountAll();

    const onSave2 = jest.fn();
    const m2 = mountEl(<ModificaOrdenModal orden={saved} onClose={() => {}} onSave={onSave2} />);
    modSave(m2);
    expect(onSave2.mock.calls[0][0].items[0]).toEqual(saved.items[0]);
  });

  test("7· qty 1→2→1: prezzo unitario invariato", () => {
    const onSave = jest.fn();
    const el = openMod([line(DIVINO, 1, "+Salami Napoli, +Atún", 14.5)], onSave);
    modRowPlus(modRows(el)[0]);
    expect(readModRow(modRows(el)[0])).toMatchObject({ q: 2, unit: 14.5 });
    expect(modTotal(el)).toBe(29);
    modRowMinus(modRows(el)[0]);
    expect(readModRow(modRows(el)[0])).toMatchObject({ q: 1, unit: 14.5 });
    expect(modTotal(el)).toBe(14.5);
  });

  test("8· delivery: items 14,50 + consegna 2,50 = 17,00", () => {
    const el = openMod([line(DIVINO, 1, "+Salami Napoli, +Atún", 14.5)], jest.fn(), {
      tipo_consegna: "DOMICILIO", direccion: "Calle Test 1", zona: "Q1",
    });
    expect(modTotal(el)).toBe(17);
  });

  test("tap sulla card di un prodotto già presente CON extra: nuova riga nuda, non merge", () => {
    const onSave = jest.fn();
    const el = openMod([line(DIVINO, 1, "+Salami Napoli, +Atún", 14.5)], onSave);
    modGridTap(el, LABEL[6]);
    expect(modRows(el)).toHaveLength(2);
    expect(modTotal(el)).toBe(27); // 14,50 + 12,50 (prima: q=2 a 14,50 = 29,00)
    modSave(el);
    const [a, b] = onSave.mock.calls[0][0].items;
    expect(a).toMatchObject({ p: 14.5, q: 1 });
    expect(b).toMatchObject({ p: 12.5, q: 1, sub: "" });
  });

  test("tap sulla card di un prodotto nudo: merge (q+1) come prima", () => {
    const el = openMod([line(DIVINO, 1, "", 12.5)]);
    modGridTap(el, LABEL[6]);
    expect(modRows(el)).toHaveLength(1);
    expect(readModRow(modRows(el)[0])).toMatchObject({ q: 2, unit: 12.5 });
  });

  test("tap su riga legacy con p gonfiato e sub vuoto: NON ci si fonde dentro", () => {
    const el = openMod([line(DIVINO, 1, "", 14.5)]);
    modGridTap(el, LABEL[6]);
    expect(modRows(el)).toHaveLength(2);
    expect(modTotal(el)).toBe(27);
  });

  test("+ / − agiscono sulla SOLA riga cliccata, non su tutte quelle con lo stesso id", () => {
    const onSave = jest.fn();
    const el = openMod([line(DIVINO, 1, "+Salami Napoli, +Atún", 14.5), line(DIVINO, 1, "", 12.5)], onSave);
    modRowPlus(modRows(el)[1]);
    expect(modRows(el).map((r) => readModRow(r).q)).toEqual([1, 2]);
    expect(modTotal(el)).toBe(39.5); // prima: 54,00
    modRowMinus(modRows(el)[1]);
    modRowMinus(modRows(el)[1]);
    expect(modRows(el)).toHaveLength(1);
    expect(readModRow(modRows(el)[0])).toMatchObject({ q: 1, unit: 14.5 });
    modSave(el);
    expect(onSave).toHaveBeenCalledTimes(1); // prima: «Salva» disabilitato, entrambe le righe cancellate
  });

  test("nessun avviso React «two children with the same key» con più righe dello stesso prodotto", () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const el = openMod([line(DIVINO, 1, "+Salami Napoli, +Atún", 14.5), line(DIVINO, 1, "", 12.5)]);
    modRowPlus(modRows(el)[0]);
    const keyWarnings = err.mock.calls.filter((c) => /same key/.test(String(c[0])));
    err.mockRestore();
    expect(keyWarnings).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. NuevoPedidoModal — qty e merge sul carrello reale
// ───────────────────────────────────────────────────────────────────────────
describe("NuevoPedidoModal — carrello", () => {
  const cartRows = (el) => Array.from(el.querySelectorAll("div")).filter((d) =>
    d.style.cursor === "pointer" && d.textContent.includes("🗑") &&
    !Array.from(d.querySelectorAll("div")).some((c) => c.style.cursor === "pointer" && c.textContent.includes("🗑")));
  const rowQty = (row) => Number(btnExact(row, "+").previousElementSibling.textContent);
  const rowTotal = (row) => parseFloat(row.textContent.match(/(\d+\.\d{2})€/)[1]);
  const mountNP = () => {
    const onConfirm = jest.fn();
    const el = mountEl(<NuevoPedidoModal visible onClose={() => {}} onConfirm={onConfirm} ordenes={[]} prefill={{ nombre: "ZZTEST" }} />);
    return { el, onConfirm };
  };
  const addViaPicker = (el, fn) => {
    click(btnMatch(el, /Añadir pizza, bebida o postre/));
    pickerCardClick(el, LABEL[6]);
    if (fn) fn();
    pickerConfirm(el);
  };

  test("7· qty 1→2→1 sul carrello: prezzo unitario invariato", () => {
    const { el } = mountNP();
    addViaPicker(el, () => { pickerRowAddExtra(pickerRows(el)[0], SALAMI); pickerRowAddExtra(pickerRows(el)[0], ATUN); });
    let row = cartRows(el)[0];
    expect(rowQty(row)).toBe(1);
    expect(rowTotal(row)).toBe(14.5);
    click(btnExact(row, "+"));
    row = cartRows(el)[0];
    expect(rowQty(row)).toBe(2);
    expect(rowTotal(row)).toBe(29);
    click(btnExact(row, "−"));
    row = cartRows(el)[0];
    expect(rowQty(row)).toBe(1);
    expect(rowTotal(row)).toBe(14.5);
  });

  test("riga con extra riaperta e svuotata la nota + pizza semplice: restano due righe, 14,50 + 12,50", async () => {
    const { el, onConfirm } = mountNP();
    addViaPicker(el, () => { pickerRowAddExtra(pickerRows(el)[0], SALAMI); pickerRowAddExtra(pickerRows(el)[0], ATUN); });
    click(cartRows(el)[0]);                    // riapre la riga nel picker (itemEsistente)
    pickerRowSetVariaciones(pickerRows(el)[0], "");
    pickerConfirm(el);
    addViaPicker(el);                          // + una Divino semplice
    click(btnMatch(el, /Confirmar pedido/));
    await Promise.resolve();
    const items = onConfirm.mock.calls[0][0].items;
    expect(items.map((i) => [i.q, i.p, i.sub])).toEqual([[1, 14.5, "+Salami Napoli, +Atún"], [1, 12.5, ""]]);
    // prima: una riga q=2 a 13,50 con sub vuoto (+2,00 fantasma sul totale)
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Ticket cliente
// ───────────────────────────────────────────────────────────────────────────
describe("ticket cliente", () => {
  test("9· riga item = 14,50 con gli extra visibili (stampa il prezzo salvato, non lo altera)", () => {
    const order = {
      ...getPrintFixture("11").order, id: "#022", totale: 14.5, pricing: { subtotal: 14.5, total: 14.5 },
      items: [{ id: 6, n: "Divino Codino", p: 14.5, q: 1, sub: "+Salami Napoli, +Atún", cat: "Pizzas" }],
    };
    const { document } = createCustomerTicket(order, { createdAt: "2026-10-03T19:05:00.000Z" });
    const text = ticketDocumentToPlainText(document);
    // il ticket usa uno spazio non separabile prima di «€»: \s lo copre
    expect(text).toMatch(/1×\s+Divino Codino\s+14,50\s€/);
    expect(text).toContain("+ Salami Napoli");
    expect(text).toContain("+ Atún");
    expect(text).toMatch(/TOTAL 14,50\s€/);
    expect(text).not.toMatch(/16,50/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. Guardie statiche: nessun consumer ha più la matematica incrementale
// ───────────────────────────────────────────────────────────────────────────
describe("guardie statiche — un solo posto in cui si muovono p e sub degli extra", () => {
  const consumers = ["components/ItemPickerModal.jsx", "components/ModificaOrdenModal.jsx", "components/wa/WADettaglio.jsx"];

  test.each(consumers)("%s usa menu/itemExtras e non ha più p += prezzo / sub += token", (rel) => {
    const src = read(rel);
    expect(src).toMatch(/from '(\.\.\/)+menu\/itemExtras'/);
    expect(src).not.toMatch(/\.p\s*\+\s*ing\.prezzo/);
    expect(src).not.toMatch(/x\.p\s*\+\s*ing\.prezzo/);
    expect(src).not.toMatch(/-\s*ing\.prezzo/);
    expect(src).not.toMatch(/\[\s*(x|prev\[uid\])\.sub\s*,\s*`\+\$\{ing\.n\}`\s*\]/);
    expect(src).not.toMatch(/\.match\(\/\\\+\[\^,\]\+\/g\)/); // niente più regex «+…» ovunque per riconoscere gli extra
  });

  test("il tasto + della riga clona dal catalogo", () => {
    expect(read("components/ItemPickerModal.jsx")).toContain("p: cloneBasePrice(p)");
  });

  test("Modifica: merge solo su righe nude e adj per indice", () => {
    const src = read("components/ModificaOrdenModal.jsx");
    expect(src).toContain("isBareCatalogLine(i)");
    expect(src).toMatch(/const adj = \(idx,d\)/);
    expect(src).not.toMatch(/const adj = \(id,d\)/);
  });

  test("WADettaglio: il merge guarda la riga ESISTENTE, non l'item in arrivo", () => {
    const src = read("components/wa/WADettaglio.jsx");
    expect(src).toContain("isBareCatalogLine(i)");
    expect(src).not.toMatch(/String\(i\.id\) === String\(item\.id\) && !item\.sub\)/);
  });

  test("il catalogo non è stato toccato: stessi prezzi della carta", () => {
    expect(ing(SALAMI).prezzo).toBe(1);
    expect(ing(ATUN).prezzo).toBe(1);
    expect(catalogEntry(6).p).toBe(12.5);
    expect(catalogEntry(11).p).toBe(14.5);
  });
});
