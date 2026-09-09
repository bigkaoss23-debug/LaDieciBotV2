// Test puro di calendarPeriods (periodi di calendario Economía, Europe/Madrid).
// Node puro, no Jest, no rete, no DB.
// Esecuzione: node ladieci-app33/src/utils/calendarPeriods.test.js
//
// Copre: DÍA / SEMANA (mer 09/09/2026) / MES (settembre 2026) / confini
// inclusivo-esclusivo / transizioni DST Europe/Madrid 2026-03-29 e 2026-10-25.

const {
  madridDayKey,
  addDaysKey,
  addMonthsKey,
  isoWeekdayOfKey,
  periodRange,
  rowDayKey,
  rowInPeriod,
} = require("./calendarPeriods");

let pass = 0,
  fail = 0;
const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log("PASS  " + name);
  } else {
    fail++;
    console.log("FAIL  " + name + (detail ? " — " + detail : ""));
  }
};
const eq = (name, got, want) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), "got " + JSON.stringify(got) + " want " + JSON.stringify(want));

// ── isoWeekdayOfKey ────────────────────────────────────────────────
eq("weekday mer 2026-09-09 = 3", isoWeekdayOfKey("2026-09-09"), 3);
eq("weekday lun 2026-09-07 = 1", isoWeekdayOfKey("2026-09-07"), 1);
eq("weekday dom 2026-09-13 = 7", isoWeekdayOfKey("2026-09-13"), 7);
eq("weekday dom 2026-03-29 = 7", isoWeekdayOfKey("2026-03-29"), 7);
eq("weekday dom 2026-10-25 = 7", isoWeekdayOfKey("2026-10-25"), 7);

// ── addDaysKey — aritmetica di calendario, DST-safe ────────────────
eq("addDaysKey +1 fine mese", addDaysKey("2026-09-30", 1), "2026-10-01");
eq("addDaysKey -1 inizio mese", addDaysKey("2026-03-01", -1), "2026-02-28");
eq("addDaysKey +7 attraversa DST primavera", addDaysKey("2026-03-25", 7), "2026-04-01");
eq("addDaysKey +7 attraversa DST autunno", addDaysKey("2026-10-22", 7), "2026-10-29");
eq("addDaysKey +366 anno bisestile 2028", addDaysKey("2028-01-01", 366), "2029-01-01");

// ── SEMANA: mercoledì 09/09/2026 → [lun 07/09, lun 14/09) ─────────
eq(
  "SEMANA(mer 2026-09-09) = [2026-09-07, 2026-09-14)",
  periodRange("sett", "2026-09-09"),
  { start: "2026-09-07", end: "2026-09-14" }
);
eq(
  "SEMANA(lun 2026-09-07) stessa settimana",
  periodRange("sett", "2026-09-07"),
  { start: "2026-09-07", end: "2026-09-14" }
);
eq(
  "SEMANA(dom 2026-09-13) stessa settimana",
  periodRange("sett", "2026-09-13"),
  { start: "2026-09-07", end: "2026-09-14" }
);
eq(
  "SEMANA(lun 2026-09-14) settimana successiva",
  periodRange("sett", "2026-09-14"),
  { start: "2026-09-14", end: "2026-09-21" }
);

// ── MES: settembre 2026 → [01/09, 01/10) ─────────────────────────
eq(
  "MES(2026-09-09) = [2026-09-01, 2026-10-01)",
  periodRange("mese", "2026-09-09"),
  { start: "2026-09-01", end: "2026-10-01" }
);
eq(
  "MES(2026-12-31) rollover anno = [2026-12-01, 2027-01-01)",
  periodRange("mese", "2026-12-31"),
  { start: "2026-12-01", end: "2027-01-01" }
);

// ── TODO / serata → nessun limite di data ────────────────────────
eq("TODO nessun limite", periodRange("tutto", "2026-09-09"), { start: null, end: null });
eq("serata nessun limite (día gestito nel componente per fecha)", periodRange("serata", "2026-09-09"), {
  start: null,
  end: null,
});

// ── Confini inclusivo (start) / esclusivo (end) ──────────────────
const sem = periodRange("sett", "2026-09-09"); // [2026-09-07, 2026-09-14)
check("confine: lunedì 07/09 INCLUSO", rowInPeriod({ fecha: "2026-09-07" }, sem));
check("confine: domenica 13/09 INCLUSA", rowInPeriod({ fecha: "2026-09-13" }, sem));
check("confine: lunedì 14/09 ESCLUSO", !rowInPeriod({ fecha: "2026-09-14" }, sem));
check("confine: sabato 06/09 (settimana prima) ESCLUSO", !rowInPeriod({ fecha: "2026-09-06" }, sem));

const mes = periodRange("mese", "2026-09-09"); // [2026-09-01, 2026-10-01)
check("MES: 01/09 INCLUSO", rowInPeriod({ fecha: "2026-09-01" }, mes));
check("MES: 30/09 INCLUSO", rowInPeriod({ fecha: "2026-09-30" }, mes));
check("MES: 01/10 ESCLUSO", !rowInPeriod({ fecha: "2026-10-01" }, mes));
check("MES: 31/08 ESCLUSO", !rowInPeriod({ fecha: "2026-08-31" }, mes));

// ── TODO include qualsiasi data ─────────────────────────────────
const todo = periodRange("tutto", "2026-09-09");
check("TODO include 2026-05-01", rowInPeriod({ fecha: "2026-05-01" }, todo));
check("TODO include 2020-01-01", rowInPeriod({ fecha: "2020-01-01" }, todo));
check("TODO include riga senza fecha", rowInPeriod({ ts: 1788726554125 }, todo));

// ── DÍA: filtro per singola data (rowDayKey === giorno scelto) ───
check("DÍA 2026-09-06: riga stessa data", rowDayKey({ fecha: "2026-09-06" }) === "2026-09-06");
check(
  "DÍA: rowDayKey ignora eventuale suffisso orario",
  rowDayKey({ fecha: "2026-09-06T21:15:00" }) === "2026-09-06"
);
check(
  "DÍA: fallback rowDayKey da ts (ms) → giorno Madrid",
  rowDayKey({ ts: 1788726554125 }) === madridDayKey(new Date(1788726554125))
);

// ── DST Europe/Madrid — primavera: 2026-03-29 02:00 → 03:00 (CET→CEST) ──
// La settimana di calendario NON deve saltare/perdere un giorno.
eq(
  "SEMANA(dom 2026-03-29) = [2026-03-23, 2026-03-30)",
  periodRange("sett", "2026-03-29"),
  { start: "2026-03-23", end: "2026-03-30" }
);
eq(
  "MES(marzo 2026) = [2026-03-01, 2026-04-01)  (31 giorni interi)",
  periodRange("mese", "2026-03-15"),
  { start: "2026-03-01", end: "2026-04-01" }
);
check(
  "DST primavera: 31/03 23:30 locale è dentro marzo",
  rowInPeriod({ fecha: "2026-03-31" }, periodRange("mese", "2026-03-15"))
);
// madridDayKey attorno all'istante del salto (01:00 UTC = 02:00 CET → 03:00 CEST)
check(
  "madridDayKey 2026-03-29T01:30Z (=03:30 CEST) → 2026-03-29",
  madridDayKey(new Date("2026-03-29T01:30:00Z")) === "2026-03-29"
);
check(
  "madridDayKey 2026-03-28T22:30Z (=23:30 CET) → 2026-03-28",
  madridDayKey(new Date("2026-03-28T22:30:00Z")) === "2026-03-28"
);
check(
  "madridDayKey 2026-03-28T23:30Z (=00:30 CET del 29) → 2026-03-29",
  madridDayKey(new Date("2026-03-28T23:30:00Z")) === "2026-03-29"
);

// ── DST Europe/Madrid — autunno: 2026-10-25 03:00 → 02:00 (CEST→CET) ──
eq(
  "SEMANA(dom 2026-10-25) = [2026-10-19, 2026-10-26)",
  periodRange("sett", "2026-10-25"),
  { start: "2026-10-19", end: "2026-10-26" }
);
eq(
  "MES(ottobre 2026) = [2026-10-01, 2026-11-01)",
  periodRange("mese", "2026-10-25"),
  { start: "2026-10-01", end: "2026-11-01" }
);
check(
  "madridDayKey 2026-10-25T00:30Z (=02:30 CEST) → 2026-10-25",
  madridDayKey(new Date("2026-10-25T00:30:00Z")) === "2026-10-25"
);
check(
  "madridDayKey 2026-10-25T01:30Z (=02:30 CET, dopo il ritorno) → 2026-10-25",
  madridDayKey(new Date("2026-10-25T01:30:00Z")) === "2026-10-25"
);
check(
  "madridDayKey 2026-10-24T21:30Z (=23:30 CEST) → 2026-10-24",
  madridDayKey(new Date("2026-10-24T21:30:00Z")) === "2026-10-24"
);

// ── Robustezza input ────────────────────────────────────────────
eq("periodRange refKey invalido → cade su oggi, forma valida (sett)", typeof periodRange("sett", "boh").start, "string");
check("rowInPeriod range null → true", rowInPeriod({ fecha: "2026-01-01" }, null));
check("rowInPeriod riga null in periodo con bordi → false", !rowInPeriod(null, sem));

// ── addMonthsKey — navigazione MES (ancora sempre al giorno 01) ──
eq("addMonthsKey -1 da settembre", addMonthsKey("2026-09-01", -1), "2026-08-01");
eq("addMonthsKey -1 ancora al 01 anche da metà mese", addMonthsKey("2026-09-15", -1), "2026-08-01");
eq("addMonthsKey +1 da settembre", addMonthsKey("2026-09-01", 1), "2026-10-01");
eq("addMonthsKey -1 rollover anno indietro", addMonthsKey("2026-01-01", -1), "2025-12-01");
eq("addMonthsKey +1 rollover anno avanti", addMonthsKey("2026-12-01", 1), "2027-01-01");
eq("addMonthsKey -4 da settembre → maggio (primo mese storico)", addMonthsKey("2026-09-01", -4), "2026-05-01");
eq("addMonthsKey -13 (oltre l'anno)", addMonthsKey("2026-09-01", -13), "2025-08-01");
eq("addMonthsKey chiave invalida → null", addMonthsKey("boh", 1), null);

// ── Navigazione SEMANA: reference-key → range, avanti/indietro con addDaysKey(±7) ──
eq(
  "SEMANA nav: reference 2026-09-06 (domenica) → settimana [2026-08-31, 2026-09-07)",
  periodRange("sett", "2026-09-06"),
  { start: "2026-08-31", end: "2026-09-07" }
);
eq(
  "SEMANA nav: settimana precedente = start - 7",
  periodRange("sett", addDaysKey("2026-08-31", -7)),
  { start: "2026-08-24", end: "2026-08-31" }
);
eq(
  "SEMANA nav: settimana successiva = start + 7 → settimana corrente",
  periodRange("sett", addDaysKey("2026-08-31", 7)),
  { start: "2026-09-07", end: "2026-09-14" }
);

// ── Navigazione MES: mesi realmente presenti nello storico produzione ──
eq("MES nav: Mayo 2026",      periodRange("mese", "2026-05-10"), { start: "2026-05-01", end: "2026-06-01" });
eq("MES nav: Junio 2026",     periodRange("mese", "2026-06-15"), { start: "2026-06-01", end: "2026-07-01" });
eq("MES nav: Julio 2026",     periodRange("mese", "2026-07-20"), { start: "2026-07-01", end: "2026-08-01" });
eq("MES nav: Agosto 2026",    periodRange("mese", "2026-08-05"), { start: "2026-08-01", end: "2026-09-01" });
eq("MES nav: Septiembre 2026",periodRange("mese", "2026-09-01"), { start: "2026-09-01", end: "2026-10-01" });

console.log("");
console.log("Totale: " + (pass + fail) + " | PASS: " + pass + " | FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);
