# ENV_SPLIT_V1_11 — DEPLOY PREVIEW / ANTI-PROD — REPORT FINALE

**Data:** 2026-06-17
**Esito:** ⚠️ Build+deploy preview RIUSCITI, ma functions NON operative (503 fail-closed). Root cause architetturale identificato. Production INTOCCATA e locked. Stato lasciato PULITO. NO planner test (come da perimetro).

---

## Preflight: PASS
- Branch `consolidation/nuevo-pedido-v1-unified-2026-06-09`, **HEAD `8c51909`** ✅
- Nessun file tracciato modificato ✅
- PROD `02bd4c7a` deploy `6a303f3d` **locked: true** (verificato 3 volte: inizio, prima del set, fine) ✅
- CLI linkata a PROD → sempre `--site a3ad035a` esplicito, mai `--prod` ✅

## Percorso eseguito (opzione B con guardrail, scelta utente)
1. Impostate nello store V1 le 3 var: `BACKEND_API_URL`=fearless-reverence, `SUPABASE_URL`=tdikhfeinufaahagmpjz, `SUPABASE_ANON_KEY`=`sb_publishable_…` (recuperata da Supabase staging via MCP). NON impostate: SUPABASE_KEY/service_role, WA_*, ANTHROPIC_KEY, ALLOW_V1.
2. `netlify deploy --build --context deploy-preview --site a3ad035a` con `REACT_APP_SUPABASE_*` inline. **Build OK**: `guard-no-lab-markers` skip (context=deploy-preview), `guard-env-fail-closed` OK. Draft pubblicato.

## Anti-prod check (sul draft)
| Check | Esito |
|---|---|
| Preview reachable | ✅ HTTP 200 |
| `version.json` commit | ✅ **`8c51909`** |
| Browser bundle → Supabase STAGING `tdikhfeinufaahagmpjz` | ✅ presente (1) |
| Browser bundle → Supabase PROD `wnswassgfuuivmfwjxsf` | ✅ **0** (assente) |
| Browser bundle → backend PROD `ladiecibot-production` | ⚠️ **2 ref hardcoded** (vedi sotto) |
| Auth repartidor `654321` (proxy/auth function) | ❌ **503** fail-closed |
| Proxy `getConfig` → PIZZERIA_NOME | ⛔ non testabile (functions 503) |
| Chiamate dati verso PROD | ✅ **ZERO** (fail-closed blocca) |
| Ordini / scritture | ✅ **ZERO** |

## 🔴 ROOT CAUSE definitivo — functions non operative
`auth.js`/`api.js` → 503 con `CONFIG_ERROR` (manca SUPABASE_URL/ANON a runtime) **anche dopo** aver messo le var nello store (tutti i context, verificato) **E anche** passandole inline al build. Quindi:

> **I deploy draft/preview creati via CLI (`netlify deploy`, anche con `--build`) NON iniettano NESSUNA env utente nel runtime delle Netlify Functions** — solo le var di sistema (SITE_ID/CONTEXT). Il fail-closed di `_env.js` reagisce correttamente → 503, **zero fallback prod**. Conferma definitiva della nota V1_07/09.

Le uniche var che "sembravano" arrivare (JWT_SECRET/RAILWAY_API_KEY) non sono provate: `resolveSupabase` fallisce prima nel handler.

## 🟡 Finding secondario — 2 URL PROD hardcoded nel frontend spedito
- `src/api.js:682` → `api.getStatus()` fa GET `https://ladiecibot-production.up.railway.app/status` (badge ops, 4s timeout, pubblico, no segreti).
- `src/components/ServicioPage.jsx:154` → watchdog GET `https://ladiecibot-production.up.railway.app/health` ogni 30s.

Sono **read-only su endpoint pubblici** (no auth, no dati, no scritture), ma **bypassano l'env config**: la UI V1 staging pingerebbe l'infra **PROD** e mostrerebbe la salute di PROD. Viola il criterio "zero ladiecibot-production". **Da correggere** (puntare a `BACKEND_API_URL`/fearless-reverence o renderli env-based).

## Conferme sicurezza (stato finale PULITO)
- ✅ 3 var store **rimosse** (`unset`) → assenti anche dal namespace PROD.
- ✅ Store V1 di nuovo a baseline: solo `JWT_SECRET`, `RAILWAY_API_KEY`.
- ✅ `ALLOW_V1` assente ovunque; nessuna var-sonda.
- ✅ PROD `6a303f3d` **locked**, intoccata. Nessun `--prod`.
- ✅ Zero ordini, zero scritture DB, zero WhatsApp, zero Anthropic.
- ✅ `ORDINI_2026-05-23.md` non toccato.
- ℹ️ Draft creati (`6a32d34b…`, `6a32d4bb…`) = bozze non pubblicate, functions 503; non toccano l'URL main staging né prod.

---

## SOLUZIONE VERA (per sessione successiva)
Il CLI-draft non potrà MAI avere functions operative. Servono **due cose**:

1. **Build via pipeline Netlify (git-linked), non CLI-draft.** Collegare il sito V1 `a3ad035a` al repo/branch: un **branch-deploy o deploy-preview generato da Netlify** (a) gira in context non-production → `guard-no-lab-markers` salta (niente ALLOW_V1), e (b) **inietta correttamente le env del sito nel runtime delle functions** → auth/proxy operativi. Questo è il vero sblocco rimasto da 4 sessioni.
2. **Isolamento env reale:** spostare il sito V1 su un **TEAM/account Netlify SEPARATO** (env non condivise con prod), così le var staging non toccano mai il namespace prod. Finché si resta nel team shared, ogni var nello store appare anche su prod (mitigato solo dal lock).
3. **Fix i 2 URL prod hardcoded** (`api.js:682`, `ServicioPage.jsx:154`) → env-based.

**STOP.** Nessun planner Q5/Q2 finché functions V1 non sono operative e anti-prod è PASS pieno.
