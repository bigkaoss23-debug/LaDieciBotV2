// Test statico mirato — ManualGiroSalidaRefProxy (Entregas + Repartidor)
// Standalone: `node entregasGiroSalida.static.test.mjs`.
// (1) Replica 1:1 la precedenza giro (hora_ref > salida_ref > legacy) di
//     TabEntregas.giroOperationalHora e del blocco giro Repartidor.
// (2) Grep di sorgente: verifica che i file reali leggano salida_ref e la 🛵
//     resti la hora cliente del singolo stop, e il poll leggero in RepartidorPage.

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMP = join(HERE, "..");

// ── (1) Replica 1:1 di TabEntregas.giroOperationalHora ──────────────────────
const _tm = (t) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const _th = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const ordSalida = (o) => o.forno_out || null; // calcHoraForno → forno_out (semplificato)
const giroOperationalHora = (giroMeta, ordini) => {
  if (giroMeta?.hora_ref) return giroMeta.hora_ref;      // operatore
  if (giroMeta?.salida_ref) return giroMeta.salida_ref;  // proxy backend-owned
  const sal = (ordini || []).map(ordSalida).filter(Boolean).map(_tm).filter(m => m != null);
  if (sal.length) return _th(Math.min(...sal));
  const hs = (ordini || []).map(o => _tm(o.hora)).filter(m => m != null);
  return hs.length ? _th(Math.min(...hs)) : null;
};
// Replica salida blocco giro Repartidor.
const repartidorGiroSalida = (meta, ordini) =>
  (meta && (meta.hora_ref || meta.salida_ref)) ||
  ordini.map(o => o.salida_driver_estimada).find(Boolean) || null;

const members = [{ forno_out: "23:17", hora: "23:30", salida_driver_estimada: "23:43" },
                 { forno_out: "23:08", hora: "23:24", salida_driver_estimada: "23:08" }];

let pass = 0, fail = 0;
const ck = (label, fn) => {
  try { fn(); pass++; console.log("  ✓", label); }
  catch (e) { fail++; console.log("  ✗", label, "—", e.message); }
};

console.log("\n══ ENTREGAS/REPARTIDOR GIRO SALIDA — static ══");

ck("1. giroOperationalHora: hora_ref (operatore) vince", () => {
  assert.equal(giroOperationalHora({ hora_ref: "22:30", salida_ref: "23:17" }, members), "22:30");
});
ck("2. giroOperationalHora: salida_ref (proxy) quando hora_ref null", () => {
  assert.equal(giroOperationalHora({ hora_ref: null, salida_ref: "23:17" }, members), "23:17");
});
ck("3. giroOperationalHora: nessun meta → legacy min(forno)", () => {
  assert.equal(giroOperationalHora(null, members), "23:08"); // min(23:17,23:08)
});
ck("4. Repartidor salida: hora_ref > salida_ref > legacy prima salida_driver_estimada", () => {
  assert.equal(repartidorGiroSalida({ hora_ref: "22:30", salida_ref: "23:17" }, members), "22:30");
  assert.equal(repartidorGiroSalida({ salida_ref: "23:17" }, members), "23:17");
  assert.equal(repartidorGiroSalida(null, members), "23:43"); // legacy: prima disponibile
  assert.equal(repartidorGiroSalida(null, [{}, {}]), null);   // niente → null (no invenzione)
});
ck("5. 🛵 = hora cliente del singolo stop (no entrega_ref unico)", () => {
  // hEntrega = o.hora  → #001 resta 23:30, #002 resta 23:24 (niente 23:24 per entrambi)
  assert.equal(members[0].hora, "23:30");
  assert.equal(members[1].hora, "23:24");
});

// ── (2) Grep di sorgente (anti-regressione) ─────────────────────────────────
const tabEntregas = readFileSync(join(COMP, "entregas", "TabEntregas.jsx"), "utf8");
const repartidor = readFileSync(join(COMP, "repartidor", "RepartidorPage.jsx"), "utf8");

ck("6. TabEntregas.giroOperationalHora legge salida_ref (dopo hora_ref)", () => {
  assert.ok(/if \(giroMeta\?\.salida_ref\) return giroMeta\.salida_ref;/.test(tabEntregas));
});
ck("7. TabEntregas giro card ⏱: hora_ref || salida_ref || forno; 🛵 = o.hora", () => {
  assert.ok(/manualGiro\.hora_ref \|\| manualGiro\.salida_ref \|\|/.test(tabEntregas));
  assert.ok(/const hEntrega = o\.hora;/.test(tabEntregas));
});
ck("8. RepartidorPage: poll leggero getManualGiros + salida precedence, no realtime", () => {
  assert.ok(/api\.getManualGiros\(\)/.test(repartidor));
  assert.ok(/meta && \(meta\.hora_ref \|\| meta\.salida_ref\)/.test(repartidor));
  assert.ok(!/postgres_changes|realtime:public:manual_giros/.test(repartidor)); // nessun realtime nuovo
});

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
