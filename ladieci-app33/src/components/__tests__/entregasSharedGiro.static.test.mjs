// Test statico mirato — ENTREGAS_SHARED_GIRO_VISIBILITY
//
// Standalone, eseguibile con: `node entregasSharedGiro.static.test.mjs`.
// Replica 1:1 la logica display-only introdotta in TabEntregas.jsx per leggere un
// giro condiviso (ordini con lo stesso manual_giro_id) come UNA rotta:
//   - giroStopSortMin: ordina gli stop per entrega_estimada → hora → ordine array
//   - formatGiroRoute: ["Q1","Q2","Q5"] → "Q1 → Q2 → Q5"
//   - partition: ordini con manual_giro_id (membership) raggruppati; gli altri legacy
//   - zone in sequenza dedupate + flag "combinado" (≥2 zone distinte)
// NESSUNA invenzione di orari, NESSUN cambio di stati/azioni: solo display.

import assert from "node:assert";

// ── Logica sotto test (copia 1:1 di TabEntregas.jsx) ───────────────────────
const _tm = (t) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };

const giroStopSortMin = (o) => {
  const e = _tm(o?.entrega_estimada);
  if (e != null) return e;
  const h = _tm(o?.hora);
  if (h != null) return h;
  return null;
};

const formatGiroRoute = (orderedZones = []) => orderedZones.filter(Boolean).join(" → ");

// membership: ordini con manual_giro_id (e metadata giro presente) → blocco giro;
// gli altri → legacy/singoli. Copia 1:1 di manualMembersByGiro/nonManual.
function partition(entregas, manualGiroByOrderId) {
  const manualMembersByGiro = {};
  const nonManual = [];
  for (const o of entregas) {
    const gid = o.manual_giro_id;
    if (gid && manualGiroByOrderId[o.id]) {
      (manualMembersByGiro[gid] = manualMembersByGiro[gid] || []).push(o);
    } else {
      nonManual.push(o);
    }
  }
  return { manualMembersByGiro, nonManual };
}

// vista del blocco giro: stop ordinati + zone in sequenza dedupate + flag combinado.
function buildGiroView(members) {
  const ordini = members.slice().sort((a, b) => {
    const ma = giroStopSortMin(a), mb = giroStopSortMin(b);
    if (ma != null && mb != null && ma !== mb) return ma - mb;
    if (ma != null && mb == null) return -1;
    if (ma == null && mb != null) return 1;
    return members.indexOf(a) - members.indexOf(b);
  });
  const zones = Array.from(new Set(ordini.map(o => o.zona).filter(Boolean)));
  const isCombined = zones.length >= 2;
  const route = formatGiroRoute(zones);
  return { ordini, zones, isCombined, route };
}

// ── Fixtures ───────────────────────────────────────────────────────────────
// Giro condiviso G7 = Q5 + Q2 + Q1 (stesso manual_giro_id), ARRAY DISORDINATO.
const GIRO = "mg_260621_7";
const giroMembers = [
  { id: "#Q5", manual_giro_id: GIRO, zona: "Q5", hora: "22:11", entrega_estimada: "22:11" },
  { id: "#Q1", manual_giro_id: GIRO, zona: "Q1", hora: "21:50", entrega_estimada: "21:50" },
  { id: "#Q2", manual_giro_id: GIRO, zona: "Q2", hora: "22:04", entrega_estimada: "22:04" },
];
const legacy = [
  { id: "#solo", manual_giro_id: null, zona: "Q3", hora: "21:40" },
];
const manualGiroByOrderId = { "#Q5": { id: GIRO, seq: 7 }, "#Q1": { id: GIRO, seq: 7 }, "#Q2": { id: GIRO, seq: 7 } };

let pass = 0, fail = 0;
const ck = (label, fn) => {
  try { fn(); pass++; console.log("  ✓", label); }
  catch (e) { fail++; console.log("  ✗", label, "—", e.message); }
};

console.log("\n══ ENTREGAS SHARED GIRO — static ══");

// 1) ordini con stesso manual_giro_id raggruppati in UN blocco giro.
ck("1. ordini con stesso manual_giro_id in 1 solo blocco (3 membri)", () => {
  const { manualMembersByGiro } = partition([...giroMembers, ...legacy], manualGiroByOrderId);
  assert.equal(Object.keys(manualMembersByGiro).length, 1);
  assert.equal(manualMembersByGiro[GIRO].length, 3);
});

// 2) label zone in sequenza Q1 → Q2 → Q5 (anche se array disordinato).
ck("2. route = 'Q1 → Q2 → Q5' (ordinato per entrega_estimada)", () => {
  const { route, zones } = buildGiroView(giroMembers);
  assert.deepEqual(zones, ["Q1", "Q2", "Q5"]);
  assert.equal(route, "Q1 → Q2 → Q5");
});

// 3) salida/regreso non duplicati: zone dedupate (no chip ripetuti), nessun regreso inventato.
ck("3. zone dedupate (no duplicati) anche con zona ripetuta", () => {
  const dup = [
    { id: "a", manual_giro_id: GIRO, zona: "Q2", hora: "22:00", entrega_estimada: "22:00" },
    { id: "b", manual_giro_id: GIRO, zona: "Q2", hora: "22:06", entrega_estimada: "22:06" },
    { id: "c", manual_giro_id: GIRO, zona: "Q5", hora: "22:11", entrega_estimada: "22:11" },
  ];
  const { zones, route } = buildGiroView(dup);
  assert.deepEqual(zones, ["Q2", "Q5"]);   // Q2 una sola volta
  assert.equal(route, "Q2 → Q5");
});

// 4) ordini senza manual_giro_id restano legacy/singoli.
ck("4. ordine senza manual_giro_id → nonManual (legacy)", () => {
  const { manualMembersByGiro, nonManual } = partition([...giroMembers, ...legacy], manualGiroByOrderId);
  assert.equal(nonManual.length, 1);
  assert.equal(nonManual[0].id, "#solo");
  assert.ok(!manualMembersByGiro[GIRO].some(o => o.id === "#solo"));
});

// 5) display-only: gli oggetti ordine NON vengono mutati (stati/azioni invariati).
ck("5. nessuna mutazione degli ordini (display-only)", () => {
  const snapshot = JSON.stringify(giroMembers);
  const { ordini } = buildGiroView(giroMembers);
  assert.ok(ordini.every(o => giroMembers.includes(o)));   // stessi ref
  assert.equal(JSON.stringify(giroMembers), snapshot);     // input intatto
});

// 6) manual_giro_id null/mancante o campi assenti → nessun crash.
ck("6. no crash con manual_giro_id null / campi assenti", () => {
  assert.doesNotThrow(() => {
    partition([{ id: "x" }, { id: "y", manual_giro_id: null }], {});
    buildGiroView([{ id: "z" }, { id: "w", zona: undefined }]);
    formatGiroRoute(undefined);
    giroStopSortMin(undefined);
  });
  assert.equal(formatGiroRoute(["Q1", null, "Q2"]), "Q1 → Q2"); // null filtrato
});

// 7) sort fallback: entrega_estimada mancante → usa hora; entrambe mancanti → array.
ck("7. sort fallback entrega_estimada → hora → ordine array", () => {
  const m = [
    { id: "noTime", manual_giro_id: GIRO, zona: "Q4" },                                  // nessun tempo → in coda
    { id: "byHora", manual_giro_id: GIRO, zona: "Q2", hora: "21:55" },                   // solo hora
    { id: "byEnt", manual_giro_id: GIRO, zona: "Q1", entrega_estimada: "21:50" },        // entrega
  ];
  const { ordini, route } = buildGiroView(m);
  assert.deepEqual(ordini.map(o => o.id), ["byEnt", "byHora", "noTime"]);
  assert.equal(route, "Q1 → Q2 → Q4");
});

// ── Patch B: display-only cleanup dentro il blocco Giro combinado ───────────
// Replica 1:1 le condizioni di render introdotte in TabEntregas.jsx:
//   - ZonaOrderRow: con insideGiroBlock=true nasconde il badge "giro manual · gN"
//     (+ × + disolver) e i manualGiroWarnings per riga; con false → invariato.
//   - ManualGiroBlock header: filtra i warning ridondanti (zones/already/no-zona),
//     tiene gli operativi (state-gap/hora/no-dir).
const showRowGiroBadge = (insideGiroBlock, manualGiro) => !insideGiroBlock && !!manualGiro;
const showRowGiroWarnings = (insideGiroBlock, warnings = []) => (insideGiroBlock ? [] : warnings);
const headerWarnings = (warnings = []) => warnings.filter(w => !["zones", "already", "no-zona"].includes(w.key));

const giroMeta = { id: GIRO, seq: 7 };
const allWarnings = [
  { key: "zones", label: "Zonas diferentes", level: "soft" },
  { key: "already", label: "Ya en giro", level: "soft" },
  { key: "no-zona", label: "Sin zona", level: "soft" },
  { key: "state-gap", label: "Cocina + en camino", level: "strong" },
  { key: "hora", label: "Horarios >15 min", level: "soft" },
  { key: "no-dir", label: "Sin direccion", level: "soft" },
];

// 8) dentro il blocco giro: NIENTE badge "giro manual · gN" per riga.
ck("8. insideGiroBlock=true → badge giro per riga nascosto", () => {
  assert.equal(showRowGiroBadge(true, giroMeta), false);
});

// 9) dentro il blocco giro: NIENTE manualGiroWarnings per riga (no 'Zonas diferentes' per riga).
ck("9. insideGiroBlock=true → warnings per riga soppressi", () => {
  assert.deepEqual(showRowGiroWarnings(true, allWarnings), []);
});

// 10) legacy ZonaBlock (insideGiroBlock=false): badge + warnings INVARIATI.
ck("10. insideGiroBlock=false (legacy) → badge + warnings invariati", () => {
  assert.equal(showRowGiroBadge(false, giroMeta), true);
  assert.deepEqual(showRowGiroWarnings(false, allWarnings), allWarnings);
});

// 11) header giro: filtra ridondanti (zones/already/no-zona), tiene operativi.
ck("11. header → solo warning operativi (state-gap/hora/no-dir)", () => {
  const hw = headerWarnings(allWarnings).map(w => w.key);
  assert.deepEqual(hw, ["state-gap", "hora", "no-dir"]);
  assert.ok(!hw.includes("zones") && !hw.includes("already") && !hw.includes("no-zona"));
});

// 12) header combinado resta leggibile: route + flag combinado + conteggio.
ck("12. header combinado: route 'Q1 → Q2 → Q5', combinado, 3 pedidos", () => {
  const { route, isCombined, ordini } = buildGiroView(giroMembers);
  assert.equal(route, "Q1 → Q2 → Q5");
  assert.equal(isCombined, true);
  assert.equal(ordini.length, 3);
});

// ── Patch D: warning rider legacy nascosto dentro il blocco Giro combinado ──
// Replica 1:1 la condizione di render in TabEntregas.jsx: il blocco
// "⚠ Repartidor tarde" (campi driver per-ordine) si mostra solo se
// !insideGiroBlock && conflicto_driver && salida_driver_estimada.
const showRiderWarning = (insideGiroBlock, o) =>
  !insideGiroBlock && !!o.conflicto_driver && !!o.salida_driver_estimada;

const oLate = { id: "#Q5", conflicto_driver: true, salida_driver_estimada: "23:43", retraso_estimado_min: 26 };
const oOk = { id: "#Q2", conflicto_driver: false, salida_driver_estimada: "23:08", retraso_estimado_min: 0 };

// 13) dentro Giro combinado: warning rider legacy NASCOSTO anche con conflicto_driver=true.
ck("13. insideGiroBlock=true + conflicto_driver → 'Repartidor tarde' nascosto", () => {
  assert.equal(showRiderWarning(true, oLate), false);
});

// 14) fuori dal giro combinato: warning rider legacy INVARIATO (visibile se conflicto).
ck("14. insideGiroBlock=false (legacy) → warning rider invariato", () => {
  assert.equal(showRiderWarning(false, oLate), true);   // conflicto → visibile
  assert.equal(showRiderWarning(false, oOk), false);    // no conflicto → niente
});

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
