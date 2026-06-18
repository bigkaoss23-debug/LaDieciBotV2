# ENV_SPLIT_V1_11 — ALLOW_V1 PREVIEW / ANTI-PROD CHECK — REPORT

**Data:** 2026-06-17
**Esito:** ⛔ BLOCCATO in FASE 1 — STOP per inconsistenza di isolamento (env account-level shared). Nessun deploy eseguito. Production intoccata.

---

## FASE 0 — Preflight: PASS

| Check | Atteso | Riscontrato | Esito |
|---|---|---|---|
| Repo | LaDieciBotV2-github | LaDieciBotV2-github | ✅ |
| Branch | consolidation/nuevo-pedido-v1-unified-2026-06-09 | idem | ✅ |
| HEAD | 8c51909 | 8c51909dab4dab000d52ff80afc70fd967e9f2ee | ✅ |
| File tracciati modificati | nessuno | nessuno (solo report untracked) | ✅ |
| PROD site | 02bd4c7a / magnificent-lollipop-6dff70 | confermato | ✅ |
| PROD published deploy | 6a303f3d | 6a303f3d6163c6482cc531cd | ✅ |
| PROD locked | true | **true** | ✅ |
| V1 site | a3ad035a / ladieci-v1-staging | confermato, esiste | ✅ |

**Nota trappola CLI:** la CLI locale (`netlify status`) è linkata al sito **PRODUCTION** `02bd4c7a`. Tutti i comandi sono stati eseguiti con `--site a3ad035a` esplicito. Mai usato il link locale, mai `--prod`.

---

## FASE 1 — Impostare ALLOW_V1 solo su V1: FALLITA (per design del team Netlify)

### Cosa è successo
1. Stato iniziale: `ALLOW_V1` **assente** su entrambi i siti.
2. Eseguito `netlify env:set ALLOW_V1 1 --site a3ad035a` → CLI risponde "Set ... in the **all context**".
3. Verifica post-set: `ALLOW_V1=1` **comparso ANCHE su PRODUCTION** `02bd4c7a`.
4. Indagine via API (`getEnvVars`): la variabile è stata creata con **`site_id: None` = variabile ACCOUNT-LEVEL SHARED**, ereditata da TUTTI i siti del team, prod incluso.
5. **Revert immediato:** `netlify env:unset ALLOW_V1 --site a3ad035a`. Verificato: `ALLOW_V1` di nuovo **assente su entrambi**. Stato pulito ripristinato.

### Root cause
Il team Netlify `bigkaoss23 / AppPan` usa il modello **"shared environment variables"**: le env sono a livello account (`site_id: null`) e condivise tra tutti i siti. Il flag `--site` della CLI **non** scopa la variabile al singolo sito → `ALLOW_V1` finirebbe sempre anche su production.

La "opzione 3" del piano (ALLOW_V1 solo sul sito V1) **non è realizzabile** con `netlify env:set --site` in questo account.

---

## ⚠️ FINDING SECONDARIO — isolamento env parziale (da verificare con l'utente)

Durante l'indagine ho visto che anche `JWT_SECRET` e `RAILWAY_API_KEY` hanno **`site_id: None` (shared)**. Questo suggerisce che le env "staging" impostate nei task precedenti (`BACKEND_API_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, ecc.) siano **anch'esse account-level shared**, e quindi presenti nel namespace env della PRODUCTION.

**Rischio pratico attuale: BASSO ma non nullo.**
- Le env agiscono **solo su nuovi build**. Il deploy prod è `locked` e non verrà ricostruito → il deploy pubblicato prod NON è influenzato.
- MA: se in futuro qualcuno triggera un rebuild del sito prod, il suo namespace env conterrebbe valori che puntano a staging (backend fearless-reverence, Supabase tdikhfe...). Va sanato.

> ⚠️ Non ho dumpato l'elenco completo env di prod (azione bloccata correttamente dal classifier come fuori-scope/lettura config prod). La conferma puntuale richiede approvazione esplicita.

---

## FASE 2 e FASE 3 — NON eseguite
- Nessun `netlify deploy` eseguito.
- Nessun preview URL generato.
- Nessun anti-prod check (non c'è preview da testare).
- Nessun ordine, nessuna scrittura, nessun planner test, nessun WhatsApp.

---

## Conferme di sicurezza
- ✅ Production frontend **intoccata**: deploy `6a303f3d` ancora `locked`.
- ✅ `ALLOW_V1` **assente** su prod e su V1 (revert completato).
- ✅ Nessun deploy, nessun build, nessun `--prod`.
- ✅ Nessun ordine / nessuna scrittura DB.
- ✅ Railway prod e Supabase prod non toccati.
- ✅ `ORDINI_2026-05-23.md` non toccato.
- ⚠️ Inavvertitamente stampati a video (durante debug API) i valori di `JWT_SECRET` e `RAILWAY_API_KEY` staging — sono segreti di **staging**, non prod, ma andrebbero comunque considerati per rotazione se si vuole massima igiene.

---

## DECISIONE RICHIESTA ALL'UTENTE (STOP qui)

Per fornire `ALLOW_V1=1` **solo** al build del sito V1 senza contaminare prod, le opzioni sono:

- **Opzione A — env inline solo a build-time (consigliata):** passare `ALLOW_V1=1` come variabile del processo di deploy (`ALLOW_V1=1 netlify deploy --build --site a3ad035a`), effimera, mai salvata su alcun sito. Isola al 100% (build singolo, sito V1). NB: nel task ENV_SPLIT_V1_10 l'harness aveva bloccato l'inline come "bypass" → serve tua autorizzazione esplicita perché qui è l'uso legittimo previsto.
- **Opzione B — vera env site-specific via API:** verificare se il team supporta env per-sito (`site_id` impostato) e crearla via API REST con scope sito. Richiede più lavoro API e conferma che il piano del team lo permetta.
- **Opzione C — guard riconosce il sito V1:** modificare `guard-no-lab-markers.js` per riconoscere il `SITE_ID`/`SITE_NAME` iniettato da Netlify invece di `ALLOW_V1`. **Sconsigliata** — viola la regola "non editare hook/guardia".

**Prossimo step consigliato:** decidere A/B/C. Solo dopo build+preview+anti-prod PASS si passerà al planner Q5/Q2 isolated test (NON in questa sessione).
