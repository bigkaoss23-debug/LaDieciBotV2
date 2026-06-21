// Test statico mirato — REPARTIDOR_SHARED_GIRO_VISIBILITY
//
// Standalone, eseguibile con: `node repartidorSharedGiro.static.test.mjs`.
// Replica 1:1 la logica display-only introdotta in RepartidorPage.jsx per mostrare
// gli ordini che condividono lo stesso manual_giro_id (≥2 attivi) come UN blocco
// giro (rotta Q1 → Q2 → Q5), senza toccare stati/bottoni/handler/API:
//   - giroStopSortMin: entrega_estimada → hora → null (fallback ordine array)
//   - buildSharedGiros: gruppi ≥2 per manual_giro_id, stop ordinati, zone in
//     sequenza, salida = prima salida_driver_estimada disponibile
//   - partitionPerZona: esclude gli ordini già nel blocco giro (no duplicati);
//     ordini senza manual_giro_id (o giro <2) restano legacy per zona.

import assert from "node:assert";

// ── Logica sotto test (copia 1:1 di RepartidorPage.jsx) ────────────────────
const _hm = (t) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const giroStopSortMin = (o) => {
  const e = _hm(o?.entrega_estimada);
  if (e != null) return e;
  const h = _hm(o?.hora);
  if (h != null) return h;
  return null;
};

function buildSharedGiros(entregas) {
  const giroMembersById = {};
  for (const o of entregas) {
    const gid = o.manual_giro_id;
    if (!gid) continue;
    (giroMembersById[gid] = giroMembersById[gid] || []).push(o);
  }
  const sharedOrderIds = new Set();
  const sharedGiros = Object.keys(giroMembersById)
    .filter(gid => giroMembersById[gid].length >= 2)
    .map(gid => {
      const membersList = giroMembersById[gid];
      const ordini = membersList.slice().sort((a, b) => {
        const ma = giroStopSortMin(a), mb = giroStopSortMin(b);
        if (ma != null && mb != null && ma !== mb) return ma - mb;
        if (ma != null && mb == null) return -1;
        if (ma == null && mb != null) return 1;
        return membersList.indexOf(a) - membersList.indexOf(b);
      });
      for (const o of ordini) sharedOrderIds.add(o.id);
      const zones = Array.from(new Set(ordini.map(o => o.zona).filter(Boolean)));
      const salida = ordini.map(o => o.salida_driver_estimada).find(Boolean) || null;
      return { id: gid, ordini, zones, route: zones.join(" → "), salida };
    })
    .sort((a, b) => {
      const ma = Math.min(...a.ordini.map(o => giroStopSortMin(o) ?? 9999));
      const mb = Math.min(...b.ordini.map(o => giroStopSortMin(o) ?? 9999));
      return ma - mb;
    });
  return { sharedGiros, sharedOrderIds };
}

function partitionPerZona(entregas, sharedOrderIds) {
  const perZona = {};
  const senzaZona = [];
  for (const o of entregas) {
    if (sharedOrderIds.has(o.id)) continue;
    if (o.zona) { (perZona[o.zona] = perZona[o.zona] || []).push(o); }
    else senzaZona.push(o);
  }
  return { perZona, senzaZona };
}

// ── Fixtures ───────────────────────────────────────────────────────────────
const GIRO = "mg_260621_7";
// Giro condiviso (array DISORDINATO) + 1 legacy senza giro + 1 ordine con giro
// ma unico membro presente (non deve formare blocco).
const entregas = [
  { id: "#Q5", manual_giro_id: GIRO, zona: "Q5", hora: "22:11", entrega_estimada: "22:11", salida_driver_estimada: "21:45", estado: "LISTO" },
  { id: "#leg", manual_giro_id: null, zona: "Q3", hora: "21:40", estado: "LISTO" },
  { id: "#Q1", manual_giro_id: GIRO, zona: "Q1", hora: "21:50", entrega_estimada: "21:50", salida_driver_estimada: "21:45", estado: "LISTO" },
  { id: "#Q2", manual_giro_id: GIRO, zona: "Q2", hora: "22:04", entrega_estimada: "22:04", salida_driver_estimada: "21:45", estado: "LISTO" },
  { id: "#solo", manual_giro_id: "mg_260621_9", zona: "Q4", hora: "21:30", estado: "LISTO" }, // giro con 1 solo membro
];

let pass = 0, fail = 0;
const ck = (label, fn) => {
  try { fn(); pass++; console.log("  ✓", label); }
  catch (e) { fail++; console.log("  ✗", label, "—", e.message); }
};

console.log("\n══ REPARTIDOR SHARED GIRO — static ══");

// 1) ordini con stesso manual_giro_id (≥2) → un gruppo condiviso.
ck("1. manual_giro_id condiviso (≥2) → 1 blocco giro con 3 stop", () => {
  const { sharedGiros } = buildSharedGiros(entregas);
  assert.equal(sharedGiros.length, 1);
  assert.equal(sharedGiros[0].id, GIRO);
  assert.equal(sharedGiros[0].ordini.length, 3);
});

// 2) label sequenza zone Q1 → Q2 → Q5.
ck("2. route = 'Q1 → Q2 → Q5'", () => {
  const { sharedGiros } = buildSharedGiros(entregas);
  assert.deepEqual(sharedGiros[0].zones, ["Q1", "Q2", "Q5"]);
  assert.equal(sharedGiros[0].route, "Q1 → Q2 → Q5");
});

// 3) stop ordinati entrega_estimada → hora → array; salida unica.
ck("3. stop ordinati per entrega_estimada e salida unica 21:45", () => {
  const { sharedGiros } = buildSharedGiros(entregas);
  assert.deepEqual(sharedGiros[0].ordini.map(o => o.id), ["#Q1", "#Q2", "#Q5"]);
  assert.equal(sharedGiros[0].salida, "21:45");
});

// 4) ordini senza manual_giro_id (o giro <2) restano legacy per zona.
ck("4. legacy: #leg (no giro) e #solo (giro 1 membro) restano per zona", () => {
  const { sharedOrderIds } = buildSharedGiros(entregas);
  const { perZona } = partitionPerZona(entregas, sharedOrderIds);
  assert.ok(perZona["Q3"] && perZona["Q3"][0].id === "#leg");
  assert.ok(perZona["Q4"] && perZona["Q4"][0].id === "#solo"); // giro <2 → legacy
  assert.ok(!perZona["Q1"]); // gli stop del giro NON sono nelle zone
});

// 5) ogni stop resta un ordine singolo (card keyed by id) — niente mutazione.
ck("5. stop = ordini singoli, stessi ref, input intatto", () => {
  const snapshot = JSON.stringify(entregas);
  const { sharedGiros } = buildSharedGiros(entregas);
  assert.ok(sharedGiros[0].ordini.every(o => entregas.includes(o)));
  assert.equal(JSON.stringify(entregas), snapshot);
});

// 6) no crash con manual_giro_id null / campi assenti.
ck("6. no crash con manual_giro_id null / campi assenti", () => {
  assert.doesNotThrow(() => {
    const { sharedGiros, sharedOrderIds } = buildSharedGiros([{ id: "a" }, { id: "b", manual_giro_id: null }]);
    partitionPerZona([{ id: "a" }, { id: "c", zona: undefined }], sharedOrderIds);
    assert.equal(sharedGiros.length, 0);
    giroStopSortMin(undefined);
  });
});

// 7) salida assente → null (no invenzione); route vuota se nessuna zona.
ck("7. salida null se assente, route '' se nessuna zona", () => {
  const noMeta = [
    { id: "x", manual_giro_id: "g", hora: "21:00" },
    { id: "y", manual_giro_id: "g", hora: "21:10" },
  ];
  const { sharedGiros } = buildSharedGiros(noMeta);
  assert.equal(sharedGiros[0].salida, null);
  assert.equal(sharedGiros[0].route, "");
  assert.deepEqual(sharedGiros[0].ordini.map(o => o.id), ["x", "y"]); // fallback hora
});

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
