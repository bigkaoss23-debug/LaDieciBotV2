# ENV_SPLIT_V1_05 — STAGING CREATION GUIDE

**Data:** 2026-06-17
**Scopo:** guida passo-passo per **te** (azioni manuali su dashboard) per creare
Supabase staging + Railway V1 e collegarli, usando i file SQL già pronti.

**Io NON ho:** deployato, pushato, scritto su Supabase prod, toccato production,
usato WhatsApp. Questa è solo una guida. I passi sotto li esegui tu.

File di supporto (stessa cartella):
- `supabase_staging_schema_v1.sql`, `supabase_staging_seed_v1.sql`, `supabase_staging_test_cleanup.sql`
- `ENV_SPLIT_V1_SUPABASE_STAGING_README.md` (riferimento esteso)

Coordinate da NON toccare: PROD Netlify `02bd4c7a`, Railway `surprising-tenderness`/env `production`/`ladieci_bot`, Supabase prod `wnswassgfuuivmfwjxsf`.

---

## STEP 1 — Creare il progetto Supabase staging

1. https://supabase.com/dashboard → **New project** (stessa organizzazione di prod).
2. Compila:
   - **Name:** `LaDieci10App-staging`
   - **Database Password:** generane una robusta → **salvala nel password manager**
   - **Region:** `West EU (eu-west-1)` (come prod)
   - **Plan:** Free va bene per lo staging
3. **Create new project** → attendi stato **`ACTIVE_HEALTHY`** (~2 min).
4. ⚠️ Controllo identità: l'URL del progetto sarà `https://<REF-STAGING>.supabase.co`
   con `<REF-STAGING>` **diverso** da `wnswassgfuuivmfwjxsf`. Se vedi `wnswass…` sei
   sul progetto sbagliato → **STOP**.

---

## STEP 2 — Eseguire gli SQL (ordine OBBLIGATORIO)

Apri **SQL Editor** del progetto **staging** (ricontrolla nome/URL in alto).

### 2a. Schema — PRIMA
1. SQL Editor → **New query**.
2. Incolla **tutto** il contenuto di `supabase_staging_schema_v1.sql`.
3. **Run**. Atteso: `Success. No rows returned`. Nessun errore rosso.

### 2b. Seed — DOPO
1. Nuova query.
2. Incolla **tutto** `supabase_staging_seed_v1.sql`.
3. **Run**. Atteso: `Success`. (Popola `config` + 2 `clientes` fake + 2 `geo_cache` fake.)

> ⚠️ Ordine vincolante: **schema → seed**. Il seed fallisce se le tabelle non esistono.
> NON eseguire `supabase_staging_test_cleanup.sql` ora (serve solo dopo i test).

---

## STEP 3 — Verificare lo staging (read-only)

Nell'SQL Editor **staging**, esegui queste query e confronta con l'atteso:

```sql
-- (a) tabelle create — atteso 15
select count(*) from information_schema.tables
where table_schema='public' and table_type='BASE TABLE';

-- (b) ordenes deve essere VUOTA — atteso 0
select count(*) as ordenes from public.ordenes;

-- (c) seed fake presente — atteso 2 e 2
select count(*) as clientes_seed from public.clientes where nombre like 'STAGING_SEED_%';
select count(*) as geocache_seed from public.geo_cache where direccion_key like 'staging_seed_%';

-- (d) NESSUN dato reale — tutti attesi 0
select count(*) as clientes_non_seed from public.clientes where nombre not like 'STAGING_SEED_%';
select count(*) as wa_msgs  from public.wa_msgs;
select count(*) as conv     from public.conv;
select count(*) as storico  from public.storico;

-- (e) config operativa (controlla che PIN siano quelli staging, non prod)
select chiave, valore from public.config where chiave in ('PIZZERIA_NOME','APP_PIN','AUTO_RISPOSTA','WEBHOOK_ACTIVE') order by chiave;
```

✅ Pass se: (a)=15, (b)=0, (c)=2+2, (d) tutti 0, (e) `PIZZERIA_NOME='La Dieci (STAGING)'`, `APP_PIN='123456'`, `AUTO_RISPOSTA='FALSE'`, `WEBHOOK_ACTIVE='FALSE'`.
Se qualcosa non torna → **STOP**, non procedere a Railway/Netlify.

### Chiavi da recuperare ora (Settings → API)
- **Project URL** = `https://<REF-STAGING>.supabase.co`
- **anon** (publishable) key → per il frontend
- **service_role** key (SEGRETO) → solo per il backend Railway V1

---

## STEP 4 — Railway V1 (backend) env

Crea l'ambiente V1 nel project Railway esistente:
1. Railway → project **`surprising-tenderness`** → in alto, selettore **Environment** →
   **New Environment** → nome `v1-staging` (duplica da `production` se ti propone di
   copiare i servizi: utile per avere il service `ladieci_bot`).
   - In alternativa crea un **nuovo service** che punti al repo backend
     `github.com/bigkaoss23-debug/ladieci_bot` sul commit/branch planner-fix `193b818`.
2. Imposta le **Variables** dell'ambiente/servizio V1 (Settings → Variables):

| Variabile | Valore | Note |
|---|---|---|
| `SUPABASE_URL` | `https://<REF-STAGING>.supabase.co` | **staging** |
| `SUPABASE_KEY` | `<service_role staging>` | 🔒 service_role (bypassa RLS, come prod) |
| `DASHBOARD_API_KEY` | una chiave a tua scelta (es. `ld_v1staging_<random>`) | deve **combaciare** con `RAILWAY_API_KEY` su Netlify V1 (STEP 5) |
| `ANTHROPIC_KEY` | *(opzionale)* | solo se testi parsing IA; per planner Q5/Q2 geometrico **non serve** |
| `GOOGLE_MAPS_API_KEY` | *(LASCIA VUOTO)* | senza → fallback haversine (coerente col seed `GEO_PROVIDER=haversine`), niente costi/chiamate |

**WhatsApp DISABILITATO (lascia NON impostate):**
- `WA_ACCESS_TOKEN` ❌ non impostare
- `WA_PHONE_ID` ❌ non impostare
- `WA_VERIFY_TOKEN` ❌ non impostare

→ Senza questi, il backend non può inviare/ricevere WhatsApp reale. **Non** configurare
il webhook WA di Meta verso l'URL Railway V1.

3. Deploy del backend V1 da git (preferito, così `/version` non è `unknown`).
4. Verifica post-deploy (sostituisci l'host V1):
```bash
curl -s https://<RAILWAY-V1-HOST>/health
# e una lettura che DEVE colpire Supabase staging (0 ordini):
curl -s "https://<RAILWAY-V1-HOST>/api?action=getOrdenes" -H "X-Api-Key: <DASHBOARD_API_KEY>"
```
Atteso: `/health` ok; `getOrdenes` → lista **vuota** (staging). L'URL pubblico V1 è
quello che userai come `BACKEND_API_URL` (+ suffisso `/api`) nello STEP 5.

---

## STEP 5 — Netlify V1 (`a3ad035a-e73f-4da3-8873-6403e31f04b6`) env

Netlify → site **`ladieci-v1-staging`** → **Site configuration → Environment variables**.
(Verifica di essere sul sito `a3ad035a`, **non** su `02bd4c7a` prod.)

Imposta (Same value for all deploy contexts):

| Variabile | Valore | Usata da |
|---|---|---|
| `BACKEND_API_URL` | `https://<RAILWAY-V1-HOST>/api` | `functions/api.js` (proxy) |
| `SUPABASE_URL` | `https://<REF-STAGING>.supabase.co` | `functions/auth.js` (PIN) |
| `SUPABASE_ANON_KEY` | `<anon staging>` | `functions/auth.js` |
| `REACT_APP_SUPABASE_URL` | `https://<REF-STAGING>.supabase.co` | `src/api.js` (build-time) |
| `REACT_APP_SUPABASE_ANON_KEY` | `<anon staging>` | `src/api.js` (build-time) |
| `RAILWAY_API_KEY` | `<= DASHBOARD_API_KEY del backend V1>` | `functions/api.js` (X-Api-Key) |
| `JWT_SECRET` | una stringa robusta (coerente fra auth.js e api.js) | firma/verifica token |

> ⚠️ `REACT_APP_*` sono **build-time (CRA)**: dopo averle impostate serve un
> **rebuild** del bundle V1 perché abbiano effetto. Il rebuild/deploy del solo sito
> V1 lo facciamo **dopo**, su tua autorizzazione esplicita (mai sul sito prod, mai
> dal link locale che punta a prod).

---

## STEP 6 — Anti-prod check (dopo rebuild V1)

Apri `https://ladieci-v1-staging.netlify.app` (DevTools → Network aperto):

1. **V1 auth usa Supabase staging**
   - Login con PIN staging `123456`. Se entra → `auth.js` ha letto `config` dello staging.
   - (Contro-prova: il PIN prod NON deve funzionare sullo staging.)

2. **V1 proxy usa Railway V1**
   - Filtra Network su `proxy`. La chiamata `/api/proxy?action=getOrdenes` deve
     restituire lista **vuota** (staging) e il backend dietro deve essere l'host V1
     (non `ladiecibot-production.up.railway.app`).

3. **V1 frontend diretto usa Supabase staging**
   - Filtra Network su `rest/v1`. Tutte le richieste devono andare a
     `<REF-STAGING>.supabase.co`. Se compare `wnswassgfuuivmfwjxsf` → **STOP**, manca
     una `REACT_APP_*` o il rebuild non è avvenuto.

4. **Supabase prod invariato**
   - Sul progetto **prod** (`wnswassgfuuivmfwjxsf`), SQL Editor:
     ```sql
     select count(*) from public.ordenes;     -- invariato
     select count(*) from public.clientes where nombre like 'TEST_V1_STAGING_%'; -- atteso 0
     ```
   - Nessuna riga di test deve essere comparsa in prod.

✅ Isolamento confermato solo se **tutti e 4** passano. A quel punto puoi creare un
ordine `TEST_V1_STAGING_...` sullo staging per i test planner, e pulirlo con
`supabase_staging_test_cleanup.sql` (ha guard anti-prod) a fine sessione.

🚩 Segnale di allarme in qualsiasi punto: comparsa di `wnswassgfuuivmfwjxsf` o
`ladiecibot-production.up.railway.app` nel Network del sito V1 → una env manca →
stai colpendo PROD → ferma e ricontrolla.

---

## RIEPILOGO "CHI FA COSA"
- **Tu (manuale, ora):** STEP 1–5 (crei progetto, esegui SQL, crei env Railway V1 e Netlify V1, recuperi le chiavi).
- **Io (su tua autorizzazione, dopo):** rebuild+deploy del **solo** sito V1 `a3ad035a`, poi eseguo l'anti-prod check STEP 6 con te.
- **Mai senza OK esplicito:** deploy prod, push main, scrittura DB prod, webhook/WA reale.

**STOP — fine guida.** Nessun deploy/push/commit/scrittura DB eseguito. Production,
Supabase prod e `ORDINI_2026-05-23.md` non toccati.
