# BLOCK_3_BEST_OPERATIONAL_RANKING_PATCH_REPORT

Data: 2026-06-17 — **Patch backend LOCALE. NO deploy, NO push.** File: `ladieci-bot/src/core/delivery/deliveryProposalSelector.js`.

## Business rule implementata
Quando il **diretto NON è pulito** (`status !== "compatible"`, es. conflitto rider dal BLOCCO 2) **ED esiste un giro compatibile/ajuste** (inserimento qualificante: `agregar`, non bloccato, non cross, status `compatible|ajuste`) → il **giro è "mejor operativo"**: passa a `rank 1` con flag `recommended:true`; il diretto resta mostrato **come opzione forzabile sotto** (rank 2). Se invece il diretto è pulito (`compatible`) o non c'è inserimento qualificante → diretto primo (comportamento storico invariato).

Coerente con la "REGOLA D'ORO" del modulo ("lo STATUS comanda"): un diretto non-`compatible` non supera un inserimento `compatible`/`ajuste`.

## Dettaglio
- Nuovo: `directClean = directShowable && status==="compatible"`.
- Ordinamento condizionale: `directClean || !insertion` → diretto-first; altrimenti `insertion, direct, alternative`.
- `not_recommended` resta sempre in coda.
- Aggiunto campo **`recommended`** su ogni proposal (`true` solo per la prima primaria, mai `not_recommended`) → la UI (BLOCCO 5) potrà evidenziare "Mejor propuesta" dalla proposta giusta invece che dal diretto fisso.
- Niente regressione: i casi con diretto `compatible` mantengono diretto rank 1.

## Caso target (verificato)
Q5 21:00 + Q2 20:45:
- `proposals[0].kind = "insertion"` (giro Q2→Q5, ajuste) · `recommended = true`.
- diretto Q2 presente come `kind="direct"`, `rank>1`, `recommended=false` (forzabile).
- Controllo "senza anchor": `proposals[0].kind="direct"`, `recommended=true` (compatible) → comportamento storico intatto.

## Test
`tests/previewStrategicRiderConflict.test.js` esteso — **24/24 PASS** (sezione "BLOCCO 3 ranking mejor operativo" + controllo no-anchor).
Regressione: `deliveryProposalSelector.test.js` **32/0**.

## Limite / aggancio BLOCCO 5
La card grande "Mejor propuesta" del frontend (`PremiumPlannerPopup.jsx`) legge ancora `contract.bestProposal`+`firstAvailable` (= il diretto). Dopo il BLOCCO 2 mostra il diretto come `no_recomendado`; per mostrare il **giro** come "Mejor propuesta" la card dovrà seguire `proposals[0]`/`recommended` (cabling presentazionale, BLOCCO 5). I 3 box e la selezione di default già seguono `proposals[]` → mappa/Aplicar puntano già al giro consigliato.

**BLOCK 3 = PATCH FATTA + TEST VERDI (locale).**
