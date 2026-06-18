# FRONTEND_USA_ESTA_HORA_BUG_A_PRODUCTION_DEPLOY_04 — REPORT

**Data:** 2026-06-14
**Tipo:** Deploy PRODUCTION del fix BUG A `7557701` ("Usa esta hora" da `recommended_hora`)
**Esito:** ✅ **OK — production serve `7557701`, re-locked, marker presenti, WIP escluso**
**Safety:** zero backend · zero Railway · zero DB write · zero cleanup · zero schema · zero push main · zero Planner UX · WIP `PremiumPlannerPopup.jsx` escluso · `ORDINI_2026-05-23.md` non toccato

---

## 1. Preflight

- HEAD: ✅ `7557701`
- PROD pre-deploy: `6a2ebdf7ea01c55811460370` (49eee1f), **locked True**
- WIP escluso: `git stash push -- PremiumPlannerPopup.jsx` → `git diff HEAD` vuoto (tracked tree == `7557701`)

---

## 2. Build pulita

`CI=false npm run build` → **Compiled successfully.**
- Bundle: **`main.02df9214.js`** (242.73 kB) — stesso artefatto validato su staging
- `build/version.json` → commit `7557701`
- Marker: `recommended_hora` 1 · `Usa esta hora` 1 · `Usa giro compatible` 1 · `can_confirm_requested_hora` 1 ✅

---

## 3. Unlock → Deploy → Re-lock

- Deploy locked dichiarato: **`6a2ebdf7ea01c55811460370`** (49eee1f) → `unlockDeploy` → `locked: False`
- `netlify deploy --prod --dir=build --site=02bd4c7a-a50b-4964-90da-8c1af1122932` (site ID esplicito)
- `lockDeploy 6a2ecb8f…` → `locked: True`

| | Prima | Dopo |
|---|---|---|
| deployId | `6a2ebdf7ea01c55811460370` | **`6a2ecb8f924c8b12a12cd618`** |
| commit | `49eee1f` | **`7557701`** |
| locked | true | **true** (re-locked) |

---

## 4. Post-deploy verify

- PROD `/version.json` → commit **`7557701`**, deployId `6a2ecb8f924c8b12a12cd618`, context production ✅
- PROD bundle live md5 = **`77a02d82e0cef2d3b94e2c1d026b0fe9`** = build locale = artefatto staging validato ✅
- Marker bundle live: `recommended_hora` 1 · `Usa esta hora` 1 · `Usa giro compatible` 1 · `can_confirm_requested_hora` 1 ✅
- `getSite` → published `6a2ecb8f924c8b12a12cd618`, **locked True** ✅
- `origin/main` invariato → `970daa66` ✅
- WIP `PremiumPlannerPopup.jsx` ripristinato post-deploy (`git stash pop`) → working tree allo stato iniziale ✅

---

## 5. Verifica comportamento (artifact)

Smoke interattivo non eseguito (login PIN + backend reale; no DB write). Il bundle production è **byte-identico** all'artefatto staging (md5 `77a02d82…`) già coperto da test statici 7/7 (`usaEstaHora`) + 9/9 (`confirmGating`):
- `recommended_hora` → "Usa esta hora" appare; click → `setHoraFromOperator` (solo stato locale, nessuna network)
- "Usa giro compatible" invariato; Confirmar gating too-early attivo

---

## 6. Git status finale

`/Users/bigart/Downloads/LaDieciBotV2-github`, HEAD `7557701`:
- `M ladieci-app33/src/components/PremiumPlannerPopup.jsx` ← WIP pre-esistente, **non incluso** (stash durante build, pop dopo)
- `ORDINI_2026-05-23.md` non toccato · nessun commit · nessun push

---

## 7. Safety

| Vincolo | Stato |
|---|---|
| Zero backend / Railway / DB / cleanup / schema | ✅ |
| Zero push main | ✅ (`970daa66`) |
| Zero Planner UX | ✅ |
| WIP `PremiumPlannerPopup.jsx` escluso | ✅ |
| `ORDINI_2026-05-23.md` intatto | ✅ |
| Production re-locked | ✅ (`6a2ecb8f…` locked True) |

---

## Verdetto

✅ **OK** — production serve `7557701` (deploy `6a2ecb8f924c8b12a12cd618`), re-locked, bundle pulito byte-identico all'artefatto staging validato, marker BUG A presenti (`recommended_hora`, "Usa esta hora", "Usa giro compatible", gating), site corretto (`02bd4c7a`), main intatto, WIP escluso.

**Stato stack planner-safety + BUG A — tutto live:**
- Backend: A.1 slip guard + A.2 promised gap guard (`dc36160` / `397d4061`)
- Frontend: Confirmar gating + BUG A "Usa esta hora" (`7557701` / `6a2ecb8f…`)

**STOP deploy** come richiesto. Planner UX = blocco separato.

### Rollback
`unlockDeploy 6a2ecb8f…` → republish `6a2ebdf7ea01c55811460370` (49eee1f, bundle `main.e928fb23.js`) → re-lock. Backend/DB non coinvolti.
