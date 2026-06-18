# BLOCK_2_DIRECT_RIDER_CONFLICT_PATCH_REPORT

Data: 2026-06-17 — **Patch backend LOCALE. NO deploy, NO push.** File: `ladieci-bot/src/agents/previewStrategicOpportunities.js`.

## Regola implementata
Una proposta **direct/crear giro separato** NON può essere `compatible` se la sua finestra `[salida, regreso]` si sovrappone a quella di un anchor già impegnato (single-rider). In tal caso → **`no_recomendado` FORZABILE** (`blocked` resta `false`), `riderConflict:true`, con avviso. Mai più "Mejor propuesta compatible" cieca. (Scelta utente: `rider_conflict` forzabile, non blocked duro.)

## Cosa è stato aggiunto
- `clockIntervalsOverlap(aStart,aEnd,bStart,bEnd)` — overlap di intervalli orari (night-service); estremo nullo → `false` (nessun falso positivo).
- `directIntervalFromOpp(opp)` — legge `salida`(departure)/`entrega`(giroEta)/`regreso`(returnEta) dalla `routeTimeline` GIÀ calcolata. Nessun orario inventato.
- `findRiderConflictAnchor(directOpp, anchors)` — ritorna il primo anchor la cui `[salida, regreso]` overlappa il diretto; conservativo se mancano dati.
- Applicazione nell'adapter (subito dopo il calcolo di `bestProposal`, con `directCand`/`impact`/`anchors` in scope): se conflitto → `status="no_recomendado"`, `severity="warning"`, `riderConflict=true`, `warning="Conflicto rider: vuelve HH:MM, pero <ZONA> debe salir HH:MM"`, `firstAvailable.status="no_recomendado"` (la card "Mejor propuesta" legge quello), e `routeTimeline.risk="warning"`+`operatorMessage` (la rotta resta corretta; il conflitto è trasversale, non uno slip).

## Caso target (verificato)
anchor **Q5 21:00** EN_COCINA (forno_out 20:47, andata 13 → finestra `[20:47, 21:13]`) + bozza **Q2 20:45** (diretto `[20:38 → 20:45 → 20:54]`). Overlap 20:47<20:54 → conflitto.
- `bestProposal.status` = **no_recomendado** (era `compatible`), `riderConflict=true`, `blocked=false`.
- `firstAvailable.status` = no_recomendado.
- opportunity **agregar Q2→Q5** resta candidato valido (`ajuste`) — invariata.

## Test
Nuovo: `tests/previewStrategicRiderConflict.test.js` — **19/19 PASS** (unit overlap/interval/conflict + E2E Q5+Q2 + controllo "senza anchor → direct compatible, niente conflitto").
Regressione: `previewStrategicOpportunitiesStaleness` 25/0 · `…Index` 43/0 · `routeImpact` 87/0 · `deliveryChannels` 43/0.

## Limite noto (→ BLOCCO 3)
Il `deliveryProposalSelector` spinge ancora il diretto come **rank 1 "direct"** finché `blocked!==true`. Quindi a runtime il diretto conflittato — pur ora `no_recomendado` — resterebbe in cima/selezionato di default. **BLOCCO 3** riordina: promuove il giro compatibile entro soglia sopra il diretto conflittato.

**BLOCK 2 = PATCH FATTA + TEST VERDI (locale).**
