# V1_PLANNER_SAMEZONE_PROD_RELEASE_GATE_29_REPORT

**Task:** `V1_PLANNER_SAMEZONE_PROD_RELEASE_GATE_29`
**Tipo:** audit / release-plan SOLO letture. NO deploy, NO push, NO commit, NO DB write, NO patch.
**Data:** 2026-06-18
**Decisione:** ✅ **READY_FOR_PROD_DEPLOY** (deploy del tip di branch `a7ad091`; cherry-pick isolato NON viabile). Vedi §12.

---

## 1. Repo / branch / commit ispezionato

- Repo `/Users/bigart/Downloads/ladieci-bot`
- Branch `backup/v2-route-impact-slip-guard-2026-06-14`
- HEAD `a7ad091d9e7d71b7656b6e08e44c7d9575560284` (`fix planner same-zone rider availability`)
- Remote `origin` = `https://github.com/bigkaoss23-debug/ladieci_bot.git`

## 2. Working tree

`git status --short` → **vuoto** (pulito). ✔

## 3. Production read-only inventory (Fase 0)

Letto via HTTP pubblico (nessun CLI pericoloso, nessuno switch service):

| Endpoint (`https://ladiecibot-production.up.railway.app`) | Risultato |
|---|---|
| `/health` | `{"ok":true,...}` |
| `/version` | `{"service":"ladieci_bot","env":"production","commit":"unknown","commitFull":"unknown","branch":"unknown","deploymentId":"397d4061-50b5-4400-bc38-a6b2ceab0f4d","bootTime":"2026-06-14T15:20:48Z","uptimeSec":~339417}` |
| `/status` | HTTP 200 |

## 4. Production commit/deploy — **INCERTEZZA DICHIARATA**

`/version.commit = "unknown"`: anche prod è stato deployato con `railway up` (non inietta la SHA git). Non posso leggere il commit prod dall'HTTP, e **non lo invento**.

- **Deployment prod attuale:** `397d4061-50b5-4400-bc38-a6b2ceab0f4d`, boot `2026-06-14T15:20:48Z` (uptime ~3.9 giorni → nessun redeploy dal 14/06).
- **Commit stimato:** `ae8e22e` (`fix replan driver fields on rider state changes`), dalla memoria `railway-live-deployment-commit-map` (live backend 2026-06-13 ≈ `ae8e22e`). Il boot 06-14 (deploymentId nuovo `397d4061` ≠ il 06-13 `2f024e4b`) indica un redeploy del 14/06 di commit non confermabile via HTTP.
- **Impatto dell'incertezza sulla sicurezza: NULLO** — vedi §8: l'intero delta candidato è read-only; il deploy del tip porta prod a `a7ad091` (noto-buono) qualunque sia la base attuale.

## 4b. Mappatura deployment→commit (accertamento read-only, post-gate)

Tentata mappatura `397d4061`→commit con mezzi sicuri (no log prod = no PII/secret leak):
- `git notes`: vuoto · nessun record locale di `397d4061` · reflog non traccia i deploy Railway.
- Railway non espone la SHA (deploy via `railway up`, stesso motivo di `/version.commit="unknown"`).

**Vincolo temporale DECISIVO** (un commit è deployabile solo se creato prima del boot prod `2026-06-14 17:20:48 +0200`):

| commit | data commit (+0200) | vs boot prod | su prod? |
|---|---|---|---|
| ae8e22e | 2026-06-13 19:36 | prima | possibile |
| 96ec441 | 2026-06-13 21:36 | prima | possibile |
| 6e2b529 | 2026-06-14 16:24 | prima (~1h) | possibile |
| dc36160 | 2026-06-14 17:13 | prima (~7 min) | possibile |
| **193b818** | 2026-06-17 14:05 | **DOPO** | ❌ **impossibile** |
| **a7ad091** | 2026-06-18 11:16 | **DOPO** | ❌ **impossibile** |

**Conclusione provata:** `193b818` e `a7ad091` NON sono su produzione (creati giorni dopo il boot prod). Il commit prod ∈ {`ae8e22e`, `96ec441`, `6e2b529`, `dc36160`}. Risoluzione più fine non ottenibile in sicurezza (richiederebbe il record di deploy dell'utente o fixture controllate con DB write) ed è **irrilevante per la release**: il fix manca comunque su prod e dipende da `193b818` (assente). Questo conferma la base stimata §4 (`ae8e22e`) come limite superiore del delta.

## 5. Diff audit verso `a7ad091`

Storia **lineare, nessun merge**. Catena `ae8e22e..a7ad091` (5 commit, tutti planner-correctness):

```
a7ad091 fix planner same-zone rider availability        ← QUESTO fix (validato runtime 28B)
193b818 fix planner prefer compatible giro over rider-conflicting direct
dc36160 fix mark distant promised route options as not recommended
6e2b529 fix classify large route slips as not recommended
96ec441 fix guard planner against too-early confirmations
(ae8e22e = base stimata prod)
```

`git diff --stat ae8e22e..a7ad091` → 11 file, +889 / −57.

## 6. File coinvolti (delta completo ae8e22e..a7ad091)

| File | Natura |
|---|---|
| `index.js` | +4 righe: solo `now: () => nowMadridHHMM()` su `previewOrderPlanner` deps (clock read-only server-authoritative). Nessuna nuova route, nessun write |
| `src/agents/previewOrderPlanner.js` | planner preview read-only |
| `src/agents/previewStrategicOpportunities.js` | planner preview read-only (qui vive il fix same-zone) |
| `src/core/delivery/deliveryProposalSelector.js` | logica pura selezione proposte |
| `src/core/delivery/planner.js` | logica pura planner |
| `src/core/delivery/routeImpact.js` | logica pura ETA/slip |
| `tests/*` (5 file) | solo test |

**Fix isolato `a7ad091`:** 4 file (1 src + 3 test), +177/−14.

## 7. Safety diff check (Fase 2)

Grep sulle righe aggiunte di `ae8e22e..a7ad091`:

| Controllo | Esito |
|---|---|
| Supabase write (`sbInsert/Update/Delete/Upsert`, INSERT/UPDATE/DELETE) | ✅ nessuno |
| WhatsApp (`invia(`, sendMessage, wa_msgs) | ✅ nessuno |
| manual_giro apply/create | ✅ nessuno |
| order-creation path | ✅ non toccato |
| frontend | ✅ nessun file frontend |
| env/secrets/config (`process.env`, API_KEY, SECRET, TOKEN, PASSWORD) | ✅ nessuno |
| migrations | ✅ nessuna |
| Railway/Netlify config | ✅ nessuna |
| hardcoded prod refs (`ladiecibot-production`, `wnswassgfuuivmfwjxsf`) | ✅ nessuno |
| `ORDINI_2026-05-23.md` | ✅ non toccato |

Tutto il delta è **planner read-only / preview + test**. Nessun BLOCKER.

## 8. Rischio regressione

- **Classe di rischio bassa:** il delta tocca SOLO la catena di preview/planner read-only (advisory all'operatore) e logica pura; non tocca creazione ordini, DB write, WA, pagamenti, stati. Un'eventuale regressione planner NON può corrompere dati (read-only).
- **Copertura:** full suite backend 63/63 verde (28B); suite rider-conflict 54/54 verde ri-eseguita ora su HEAD; same-zone validato runtime su staging (28B).
- **Dipendenza commit:** `a7ad091` **dipende da `193b818`** (usa `findRiderConflictAnchor`, introdotta in `193b818`) → **cherry-pick del solo `a7ad091` NON è viabile**. L'unità di rilascio corretta è la catena lineare fino al tip `a7ad091`.

## 9. Rollback candidate

- **Meccanismo affidabile:** Railway "rollback to deployment" → deployment prod attuale **`397d4061-50b5-4400-bc38-a6b2ceab0f4d`** (boot 2026-06-14). Non dipende dalla SHA (che è `unknown`).
- **Commit equivalente (stima):** `ae8e22e`. Branch backup disponibile: `backup/v2-driver-replan-stale-2026-06-13`.

## 10. Test plan per il deploy futuro (pre-deploy)

1. `git status --short` pulito · `git rev-parse HEAD` = `a7ad091`
2. `node tests/previewStrategicRiderConflict.test.js` → 54/54
3. full backend: `for f in tests/*.test.js; do node "$f"; done` → 63 file OK
4. grep safety sul diff (come §7) → 0 hit
5. **HARD STOP target:** `railway status` deve mostrare service **`ladieci_bot`** SOLO in questo blocco deploy (attenzione: ora il CLI è linkato a `fearless-reverence` da 28A/28B → servirà `railway service ladieci_bot` + prova `railway status` PRIMA del deploy)
6. annotare il deployment di rollback corrente (`397d4061`) prima del deploy

## 11. Smoke plan post-deploy futuro (read-only)

1. `/health` → ok
2. `/status` → 200
3. `/version` → nuovo `deploymentId` + `bootTime` fresco (la SHA resterà `unknown`: prova = identità artefatto al deploy `git rev-parse HEAD`=`a7ad091` + boot fresco)
4. `POST /api?action=previewStrategicOpportunities` **read-only** con input sintetico (es. draft Q5 21:05) — NON crea ordini; gli anchor vengono dallo snapshot live prod (solo lettura). Verificare contract `premium-planner-strategic-preview-v1` e assenza errori
5. NON creare ordini reali
6. Validazione runtime "anchor+bozza" su prod (come 28B) SOLO con autorizzazione separata + marker `TEST_*_DELETE_OK` + cleanup; preferibile farla fuori orario servizio

## 12. Decisione

✅ **READY_FOR_PROD_DEPLOY** — deploy del **tip di branch `a7ad091`** sul service `ladieci_bot`.
Motivazione: artefatto esatto validato su staging (offline 63/63 + runtime PASS), delta interamente read-only planner/preview + test (zero write/WA/migration/frontend/secrets), storia lineare senza commit estranei. `READY_WITH_CHERRY_PICK` **scartato**: `a7ad091` dipende da `193b818`, il cherry-pick isolato non è viabile. L'incertezza sulla base prod (§4) è non-bloccante per la sicurezza (delta read-only; il deploy del tip normalizza prod a `a7ad091`).

> Nota: il deploy promuove anche i 4 commit planner precedenti (`96ec441`, `6e2b529`, `dc36160`, `193b818`), parte dello stesso bundle staging-validato. Se si preferisce un perimetro minimo, l'unica alternativa pulita è creare un branch di release dedicato a partire dalla base prod **confermata** e fast-forward al tip — ma richiede prima di confermare la base prod (attualmente incerta).

## 13. Frase di autorizzazione richiesta per il deploy futuro

```
AUTORIZZO DEPLOY BACKEND V1 PROD SAMEZONE FIX
```

(Il deploy NON è eseguito in questo task.)

## 14. Conferme safety

- ✅ no deploy · ✅ no DB write · ✅ no push main · ✅ no commit/patch
- ✅ no frontend · ✅ no production touch (solo GET HTTP `/health`,`/version`,`/status`)
- ✅ no secrets stampati
- ✅ `ORDINI_2026-05-23.md` intatto
- ✅ CLI Railway NON switchato in questo blocco (resta su `fearless-reverence`; nessun comando di deploy)

> STOP dopo report. Nessun deploy, patch, commit o push.
