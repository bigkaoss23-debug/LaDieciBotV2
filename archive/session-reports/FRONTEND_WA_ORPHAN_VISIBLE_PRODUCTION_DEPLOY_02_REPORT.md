# FRONTEND_WA_ORPHAN_VISIBLE_PRODUCTION_DEPLOY_02 — REPORT

**Data:** 2026-06-15 ~07:36 UTC
**Esito:** ✅ **OK — DEPLOY ANDATO A BUON FINE**
**Autorizzazione:** utente, opzione B (bypass temporaneo hook `guard-prod-deploy.sh` solo per questa sequenza).

---

## VERDETTO: ✅ OK

- Production = hotfix **`cb13736`** ✅
- V1 / Planner / Lab marker = **zero** ✅
- Production **locked = true** ✅
- Backend Railway **intatto** (`397d4061`, health ok) ✅

---

## 1. Branch / HEAD / base
- **Branch:** `hotfix/prod-wa-orphan-visible-2026-06-14` (worktree isolato, NON consolidation)
- **HEAD:** `cb13736` (`cb13736a52a180d51c8747ea3f8544bb5ca55041`)
- **Base `777ae55` confermata ancestor:** `git merge-base --is-ancestor 777ae55 HEAD` → OK ✅

## 2. Diff esatto — SOLO i 5 file autorizzati
`git diff --name-only 777ae55..HEAD`:
```
ladieci-app33/src/components/NuevoPedidoModal.jsx
ladieci-app33/src/components/ordenes/OrdenCard.jsx
ladieci-app33/src/components/ordenes/TabManual.jsx
ladieci-app33/src/utils/pedidosVisibility.js
ladieci-app33/src/utils/pedidosVisibility.test.js
```
`--stat`: 5 file, **+132 / −2** (chirurgico). Nessun PremiumPlannerPopup / Planner UX / package.json / .claude / report nel diff. ✅

## 3. Marker V1/Lab nel SOURCE hotfix
`git grep` su `ppp-opt3 | ppp-detail | Sin giro compatible | Sin alternativa | PremiumPlannerPopup | PremiumProposalsLabPanel | ManualGiroSection` → **nessun match** ✅

## 4. Test
`react-scripts test src/utils/pedidosVisibility.test.js` → **11 passed / 11** ✅
(MANUAL/TEL/vuoto in Pedidos · BANCO fuori · WA+wa_id nel flusso WA · WA senza wa_id in Pedidos fallback · nessun POR_CONFIRMAR invisibile · badge corretti)

## 5. Build
`CI=false npm run build` → *Compiled successfully* · `build/version.json` commit **cb13736** · bundle `main.f71eec1d.js` (222.72 kB gz)
Marker V1/Lab nel build = **0**; marker hotfix presenti. ✅

## 6. DeployId prima / dopo
| | prima | dopo |
|---|---|---|
| published deploy | `6a2533b4926549d7ee8937b1` | **`6a2fab72f27a0e26497d4f4c`** |
| commit | 777ae55 | **cb13736** |
| locked | true | **true** |
| state | ready | ready |

Sequenza eseguita: **[14]** `unlockDeploy 6a2533b4…` → OK · **[15]** `netlify deploy --prod --dir=<build hotfix> --site 02bd4c7a-a50b-4964-90da-8c1af1122932` → nuovo `6a2fab72…` · **[16]** `lockDeploy 6a2fab72…` → OK.
Site esplicito usato sempre (CLI era linkata al site sbagliato `soft-stroopwafel-e517fe` → local-link trap evitato).

## 7. Lock
`getSite` → `published_deploy.id = 6a2fab72f27a0e26497d4f4c`, **`locked = true`**, `state = ready` ✅

## 8. Marker V1 = zero (verifica su PRODUCTION live)
Bundle live `main.f71eec1d.js` scaricato e **decompresso** (Netlify lo serve compresso):
**live md5 `1d9eac0582c0378b63339035e5db01a1` == build verificato `1d9eac05…` (byte-identici, 696.309 B)** → il deployato è ESATTAMENTE il build verificato.

| marker | live |
|---|---|
| ppp-opt3 | 0 |
| ppp-detail | 0 |
| Sin giro compatible | 0 |
| Sin alternativa | 0 |
| PremiumPlannerPopup | 0 |
| PremiumProposalsLabPanel | 0 |
| ManualGiroSection | 0 |
| **WA sin conversación** (hotfix) | **1 (presente)** |
| WhatsApp | 13 (presente) |

(`belongsToPedidos`/`pedidosVisibility` non compaiono in chiaro perché terser minifica i nomi; il testo del badge prova la presenza del codice hotfix.)

## 9. Backend intatto
`/health` → http 200 · `/version` → `deploymentId 397d4061-50b5-4400-bc38-a6b2ceab0f4d`, `ok:true` → **invariato** ✅

## 10. Hook guard — disattivazione/ripristino tracciati
- Backup `guard-prod-deploy.sh.bak`, md5 originale **`2daf95281167d60495af614317df8c6c`**.
- Disattivato con stub `exit 0` SOLO per la sequenza unlock/deploy/lock.
- **Ripristinato byte-identico** (md5 post-restore `2daf9528…` == originale) ✅, `.bak` rimosso.
- **Test guardia post-ripristino:** comando finto `unlockDeploy {FAKE-TEST}` → **BLOCCATO** (exit 2, non eseguito) ✅

---

## SAFETY — confermato
- ✅ Deploy SOLO hotfix WA orphan (cb13736), build già verificato.
- ✅ Nessun Nuevo Pedido V1 / Planner UX / PremiumPlannerPopup / guardie extra.
- ✅ Nessun backend / Railway / DB write / schema / migration.
- ✅ #014 NON toccato · nessun cleanup · nessun ordine creato.
- ✅ Nessun `git push main` · nessun uso di `consolidation`.
- ✅ Hook ripristinato e ri-testato attivo.
- ⚠️ Nota cosmetica: `version.json.deployId` = "unknown" (scritto a build-time locale, senza env DEPLOY_ID Netlify). Il deployId reale pubblicato è `6a2fab72f27a0e26497d4f4c` (da API getSite). `commit=cb13736` è corretto e autoritativo.

## Stato finale produzione
`https://magnificent-lollipop-6dff70.netlify.app` · commit **cb13736** · deploy **6a2fab72f27a0e26497d4f4c** · **locked true** · site `02bd4c7a`.
Effetto atteso: l'ordine orfano **#014** (canal=WA senza wa_id) ora compare in **Pedidos** con badge "💬 WA sin conversación"; i nuovi ordini dal bottone WhatsApp del modal non saranno più `canal=WA` orfani.
