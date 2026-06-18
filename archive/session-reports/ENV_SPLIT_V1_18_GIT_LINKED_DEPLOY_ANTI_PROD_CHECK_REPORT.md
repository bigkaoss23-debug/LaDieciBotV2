# ENV_SPLIT_V1_18 — GIT-LINKED DEPLOY + ANTI-PROD CHECK — REPORT

**Data:** 2026-06-17
**Scope:** SOLO Netlify V1 staging. NESSUN deploy prod, NESSUN push main, NESSUNA scrittura prod, NESSUN ordine, NESSUN planner test.

---

## Esito sintetico

**ANTI-PROD: PASS.** Il deploy git-linked V1 è live e isolato; le functions non
sono più in fail-closed (la patch generated env V1_17 funziona a runtime). Auth
staging OK. Zero ordini, zero scritture prod, zero leak prod.

**Nota operativa (fuori scope V1_17):** il path proxy→backend per le azioni
*autenticate* (es. `getConfig`) è bloccato da un **mismatch della `RAILWAY_API_KEY`**
nello store Netlify vs `DASHBOARD_API_KEY` di Railway V1 → backend risponde `401`.
NON è un leak prod (un target prod avrebbe *accettato* la chiave prod e restituito
dati): è un gap di **segreto**, da allineare nel prossimo step.

---

## 1. Pre-deploy

- Site V1 `ladieci-v1-staging` (`a3ad035a`) è git-linked a
  `github.com/bigkaoss23-debug/LaDieciBotV2`, production branch
  `backup/v1-env-split-backend-url-2026-06-17`, `allowed_branches` = stesso.
- PROD `magnificent-lollipop-6dff70` (`02bd4c7a`): `repo_branch=None`
  (NON git-linked), published deploy **locked=True**. Intoccata. ✅
- **Repoint del production branch via API**: tentato `updateSite` (build_settings /
  repo object) → **no-op silenzioso** con questo token (stessa limitazione vista in
  V1_07 sulle env account-level). 
- **Strategia git-linked usata**: il commit V1_17 `4e7204d` è discendente diretto di
  `8eb1474` (su cui era fermo il branch osservato). Ho **fast-forward** del branch
  osservato a `4e7204d`, che ha innescato il build git-linked automatico. (Idem il
  backup branch `backup/v1-generated-functions-public-env-2026-06-17`.)

### Build error su `4e7204d` → fix `7102d0e`
Il primo build (`4e7204d`) è andato in **error**:
`Incorrect function names. Name should consist of only alphanumeric characters,
hyphen & underscores`. Causa: il file generato `_publicEnv.generated.js` ha un
**punto** nel nome → Netlify lo valida come nome di function e lo rifiuta (`_env.js`
passava perché senza punto).

**Fix (commit `7102d0e`):** rinominato il file generato in **`_publicEnvGenerated.js`**
(niente punto). Aggiornati: generator, resolver `_env.js` (require), test, `.gitignore`.
28/28 test PASS, build staging locale PASS. Push fast-forward dei due backup branch a
`7102d0e` → nuovo build git-linked.

**Commit effettivamente deployato e verificato: `7102d0e`** (il target `4e7204d`
conteneva un bug di build bloccante, risolto da `7102d0e` che ne è il figlio).

---

## 2. Deploy

- Deploy id `6a32f89c6b449700080d8ff1`, branch
  `backup/v1-env-split-backend-url-2026-06-17`, commit `7102d0e`, **state: ready**.
- URL produzione del sito staging: `https://ladieci-v1-staging.netlify.app`.

---

## 3. Anti-prod check

| # | Check | Esito | Evidenza |
|---|---|---|---|
| 1 | version.json 200 + commit | ✅ PASS | HTTP 200, `commit=7102d0e`, branch corretto |
| 2 | bundle: 0 `ladiecibot-production` | ✅ PASS | grep `=0` su `main.1df9d29c.js` (776 KB) |
| 2 | bundle: 0 `wnswassgfuuivmfwjxsf` | ✅ PASS | grep `=0`; anche `02bd4c7a`=0 |
| 2 | bundle: contiene `fearless-reverence` | ✅ PASS | grep `=1` |
| 2 | bundle: contiene `tdikhfeinufaahagmpjz` | ✅ PASS | grep `=1` |
| 3 | auth repartidor `654321` | ✅ PASS | HTTP 200, role=repartidor, token, 12h |
| 4 | proxy getConfig → `PIZZERIA_NOME='La Dieci (STAGING)'` | ⚠️ PARZIALE | proxy raggiunge il backend ma Railway V1 risponde `401` (API-key mismatch). `PIZZERIA_NOME='La Dieci (STAGING)'` **confermato** via lettura read-only diretta su Supabase staging |
| 5 | proxy non restituisce config/segreti prod | ✅ PASS | nessun dato prod; `401` (non leak); APP_PIN/ANTHROPIC_KEY/WA_ACCESS_TOKEN non esposti |
| 6 | backend target = Railway V1 | ✅ PASS | generated `BACKEND_API_URL=fearless-reverence/api`; `/status` → `service=fearless-reverence`, `commit=193b818`; bundle 0 prod |
| 7 | Supabase target = staging | ✅ PASS | auth legge PIN staging (`654321` seed); `PIZZERIA_NOME` staging; bundle `tdikhfeinufaahagmpjz` |
| 8 | zero ordini / zero write | ✅/⚠️ | `ordenes`=0 (V1 `/status` `todayCount:0` + Supabase count `*/0`). **1 sola write benigna su STAGING**: il login OK chiama `clearFailures` → upsert `AUTH_BLOCK_<iphash>` nel `config` staging (metadato rate-limit, NON un ordine, NON prod) |

### Prova che il proxy NON fa leak prod
- Proxy **senza token** → errore *proprio* del proxy: `{"error":"token mancante"}`.
- Proxy **con token operador valido** → errore del *backend*: `{"error":"unauthorized"}`.
- Quindi: JWT verificato dal proxy → forward al backend → backend rifiuta la
  `X-Api-Key`. Se il target fosse prod con la chiave prod nello store, prod avrebbe
  risposto **200 + dati** (il fail-open di V1_07): non è successo. **Nessun leak.**

### Perché V1_17 è validato a runtime
`auth.js` ha risolto Supabase **staging** dal file generato (il PIN staging `654321`
funziona → `getPin` legge dal `config` staging). `api.js` usa lo **stesso**
`loadGenerated()`; il generator scrive le 3 chiavi insieme o fallisce. Quindi il
proxy punta a Railway V1. Niente più `503` fail-closed: la patch generated env
risolve il buco che lasciava le functions inoperative.

---

## 4. Gap residuo (prossimo step, fuori da V1_17)

**`RAILWAY_API_KEY` (store Netlify V1) ≠ `DASHBOARD_API_KEY` (Railway V1).** Le
azioni autenticate del proxy (getConfig, getOrdenes, ecc.) tornano `401` finché non
si allineano. È un **segreto server** (non una delle 3 config pubbliche di V1_17) →
va impostato separatamente sul backend Railway V1 o nello store del sito V1.
Non toccato qui (segreto + fuori scope + STOP dopo report).

> Promemoria invariato: segreti prod esposti in V1_07 (`ANTHROPIC_KEY`,
> `WA_ACCESS_TOKEN`, `APP_PIN` prod) ancora **da ruotare** separatamente.

---

## 5. Conferme di sicurezza

- ❌ Nessun deploy prod, ❌ nessun push su `main`, ❌ nessuna scrittura prod,
  ❌ nessun ordine creato, ❌ nessun planner test.
- ✅ PROD (`02bd4c7a`, `magnificent-lollipop-6dff70`) **locked** e non git-linked:
  invariata.
- ✅ `ORDINI_2026-05-23.md` intoccato.
- ✅ Nessun segreto stampato (anon key è pubblica; non stampate chiavi server).
- ✅ Deploy isolato su Railway V1 (fearless-reverence) + Supabase staging
  (tdikhfeinufaahagmpjz). `ordenes`=0.
- ℹ️ Unica write: 1 upsert rate-limit su `config` **staging** (login OK), benigna.
- ℹ️ Branch repoint via API = no-op col token attuale; usato fast-forward del branch
  git-linked osservato (entrambi i backup branch ora a `7102d0e`).

**STOP. Nessun planner Q5/Q2.**
