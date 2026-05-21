// M-08 (vedi LaDieciBotV2_TEST_MATRIX.md sezione Order Modification).
// Modifica `hora` su delivery in `EN_COCINA`:
//   1. NON viene bloccata da MOD-4 (estado_terminal)
//   2. ricalcola forno_out coerentemente con calcolaFornoOutFallback
//   3. attiva risincronizzaGiro → cascade-sync su forno_out downstream
//      stale (estensione del pattern DS-5-C planFornoOutSync già coperto da
//      scheduleCascade.bug4.test.js).
//
// Niente DB, niente rete, niente .env. Mock supabase stateful via
// require.cache: sbUpdate muta la map in-memory, così la sbSelect
// successiva di risincronizzaGiro vede lo stato post-modifica.

const path = require("path");
const Module = require("module");

// ---- DB in-memory + mock stateful -------------------------------------------
const db = new Map();
const sbCalls = { select: [], update: [] };

function decodeId(query) {
  const m = String(query || "").match(/id=eq\.([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const sbPath = require.resolve("../src/utils/supabase.js");
require.cache[sbPath] = {
  id: sbPath, filename: sbPath, loaded: true,
  exports: {
    sbSelect: async (table, query = "") => {
      sbCalls.select.push({ table, query });
      if (table !== "ordenes") return [];
      const id = decodeId(query);
      if (id) {
        const o = db.get(id);
        return o ? [JSON.parse(JSON.stringify(o))] : [];
      }
      // broad query (es. risincronizzaGiro): tutti gli active DOMICILIO
      return Array.from(db.values())
        .filter(o => o.tipo_consegna === "DOMICILIO" &&
                     !["RETIRADO","COMPLETADO"].includes(o.estado))
        .map(o => JSON.parse(JSON.stringify(o)));
    },
    sbUpdate: async (table, query, body) => {
      sbCalls.update.push({ table, query, body: JSON.parse(JSON.stringify(body)) });
      if (table === "ordenes") {
        const id = decodeId(query);
        if (id && db.has(id)) Object.assign(db.get(id), body);
      }
      return { success: true };
    },
    sbUpsert: async () => ({}),
    sbInsert: async () => ({}),
    sbDelete: async () => ({}),
  },
  paths: Module._nodeModulePaths(path.dirname(sbPath)),
};

// ---- Mock claude difensivo (agentOrdini lo carica via helpers → niente) ----
const claudePath = require.resolve("../src/utils/claude.js");
require.cache[claudePath] = {
  id: claudePath, filename: claudePath, loaded: true,
  exports: { chiamaClaude: async () => null },
  paths: Module._nodeModulePaths(path.dirname(claudePath)),
};

const { modificaOrdine } = require("../src/agents/agentOrdini.js");

// ---- Fixture -----------------------------------------------------------------
function makeDelivery({ id, zona, hora, dur, estado = "EN_COCINA", forno_out = null }) {
  return {
    id, estado, tipo_consegna: "DOMICILIO", zona,
    hora, durata_andata_min: dur, forno_out,
    items: [{ n: "El Pelusa", q: 1, p: 9.5, e: "", sub: "" }],
    nota: "", nota_cucina: "",
    zona_lat: null, zona_lon: null,
    descuento_tipo: null, descuento_valor: null, descuento_importe: null,
    totale: 9.5, delivery_fee: 2.5,
  };
}

// ---- Test runner -------------------------------------------------------------
let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log("PASS  " + name); }
  else    { fail++; console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
};
const ordenUpdates = (id) => sbCalls.update.filter(u =>
  u.table === "ordenes" && (u.query || "").includes(`id=eq.${id}`));

(async () => {
  // Pre-stato:
  //  - O1 Q2 hora=21:30 dur=10 EN_COCINA forno_out=21:20  (corretto al momento creazione)
  //  - O2 Q3 hora=22:30 dur=10 EN_COCINA forno_out="99:99" (deliberatamente stale)
  // Modifica O1.hora=23:00. Dopo la modify:
  //  - sim aggiornata: Q2 partenza 22:50, rientro 23:13; Q3 partenza 22:20 rientro 22:43.
  //  - O1 nuovo forno_out=22:50 (NON slittato: 23:00-10 >= driver_libero pre-O1=22:43).
  //  - O2 stale 99:99 → cascade-sync a 22:20.
  db.clear(); sbCalls.select = []; sbCalls.update = [];
  db.set("m08-o1", makeDelivery({ id: "m08-o1", zona: "Q2", hora: "21:30", dur: 10, forno_out: "21:20" }));
  db.set("m08-o2", makeDelivery({ id: "m08-o2", zona: "Q3", hora: "22:30", dur: 10, forno_out: "99:99" }));

  let res = null, threw = null;
  try { res = await modificaOrdine("m08-o1", { hora: "23:00" }); }
  catch (e) { threw = e; }

  const u1 = ordenUpdates("m08-o1");
  const u2 = ordenUpdates("m08-o2");
  const u1Body = u1[0]?.body || {};
  const u2Body = u2[0]?.body || {};

  check("M-08: modificaOrdine non lancia eccezione", threw == null, threw ? threw.message : "");
  check("M-08: MOD-4 non blocca (success=true)",
    res && res.success === true, JSON.stringify(res));
  check("M-08: non viene marcato estado_terminal",
    !res || res.error !== "estado_terminal", JSON.stringify(res));
  check("M-08: sbUpdate su O1 viene emesso",
    u1.length >= 1, `updates=${u1.length}`);
  check("M-08: O1 update include hora=23:00",
    u1Body.hora === "23:00", JSON.stringify(u1Body));
  check("M-08: O1 update include forno_out=22:50",
    u1Body.forno_out === "22:50", JSON.stringify(u1Body));
  check("M-08: cascade — sbUpdate su O2 downstream viene emesso",
    u2.length >= 1, `updates=${u2.length}`);
  check("M-08: cascade — O2.forno_out riallineato a 22:20 (dallo stale 99:99)",
    u2Body.forno_out === "22:20", JSON.stringify(u2Body));
  check("M-08: risincronizzaGiro è stato attivato (broad sbSelect dopo update)",
    sbCalls.select.some(s => s.table === "ordenes" && /tipo_consegna=eq\.DOMICILIO/.test(s.query)),
    JSON.stringify(sbCalls.select.map(s => s.query)));

  // Sanity guard: un ordine in EN_ENTREGA con stessa modifica deve essere
  // bloccato da MOD-4 (parità con M-06). Conferma che M-08 non ha disabilitato
  // la guardia.
  db.clear(); sbCalls.select = []; sbCalls.update = [];
  db.set("m08-block", makeDelivery({ id: "m08-block", zona: "Q2", hora: "21:30", dur: 10, estado: "EN_ENTREGA", forno_out: "21:20" }));
  const resBlock = await modificaOrdine("m08-block", { hora: "23:00" });
  check("guardia residua MOD-4 ancora attiva su EN_ENTREGA (no regressione)",
    resBlock && resBlock.success === false && resBlock.error === "estado_terminal",
    JSON.stringify(resBlock));
  check("guardia residua: nessun sbUpdate emesso su ordine EN_ENTREGA",
    ordenUpdates("m08-block").length === 0,
    `updates=${ordenUpdates("m08-block").length}`);

  console.log("");
  console.log("Totale: " + (pass + fail) + " | PASS: " + pass + " | FAIL: " + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
