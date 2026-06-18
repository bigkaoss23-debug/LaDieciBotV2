# FRONTEND_CONFIRMAR_GATING_PRODUCTION_DEPLOY_06 — REPORT

**Data:** 2026-06-14
**Tipo:** Deploy production frontend del fix Confirmar gating `49eee1f`
**Esito:** ✅ **OK — production serve `49eee1f`, nuovo deploy re-locked, marker presenti, WIP escluso**
**Safety:** zero backend · zero Railway · zero DB write · zero cleanup · zero schema/migration · zero push main · zero commit · zero BUG A · zero Planner UX · WIP `PremiumPlannerPopup.jsx` NON incluso · `ORDINI_2026-05-23.md` non toccato · production re-locked

Fix deployato: `49eee1fb77a23fd8060501da7061774925a0dae2` — *fix gate confirm on planner hard blocks* (blocca `Confirmar` quando `recommendation.can_confirm_requested_hora === false`).

---

## 1. Preflight

Repo: `/Users/bigart/Downloads/LaDieciBotV2-github`, branch `consolidation/nuevo-pedido-v1-unified-2026-06-09`

| Check | Atteso | Risultato |
|---|---|---|
| `git rev-parse --short HEAD` | `49eee1f` | ✅ `49eee1f` |
| `git status --short` | solo WIP + untracked | ✅ `M PremiumPlannerPopup.jsx` + 6 untracked md |
| PROD `/version.json` | `777ae55` / `6a2533b4…` | ✅ commit `777ae55`, deployId `6a2533b4926549d7ee8937b1`, context production |
| PROD published deploy locked | true | ✅ `locked: true` |
| STAGING (`6a2e883f…--ladieci-v1-staging`) | `49eee1f` | ✅ commit `49eee1f`, deployId `6a2e883f7031f4b13a6a85d0`, site `a3ad035a` |
| Netlify CLI link | PROD `02bd4c7a` | ✅ `magnificent-lollipop-6dff70` / `02bd4c7a-a50b-4964-90da-8c1af1122932` |

**Esclusione WIP:** `git stash push -- ladieci-app33/src/components/PremiumPlannerPopup.jsx` → working tree tracked pulito; `git diff HEAD` su quel file = vuoto (== `49eee1f`). Untracked markdown/report/ORDINI non entrano nella build React (fuori da `src/`).

---

## 2. Build

Da `ladieci-app33`, `CI=false npm run build`:
- **Compiled successfully**
- Bundle: **`main.e928fb23.js`** (242.72 kB gzip) → **coincide col bundle staging atteso**
- `build/version.json` → commit `49eee1f`, commitFull `49eee1fb…`

### Verifica marker + identità bundle
- `can_confirm_requested_hora` → 1 occorrenza ✅
- `requested_hora_too_soon` → 1 occorrenza ✅
- `🚫` → presente come escape unicode (`udeab`) nel bundle minificato ✅
- **md5 bundle locale = md5 bundle staging deployato = `12890a55e285254841f50e36d9167647`** → l'artefatto è **byte-identico** a quello già passato 5/5 nello smoke UI staging (STAGING_UI_SMOKE_04).

---

## 3. Unlock production

- Deploy locked dichiarato: **`6a2533b4926549d7ee8937b1`** (777ae55).
- Unlock eseguito SOLO per pubblicare `49eee1f`: `netlify api unlockDeploy` → `locked: False`. ✅

---

## 4. Deploy production

`netlify deploy --prod --dir=build --site=02bd4c7a-a50b-4964-90da-8c1af1122932` (site ID esplicito, staging non toccato).
- Deploy live in ~14s.
- Nuovo deploy URL: `6a2ebdf7ea01c55811460370--magnificent-lollipop-6dff70.netlify.app`

| | Prima | Dopo |
|---|---|---|
| deployId | `6a2533b4926549d7ee8937b1` | **`6a2ebdf7ea01c55811460370`** |
| commit | `777ae55` | **`49eee1f`** |
| buildTime | 2026-06-07T09:02:45Z | 2026-06-14T14:43:05Z |

---

## 5. Post-deploy verify

- PROD `/version.json` → commit **`49eee1f`**, deployId **`6a2ebdf7ea01c55811460370`**, context production ✅
- PROD bundle live md5 = **`12890a55e285254841f50e36d9167647`** = staging = build locale ✅ (artefatto pulito, marker inclusi)
- Backend production invariato → `deploymentId d623be4a` ✅
- Staging deploy `6a2e883f` invariato `49eee1f` (non toccato; deploy fatto con site esplicito PROD) ✅
- **Re-lock**: `netlify api lockDeploy 6a2ebdf7…` → `locked: True` ✅
- `getSite` PROD → `published_deploy: 6a2ebdf7ea01c55811460370`, `locked: True` ✅

---

## 6. Smoke production

**Limite dichiarato (ATTENZIONE):** smoke interattivo NON eseguito — la UI production richiede login PIN e qualsiasi prova realistica rischia di toccare stato/ordini reali; le regole vietano DB write e creazione ordini. Sostituito da **artifact verification conclusiva**:

- Il bundle servito in production (`main.e928fb23.js`, md5 `12890a55…`) è **byte-identico** all'artefatto staging che ha già superato lo smoke UI 5/5 (STAGING_UI_SMOKE_04):
  - Smoke 1 RITIRO too-early → Confirmar **disabled** + footer `🚫`
  - Smoke 2 DOMICILIO Q1 too-early → Confirmar **disabled** + footer `🚫`
  - Smoke 3 DOMICILIO Q1 valido → Confirmar **enabled**
  - Q5 "no llega" → enabled/review; BUG A unchanged
- Stesso byte-stream ⇒ stesso comportamento UI: i 3 casi production attesi (RITIRO too-early disabled+🚫, DOMICILIO Q1 too-early disabled+🚫, DOMICILIO valido enabled) sono garantiti dall'identità del bundle.
- Marker gating (`can_confirm_requested_hora`, `requested_hora_too_soon`, `🚫`) verificati presenti nel bundle production.

Nessun ordine creato, nessun Confirmar premuto.

---

## 7. Git status finale

`/Users/bigart/Downloads/LaDieciBotV2-github`:
- WIP `PremiumPlannerPopup.jsx` **ripristinato** dopo build (stash pop) → working tree identico a inizio sessione (`M PremiumPlannerPopup.jsx` + untracked md invariati)
- HEAD `49eee1f`, nessun commit, nessun push
- `ORDINI_2026-05-23.md` non toccato

---

## 8. Safety

| Vincolo | Stato |
|---|---|
| Zero backend / Railway | ✅ (backend resta `d623be4a`) |
| Zero DB write / cleanup / schema | ✅ |
| Zero push main / commit | ✅ |
| Zero BUG A / Planner UX | ✅ |
| WIP `PremiumPlannerPopup.jsx` escluso dalla build | ✅ (stash durante build, pop dopo) |
| `ORDINI_2026-05-23.md` intatto | ✅ |
| Staging non toccato | ✅ (site ID esplicito PROD) |
| Production re-locked | ✅ (`6a2ebdf7…` locked True) |

---

## Verdetto

✅ **OK** — production serve `49eee1f` (deploy `6a2ebdf7ea01c55811460370`), nuovo deploy **re-locked**, marker gating presenti, bundle pulito byte-identico allo staging già validato, WIP escluso, sito corretto (`02bd4c7a`), backend/staging invariati.

⚠️ **Nota (ATTENZIONE su singola dimensione):** smoke interattivo non eseguito sulla UI production (login PIN + rischio stato reale); sostituito da artifact verification conclusiva (md5 identico all'artefatto staging passato 5/5). Verifica interattiva opzionale durante uso reale.

### Rollback
Se necessario: `netlify api unlockDeploy` su `6a2ebdf7…`, poi `restoreSiteDeploy`/republish del deploy `6a2533b4926549d7ee8937b1` (777ae55, bundle `main.66b46ad7.js`), infine re-lock. Backend e DB non coinvolti.
