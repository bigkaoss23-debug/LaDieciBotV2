// Test statico mirato — S2-7D4D COCINA: EXTRAS vs NOTA
// Standalone: `node cocinaExtrasNoteSeparation.static.test.mjs`
//
// Il fix portato da 9f07a6a separa due concetti che la linea Auth V2 aveva
// fusi in un unico badge arancione `⚠ {it.sub}`:
//   EXTRAS = supplementi (chip arancione, SENZA prefisso "+")
//   NOTA   = messaggio manuale dell'operatore (riga rossa separata "📝 NOTA:")
// Inoltre, nel blocco Bebidas/Postres, la nota NON deve più sostituire il nome
// del prodotto (`it.sub ? it.sub : nome` nascondeva cosa mettere nel sacchetto).
//
// Asserzioni sul markup reale, non sui commenti.

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COCINA = join(dirname(HERE), "cocina");
const tab = readFileSync(join(COCINA, "TabCocina.jsx"), "utf8");
const panel = readFileSync(join(COCINA, "PanelCocina.jsx"), "utf8");

// Il markup, senza le righe di commento: le asserzioni "assente" non devono
// essere soddisfatte/violate da un commento che cita il vecchio pattern.
const codeOnly = (src) =>
  src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

let pass = 0, fail = 0;
const ck = (label, fn) => {
  try { fn(); pass++; console.log("  ✓", label); }
  catch (e) { fail++; console.log("  ✗", label, "—", e.message); }
};

console.log("\n══ COCINA — EXTRAS / NOTA separati (static) ══");

for (const [name, raw] of [["TabCocina", tab], ["PanelCocina", panel]]) {
  const src = codeOnly(raw);

  ck(`${name}: importa i due helper di display`, () => {
    assert.ok(
      /import\s*\{[^}]*formatItemExtrasLabel[^}]*resolveItemNote[^}]*\}\s*from\s*['"]\.\.\/\.\.\/menu\/itemDisplay['"]/.test(src),
      "import { formatItemExtrasLabel, resolveItemNote } from '../../menu/itemDisplay'"
    );
  });

  ck(`${name}: deriva extrasLabel e notaItem per l'item`, () => {
    assert.ok(/const extrasLabel\s*=\s*formatItemExtrasLabel\(it\)/.test(src), "extrasLabel");
    assert.ok(/const notaItem\s*=\s*resolveItemNote\(it\)/.test(src), "notaItem");
  });

  ck(`${name}: nessun badge misto \`⚠ {it.sub}\` residuo`, () => {
    assert.ok(!/const varSub\s*=/.test(src), "varSub non deve più esistere");
    assert.ok(!/⚠\s*\{(formatSub\()?varSub/.test(src), "badge ⚠ varSub rimosso");
  });

  ck(`${name}: chip EXTRAS arancione senza prefisso "+"`, () => {
    const chip = /\{extrasLabel && \(([\s\S]{0,700}?)\)\}/.exec(src);
    assert.ok(chip, "blocco {extrasLabel && (...)}");
    assert.ok(/#FF6B00/.test(chip[1]), "resta arancione #FF6B00");
    // il valore è reso nudo: nessun "+" né "⚠" incollato davanti
    assert.ok(/>\s*\{extrasLabel\}\s*</.test(chip[1]), "reso come {extrasLabel} nudo");
    assert.ok(!/\+\s*\{extrasLabel\}/.test(chip[1]), "nessun prefisso +");
  });

  ck(`${name}: riga NOTA separata, rossa, con marcatore`, () => {
    const nota = /\{notaItem && \(([\s\S]{0,500}?)\)\}/.exec(src);
    assert.ok(nota, "blocco {notaItem && (...)}");
    assert.ok(/#DC2626/.test(nota[1]), "outline rosso #DC2626");
    assert.ok(/📝 NOTA: \{notaItem\}/.test(nota[1]), "marcatore 📝 NOTA:");
    assert.ok(/wordBreak:"break-word"/.test(nota[1]), "la nota lunga va a capo");
  });

  ck(`${name}: Bebidas/Postres — la nota NON sostituisce il nome prodotto`, () => {
    assert.ok(
      !/\{varSub \? varSub : `\$\{nomeProdotto\}\$\{sizeInfo\}`\}/.test(src),
      "pattern sostitutivo rimosso"
    );
    assert.ok(
      /\{`\$\{nomeProdotto\}\$\{sizeInfo\}`\}/.test(src),
      "il nome prodotto è sempre reso"
    );
  });
}

// formatSub restava una seconda sorgente di verità per gli extra: teneva il "+"
// e non distingueva la nota. Deve sparire dai consumer Cocina.
ck("TabCocina: non usa più formatSub", () => {
  const src = codeOnly(tab);
  assert.ok(!/formatSub/.test(src), "formatSub non più importato né usato");
});
ck("PanelCocina: non usa formatSub", () => {
  assert.ok(!/formatSub/.test(codeOnly(panel)), "formatSub assente");
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
