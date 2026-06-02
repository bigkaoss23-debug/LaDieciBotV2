// Test puro di serviceClock (orarioToMs service-day-aware).
// Node puro, no Jest, no rete, no DB.
// Esecuzione: node ladieci-app33/src/utils/serviceClock.test.js
//
// BUG-COCINA-COUNTDOWN-SERVICE-DAY-00XX-01: forno_out 00:xx non deve mostrare
// countdown negativo enorme / falso TARDE quando Cocina è aperta di giorno/sera.

const { orarioToMs, parseHoraToMin } = require("./serviceClock");

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log("PASS  " + name); }
  else    { fail++; console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
};

// now fisso = oggi alle HH:MM (Date locale)
const at = (hh, mm) => { const d = new Date(); d.setHours(hh, mm, 0, 0); return d; };
// diff in minuti tra target (HH:MM) e now
const diffMin = (hora, now) => Math.round((orarioToMs(hora, now) - now.getTime()) / 60000);

// ── parseHoraToMin ──────────────────────────────────────────────
check("parseHoraToMin 00:08 = 8", parseHoraToMin("00:08") === 8);
check("parseHoraToMin 23:52 = 1432", parseHoraToMin("23:52") === 1432);
check("parseHoraToMin invalido = null", parseHoraToMin("xx") === null);

// ── Test 1: now serale, forno_out 00:08 → countdown positivo ─────
// (sera 23:50 E pomeriggio 14:00, entrambi prima rotti/ok)
check("T1a now 23:50, 00:08 → positivo (~18m)", diffMin("00:08", at(23,50)) > 0, String(diffMin("00:08", at(23,50))));
check("T1b now 14:00, 00:08 → positivo (no -1049)", diffMin("00:08", at(14,0)) > 0, String(diffMin("00:08", at(14,0))));

// ── Test 2: now serale, forno_out 00:27 → countdown positivo ─────
check("T2a now 23:50, 00:27 → positivo (~37m)", diffMin("00:27", at(23,50)) > 0, String(diffMin("00:27", at(23,50))));
check("T2b now 14:00, 00:27 → positivo", diffMin("00:27", at(14,0)) > 0, String(diffMin("00:27", at(14,0))));

// ── Test 3: now serale, forno_out 23:52 → countdown corretto ─────
check("T3a now 23:50, 23:52 → +2m", diffMin("23:52", at(23,50)) === 2, String(diffMin("23:52", at(23,50))));
check("T3b now 14:00, 23:52 → positivo (~9h)", diffMin("23:52", at(14,0)) > 0, String(diffMin("23:52", at(14,0))));

// ── Test 4: ordine realmente passato resta TARDE ─────────────────
// now dopo mezzanotte 00:20, forno 00:08 → 12 min fa → negativo (TARDE)
check("T4a now 00:20, 00:08 → TARDE (-12m)", diffMin("00:08", at(0,20)) < 0, String(diffMin("00:08", at(0,20))));
// now serale 21:00, forno 20:30 → 30 min fa → TARDE
check("T4b now 21:00, 20:30 → TARDE (-30m)", diffMin("20:30", at(21,0)) < 0, String(diffMin("20:30", at(21,0))));
// now after-midnight 02:00, forno 00:30 → 90 min fa → TARDE (coda notturna)
check("T4c now 02:00, 00:30 → TARDE (-90m)", diffMin("00:30", at(2,0)) < 0, String(diffMin("00:30", at(2,0))));

// ── Test 5: nessun valore assurdo (-1000) sui target after-midnight ──
const allCases = [
  ["00:08", at(14,0)], ["00:09", at(14,0)], ["00:13", at(15,30)], ["00:27", at(16,45)],
  ["00:08", at(23,50)], ["00:27", at(23,50)], ["00:55", at(13,0)],
];
const anyAbsurd = allCases.some(([h, n]) => diffMin(h, n) <= -1000);
check("T5 nessun countdown <= -1000 min sugli 00:xx diurni/serali", !anyAbsurd,
  JSON.stringify(allCases.map(([h, n]) => `${h}@${n.getHours()}:${String(n.getMinutes()).padStart(2,"0")}=${diffMin(h, n)}`)));

console.log("");
console.log("Totale: " + (pass + fail) + " | PASS: " + pass + " | FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);
