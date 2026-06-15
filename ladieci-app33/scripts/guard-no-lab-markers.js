// GUARD-NO-LAB-MARKERS — La Dieci Bot V2
// Tripwire di build: fa FALLIRE una build di PRODUZIONE se nei sorgenti
// compare codice di laboratorio / Nuevo Pedido V1 / Planner UX.
//
// Si attiva SOLO quando CONTEXT === "production" (il contesto che Netlify
// imposta per il sito di produzione). Le build di staging/preview passano,
// cosi' il laboratorio puo' continuare a vivere su staging.
//
// Scappatoia esplicita e consapevole: ALLOW_V1=1 (da usare SOLO il giorno in
// cui l'utente decide davvero di pubblicare V1).

const fs = require("fs");
const path = require("path");

const CONTEXT = process.env.CONTEXT || "local";
const ALLOW_V1 = process.env.ALLOW_V1 === "1";

// Marker univoci di V1 / Planner / Lab (NON presenti nel prod pulito 777ae55).
const MARKERS = [
  "ppp-prop",
  "ppp-detail",
  "Sin giro compatible",
  "Sin alternativa",
  "PremiumProposalsLabPanel",
  "ManualGiroSection",
  "recommended_hora",
];

if (CONTEXT !== "production") {
  console.log(`[guard-no-lab-markers] context=${CONTEXT} → skip (solo produzione)`);
  process.exit(0);
}
if (ALLOW_V1) {
  console.log("[guard-no-lab-markers] ALLOW_V1=1 → bypass esplicito autorizzato");
  process.exit(0);
}

const SRC = path.join(__dirname, "..", "src");
const found = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p);
    } else if (/\.(jsx?|mjs|tsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      const txt = fs.readFileSync(p, "utf8");
      for (const m of MARKERS) {
        if (txt.includes(m)) {
          found.push(`${path.relative(SRC, p)} :: ${m}`);
        }
      }
    }
  }
}

try {
  walk(SRC);
} catch (e) {
  console.error("[guard-no-lab-markers] errore scansione:", e.message);
  process.exit(1);
}

if (found.length > 0) {
  console.error("\n🛑 BUILD DI PRODUZIONE BLOCCATA — trovato codice laboratorio/V1:\n");
  for (const f of found) console.error("   - " + f);
  console.error(
    "\nQuesta build pubblicherebbe Nuevo Pedido V1 / Planner UX / Lab in PRODUZIONE."
  );
  console.error(
    "La produzione si builda SOLO da una branch pulita (main / 777ae55)."
  );
  console.error(
    "Se vuoi DAVVERO pubblicare V1 oggi: ri-builda con ALLOW_V1=1 (scelta consapevole).\n"
  );
  process.exit(1);
}

console.log("[guard-no-lab-markers] produzione pulita: nessun marker V1. OK.");
process.exit(0);
