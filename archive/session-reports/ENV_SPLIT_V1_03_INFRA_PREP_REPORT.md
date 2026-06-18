# ENV_SPLIT_V1_03 — INFRA PREP REPORT / CHECKLIST

**Data:** 2026-06-17
**Scopo:** dare a V1/staging una "casa" separata da production (Netlify V1 + Railway V1 + Supabase staging), così i test del planner NON toccano più live.
**Fonte dati:** `ENV_SPLIT_V1_03_INFRA_AUDIT_REPORT.md` (audit read-only stessa sessione).

---

## 1. STATO ATTUALE

### LIVE (NON toccare)
- **Netlify:** `magnificent-lollipop-6dff70` (`02bd4c7a-a50b-4964-90da-8c1af1122932`), deploy `6a303f3d` (commit `069c273`), locked. Env: `JWT_SECRET`, `RAILWAY_API_KEY`.
- **Railway:** project `surprising-tenderness` (`5f76bdfb-…`), env **`production`**, service `ladieci_bot`, deploy `397d4061-…`, `/version=unknown`.
- **Supabase:** `LaDieci10App` (`wnswassgfuuivmfwjxsf`), ACTIVE_HEALTHY, dati clienti reali.

### V1 / STAGING (com'è oggi)
- **Netlify:** `ladieci-v1-staging` (`a3ad035a-e73f-4da3-8873-6403e31f04b6`). Ultimo deploy `6a3050ec` del 2026-06-15 (manuale, no git), **precedente** al codice env-split. **Env var: VUOTE.**
- **Railway V1:** ❌ non esiste.
- **Supabase staging:** ❌ non esiste.

### Pezzi ancora accoppiati a prod
- Con env vuota, lo staging cade sui default prod in **tutti e 3** i punti: proxy `/api` → Railway prod; auth PIN → Supabase prod; `sb*` diretto → Supabase prod.
- Il codice env-based (`8f60611`) è pronto ma **non deployato** su staging.

---

## 2. ARCHITETTURA TARGET

```
LIVE                                  V1 / STAGING
────────────────────────────         ────────────────────────────
Netlify magnificent-lollipop   →     Netlify ladieci-v1-staging (a3ad035a)
   02bd4c7a (069c273, locked)           env: BACKEND_API_URL + SUPABASE_* + REACT_APP_SUPABASE_*
        │                                     │
        ▼                                     ▼
Railway production                    Railway V1 (NUOVO env/service)
   ladieci_bot                           backend planner-fix 193b818
        │                                     │
        ▼                                     ▼
Supabase LaDieci10App                 Supabase staging (NUOVO progetto)
   wnswassgfuuivmfwjxsf                   schema clonato + seed test, ZERO clienti reali
   (clienti reali)
```

Regola d'oro: **nessun cavo incrociato.** V1 → solo Railway V1 → solo Supabase staging. Se una env manca, il codice cade su prod → l'anti-prod check (§6) deve intercettarlo.

---

## 3. CHECKLIST — Supabase staging  *(AZIONE UTENTE)*

L'utente deve:
- [ ] Creare nuovo progetto Supabase **staging** (es. `LaDieci10App-staging`), stessa region `eu-west-1`.
- [ ] Importare **schema/migrazioni** dal prod (tabelle: `conv`, `wa_msgs`, `ordenes`, `storico`, `archivio_conv`, `config`, `suggerimenti`, `clientes`, `delivery_logs`, `geo_cache`, + colonne recenti: `forno_out`, `descuento_*`, `ui_offset_min`).
  - Claude può preparare lo SQL delle migrazioni/DDL se serve (azione autorizzabile).
- [ ] **NON copiare clienti reali.** Nessun dump di `clientes`/`conv`/`wa_msgs`/`storico` da prod.
- [ ] Seed minimo (solo dati operativi non sensibili):
  - `config` → `APP_PIN`, `REPARTIDOR_PIN`, `AUTO_RISPOSTA`, zone/orari, soglie planner
  - prodotti / menu / extras
  - zone delivery
  - clienti **fake** (es. `nombre ILIKE 'TEST%'`) solo se servono per i test planner
- [ ] Generare e annotare (segreti → solo lato utente/Netlify, mai nei report):
  - Project URL (`https://<ref-staging>.supabase.co`)
  - anon / publishable key
  - service_role key
- [ ] Configurare **RLS coerente con prod**:
  - `config` → `public_read_non_sensitive` (blocca `WA_ACCESS_TOKEN`, `ANTHROPIC_KEY`, `WA_PHONE_ID`, `WA_BUSINESS_ID`, `WA_NUMBER` ad anon)
  - `storico`/`archivio_conv` → `FOR SELECT TO public` (read-only)
  - `geo_cache` → `FOR ALL TO public`
- [ ] Verifiche di isolamento:
  - `ordenes` **vuota** (baseline 0)
  - `clientes` solo fake/seed
  - nessun dato reale in nessuna tabella

---

## 4. CHECKLIST — Railway V1  *(AZIONE UTENTE per creazione; deploy autorizzabile)*

- [ ] Creare **environment** (o service) Railway V1 nel project `surprising-tenderness`
      (oggi esiste solo env `production` / service `ladieci_bot`).
- [ ] Deployare backend dal **commit/branch planner-fix `193b818`**
      (`/Users/bigart/Downloads/ladieci-bot`, branch `backup/v2-route-impact-slip-guard-2026-06-14`).
      - ⚠️ Preferire **deploy da git** (push su un branch/repo collegato) così `/version` non è `unknown`. Evitare `railway up` anonimo.
- [ ] Env V1 (segreti inseriti dall'utente):
  - `SUPABASE_URL` = URL **staging**
  - `SUPABASE_KEY` = **service_role staging** (per bypass RLS lato backend)
  - `DASHBOARD_API_KEY` = chiave coerente con la `RAILWAY_API_KEY` impostata sul proxy V1 Netlify
  - `JWT_SECRET` (può coincidere o no con prod; coerente col sito V1)
  - chiavi planner / `ANTHROPIC_KEY` solo se i test planner le richiedono
  - **NO** token WhatsApp reale · **NO** webhook WhatsApp reale (lasciare scollegato)
- [ ] Verifiche post-deploy:
  - `GET /health` → ok
  - `GET /status` (se esiste) / `/version` → non `unknown`
  - endpoint planner preview (es. `GET /api/delivery/shadow-preview?date=…`) risponde
  - una `getOrdenes` deve leggere **Supabase staging** (0 ordini baseline), non prod

---

## 5. CHECKLIST — Netlify V1 env  *(Claude può impostarle se autorizzato; deploy solo on-demand)*

Da impostare **solo** sul sito V1 `a3ad035a-e73f-4da3-8873-6403e31f04b6` (mai su prod):

```
BACKEND_API_URL          = https://<railway-v1>/api
SUPABASE_URL             = https://<ref-staging>.supabase.co
SUPABASE_ANON_KEY        = <staging anon key>          # usata da auth.js (PIN)
REACT_APP_SUPABASE_URL   = https://<ref-staging>.supabase.co
REACT_APP_SUPABASE_ANON_KEY = <staging anon key>       # build-time, usata da src/api.js
```

Già presenti / da confermare sullo staging: `JWT_SECRET`, `RAILWAY_API_KEY` (=`DASHBOARD_API_KEY` del backend V1), opz. `DEV_AUTH_BYPASS`.

Note operative:
- ⚠️ `REACT_APP_*` sono **build-time (CRA)**: dopo averle impostate serve un **rebuild** del bundle, non basta cambiare l'env del runtime.
- ⚠️ **PROD Netlify non si tocca** — deploy SOLO con `--site a3ad035a-…` esplicito (il link locale punta a PROD).
- Il deploy staging è manuale (no git) → build locale (`npm run build` da `ladieci-app33`) poi `netlify deploy --site a3ad035a-…` (autorizzazione utente richiesta; prod resta locked).
- Dopo il deploy, eseguire l'anti-prod check (§6) prima di qualsiasi test.

---

## 6. ANTI-PROD VERIFICATION (read-only, dopo setup)

Piano (nessuna scrittura finché staging DB non è confermato):
- [ ] Aprire `https://ladieci-v1-staging.netlify.app`, login.
- [ ] **auth** → verificare che il PIN sia validato contro Supabase **staging** (es. PIN staging ≠ PIN prod, oppure log `[api proxy]`/network mostra l'host staging).
- [ ] **proxy** → una chiamata `/api/proxy?action=getOrdenes` deve colpire **Railway V1** (0 ordini baseline staging), non prod.
- [ ] **frontend diretto** → le `sb*` (`/rest/v1/...`) in Network devono puntare all'host **staging** (`<ref-staging>.supabase.co`), non `wnswassgfuuivmfwjxsf`.
- [ ] Solo quando i 3 path confermano staging: eventuale marker test (`nombre ILIKE 'TEST%'`) — e cleanup fuori servizio.
- [ ] **Verificare Supabase prod INVARIATO**: `ordenes` prod conteggio invariato, nessuna scrittura comparsa.

> Segnale di allarme: se nel Network compare `wnswassgfuuivmfwjxsf` o `ladiecibot-production.up.railway.app` → una env manca e si sta colpendo PROD. STOP.

---

## 7. PROMOTION PROCESS

- Sviluppo e test del planner → **solo su V1 + Supabase staging**.
- Migrazioni schema: applicare **prima staging, poi prod** (mai il contrario).
- Promozione verso live: merge/deploy **solo fuori servizio**, con OK esplicito utente.
  - Frontend prod: SOLO da `main`/commit approvato, deploy con `--site` prod esplicito, mantenendo il lock.
  - Backend prod: deploy **da git** per avere `/version` reale; `railway up` anonimo solo in emergenza.
- Rollback sempre pronto (frontend: `restoreSiteDeploy` al deploy precedente; backend: redeploy del deployment precedente noto).

---

## 8. CHI FA COSA

**Claude può (autorizzazione per i deploy):**
- patch codice frontend/backend
- preparare SQL / migrazioni / DDL per Supabase staging
- preparare script seed / cleanup (`TEST%`)
- audit config read-only e anti-prod check
- impostare env Netlify V1 (se autorizzato)
- deploy SOLO V1 staging quando l'utente dice "vai"

**Utente deve (azioni esterne, segreti):**
- creare progetto **Supabase staging** (conferma costi)
- creare **environment/service Railway V1**
- inserire i **segreti** (service_role, token, JWT)
- gestire **WhatsApp**: NON collegare webhook/token reale allo staging
- **autorizzare** ogni deploy

---

## 9. PROSSIMO STEP RACCOMANDATO

L'infra separata **non esiste ancora** (no Railway V1, no Supabase staging; env staging vuote). Quindi:

1. **Utente:** crea Supabase staging + Railway V1, inserisce i segreti. (Claude può preparare in anticipo SQL schema/seed se autorizzato.)
2. **Claude:** imposta le 5 env sul sito Netlify V1 `a3ad035a`, rebuild+deploy SOLO staging (su "vai").
3. **Claude:** esegue l'anti-prod check (§6) e conferma isolamento (prod invariato).
4. **Solo dopo** isolamento confermato → si torna al planner runtime Q5/Q2 sul DB staging (zero rischio live).

---

## STATO FILE
- `ENV_SPLIT_V1_03_INFRA_AUDIT_REPORT.md` ✅
- `ENV_SPLIT_V1_03_INFRA_PREP_REPORT.md` ✅ (questo)

**STOP.** Nessun deploy / push / commit / patch / DB write eseguito. Production e `ORDINI_2026-05-23.md` non toccati.
