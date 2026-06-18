# ENV_SPLIT_V1_15 — ROOT NETLIFY.TOML PATCH — REPORT

**Data:** 2026-06-17
**Esito:** ✅ Patch netlify.toml RIUSCITA (build git-linked ora verde, 404 risolto, functions deployate). ⚠️ Anti-prod check: build/bundle PASS, ma **auth/proxy 503** per un blocco residuo separato (env runtime delle functions). Production intoccata/locked. Nessuna scrittura dati. NO planner test.

---

## Cosa è stato fatto (patch, branch backup, NON main)
1. **Root `netlify.toml`** (nuovo, solo branch V1): `[build] base = "ladieci-app33"`. Bootstrappa la base directory (la UI non lasciava impostare la publish dir → prima pubblicava la root → 404).
2. **Scoperta chiave (via `netlify build --dry`)**: con `base` impostata, Netlify usa come **config attiva** `ladieci-app33/netlify.toml` (non il root). Quindi command/publish/functions/redirects/**environment** vanno lì.
3. **`ladieci-app33/netlify.toml`** `[build.environment]` (branch-scoped): `ALLOW_V1="1"` (il backup branch è production branch del sito → CONTEXT=production → altrimenti `guard-no-lab-markers` blocca) + le 6 var **non-segrete** (URL + publishable anon key) `REACT_APP_SUPABASE_URL/ANON`, `REACT_APP_BACKEND_API_URL`, `BACKEND_API_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (lo store env del sito non veniva iniettato nel build → `guard-env-fail-closed` bloccava = exit 2). I segreti veri (`JWT_SECRET`, `RAILWAY_API_KEY`) restano nello store, NON nel toml.
4. Verifica locale **`netlify build --context production`**: EXIT 0 (lab guard bypass, env guard OK, Compiled successfully, Functions bundling OK). Bundle: 0 `ladiecibot-production`, 0 `wnswassgfuuivmfwjxsf`, presenti `fearless-reverence` + `tdikhfeinufaahagmpjz`.
5. Commit `8eb1474` → push **solo** `backup/v1-env-split-backend-url-2026-06-17` (main non toccato).

## Deploy git-linked risultante: 6a32ed47 — build OK
- commit `8eb1474`, context production, **state ready**, **functions deployate** (`_env`, `api`, `auth`, nodejs22.x) — vera differenza vs CLI draft.
- site `a3ad035a` (V1, `ladieci-v1-staging.netlify.app`) — NON prod.

## Anti-prod check
| # | Check | Esito |
|---|---|---|
| — | Deploy su site V1 (non prod) | ✅ |
| 1 | `version.json` 200 + commit `8eb1474` | ✅ |
| 2 | Bundle: 0 `ladiecibot-production` / 0 `wnswassgfuuivmfwjxsf` | ✅ |
| 2 | Bundle: `fearless-reverence` + `tdikhfeinufaahagmpjz` presenti | ✅ |
| 3 | Auth repartidor `654321` | ❌ **503** |
| 4 | Proxy getConfig → STAGING | ❌ non valutabile (503) |
| 5/6 | Backend/Supabase target | ✅ a livello bundle (browser→staging); proxy non valutabile |
| 7 | Zero writes | ✅ |

## 🔴 BLOCCO RESIDUO — env RUNTIME delle functions
Auth 503: `_env.js` → "manca SUPABASE_URL, SUPABASE_ANON_KEY". Causa pinpointata:
- **`[build.environment]` del netlify.toml raggiunge il BUILD (browser bundle + guard) ma NON il runtime delle Netlify Functions** (verificato: bundle staging OK, ma auth 503).
- Le functions leggono l'env dallo **store del sito**. Lì arrivano solo `JWT_SECRET`/`RAILWAY_API_KEY` (account-shared, scope functions). Le 3 var backend (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BACKEND_API_URL`) **non sono nello store che inietta** (non in account env, non in legacy `build_settings.env`; `env:get` le trova in uno store per-sito che NON inietta alle functions).
- Tentato di metterle nell'account store (come JWT/RAILWAY) → **bloccato dal guardrail**: sarebbero account-**shared** (site_id null = tutti i siti, prod incluso) → contro l'approccio branch-scoped e la regola "no prod / no shared env".

➡️ **Non c'è un modo branch-scoped (repo) per dare env al RUNTIME delle functions** (il toml è build-only). L'unico store che inietta è account-shared (tocca il namespace prod). Stessa tensione di V1_11.

## Conferme sicurezza
- ✅ Production intoccata, deploy `6a303f3d` locked. Nessun `--prod`, nessun push main.
- ✅ Nessuna env account-shared creata (tentativo bloccato dal guardrail; stato invariato).
- ✅ Solo i 2 toml committati su backup branch. Zero ordini/scritture/WhatsApp/planner.
- ✅ `ORDINI_2026-05-23.md` non toccato. Nessun segreto nel toml (solo URL + publishable key, già pubblici nel bundle).

## DECISIONE RICHIESTA per sbloccare le functions
- **Opzione A — accettare le 3 var come account-shared:** non-segrete; prod resta `locked` (deploy pubblicato invariato), il rischio è solo su un futuro rebuild prod. Serve tua autorizzazione esplicita (il guardrail richiede l'OK).
- **Opzione B — sito V1 su TEAM Netlify SEPARATO:** isolamento reale; l'account store non condivide più con prod. Più setup, ma è la soluzione pulita definitiva (già indicata in V1_11).

**STOP dopo report.** Nessun planner Q5/Q2. Prossimo step: scegliere A o B per le env runtime delle functions, poi ri-anti-prod check.
