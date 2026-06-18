# V1_STAGING_DEPLOY_RETRY_PREP_REPORT

**Data:** 2026-06-17
**Tipo:** PIANO + comandi per il retry del preview V1. **NON eseguito.** Nessun deploy,
nessun ordine, nessun planner test. Esecuzione **solo su tua autorizzazione**.

---

## PRECONDIZIONI (tutte verificate in questa sessione)
- Backend Railway V1 isolato su staging — `RAILWAY_V1_READONLY_CHECK_REPORT` ✅
- Env Netlify V1 complete e corrette, tutti i contesti — `NETLIFY_V1_ENV_READY_CHECK_REPORT` ✅
- Patch fail-closed in `8c51909` (HEAD attuale) + backup remoto ✅
- Guardia anti-prod attiva: blocca `netlify deploy --prod` → si usa **deploy preview (no `--prod`)**.

## RACCOMANDAZIONE SICUREZZA (FASE 1)
La rotazione dei segreti prod (`SECURITY_ROTATION_PROD_GUIDE_REPORT`) è **consigliata
prima** del retry. Non è bloccante per la sicurezza del retry stesso (ora fail-closed:
se le env non arrivano → 503, niente prod), ma chiude il rischio già aperto.
Bonus: dopo aver cambiato l'`APP_PIN` prod, il PIN `123456` resterà valido **solo** sullo
staging → diventa un ulteriore discriminante anti-prod.

---

## PIANO DI ESECUZIONE (quando autorizzi)

### 1. Build da `8c51909` con env staging esplicite (build-guard fail-closed attivo)
```bash
cd /Users/bigart/Downloads/LaDieciBotV2-github/ladieci-app33
export SITE_ID=a3ad035a-e73f-4da3-8873-6403e31f04b6
export REACT_APP_SUPABASE_URL=https://tdikhfeinufaahagmpjz.supabase.co
export REACT_APP_SUPABASE_ANON_KEY=<anon/publishable staging>   # non in chiaro nel report
CI=false npm run build
```
Atteso: `[guard-env-fail-closed] … OK`, `Compiled successfully`, `version.json` commit `8c51909`.

### 2. Deploy PREVIEW (no `--prod`) sul SOLO sito V1
```bash
cd /Users/bigart/Downloads/LaDieciBotV2-github
netlify deploy \
  --site a3ad035a-e73f-4da3-8873-6403e31f04b6 \
  --dir ladieci-app33/build \
  --functions ladieci-app33/netlify/functions
```
→ produce un **Draft URL** `https://<id>--ladieci-v1-staging.netlify.app`. Non tocca la
prod, non scatta la guardia (no `--prod`).

### 3. ANTI-PROD CHECK (obbligatorio, headless via curl) — usare discriminanti SOLO-staging
Sostituire `U` con il Draft URL.

| # | Test | Comando (estrae 1 campo) | PASS se |
|---|---|---|---|
| a | bundle env-split | `curl -s $U/version.json \| jq -r .commit` | `8c51909` |
| b | **proxy → Railway V1** | `getConfig` via proxy, estrai **solo** `PIZZERIA_NOME` | `La Dieci (STAGING)` |
| c | proxy ordini | `getOrdenes` via proxy | `[]` (staging) |
| d | **auth → Supabase staging** | `POST /api/auth {pin:"654321",role:"repartidor"}` | **token OK** (654321 è PIN repartidor SOLO staging; se rifiutato → auth su prod → STOP) |
| e | fail-closed sano | (controprova) se una env mancasse, la function deve dare **503**, mai prod | nessuna risposta con dati prod |

> ⚠️ NON usare `APP_PIN 123456` come prova di isolamento finché non ruoti l'APP_PIN prod:
> oggi `123456` funziona sia su staging sia su prod (coincidenza). Il discriminante
> affidabile è **`REPARTIDOR_PIN 654321`** (solo staging) e **`PIZZERIA_NOME`**.
> NON dumpare l'intero `getConfig`: estrarre solo `PIZZERIA_NOME` (con fail-closed il
> proxy o è staging o è 503, ma manteniamo l'abitudine prudente).

### 4. Frontend diretto → Supabase staging
Nel bundle, `REACT_APP_SUPABASE_URL` è inlineato da CRA = staging (build-guard garantisce
che un build non-prod senza env non compili). Conferma rapida senza browser:
```bash
grep -c tdikhfeinufaahagmpjz ladieci-app33/build/static/js/main.*.js   # >=1
```
(Verifica browser/network opzionale: tutte le `/rest/v1/...` su `tdikhfeinufaahagmpjz`.)

### Criterio GO/STOP
- **GO** (poi, in un task separato, planner Q5/Q2) **solo se** a=`8c51909`, b=`La Dieci (STAGING)`, c=`[]`, d=token OK.
- **STOP** se compare un qualunque dato prod, o se d (654321) viene rifiutato, o se le
  function danno 503 inatteso (env non arrivate → indagare prima di insistere).

---

## COSA È CAMBIATO RISPETTO A V1_07 (perché ora è sicuro ritentare)
- Allora: env appena impostate (possibile propagazione incompleta) + codice **fail-open**
  → functions cadute su prod, lette config/segreti prod.
- Ora: env **propagate e verificate** in tutti i contesti + codice **fail-closed** (`8c51909`)
  → se le env non arrivano, le functions rispondono **503**, **mai** prod. Il peggior
  esito del retry è un 503 diagnostico, non una fuga.

**STOP.** Nessun deploy eseguito. Esecuzione FASE 4 solo su tua autorizzazione esplicita.
Planner test/ordini: rimandati a task separato dopo isolamento confermato.
