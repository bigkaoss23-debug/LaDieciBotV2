# ENV_SPLIT_V1_01_PLAN_REPORT

Data: 2026-06-17 — **SOLO PIANO + AUDIT. Nessun deploy, nessun push, nessuna modifica Railway/Supabase, nessun segreto, nessuna scrittura DB.** La patch `api.js` è PROPOSTA (diff), NON applicata.

---

## 1. Diagnosi attuale (BLOCCO 1 — audit read-only)

### Routing reale verificato
- **Frontend → backend** (entrambi i siti): `src/api.js` chiama path **relativi** `/api/proxy` e `/api/auth`; `netlify.toml` li redirige a `netlify/functions/api` e `…/auth`.
- **`netlify/functions/api.js:8`**: `const RAILWAY_URL = "https://ladiecibot-production.up.railway.app/api";` → **HARDCODED** (la API key è già da env `RAILWAY_API_KEY`, solo l'URL è fisso).
- **`netlify/functions/auth.js:9`**: `SUPABASE_URL` Supabase prod **HARDCODED**; legge `APP_PIN` da Supabase prod (config) con fallback env.
- **`src/api.js`**: oltre al proxy, il client `sb` chiama **direttamente** `SUPABASE_URL/rest/v1/...` (letture anon: clientes/config/ecc.). ⇒ **terzo accoppiamento**: il frontend tocca Supabase **anche senza passare dal backend**.

### Mappa attuale (il problema)
```
Frontend PROD (02bd4c7a / 069c273) ─┐
                                    ├─► /api/proxy → functions/api → Railway PROD ──► Supabase PROD
Frontend V1 (a3ad035a / c07c68f) ───┘                                  ▲
        └────────── sb.select diretto ───────────────────────────────┘ (Supabase PROD)
```
- Backend Railway live: `/version` = `commit:"unknown"`, `deploymentId 397d4061-50b5-4400-bc38-a6b2ceab0f4d`, boot 2026-06-14 (deployato via `railway up`). `origin/main` fermo a `0bb9d8c` (non è il live).
- Supabase prod unico: `wnswassgfuuivmfwjxsf`.
- **3 punti hardcoded da rompere:** (a) `functions/api.js` RAILWAY_URL; (b) `functions/auth.js` SUPABASE_URL; (c) `src/api.js` SUPABASE_URL/KEY (build-time).

### Rischio attuale
- Test V1 (createOrden, planner anchors) **scrivono/leggono il DB prod reale**.
- Deploy backend planner tocca il backend che serve **anche** la live (rischio concentrato nel core timing/cucina/orders; il planner-preview è read-only e a basso rischio, ma è bundle-ato nello stesso service).
- `/version=unknown` → nessuna tracciabilità del commit live.

---

## 2. Architettura target (BLOCCO 2)
```
LIVE                                  V1 / STAGING
─────────────────────────────        ─────────────────────────────
Netlify PROD (02bd4c7a)               Netlify V1 (a3ad035a)
  BACKEND_API_URL = Railway PROD        BACKEND_API_URL = Railway V1
  REACT_APP_SUPABASE_* = PROD           REACT_APP_SUPABASE_* = STAGING
        │                                     │
Railway PROD service                  Railway V1 service/env
  SUPABASE_* = PROD                     SUPABASE_* = STAGING
        │                                     │
Supabase PROD (wnswass…)              Supabase STAGING (nuovo)
  clienti reali, servizio             solo dati TEST/seed
```
Principio: **LIVE→backend live→DB live**; **V1→backend V1→DB staging**. Nessun cavo incrociato.

**Cosa deve creare l'utente (azioni su account/segreti — NON Claude):**
- Nuovo **progetto Supabase staging** (o branch Supabase) + relative `SUPABASE_URL`, `anon/publishable key`, `service_role key`.
- Nuovo **Railway service/environment V1** (es. `ladieci_bot_v1_staging`) con le env sotto.
- Impostare le env var su **Netlify V1** (site `a3ad035a`) e su **Railway V1**.

**Env var da copiare su V1 (con valori STAGING, non prod):**
- Backend V1 (Railway): `SUPABASE_URL`=staging, `SUPABASE_KEY`=service_role staging, `DASHBOARD_API_KEY`=(può restare uguale o nuova), `JWT_SECRET`, `PORT`.
- Frontend V1 (Netlify): `BACKEND_API_URL`=URL Railway V1, `REACT_APP_SUPABASE_URL`=staging, `REACT_APP_SUPABASE_KEY`=anon staging, `RAILWAY_API_KEY`=quella del backend V1, `JWT_SECRET`, `APP_PIN`/`DEV_AUTH_BYPASS` a scelta.

**Env da NON copiare (o disabilitare) su V1:**
- `WA_ACCESS_TOKEN`, `WA_PHONE_ID`, `WA_BUSINESS_ID`, `WA_NUMBER`, `WA_VERIFY_TOKEN` → **non mettere reali** (niente invii WhatsApp dai test).
- `ANTHROPIC_KEY` → opzionale; se assente l'AI degrada (chiamaClaude ritorna null, gestito). Meglio assente o key di test con budget basso.
- Google Maps key → opzionale; senza, il geocoder cade su Nominatim/keyword (il planner funziona lo stesso).

**Rischi integrazioni V1:**
- **WA**: se per errore metti i token reali, il backend V1 potrebbe rispondere a clienti veri → **non metterli**.
- **Anthropic/Google**: solo costi/qualità, non rompono il planner.
- **Supabase**: lo staging deve avere lo **schema identico** (vedi BLOCCO 4) o gli endpoint falliscono.

**Come evitare che V1 scriva su prod:** la garanzia è **`SUPABASE_*` staging** sia sul backend V1 sia sul frontend V1 (per le letture dirette `sb`). Finché un solo cavo punta a prod, V1 resta "mezzo live".

---

## 3. Patch proposta env-based `api.js` (BLOCCO 3 — NON applicata)
Obiettivo: togliere l'hardcode dell'URL backend, default sicuro = prod (così **production non si rompe** se la env manca).

**File toccati:** `ladieci-app33/netlify/functions/api.js` (e, coerente, `functions/auth.js` per `SUPABASE_URL`). Diff proposto per `api.js`:
```diff
- const RAILWAY_URL = "https://ladiecibot-production.up.railway.app/api";
+ // Backend URL via env (Netlify): production lascia il default prod; V1 staging
+ // imposta BACKEND_API_URL = URL del backend V1. Fallback ESPLICITO e auditabile.
+ const DEFAULT_BACKEND = "https://ladiecibot-production.up.railway.app/api";
+ const RAILWAY_URL = (process.env.BACKEND_API_URL && process.env.BACKEND_API_URL.trim())
+   ? process.env.BACKEND_API_URL.trim().replace(/\/$/, "")
+   : DEFAULT_BACKEND;
+ // log safe (niente segreti): quale backend è attivo
+ console.log("[api proxy] backend =", RAILWAY_URL === DEFAULT_BACKEND ? "default(prod)" : "env override");
```
- `RAILWAY_BASE` resta `RAILWAY_URL.replace(/\/api$/,"")` (invariato).
- **Requisiti rispettati:** non rompe prod (default prod), fallback dichiarato, log senza segreti (stampa solo prod/override, mai URL completo con eventuali token — qui l'URL non contiene segreti comunque).
- **Frontend diretto Supabase**: rendere `SUPABASE_URL`/`SUPABASE_KEY` in `src/api.js` build-time env (`REACT_APP_SUPABASE_URL`/`REACT_APP_SUPABASE_KEY`) con default prod. (Diff separato, stesso pattern.)
- **Test statico possibile:** un piccolo test che, settando `process.env.BACKEND_API_URL`, verifica che `api.js` usi l'override e che senza env usi il default prod (no rete).

**Config Netlify dopo la patch:**
- Site PROD `02bd4c7a`: **non** settare `BACKEND_API_URL` (usa default prod) → invariato.
- Site V1 `a3ad035a`: `BACKEND_API_URL` = Railway V1, `REACT_APP_SUPABASE_URL/KEY` = staging.

**Rischio patch:** basso (default = comportamento attuale). Da applicare solo con autorizzazione separata.

---

## 4. Checklist Supabase staging (BLOCCO 4 — utente esegue)
1. Creare progetto **Supabase staging** (o usare branch Supabase). [utente]
2. **Import schema**: replicare le tabelle prod (`ordenes, clientes, manual_giros, wa_msgs, config, conv, storico, archivio_conv, suggerimenti, geo_cache, delivery_logs`). Claude può generare il dump DDL/migration se gli si dà accesso in lettura allo schema (via MCP).
3. **Seed minimo** (no dati reali): `config` (APP_PIN test, REPARTIDORES, flag), menu/prodotti se in DB, zonas se in DB, 1-2 `clientes` fake marker. Niente clienti/telefoni reali.
4. Generare **service_role** (per backend V1) e **anon/publishable** (per frontend V1). [utente]
5. **RLS coerente** con prod (config public_read_non_sensitive, storico/archivio read-only, geo_cache FOR ALL) — Claude può preparare gli SQL.
6. **Script seed/cleanup marker** (`TEST_*`): Claude può prepararli (eseguibili via MCP sul progetto staging).
7. **Verifica isolamento**: `ordenes` staging parte vuota; nessun riferimento al progetto prod.

---

## 5. Checklist Railway V1 (BLOCCO 5 — utente esegue)
1. Creare **service/environment V1** (`ladieci_bot_v1_staging`). [utente]
2. Deploy del **branch backend planner** (commit `193b818`) — da git (per `/version` reale), non `railway up` anonimo.
3. **Env:** `SUPABASE_URL`=staging, `SUPABASE_KEY`=service_role staging, `DASHBOARD_API_KEY`, `JWT_SECRET`, `PORT`. **WA tokens assenti/mock**; `ANTHROPIC_KEY` opzionale; Google opzionale.
4. Verifica `/health` (ok), `/status` (db green su staging), `/version` (commit `193b818`).
5. Verifica endpoint planner: `previewStrategicOpportunities` / `previewOrderPlanner` rispondono con contract corretto.
6. **Webhook WhatsApp**: NON puntare il numero reale al backend V1 (evita risposte a clienti veri).

---

## 6. Promotion process (BLOCCO 6 — regola da scolpire)
- Fix si sviluppa e si testa **su V1 (DB staging)**.
- **Migrations**: applicare **prima su staging, poi su prod** (mai solo su uno → evita drift di schema).
- Promozione a live: merge controllato **fuori servizio**, con `git push origin main` **da git** (commit reale in `/version`), **non** `railway up` anonimo se non emergenza.
- **Rollback**: registrare sempre il `deploymentId` live PRIMA (oggi: `397d4061…`) → Redeploy del precedente.
- **Version tracking**: deploy da git per avere `commit` in `/version` (basta).
- Regola: **niente planner V1 / test sul backend live**; **niente WA reale dai test**.

---

## 7. Cosa può fare Claude
- Generare la **patch `api.js`/`auth.js`/`src/api.js` env-based** (diff) + test statico.
- Generare **DDL/migration** dello schema (se accesso lettura schema via Supabase MCP), **SQL RLS**, **script seed/cleanup marker** per lo staging.
- Preparare la **checklist env var** per Netlify V1 e Railway V1 (senza valori segreti).
- Eseguire seed/cleanup/test **sul progetto staging** una volta creato e collegato l'MCP.

## 8. Cosa deve fare l'utente (azioni non delegabili)
- Creare **progetto Supabase staging** e **service/environment Railway V1**.
- Inserire i **segreti** (service_role, anon, eventuali API key) in Netlify V1 / Railway V1.
- Collegare/scollegare **webhook WhatsApp** (non puntare il reale a V1).
- Autorizzare l'applicazione della patch e i deploy (frasi esatte separate).

## 9. Rischi residui
- **Drift schema** staging↔prod se le migration non sono disciplinate (mitigazione: BLOCCO 6).
- **Accoppiamento frontend→Supabase** dimenticato (il punto (c)): se si env-switcha solo il backend e non `REACT_APP_SUPABASE_*`, V1 legge ancora prod. **Da fare insieme.**
- **Costi**: secondo progetto Supabase + secondo service Railway.
- **Auth/PIN**: lo staging usa il proprio `APP_PIN` (config staging) — non riusare il PIN prod.
- **Promotion**: senza processo, V1 diventa un fork permanente non riportato in live.

## 10. Prossimo step consigliato
**Il passo a più alto valore e più economico**, da fare per primo:
1. **Supabase staging** (isolamento DB = il vero lever) + **Railway environment V1** che override SOLO `SUPABASE_*`. — azioni utente.
2. In parallelo, su autorizzazione: applicare la **patch `api.js` env-based** (+ `src/api.js` Supabase env) — patch piccola, default prod, non rompe la live.
3. Poi: deploy backend `193b818` sul **Railway V1** (non sul live), puntare Netlify V1 lì, e fare il test planner Q5/Q2 **tutto su staging isolato**.

→ Con questo, il bug Q2/Q5 si chiude **senza mai rischiare il servizio live**.

---

**STOP dopo report. Nessuna patch applicata senza autorizzazione separata. Nessun deploy, nessun push, nessuna modifica infra.**
