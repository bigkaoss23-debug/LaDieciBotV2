# MAIN_APP_DEPLOY_SAFETY_AND_CACHE_PRODUCTION_02 — REPORT

**Data:** 2026-06-15 · **Esito:** ✅ **OK — safety script + static cache headers LIVE**
**Deploy eseguito da:** utente (CLI, `--functions`). Re-lock + postcheck: agente.

---

## VERDETTO: ✅ OK
- Login/functions vive ✅ · `/static/*` ora **immutable** ✅ · `index.html` resta must-revalidate ✅ · V1 zero ✅ · locked ✅ · `verify-prod-deploy.sh` passa ✅

## Blocco
- Branch `safety/deploy-verify-and-cache-2026-06-15` · commit **`069c273`** · base `01bf952`.
- Contenuto: `scripts/verify-prod-deploy.sh` (controllo post-deploy) + `public/_headers` (cache immutable `/static/*`). Nessun fix funzionale.

## Precheck (tutti ✅)
- HEAD `069c273`, base 01bf952 ancestor.
- diff da 01bf952 = SOLO `public/_headers` + `scripts/verify-prod-deploy.sh`. Nessun file vietato.
- build *Compiled successfully* · `version.json` 069c273 · `build/_headers` contiene `/static/* immutable`.
- functions `auth.js`+`api.js` presenti · marker V1 nel bundle = 0.
- bundle md5 `647a643984efb74a8695aacdfd63fddb` (JS invariato vs 01bf952: cambiano solo headers+script).

## Deploy (completo di functions)
- Comando utente: `unlockDeploy 6a3035…` → `netlify deploy --prod --dir=…/safety/…/build --functions=…/safety/…/netlify/functions --site 02bd4c7a…` → `lockDeploy` (agente). Mai `--dir=build` da solo.

| | prima | dopo |
|---|---|---|
| published deploy | `6a3035026590241e2255ace3` | **`6a303f3d6163c6482cc531cd`** |
| commit | 01bf952 | **069c273** |
| functions | api,auth | **api,auth** ✅ |
| locked | true | **true** |

## Postcheck PRODUCTION (tutti ✅)
1. `/version.json` = **069c273**
2. published `6a303f3d6163c6482cc531cd`, **locked=true**, functions `api,auth`
3. `/api/auth` → JSON 400 (non HTML)
4. `/api/proxy` → 401 (non 404)
5. **`scripts/verify-prod-deploy.sh` → tutto ✅, exit 0** (eseguito contro la live)
6. bundle marker V1/Lab → 0
7. **`/static/js/main.803b633a.js` → `Cache-Control: public,max-age=31536000,immutable`** ✅ (era max-age=0)
8. **`index.html` → `Cache-Control: public,max-age=0,must-revalidate`** ✅ (invariato — i nuovi deploy si prendono subito)
9. backend Railway `397d4061-50b5-4400-bc38-a6b2ceab0f4d`, /health 200 → invariato

## Effetto
- Gli asset `/static/*` (content-hashed) non vengono più rivalidati a ogni apertura → app più rapida per i ritorni, senza rischio di servire bundle stantii (l'hash cambia a ogni build, e `index.html` rivalida sempre).
- Ora esiste un **controllo post-deploy** (`verify-prod-deploy.sh`) che, lanciato dopo ogni deploy, becca un deploy rotto (functions mancanti / V1 presente) ed esce non-zero col comando di rollback pronto.

## Stato finale produzione
`https://magnificent-lollipop-6dff70.netlify.app` · commit **069c273** · deploy **6a303f3d6163c6482cc531cd** · **locked** · login OK · functions vive · vecchia UI + WA + Cocina + P1A + (safety/cache).

## Rollback target
`6a3035026590241e2255ace3` (01bf952) → `6a3024ce…` (2195c66) → `6a2533b4` (777ae55).

## Safety
- ✅ Nessun V1/Planner/consolidation/backend/DB write/cleanup/push main. `ORDINI` non toccato.
- ✅ Guardia hook NON disattivata (deploy eseguito dall'utente, re-lock dall'agente).
- ✅ Deploy completo di functions; `verify-prod-deploy.sh` conferma login vivo.
