// Test statico mirato — S2-7D4D: contratto di EMISSIONE dell'ItemPickerModal
// Standalone: `node pickerEmissionContract.static.test.mjs`
//
// Il carrello interno usa una shape "legacy di lavoro" volutamente lossy:
//   `sub` = "+Extra, nota libera"   (non porta prezzo né chiave dell'extra,
//                                    e non distingue supplemento da nota)
//   `p`   = prezzo unitario GIÀ comprensivo degli extra
//   `sub` di catalogo = nome CLASSICO, ma viene sovrascritto dal carrello
//
// Senza il boundary di emissione, l'item consegnato al backend perdeva
// nome classico, prezzo base e TUTTI i prezzi degli extra (verificato contro il
// normalizer reale eef89b1: classicName="El Pelusa", baseUnitPrice=12.5,
// extrasUnitTotal=0). Queste asserzioni impediscono la regressione.
//
// buildEmittedItem è una closure dentro un componente React: non è importabile,
// quindi il contratto è verificato staticamente sul sorgente.

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
const picker = readFileSync(join(SRC, "components", "ItemPickerModal.jsx"), "utf8");
const codeOnly = picker.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

let pass = 0, fail = 0;
const ck = (label, fn) => {
  try { fn(); pass++; console.log("  ✓", label); }
  catch (e) { fail++; console.log("  ✗", label, "—", e.message); }
};

console.log("\n══ ItemPicker — contratto di emissione (static) ══");

ck("increment() cattura identità e prezzo base prima che il carrello li sovrascriva", () => {
  assert.ok(/classicName: p\.sub \|\| ""/.test(codeOnly), "classicName da p.sub (nome classico)");
  assert.ok(/fantasyName: p\.n \|\| ""/.test(codeOnly), "fantasyName da p.n");
  assert.ok(/baseUnitPrice: Number\(p\.p\) \|\| 0/.test(codeOnly), "baseUnitPrice = prezzo PRIMA degli extra");
});

ck("esiste un unico boundary di emissione", () => {
  assert.ok(/const buildEmittedItem = \(item\) => \{/.test(codeOnly), "buildEmittedItem definito");
});

ck("ENTRAMBE le uscite (add e update) passano dal boundary", () => {
  assert.ok(/onAdd\(buildEmittedItem\(item\)\)/.test(codeOnly), "onAdd");
  assert.ok(/onUpdate\(buildEmittedItem\(cartItems\[0\]\)\)/.test(codeOnly), "onUpdate");
  assert.ok(!/onAdd\(item\)\s*\)/.test(codeOnly), "nessuna emissione grezza residua");
});

ck("gli extra emessi sono STRUTTURATI (key, name, price, emoji, quantity)", () => {
  const b = /const buildEmittedItem[\s\S]*?\n  \};/.exec(codeOnly);
  assert.ok(b, "corpo di buildEmittedItem");
  const body = b[0];
  assert.ok(/resolveExtra\(name\)/.test(body), "prezzo/chiave risolti dal catalogo attivo");
  for (const f of ["key:", "name,", "price:", "emoji:", "quantity,"]) {
    assert.ok(body.includes(f), `campo ${f} presente`);
  }
});

ck("la nota libera finisce in `notes`, non fra gli extra", () => {
  const b = /const buildEmittedItem[\s\S]*?\n  \};/.exec(codeOnly)[0];
  assert.ok(/splitSub\(item\.sub\)/.test(b), "usa splitSub per separare extra e nota");
  assert.ok(/notes: note \|\| ""/.test(b), "notes = solo la parte non-'+'");
});

ck("baseUnitPrice ha un fallback per l'item aperto in modifica", () => {
  const b = /const buildEmittedItem[\s\S]*?\n  \};/.exec(codeOnly)[0];
  assert.ok(/item\.baseUnitPrice != null/.test(b), "preferisce il valore catturato");
  assert.ok(/Number\(item\.p\) - extrasUnit/.test(b), "altrimenti finale − extra");
});

// S2-7D4D-FIX1 — esiste un controllo di rimozione vero, quindi il campo ORA si
// emette. Resta vietato DEDURLO dal testo della nota.
ck("removedIngredients viene emesso, copiato dalla selezione esplicita", () => {
  const b = /const buildEmittedItem[\s\S]*?\n  \};/.exec(codeOnly)[0];
  assert.ok(/removedIngredients: Array\.isArray\(item\.removedIngredients\)/.test(b),
    "copiato dall'item, non sintetizzato");
  assert.ok(/\.slice\(\)/.test(b), "copia difensiva");
});

ck("removedIngredients NON viene dedotto dalla nota", () => {
  const b = /const buildEmittedItem[\s\S]*?\n  \};/.exec(codeOnly)[0];
  // la nota non deve comparire nella derivazione delle rimozioni
  assert.ok(!/removedIngredients:[^\n]*note/.test(b), "nessun legame con `note`");
  assert.ok(!/sin\s/i.test(b), "nessun parsing di 'sin ...'");
});

ck("il picker offre una selezione di rimozione basata su ingredientesBase", () => {
  assert.ok(/const baseIngredientsOf = \(item\) =>/.test(codeOnly), "sorgente ingredienti base");
  assert.ok(/item\.ingredientesBase/.test(codeOnly), "usa il campo strutturato");
  assert.ok(/const toggleRemoved = \(uid, ingName\) =>/.test(codeOnly), "toggle presente");
  assert.ok(/data-testid="remove-ingredient-chip"/.test(codeOnly), "chip renderizzati");
});

ck("una rimozione non tocca prezzo né `sub`", () => {
  const t = /const toggleRemoved[\s\S]*?\n  \};/.exec(codeOnly);
  assert.ok(t, "corpo di toggleRemoved");
  assert.ok(!/\bp:/.test(t[0]), "non modifica il prezzo");
  assert.ok(!/\bsub:/.test(t[0]), "non modifica sub");
});

ck("il placeholder della nota non insegna più 'sin cebolla' come nota", () => {
  assert.ok(!/sin cebolla/i.test(codeOnly), "esempio rimosso dal placeholder");
});

ck("l'emissione è ADDITIVA: i campi legacy non vengono riscritti", () => {
  const b = /const buildEmittedItem[\s\S]*?\n  \};/.exec(codeOnly)[0];
  assert.ok(/\.\.\.item,/.test(b), "spread dell'item originale");
  for (const legacy of ["id:", "n:", "p:", "q:", "cat:", "sub:"]) {
    assert.ok(!new RegExp(`^\\s*${legacy.replace(":", "")}:`, "m").test(b),
      `il campo legacy ${legacy} non deve essere riscritto`);
  }
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
