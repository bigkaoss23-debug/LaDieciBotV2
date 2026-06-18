# V1_PLANNER_STAGING_SMOKE_10_REPORT

Data: 2026-06-15 — **SMOKE STAGING READ-ONLY (login + preview). Nessun ordine, nessuna scrittura business, nessun production, repo intoccato.**

## Sicurezza / perimetro
Solo staging `ladieci-v1-staging`. Login con PIN fornito dall'utente. Unica azione applicativa: `previewStrategicOpportunities` (`safety {writes:false}`). NO ordini, NO submit/confirm, NO production, NO push. `ORDINI_2026-05-23.md` non toccato. Codice non modificato (HEAD `c07c68f`, tree pulito). Nota: il login esegue il normale bookkeeping di rate-limit (upsert su `config`, riga `AUTH_BLOCK_*`) — **nessuna scrittura di ordini/dati business**.

## Flusso eseguito (path reale dell'app)
1. `POST /api/auth {pin}` → **200**, `role: operador`, token JWT (tenuto fuori dai log, file token rimosso a fine smoke).
2. `POST /api/proxy {action:'previewStrategicOpportunities', …}` con `Authorization: Bearer <token>` → proxy Netlify staging → Railway (X-Api-Key server-side) → **200**.

Draft sintetico usato (no PII, non persistente): `tipoConsegna DOMICILIO, zone Q2, hora 20:50, pizzas 2, startTime 20:35, now 20:30`.

## Risultato runtime — PASS

| Check | Esito | Valore |
|---|---|---|
| Login staging (PIN) | **PASS** | 200, role operador |
| Wiring end-to-end (proxy→Railway) | **PASS** | proxy http 200 |
| `contract` | **PASS** | `premium-planner-strategic-preview-v1` |
| Chiavi contract | **PASS** | bestProposal, blockers, contract, currentOrder, firstAvailable, input, mode, ok, opportunities, **proposalContract**, **proposals**, **safety**, **serviceLine**, source, warnings |
| `safety` read-only | **PASS** | `{readOnly:true, writes:false, pii:"redacted"}` → **nessuna scrittura** |
| `firstAvailable` | **PASS** | `{zone:Q2, eta:20:50, status:compatible}` |
| `bestProposal` / recommended | **PASS** | id `cand-crear-q2` |
| `proposals[]` presente | **PASS** | n=1 → `(cand-crear-q2, direct, 20:50, compatible)` |
| `proposals[].id` | **PASS** | `cand-crear-q2` |
| `serviceLine[]` presente | **PASS (vuoto)** | n=0 |
| `opportunities[]` | **PASS (vuoto)** | n=0 |
| Ordine creato? | **NO** | preview pura, writes:false |

## Interpretazione (importante)
- Il contract runtime ha **shape corretta e completa**; il wiring login→proxy→backend→popup **funziona end-to-end** su staging.
- `serviceLine` e `opportunities` sono **vuoti** perché **oggi ci sono 0 ordini** (`/status` todayCount=0) → non esistono *anchor*/giri reali della serata da agganciare. Questo è uno **stato dati reale**, non un difetto del contract.
- Di conseguenza il legame runtime `proposals[].giroId via opportunity ↔ serviceLine.id` **non è osservabile ora** senza creare ordini di test — operazione **fuori perimetro** (NO ordini reali). La correttezza di quel legame è già provata staticamente sul **sorgente backend** in `V1_PLANNER_CONTRACT_READONLY_07_REPORT` (`anchorId = anchor.id`, `serviceLine.id = a.id`, `proposal.id = opp.id`).

## UI corrispondente a questo stato runtime
Con `proposals=[direct]` + `serviceLine=[]`, il popup mostra: **1 box "Directa" + 2 slot grigi "Sin opción"**, **Giros y huecos** in empty-state ("No hay otros giros…"), **mappa** con rotta diretta a Q2, **Aplicar 20:50**. È esattamente il **Caso E** già validato nello smoke visuale locale (`V1_PLANNER_UI_LOCAL_SMOKE_06_REPORT`). Il bundle staging è byte-identico (`main.4a15067f.js`) a quello smoke-testato.

I casi multi-proposta + giro cliccabile (A/B/C/D) restano provati da: smoke visuale locale (06, 6/6), test `cabling` (6/6), audit contract sorgente (07). Per osservarli **live** servirebbe data di test (anchor reali) sullo staging — da decidere separatamente, fuori da questo perimetro.

## Verifiche collaterali
- Production: site `02bd4c7a…`, published `6a303f3d`, **locked True** → intoccata.
- Repo: tree pulito, HEAD `c07c68f`.

## Raccomandazione
Staging V1 Planner **funzionante e validato end-to-end** (deploy + functions + auth + contract read-only). I percorsi interattivi multi-giro sono validati su fixture/sorgente; per vederli **on-screen con dati reali** serve, separatamente e con tua autorizzazione, **test data controllato** sullo staging (creare 1–2 ordini marker `TEST%` e poi eliminarli secondo il protocollo di cleanup staging) — **non eseguito qui** per rispetto del perimetro "NO ordini".

**STOP.** Nessun production, nessun backend deploy, nessun push main.
