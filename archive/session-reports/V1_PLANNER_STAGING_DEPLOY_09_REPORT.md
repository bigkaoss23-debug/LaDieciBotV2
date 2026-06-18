# V1_PLANNER_STAGING_DEPLOY_09_REPORT

Data: 2026-06-15 — **DEPLOY SOLO STAGING LAB. Nessun production, nessun site prod, nessun Railway, nessun DB write, nessun ordine, repo intoccato.**

## Sicurezza / perimetro
Deploy **esclusivamente** sul sito staging `ladieci-v1-staging` (`a3ad035a-e73f-4da3-8873-6403e31f04b6`). Site production `02bd4c7a-…` **non toccato**. NO `netlify deploy --prod` verso production. NO Railway. NO DB. NO ordini. `ORDINI_2026-05-23.md` non toccato. Nessun codice modificato (tree pulito, HEAD `c07c68f`).

## Preflight
| Check | Esito |
|---|---|
| Branch | `consolidation/nuevo-pedido-v1-unified-2026-06-09` ✅ |
| HEAD | `c07c68f` ✅ |
| git status | pulito ✅ |
| Backup remoto | `backup/v1-planner-popup-cabling-2026-06-15 = c07c68f` ✅ |
| Production | site `02bd4c7a…`, published `6a303f3d6163c6482cc531cd`, **locked True** ✅ |
| Staging | `a3ad035a-e73f-4da3-8873-6403e31f04b6` = `ladieci-v1-staging` ✅ |
| Trap link locale | `.netlify/state.json` → `02bd4c7a` (PROD) ⚠️ → **mitigato con `--site` esplicito** |

## Decisione functions
Lo staging **usa già** functions `api` + `auth` (verificato sul deploy pubblicato precedente). `netlify.toml` mappa `/api/proxy→api`, `/api/auth→auth`. Quindi deploy **con `--functions`** (regola "deploy completi solo con --functions").

## Comando eseguito (site staging esplicito)
```
ALLOW_V1=1 npx netlify deploy \
  --site a3ad035a-e73f-4da3-8873-6403e31f04b6 \
  --dir build --functions netlify/functions --prod \
  --message "V1 planner cabling c07c68f"
```
- ✅ contiene `--site a3ad035a-e73f-4da3-8873-6403e31f04b6` (staging) · ❌ nessun riferimento a `02bd4c7a`.
- `--prod` qui pubblica sul **sito staging** (URL principale di `ladieci-v1-staging`), non sul sito production.
- **Nota guard:** il primo tentativo è fallito perché `--prod` imposta `CONTEXT=production` e il `guard-no-lab-markers.js` ha **correttamente bloccato** la build (marker V1 presenti). Trattandosi del publish V1 **consapevole sul LAB**, ho usato la scappatoia documentata `ALLOW_V1=1` (scopo esatto: pubblicare V1), sempre con site staging esplicito.

## Build
`npm run build` (locale e ri-eseguita da Netlify): `Compiled successfully`, bundle **`main.4a15067f.js`**, `version.json` commit `c07c68f`. Bundle deployato **identico** a quello locale (hash deterministico).

## Postcheck staging — PASS
| Check | Esito |
|---|---|
| Deploy live | **id `6a3050ec885ff40547a33e81`** su `ladieci-v1-staging` ✅ |
| URL | https://ladieci-v1-staging.netlify.app (+ unique `6a3050ec…--ladieci-v1-staging.netlify.app`) |
| `version.json` | `commit: c07c68f`, branch consolidation, deployId `6a3050ec…` ✅ |
| Bundle | `main.4a15067f.js` = build locale validata ✅ |
| `/api/auth` | http **401 + application/json** → function viva (JSON, non HTML) ✅ |
| `/api/proxy` | http **401** (non 404) → function viva ✅ |
| Root page | http **200**, `<title>La Dieci</title>`, `<div id="root">` → carica ✅ |
| Marker V1 su staging | **PRESENTI** (`Aplicar propuesta`, `Giros y huecos`, `ppp-prop`) ✅ |
| Marker V1 su production | **ASSENTI** (prod bundle `main.803b633a.js`, grep vuoto) ✅ |
| Production lock | published `6a303f3d`, **locked True** → intoccata ✅ |
| DB / ordini | nessuna scrittura, nessun ordine creato ✅ |

## Smoke staging interattivo
Il click-through in-app (3 box → clic apre giro → clic riga cambia selezione/mappa/Aplicar → no_recomendado non primaria → mappa leggibile) richiede il **login operatore (PIN)**, che **non è in mio possesso** in questa sessione. Non ho creato ordini né fatto submit.

**Equivalenza garantita:** il bundle deployato è **byte-identico** (`main.4a15067f.js`) alla build già sottoposta a smoke visuale locale in `V1_PLANNER_UI_LOCAL_SMOKE_06_REPORT` (6/6 casi PASS) + test `cabling` 6/6 + contract audit `07` (campi reali OK). Quindi l'UI servita su staging **coincide** con quella validata; resta da fare solo la conferma on-screen con login + anchor reali.

## Output / URL per verifica manuale
- Staging: **https://ladieci-v1-staging.netlify.app** (deploy `6a3050ec885ff40547a33e81`, commit `c07c68f`)
- Apri Nuevo Pedido → scegli ora + items → apri il Planner: dovresti vedere 3 box, Giros y huecos, mappa, Aplicar.

## Raccomandazione
Deploy staging **riuscito e verificato a livello infra/bundle**. Prossimo passo (su tua conferma): **smoke visuale con login** sullo staging (tu o fornendomi accesso PIN), per chiudere i punti 3.x interattivi con dati/anchor reali. Nessun passo verso production.

**STOP.** Nessun production, nessun backend, nessun push main.
