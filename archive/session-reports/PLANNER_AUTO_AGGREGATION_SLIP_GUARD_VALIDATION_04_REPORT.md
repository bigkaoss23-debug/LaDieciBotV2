# PLANNER_AUTO_AGGREGATION_SLIP_GUARD_VALIDATION_04 — REPORT

**Data:** 2026-06-14
**Tipo:** Validazione offline / read-only del commit backend `6e2b529` (slip guard)
**Esito:** ✅ **OK — deploy `6e2b529` consigliato**
**Safety:** zero deploy · zero DB write · zero frontend · zero cleanup · zero push main · nessuna nuova patch · `ORDINI_2026-05-23.md` non toccato

---

## 1. Branch / commit attuale

Repo backend: `/Users/bigart/Downloads/ladieci-bot`

| Voce | Valore |
|---|---|
| Branch | `backup/v2-route-impact-slip-guard-2026-06-14` |
| HEAD | `6e2b529a5b8410466f46bf89c53795dbde94e8a3` — *fix classify large route slips as not recommended* |
| Working tree | clean |
| `origin/main` | `0bb9d8c` (NON toccato) |
| Backend live (Railway) | deploy `78baa172…`, ≈ commit `96ec441` (too-early guard live) — **slip guard NON live** |

Frontend repo `/Users/bigart/Downloads/LaDieciBotV2-github`: nessuna modifica fatta in questa sessione (solo questo report aggiunto). `PremiumPlannerPopup.jsx` WIP non toccato.

---

## 2. Preflight

- `git status` backend → working tree clean, su branch slip-guard.
- HEAD = `6e2b529` confermato.
- `origin/main` = `0bb9d8c` invariato.
- Patch ispezionata in `src/core/delivery/routeImpact.js`:
  - costante `NO_RECOMENDADO_SLIP_MIN = 15` (riga 176);
  - `buildRouteImpact` calcola `maxSlip` da `_slipMin` (riga 269, prima scartato);
  - `classifyRouteImpact` riga 190: `if (anySlip && maxSlip > 15) → no_recomendado`; slip ≤ soglia → `ajuste` (riga 191);
  - `buildWarning` preserva `"X se mueve +N min"` anche su `no_recomendado` guidato da slip (righe 206–215).
- Frontend `PremiumPlannerPopup.jsx`: render-only, nessuna aggregazione inventata (confermato dalle note di sessione, non re-ispezionato qui).

---

## 3. Test / simulazioni eseguite

### Suite esistenti (regressione)

| Suite | Risultato |
|---|---|
| `tests/routeImpact.test.js` | **87 passed, 0 failed** |
| `tests/previewManualGiroRoute.test.js` | **82 passed, 0 failed** |
| `tests/strategicOpportunities.test.js` | **75 passed, 0 failed** |
| `tests/previewStrategicOpportunities.test.js` | **121 passed, 0 failed** |

### Simulazione offline scenari 5-zone

Script temporaneo usa-e-getta che chiama `buildRouteImpact` (motore PURO, nessun DB/fetch) ricostruendo i casi reali del test. Creato, eseguito, **rimosso** (tree backend di nuovo clean).

---

## 4. Risultati A–E

| # | Scenario | Atteso | Ottenuto | Slip | Warning |
|---|---|---|---|---|---|
| **A** | Q1→Q2 same-channel, anchor Q1 15:00 spinto a 15:45 | `no_recomendado` | ✅ `no_recomendado` | Q1 **+45**, Q2 +13 | `Q1 se mueve +45 min · Q2 se mueve +13 min` |
| **B** | Q3→Q4 same-channel, anchor Q3 16:20 spinto a 17:08 | `no_recomendado` | ✅ `no_recomendado` | Q3 **+48**, Q4 +16 | `Q3 se mueve +48 min · …` |
| **B2** | Estremo +127 (caso Q5 riepilogo) | `no_recomendado` | ✅ `no_recomendado` | Q3 **+127** | `Q3 se mueve +127 min · …` |
| **C** | Manual giro Q3+Q4 start 16:20, sano | `ajuste` | ✅ `ajuste` | Q3 **+8** | `Q3 se mueve +8 min` |
| **D** | Cross-channel Q1→Q3, tempi lontani | `no_recomendado` | ✅ `no_recomendado` | Q1 **+80**, Q3 +8 | `Q1 se mueve +80 min · …` |
| **E** | Direct happy path, single stop, no slip | `compatible` | ✅ `compatible` | nessuno | — |
| BND | Boundary +15 | `ajuste` | ✅ `ajuste` | +15 | — |
| BND | Boundary +16 | `no_recomendado` | ✅ `no_recomendado` | +16 | — |

**OVERALL: ALL PASS (8/8).**

Punti chiave:
- I casi tossici **+45 / +48 / +127** ora sono `no_recomendado` → escono dai bottoni di aggregazione rapida (che ammettono solo `compatible|ajuste`), restano forzabili con avviso.
- Il warning conserva la magnitudine reale (`+45`, `+127`), quindi l'utente vede quanto si sposta l'ordine — niente perdita di informazione passando a `no_recomendado`.
- Manual giro sano **+8 resta `ajuste`** → nessuna regressione sul percorso buono.
- Boundary esatto confermato: **+15 = ajuste**, **+16 = no_recomendado** (soglia `> 15`).

---

## 5. Regressioni

**Nessuna.**
- 4 suite esistenti tutte verdi (365 assert totali, 0 failed).
- Direct happy path (E) resta `compatible`: nessun falso blocco su consegna diretta.
- Manual giro +8 (C) resta `ajuste`: nessuna regressione sul motore autoritativo.

---

## 6. Decisione consigliata

### ✅ Deploy `6e2b529` (Strada 1)

La patch chiude esattamente il bug osservato nel test 5-zone (auto-aggregazione same-channel che classificava `ajuste` slip enormi) ed è confermata su tutti gli scenari reali + boundary. È piccola, isolata al motore puro `routeImpact.js`, e l'intera suite è verde. Procedere con preflight + smoke read-only quando autorizzato (questa sessione **non** deploya).

### La seconda guardia `Δpromised >25/30` (Strada 2) NON è bloccante per il deploy

Lo slip guard copre già il caso reale: aggregare ordini con promesse lontane spinge fisicamente in ritardo l'ancora → slip grande → `no_recomendado` (vedi scenario D, Q1→Q3 con Δpromised 80 min → +80 → bloccato).

Residuo che `Δpromised` coprirebbe e lo slip guard **non** cattura: un nuovo ordine con promessa molto più tardi che viene *appeso dopo* senza spingere l'ancora — verrebbe consegnato troppo **in anticipo** (lo slip conta solo i ritardi, non gli anticipi). Questo è però già parzialmente coperto dal **too-early guard live (`96ec441`)**.

**Raccomandazione:** deployare `6e2b529` ora come blocco autonomo; trattare `Δpromised >25/30` come **BLOCCO A.2 separato** (richiede nuova calibrazione soglia + test propri, rischio falsi negativi se non tarata). Non accorparlo a questo deploy.

---

## 7. Git status (fine sessione)

**Backend** `/Users/bigart/Downloads/ladieci-bot`:
- branch `backup/v2-route-impact-slip-guard-2026-06-14`, HEAD `6e2b529`
- working tree **clean** (script di validazione rimosso)
- `origin/main` = `0bb9d8c` invariato

**Frontend** `/Users/bigart/Downloads/LaDieciBotV2-github`:
- unico cambiamento di questa sessione: aggiunto questo report
- `PremiumPlannerPopup.jsx` (WIP pregresso) non toccato
- `ORDINI_2026-05-23.md` non toccato

---

## 8. Safety

| Vincolo | Stato |
|---|---|
| Zero deploy | ✅ |
| Zero DB write | ✅ |
| Zero frontend (logica) | ✅ |
| Zero cleanup DB | ✅ |
| Zero push main | ✅ |
| Nessuna patch non autorizzata | ✅ (solo lettura + script offline rimosso) |
| `ORDINI_2026-05-23.md` intatto | ✅ |

---

## Verdetto

✅ **OK** — +45 / +48 / +127 → `no_recomendado`, +8 resta `ajuste`, direct/manual giro intatti, zero regressioni.
**Procedere col deploy di `6e2b529`** (Strada 1); `Δpromised >25/30` come blocco A.2 separato, non bloccante.
