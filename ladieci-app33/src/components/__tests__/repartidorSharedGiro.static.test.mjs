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
//   - W6.6: stopsTotal/stopsCompleted/stopsRemaining — conteggio progreso del
//     giro sobre TODOS los pedidos del giro (ordLocal, cualquier estado), no
//     solo los activos de `entregas`, así un stop ya entregado no desaparece
//     del conteo (sigue siendo real: cuenta lo que el backend ya devolvió,
//     nunca inventa trip_state/salida_source que la Rider DTO no expone).
//   - Planner W6.6 wire bridge: buildSharedGiros now accepts an optional
//     canonical `tripState` (api.getTripOperationalState()'s DTO). When it
//     reports an ACTIVE trip for THIS giro_id, its real departed_at wins the
//     salida priority (it actually happened, unlike the pre-departure
//     hora_ref/salida_ref/salida_driver_estimada estimates it now outranks).
//     Any other case (no tripState, unavailable, different giro, no active
//     trip) falls through to the exact pre-existing chain, unchanged.

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

// language-guard: allow-legacy RETIRADO/COMPLETATO are the existing order-state enum values (core/orders/stateMachine.js COMPLETED_ORDER_STATES), quoted verbatim, not new vocabulary
const COMPLETED_STATES = ["RETIRADO", "COMPLETATO"];
const isCompletedState = (s) => COMPLETED_STATES.includes(s);

// Minimal mirror of mesaFormat.formatClockTime's ISO->"HH:MM" contract (UTC,
// not Madrid-adjusted -- this test only proves PRIORITY ordering, not real
// timezone conversion, which mesaFormat's own tests already cover).
const _isoToHHMM = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

function buildSharedGiros(entregas, ordLocal = entregas, tripState = null) {
  const giroAllMembersById = {};
  for (const o of ordLocal) {
    // language-guard: allow-legacy tipo_consegna/DOMICILIO are the existing delivery-type field and enum value, mirrored 1:1 from RepartidorPage.jsx, not new vocabulary
    if (o.tipo_consegna !== "DOMICILIO") continue;
    const gid = o.manual_giro_id;
    if (!gid) continue;
    (giroAllMembersById[gid] = giroAllMembersById[gid] || []).push(o);
  }
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
      const canonicalDepartedAtHHMM = (
        tripState && tripState.available && tripState.has_active_trip &&
        String(tripState.giro_id) === String(gid) && tripState.departed_at
      ) ? _isoToHHMM(tripState.departed_at) : null;
      const salida = canonicalDepartedAtHHMM
        || ordini.map(o => o.salida_driver_estimada).find(Boolean) || null;
      const allMembers = giroAllMembersById[gid] || membersList;
      const stopsTotal = allMembers.length;
      const stopsCompleted = allMembers.filter(o => isCompletedState(o.estado)).length;
      const stopsRemaining = stopsTotal - stopsCompleted;
      return { id: gid, ordini, zones, route: zones.join(" → "), salida, stopsTotal, stopsCompleted, stopsRemaining };
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

// ── W6.6: stops progress (total/completed/remaining) ────────────────────────
const GIRO2 = "mg_260916_3";
// ordLocal = TODO el pedido (cualquier estado); entregasActivas = solo los no
// completados (lo que RepartidorPage ya filtra en `entregas`).
const ordLocalProgress = [
  // language-guard: allow-legacy tipo_consegna/DOMICILIO are the existing delivery-type field and enum value, quoted verbatim in these fixtures, not new vocabulary
  { id: "#a", manual_giro_id: GIRO2, tipo_consegna: "DOMICILIO", zona: "Q1", hora: "21:00", entrega_estimada: "21:00", estado: "RETIRADO" },
  { id: "#b", manual_giro_id: GIRO2, tipo_consegna: "DOMICILIO", zona: "Q2", hora: "21:10", entrega_estimada: "21:10", estado: "EN_ENTREGA" }, // language-guard: allow-legacy tipo_consegna/DOMICILIO are the existing delivery-type field and enum value, not new vocabulary
  { id: "#c", manual_giro_id: GIRO2, tipo_consegna: "DOMICILIO", zona: "Q3", hora: "21:20", entrega_estimada: "21:20", estado: "LISTO" },
];
const entregasActivas = ordLocalProgress.filter(o => o.estado !== "RETIRADO");

ck("8. stopsTotal cuenta TODOS los miembros del giro (incl. ya entregados)", () => {
  const { sharedGiros } = buildSharedGiros(entregasActivas, ordLocalProgress);
  assert.equal(sharedGiros[0].stopsTotal, 3);
});
ck("9. stopsCompleted cuenta solo los pedidos ya entregados (estado RETIRADO)", () => {
  const { sharedGiros } = buildSharedGiros(entregasActivas, ordLocalProgress);
  assert.equal(sharedGiros[0].stopsCompleted, 1);
});
ck("10. stopsRemaining = total - completed (coincide con los stops activos mostrados)", () => {
  const { sharedGiros } = buildSharedGiros(entregasActivas, ordLocalProgress);
  assert.equal(sharedGiros[0].stopsRemaining, 2);
  // language-guard: allow-legacy .ordini is the existing array field name mirrored 1:1 from RepartidorPage.jsx's real return shape, not new vocabulary
  assert.equal(sharedGiros[0].stopsRemaining, sharedGiros[0].ordini.length);
});
ck("11. sin entregas aún (0 completados) → stopsCompleted=0, stopsTotal=stopsRemaining", () => {
  const allActive = ordLocalProgress.map(o => o.id === "#a" ? { ...o, estado: "LISTO" } : o);
  const activos = allActive.filter(o => o.estado !== "RETIRADO");
  const { sharedGiros } = buildSharedGiros(activos, allActive);
  assert.equal(sharedGiros[0].stopsCompleted, 0);
  assert.equal(sharedGiros[0].stopsTotal, sharedGiros[0].stopsRemaining);
});
ck("12. ordLocal por defecto = entregas (compat retro con las fixtures 1-7 sin tipo de entrega)", () => {
  const { sharedGiros } = buildSharedGiros(entregas);
  // Las fixtures 1-7 no declaran el tipo de entrega -> excluidas de giroAllMembersById
  // (filtro estricto === "DOMICILIO"), así que cae al fallback `|| membersList`:
  // el conteo coincide con los stops activos ya visibles, sin romper nada.
  // language-guard: allow-legacy .ordini is the existing array field name mirrored 1:1 from RepartidorPage.jsx's real return shape, not new vocabulary
  assert.equal(sharedGiros[0].stopsTotal, sharedGiros[0].ordini.length);
  assert.equal(sharedGiros[0].stopsCompleted, 0);
});

// ── Planner W6.6: canonical trip.departed_at wins the salida priority ───────
ck("13. active trip matching this giro_id -> salida = real departed_at (HH:MM), overrides salida_driver_estimada", () => {
  const tripState = { available: true, has_active_trip: true, giro_id: GIRO, departed_at: "2026-09-16T21:50:00.000Z" };
  const { sharedGiros } = buildSharedGiros(entregas, entregas, tripState);
  assert.equal(sharedGiros[0].salida, "21:50");
});
ck("14. trip for a DIFFERENT giro_id -> falls through to salida_driver_estimada, never borrows another giro's departure", () => {
  const tripState = { available: true, has_active_trip: true, giro_id: "mg_other", departed_at: "2026-09-16T21:50:00.000Z" };
  const { sharedGiros } = buildSharedGiros(entregas, entregas, tripState);
  assert.equal(sharedGiros[0].salida, "21:45");
});
ck("15. tripState unavailable (DEGRADED) -> falls through, never fabricates a departure", () => {
  const tripState = { available: false, has_active_trip: null, giro_id: null, departed_at: null };
  const { sharedGiros } = buildSharedGiros(entregas, entregas, tripState);
  assert.equal(sharedGiros[0].salida, "21:45");
});
ck("16. tripState available but no active trip -> falls through unchanged", () => {
  const tripState = { available: true, has_active_trip: false, giro_id: null, departed_at: null };
  const { sharedGiros } = buildSharedGiros(entregas, entregas, tripState);
  assert.equal(sharedGiros[0].salida, "21:45");
});
ck("17. no tripState passed at all (default null) -> exact pre-existing behavior, unchanged", () => {
  const { sharedGiros } = buildSharedGiros(entregas);
  assert.equal(sharedGiros[0].salida, "21:45");
});

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
