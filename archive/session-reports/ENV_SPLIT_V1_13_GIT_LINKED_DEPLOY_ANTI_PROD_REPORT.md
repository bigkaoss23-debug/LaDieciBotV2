# ENV_SPLIT_V1_13 — NETLIFY GIT-LINKED V1 DEPLOY + ANTI-PROD — REPORT

**Data:** 2026-06-17
**Esito:** ⛔ STOP a FASE 2 — il site V1 **NON è git-linked**. Serve configurazione manuale nella Netlify UI (non scriptabile da CLI senza OAuth/GitHub App). Nessun deploy, nessun CLI draft, production intoccata. NO planner test.

---

## FASE 0 — Preflight: PASS
| Check | Atteso | Riscontrato | Esito |
|---|---|---|---|
| Repo | LaDieciBotV2-github | idem | ✅ |
| Branch | consolidation/nuevo-pedido-v1-unified-2026-06-09 | idem | ✅ |
| HEAD | 818523e | 818523e83bbc804a631cdf2a762867f7af34dcc9 | ✅ |
| File tracciati modificati | nessuno | nessuno (solo untracked) | ✅ |
| PROD deploy locked | 6a303f3d / true | 6a303f3d6163c6482cc531cd / **true** | ✅ |
| V1 site | a3ad035a / ladieci-v1-staging | confermato | ✅ |

## FASE 1 — Env Netlify V1: PASS (dopo 1 aggiunta)
| Var | Target/stato | Esito |
|---|---|---|
| BACKEND_API_URL | https://fearless-reverence-production-80bc.up.railway.app/api | ✅ |
| SUPABASE_URL | https://tdikhfeinufaahagmpjz.supabase.co | ✅ |
| SUPABASE_ANON_KEY | present (staging) | ✅ |
| REACT_APP_SUPABASE_URL | https://tdikhfeinufaahagmpjz.supabase.co | ✅ |
| REACT_APP_SUPABASE_ANON_KEY | present (staging) | ✅ |
| **REACT_APP_BACKEND_API_URL** | **ERA ASSENTE → impostata** a https://fearless-reverence-production-80bc.up.railway.app | ✅ (set ora) |
| RAILWAY_API_KEY | present | ✅ |
| JWT_SECRET | present | ✅ |

Vietate — tutte **ASSENTI** ✅: `ALLOW_V1`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`, `WA_ACCESS_TOKEN`, `WA_PHONE_ID`, `WA_VERIFY_TOKEN`, `ANTHROPIC_KEY`.

> ⚠️ Le env del team sono **shared/account-level** (finding V1_11): queste var compaiono anche nel namespace env di PROD. Mitigazione: prod `locked`, non rebuilda. Isolamento env reale → richiede sito V1 su **team Netlify separato** (da pianificare).

## FASE 2 — Pipeline git-linked: ❌ NON CONFIGURATA
`getSite(a3ad035a).build_settings` = **vuoto**: `provider=None`, `repo_url=None`, `repo_branch=None`, `cmd=None`, `functions_dir=None`. Il sito **non è collegato ad alcun repo** → nessun branch/preview deploy possibile.

Collegare un repo GitHub alla CI di Netlify richiede l'**OAuth/GitHub App** (deploy key + webhook), che si attiva dalla **UI Netlify**; non lo si può fare in modo affidabile da CLI. Il task vieta di inventare o usare CLI draft come workaround → **STOP qui**.

---

## COSA CONFIGURARE MANUALMENTE NELLA NETLIFY UI (site `ladieci-v1-staging`, a3ad035a)

**Site → Build & deploy → Continuous deployment → Link repository:**
- **Repository:** `bigkaoss23-debug/LaDieciBotV2` (`https://github.com/bigkaoss23-debug/LaDieciBotV2.git`)
- **Base directory:** `ladieci-app33`  ← indispensabile: il `netlify.toml` è qui dentro
- **Build command:** `npm run build`  (da netlify.toml)
- **Publish directory:** `build`  (relativa alla base → `ladieci-app33/build`)
- **Functions directory:** `netlify/functions`  (relativa alla base → `ladieci-app33/netlify/functions`)

**⚠️ Contesto build — punto critico (per non far scattare il guard):**
`scripts/guard-no-lab-markers.js` blocca il build SOLO se `CONTEXT === "production"`, e `ALLOW_V1` è vietato. Quindi il branch V1 va deployato come **BRANCH DEPLOY (context=branch-deploy)** o via **PR (context=deploy-preview)**, **NON** come "production branch" del sito.
- Impostare come **production branch** un branch che non vogliamo deployare (es. `main`, mai pushato qui), e
- abilitare **Branch deploys** per il branch V1, così il suo deploy gira in `branch-deploy` → il lab guard salta **e** Netlify inietta le env del sito nelle functions (il vero motivo per cui si passa al git-linked).

**Branch da deployare:** `backup/v1-env-split-backend-url-2026-06-17` → **`818523e`** (contiene il fix V1_12).
- ⚠️ NON usare la `consolidation/...` remota: è a `9c1be6d`, **indietro**, **senza** il fix hardcoded-URL. (Il locale è a 818523e ma non pushato su consolidation; nessun push richiesto/eseguito.)

**Env:** già tutte presenti sul sito (vedi FASE 1), inclusa ora `REACT_APP_BACKEND_API_URL`.

---

## FASE 3 / FASE 4 — NON eseguite
Nessun deploy, nessun preview URL, nessun anti-prod check (non c'è build live), nessun push, nessun ordine/scrittura, nessun planner test.

## Conferme sicurezza
- ✅ Production intoccata: deploy `6a303f3d` locked.
- ✅ Nessun deploy, nessun `--prod`, nessun CLI draft, nessun push (né main né branch).
- ✅ Zero ordini / zero scritture DB / zero WhatsApp / zero Anthropic.
- ✅ `ORDINI_2026-05-23.md` non toccato.
- ℹ️ Unica modifica infra: aggiunta `REACT_APP_BACKEND_API_URL` (URL pubblico staging) sul site V1 — necessaria al build-guard non-prod.

## Prossimo step
1. (UTENTE, UI Netlify) Git-link del sito V1 con i parametri sopra + branch deploy del branch V1 (818523e) in context branch-deploy.
2. Triggerare il branch deploy → Netlify builda e inietta env nelle functions.
3. Tornare qui per **FASE 4 anti-prod check** sul deploy live.
4. Solo a PASS pieno → isolated planner Q5/Q2 test (sessione separata).

**STOP.** Niente deploy, niente planner test, niente ordini.
