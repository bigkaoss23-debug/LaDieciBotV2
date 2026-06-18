# ENV_SPLIT_V1_07 — PREVIEW DEPLOY & ISOLATION TEST REPORT

**Data:** 2026-06-17
**Esito:** 🔴 **ISOLAMENTO FALLITO — STOP.** Il preview V1 gira contro PRODUCTION.
Nessuna scrittura eseguita (solo letture). **Nessun test planner eseguito.**

---

## COSA È STATO FATTO (in ordine)

1. **FASE 1 — backend V1 OK** (`https://fearless-reverence-production-80bc.up.railway.app`)
   - `/health` ok; `/status` ok, DB green, commit `193b818`; `/version` branch planner-fix.
   - Chiamata **diretta** al backend V1 → `PIZZERIA_NOME="La Dieci (STAGING)"`, `PIANO="staging"` → **il backend V1 è legato a Supabase staging** ✅.
   - WhatsApp inattivo (`/status` whatsapp lastAt null; config `WEBHOOK_ACTIVE=FALSE`).

2. **FASE 2 — env Netlify V1** (`a3ad035a`) impostate (7 var, `--site` esplicito, prod non toccata).
   - Verificato dopo: `BACKEND_API_URL` = URL Railway V1, `SUPABASE_URL`/`REACT_APP_SUPABASE_URL` = staging, visibili anche con `--scope functions`.

3. **FASE 3' — build + deploy PREVIEW** (no `--prod`, guardia non toccata):
   - Build commit `8f60611`, bundle `main.8f4fcba9.js`, `version.json` aggiornato a `8f60611`.
   - Bundle: ref staging `tdikhfeinufaahagmpjz` **bakeato** (CRA ha sostituito le `REACT_APP_*`).
   - Draft URL: `https://6a32c04c2b317300fdd06920--ladieci-v1-staging.netlify.app` (2 functions incluse).

4. **FASE 4 — anti-prod check → FALLITO** (vedi sotto).

---

## 🔴 ISOLATION CHECK — RISULTATO

| # | Verifica | Atteso | Reale | Esito |
|---|---|---|---|---|
| version.json | bundle env-split | commit `8f60611` | `8f60611` | ✅ |
| Frontend diretto (bundle) | Supabase staging | staging bakeato nel JS | staging presente, CRA-substituted | ✅ (build-time) |
| **Proxy `/api/proxy` → backend** | Railway V1 | **PROD** (`ladiecibot-production`) | `getConfig` proxy = dati **prod** (`PIZZERIA_NOME="La Dieci"`, `PIANO="pro"`, + segreti prod) | 🔴 **FAIL** |
| **Auth `/api/auth` → Supabase** | staging config | **PROD** | PIN staging repartidor `654321` **rifiutato**; APP_PIN `123456` accettato solo perché prod lo condivide | 🔴 **FAIL** |
| Nessuna chiamata a prod | 0 | — | proxy+auth colpiscono prod | 🔴 **FAIL** |

**Prova schiacciante:** stessa azione `getConfig`:
- **diretta al backend V1** → `"La Dieci (STAGING)"` (staging)
- **via proxy Netlify** → `"La Dieci"` + segreti prod (PRODUCTION)

→ Il proxy **non** usa `BACKEND_API_URL`; cade su `DEFAULT_BACKEND` = prod. L'auth **non** usa `SUPABASE_URL`; cade sul default Supabase prod.

---

## ROOT CAUSE

Le function del **deploy draft via CLI** (`netlify deploy` senza `--build`/`--prod`)
**non hanno ricevuto le environment variables del sito a runtime**, pur essendo
impostate e con scope `functions`. Entrambe le function sono quindi cadute sui
**default hardcoded prod** del codice env-split:
- `api.js` → `BACKEND_API_URL` assente → `DEFAULT_BACKEND = ladiecibot-production` (prod)
- `auth.js` → `SUPABASE_URL` assente → default `wnswassgfuuivmfwjxsf` (prod)

È il comportamento **"fail-open verso prod"** già segnalato nell'audit
(`ENV_SPLIT_V1_03`): se la env manca a runtime, il codice usa prod **senza errore**.

Nota: il lato **build-time** ha funzionato (bundle = staging). Ha fallito solo il
lato **runtime functions** col metodo di deploy usato (draft CLI).

---

## 🚨 IMPATTO SICUREZZA — AZIONE RICHIESTA

Durante l'anti-prod check, `getConfig` via proxy ha **letto e mostrato segreti di
PRODUCTION** in questa sessione. **Vanno considerati compromessi e ROTATI:**
- `ANTHROPIC_KEY` (prod) — **ruotare** (chiave API Claude)
- `WA_ACCESS_TOKEN` (prod) — **ruotare** (token WhatsApp)
- `WA_PHONE_ID`, `WA_BUSINESS_ID`, `WA_NUMBER` — identificatori (meno critici, ma esposti)
- **`APP_PIN` prod = `123456`** è stato indirettamente rivelato (coincide col seed staging) → **cambiare il PIN operatore di produzione**.
- Minore: il `JWT_SECRET` staging che ho generato è stato stampato da un `env:list --plain` → ruotabile sul solo sito V1 (impatto staging).

**Nessuna scrittura** è avvenuta su prod: solo `getConfig`/`getOrdenes`/`auth` (letture).
Nessun ordine creato. Il DB prod non è stato modificato.

---

## REMEDIATION (prima di ritentare — NON fare il planner test ora)

1. **Ruotare i segreti prod** elencati sopra + cambiare `APP_PIN` prod.
2. **Far ricevere le env alle functions del preview.** Opzioni da valutare (task separato):
   - bind delle env anche al contesto `deploy-preview` (`netlify env:set … --context deploy-preview`), oppure
   - deploy con pipeline di build Netlify (sito collegato a git) così le env vengono iniettate, oppure
   - test contro il backend V1 **direttamente** (già isolato) bypassando il proxy per i soli check, oppure
   - irrobustire il codice: invece di "fail-open verso prod", **fail-closed** (se `BACKEND_API_URL`/`SUPABASE_URL` mancano in un deploy non-prod → errore, non default prod).
3. **Ripetere l'anti-prod check** e ottenere PASS su proxy+auth PRIMA di qualsiasi ordine.

---

## STATO INFRA (post-tentativo)
- Supabase staging `tdikhfeinufaahagmpjz`: schema+seed OK, **0 ordini, invariato**.
- Backend Railway V1: OK, isolato su staging (verificato diretto).
- Netlify V1 `a3ad035a`: env impostate; **preview draft NON isolato** (functions→prod).
- Production (Netlify `02bd4c7a`, Railway prod, Supabase `wnswassgfuuivmfwjxsf`): **non scritta**; ma segreti prod **esposti in lettura** → rotazione necessaria.
- Guardia anti-prod: **intatta** (non aggirata; deploy fatto in draft senza `--prod`).
- `ORDINI_2026-05-23.md`: non toccato.

**STOP.** Niente planner test, niente deploy `--prod`, niente push, niente scrittura DB.
Prossimo passo bloccante: **rotazione segreti prod** + fix iniezione env functions, poi re-check isolamento.
