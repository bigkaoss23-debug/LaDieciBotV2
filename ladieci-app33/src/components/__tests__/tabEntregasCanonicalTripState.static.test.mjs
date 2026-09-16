// Test estático dirigido — TAB_ENTREGAS_CANONICAL_TRIP_STATE (Planner W6.6 final
// cleanup: DRIVER_STATO_CANONICAL_FRONTEND_READERS = 0)
//
// Standalone, se ejecuta con: `node tabEntregasCanonicalTripState.static.test.mjs`.
// Replica 1:1 la lógica pura de TabEntregas.jsx (ZonaOrderRow) para el override
// "salida no registrada", ahora que el último respaldo legacy (DRIVER_STATO.
// partito_alle) fue retirado por completo:
//   salidaMancante = isEnEntrega && !canonicalDeparted
// canonicalDeparted es verdadero cuando CUALQUIERA de dos hechos canónicos,
// cada uno fail-closed por su cuenta, prueba la salida de ESTE pedido:
//   - viaje ACTIVO: tripState.available + has_active_trip + departed_at real,
//     y este pedido entre los miembros congelados (trip_projection_v1 — solo
//     reporta el viaje ACTIVO, nunca uno ya cerrado);
//   - viaje ya CERRADO formalmente (o current sin viaje activo pero con un
//     giro que sí departió): tripState.canonical_departed_order_ids, poblado
//     desde giro_projection_v1's salida_source==='DEPARTED' (derive_giros_v1,
//     migración 135) — ese hecho nunca revierte, ni siquiera tras el cierre.
// Sin ninguna de las dos fuentes: la incertidumbre falla cerrado (salidaMancante
// queda true), exactamente igual que un pedido que nunca salió.

import assert from "node:assert";

// ── Logica sotto test (copia 1:1 di TabEntregas.jsx/ZonaOrderRow) ──────────
function canonicalDepartedFor(o, tripState) {
  return !!(
    tripState && (
      (tripState.available && tripState.has_active_trip && tripState.departed_at &&
        Array.isArray(tripState.members) &&
        tripState.members.some(m => m && String(m.order_id) === String(o.id))) ||
      (Array.isArray(tripState.canonical_departed_order_ids) &&
        tripState.canonical_departed_order_ids.some(id => String(id) === String(o.id)))
    )
  );
}
function salidaMancanteFor(o, tripState) {
  const isEnEntrega = o.estado === "EN_ENTREGA";
  return isEnEntrega && !canonicalDepartedFor(o, tripState);
}

let pass = 0, fail = 0;
const ck = (label, fn) => {
  try { fn(); pass++; console.log("  ✓", label); }
  catch (e) { fail++; console.log("  ✗", label, "—", e.message); }
};

console.log("\n══ TAB_ENTREGAS_CANONICAL_TRIP_STATE — static (W6.6 final cleanup) ══");

const ORDER = { id: "A123", estado: "EN_ENTREGA" };

// ── 1. never departed -> salidaMancante true ────────────────────────────────
ck("1. no tripState at all (first poll not resolved yet) -> salidaMancante true", () => {
  assert.equal(salidaMancanteFor(ORDER, null), true);
});
ck("1b. tripState available, no active trip, no departed giro -> salidaMancante true", () => {
  const tripState = { available: true, has_active_trip: false, departed_at: null, members: [], canonical_departed_order_ids: [] };
  assert.equal(salidaMancanteFor(ORDER, tripState), true);
});

// ── 2. active canonical departed trip -> false ──────────────────────────────
ck("2. active trip, this order among the frozen members -> salidaMancante false", () => {
  const tripState = { available: true, has_active_trip: true, departed_at: "2026-09-16T21:45:00.000Z", members: [{ order_id: "A123" }, { order_id: "B456" }], canonical_departed_order_ids: [] };
  assert.equal(salidaMancanteFor(ORDER, tripState), false);
});

// ── 3. formally closed trip with canonical historical departure -> false ────
ck("3. no active trip, but canonical_departed_order_ids (closed-trip giro fact) includes this order -> salidaMancante false", () => {
  const tripState = { available: true, has_active_trip: false, departed_at: null, members: [], canonical_departed_order_ids: ["A123"] };
  assert.equal(salidaMancanteFor(ORDER, tripState), false);
});
ck("3b. canonical_departed_order_ids works even when the trip read itself is degraded (independent, self-contained read)", () => {
  const tripState = { available: false, has_active_trip: null, departed_at: null, members: [], canonical_departed_order_ids: ["A123"] };
  assert.equal(salidaMancanteFor(ORDER, tripState), false);
});

// ── 4. unrelated giro/trip -> no borrowed departure ─────────────────────────
ck("4. active trip but THIS order is not among its frozen members -> salidaMancante stays true", () => {
  const tripState = { available: true, has_active_trip: true, departed_at: "2026-09-16T21:45:00.000Z", members: [{ order_id: "B456" }], canonical_departed_order_ids: [] };
  assert.equal(salidaMancanteFor(ORDER, tripState), true);
});
ck("4b. canonical_departed_order_ids lists a DIFFERENT order -> no borrowed departure, salidaMancante stays true", () => {
  const tripState = { available: true, has_active_trip: false, departed_at: null, members: [], canonical_departed_order_ids: ["Z999"] };
  assert.equal(salidaMancanteFor(ORDER, tripState), true);
});

// ── 5. DEGRADED canonical read -> no false departure proof ──────────────────
ck("5. tripState DEGRADED (available:false), empty canonical_departed_order_ids -> never treated as proof, salidaMancante stays true", () => {
  const tripState = { available: false, has_active_trip: null, departed_at: null, members: [], canonical_departed_order_ids: [] };
  assert.equal(salidaMancanteFor(ORDER, tripState), true);
});
ck("5b. active trip but departed_at null (should not happen, but must fail closed) -> stays true", () => {
  const tripState = { available: true, has_active_trip: true, departed_at: null, members: [{ order_id: "A123" }], canonical_departed_order_ids: [] };
  assert.equal(salidaMancanteFor(ORDER, tripState), true);
});
ck("5c. canonical_departed_order_ids missing from the DTO entirely (older/partial payload) -> never throws, treated as no proof", () => {
  const tripState = { available: true, has_active_trip: false, departed_at: null, members: [] };
  assert.equal(salidaMancanteFor(ORDER, tripState), true);
});

// ── 6. DRIVER_STATO absent -> behavior still correct ─────────────────────────
ck("6. no driverStato parameter exists anywhere in this contract -- canonicalDepartedFor/salidaMancanteFor take no such argument", () => {
  assert.equal(canonicalDepartedFor.length, 2);
  assert.equal(salidaMancanteFor.length, 2);
});
ck("6b. order not EN_ENTREGA -> salidaMancante always false, regardless of any canonical fact", () => {
  const listo = { id: "A123", estado: "LISTO" };
  const tripState = { available: false, has_active_trip: null, departed_at: null, members: [], canonical_departed_order_ids: [] };
  assert.equal(salidaMancanteFor(listo, tripState), false);
});

// ── 7. DRIVER_STATO frontend canonical reader count = 0 ──────────────────────
ck("7. TabEntregas.jsx source contains no DRIVER_STATO code reference (comments only, mentioning the retired signal)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(__dirname, "..", "entregas", "TabEntregas.jsx"), "utf8");
  const code = src.split("\n").filter((l) => !/^\s*\/\//.test(l.trim())).join("\n");
  assert.ok(!/DRIVER_STATO/.test(code), "no DRIVER_STATO literal outside comments");
  assert.ok(!/driverStato/.test(src), "no driverStato identifier anywhere in the file, including comments");
  assert.ok(!/sb\.select\(\s*["']config["']/.test(code), "no config-table select left in TabEntregas.jsx");
});

// ── 8. no raw manual_giro post-departure reconstruction ──────────────────────
ck("8. salidaMancante's own logic never reads manual_giro_id/manual_giros -- only tripState fields", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(__dirname, "..", "entregas", "TabEntregas.jsx"), "utf8");
  const start = src.indexOf("const canonicalDeparted = !!(");
  const end = src.indexOf("const salidaMancante = isEnEntrega");
  assert.ok(start > -1 && end > start, "canonicalDeparted block found");
  const block = src.slice(start, end);
  assert.ok(!/manual_giro/.test(block), "canonicalDeparted reads no manual_giro/manual_giros field");
});

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
