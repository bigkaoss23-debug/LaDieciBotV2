# ENV_SPLIT_V1_08 — FAIL-CLOSED PATCH REPORT

**Data:** 2026-06-17
**Tipo:** patch locale + test. **Nessun deploy, nessun push, nessuna scrittura DB.**
**Obiettivo:** rendere impossibile il fail-open verso prod nei deploy V1/staging/non-prod
(causa del fallimento isolamento in `ENV_SPLIT_V1_07`).

---

## PRINCIPIO

Il fallback ai default **PRODUCTION** è permesso **solo sul sito di produzione reale**,
riconosciuto da `SITE_ID = 02bd4c7a-a50b-4964-90da-8c1af1122932`. In V1/staging
(`a3ad035a-…`), deploy-preview, o contesti sconosciuti, se l'env esplicita manca →
**errore** (runtime 503 per le functions; build fallito per il bundle). Niente più
"silenzioso → prod".

---

## FILE MODIFICATI / CREATI

| File | Tipo | Cosa |
|---|---|---|
| `netlify/functions/_env.js` | **nuovo** | resolver condiviso fail-closed: `resolveBackendUrl()`, `resolveSupabase()`, `isRealProd()`. Unico posto con i default prod, gated da `SITE_ID`. |
| `netlify/functions/api.js` | mod | usa `resolveBackendUrl()`; se `CONFIG_ERROR` → `respond(503)`. Rimosso il default prod inline. |
| `netlify/functions/auth.js` | mod | usa `resolveSupabase()`; se `CONFIG_ERROR` → `respond(503)`. Rimosso il ref Supabase prod inline. |
| `scripts/guard-env-fail-closed.js` | **nuovo** | build-guard: build NON-prod senza `REACT_APP_SUPABASE_*` (o che puntano a prod) → `exit 1`. |
| `package.json` | mod | `prebuild` ora include `guard-env-fail-closed.js`. |
| `src/api.js` | mod (commento) | documenta che il fallback prod è gated dal build-guard (non più silenzioso). Literal invariati (inlinati solo nel build prod reale). |
| `src/envConfig.audit.test.js` | riscritto | asserzioni nuove: resolver + fail-closed + no ref prod inline nelle functions. |
| `src/functionsEnvResolver.test.js` | **nuovo** | unit test reale del resolver con env simulate. |

---

## COMPORTAMENTO PRIMA / DOPO

| Scenario | PRIMA (V1_07) | DOPO (V1_08) |
|---|---|---|
| Proxy V1, `BACKEND_API_URL` assente a runtime | → backend **prod** (silenzioso) | → **503** "config error… fail-closed" |
| Auth V1, `SUPABASE_URL`/key assenti a runtime | → Supabase **prod** (legge config/segreti) | → **503**, nessuna lettura prod |
| Build V1, `REACT_APP_SUPABASE_*` assenti | bundle con **default prod** | **build fallisce** (exit 1) |
| Build V1 con env che punta a prod ref | accettato | **build fallisce** |
| Production reale (`SITE_ID` prod), env assenti | fallback prod | fallback prod (**invariato**, OK) |

---

## TEST — ESITO

### 1. Jest (static audit + resolver) — `CI=true react-scripts test`
```
PASS src/functionsEnvResolver.test.js
PASS src/envConfig.audit.test.js
Test Suites: 2 passed, 2 total   Tests: 16 passed, 16 total
```
Copre (resolver, env simulate):
- api: staging senza `BACKEND_API_URL` → **errore**; staging con → **ok**; prod senza → **fallback prod**; SITE_ID sconosciuto/assente → **errore**.
- auth: staging senza url/key → **errore**; con url senza key → **errore**; con url+anon → **ok**; prod senza → **fallback prod**; preferenza service key.
- `isRealProd` vero solo per SITE_ID prod.

### 2. Build-guard — 5 scenari (exit code)
| Scenario | Atteso | Reale |
|---|---|---|
| staging SENZA env | FAIL (1) | **1** ✅ |
| staging CON env staging | PASS (0) | **0** ✅ |
| prod reale SENZA env | PASS (0) | **0** ✅ |
| SITE_ID sconosciuto SENZA env | FAIL (1) | **1** ✅ |
| non-prod con env = prod ref | FAIL (1) | **1** ✅ |

### 3. Build completo (env staging) — PASS
`npm run build` con `SITE_ID`+`REACT_APP_*` staging → guard OK, `Compiled successfully.`,
bundle `main.8f4fcba9.js`, `version.json` commit `8f60611`.

### 4. Sintassi + grep anti-prod
- `node --check` su `_env.js` / `api.js` / `auth.js` → **OK**.
- `api.js` contiene `ladiecibot-production`: **0**. `auth.js` contiene `wnswassgfuuivmfwjxsf`: **0**.
- `_env.js` è l'**unico** file con i default prod (1 e 1), entrambi **dentro `isRealProd()`**.
- `src/api.js`: il ref prod resta come fallback build-time ma è **gated dal build-guard** (un build non-prod senza env non compila → niente uso silenzioso).

---

## COSA SUCCEDE ORA SE NETLIFY PREVIEW NON INIETTA LE ENV

È lo scenario che ha rotto V1_07. Con la patch:
- **Functions** (`auth`/`api`): senza env runtime nel preview → `resolve*()` ritorna
  `error` → la function risponde **503 "config error… fail-closed"**. **Non** colpisce
  più prod, **non** legge segreti prod. Il fallimento è esplicito e visibile.
- **Bundle**: se il build del preview non avesse le `REACT_APP_*`, il **build fallirebbe**
  (guard) invece di produrre un bundle che punta a prod.

→ L'isolamento non dipende più dalla "speranza" che le env arrivino: se non arrivano,
si rompe in modo sicuro (503/build-fail), mai verso produzione.
Resta da risolvere **separatamente** *perché* il preview draft non inietta le env
(bind contesto `deploy-preview`, build da git, o test diretto sul backend V1) — ma
adesso un eventuale buco non causa più fuga su prod.

---

## CONFERME PERIMETRO
- ❌ Nessun deploy, nessun push, nessuna scrittura DB, nessuna chiamata a prod.
- ❌ Production (Netlify `02bd4c7a`, Railway prod, Supabase `wnswassgfuuivmfwjxsf`) non toccata.
- ❌ `ORDINI_2026-05-23.md` non toccato.
- ❌ Nessun segreto loggato (guard/resolver stampano solo SITE_ID/CONTEXT e NOMI di env).
- Guardia anti-prod deploy: invariata.

## 🚨 REMINDER (da fare separatamente — NON in questo task)
I segreti **prod** esposti in lettura durante `ENV_SPLIT_V1_07` restano da **ROTARE**:
`ANTHROPIC_KEY`, `WA_ACCESS_TOKEN` (+ identificatori WA) e **cambiare l'`APP_PIN` prod**
(era `123456`). Questa patch previene futuri fail-open ma non annulla l'esposizione già avvenuta.

## PROSSIMO STEP
1. (Sicurezza) Rotazione segreti prod sopra.
2. Ri-deploy preview V1 con la patch + risolvere l'iniezione env del preview.
3. Ripetere l'anti-prod check: ora un eventuale buco dà **503/build-fail**, non prod.
4. Solo a isolamento confermato → test planner Q5/Q2.

**STOP.** Patch locale + test completati. Nessun deploy/push/DB write.
