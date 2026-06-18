# ENV_SPLIT_V1_03 — INFRA AUDIT REPORT (read-only)

**Data:** 2026-06-17
**Sessione:** ripresa dopo crash — ENV_SPLIT_V1_03
**Tipo:** AUDIT READ-ONLY. Nessuna modifica, nessun deploy, nessuna scrittura DB.

---

## FASE 0 — RECOVERY CHECK

| Voce | Atteso | Trovato | Esito |
|---|---|---|---|
| Frontend branch | `consolidation/nuevo-pedido-v1-unified-2026-06-09` | idem | ✅ |
| Frontend HEAD | `8f60611` | `8f606116…` | ✅ |
| Frontend working tree | solo report `??` | solo file untracked `??` (report .md), nessun file tracked M/D | ✅ |
| `ORDINI_2026-05-23.md` | intoccato | untracked `??`, non modificato da noi | ✅ |
| Backend repo | `/Users/bigart/Downloads/ladieci-bot` | presente | ✅ |
| Backend HEAD | `193b818` | `193b818a…` (`fix planner prefer compatible giro over rider-conflicting direct`) | ✅ |
| Backend branch | (planner fix) | `backup/v2-route-impact-slip-guard-2026-06-14` con HEAD a `193b818` | ✅ |
| Backend working tree | pulito | clean (nessun file modificato) | ✅ |
| Report `ENV_SPLIT_V1_03*` preesistenti | — | **NESSUNO** (la sessione caduta non aveva ancora scritto nulla) | ℹ️ |

> Nota: il branch backend si chiama `backup/v2-route-impact-slip-guard-2026-06-14` (non `…rider-conflict…`), ma il commit HEAD `193b818` coincide con quello atteso. Nessuna anomalia.

### RECOVERY CHECK: **PASS**

Nessuna modifica non prevista. Niente cleanup/stash/reset/commit eseguito (corretto: vietato).

---

## FASE 1 — AUDIT INFRA ATTUALE

### A. Codice frontend — i 3 hardcode (commit `8f60611`)

| File | Variabile env | Fallback hardcoded | Stato |
|---|---|---|---|
| `ladieci-app33/netlify/functions/api.js` | `BACKEND_API_URL` | `https://ladiecibot-production.up.railway.app/api` (DEFAULT_BACKEND, prod) | ✅ env-based |
| `ladieci-app33/netlify/functions/auth.js` | `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`/`SUPABASE_KEY`/`SUPABASE_ANON_KEY` | `https://wnswassgfuuivmfwjxsf.supabase.co` + `sb_publishable_…` (prod) | ✅ env-based |
| `ladieci-app33/src/api.js` | `REACT_APP_SUPABASE_URL` + `REACT_APP_SUPABASE_ANON_KEY` | `https://wnswassgfuuivmfwjxsf.supabase.co` + `sb_publishable_…` (prod) | ✅ env-based |

Catena proxy frontend → backend:
`src/api.js` `PROXY_URL = "/api/proxy"` → `netlify.toml` redirect → `/.netlify/functions/api` (`api.js`) → `RAILWAY_URL` (da `BACKEND_API_URL`, altrimenti default prod).
Auth: `AUTH_URL` → `/.netlify/functions/auth` (`auth.js`) → legge PIN da `SUPABASE_URL` (config table).
Frontend diretto Supabase: `src/api.js` `sb*` chiama `SUPABASE_URL` (da `REACT_APP_SUPABASE_URL`, altrimenti default prod).

> ⚠️ **Rischio fallback prod silenzioso CONFERMATO e ATTIVO.** Tutti e tre i punti, se la env non è impostata, cadono sul **progetto/backend di PRODUCTION** senza errore. Il codice è env-based ma "fail-open verso prod". L'isolamento dipende **interamente** dall'impostare le env sul sito V1.

### B. Netlify — siti del team `AppPan` (user: Enzo Jenni / bigkaoss23@gmail.com)

| Nome | Site ID | URL | Ruolo |
|---|---|---|---|
| `magnificent-lollipop-6dff70` | `02bd4c7a-a50b-4964-90da-8c1af1122932` | magnificent-lollipop-6dff70.netlify.app | **PROD live (NON toccare)** |
| `ladieci-v1-staging` | `a3ad035a-e73f-4da3-8873-6403e31f04b6` | ladieci-v1-staging.netlify.app | **V1 staging** |
| `ladieci-premium-lab` | `8e476cf7-…` | ladieci-premium-lab.netlify.app | LAB (fuori scope) |
| `elaborate-chaja-62ee24` | `4b19d755-…` | — | non rilevante |

**Trappola CLI confermata:** la cartella `ladieci-app33/` ha `.netlify` linkato al **sito PROD** (`netlify status` → `magnificent-lollipop-6dff70` / `02bd4c7a`). Qualsiasi `netlify deploy` senza `--site` esplicito colpirebbe PROD. → usare SEMPRE `--site a3ad035a-…` per lo staging.

#### Netlify V1 staging — deploy corrente
- published_deploy_id: `6a3050ec885ff40547a33e81`
- published_at: `2026-06-15T19:22:51Z`
- commit_ref: `null`, branch: `null`, repo: `null` → **deploy MANUALE, non collegato a git** (come prod)
- state: `ready`
- **Il deploy attuale è precedente al commit env-split `8f60611` (17/06).** Lo staging live oggi NON ha il codice env-based.

#### Netlify V1 staging — env var (solo NOMI, valori mai letti)
- **VUOTO.** Nessuna env var impostata (`BACKEND_API_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY` assenti).

#### Netlify PROD env var (solo NOMI)
- `JWT_SECRET`, `RAILWAY_API_KEY` (nessun override Supabase/backend → usa i default prod del codice, corretto per prod).

> 🔴 **Conclusione B:** anche se rideployassimo il codice env-split sullo staging **oggi**, con env vuota tutti e 3 i punti cadrebbero su **backend prod Railway + Supabase prod**. Lo staging **NON è isolato**.

### C. Railway

- CLI loggata: `bigkaoss23@gmail.com`. Cartella `ladieci-bot` linkata.
- Workspace: `bigkaoss23-debug's Projects`
- Project: **`surprising-tenderness`** (ID `5f76bdfb-2012-4b92-ac38-5e3bde352a3b`)
- Environment: **solo `production`** (ID `6ef499eb-…`)
- Service: **`ladieci_bot`** (unico)
- **Nessun environment/service V1 o staging esiste.** → da creare (richiede dashboard/CLI Railway, azione utente o autorizzazione).
- Backend prod noto dal contesto: deployment `397d4061-…`, `/version` = `unknown` (deploy via `railway up`). NON toccato.

### D. Supabase (via MCP `list_projects`)

| Progetto | Ref | Stato | Ruolo |
|---|---|---|---|
| **LaDieci10App** | `wnswassgfuuivmfwjxsf` | `ACTIVE_HEALTHY`, region eu-west-1, PG 17 | **PROD live (NON scrivere)** |
| LePanetierSion | `npdytwdpztqnzmoovybt` | `INACTIVE` | altro tenant (pizzeria diversa), fuori scope |

- **Nessun progetto Supabase staging esiste.** → l'utente deve crearlo.

### E. `.env` locale (cartella `ladieci-app33`, solo NOMI)
- `DEV_AUTH_BYPASS`, `APP_PIN`, `JWT_SECRET`, `RAILWAY_API_KEY`
- (Per memoria nota: il `.env` locale / `netlify dev` punta comunque a Railway+Supabase **prod** tramite i default del codice → localhost NON è un DB di test.)

---

## RIEPILOGO ACCOPPIAMENTO (cosa è ancora legato a prod)

| Componente | Usa oggi | Isolato da prod? |
|---|---|---|
| Frontend PROD (magnificent-lollipop) | Railway prod + Supabase prod | n/a (è prod) |
| **Frontend V1 staging — proxy `/api`** | env vuota → **Railway prod** | ❌ NO |
| **Frontend V1 staging — auth PIN** | env vuota → **Supabase prod** | ❌ NO |
| **Frontend V1 staging — `sb*` diretto** | env vuota → **Supabase prod** | ❌ NO |
| Backend Railway | solo env `production` | ❌ nessun env V1 |
| Supabase | solo prog. prod | ❌ nessuno staging |

**Verdetto:** il codice env-split (`8f60611`) rimuove gli hardcode, ma **l'infrastruttura separata non esiste** (no Railway V1, no Supabase staging) e **lo staging Netlify non ha env impostate** (+ serve rideploy del codice env-split). Finché non si crea l'infra e si impostano le env, ogni test su V1 staging tocca **production reale**.

---

## COSA RICHIEDE AZIONE ESTERNA (utente / autorizzazione)
1. **Creare progetto Supabase staging** (account/dashboard Supabase — Claude non può crearlo senza conferma costi/branch).
2. **Creare environment/service Railway V1** (dashboard/CLI Railway).
3. **Inserire i segreti** (service_role staging, JWT, ecc.).
4. **Autorizzare** il rebuild/deploy del solo sito V1 staging.

Dettaglio operativo completo nel report di prep: `ENV_SPLIT_V1_03_INFRA_PREP_REPORT.md`.

**STOP — fine audit read-only.**
