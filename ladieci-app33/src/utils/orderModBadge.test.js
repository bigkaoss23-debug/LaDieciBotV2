// Test pura della logica MOD-3 badge "MODIFICADO".
// Node puro, no Jest, no rete, no DB, no .env.
// Esecuzione: node ladieci-app33/src/utils/orderModBadge.test.js

const { isModifiedAfterCocina } = require("./orderModBadge");

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log("PASS  " + name); }
  else    { fail++; console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
};

// ---- 1) input degenerati -----------------------------------------------------
check("null → false",      isModifiedAfterCocina(null) === false);
check("undefined → false", isModifiedAfterCocina(undefined) === false);
check("oggetto vuoto → false", isModifiedAfterCocina({}) === false);
check("stringa (non-object) → false", isModifiedAfterCocina("hola") === false);
check("array (typeof object ma irrilevante) → false",
  isModifiedAfterCocina([]) === false);

// ---- 2) campi mancanti -------------------------------------------------------
check("manca mod_ts → false",
  isModifiedAfterCocina({ cocina_started_at: "2026-05-21T20:00:00Z" }) === false);
check("manca cocina_started_at → false",
  isModifiedAfterCocina({ mod_ts: "2026-05-21T20:00:00Z" }) === false);
check("mod_ts null + cocina_started_at valida → false",
  isModifiedAfterCocina({ mod_ts: null, cocina_started_at: "2026-05-21T20:00:00Z" }) === false);
check("entrambi null → false",
  isModifiedAfterCocina({ mod_ts: null, cocina_started_at: null }) === false);

// ---- 3) date invalide --------------------------------------------------------
check("mod_ts invalid string → false",
  isModifiedAfterCocina({ mod_ts: "non-una-data", cocina_started_at: "2026-05-21T20:00:00Z" }) === false);
check("cocina_started_at invalid string → false",
  isModifiedAfterCocina({ mod_ts: "2026-05-21T20:00:00Z", cocina_started_at: "boh" }) === false);
check("entrambi invalid → false",
  isModifiedAfterCocina({ mod_ts: "x", cocina_started_at: "y" }) === false);

// ---- 4) confronti temporali --------------------------------------------------
check("mod_ts === cocina_started_at → false (uguale, non DOPO)",
  isModifiedAfterCocina({
    mod_ts: "2026-05-21T20:00:00Z",
    cocina_started_at: "2026-05-21T20:00:00Z",
  }) === false);

check("mod_ts < cocina_started_at → false",
  isModifiedAfterCocina({
    mod_ts: "2026-05-21T19:59:59Z",
    cocina_started_at: "2026-05-21T20:00:00Z",
  }) === false);

check("mod_ts > cocina_started_at di 1ms → true",
  isModifiedAfterCocina({
    mod_ts: "2026-05-21T20:00:00.001Z",
    cocina_started_at: "2026-05-21T20:00:00.000Z",
  }) === true);

check("mod_ts > cocina_started_at di 5 min → true",
  isModifiedAfterCocina({
    mod_ts: "2026-05-21T20:05:00Z",
    cocina_started_at: "2026-05-21T20:00:00Z",
  }) === true);

// ---- 5) timezone ISO coerente -----------------------------------------------
// Stesso istante in due timezone diverse → uguale (non DOPO) → false.
check("ISO con offset diverso ma stesso istante → false",
  isModifiedAfterCocina({
    mod_ts: "2026-05-21T22:00:00+02:00",     // = 20:00:00Z
    cocina_started_at: "2026-05-21T20:00:00Z",
  }) === false);

// mod_ts in +02:00 ma più tardi in tempo assoluto.
check("ISO +02:00 dopo cocina UTC → true",
  isModifiedAfterCocina({
    mod_ts: "2026-05-21T22:30:00+02:00",     // = 20:30:00Z
    cocina_started_at: "2026-05-21T20:00:00Z",
  }) === true);

// ---- 6) input "Date" oggetto + epoch ms (robustezza extra) ------------------
check("oggetti Date validi: mod > cocina → true",
  isModifiedAfterCocina({
    mod_ts: new Date("2026-05-21T20:10:00Z"),
    cocina_started_at: new Date("2026-05-21T20:00:00Z"),
  }) === true);

check("epoch ms come Number: mod > cocina → true",
  isModifiedAfterCocina({
    mod_ts: Date.parse("2026-05-21T20:10:00Z"),
    cocina_started_at: Date.parse("2026-05-21T20:00:00Z"),
  }) === true);

console.log("");
console.log("Totale: " + (pass + fail) + " | PASS: " + pass + " | FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);
