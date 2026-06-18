# ENV_SPLIT_V1_02_ENV_BASED_PATCH_REPORT

Data: 2026-06-17 — **Patch env-based applicate in LOCALE. Nessun commit, nessun deploy, nessun push, nessun segreto, nessuna modifica infra/DB.**

## Obiettivo
Rompere i 3 hardcode che impedivano di separare LIVE e V1, **mantenendo default prod** (production invariata se le env mancano), così che Netlify V1 possa puntare a backend V1 + Supabase staging via sole env var.

## File toccati (diff summary)
```
 ladieci-app33/netlify/functions/api.js  | 10 +++++++++-
 ladieci-app33/netlify/functions/auth.js |  9 ++++++---
 ladieci-app33/src/api.js                |  8 ++++++--
 (nuovo) ladieci-app33/src/envConfig.audit.test.js  (static guard)
```

## Modifiche
1. **`netlify/functions/api.js`** — backend proxy URL:
   - `BACKEND_API_URL` da env, `DEFAULT_BACKEND` = prod; trailing slash strippato; `console.log("[api proxy] backend mode:", default(prod)|env-override)` (log della **modalità**, mai URL/segreti).
2. **`netlify/functions/auth.js`** — Supabase per il PIN:
   - `SUPABASE_URL = process.env.SUPABASE_URL || <default prod>`; key chain `SUPABASE_SERVICE_KEY || SUPABASE_KEY || SUPABASE_ANON_KEY || <publishable default>`.
3. **`src/api.js`** — letture dirette Supabase del frontend (`sb`):
   - `SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || <default prod>`; `SUPABASE_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || <publishable default>` (CRA inlina i `REACT_APP_*` a build-time).

**Requisiti rispettati:** nessun segreto inserito · nessuna chiave nei log (solo modalità) · default = comportamento prod attuale (nessun cambio se env mancano) · ogni valore ha fallback esplicito e documentato.

## Verifica
- **Test statico** `src/envConfig.audit.test.js`: **4/4 PASS** (verifica i pattern env + i default prod nei 3 file).
- **Build frontend**: `CI=true npm run build` → **Compiled successfully**, build folder pronta. Nessun errore.
- `git status`: 3 file modificati (21 ins / 6 del) + 1 test nuovo untracked. **Nessun commit** (come richiesto).

## Env var da impostare manualmente (UTENTE)

### Netlify PRODUCTION (site `02bd4c7a`) — NON cambiare nulla
| Var | Valore | Note |
|---|---|---|
| `BACKEND_API_URL` | **(non impostare)** | usa default prod |
| `REACT_APP_SUPABASE_URL` | **(non impostare)** | usa default prod |
| `REACT_APP_SUPABASE_ANON_KEY` | **(non impostare)** | usa default prod |
| (già presenti) `RAILWAY_API_KEY`, `JWT_SECRET` | invariati | |
→ Production resta identica.

### Netlify V1 STAGING (site `a3ad035a`)
| Var | Valore | Note |
|---|---|---|
| `BACKEND_API_URL` | `https://<railway-v1>/api` | **includere `/api`** finale |
| `REACT_APP_SUPABASE_URL` | URL Supabase **staging** | build-time |
| `REACT_APP_SUPABASE_ANON_KEY` | anon/publishable **staging** | public by design |
| `RAILWAY_API_KEY` | API key del backend **V1** | per il proxy |
| `JWT_SECRET` | come backend V1 | coerente con auth |
| `SUPABASE_URL` (function auth) | Supabase **staging** | per leggere il PIN dal DB staging |
| `SUPABASE_ANON_KEY` (function auth) | anon **staging** | |

### Railway V1 (backend) — vedi `ENV_SPLIT_V1_01_PLAN_REPORT` BLOCCO 5
`SUPABASE_URL`=staging, `SUPABASE_KEY`=service_role staging, `DASHBOARD_API_KEY`, `JWT_SECRET`, `PORT`. **WA tokens assenti/mock.**

## Note importanti
- `BACKEND_API_URL` deve includere il suffisso `/api` (il proxy appende `?action=`). Il default lo include già.
- Le **anon/publishable key** non sono segreti (public by design, RLS protegge). Le **service_role key** NON vanno mai nel frontend/Netlify-frontend, solo nel backend Railway.
- Resta valido: senza env, tutto punta a prod → la live non cambia.

## Stato / prossimo step
- Patch pronte e verdi, **non committate**. Per procedere servono autorizzazioni separate:
  - commit + backup branch (come fatto per i blocchi precedenti), oppure
  - creazione infra V1 (Supabase staging + Railway V1) lato utente, poi impostare le env, poi test planner Q5/Q2 isolato.
- Suggerito: prima creare l'infra V1 (utente), poi committare la patch, poi configurare le env Netlify V1.

**STOP dopo report. Nessun commit automatico, nessun deploy, nessun push.**
