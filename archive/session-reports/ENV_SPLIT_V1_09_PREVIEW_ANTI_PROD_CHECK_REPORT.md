# ENV_SPLIT_V1_09 — PREVIEW ANTI-PROD CHECK REPORT

**Data:** 2026-06-17
**Esito:** ✅ **SICUREZZA OK (zero fuga su prod, fail-closed confermato)** / ❌ **isolamento
funzionante NON raggiunto** col deploy draft (le functions non ricevono le env utente → 503).
Nessun deploy prod, nessun ordine, nessun planner test, nessuna scrittura prod.

---

## ESECUZIONE

1. **HEAD** = `8c51909` (fail-closed). **Build** da `8c51909` con env staging:
   guard `OK`, `Compiled successfully`, `version.json` commit `8c51909`, bundle con ref staging.
2. **Deploy PREVIEW** (no `--prod`, solo sito V1 `a3ad035a`, `--functions` incluse):
   Draft URL `https://6a32c6e9570d19216af0ce06--ladieci-v1-staging.netlify.app`.
   Guardia anti-prod non scattata (no `--prod`).

---

## ANTI-PROD CHECK

| # | Test | Atteso | Reale | Esito |
|---|---|---|---|---|
| a | `version.json` commit | `8c51909` | `8c51909` | ✅ |
| d | auth repartidor `654321` (staging) | token | **503 config-error** (no token) | ⚠️ vedi sotto |
| — | auth PIN errato `999999` | errore | **503 config-error** | — |
| b | proxy `getConfig` → `PIZZERIA_NOME` | `La Dieci (STAGING)` | non raggiunto (proxy 503) | ⚠️ |
| c | proxy `getOrdenes` | `[]` da V1 | **503 config-error** | ⚠️ |
| — | chiamate a `wnswassgfuuivmfwjxsf` | 0 | **0** | ✅ |
| — | chiamate a `ladiecibot-production` | 0 | **0** | ✅ |

### Messaggi reali (fail-closed)
- **auth** → `config error: Config Supabase incompleta in deploy non-production (SITE_ID='a3ad035a-…'): manca SUPABASE_URL, SUPABASE_ANON_KEY/SUPABASE_KEY. Fail-closed: nessun fallback a Supabase prod.`
- **proxy** → `config error: BACKEND_API_URL mancante in un deploy non-production (SITE_ID='a3ad035a-…'). Fail-closed: nessun fallback al backend prod.`

---

## INTERPRETAZIONE

### ✅ Obiettivo sicurezza: RAGGIUNTO
La patch fail-closed (`8c51909`) ha funzionato **in condizioni reali**: con le env non
disponibili a runtime, le functions hanno risposto **503** invece di cadere su prod.
**Zero** chiamate a Railway prod / Supabase prod, **zero** lettura di config/segreti prod.
È esattamente il comportamento che mancava in `ENV_SPLIT_V1_07`.

### ❌ Root cause di V1_07: CONFERMATO
Il messaggio d'errore stampa `SITE_ID='a3ad035a-…'` → la function **riceve le var di
sistema Netlify** (`SITE_ID`, `CONTEXT`) ma **NON le env utente** (`BACKEND_API_URL`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY`). Quindi il **deploy draft via CLI bare
(`netlify deploy` senza `--build`)** non bakeа le env utente nella config delle functions
del deploy. Le env sono correttamente impostate sul sito (verificato in V1_06/08: tutti i
contesti + scope functions), ma un bare draft non le applica al runtime delle functions.

→ In V1_07 questo, unito al codice fail-open, causò la fuga su prod. Oggi, col
fail-closed, lo stesso buco produce solo un **503 diagnostico**.

---

## DECISIONE

Il 503 è **spiegato** (env utente non iniettate nel bare draft) e l'isolamento funzionante
non è dimostrabile con questo metodo → **STOP**, come da regola. **Nessun planner test.**

Anti-prod in senso stretto ("nessuna chiamata prod") = **PASS**. Ma l'app sul preview
**non è operativa** (503), quindi non posso confermare i check positivi (auth→staging,
proxy→V1) necessari prima del planner.

## PROSSIMO STEP RACCOMANDATO (richiede tua autorizzazione, resta in perimetro)
Ritentare il preview con un metodo che **inietti le env nelle functions**, **sempre senza
`--prod` e solo sul sito V1**:
```bash
# build server-side Netlify (inietta le env del sito), draft (no --prod)
netlify deploy --build --site a3ad035a-e73f-4da3-8873-6403e31f04b6
```
(oppure collegare il sito V1 a git per build con env iniettate). Poi ripetere questo
identico anti-prod check: atteso auth `654321`→token, proxy `getConfig`→`La Dieci (STAGING)`,
`getOrdenes`→`[]`. Se invece tornasse di nuovo 503 → indagare prima di insistere.

> Nota: con il fail-closed, ogni ulteriore tentativo è **sicuro** (peggior esito = 503,
> mai prod).

---

## CONFERME PERIMETRO
- Solo sito V1 `a3ad035a`, deploy **preview** (no `--prod`). Prod Netlify `02bd4c7a` non toccata.
- Nessuna chiamata a Railway prod / Supabase prod; nessuna scrittura; nessun ordine; nessun planner test.
- `123456` **non** usato come prova (usato `654321` repartidor come discriminante).
- Nessun segreto stampato. `ORDINI_2026-05-23.md` non toccato. `main` non pushato.

**STOP.**
