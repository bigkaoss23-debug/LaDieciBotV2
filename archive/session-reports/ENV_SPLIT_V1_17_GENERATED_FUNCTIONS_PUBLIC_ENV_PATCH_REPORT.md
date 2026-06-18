# ENV_SPLIT_V1_17 — GENERATED FUNCTIONS PUBLIC ENV PATCH — REPORT

**Data:** 2026-06-17
**Branch:** `consolidation/nuevo-pedido-v1-unified-2026-06-09`
**HEAD all'avvio:** `8eb1474`
**Scope:** solo patch locale + test. NESSUN deploy, NESSUN push, NESSUNA scrittura DB.

---

## 0. Preflight / recovery

- Branch corretto, HEAD `8eb1474` come atteso.
- Nessuna modifica tracked inattesa all'avvio (solo report `.md` untracked).
- `ORDINI_2026-05-23.md`: untracked e **intoccato** (verificato prima e dopo).

---

## 1. Problema risolto

Sul sito git-linked V1 (`ladieci-v1-staging`, `a3ad035a`) le Netlify **Functions
runtime** non ricevono lo store env utente: arrivano solo poche var account-level
(`JWT_SECRET`, `RAILWAY_API_KEY`). Senza `BACKEND_API_URL` / `SUPABASE_URL` /
`SUPABASE_ANON_KEY` il resolver fail-closed (V1_08) risponde **503** e l'app
staging resta inoperativa (sicura ma inutilizzabile). Tentativi V1_07→V1_16 (CLI
draft, git-linked, store account-level) non hanno fatto arrivare quelle 3 var alle
functions.

Le 3 config sono **NON-segrete** (URL backend V1, URL Supabase staging, anon
publishable key — finiscono comunque nel bundle browser). Soluzione: materializzarle
a **build-time** in un file che il deploy delle functions include.

---

## 2. File creati / modificati

| File | Tipo | Cosa |
|---|---|---|
| `ladieci-app33/scripts/generate-functions-public-env.js` | **nuovo** | Generator build-time del file pubblico per le functions |
| `ladieci-app33/netlify/functions/_env.js` | modificato | Resolver: aggiunto step 2 = generated env (solo non-prod) + check ref-prod |
| `ladieci-app33/package.json` | modificato | `prebuild`: aggiunto `generate-functions-public-env.js` tra il guard e write-version |
| `.gitignore` (root) | modificato | Ignora `ladieci-app33/netlify/functions/_publicEnv.generated.js` |
| `ladieci-app33/src/functionsPublicEnv.test.js` | **nuovo** | Test V1_17 (resolver + generator) |
| `ladieci-app33/src/functionsEnvResolver.test.js` | modificato | Reso ermetico: passa `generated={}` esplicito nei casi fail-closed |
| `ladieci-app33/netlify/functions/_publicEnv.generated.js` | **build artifact** | Generato a build-time, gitignored, MAI committato |

---

## 3. Come funziona il generated env

### Generator (`scripts/generate-functions-public-env.js`)
1. Legge dal build env: `REACT_APP_BACKEND_API_URL`, `REACT_APP_SUPABASE_URL`,
   `REACT_APP_SUPABASE_ANON_KEY` (per il backend preferisce `BACKEND_API_URL` se
   già presente con suffisso `/api`, altrimenti normalizza la `REACT_APP_*`
   aggiungendo `/api`).
2. **PRODUCTION reale** (`SITE_ID = 02bd4c7a…`) → **non genera nulla** ed esce 0:
   le functions usano il prod-fallback gated in `_env.js`. Il path prod non è
   toccato.
3. **Non-production** → valida che le 3 config siano non-vuote e **non puntino a
   prod** (`ladiecibot-production` / `wnswassgfuuivmfwjxsf`); altrimenti
   **fa fallire il build** (exit ≠ 0).
4. Scrive `netlify/functions/_publicEnv.generated.js` con **solo**:
   `BACKEND_API_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
5. **Mai** scrive segreti server (service_role/SUPABASE_KEY, JWT, RAILWAY, WA,
   ANTHROPIC). Log safe: solo host + hint anon key (`primi 12 char…(N chars)`),
   mai token interi.

### Resolver (`netlify/functions/_env.js`)
Ordine di risoluzione, per `resolveBackendUrl` e `resolveSupabase`:
1. `process.env` esplicito.
2. **`_publicEnv.generated.js`** (caricato con require in try/catch — opzionale)
   → usato **solo in non-prod**.
3. Fallback default **PRODUCTION** → **solo** se `SITE_ID` = prod reale.

In **non-prod**, qualunque valore (da env o da generated) che punti a prod →
**errore fail-closed** (la function risponde 503). In **prod reale** il generated
viene **ignorato** (mai downgrade verso staging).

### Wiring build
`prebuild` = `guard-no-lab-markers → guard-env-fail-closed → **generate-functions-public-env** → write-version`, poi `react-scripts build`. Al prossimo build git-linked
dal branch V1, il file generato entra nel deploy artifact delle functions.

---

## 4. Test — PASS/FAIL

### Unit/integration (jest, `react-scripts test`)
`functionsEnvResolver.test.js` + `functionsPublicEnv.test.js` + `envConfig.audit.test.js`:
**3 suite passate, 28 test passati, 0 falliti.**

Copertura V1_17 (`functionsPublicEnv.test.js`):
1. staging senza `process.env` ma con generated → **PASS** (`source=generated`) ✓
2. staging senza `process.env` e senza generated → **fail-closed** ✓
3. staging con generated che punta a PROD (backend e Supabase) → **FAIL** ✓
4. production reale senza env/generated → **fallback prod PASS** ✓
5. prod reale ignora un generated staging (mai downgrade) ✓
6. generator staging → output = **esattamente le 3 chiavi**, **0 segreti server**
   (verificati assenti: SUPABASE_KEY, SUPABASE_SERVICE_KEY, JWT_SECRET,
   RAILWAY_API_KEY, WA_*, ANTHROPIC_KEY, `sb_secret`, marker `NON_DEVE_USCIRE`) ✓
7. generator staging con env mancanti → build **BLOCCATO**, nessun file ✓
8. generator staging che punta a prod → build **BLOCCATO**, nessun file ✓
9. generator prod reale → **nessun file** generato ✓

### Build staging reale (FASE 5 #6)
`npm run build` con env staging (SITE_ID staging, fearless-reverence, tdikhfeinufaahagmpjz)
→ **Compiled successfully** (`main.1df9d29c.js`, 244 kB gz). Prebuild ha generato
correttamente `_publicEnv.generated.js`.

### Grep bundle / artifact (FASE 5 #7, #8)
- Bundle **eseguibile** `build/static/js/*.js`:
  - `ladiecibot-production` → **0** ✓
  - `wnswassgfuuivmfwjxsf` → **0** ✓
  - `fearless-reverence` → **presente** ✓
  - `tdikhfeinufaahagmpjz` → **presente** ✓
- File generato `_publicEnv.generated.js`: backend staging + Supabase staging
  presenti, **zero segreti server** ✓.

> **Nota source-map:** i ref prod (`ladiecibot-production`, `wnswassgfuuivmfwjxsf`)
> compaiono SOLO in `main.*.js.map` (source map), non nel `.js` eseguibile. Sono le
> stringhe di default del **prod-fallback gated** che vivono nel sorgente
> (`utils/backendBase.js`, `_env.js`) e si attivano solo su `SITE_ID` prod reale.
> Non sono un rischio runtime (le source map non vengono eseguite). Coerente con
> V1_08/V1_12.

---

## 5. Cosa succederà al prossimo git-linked deploy V1

Quando Netlify builda il branch V1 (con le var del `ladieci-app33/netlify.toml`
`[build.environment]` già presenti da V1_15/V1_16):
1. il prebuild genera `_publicEnv.generated.js` con backend V1 + Supabase staging;
2. il file entra nel deploy delle functions;
3. `auth.js` / `api.js` risolvono backend+Supabase via env → (se assenti) generated
   → **niente più 503**, app staging operativa;
4. il path prod resta intatto: prod reale non genera il file e usa il fallback gated.

Da fare **dopo** (fuori da questa task): checkpoint + backup branch → deploy
git-linked V1 → anti-prod check (auth `654321`, getConfig `La Dieci (STAGING)`,
zero prod).

---

## 6. Conferme di sicurezza

- ❌ Nessun deploy (Netlify/Railway). ❌ Nessun push (main o altro). ❌ Nessuna
  scrittura DB. ❌ Nessun test planner / creazione ordini / WhatsApp reale.
- ✅ Production frontend (`02bd4c7a`, `069c273`, deploy `6a303f3d`) intatta e locked.
- ✅ `ORDINI_2026-05-23.md` **intoccato** (untracked, nessuna modifica).
- ✅ Nessun segreto stampato (log solo host + hint key). Nessun segreto nel file
  generato né nel bundle.
- ✅ Generated file **gitignored** (verificato con `git check-ignore`).
- Working tree: 4 file tracked modificati + 2 nuovi file (generator + test);
  build artifact e generated file rimossi localmente (gitignored). Nessuna modifica
  committata.

---

## 7. Promemoria sicurezza aperta (NON in questa task)

Segreti prod esposti in V1_07 ancora **da ruotare** separatamente: `ANTHROPIC_KEY`,
`WA_ACCESS_TOKEN` / WA identifiers, `APP_PIN` produzione. Non ruotati qui.

**STOP dopo report.** Nessun commit/deploy/push automatico.
