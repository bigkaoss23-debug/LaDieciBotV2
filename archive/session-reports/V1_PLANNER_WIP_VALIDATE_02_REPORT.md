# V1_PLANNER_WIP_VALIDATE_02_REPORT

Data: 2026-06-15 — **VALIDAZIONE READ/BUILD/TEST. Nessuna patch, nessun commit, nessun deploy, nessun push. Production intoccata.**

## Sicurezza
Production stabile e NON toccata: `069c273 / 6a303f3d / locked`. Niente Netlify prod, niente Railway, niente DB, niente ordini. `ORDINI_2026-05-23.md` non toccato.

## Step 1 — Preflight
| Check | Esito |
|---|---|
| Branch | `consolidation/nuevo-pedido-v1-unified-2026-06-09` ✅ |
| HEAD | `9c1be6d` ✅ |
| WIP atteso | `package.json`, `NuevoPedidoModal.jsx`, `PremiumPlannerPopup.jsx`, `PremiumPlannerPopup.smoke.test.js` (M) + `scripts/guard-no-lab-markers.js` (??) ✅ |

## Step 2 — Validazione tecnica — PASS

| Check | Esito | Note |
|---|---|---|
| node_modules / react-scripts | OK | già presenti → **nessun npm install** |
| `npm run build` | **PASS** | `Compiled successfully`, bundle `main.18e5dde4.js` (243.3 kB gz) |
| guard-no-lab-markers nel prebuild | **OK, non blocca** | si attiva SOLO con `CONTEXT=production`; in locale → `context=local → skip` |
| prebuild coerente | **OK** | `guard && write-version` → version.json scritto `9c1be6d local` |
| smoke.test.js | **PASS 6/6** | inclusi Caso 3 (not_recommended fuori dai primari), Caso 4 (giros espandibili salida→entrega→regreso), Caso 5b (empty-state) |
| confirmGating.static.test.mjs | **PASS 9/9** | via `node` (jest CRA non raccoglie `.mjs`) |
| usaEstaHora.static.test.mjs | **PASS 7/7** | idem |

### Guardia su guard-no-lab-markers (importante)
Il prebuild ora include il tripwire. È sicuro per build locali/staging perché esce subito se `CONTEXT !== "production"`. **Implicazione operativa:** una build di PRODUZIONE da questa branch verrebbe **bloccata** dal guard (trova `ppp-opt3`, `recommended_hora`, ecc.) — esattamente il comportamento voluto. Per pubblicare V1 servirà `ALLOW_V1=1` esplicito. ⚠️ Nota: il marker `ppp-opt3` nella lista è ora **stantio** — il refactor WIP usa la classe `ppp-prop` (non più `ppp-opt3`); il guard continua a scattare grazie agli altri marker, ma `ppp-opt3` andrà aggiornato.

## Step 3 — Audit WIP PremiumPlannerPopup

| Domanda | Esito | Dettaglio |
|---|---|---|
| Modello `view.proposals` coerente? | **SÌ** | `adaptStrategicContract` fa pass-through puro di `contract.proposals` (già ranked dal backend `premium-planner-proposal-selection-v1`). Nessun calcolo frontend. |
| 3 box da backend o fallback euristici? | **DA BACKEND** | `proposals3 = primaryProposals(view.proposals)`. La vecchia euristica `buildThreeOptions(directa/giro/alt)` è stata **rimossa**. Slot mancanti → grigio/disabled, non inventati. ✅ |
| `Giros y huecos` cliccabile/espandibile? | **SÌ** | ogni riga `view.serviceLine` è un `<button aria-expanded>` con `setOpenGiro`; espansa mostra `RouteTimeline` con salida→entrega→regreso. ✅ |
| `no_recomendado` NON è CTA primaria? | **SÌ** | `primaryProposals` filtra `kind !== 'not_recommended'`. Confermato da smoke Caso 3. ✅ |
| Empty state grigi chiari? | **SÌ** | slot vuoti `is-empty`+disabled "Sin opción"; serviceLine vuota → "No hay otros giros esta tarde". ✅ |
| `openGiro` collega riga ↔ dettaglio ↔ timeline ↔ **mappa**? | **PARZIALE ⚠️** | vedi gap sotto |

### Gap reali emersi (NON failure di build/test, ma da chiudere completando la UX)

1. **Mappa e riga giro sono disaccoppiate.** La `MiniZoneMap` riflette `selectedOpp` (derivato da `selectedId`, cioè i 3 bottoni in alto). Cliccare una riga di "Giros y huecos" (`openGiro`) apre la sua **timeline verticale** ma **non aggiorna la mappa**. L'obiettivo §7.4 ("clic sul bottone sopra → scrolla/apre la riga corrispondente", e riga → mappa+timeline) **non è ancora cablato**: `selectedId` (mappa) e `openGiro` (riga) sono stati indipendenti, senza ponte tra proposta-bottone e riga-giro.

2. **Selezione bottone non guida "Aplicar propuesta".** I 3 bottoni aggiornano `selectedId` (solo mappa + `labLog` no-op). Ma il bottone "Aplicar propuesta" applica sempre `bestForCard.entrega` (la migliore/prima), **non** la proposta selezionata. Selezionare il box 2 e premere Aplicar applica comunque la #1 → incoerenza UX.

3. **Hora dell'operatore.** Il top card usa `firstAvailable/bestProposal` dal contract; non c'è evidenza nel renderer che la proposta principale sia **centrata sull'ora scelta dall'operatore** (§7.1). Questo dipende dal **contract backend** (firstAvailable rispetto a startTime), non dal popup: da verificare lato contract, non qui.

Questi gap sono **coerenti con "refactor a metà"**: la nuova struttura dati è sana e testata, ma il cablaggio interazione (bottone↔riga↔mappa↔apply) non è completo.

## Step 4 — Output

### PASS/FAIL
- Build: **PASS**
- Guard prebuild (non blocca locale): **PASS**
- smoke.test 6/6: **PASS**
- confirmGating 9/9: **PASS**
- usaEstaHora 7/7: **PASS**
- Audit modello proposals / no_recomendado / empty-state: **PASS**
- Audit cablaggio interazione (openGiro↔mappa↔apply): **PARZIALE** (gap 1–2)

### File toccati dalla validazione
**ZERO sorgenti modificati.** `git status` invariato: solo il WIP preesistente (4 file M) + `scripts/guard-no-lab-markers.js` (??). Artefatti di build (`build/`, `public/version.json`) sono gitignored. Nessun commit, nessun push.

### Raccomandazione
**C → A.**
- Non è **B**: build e test sono verdi, niente da riparare.
- **C (consigliato come primo passo):** committare un **checkpoint WIP** ora, per fissare lo stato verde (refactor proposals-driven + smoke aggiornato) prima di toccare altro. Lo stato attuale è coerente e testato: vale la pena bloccarlo.
- **A subito dopo:** completare il refactor chiudendo i 2 gap di cablaggio — (1) ponte `selectedId`↔`openGiro` così che selezionare un bottone apra/scrolli la riga giro corrispondente e la mappa segua la riga; (2) far guidare "Aplicar propuesta" dalla proposta selezionata, non sempre dalla best. Più, lato backend/contract, verificare §7.1 (proposta centrata sull'ora operatore) e aggiornare il marker stantio `ppp-opt3`→`ppp-prop` nel guard.

NON si procede oltre senza tua conferma. Nessun deploy.
