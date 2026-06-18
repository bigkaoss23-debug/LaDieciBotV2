# BLOCK_1_PLANNER_RANKING_AUDIT_REPORT

Data: 2026-06-17 — **AUDIT SOLO. Nessuna patch. Backend locale `/Users/bigart/Downloads/ladieci-bot`.**

## Catena runtime del popup "Ver propuestas"
Contract runtime = `premium-planner-strategic-preview-v1` ⇒ l'action live usa **`src/agents/previewStrategicOpportunities.js`** (NON `previewOrderPlanner.js`, che è il contract diverso `nuevo-pedido-planner-preview-v1` per il timing).

Flusso: `currentOrderDraft + anchors` → `buildCandidateForAnchor`/`buildStrategicCandidates` (`strategicOpportunities.js`) → `buildRouteImpact` (`routeImpact.js`) → `premiumPlannerBridge`/`premiumPlannerOpportunities` → `deliveryProposalSelector.js` → response.

## Risposte alle domande obbligatorie

**1. Dove nasce "Crear giro Q2 20:45 compatible"?**
`previewStrategicOpportunities.js:602-612`. La **baseline diretta** è costruita con `makeDirectCandidate(currentOrder, null, context)` — **anchor = `null`**. Lo status arriva da `runRouteImpact(directCand.routeImpactInput)`; `bestProposal = mappedDirect.opp`.

**2. Perché `compatible`?**
`routeImpact.js:185-192`: "nessuno slip, capacity ok → `compatible`, blocked=false". Il diretto Q2 è la rotta `[Pizzería → Q2]`, durata andata 6, ETA 20:45 = promised → **0 slip** → `compatible`. La rotta diretta **non contiene il Q5**, quindi non c'è nulla che possa slittare.

**3. Si controlla il conflitto col rider già prenotato sul Q5?**
**NO.** Il candidato diretto è valutato con `anchor=null` e `routeImpact` vede solo `[Pizzería→Q2]`. Nessun riferimento agli altri anchor/serviceLine nel calcolo del diretto.

**4. Il direct/crear calcola ritorno rider e sovrapposizione con anchor futuri?**
Calcola il proprio `driverReturn` (`routeTimeline.summary.returnEta = 20:54`) ma **non lo confronta** con la `salida` necessaria dell'anchor Q5 (20:47). `resolveRiderAvailability` (`riderAvailability.js`, `planner.js:312`) esiste ma **NON è cablato** nella catena strategica — è usato solo dal planner classico `planner.js`/`previewTiming`, e lì considera solo gli **EN_ENTREGA già fuori**, non gli anchor EN_COCINA futuri come vincolo per un giro separato.

**5. Dove si sceglie `bestProposal`?**
`deliveryProposalSelector.js:149-156`: `best = input.bestProposal` (il diretto). Se presente e non bloccato diventa **rank 1** in testa a `proposals[]`.

**6. Perché direct 20:45 batte giro compatibile 20:52?**
Lo STATUS comanda (`STATUS_RANK = {compatible:0, ajuste:1, no_recomendado:2}`). Il diretto è `compatible` (0, perché ignora il Q5), il combinato è `ajuste` (1, perché vede onestamente Q2 +7 / Q5 +4). 0 < 1 ⇒ il diretto vince. **Il diretto vince proprio perché è cieco al costo che genera sul Q5.**

**7. La regola "evitare viaggio separato con slip accettabile" è nel ranking?**
**NO.** Non esiste alcuna logica che preferisca un giro compatibile entro soglia a un viaggio separato. Il ranking è solo `blocked → STATUS_RANK → ordine d'ingresso`.

**8. Dove si costruisce `serviceLine` e perché mancano salida/regreso?**
`previewStrategicOpportunities.js:506-514`, da `anchors` via `sanitizeAnchor` (`:233-264`). **Il codice LOCALE già calcola** salida (`forno_out` o `entrega−andata`), entrega (`promised`), regreso (`entrega+andata`). MA al runtime mancano ⇒ il backend **deployato su Railway è più vecchio** del working tree locale (vedi sotto).

**9. Campi DB esistenti non propagati?**
`plannerSnapshot.normalizeOrder` (`:145-151`) **mappa già** `durata_andata_min→andata_min`, `forno_out`, `salida_driver_estimada`, `entrega_estimada`. Quindi i dati arrivano allo snapshot. `sanitizeAnchor` però **ricalcola** salida/regreso da forno_out/promised/andata invece di usare direttamente `salida_driver_estimada`/`entrega_estimada` del DB (occasione di semplificazione, BLOCCO 4).

## Root cause P0 (confermata)
Il candidato **direct/crear** è valutato in isolamento (`anchor=null`) e `routeImpact` non conosce il vincolo single-rider verso l'anchor Q5. Risultato: diretto Q2 20:45 marcato `compatible · sin retrasos` benché il rider non possa rientrare (20:54) e ripartire per Q5 (20:47). Il ranking premia lo status migliore ⇒ il diretto cieco diventa "Mejor propuesta".

## ⚠️ Due questioni di premessa (STOP & report)

**(P-A) Validazione runtime impossibile senza toccare Railway.**
L'app (sia live staging sia localhost) chiama il backend **Railway deployato** via `RAILWAY_URL` hardcoded in `ladieci-app33/netlify/functions/api.js`. Patchare il backend **locale** (BLOCCO 2/3/4) **non cambia il runtime** finché non si fa un deploy Railway (**vietato**). Quindi **BLOCCO 7 (test runtime) non rifletterà le patch** a meno di:
- (a) far girare il **backend locale** (`node index.js` su ladieci-bot) e ripuntare il proxy del frontend al locale (solo locale, nessun deploy), oppure
- (b) validare solo con **unit test backend** (BLOCCO 6) e rimandare il runtime a un futuro deploy autorizzato.

**(P-B) BLOCCO 4 (serviceLine salida/regreso) è GIÀ implementato in locale, non committato, non deployato.**
`git diff src/agents/previewStrategicOpportunities.js` = +32 righe che aggiungono esattamente salida/entrega/regreso a `sanitizeAnchor` + `serviceLine`. Il "—" runtime è solo perché Railway gira codice vecchio. Inoltre il backend locale è **avanti** rispetto al deployato: HEAD `dc36160` con fix già committati ma **non deployati** (`737171f` stale-anchor, `96ec441` too-early-confirm, `6e2b529` large-slip→not-recommended, `dc36160` distant-promised→not-recommended). Il runtime testato gira codice **più vecchio** di questi.

## Mappa patch (per blocchi successivi)
- **BLOCCO 2 (P0):** in `previewStrategicOpportunities.js` (catena diretta) introdurre il check rider/anchor: calcolare l'intervallo del diretto (salida/entrega/regreso) e confrontarlo con salida/entrega/regreso degli anchor `serviceLine`; se overlap → il diretto diventa `no_recomendado`/`rider_conflict` (forzabile), **mai** `compatible`. File: `previewStrategicOpportunities.js` + eventuale helper in `riderAvailability.js`/nuovo `riderConflict.js`.
- **BLOCCO 3 (ranking):** quando esiste un giro compatibile entro soglia (slip ok, capacity ok, no cross) e il diretto ha conflitto rider, promuovere il giro come `recommended`/"mejor operativo". File: `deliveryProposalSelector.js` (regola di preferenza) + label.
- **BLOCCO 4:** già in working tree (committare); valutare uso diretto di `salida_driver_estimada`/`entrega_estimada` dal DB.
- **BLOCCO 5:** UI/copy (frontend `ladieci-app33`).

## Premessa NON sbagliata
Il bug P0 è reale e confermato nel codice. La premessa corretta; le note P-A/P-B riguardano **come** validare e il fatto che parte del BLOCCO 4 è già fatta in locale.

**BLOCK 1 = AUDIT COMPLETO. In attesa di decisione su validazione runtime (P-A) prima di procedere oltre il BLOCCO 6.**
