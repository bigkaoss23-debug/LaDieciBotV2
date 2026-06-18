# NUEVO_PEDIDO_PERFORMANCE_P1A_PRODUCTION_DEPLOY_03 — REPORT

**Data:** 2026-06-15 · **Esito:** ✅ **OK — P1A LIVE (con functions, login OK)**
**Deploy eseguito da:** utente (CLI, `--functions`). Re-lock eseguito dall'agente (`lockDeploy` non è bloccato dalla guardia). Agente: precheck, build, postcheck.

---

## VERDETTO: ✅ OK
- Login funziona ✅ · functions `api,auth` vive ✅ · V1/Lab marker zero ✅ · production locked ✅ · bundle byte-identico ✅

## Patch
- Branch `hotfix/prod-nuevo-pedido-performance-p1a-2026-06-15` · commit **`01bf952`** · base `2195c66`.
- Contenuto: race-guard (`createLatestOnly`) + debounce allineato ~600ms su `resolveAddress`, `shouldGeocode()` gate; `previewOrderTiming` invariato. Vedi `NUEVO_PEDIDO_PERFORMANCE_P1A_PATCH_01_REPORT` + smoke `..._RUNTIME_SMOKE_02`.

## Precheck (tutti ✅)
- branch/HEAD `01bf952`, base 2195c66 ancestor.
- diff da 2195c66 = SOLO `NuevoPedidoModal.jsx` + `utils/nuevoPedidoGeocode.js` + `utils/nuevoPedidoGeocode.test.js`. Nessun file vietato.
- test 29/29 (`nuevoPedidoGeocode` 10 + `pedidosVisibility` 11 + `realtimeFreshness` 8).
- build *Compiled successfully* · `version.json` 01bf952 · bundle `main.803b633a.js` md5 **`647a643984efb74a8695aacdfd63fddb`**.
- marker V1/Lab nel bundle build = 0.
- functions `auth.js` + `api.js` presenti.

## Deploy (corretto, con functions)
- Comando utente: `unlockDeploy 6a3024ce` → `netlify deploy --prod --dir=…/p1a/…/build --functions=…/p1a/…/netlify/functions --site 02bd4c7a…` → `lockDeploy` (agente).
- **Mai** `--dir=build` da solo.

| | prima | dopo |
|---|---|---|
| published deploy | `6a3024ce3b07a6d99692f0cd` | **`6a3035026590241e2255ace3`** |
| commit | 2195c66 | **01bf952** |
| functions | api,auth | **api,auth** ✅ |
| locked | true | **true** |

## Postcheck PRODUCTION (tutti ✅)
1. `/version.json` commit = **01bf952** (branch hotfix/prod-nuevo-pedido-performance-p1a)
2. published `6a3035026590241e2255ace3`, **locked=true**, ready; functions `api,auth`
3. `/api/auth` → **JSON 400** (non HTML) → login OK
4. `/api/proxy` → **401** (non 404)
5. bundle live `main.803b633a.js` md5 **`647a643984efb74a8695aacdfd63fddb`** = **byte-identico** al build
6. marker V1/Lab → **tutti 0** (ppp-opt3, PremiumPlannerPopup, PremiumProposalsLabPanel, ManualGiroSection, Sin giro compatible, Sin alternativa)
7. backend Railway `397d4061-50b5-4400-bc38-a6b2ceab0f4d`, /health 200, ok:true → invariato
8. zero DB write (solo deploy statico+functions)

## Stato finale produzione
`https://magnificent-lollipop-6dff70.netlify.app` · commit **01bf952** · deploy **6a3035026590241e2255ace3** · **locked true** · login OK · functions vive.
Live ora = vecchia UI + WA orphan fix + Cocina polling fix + **P1A perf Nuevo Pedido** (race-guard resolveAddress + debounce allineato).

## Rollback target
`6a3024ce3b07a6d99692f0cd` (commit 2195c66, ha api+auth) — via UI "Publish deploy" o `restoreSiteDeploy`.

## Safety
- ✅ Nessun V1 / Planner / Lab / consolidation / backend / Railway / DB write / cleanup / push main.
- ✅ `ORDINI_2026-05-23.md` non toccato.
- ✅ Guardia hook NON disattivata (intatta tutta la sessione; deploy eseguito dall'utente, re-lock dall'agente che non è azione bloccata).
- ✅ Deploy completo di functions (`--functions`), regola anti-guasto rispettata.
