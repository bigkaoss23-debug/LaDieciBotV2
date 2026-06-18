# ENV_SPLIT_V1_06 — INFRA READY CHECK REPORT

**Data:** 2026-06-17
**Tipo:** readiness check PRIMA di qualunque deploy V1. Stato verificato in
read-only (Supabase MCP `list_projects`, Railway CLI `status`, Netlify `env:list`).
Nessun deploy/push/commit/scrittura DB eseguito.

---

## STATO VERIFICATO (aggiornato 2026-06-17, dopo FASE 1)

| Check | Esito | Evidenza |
|---|---|---|
| Supabase staging creato | ✅ **SÌ** | `LaDieci10App-staging`, ref `tdikhfeinufaahagmpjz`, eu-west-1, ACTIVE_HEALTHY |
| Ref staging ≠ prod | ✅ **SÌ** | `tdikhfeinufaahagmpjz` ≠ `wnswassgfuuivmfwjxsf` |
| Schema eseguito (`supabase_staging_schema_v1.sql`) | ✅ **SÌ** | applicato su staging; verifica: 15 tabelle public |
| Seed eseguito (`supabase_staging_seed_v1.sql`) | ✅ **SÌ** | 18 config, 2 clientes seed, 2 geo_cache seed; `ordenes`=0, 0 dati reali |
| Railway V1 creato | ❌ **NO** | `railway status` → project `surprising-tenderness`, **solo** env `production`, service `ladieci_bot` |
| WhatsApp reale disabilitato su V1 | ⏳ n/a | backend V1 non ancora creato; regola pronta: lasciare NON impostate `WA_ACCESS_TOKEN`/`WA_PHONE_ID`/`WA_VERIFY_TOKEN` |
| Netlify V1 env impostate (`a3ad035a`) | ❌ **NO** | `env:list` sito V1 → **vuoto** |
| Production intoccata | ✅ **SÌ** | Netlify prod `02bd4c7a`, Railway `production`/`ladieci_bot`, Supabase `wnswassgfuuivmfwjxsf` non modificati; nessuna scrittura su prod |

**Verifica staging (query read-only):** tabelle=15, ordenes=0, clientes_seed=2,
clientes_reali=0, geocache_seed=2, wa_msgs=0, conv=0, storico=0, config=18,
PIZZERIA_NOME='La Dieci (STAGING)', APP_PIN='123456', AUTO_RISPOSTA='FALSE', WEBHOOK_ACTIVE='FALSE'.

## ARTEFATTI PRONTI (già preparati, non eseguiti)
- backend planner-fix `193b818` · frontend recommended-card `922aa13` · frontend env-split `8f60611`
- `supabase_staging_schema_v1.sql` · `supabase_staging_seed_v1.sql` · `supabase_staging_test_cleanup.sql`
- guide: `ENV_SPLIT_V1_05_STAGING_CREATION_GUIDE_REPORT.md`, `ENV_SPLIT_V1_SUPABASE_STAGING_README.md`

## COSA MANCA (in ordine)
1. ~~Creare Supabase staging + schema + seed~~ ✅ **FATTO** (FASE 1).
2. **Recuperare chiavi staging** — Project URL = `https://tdikhfeinufaahagmpjz.supabase.co`; anon + service_role da Settings → API (azione utente, non incollare in chat).
3. **Creare Railway V1** `ladieci-bot-v1-staging` (separato da production) → env `SUPABASE_URL`/`SUPABASE_KEY`(service_role)/`DASHBOARD_API_KEY`; WA NON impostato; deploy backend da `193b818`; verificare `/health` + `getOrdenes`=vuoto. **(azione utente — STOP)**
4. **Impostare le 7 env su Netlify V1** `a3ad035a` (incl. `RAILWAY_API_KEY`=`DASHBOARD_API_KEY`, `JWT_SECRET`).
5. **Solo allora**: rebuild+deploy del **solo** sito V1 (richiede autorizzazione esplicita).

## GATE DEPLOY
🚫 Deploy V1 **bloccato** finché i punti 1–4 non sono completi E finché non arriva
la stringa di autorizzazione esplicita:

```
AUTORIZZO DEPLOY NETLIFY V1 STAGING ISOLATO
```

Production, Supabase prod e `ORDINI_2026-05-23.md` non toccati. **STOP.**
