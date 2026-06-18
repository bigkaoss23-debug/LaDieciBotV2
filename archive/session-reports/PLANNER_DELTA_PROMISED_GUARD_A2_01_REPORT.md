# PLANNER_DELTA_PROMISED_GUARD_A2_01 — REPORT

**Data:** 2026-06-14
**Tipo:** BLOCCO A.2 — seconda guardia `Δpromised >25` (audit + patch + test, NO deploy)
**Esito:** ✅ **OK — guardia implementata, 6 test nuovi verdi, 62/62 file backend verdi, zero regressioni**
**Safety:** zero deploy · zero push main · zero commit · zero DB write · zero frontend · zero Netlify · zero Railway · `ORDINI_2026-05-23.md` non toccato

---

## 1. Contesto

Lo slip guard (`6e2b529`, live su `d623be4a`) chiude i casi dove un'aggregazione **spinge in ritardo** un ordine (slip > 15 → `no_recomendado`). Resta un gap residuo: due ordini con **orari promessi molto distanti** possono essere batchati senza generare slip "in ritardo" — es. ordine nuovo molto più tardi appeso in coda → consegnato in forte **anticipo** → nessuno slip da catturare. Lo slip conta solo la lateness. Questo è il BLOCCO A.2 (`Δpromised`), modellato sul guardrail manual-giro "Horarios >25 min".

---

## 2. Audit (root cause + layer corretto)

- `routeImpact.js` (motore puro, condiviso con manual giro) calcola slip per fermata ma **non** ragiona sul divario tra le *promesse*.
- La classificazione finale dell'aggregazione strategica avviene in `src/agents/previewStrategicOpportunities.js → mapCandidateToOpportunity`:
  1. travel mancanti → `no_recomendado` (blocked);
  2. **cross-channel → forza `no_recomendado`** *dopo* il bridge (override strategico);
  3. altrimenti status da `buildRouteImpact` (slip guard).
- Layer scelto: **stesso punto del cross-channel** (`mapCandidateToOpportunity`), come terzo override strategico. Lì sono disponibili sia `currentOrder` che `anchor`; `cand.routeImpactInput.stops` porta `.promised` per ogni fermata (`sanitizeAnchor:234` mappa `hora`→`promised`).
- **Manual giro NON è interessato**: passa per `previewManualGiroRoute`, path separato → conserva il suo comportamento e il suo guardrail UI. Evita anche il rischio di toccare il motore condiviso `routeImpact`.

---

## 3. Patch

File: `src/agents/previewStrategicOpportunities.js` (+42 righe)

1. Costante `PROMISED_GAP_NO_RECOMENDADO_MIN = 25` (sopra la spaziatura naturale di un giro in-canale ~15-20 min; mirror del manual-giro "Horarios >25 min").
2. Helper `maxPromisedGap(stops)`: massimo divario tra le ore promesse valide (via `toClockMin`, night-service-aware); `<2` promesse note → `null` (nessun giudizio).
3. Override in `mapCandidateToOpportunity` (dopo cross-channel, prima del return finale):
   ```js
   const promisedGap = maxPromisedGap(cand.routeImpactInput.stops);
   if (promisedGap != null && promisedGap > PROMISED_GAP_NO_RECOMENDADO_MIN &&
       STATUS_RANK[opp.status] < STATUS_RANK.no_recomendado) {
     opp.status = "no_recomendado";
     if (!opp.warning) opp.warning = `Horarios lejanos: ${promisedGap} min entre pedidos (máx 25)`;
     ...
   }
   ```

Caratteristiche:
- **Additivo** allo slip guard (asse diverso: distanza promesse vs lateness), non lo sostituisce.
- **Forzabile** (`blocked` resta false) come lo slip guard: esce dai bottoni di aggregazione rapida (compatible|ajuste) ma resta forzabile con avviso. (Il cross-channel invece è blocked=true: scelta più dura, lasciata invariata.)
- **Non degrada** mai uno status già `no_recomendado`/`lleno` (guard `STATUS_RANK < no_recomendado`).
- **Non scatta** sul single-stop "crear" (un solo `promised` → gap `null`) → direct happy path intatto.

---

## 4. Test

File: `tests/previewStrategicOpportunities.test.js` (+46 righe, blocco "Δpromised guard (BLOCCO A.2)")

Capacity larga locale (`routeMinLimit:240`, `pizzaQualityLimitMin:240`) per **isolare** la guardia gap da ruta-larga/qualità:

| Test | Esito |
|---|---|
| gap 50 (>25) → `no_recomendado` | ✅ |
| gap 50 → warning `Horarios lejanos` (non slip) | ✅ |
| boundary gap **25** → NON scatta (soglia è `>25`) | ✅ |
| boundary gap **26** → `no_recomendado` Horarios lejanos | ✅ |
| gap 10 → invariato (no block, no warning gap) | ✅ |
| single-stop "crear" → mai gap block | ✅ |

**Prova di valore aggiunto:** nel caso gap 50 lo status pre-override era `compatible`/`ajuste` (warning = "Horarios lejanos", non un messaggio di slip) → lo **slip guard non lo catturava**. La guardia A.2 aggiunge copertura reale.

### Suite (eseguite con `node` diretto — i runner sono standalone con `process.exit`)
- `previewStrategicOpportunities`: **127 passed, 0 failed** (era 121, +6 nuovi)
- `routeImpact` 87 · `strategicOpportunities` 75 · `previewManualGiroRoute` 82 · `previewStrategicOpportunitiesStaleness` 25 → tutti invariati
- **Full backend: 62/62 file PASS (exit 0), 0 failed.**

> Nota harness: `npx jest` (run aggregato) marca questi file come "FAIL" perché intercetta `process.exit()` dei runner standalone — **falso positivo**. Verificato eseguendo ogni file con `node` (es. `manualGiros.test.js` → "OK"). Il segnale affidabile è l'exit code per-file.

---

## 5. Regressioni

**Nessuna.** Le suite esistenti restano invariate; in particolare manual giro (82) e direct/compatible (test 1 strategic, gap 10 → compatible) non cambiano.

---

## 6. Git status

`/Users/bigart/Downloads/ladieci-bot`, branch `backup/v2-route-impact-slip-guard-2026-06-14`, HEAD `6e2b529`:
- `M src/agents/previewStrategicOpportunities.js` (+42)
- `M tests/previewStrategicOpportunities.test.js` (+46)
- **Nessun commit, nessun push, working tree modificato (non staged).**
- `origin/main` invariato (`0bb9d8c`).

---

## 7. Safety

| Vincolo | Stato |
|---|---|
| Zero deploy / Railway / Netlify | ✅ |
| Zero push main / commit | ✅ |
| Zero DB write / frontend | ✅ |
| `ORDINI_2026-05-23.md` non toccato | ✅ |

---

## Verdetto

✅ **OK** — BLOCCO A.2 implementato al layer corretto (override strategico in `mapCandidateToOpportunity`, mirror del cross-channel ma forzabile come lo slip guard). Gap > 25 min tra promesse → `no_recomendado` con warning "Horarios lejanos"; boundary 25/26 corretto; manual giro e direct/compatible intatti; 6 test nuovi + 62/62 file backend verdi.

**Soglia tunabile:** `PROMISED_GAP_NO_RECOMENDADO_MIN = 25` (il prompt indicava "25/30"). Ho scelto 25 per allinearmi al guardrail manual-giro "Horarios >25 min"; alzarla a 30 è un'unica costante.

**Prossimo passo (a tua scelta):** committare A.2 + backup branch (come fatto per lo slip guard), oppure validazione live durante servizio reale. NON committato/deployato senza tua conferma.
