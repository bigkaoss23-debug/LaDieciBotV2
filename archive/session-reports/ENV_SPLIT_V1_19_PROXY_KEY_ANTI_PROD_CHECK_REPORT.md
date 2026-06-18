# ENV_SPLIT_V1_19 — ALIGN PROXY API KEY + FINAL ANTI-PROD CHECK — REPORT

**Data:** 2026-06-17
**Scope:** SOLO Netlify V1 staging + Railway V1. NESSUNA modifica a production, Supabase prod, push main, ordini, planner.

---

## Esito sintetico

**PASS.** Allineata la API key del proxy V1 e il path proxy→backend autenticato ora
funziona (`getConfig`/`getOrdenes` → 200). Tutti gli anti-prod check verdi.
Production **non toccata** (verificato col checksum del valore team-wide e col lock).

---

## 1. Diagnosi chiavi

| Dove | Var | Lunghezza | sha256[:12] | Note |
|---|---|---|---|---|
| Railway V1 `fearless-reverence` | `DASHBOARD_API_KEY` | 61 | `20ec487f2e27` | chiave staging dedicata |
| Netlify **team-wide** (account `bigkaoss23`) | `RAILWAY_API_KEY` | 35 | `e3177bcf9745` | chiave PROD, `site_id=None`, contesto `all`, scope functions |

Il mismatch (35 vs 61) spiegava il `401` di V1_18: le functions V1 inviavano la
chiave prod a Railway V1, che la rifiutava.

**Railway V1 identificato senza ambiguità:** progetto `surprising-tenderness`,
servizio **`fearless-reverence`** (`4e481c9b…`) — distinto dal servizio prod
`ladieci_bot` (`221886cc…`, NON toccato). Conferme: `RAILWAY_PUBLIC_DOMAIN=
fearless-reverence-production-80bc…`, `SUPABASE_URL=tdikhfeinufaahagmpjz` (staging).

---

## 2. Allineamento (prod-safe, site-scoped)

La `RAILWAY_API_KEY` è **team-wide** e con contesto `all` → **anche le functions di
PRODUCTION la leggono**. Cambiarne il valore globale avrebbe rotto il proxy prod.
Quindi **override SOLO sul sito V1** (`a3ad035a`), non sul valore team-wide.

- `netlify env:set RAILWAY_API_KEY <V1 DASHBOARD_API_KEY>` sul sito V1 *linkato*
  (l'`env:set` senza link era no-op — limite noto del token).
- Valore preso da Railway V1 `DASHBOARD_API_KEY`, passato via variabile/file 600
  (mai in argv per la creazione payload), non stampato volontariamente.

### Verifica isolamento (checksum, nessun valore stampato)
| Sito | RAILWAY_API_KEY risolto | sha256[:12] | Esito |
|---|---|---|---|
| V1 `a3ad035a` | len 61 | `20ec487f2e27` | ✅ override applicato (= chiave V1) |
| PROD `02bd4c7a` | len 35 | `e3177bcf9745` | ✅ **invariato** (chiave prod) |

I due siti risolvono valori DIVERSI per la stessa chiave → l'override è scoped al
sito V1; il valore team-wide (prod) non è stato modificato.

### Redeploy
Le env runtime richiedono un redeploy. `createSiteBuild` sul sito V1 → deploy
`6a32fe22…`, **ready**, commit **`7102d0e`** (nessun cambio codice).

---

## 3. Final anti-prod check

| Check | Esito | Evidenza |
|---|---|---|
| version.json commit `7102d0e` | ✅ | HTTP 200, branch `backup/v1-env-split-backend-url-2026-06-17` |
| auth repartidor `654321` | ✅ | HTTP 200, role=repartidor, token |
| proxy `getConfig` → `PIZZERIA_NOME='La Dieci (STAGING)'` | ✅ | HTTP **200** (era 401), nome staging |
| proxy `getOrdenes` → 0 ordini staging | ✅ | HTTP 200, lista vuota (count 0) |
| bundle 0 `ladiecibot-production` | ✅ | grep `=0` su `main.1df9d29c.js` |
| bundle 0 `wnswassgfuuivmfwjxsf` | ✅ | grep `=0` |
| bundle ha `fearless-reverence` + `tdikhfeinufaahagmpjz` | ✅ | grep `=1` / `=1` |
| nessun **segreto prod** restituito | ✅ | getConfig: `ANTHROPIC_KEY`/`WA_ACCESS_TOKEN`/`WA_PHONE_ID`/`SUPABASE_KEY` NON esposti; 0 ref prod nel payload |
| zero ordini | ✅ | proxy getOrdenes=0; Supabase staging `ordenes` count `*/0` |
| zero write | ✅/ℹ️ | nessun ordine; unica write = upsert rate-limit `AUTH_BLOCK_*` su `config` **staging** ai login OK (benigno, non prod) |

---

## 4. Note di sicurezza / osservazioni

- ⚠️ **CLI ha stampato il valore** della `RAILWAY_API_KEY` V1 nel proprio messaggio
  di conferma `env:set`. È la **chiave dashboard di STAGING** (61 char, auto-etichettata
  `…_safe_only_staging`), **non un segreto prod**. Resta comunque nel transcript di
  questa sessione; ruotabile a piacere senza impatto prod. Per il resto: solo
  checksum, nessun valore stampato di proposito.
- ℹ️ `getConfig` espone `APP_PIN` (valore **staging** `123456`): comportamento
  pre-esistente del backend (l'app legge/modifica i PIN da lì), **non** introdotto
  qui e **non** un segreto prod.
- Production Netlify (`02bd4c7a`): `locked=True`, `repo_branch=None` (non git-linked),
  valore team-wide `RAILWAY_API_KEY` invariato → **intatta**.
- Railway prod `ladieci_bot`: non toccato (modificato solo `fearless-reverence`… in
  realtà su Railway V1 NON è stata fatta alcuna scrittura: l'allineamento è avvenuto
  lato Netlify col valore già esistente su Railway V1).
- `/tmp` slinkato da Netlify a fine sessione.

> Promemoria invariato: segreti prod esposti in V1_07 (`ANTHROPIC_KEY`,
> `WA_ACCESS_TOKEN`, `APP_PIN` prod) ancora da ruotare separatamente.

---

## 5. Conferme di perimetro

- ❌ Nessuna modifica a production (Netlify/Railway/Supabase). ❌ Nessun push main.
  ❌ Nessun ordine. ❌ Nessun planner Q5/Q2.
- ✅ Solo Netlify V1 (`a3ad035a`) + lettura Railway V1 (`fearless-reverence`).
- ✅ `ORDINI_2026-05-23.md` intoccato.
- ✅ Override `RAILWAY_API_KEY` scoped al solo sito V1; team-wide (prod) invariato.

**STOP. Nessun Q5/Q2.** Il proxy V1 staging è ora pienamente operativo e isolato.
