# ENV_SPLIT_V1_14 — GIT-LINKED V1 ANTI-PROD CHECK — REPORT

**Data:** 2026-06-17
**Esito:** ❌ **FAIL** — il deploy git-linked esiste ma **serve 404** (build mai eseguito: base directory non impostata su `ladieci-app33`). Anti-prod non eseguibile (niente bundle/functions). Production intoccata. Nessuna scrittura. NO planner test.

---

## Deploy identificato
- **deploy id:** `6a32e377e53e137f7009a41e`
- **site_id:** `a3ad035a-e73f-4da3-8873-6403e31f04b6` (**V1 staging**) ✅ — **NON** prod `02bd4c7a` ✅
- **state:** ready · **context:** production · **branch:** `backup/v1-env-split-backend-url-2026-06-17` · **commit_ref:** `818523e` (build di pipeline reale, non CLI draft)
- **È il published deploy** del site V1 (main URL `https://ladieci-v1-staging.netlify.app`).
- Il sito **ora è git-linked**: `build_settings.provider=github`, `repo=https://github.com/bigkaoss23-debug/LaDieciBotV2`.

## ROOT CAUSE — build non eseguito (base dir mancante)
`build_settings`: **`base=None`, `cmd=None`, `dir=None`, `functions_dir=None`**.
Il `netlify.toml` sta in `ladieci-app33/`; senza **base directory = `ladieci-app33`** Netlify non lo trova → niente build command, niente publish dir corretta, niente functions.
Deploy summary: *"5 new files uploaded · No redirect rules processed · No functions deployed · No edge functions deployed"* · `available_functions: []` · `framework: unknown`.
Ha pubblicato la root del repo → **404 su tutto**.

## Check obbligatori — esito
| # | Check | Atteso | Riscontrato | Esito |
|---|---|---|---|---|
| — | Deploy appartiene a V1 | site a3ad035a | a3ad035a | ✅ |
| — | NON è site production | ≠ 02bd4c7a | ≠ 02bd4c7a | ✅ |
| 1 | `version.json` | 200, commit 818523e | **404** | ❌ |
| 2 | Bundle scan | bundle presente, 0 prod ref | **nessun bundle** (404, `/static/js/main.*` assente) | ❌ (non valutabile) |
| 3 | Auth repartidor `654321` | 200 token | `/api/auth` → **404** (function non deployata) | ❌ |
| 4 | Proxy getConfig → STAGING | La Dieci (STAGING) | non valutabile (no functions) | ❌ |
| 5 | Backend target = fearless-reverence | — | non valutabile | ❌ |
| 6 | Supabase = tdikhfeinufaahagmpjz | — | non valutabile | ❌ |
| 7 | Zero writes | nessuna | **nessuna** (solo letture/404) | ✅ |

> Nota: i ref prod (`ladiecibot-production`, `wnswassgfuuivmfwjxsf`) sono assenti, ma **solo perché non è stato costruito nulla** — non è una prova di isolamento. Anti-prod NON superato perché il deploy non è funzionale.

## DA CORREGGERE NELLA NETLIFY UI (site `ladieci-v1-staging`, a3ad035a) — 2 fix
1. **Base directory → `ladieci-app33`** (Site config → Build & deploy → Build settings). Così `netlify.toml` viene letto: build `npm run build`, publish `build` (→ `ladieci-app33/build`), functions `netlify/functions` (→ `ladieci-app33/netlify/functions`).
2. **⚠️ Contesto build — il branch è il "production branch" del sito → CONTEXT=production.** Una volta che il build girerà davvero, `scripts/guard-no-lab-markers.js` **bloccherà** il build (fire su CONTEXT=production, e `ALLOW_V1` è vietato). Quindi il branch V1 va deployato come **BRANCH DEPLOY (context=branch-deploy)** o via **PR (deploy-preview)**, NON come production branch:
   - impostare la **production branch** del sito su un branch non deployato (es. `main`), e
   - abilitare **Branch deploys** per `backup/v1-env-split-backend-url-2026-06-17`, poi triggerare il branch deploy.
   - In `branch-deploy` il lab guard salta **e** Netlify inietta le env del sito nelle functions (lo scopo del git-linked).

Env del site V1: già complete (verificate in V1_13, inclusa `REACT_APP_BACKEND_API_URL`).

## Conferme sicurezza
- ✅ Production intoccata: deploy `6a303f3d` locked (site prod `02bd4c7a`).
- ✅ Deploy testato = site V1 `a3ad035a` (main URL `ladieci-v1-staging.netlify.app`), non prod.
- ✅ Zero ordini, zero scritture DB, zero cleanup, zero WhatsApp, zero planner test.
- ✅ `ORDINI_2026-05-23.md` non toccato. Nessun segreto stampato.
- ℹ️ Il published deploy del site V1 è attualmente un 404 (staging rotto, innocuo): nessun rollback richiesto/eseguito.

## Prossimo step
1. (UTENTE, UI) Impostare base dir `ladieci-app33` + deployare il branch V1 in **branch-deploy** (non production branch).
2. Ri-triggerare il deploy → verificare build OK + functions deployate.
3. Tornare per **ri-eseguire FASE 4 anti-prod check** sul nuovo deploy.
4. Solo a PASS pieno → isolated planner Q5/Q2 (sessione separata).

**STOP.** Niente planner test, niente ordini.
