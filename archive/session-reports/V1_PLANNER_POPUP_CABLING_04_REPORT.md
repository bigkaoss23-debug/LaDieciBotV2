# V1_PLANNER_POPUP_CABLING_04_REPORT

Data: 2026-06-15 — **PATCH + BUILD + TEST. Nessun commit, nessun deploy, nessun push. Production intoccata. Backend/contract NON toccati.**

Base: checkpoint locale `c3e577c` su `consolidation/nuevo-pedido-v1-unified-2026-06-09`.

## Sicurezza / perimetro
Solo branch consolidation. NO production / Netlify prod / Railway / DB / ordini / cleanup / deploy / push / main. `ORDINI_2026-05-23.md` non toccato. **Nessun dato frontend inventato**: tutto deriva da campi già calcolati dal backend (`proposals`, `giroId`, `serviceLine` timestamp/zona).

## Gap chiusi

### Gap 1 — Selezione proposta ↔ giro / timeline / mappa
- **Legame reale via `giroId`** (chiave del contract: `kind agregar|crear (+ giroId)`): `proposalGiroId(p)` ↔ `serviceLine[].id`. Lookup puro, nessun calcolo.
- **Clic su box proposta** → `onSelectProposal`: seleziona la proposta, **apre** la riga "Giros y huecos" collegata (`setOpenGiro`) e fa **scrollIntoView** sull'`id="ppp-sl-<key>"` (best-effort, guard `typeof document`/try-catch per SSR/jsdom).
- **Clic su riga "Giros y huecos"** → `onToggleRow`: espande/chiude e, se la riga è collegata a una proposta, **sincronizza `selectedId`** così che mappa + Aplicar la seguano. La riga collegata e selezionata riceve `is-active` (bordo ciano).
- **Mappa mai disaccoppiata**: `selectedOpp` ora riflette la selezione. Se è aperta una riga giro **senza** proposta corrispondente, la mappa mostra la rotta di quella riga via `serviceLineOpp()` — opp presentazionale costruita **solo** dai timestamp/zona già dati dal backend (riusa `serviceLineTimeline`), senza ETA/stato/canale inventati.

### Gap 2 — Aplicar propuesta
- Applica la **proposta selezionata** (`applyProposal.timeLabel`), non più sempre `bestForCard.entrega`.
- **Guard `isApplicable`**: una proposta `not_recommended` / `no_recomendado` / `blocked` **non** è applicabile → `applyProposal=null` → **fallback sicuro alla best/recommended**. Quindi ispezionare un giro no_recomendado (riga) aggiorna la mappa ma **non** lo rende la CTA applicata.
- **Default selezione = prima primaria** (`proposals3[0]`), mai una not_recommended.
- Etichetta bottone: `Aplicar propuesta` quando coincide con la recommended, altrimenti `Aplicar <hora>` per rendere esplicita l'ora applicata.

### Gap 3 — Guard marker
- Aggiornato marker stantio `ppp-opt3` → `ppp-prop` in `scripts/guard-no-lab-markers.js` (la classe reale ora è `ppp-prop`). Guard **non allargato** oltre il necessario; gli altri marker invariati.

## File toccati (vs checkpoint `c3e577c`)
| File | Δ | Stato |
|---|---|---|
| `src/components/PremiumPlannerPopup.jsx` | +104 / -13 | M |
| `scripts/guard-no-lab-markers.js` | +1 / -1 | M |
| `src/components/PremiumPlannerPopup.cabling.test.js` | +~160 (nuovo) | ?? untracked |

Nessun altro file. Backend/contract/ORDINI/altri componenti: **non toccati**.

## Validazione — PASS

| Check | Esito |
|---|---|
| `npm run build` (CONTEXT=local) | **PASS** — Compiled successfully |
| guard prebuild (locale) | **skip** corretto (CONTEXT≠production) |
| guard `CONTEXT=production` (sanity) | **blocca** correttamente (trova marker V1, incluso `ppp-prop`) |
| PremiumPlannerPopup.cabling.test.js | **PASS 6/6** |
| PremiumPlannerPopup.smoke.test.js | **PASS 6/6** (nessuna regressione) |
| confirmGating.static.test.mjs | **PASS 9/9** |
| usaEstaHora.static.test.mjs | **PASS 7/7** |

**Totale: 28/28.** Nessun warning (act risolto con `React.act` + fallback).

### Test cabling aggiunti (6)
1. clic box proposta cambia la selezione attiva
2. clic box proposta apre la riga giro collegata (giroId)
3. clic riga giro sincronizza la selezione della proposta (+ `is-active`)
4. Aplicar usa la proposta **selezionata**, non sempre la best (15:55 → 16:10)
5. fallback: selezione non applicabile (no_recomendado) → Aplicar usa la **best** (15:55)
6. not_recommended fuori dai bottoni primari + default selezione mai not_recommended

## Note / follow-up (non bloccanti)
- Il legame proposta↔giro richiede che il backend popoli `giroId` su `proposals` (o sull'opp sorgente) e `id` su `serviceLine`. Se `giroId` manca, la proposta semplicemente non apre alcuna riga (degradazione sicura, nessun crash, nessun dato inventato). **Da verificare lato contract reale** quando si testerà su staging.
- §7.1 "proposta centrata sull'ora operatore" resta una proprietà del **contract backend** (firstAvailable/startTime), fuori dal perimetro di questo popup.

## Stato finale
Patch applicata, tutto verde, **lavoro NON committato** (working tree). 

**STOP.** Nessun commit automatico, nessun deploy, nessun push. In attesa di tua conferma per committare il checkpoint del cablaggio (o proseguire).
