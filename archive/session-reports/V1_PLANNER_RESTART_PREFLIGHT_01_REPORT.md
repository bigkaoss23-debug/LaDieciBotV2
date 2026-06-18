# V1_PLANNER_RESTART_PREFLIGHT_01_REPORT

Data: 2026-06-15 — **READ ONLY. Nessuna patch. Nessun deploy. Production NON toccata.**

## Sicurezza
Production stabile e intoccata: `069c273 / 6a303f3d6163c6482cc531cd / locked`.
Questo preflight non ha toccato Netlify, Railway, DB, né ordini. `ORDINI_2026-05-23.md` è untracked e NON è stato toccato.

## 1. Stato repo
- **Branch corrente:** `consolidation/nuevo-pedido-v1-unified-2026-06-09` (= branch V1 atteso ✅)
- **HEAD:** `9c1be6d` — _refactor simplify premium planner decision UI_
- Coincide con il backup `backup/v2-planner-ux1-popup-cleanup-2026-06-14` (stesso commit `9c1be6d`).
- Ultimi commit consolidation: `9c1be6d` ← `7557701` (suggested hora da recommended_hora) ← `49eee1f` (gate confirm su hard blocks) ← `feb743c` (apply planner suggestions a draft) ← `28c6e08` (reconcile failed deletes).

## 2. File modificati NON committati (work in progress)
| File | Δ | Natura |
|---|---|---|
| `ladieci-app33/package.json` | +1/-1 | prebuild ora esegue `guard-no-lab-markers.js` prima di write-version |
| `src/components/PremiumPlannerPopup.jsx` | ~290 righe | **refactor del modello "3 opzioni"** |
| `src/components/PremiumPlannerPopup.smoke.test.js` | ~251 righe | test riallineati al nuovo modello |
| `src/components/NuevoPedidoModal.jsx` | +1 | modifica minima (1 riga) |

Inoltre untracked: `ladieci-app33/scripts/guard-no-lab-markers.js` (nuovo guard, referenziato dal prebuild).

### Cosa fa il refactor non committato in PremiumPlannerPopup
Sostituisce la vecchia euristica `buildThreeOptions(directa/giro/alt)` con un modello **guidato da `view.proposals`**:
- `primaryProposals()` + `proposals3` per i 3 box in alto;
- selezione per `selectedId` (non più per slot fisso);
- `openGiro`/`setOpenGiro` → riga "Giros y huecos" **espandibile/cliccabile** (allineato all'obiettivo UX §7.4);
- `resolveProposalOpp()` mappa proposta→opportunity per tono/severity.

Direzione coerente con la UX desiderata (3 box + linea giri cliccabile). **Stato: incompleto/non committato, non testato in questa sessione.**

## 3. Differenza vs production `069c273` (solo codice app)
27 file, **+4266 / -1758**. I pezzi V1/Planner che NON sono in production:
- `PremiumPlannerPopup.jsx` (+876), `PremiumProposalsCompact.jsx`, `PremiumProposalsLabPanel.jsx`
- `ManualGiroSection.jsx`, `DireccionInlinePanel.jsx`, `api/manualGiro.js`, `api/premiumProposals.js`
- `NuevoPedidoModal.jsx` riscritto (~2322 righe di diff), `ItemPickerModal.jsx`, `featureFlags.js`
- test statici: `confirmGating.static.test.mjs`, `usaEstaHora.static.test.mjs`, `stateMachine.test.js`

Confermato: **tutta la UX V1/Planner vive solo su questa branch, non in production.**

## 4. Staging
- Ultimo staging UX-1 noto: deploy `6a2ed8d169063284abcdde5c` / commit `9c1be6d` (= HEAD attuale, ma SENZA le modifiche non committate sopra).
- Quindi staging riflette `9c1be6d` pulito; il refactor "3 proposals + giro cliccabile" **non è ancora su staging**.
- Site staging (da memoria): `a3ad035a`. PROD `02bd4c7a`. Deploy SOLO con `--site` esplicito.

## 5. Build/test
Non eseguiti in questo preflight (richiesto: non patchare, non buildare). Da fare al prossimo step prima di qualsiasi staging.

## 6. Conclusione / opzioni
La branch V1 è sana e allineata al backup. C'è **lavoro in corso non committato** che spinge il PremiumPlannerPopup verso la struttura UX desiderata (3 box guidati da `proposals` + riga Giros y huecos espandibile).

Prossimi passi possibili (da decidere):
1. **Completare/committare** il refactor "3 proposals + giro cliccabile" su PremiumPlannerPopup (continua UX Planner V1).
2. **Validare** (build + smoke test) lo stato attuale e portarlo su **staging** aggiornato.
3. **serviceLine**: verificare se backend fornisce salida/entrega/regreso ricchi o serve stub/empty-state frontend.

NON si procede oltre senza tua indicazione. Nessun deploy.
