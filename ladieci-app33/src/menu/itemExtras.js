// ===============================================================
// itemExtras.js — UNICA sorgente di verità per extra + nota di una riga ordine.
//
// PROBLEMA (hotfix 2026-10-03, "extra price ghost"):
//   `p` e `sub` venivano scritti da tre editor indipendenti (ItemPickerModal,
//   ModificaOrdenModal, WADettaglio) con matematica incrementale (`p += prezzo`,
//   `sub += "+Nome"`), mentre il campo libero "Variaciones" riscriveva `sub` senza
//   toccare `p`. Cancellare/riscrivere il testo lasciava il supplemento nel prezzo
//   ("prezzo fantasma"); il tasto + sulla riga clonava `p` già gonfiato con `sub` vuoto.
//
// CONTRATTO:
//   - Gli EXTRA sono i soli token `+Nome` il cui Nome è ESATTAMENTE una voce del
//     catalogo (findExtra). Si creano/tolgono SOLO con addItemExtra/removeItemExtra,
//     che muovono `p` e `sub` insieme, una volta, per lo stesso importo.
//   - La NOTA è tutto il resto di `sub`. setItemNote NON tocca mai `p`.
//   - Una nota non può contenere un extra: un pezzo "+Nome" esatto digitato a mano
//     perde il "+" (resta testo, non costa e non diventa chip).
//   - Il prezzo base di una riga è DERIVATO: basePriceOf(item) = p − Σ extra riconosciuti.
//     Non viene mai ricalcolato dal catalogo: una riga legacy si apre/salva con lo
//     stesso `p` (idempotente) e non viene ri-prezzata in silenzio.
//   - Una riga NUOVA nasce dal catalogo (catalogLine / cloneBasePrice), mai da `p` altrui.
//
// FORMA DI `sub` (compatibile con Cocina, ticket, backend): "+A, +B, nota libera".
// `sub` resta una stringa; nessun campo nuovo viene persistito.
// Funzioni pure, senza React.
// ===============================================================
import { MENU, findExtra } from "../constants";

const r2 = (n) => Math.round(n * 100) / 100;

// "+Nome" → Nome del catalogo se il pezzo è un extra esatto, altrimenti null.
const extraNameOfPart = (part) => {
  const t = String(part ?? "").trim();
  if (!t.startsWith("+")) return null;
  const ing = findExtra(t.slice(1).trim());
  return ing ? ing.n : null;
};

/**
 * Scompone `sub` in extra riconosciuti (in ordine, con ripetizioni) e nota.
 * Per sub in forma canonica ("+A, +B, nota") la nota è restituita VERBATIM
 * (spazi finali inclusi: serve al campo di testo controllato mentre si digita).
 * Per sub legacy (extra mescolati alla nota) la nota è l'insieme normalizzato
 * degli altri pezzi.
 */
export function splitSub(sub) {
  const raw = String(sub ?? "");
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const extras = [];
  const noteParts = [];
  parts.forEach((p) => {
    const name = extraNameOfPart(p);
    if (name) extras.push(name); else noteParts.push(p);
  });
  if (!extras.length) return { extras, note: raw, noteParts };
  // Forma canonica: i token riconosciuti aprono la stringa → il resto è la nota verbatim.
  const prefix = extras.map((n) => "+" + n).join(", ");
  if (raw.startsWith(prefix)) {
    const rest = raw.slice(prefix.length);
    if (rest === "") return { extras, note: "", noteParts };
    if (rest.startsWith(", ")) return { extras, note: rest.slice(2), noteParts };
  }
  return { extras, note: noteParts.join(", "), noteParts };
}

/** Ricompone `sub` canonico: extra prima, nota verbatim dopo. */
export function buildSub(extras, note) {
  const head = extras.map((n) => "+" + n).join(", ");
  const tail = String(note ?? "");
  if (!head) return tail;
  if (tail.trim() === "") return head;
  return head + ", " + tail;
}

/** Nome degli extra riconosciuti in `sub`, con ripetizioni (es. ["Coppa","Coppa"]). */
export const getItemExtras = (item) => splitSub(item?.sub).extras;

/** Testo della nota da mostrare nel campo "Variaciones". */
export const getItemNote = (item) => splitSub(item?.sub).note;

/** Supplemento totale degli extra riconosciuti (per UNA unità). */
export const extrasPrice = (names) =>
  r2((names || []).reduce((s, n) => s + (findExtra(n)?.prezzo || 0), 0));

/** Prezzo unitario SENZA extra: p − Σ extra riconosciuti. Derivato, non memorizzato. */
export const basePriceOf = (item) => r2((Number(item?.p) || 0) - extrasPrice(getItemExtras(item)));

/** Aggiunge UN extra (voce di catalogo) a una riga: `p` e `sub` insieme, una volta. */
export function addItemExtra(item, ing) {
  const { extras, note } = splitSub(item.sub);
  return {
    ...item,
    p: r2((Number(item.p) || 0) + (Number(ing.prezzo) || 0)),
    sub: buildSub([...extras, ing.n], note),
  };
}

/** Toglie UNA occorrenza dell'extra `name`. Se il token non c'è, la riga resta identica. */
export function removeItemExtra(item, name) {
  const { extras, note } = splitSub(item.sub);
  const i = extras.indexOf(name);
  if (i < 0) return item;
  const next = extras.slice(0, i).concat(extras.slice(i + 1));
  const ing = findExtra(name);
  return {
    ...item,
    p: Math.max(0, r2((Number(item.p) || 0) - (ing ? ing.prezzo : 0))),
    sub: buildSub(next, note),
  };
}

// Un pezzo "+Nome" esatto digitato nella nota perderebbe il "+" (diventerebbe un extra
// non pagato): lo neutralizziamo. Gli altri pezzi, spazi compresi, restano com'erano.
const sanitizeNote = (text) =>
  String(text ?? "").split(",").map((part) => {
    const m = part.match(/^(\s*)\+\s*(.*?)(\s*)$/);
    return m && findExtra(m[2]) ? m[1] + m[2] + m[3] : part;
  }).join(",");

/** Riscrive la nota. NON modifica mai `p` né gli extra. */
export function setItemNote(item, text) {
  const { extras } = splitSub(item.sub);
  return { ...item, sub: buildSub(extras, sanitizeNote(text)) };
}

// ── Righe nuove: sempre dal catalogo ────────────────────────────────────────

/** Voce di catalogo per id (stringa/numero). */
export const catalogEntry = (id) => MENU.find((m) => String(m.id) === String(id)) || null;

/**
 * Prezzo di una riga NUOVA dello stesso prodotto: catalogo se l'id c'è, altrimenti
 * il prezzo base derivato (mai il `p` gonfiato di un'altra riga).
 */
export const cloneBasePrice = (item) => {
  const c = catalogEntry(item?.id);
  return c ? c.p : basePriceOf(item);
};

/**
 * Una riga è "prodotto nudo di catalogo" se non ha né extra né nota e costa
 * esattamente il catalogo. Solo queste righe sono bersaglio valido di un merge (q+1):
 * fonderci dentro un altro prodotto nudo non può cambiare prezzo/configurazione.
 */
export const isBareCatalogLine = (line) => {
  if (!line || String(line.sub ?? "").trim() !== "") return false;
  const c = catalogEntry(line.id);
  return !!c && Number(line.p) === Number(c.p);
};
