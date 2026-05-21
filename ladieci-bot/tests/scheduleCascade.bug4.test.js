// DS-5-A — Bug #4 reproduction: cascade aggregation NON propaga forno_out a
// valle. Quando si aggiunge O3 stesso Q2/slot10 di O1 (worst-case tg sale),
// il rientro Q2 slitta ⇒ partenza Q3 slitta ⇒ il forno_out di O2 dovrebbe
// muoversi avanti, ma quello PERSISTITO in DB resta calcolato sullo stato
// vecchio. Risultato reale visto in produzione: pizza O2 esce dal forno
// troppo presto e resta fredda sul bancone.
//
// NOTA: questo test è un BUG REPRO. È atteso che diventi obsoleto / vada
// aggiornato quando il bug #4 sarà fixato (forno_out cascade-aware in scrittura
// o ricalcolato server-side ad ogni aggregazione). Niente fix qui — solo prova
// controllata e deterministica del mismatch.
//
// Nessun DB, nessuna rete, nessuna env. Solo le funzioni reali esportate da
// ladieci-bot/src/utils/zones.js.

const { simulateDriverSchedule, calcolaFornoOut } =
  require("../src/utils/zones.js");

// Scenario fisso (vedi DELIVERY_STRESS_TEST_PLAN, bug #4).
const O1 = {
  id: "O1", tipo_consegna: "DOMICILIO", estado: "EN_COCINA",
  zona: "Q2", zona_lat: null, zona_lon: null,
  hora: "21:45", durata_andata_min: 8,
};
const O2 = {
  id: "O2", tipo_consegna: "DOMICILIO", estado: "EN_COCINA",
  zona: "Q3", zona_lat: null, zona_lon: null,
  hora: "22:00", durata_andata_min: 10,
};
const O3 = {
  id: "O3", tipo_consegna: "DOMICILIO", estado: "EN_COCINA",
  zona: "Q2", zona_lat: null, zona_lon: null,
  hora: "21:45", durata_andata_min: 14,
};

function fmt(m) {
  if (m == null) return "—";
  return String(Math.floor(m/60)).padStart(2,"0") + ":" + String(m%60).padStart(2,"0");
}

// 1) Stato iniziale (solo O1, O2).
const simA = simulateDriverSchedule([O1, O2]);
const giroQ2_A = simA.giri.find(g => g.zona === "Q2");
const giroQ3_A = simA.giri.find(g => g.zona === "Q3");

// 2) forno_out PERSISTITO di O2: come fu calcolato quando O2 fu creato,
//    cioè con driver_libero = rientro di O1 (stato pre-O3).
const driverLiberoPreO2 = simulateDriverSchedule([O1]).driverLiberoMin;
const fornoO2_persisted = calcolaFornoOut({
  tipoConsegna: "DOMICILIO",
  hora: O2.hora,
  durataAndataMin: O2.durata_andata_min,
  driverLiberoMin: driverLiberoPreO2,
}).forno_out;

// 3) Aggregazione: arriva O3 stesso Q2 stesso slot10 di O1.
const simB = simulateDriverSchedule([O1, O2, O3]);
const giroQ2_B = simB.giri.find(g => g.zona === "Q2");
const giroQ3_B = simB.giri.find(g => g.zona === "Q3");

// 4) forno_out CORRETTO di O2 dopo aggregazione: driver_libero = rientro Q2 nuovo.
const fornoO2_corretto = calcolaFornoOut({
  tipoConsegna: "DOMICILIO",
  hora: O2.hora,
  durataAndataMin: O2.durata_andata_min,
  driverLiberoMin: giroQ2_B.rientroMin,
}).forno_out;

console.log("Stato A — pre aggregazione (O1, O2)");
console.log("  Q2: part " + fmt(giroQ2_A.partenzaMin) + " · consegna " + fmt(giroQ2_A.consegnaMin) + " · rientro " + fmt(giroQ2_A.rientroMin) + " (tg=" + giroQ2_A.tg + ")");
console.log("  Q3: part " + fmt(giroQ3_A.partenzaMin) + " · consegna " + fmt(giroQ3_A.consegnaMin) + " · rientro " + fmt(giroQ3_A.rientroMin) + " (tg=" + giroQ3_A.tg + ")");
console.log("  forno_out O2 (persistito allo stato A): " + fornoO2_persisted);

console.log("");
console.log("Stato B — post aggregazione (O1, O2, O3 same-zone-slot di O1)");
console.log("  Q2: part " + fmt(giroQ2_B.partenzaMin) + " · consegna " + fmt(giroQ2_B.consegnaMin) + " · rientro " + fmt(giroQ2_B.rientroMin) + " (tg=" + giroQ2_B.tg + ")");
console.log("  Q3: part " + fmt(giroQ3_B.partenzaMin) + " · consegna " + fmt(giroQ3_B.consegnaMin) + " · rientro " + fmt(giroQ3_B.rientroMin) + " (tg=" + giroQ3_B.tg + ")");
console.log("  forno_out O2 (ricalcolato dopo aggregazione): " + fornoO2_corretto);

console.log("");
console.log("Atteso bug #4: forno_out persistito di O2 ≠ ricalcolato.");
console.log("  persistito:  " + fornoO2_persisted);
console.log("  ricalcolato: " + fornoO2_corretto);

// Sanity: i due giri sono effettivamente cambiati (Q2 tg da 8 a 14, Q3 partenza slittata).
const q2TgSalito  = giroQ2_B.tg > giroQ2_A.tg;
const q3Slittato  = giroQ3_B.partenzaMin > giroQ3_A.partenzaMin;
const fornoMismatch = fornoO2_persisted !== fornoO2_corretto;

const bugRiprodotto = q2TgSalito && q3Slittato && fornoMismatch;

if (bugRiprodotto) {
  console.log("");
  console.log("PASS — bug #4 riprodotto: aggregazione Q2 spinge avanti Q3 e il");
  console.log("forno_out persistito di O2 (" + fornoO2_persisted + ") è anticipato di " +
    ((toMinLocal(fornoO2_corretto) - toMinLocal(fornoO2_persisted))) + " min rispetto al ricalcolato (" + fornoO2_corretto + ").");
  process.exit(0);
} else {
  console.log("");
  console.log("FAIL — scenario non riprodotto come atteso:");
  console.log("  q2_tg_salito="  + q2TgSalito);
  console.log("  q3_slittato="   + q3Slittato);
  console.log("  forno_mismatch=" + fornoMismatch);
  process.exit(1);
}

function toMinLocal(t) {
  const [h,m] = String(t).split(":").map(Number);
  return h*60 + (m||0);
}
