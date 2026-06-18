# NETLIFY_V1_ENV_READY_CHECK_REPORT

**Data:** 2026-06-17
**Tipo:** verifica env del sito Netlify V1 (solo NOMI + match booleano dei target).
**Nessun valore segreto stampato.** Solo `--site a3ad035a` esplicito; prod non toccata.

**Sito V1:** `a3ad035a-e73f-4da3-8873-6403e31f04b6` (`ladieci-v1-staging.netlify.app`).

---

## 1. Variabili richieste — TUTTE PRESENTI

| Variabile | Presente |
|---|---|
| `BACKEND_API_URL` | ✅ |
| `SUPABASE_URL` | ✅ |
| `SUPABASE_ANON_KEY` | ✅ |
| `REACT_APP_SUPABASE_URL` | ✅ |
| `REACT_APP_SUPABASE_ANON_KEY` | ✅ |
| `RAILWAY_API_KEY` | ✅ |
| `JWT_SECRET` | ✅ |

## 2. Target (confronto, valore non stampato)

| Variabile | Deve puntare a | Esito |
|---|---|---|
| `BACKEND_API_URL` | `…fearless-reverence-production-80bc.up.railway.app/api` (backend V1) | ✅ match |
| `SUPABASE_URL` | `https://tdikhfeinufaahagmpjz.supabase.co` (staging) | ✅ match |
| `REACT_APP_SUPABASE_URL` | `https://tdikhfeinufaahagmpjz.supabase.co` (staging) | ✅ match |
| nessuna env contiene `wnswassgfuuivmfwjxsf` | — | ✅ assente |
| nessuna env contiene `ladiecibot-production` | — | ✅ assente |

## 3. Contesto + scope (root-cause check di V1_07)

`BACKEND_API_URL` verificata presente in **tutti i contesti** e nello scope functions:

| Contesto / scope | Esito |
|---|---|
| `production` | ✅ |
| `deploy-preview` | ✅ |
| `branch-deploy` | ✅ |
| `dev` | ✅ |
| scope `functions` | ✅ |

→ Lo **scoping NON era la causa** del fail-open di V1_07 (le env sono correttamente
bound al contesto `deploy-preview` e visibili alle functions). La causa più probabile
resta un **ritardo di propagazione** delle env impostate pochi istanti prima del primo
deploy (ora pienamente propagate). In ogni caso la patch fail-closed (`8c51909`)
trasforma un eventuale buco in **503**, non in fuga su prod.

## CONCLUSIONE
Env V1 **complete e corrette** (7/7, target giusti, nessun ref prod, tutti i contesti).
**Nessuna env manca → il deploy preview non è bloccato da env mancanti.** PASS.
