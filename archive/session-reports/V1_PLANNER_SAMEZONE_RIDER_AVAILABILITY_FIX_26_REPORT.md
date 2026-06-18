# V1_PLANNER_SAMEZONE_RIDER_AVAILABILITY_FIX_26_REPORT

**Task:** `V1_PLANNER_SAMEZONE_RIDER_AVAILABILITY_FIX_26`
**Tipo:** patch chirurgica backend + test offline. NO deploy, NO DB write, NO push, NO frontend, NO production.
**Data:** 2026-06-18
**Verdict:** ✅ **PASS**

---

## 1. Repo / branch / commit base

- **Repo backend:** `/Users/bigart/Downloads/ladieci-bot` (backend reale; frontend NON toccato)
- **Branch:** `backup/v2-route-impact-slip-guard-2026-06-14`
- **HEAD base:** `193b818a77afad33129d4cf45f075391ce48371e` (`193b818`)
- Coincide con il commit audit `V1_PLANNER_SAMEZONE_RIDER_AVAILABILITY_AUDIT_25`.

## 2. Working tree iniziale

`git status --short` → **vuoto** (pulito) prima del fix. ✔

## 3. File modificati

| File | Δ | Tipo |
|---|---|---|
| `src/agents/previewStrategicOpportunities.js` | +35/-7 | **fix** |
| `tests/previewStrategicRiderConflict.test.js` | +130 | nuovi test FIX_26 (1–6) |
| `tests/previewStrategicOpportunities.test.js` | +4/-2 | aggiornata assertion E2E-4 (stale) |
| `tests/previewStrategicOpportunitiesIndex.test.js` | +11/-3 | aggiornata assertion serviceLine (stale) + commento fixture |

`git diff --stat`: 4 file, **177 insertions(+), 14 deletions(-)**.

## 4. Root cause confermata

Un'**unica lista `anchors`** alimentava tre responsabilità distinte in `previewStrategicOpportunities.js`. Il filtro same-zone (ex L354, pensato solo per la generazione candidati di insertion) la svuotava, facendo "dimenticare" al planner che il rider single-rider era occupato:

1. `findRiderConflictAnchor(bestProposal, anchors=[])` → `null` → direct `compatible`
2. `if (!anchors.length)` → warning `no_anchors`
3. `anchors.map(...)` → `serviceLine: []`

`findRiderConflictAnchor` e `sanitizeAnchor` erano già corretti: ricevevano solo una lista svuotata. Principio: **"non aggregabile ≠ rider libero"**.

## 5. Descrizione fix

L'orchestratore ora costruisce **una sola fonte** `allOperationalAnchors` (anchor EN_COCINA/LISTO, DOMICILIO, non-stale, escluso il draft corrente) e ne deriva **tre viste**:

- **`buildAnchorsFromSnapshot` chiamata SENZA `currentOrderZone`** → non filtra più same-zone alla fonte (gli altri filtri — tipo, stato, anti-stale, currentId — restano invariati). La funzione esportata `buildAnchorsFromSnapshot` **non è stata modificata** (il suo filtro same-zone resta attivo quando `currentOrderZone` è passato: usato ancora nei test diretti).
- Il filtro same-zone è **spostato** nella derivazione di `candidateAnchors`.
- `no_anchors` ora si basa su `candidateAnchors`, e viene emesso **solo se anche `riderBusyAnchors` è vuoto** (altrimenti sarebbe fuorviante: la serviceLine è popolata e l'eventuale conflitto è già su `bestProposal`).

Nessun cambio ai contract pubblici, nessun refactor esteso, nessuna patch frontend. La decisione resta backend.

## 6. Liste separate create/usate

| Lista | Contenuto | Usata da |
|---|---|---|
| `allOperationalAnchors` | tutti gli anchor operativi (incl. same-zone) | fonte comune |
| `candidateAnchors` | `allOperationalAnchors` **senza** same-zone | generazione insertion (`makeCandidates`) + gate `no_anchors` |
| `riderBusyAnchors` | `allOperationalAnchors` (incl. same-zone) | `findRiderConflictAnchor` + gate `no_anchors` |
| `serviceLineAnchors` | `allOperationalAnchors` (incl. same-zone) | costruzione `serviceLine` |

## 7. Comportamento same-zone PRIMA / DOPO

Scenario: anchor Q5 #001 EN_COCINA (salida 20:40, entrega 21:00, regreso 21:20) + draft Q5 21:05.

| Campo | PRIMA (bug) | DOPO (fix) |
|---|---|---|
| `serviceLine` | `[]` | contiene Q5 #001 |
| warning `no_anchors` | presente | assente (rider busy esiste) |
| direct Q5 21:05 status | `compatible · sin retrasos` | `no_recomendado` |
| `riderConflict` | assente | `true` |
| direct forzabile (`blocked`) | — | `false` (resta forzabile) |
| opportunity `[Q5,Q5]` | nessuna | nessuna (invariato: same-zone non aggregabile) |

## 8. Test aggiunti

In `tests/previewStrategicRiderConflict.test.js`, sezione FIX_26 — **tutti passano dal path `buildAnchorsFromSnapshot`** (snapshot, NON `input.anchors` espliciti: è il path dove viveva il bug):

- **TEST 1** — same-zone Q5 21:05 + anchor Q5: serviceLine non vuota & include #001; nessun `no_anchors`; direct `no_recomendado` + `riderConflict=true` + forzabile; `firstAvailable.status` riallineato; nessuna opportunity `[Q5,Q5]`.
- **TEST 2** — Q2 20:25 (presto): direct `compatible`, **nessun falso conflitto**, serviceLine mostra comunque l'anchor.
- **TEST 3** — Q2 20:45: direct `no_recomendado`/`riderConflict`, opportunity Q2→Q5 valida.
- **TEST 4** — Q2 20:55: direct `no_recomendado`, insertion Q2→Q5 presente.
- **TEST 5** — Q1 20:45: direct `no_recomendado`, opportunity Q1→Q5 sur (non cross).
- **TEST 6** — Q4 oeste: nessun Q4→Q5 compatibile (cross/blocked/assente).

Due assertion **stale** aggiornate al nuovo comportamento corretto (same-zone ora incluso in serviceLine):
- `previewStrategicOpportunities.test.js` E2E-4
- `previewStrategicOpportunitiesIndex.test.js` (serviceLine = Q5 + Q2)

## 9. Test eseguiti e risultati

| Suite | Risultato |
|---|---|
| `previewStrategicRiderConflict.test.js` | ✅ **54 passed, 0 failed** (incl. 6 nuovi FIX_26) |
| `previewStrategicOpportunities.test.js` | ✅ **127 passed, 0 failed** |
| `previewStrategicOpportunitiesStaleness.test.js` | ✅ **25 passed, 0 failed** |
| `previewStrategicOpportunitiesIndex.test.js` | ✅ **43 passed, 0 failed** |
| **Full suite backend (`tests/*.test.js`)** | ✅ **63 file OK, 0 falliti** |

## 10. Regressioni coperte

| Caso | Esito |
|---|---|
| Q2 20:25 — direct compatible, nessun falso conflitto | ✅ TEST 2 |
| Q2 20:45 — direct no_recomendado, Q2→Q5 valida | ✅ TEST 3 |
| Q2 20:55 — direct no_recomendado, insertion presente | ✅ TEST 4 |
| Q1 20:45 — Q1→Q5 sur, direct no_recomendado | ✅ TEST 5 |
| Q4 oeste — no cross-channel Q4→Q5 | ✅ TEST 6 |
| Cross-channel riconciliazione, anti-stale, EN_ENTREGA/POR_CONFIRMAR esclusi, proposals additive | ✅ suite invariate |

## 11. Git diff summary

```
 src/agents/previewStrategicOpportunities.js      |  42 ++++++--
 tests/previewStrategicOpportunities.test.js      |   5 +-
 tests/previewStrategicOpportunitiesIndex.test.js |  14 ++-
 tests/previewStrategicRiderConflict.test.js      | 130 +++++++++++++++++++++++
 4 files changed, 177 insertions(+), 14 deletions(-)
```

## 12. Safety check

- ✅ **no frontend**: solo repo backend `ladieci-bot` (4 file: 1 src + 3 test).
- ✅ **no DB write**: test offline puri, anchor da snapshot fixture in-memory.
- ✅ **no deploy** (Netlify/Railway/Supabase): nessuno.
- ✅ **no prod**: nessun ref `wnswassgfuuivmfwjxsf` / `ladiecibot-production` / `02bd4c7a` aggiunto nel diff.
- ✅ **no secrets**: grep su diff (api_key/secret/token/password/pin) → nessuno.
- ✅ **`ORDINI_2026-05-23.md` NON toccato** (verificato su `git diff --name-only`).
- ✅ **no push main**, **no commit** (working tree con sole 4 modifiche pendenti).

## 13. Verdict

✅ **PASS** — bug P0 same-zone rider availability risolto a livello JSON backend. Direct same-zone non è più falso `compatible`; serviceLine e rider conflict includono l'anchor same-zone; insertion same-zone NON forzata; nessuna regressione cross-zone.

## 14. Next recommended step (NON eseguito — richiede autorizzazione)

1. **Commit su branch di backup dedicato** (es. `backup/v2-planner-samezone-rider-fix-2026-06-18`) — NON su main, NON push.
2. **Validazione runtime su V1 staging isolata** (Railway `fearless-reverence` + Supabase `tdikhfeinufaahagmpjz`), ripetendo lo scenario TEST C (Q5 21:05 con anchor Q5 #001 EN_COCINA) per confermare il JSON live. Comporta deploy staging → **richiede autorizzazione esplicita**.

> STOP dopo report. Nessun deploy, nessun push main, nessuna validazione runtime staging avviata.
