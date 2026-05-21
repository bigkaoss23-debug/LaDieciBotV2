// DS-5-C — Regression: schedule-sync downstream after delivery aggregation.
//
// Storia: questo test nasceva come bug-repro (DS-5-A, commit 09d4c55) e
// dimostrava il bug #4: aggregando un ordine same-zone-slot che alza tg, il
// giro a valle slittava ma il forno_out persistito dei suoi ordini restava
// vecchio. DS-5-C ha esteso `risincronizzaGiro` in agentOrdini.js per
// propagare la sync a TUTTI i giri attivi (non solo il giro target).
// Ora il test verifica la regressione del fix.
//
// Nessun DB, nessuna rete, nessuna env. Si testa la funzione pura
// `planFornoOutSync(rows)` esportata da agentOrdini.js, che è il core
// cascade-aware estratto da `risincronizzaGiro`. Il wrapper sb-aware è un
// thin loop di sbUpdate sulle update calcolate qui.

const { planFornoOutSync } = require("../src/agents/agentOrdini.js");

let pass = 0, fail = 0;
const log = (ok, name, detail) => {
  if (ok) { pass++; console.log("PASS  " + name); }
  else    { fail++; console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
};

// ---- Scenario fissi (vedi DELIVERY_STRESS_TEST_PLAN, bug #4) ----------------
const O1 = {
  id: "O1", tipo_consegna: "DOMICILIO", estado: "EN_COCINA",
  zona: "Q2", hora: "21:45", durata_andata_min: 8, forno_out: "21:37",
};
const O2_EN_COCINA = {
  id: "O2", tipo_consegna: "DOMICILIO", estado: "EN_COCINA",
  zona: "Q3", hora: "22:00", durata_andata_min: 10, forno_out: "21:56",
};
const O2_LISTO = { ...O2_EN_COCINA, estado: "LISTO" };
const O3_AGGREGA = {
  id: "O3", tipo_consegna: "DOMICILIO", estado: "NUEVO",
  zona: "Q2", hora: "21:45", durata_andata_min: 14, forno_out: null,
};
const O3_NO_AGGREGATE = {
  id: "O3", tipo_consegna: "DOMICILIO", estado: "NUEVO",
  zona: "Q5", hora: "22:30", durata_andata_min: 30, forno_out: null,
};

// ---- 1) pre aggregazione: nessuna drift, nessun update ---------------------
{
  const u = planFornoOutSync([O1, O2_EN_COCINA]);
  const touchO2 = u.find(x => x.id === "O2");
  log(!touchO2, "pre-aggregazione: O2 (EN_COCINA) non viene mosso",
    touchO2 ? `update inatteso: ${JSON.stringify(touchO2)}` : "");
}

// ---- 2) post aggregazione: O2 downstream deve essere allineato a 22:02 ----
//
// Atteso: Q2 con tg=14 → rientro 21:45+3+14 = 22:02. Q3 partenza = max(22:02,
// 22:00-10=21:50) = 22:02. O2.forno_out deve passare da "21:56" a "22:02".
{
  const u = planFornoOutSync([O1, O2_EN_COCINA, O3_AGGREGA]);
  const upd = u.find(x => x.id === "O2");
  const ok = upd && upd.forno_out_old === "21:56" && upd.forno_out_new === "22:02";
  log(ok, "post-aggregazione: O2 viene allineato a 22:02",
    upd ? JSON.stringify(upd) : "nessun update emesso per O2");
}

// ---- 3) guardia LISTO: O2 in LISTO non deve essere toccato -----------------
{
  const u = planFornoOutSync([O1, O2_LISTO, O3_AGGREGA]);
  const touchO2 = u.find(x => x.id === "O2");
  log(!touchO2, "guardia LISTO: O2 in LISTO non viene mosso",
    touchO2 ? `update vietato emesso: ${JSON.stringify(touchO2)}` : "");
}

// ---- 4) no-aggregation: O3 in zona diversa e ora più tarda → no update O2 -
{
  const u = planFornoOutSync([O1, O2_EN_COCINA, O3_NO_AGGREGATE]);
  const touchO2 = u.find(x => x.id === "O2");
  log(!touchO2, "no-aggregation: O3 in Q5 22:30 lascia O2 invariato",
    touchO2 ? `update inutile: ${JSON.stringify(touchO2)}` : "");
}

// ---- 5) guardie aggiuntive: stati esclusi non ricevono update --------------
{
  const variants = ["POR_CONFIRMAR", "EN_ENTREGA", "RETIRADO", "COMPLETATO"];
  let allGuarded = true;
  for (const st of variants) {
    const rows = [O1, { ...O2_EN_COCINA, estado: st }, O3_AGGREGA];
    const touchO2 = planFornoOutSync(rows).find(x => x.id === "O2");
    if (touchO2) { allGuarded = false; console.log("    bleed-through stato=" + st + ": " + JSON.stringify(touchO2)); }
  }
  log(allGuarded, "guardia stati esclusi (POR_CONFIRMAR/EN_ENTREGA/RETIRADO/COMPLETATO)");
}

console.log("");
console.log("Totale: " + (pass + fail) + " | PASS: " + pass + " | FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);
