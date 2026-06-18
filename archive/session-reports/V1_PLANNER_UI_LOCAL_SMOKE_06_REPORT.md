# V1_PLANNER_UI_LOCAL_SMOKE_06_REPORT

Data: 2026-06-15 — **SMOKE VISUALE LOCALE. Nessun deploy, nessun DB write, nessun ordine, nessun codice toccato, production intoccata.**

## Sicurezza / perimetro
Solo branch `consolidation/nuevo-pedido-v1-unified-2026-06-09`, HEAD `c07c68f`. NO production / Netlify prod / Railway / DB / ordini / cleanup / deploy / push / main. `ORDINI_2026-05-23.md` non toccato. Codice app **non modificato** (tree `src/scripts` pulito a fine smoke).

## Metodo (read-only, no backend)
Il `PremiumPlannerPopup` si monta solo con un contract strategic valido e **il mock è stato rimosso**: non esiste harness/route per aprirlo nel dev server senza backend. Per uno smoke **fedele e senza backend/DB** ho renderizzato il **componente reale** (transpilato col preset CRA) con le **fixture controllate** dei test, generando HTML statico ispezionabile.
- Script effimero in `/tmp/planner_smoke/render.js` (import **read-only** di `src`, `NODE_PATH` → node_modules dell'app). **Nessun file creato in `src`/`scripts`.**
- Output HTML reale (con CSS inline del componente) in `/tmp/planner_smoke/{A,B,D,E}.html` — apribili nel browser per ispezione visiva.
- Interattività (clic che cambiano selezione/mappa/Aplicar) **già provata** dai test `PremiumPlannerPopup.cabling.test.js` (6/6 verdi, commit `c07c68f`): qui confermo struttura/layout sul rendering reale; B/C li riassumo coi rispettivi test.

## Casi — PASS/FAIL

| Caso | Descrizione | Esito | Evidenza |
|---|---|---|---|
| **A** | 3 proposte con giro compatibile | **PASS** | esattamente 3 box (`ppp-prop is-active`, `ppp-prop`, `ppp-prop`); titoli *Directa / Q1+Q5 compatible / Q2 alternativa*; primo box attivo di default; mappa `ppp-map-card` + nodi rotta + 5 zone; Giros y huecos = 2 righe con salida 15:33 / entrega / regreso 16:22 |
| **B** | proposta selezionata ≠ best → Aplicar usa quella | **PASS** | con `ins` come prima primaria, box `ins` attivo e bottone mostra **"Aplicar 16:10"** (≠ best 15:55). Comportamento clic confermato da cabling test #4 (15:55→16:10) |
| **C** | clic riga "Giros y huecos" aggiorna selezione/mappa/timeline | **PASS** (via cabling) | cabling test #2/#3: clic box apre la riga giro collegata (`#ppp-sl-a2.is-open` + `.ppp-rt`); clic riga sincronizza la selezione (`is-active`) e la mappa segue `selectedOpp` |
| **D** | `no_recomendado` visibile ma non CTA primaria | **PASS** | `Cruzado Q4` (not_recommended) **non** tra i box (2 pieni + 1 empty); l'avviso compare come **nota** del planner ("Cruzar canales … no recomendado"), non come bottone |
| **E** | proposte mancanti → box grigio/empty chiaro | **PASS** | 1 box pieno + **2 "Sin opción" disabled**; sezione Giros y huecos **resta** con empty-state "No hay otros giros esta tarde" |
| **F** | mappa leggibile, non rimpicciolita | **PASS** | mappa con titolo *Esquema operativo por zonas*, mare, **5 zone** Q1–Q5, hub Pizzería, polilinea rotta + badge ETA per parada; nessuna riduzione (layout `ppp-top-grid` invariato, ~36KB di markup+CSS) |

**Asserzioni strutturali sul rendering reale: tutte verdi** (l'unico "FAIL" iniziale era una mia asserzione errata — il selettore `.ppp-prop-title` nello `<style>` inline falsava il conteggio; verificato a mano: 3 box reali).

## Bug UX reali trovati
**Nessuno bloccante.** Note minori (non bug):
- Il box selezionato e la sua riga giro collegata si illuminano (`is-active` ciano), ma **non c'è auto-scroll visibile in rendering statico** — lo scroll avviene solo al clic reale (`scrollIntoView`, già nel codice, non testabile in SSR). Da confermare on-screen su staging.
- Il legame proposta↔giro dipende da `giroId` (su proposta o opp) e `serviceLine[].id`: nelle fixture funziona; **sul contract reale va verificato** che il backend li popoli (altrimenti il clic seleziona ma non apre riga — degradazione sicura, nessun crash).

## File / artefatti
- HTML reali per ispezione: `/tmp/planner_smoke/A.html`, `B.html`, `D.html`, `E.html` (aprire nel browser).
- Script effimero: `/tmp/planner_smoke/render.js` (fuori repo).
- Nessuno screenshot nuovo generato (come richiesto).

## Raccomandazione
**C) serve un contract/backend check read-only su `giroId` / `serviceLine.id`.**

Motivo: la UI V1 è **visivamente e strutturalmente sana** (tutti i casi PASS, layout/mappa/empty-state corretti, no_recomendado non primaria, Aplicar segue la selezione). L'unico punto che il rendering con fixture **non può** garantire è che il **contract strategic reale** popoli i campi che reggono il cablaggio: `giroId` sulle proposte (o sull'opp sorgente) e `id` sulle righe `serviceLine`. Senza quei campi, selezione e Giros y huecos restano leggibili ma **non si agganciano** (degradazione sicura).

Quindi prima di **A) staging deploy**: un controllo read-only del contract reale (un `previewManualGiro`/strategic preview su backend, **senza scritture**) per verificare che `giroId`/`serviceLine.id` arrivino valorizzati. Se OK → pronti per staging; non serve **B) micro-fix** lato frontend.

**STOP.** Nessun commit, nessun deploy, nessun push, nessuno staging.
