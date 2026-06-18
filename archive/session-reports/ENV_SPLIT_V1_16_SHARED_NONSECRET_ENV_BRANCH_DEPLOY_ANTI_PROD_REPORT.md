# ENV_SPLIT_V1_16 — SHARED NON-SECRET ENV + BRANCH DEPLOY + ANTI-PROD — REPORT

**Data:** 2026-06-17
**Esito:** ❌ FAIL — **blocco di permessi**: non posso scrivere le 3 var nello store env che inietta alle functions (API 403, `netlify env:set` no-op silenzioso). Auth/proxy restano 503. Production **intoccata, locked e NON contaminata**. Nessuna scrittura dati. NO planner test.

---

## Preflight: PASS
- PROD `02bd4c7a` deploy `6a303f3d` **locked: true** ✅
- V1 site `a3ad035a` (ladieci-v1-staging) ✅
- Backup branch remoto = **`8eb1474`** (NB: tu indicavi `818523e`, ma `818523e` non builda — manca il fix netlify.toml di V1_15; il commit deployabile/working è `8eb1474`) ✅
- Ultimo deploy V1 `6a32ed47` ready, commit `8eb1474` ✅

## Tentativo opzione A (3 var non-segrete nello store shared)
Target da impostare: `BACKEND_API_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (URL + publishable, non-segrete). NON impostati: `SUPABASE_KEY`, `ALLOW_V1` (è solo nel netlify.toml branch-scoped, non nello store), WA_*, `ANTHROPIC_KEY`, `REACT_APP_*`.

**Risultato: NON scrivibili con i miei permessi.**
- API account env (`POST /accounts/bigkaoss23/env`): **HTTP 403 Forbidden**.
- CLI `netlify env:set` (linkato a V1): exit 0 ma **nessun output e NON persiste** nello store. `env:get` le "rileggeva" solo perché stanno nel `netlify.toml` `[build.environment]` (la CLI fonde il toml nei risultati di `env:get`).
- Store env autoritativo (slug `bigkaoss23`, visibile al sito V1): **solo 2 chiavi** → `JWT_SECRET`, `RAILWAY_API_KEY` (shared, scope functions, ctx all). Le 3 var **non ci sono**.

## Build + Anti-prod check
Triggerato build git-linked (`createSiteBuild`, non CLI draft, non `--prod`): deploy `6a32f169` → **ready**, commit `8eb1474`, functions deployate.

| # | Check | Esito |
|---|---|---|
| 1 | `version.json` 200 + commit `8eb1474` | ✅ |
| 2 | Bundle 0 `ladiecibot-production` / 0 `wnswassgfuuivmfwjxsf` + staging presente | ✅ (da V1_15) |
| 3 | Auth repartidor `654321` | ❌ **503** (`_env.js`: manca SUPABASE_URL/ANON) |
| 4 | Proxy getConfig → STAGING | ❌ non valutabile (503) |
| 5/6 | Backend/Supabase target | ✅ a livello bundle; proxy non valutabile |
| 7 | Zero writes | ✅ |

## 🔴 Root cause
L'unico store che inietta env al **runtime delle functions** è quello account-shared (dove vivono `JWT_SECRET`/`RAILWAY_API_KEY`). Il mio token **non ha i permessi** per scrivervi (403 / no-op). Quindi non posso aggiungere le 3 var lì. Le copie per-sito (che l'utente aveva impostato) NON iniettano alle functions in questo team.

## Conferme sicurezza
- ✅ Production **NON contaminata**: store shared visibile a prod = solo `JWT_SECRET`/`RAILWAY_API_KEY`; le 3 var **NON** sono su prod. (Le mie scritture sono fallite → zero side-effect su prod.)
- ✅ PROD `6a303f3d` **locked**. Nessun `--prod`, nessun deploy production, nessun push main.
- ✅ Zero ordini / scritture DB / WhatsApp / planner. `ORDINI_2026-05-23.md` non toccato.
- ✅ Nessun segreto impostato nello store. (`SUPABASE_ANON_KEY` è publishable/pubblica.)
- ℹ️ CLI ora linkata al sito V1 `ladieci-v1-staging` (più sicuro di prod); ho sempre usato `--site`/`--data` espliciti.

## Prossimo step (richiede l'OWNER dell'account Netlify — io non ho i permessi)
Per completare l'opzione A, **l'utente** deve aggiungere nella **Netlify UI** (Team/account `bigkaoss23` → Environment variables, o Site `ladieci-v1-staging` → Environment variables) queste 3 var con **scope che include "Functions"** e visibilità **"Same value for all deploy contexts"** (e idealmente shared/all-sites, come `JWT_SECRET`):

```
BACKEND_API_URL   = https://fearless-reverence-production-80bc.up.railway.app/api
SUPABASE_URL      = https://tdikhfeinufaahagmpjz.supabase.co
SUPABASE_ANON_KEY = sb_publishable_qMYSRpFm1TQ4S04nD8Bw3Q_7Fc92qaS
```

Poi: ri-triggerare il branch deploy V1 e tornare per l'anti-prod check (auth `654321` deve dare 200 + getConfig `La Dieci (STAGING)`).

**Alternativa (Opzione B):** sito V1 su **team Netlify separato** dove l'utente ha pieni permessi env → isolamento reale e nessun problema di permessi/condivisione.

**STOP dopo report.** Nessun planner Q5/Q2, nessun ordine, nessun deploy production.
