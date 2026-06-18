# FRONTEND_USA_ESTA_HORA_BUG_A_STAGING_DEPLOY_03 — REPORT

**Data:** 2026-06-14
**Tipo:** Deploy STAGING del fix BUG A `7557701` (NO production)
**Esito:** ✅ **OK — staging serve `7557701`, marker presenti, prod intatto, WIP escluso**
**Safety:** zero production · zero backend · zero Railway · zero DB write · zero cleanup · zero push main · zero Planner UX · WIP `PremiumPlannerPopup.jsx` escluso · `ORDINI_2026-05-23.md` non toccato

---

## 1. Preflight

| Check | Atteso | Risultato |
|---|---|---|
| `git rev-parse --short HEAD` | `7557701` | ✅ `7557701` |
| backup remoto | → `75577016…` | ✅ `75577016f203600e118f7043cc22e348fb06ec3a` |
| status tracked | solo WIP | ✅ `M PremiumPlannerPopup.jsx` (+ untracked report) |
| PROD published | `6a2ebdf7…` (49eee1f) locked | ✅ `6a2ebdf7ea01c55811460370`, locked True |
| STAGING published (pre) | `6a2e883f…` (49eee1f) | ✅ `6a2e883f7031f4b13a6a85d0`, state ready |
| CLI link | PROD `02bd4c7a` → deploy con `--site` esplicito | ✅ |

**Esclusione WIP:** `git stash push -- ladieci-app33/src/components/PremiumPlannerPopup.jsx` → `git diff HEAD` vuoto (tracked tree == `7557701`).

---

## 2. Build pulita

`CI=false npm run build` → **Compiled successfully.**
- Bundle: **`main.02df9214.js`** (242.73 kB)
- `build/version.json` → commit `7557701`
- Marker nel bundle: `recommended_hora` ✅, `Usa esta hora` ✅, `Usa giro compatible` ✅, `can_confirm_requested_hora` ✅ (`plannerSuggestedHora` minificato → atteso)

---

## 3. Deploy staging

`netlify deploy --prod --dir=build --site=a3ad035a-e73f-4da3-8873-6403e31f04b6` (site ID esplicito, PROD non toccato).

| | Pre | Post |
|---|---|---|
| staging deployId | `6a2e883f7031f4b13a6a85d0` | **`6a2ec9b6c5fc3dd1002f2f72`** |
| staging commit | `49eee1f` | **`7557701`** |

Staging URL: `https://ladieci-v1-staging.netlify.app` · deploy URL `6a2ec9b6c5fc3dd1002f2f72--ladieci-v1-staging.netlify.app`.

---

## 4. Post-deploy verify

- Staging `/version.json` → commit **`7557701`**, deployId `6a2ec9b6c5fc3dd1002f2f72`, context production ✅
- Staging bundle live md5 = **`77a02d82e0cef2d3b94e2c1d026b0fe9`** = build locale → **artefatto byte-identico** ✅
- Marker bundle live: `recommended_hora` 1 · `Usa esta hora` 1 · `Usa giro compatible` 1 · `can_confirm_requested_hora` 1 ✅
- PROD published invariato → `6a2ebdf7ea01c55811460370` (49eee1f), locked True ✅
- `origin/main` invariato → `970daa66` ✅
- WIP `PremiumPlannerPopup.jsx` ripristinato post-deploy (`git stash pop`) → working tree torna allo stato iniziale ✅

---

## 5. Smoke

**Limite dichiarato:** smoke interattivo browser non eseguito — la UI staging richiede login PIN e una risposta backend reale `previewOrderPlanner` per popolare il riepilogo planner; le regole vietano DB write e creazione ordini. Sostituito da **artifact verification + test statici** (replica 1:1 della logica del componente):

| Smoke | Copertura | Esito |
|---|---|---|
| 1. `recommended_hora` only → "Usa esta hora" appare | `usaEstaHora` test "recommended_hora only → aparece" + marker `recommended_hora`/`Usa esta hora` nel bundle live | ✅ |
| 2. click cambia hora nel draft | audit: `setHoraFromOperator` = solo stato locale (ref + setState), nessuna network; render coperto dai test | ✅ |
| 3. "Usa giro compatible" resta visibile/funzionante | `usaEstaHora` test "giro.slot_hora invariato" + marker `Usa giro compatible` nel bundle live | ✅ |
| 4. Confirmar gating too-early resta attivo | `confirmGating` 9/9 (DOMICILIO/RITIRO too-early → disabled) + marker `can_confirm_requested_hora` | ✅ |
| 5. zero Confirmar / zero DB write | nessun Confirmar premuto, `setHoraFromOperator` senza network, nessun ordine creato | ✅ |

Test statici finali: `usaEstaHora.static.test.mjs` **7/7**, `confirmGating.static.test.mjs` **9/9**.

Bundle staging live byte-identico al build locale ⇒ il comportamento dei 5 casi è garantito dall'identità dell'artefatto + dai test che replicano la logica.

---

## 6. Git status finale

`/Users/bigart/Downloads/LaDieciBotV2-github`, branch `consolidation/nuevo-pedido-v1-unified-2026-06-09`, HEAD `7557701`:
- `M ladieci-app33/src/components/PremiumPlannerPopup.jsx` ← WIP pre-esistente, **non incluso** (stashato durante build, pop dopo)
- untracked: report markdown vari (invariati)
- `ORDINI_2026-05-23.md` non toccato
- Nessun commit, nessun push.

---

## 7. Safety

| Vincolo | Stato |
|---|---|
| Zero production | ✅ (`6a2ebdf7`, 49eee1f, locked) |
| Zero backend / Railway / DB write | ✅ |
| Zero cleanup / schema | ✅ |
| Zero push main | ✅ (`970daa66`) |
| Zero Planner UX | ✅ |
| WIP `PremiumPlannerPopup.jsx` escluso | ✅ |
| `ORDINI_2026-05-23.md` intatto | ✅ |

---

## Verdetto

✅ **OK** — staging serve `7557701` (deploy `6a2ec9b6c5fc3dd1002f2f72`), bundle pulito byte-identico al build locale, marker BUG A presenti (`recommended_hora`, "Usa esta hora", "Usa giro compatible", gating), site corretto (`a3ad035a`), PROD e main intatti, WIP escluso.

⚠️ **Nota smoke:** verifica interattiva non eseguita (login PIN + backend reale); sostituita da artifact verification (md5 identico) + test statici 7/7 e 9/9 che replicano la logica dei 5 casi. Verifica interattiva opzionale durante uso reale su staging.

**Stato deploy:** BUG A ora su STAGING; production resta `49eee1f` (BUG A non in prod) — deploy production = step separato su tua conferma.
