// Test estático dirigido — TAB_ENTREGAS_CANONICAL_TRIP_STATE (Planner W6.6)
//
// Standalone, se ejecuta con: `node tabEntregasCanonicalTripState.static.test.mjs`.
// Replica 1:1 la lógica pura añadida en TabEntregas.jsx (ZonaOrderRow) para
// afinar el override "salida no registrada":
//   - salidaMancante era: isEnEntrega && !driverStato?.partito_alle
//   - ahora es: isEnEntrega && !driverStato?.partito_alle && !canonicalDeparted
//   canonicalDeparted es verdadero SOLO cuando la lectura canónica Trip
//   Authority (api.getTripOperationalState()) está available, tiene un viaje
//   activo con un departed_at real, y este pedido está entre los miembros
//   congelados del viaje. DRIVER_STATO sigue siendo el respaldo (nunca se
//   quita): un viaje ya cerrado formalmente deja de aparecer en la
//   proyección (tripProjectionPort.js), así que su salida histórica ya no
//   tiene fuente canónica -- solo la señal legacy la conserva.

import assert from "node:assert";

// ── Logica sotto test (copia 1:1 di TabEntregas.jsx/ZonaOrderRow) ──────────
function canonicalDepartedFor(o, tripState) {
  return !!(
    tripState && tripState.available && tripState.has_active_trip && tripState.departed_at &&
    Array.isArray(tripState.members) &&
    tripState.members.some(m => m && String(m.order_id) === String(o.id))
  );
}
function salidaMancanteFor(o, driverStato, tripState) {
  const isEnEntrega = o.estado === "EN_ENTREGA";
  return isEnEntrega && !driverStato?.partito_alle && !canonicalDepartedFor(o, tripState);
}

let pass = 0, fail = 0;
const ck = (label, fn) => {
  try { fn(); pass++; console.log("  ✓", label); }
  catch (e) { fail++; console.log("  ✗", label, "—", e.message); }
};

console.log("\n══ TAB_ENTREGAS_CANONICAL_TRIP_STATE — static ══");

const ORDER = { id: "A123", estado: "EN_ENTREGA" };

ck("1. DRIVER_STATO has partito_alle -> salidaMancante false regardless of tripState", () => {
  assert.equal(salidaMancanteFor(ORDER, { partito_alle: "21:45" }, null), false);
});

ck("2. neither DRIVER_STATO nor tripState -> salidaMancante true (pre-existing behavior unchanged)", () => {
  assert.equal(salidaMancanteFor(ORDER, null, null), true);
});

ck("3. DRIVER_STATO missing, but canonical trip proves this order departed -> salidaMancante false", () => {
  const tripState = { available: true, has_active_trip: true, departed_at: "2026-09-16T21:45:00.000Z", members: [{ order_id: "A123" }, { order_id: "B456" }] };
  assert.equal(salidaMancanteFor(ORDER, null, tripState), false);
});

ck("4. canonical trip active but THIS order is not among its frozen members -> salidaMancante stays true", () => {
  const tripState = { available: true, has_active_trip: true, departed_at: "2026-09-16T21:45:00.000Z", members: [{ order_id: "B456" }] };
  assert.equal(salidaMancanteFor(ORDER, null, tripState), true);
});

ck("5. tripState DEGRADED (available:false) -> never treated as canonical proof, salidaMancante stays true", () => {
  const tripState = { available: false, has_active_trip: null, departed_at: null, members: [] };
  assert.equal(salidaMancanteFor(ORDER, null, tripState), true);
});

ck("6. tripState available but no active trip -> salidaMancante stays true (honest, not fabricated)", () => {
  const tripState = { available: true, has_active_trip: false, departed_at: null, members: [] };
  assert.equal(salidaMancanteFor(ORDER, null, tripState), true);
});

ck("7. active trip but departed_at null (should not happen, but must fail closed) -> stays true", () => {
  const tripState = { available: true, has_active_trip: true, departed_at: null, members: [{ order_id: "A123" }] };
  assert.equal(salidaMancanteFor(ORDER, null, tripState), true);
});

ck("8. order not EN_ENTREGA -> salidaMancante always false, canonical/legacy irrelevant", () => {
  const listo = { id: "A123", estado: "LISTO" };
  const tripState = { available: false, has_active_trip: null, departed_at: null, members: [] };
  assert.equal(salidaMancanteFor(listo, null, tripState), false);
});

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
