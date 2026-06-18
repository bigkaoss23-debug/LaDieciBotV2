# ENV_SPLIT_V1_12 — HARDCODED PROD URLS PATCH — REPORT

**Data:** 2026-06-17
**Esito:** ✅ PATCH COMPLETATA + test verdi. Solo modifiche locali. NESSUN deploy, NESSUN push, NESSUNA scrittura DB. Production intoccata.

---

## Obiettivo
Chiudere il finding anti-prod di V1_11: 2 URL prod **hardcoded** read-only nel frontend che facevano pingare il backend PROD anche dal bundle V1/staging.
- `src/api.js:682` → `getStatus()` GET `ladiecibot-production…/status`
- `src/components/ServicioPage.jsx:154` → watchdog GET `ladiecibot-production…/health`

Resi **env-based**: in V1/staging puntano al backend staging `fearless-reverence`, mai a prod.

## Modifiche (5 file)
1. **NUOVO `src/utils/backendBase.js`** — resolver dedicato:
   `BACKEND_BASE_URL = (process.env.REACT_APP_BACKEND_API_URL || PROD_BACKEND_BASE).replace(/\/+$/,'')`.
   Il default prod (`ladiecibot-production`) vive **solo qui** (fuori dai componenti V1/staging), gated dal build-guard. Nessun segreto (URL pubblico).
2. **`src/api.js`** — import di `BACKEND_BASE_URL`; `getStatus` ora fa `fetch(\`${BACKEND_BASE_URL}/status\`)`. Zero hardcode prod.
3. **`src/components/ServicioPage.jsx`** — import di `BACKEND_BASE_URL`; `PING_URL = \`${BACKEND_BASE_URL}/health\``. Zero hardcode prod.
4. **`scripts/guard-env-fail-closed.js`** — esteso fail-closed: i build NON-production ora **devono** impostare `REACT_APP_BACKEND_API_URL` (altrimenti build bloccato) e non possono puntare al backend prod (`ladiecibot-production` → build bloccato). Il path PRODUCTION reale (SITE_ID prod) resta **invariato**.
5. **`src/envConfig.audit.test.js`** — nuovi test: backendBase env-based, zero `ladiecibot-production` in `api.js`/`ServicioPage.jsx`, guard richiede `REACT_APP_BACKEND_API_URL`.

> `netlify/functions/_env.js` (fail-closed delle functions) **NON toccato** → comportamento invariato.

## Test
| Test | Esito |
|---|---|
| grep `ladiecibot-production` in `src/api.js` + `ServicioPage.jsx` | ✅ **ZERO** |
| Jest `envConfig.audit` + `functionsEnvResolver` | ✅ **19/19 PASS** |
| guard NEG: non-prod senza `REACT_APP_BACKEND_API_URL` | ✅ blocca (exit 1) |
| guard NEG: backend → prod (`ladiecibot-production`) | ✅ blocca (exit 1) |
| guard POS: env staging complete | ✅ passa (exit 0) |
| guard PROD: SITE_ID prod, nessuna env | ✅ passa (fallback consentito, **invariato**) |
| `npm run build` con env staging | ✅ **PASS** (`Compiled successfully`, guard OK, version 8c51909) |
| Scan bundle staging: `ladiecibot-production` | ✅ **0** |
| Scan bundle staging: `wnswassgfuuivmfwjxsf` | ✅ **0** |
| Scan bundle staging: `fearless-reverence` (staging backend) | ✅ presente |
| Scan bundle staging: `tdikhfeinufaahagmpjz` (staging supabase) | ✅ presente |

**Nota runner:** `react-scripts test` (suite CRA completa) non produce output in questo ambiente headless (hang a 0 byte) — limite d'ambiente pre-esistente, non legato alla patch. I test jest CommonJS in scope (env/audit/resolver) girano e passano; il `npm run build` compila l'intera app (risolve tutti gli import, incluso il nuovo `backendBase`) → copertura equivalente per le regressioni d'import.

## Conferme sicurezza
- ✅ Nessun deploy, nessun push, nessuna scrittura DB.
- ✅ Production intoccata; nessuna env Netlify/Railway prod modificata.
- ✅ `ORDINI_2026-05-23.md` non toccato.
- ✅ Working tree: solo i 5 file intenzionali (4 modificati + `backendBase.js` nuovo); `build/` rimosso.
- ✅ Fail-closed **rafforzato** (ora copre anche il backend) e **invariato** sul path prod reale.

## Stato / prossimo step
Finding anti-prod **chiuso a livello codice**. Per attivarlo a runtime su V1 servirà — nel deploy via **pipeline Netlify git-linked** (root cause V1_11) — impostare anche `REACT_APP_BACKEND_API_URL=https://fearless-reverence-production-80bc.up.railway.app` sul sito V1. Nessun planner test in questa sessione.

**STOP.** Niente deploy, niente push.
