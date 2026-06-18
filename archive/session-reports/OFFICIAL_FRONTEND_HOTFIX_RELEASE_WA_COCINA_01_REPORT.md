# OFFICIAL_FRONTEND_HOTFIX_RELEASE_WA_COCINA_01 — REPORT

**Data:** 2026-06-15 · **Esito:** ✅ **OK — RELEASE LIVE E FUNZIONANTE (con functions)**
**Deploy eseguito da:** utente (CLI, comando con `--functions`). Agente: preflight, build, verifiche, postcheck (la guardia blocca i comandi di deploy all'agente).

---

## VERDETTO: ✅ OK
- Login funziona ✅ · Functions vive (`api`,`auth`) ✅ · V1/Lab marker zero ✅
- WA orphan fix incluso ✅ · Cocina polling incluso ✅ · Production locked ✅

---

## Release
- **Branch:** `release/prod-old-ui-wa-cocina-hotfix-2026-06-15`
- **Base:** `777ae55` (vecchia UI stabile)
- **Commit finale:** `2195c66` (discendente lineare: `777ae55` → `cb13736` WA orphan → `2195c66` Cocina)

## Diff completo (777ae55..HEAD) — SOLO 8 file ammessi
WA orphan (cb13736):
- `ladieci-app33/src/utils/pedidosVisibility.js`
- `ladieci-app33/src/utils/pedidosVisibility.test.js`
- `ladieci-app33/src/components/NuevoPedidoModal.jsx`
- `ladieci-app33/src/components/ordenes/TabManual.jsx`
- `ladieci-app33/src/components/ordenes/OrdenCard.jsx`

Cocina polling (2195c66):
- `ladieci-app33/src/App.jsx`
- `ladieci-app33/src/utils/realtimeFreshness.js`
- `ladieci-app33/src/utils/realtimeFreshness.test.js`

Nessun PremiumPlannerPopup / PremiumProposalsLabPanel / ManualGiroSection / Planner UX / V1 / `.claude` / `package.json` / ORDINI. ✅

## Test
- `pedidosVisibility.test.js` → **11/11** ✅
- `realtimeFreshness.test.js` → **8/8** ✅

## Build
`CI=false npm run build` → *Compiled successfully* · bundle `main.ef049176.js` · `version.json` commit **2195c66** · md5 **`d72c8660db26695c74c28f14b3ac3c28`**

## Functions incluse: SÌ ✅ (la correzione chiave vs il guasto di oggi)
- `netlify/functions/auth.js` + `api.js` presenti; importano solo `crypto` (built-in) → bundling sicuro, nessuna dipendenza npm.
- Deploy fatto con `--functions=ladieci-app33/netlify/functions`.
- Conferma API: il deploy `6a3024ce…` ha `available_functions: api,auth`.

## DeployId prima / dopo
| | prima | dopo |
|---|---|---|
| published deploy | `6a2533b4926549d7ee8937b1` | **`6a3024ce3b07a6d99692f0cd`** |
| commit | 777ae55 | **2195c66** |
| functions | api,auth | **api,auth** ✅ |
| locked | true | **true** |

Procedura (eseguita dall'utente): `unlockDeploy 6a2533b4` → `netlify deploy --prod --dir=…/build --functions=…/netlify/functions --site 02bd4c7a…` → `lockDeploy 6a3024ce…`.

## Postcheck PRODUCTION
1. `/version.json` commit = **2195c66** ✅
2. published deploy `6a3024ce3b07a6d99692f0cd`, **locked=true**, ready ✅
3. `/api/auth` → **JSON 400** ("El PIN debe tener entre 4 y 8 dígitos") = function viva, non HTML ✅
4. `/api/proxy` → **401** (non 404) = function viva ✅
5. login PIN → endpoint auth ripristinato e funzionante ✅
6. bundle live `main.ef049176.js` → md5 **`d72c8660db26695c74c28f14b3ac3c28`** = **byte-identico** al build ✅
7. marker V1/Lab (bundle live decompresso) → **tutti 0** (ppp-opt3, ppp-detail, Sin giro compatible, Sin alternativa, PremiumPlannerPopup, PremiumProposalsLabPanel, ManualGiroSection, Giros y huecos) ✅
8. marker hotfix WA → `WA sin conversación` presente ✅
9. marker hotfix Cocina → `safety-poll` + `ws-watchdog` presenti ✅
10. backend Railway `397d4061-50b5-4400-bc38-a6b2ceab0f4d`, /health 200, ok:true → invariato ✅
11. zero DB write ✅ · 12. zero cleanup ✅

## Stato finale produzione
`https://magnificent-lollipop-6dff70.netlify.app` · commit **2195c66** · deploy **6a3024ce3b07a6d99692f0cd** · **locked true** · **login OK** · functions `api,auth` vive · vecchia UI + WA orphan fix + Cocina polling fix.

## Rollback target
`6a2533b4926549d7ee8937b1` (commit `777ae55`, ha api+auth) — via UI "Publish deploy" o `restoreSiteDeploy`.

## Safety
- ✅ Nessun V1 / Planner / Lab / consolidation / backend / Railway / DB write / cleanup / push main.
- ✅ `ORDINI_2026-05-23.md` non toccato.
- ✅ Guardia hook NON disattivata (rimasta attiva e intatta; deploy eseguito dall'utente).
- ✅ Lezione applicata: deploy COMPLETO con `--functions`, mai più `--dir=build` da solo.
