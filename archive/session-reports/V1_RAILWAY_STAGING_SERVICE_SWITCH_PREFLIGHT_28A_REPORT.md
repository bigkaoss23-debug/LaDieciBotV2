# V1_RAILWAY_STAGING_SERVICE_SWITCH_PREFLIGHT_28A_REPORT

**Task:** `V1_RAILWAY_STAGING_SERVICE_SWITCH_PREFLIGHT_28A`
**Data:** 2026-06-18
**Verdict:** ✅ **PASS — CLI ri-targetizzato su `fearless-reverence` (staging). Nessun deploy.**

---

## Azione eseguita

`railway service fearless-reverence` (EXIT 0 → `Linked service fearless-reverence`).
Solo selezione del service: **nessun `railway up`, nessun deploy, nessun write, nessun secret stampato.**

## Stato CLI DOPO lo switch (`railway status`)

| Campo | Valore |
|---|---|
| Workspace | bigkaoss23-debug's Projects |
| Project | `surprising-tenderness` (ID `5f76bdfb-…`) |
| Environment | `production` *(nome dell'environment nel progetto — il target reale è il SERVICE, vedi sotto)* |
| **Linked service** | **`fearless-reverence`** ● Online |
| **URL** | **`https://fearless-reverence-production-80bc.up.railway.app`** |
| Service ID | `4e481c9b-04b7-4eec-9ba9-8878667f5dd4` (EU West) |

> Nota: l'environment si chiama "production" ma è il nome dell'env del progetto; il bersaglio del deploy
> è determinato dal **service linkato**, ora `fearless-reverence`. Il service prod `ladieci_bot` ha
> service ID diverso (`221886cc-…`, US West, url `ladiecibot-production`) e NON è linkato.

## Verifica delle 6 prove richieste

| # | Prova richiesta | Esito |
|---|---|---|
| 1 | CLI service = `fearless-reverence` | ✅ Linked service = `fearless-reverence` |
| 2 | NON mostra `ladieci_bot` come linkato | ✅ linkato è `fearless-reverence` (ladieci_bot resta solo in "All resources", non selezionato) |
| 3 | NON mostra `ladiecibot-production` come target | ✅ URL target = `fearless-reverence-production-80bc` |
| 4 | Target URL = `https://fearless-reverence-production-80bc.up.railway.app` | ✅ confermato da `status` **e** da `RAILWAY_PUBLIC_DOMAIN=fearless-reverence-production-80bc.up.railway.app` |
| 5 | Env backend → Supabase staging ref `tdikhfeinufaahagmpjz`, senza stampare key | ✅ `SUPABASE_URL` contiene `tdikhfeinufaahagmpjz` (occorrenze = **1**); prod ref `wnswassgfuuivmfwjxsf` occorrenze = **0**. Solo conteggi + nome variabile (`SUPABASE_URL`); **nessun valore segreto stampato** |
| 6 | Report + STOP | ✅ questo report; STOP |

### Metodo proof 5 (no-secret)
- `railway variables --kv --service fearless-reverence | grep -c tdikhfeinufaahagmpjz` → `1`
- `… | grep -c wnswassgfuuivmfwjxsf` → `0`
- `… | grep tdikhfeinufaahagmpjz | cut -d= -f1` → `SUPABASE_URL` (solo nome, nessun valore key)

## Safety

- ✅ no deploy / no `railway up`
- ✅ no production (ladieci_bot/ladiecibot-production NON toccati né linkati)
- ✅ no DB write · no push main · no frontend
- ✅ no secrets stampati (solo conteggi e nomi variabili; SUPABASE_URL/RAILWAY_PUBLIC_DOMAIN non sono segreti)
- ✅ `ORDINI_2026-05-23.md` non toccato

## Stato repo

- Repo `/Users/bigart/Downloads/ladieci-bot`, branch `backup/v2-route-impact-slip-guard-2026-06-14`, HEAD `a7ad091`, working tree pulito.

## Next recommended step (NON eseguito)

Il CLI è ora pronto per il deploy staging in sicurezza. Prossimo blocco (`V1_PLANNER_SAMEZONE_RUNTIME_VALIDATE_28`, ripresa Fase 2):
1. ri-verificare `railway status` (target ancora `fearless-reverence`) immediatamente prima del deploy
2. `railway up` SOLO con service `fearless-reverence` (es. `railway up --service fearless-reverence` per blindare il target)
3. verificare `/health`, `/status`, e che il backend live riporti `a7ad091`
4. proseguire Fasi 3→6 (baseline staging, anchor Q5, bozza Q5 21:05, raccolta JSON/UI, cleanup marker `TEST_V1_STAGING_SAMEZONE_Q5_DELETE_OK`)

> STOP. Deploy NON eseguito — richiede autorizzazione esplicita.
