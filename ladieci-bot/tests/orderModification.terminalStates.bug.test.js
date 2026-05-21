// M-06 + M-07 bug-repro (vedi LaDieciBotV2_TEST_MATRIX.md sezione Order
// Modification). `modificaOrdine` oggi NON ha guardia su `estado`: emette
// `sbUpdate("ordenes", id=eq.X, ...)` anche se l'ordine è in EN_ENTREGA,
// RETIRADO o COMPLETADO. Questo test documenta il bug in modo
// controllato; diventerà regression invertendo l'asserzione quando MOD-4
// chiuderà la guardia in `agentOrdini.modificaOrdine`.
//
// Niente DB, niente rete, niente .env. Solo Node + mock di `supabase`
// (e mock difensivo di `claude.js`) via require.cache, stesso pattern di
// scheduleCascade.bug4.test.js / interpreta.golden.test.js.

const path = require("path");
const Module = require("module");

// ---- Mock supabase -----------------------------------------------------------
const sbCalls = { select: [], update: [], upsert: [], insert: [], delete: [] };
let orderFixture = null;
const sbPath = require.resolve("../src/utils/supabase.js");
require.cache[sbPath] = {
  id: sbPath, filename: sbPath, loaded: true,
  exports: {
    sbSelect: async (table, query = "") => {
      sbCalls.select.push({ table, query });
      // Caso A: select per id specifico → ritorna l'ordine fixture corrente
      if (table === "ordenes" && /id=eq\./.test(query)) return [orderFixture];
      // Caso B: select broad DOMICILIO active per risincronizzaGiro:
      //   restituiamo solo l'ordine corrente; planFornoOutSync filtra per
      //   estado ∈ {NUEVO, EN_COCINA}, quindi gli stati terminali non
      //   producono update aggiuntivi (signal pulito).
      if (table === "ordenes") return [orderFixture];
      return [];
    },
    sbUpdate: async (table, query, body) => {
      sbCalls.update.push({ table, query, body });
      return { success: true };
    },
    sbUpsert: async (table, body) => { sbCalls.upsert.push({ table, body }); return {}; },
    sbInsert: async (table, body) => { sbCalls.insert.push({ table, body }); return {}; },
    sbDelete: async (table, query) => { sbCalls.delete.push({ table, query }); return {}; },
  },
  paths: Module._nodeModulePaths(path.dirname(sbPath)),
};

// ---- Mock claude difensivo ---------------------------------------------------
const claudePath = require.resolve("../src/utils/claude.js");
require.cache[claudePath] = {
  id: claudePath, filename: claudePath, loaded: true,
  exports: { chiamaClaude: async () => null },
  paths: Module._nodeModulePaths(path.dirname(claudePath)),
};

// ---- Import del SUT dopo i mock ---------------------------------------------
const { modificaOrdine } = require("../src/agents/agentOrdini.js");

// ---- Fixture -----------------------------------------------------------------
function makeOrder({ id, estado, tipo_consegna = "RITIRO", zona = null, hora = "21:30" }) {
  return {
    id, estado, tipo_consegna, hora,
    items: [{ n: "El Pelusa", q: 1, p: 9.5, e: "", sub: "" }],
    nota: "", nota_cucina: "",
    zona, zona_lat: null, zona_lon: null, durata_andata_min: null,
    descuento_tipo: null, descuento_valor: null, descuento_importe: null,
    forno_out: null, totale: 9.5, delivery_fee: 0,
  };
}

function reset() {
  sbCalls.select = []; sbCalls.update = []; sbCalls.upsert = [];
  sbCalls.insert = []; sbCalls.delete = [];
}

function ordenUpdatesFor(id) {
  return sbCalls.update.filter(u =>
    u.table === "ordenes" && u.query.includes(`id=eq.${id}`));
}

// ---- Scenari -----------------------------------------------------------------
let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log("PASS  " + name); }
  else    { fail++; console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
};

const TERMINALI = [
  // M-06
  { id: "ord-en-entrega", estado: "EN_ENTREGA", tipo_consegna: "DOMICILIO", zona: "Q2", caso: "M-06" },
  // M-07
  { id: "ord-retirado",   estado: "RETIRADO",   tipo_consegna: "RITIRO",                caso: "M-07a" },
  { id: "ord-completado", estado: "COMPLETADO", tipo_consegna: "RITIRO",                caso: "M-07b" },
];

(async () => {
  for (const t of TERMINALI) {
    reset();
    orderFixture = makeOrder(t);
    const newItems = [
      { n: "El Pelusa", q: 1, p: 9.5, e: "", sub: "" },
      { n: "Diavola",   q: 1, p: 10.5, e: "", sub: "" },
    ];

    let res = null, threw = null;
    try { res = await modificaOrdine(t.id, { items: newItems }); }
    catch (e) { threw = e; }

    const updates = ordenUpdatesFor(t.id);
    const bodyHasNewItems = updates.some(u =>
      Array.isArray(u.body?.items) && u.body.items.some(i => i.n === "Diavola"));

    // BUG CORRENTE atteso: nessun errore, sbUpdate emesso, items modificati.
    check(`${t.caso} (${t.estado}): modificaOrdine NON lancia errore (bug: dovrebbe rifiutare)`,
      threw == null, threw ? threw.message : "");
    check(`${t.caso} (${t.estado}): sbUpdate("ordenes") viene emesso (bug: non dovrebbe)`,
      updates.length >= 1, `updates=${updates.length}`);
    check(`${t.caso} (${t.estado}): items mutati persistiti (bug: dovevano essere bloccati)`,
      bodyHasNewItems, JSON.stringify(updates.map(u => u.body?.items)));
    check(`${t.caso} (${t.estado}): res.success === true (bug: oggi ritorna successo)`,
      res && res.success === true, JSON.stringify(res));
  }

  // Sanity sul controllo: lo stesso scenario con ordine in EN_COCINA deve
  // *anche* aggiornare (è il path legittimo). Qui non è un bug ma serve a
  // dimostrare che il rilevamento non è triviale ("update sempre" sarebbe
  // un test inutile).
  reset();
  orderFixture = makeOrder({ id: "ord-cocina", estado: "EN_COCINA", tipo_consegna: "RITIRO" });
  await modificaOrdine("ord-cocina", { items: [
    { n: "El Pelusa", q: 1, p: 9.5, e: "", sub: "" },
    { n: "Diavola",   q: 1, p: 10.5, e: "", sub: "" },
  ]});
  check("sanity (EN_COCINA): update legittimo emesso (atteso, non bug)",
    ordenUpdatesFor("ord-cocina").length >= 1);

  console.log("");
  console.log("Totale: " + (pass + fail) + " | PASS: " + pass + " | FAIL: " + fail);
  console.log("");
  console.log("PASS qui = bug riprodotto: modificaOrdine permette update su stati");
  console.log("terminali. Quando MOD-4 chiuderà la guardia, invertire l'asserzione");
  console.log("(threw != null || updates.length === 0 || !res.success) e questo test");
  console.log("diventa regression.");

  process.exit(fail === 0 ? 0 : 1);
})();
