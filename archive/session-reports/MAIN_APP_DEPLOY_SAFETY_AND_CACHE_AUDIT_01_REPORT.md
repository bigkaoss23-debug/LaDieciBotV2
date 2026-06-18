# MAIN_APP_DEPLOY_SAFETY_AND_CACHE_AUDIT_01 — REPORT

**Data:** 2026-06-15 · **Tipo:** deploy-safety + cache audit (NO fix funzionali) · **STOP prima di deploy**
**Branch:** `safety/deploy-verify-and-cache-2026-06-15` @ `069c273` (worktree isolato, base `01bf952` = prod attuale)
**Production attuale:** `01bf952` / `6a3035026590241e2255ace3` / locked · login OK · V1 non live.

---

## Obiettivo
La vecchia app deve solo restare STABILE fino al rilascio V1. Niente nuovi fix funzionali; solo rete di sicurezza sul deploy + ottimizzazione cache statica.

---

## 1. Controllo automatico deploy (CREATO e collaudato)
**`ladieci-app33/scripts/verify-prod-deploy.sh`** — read-only, exit 0 = OK / exit 1 = ROTTO. Verifica sul sito vero:
- `/version.json` raggiungibile (+ commit).
- **`/api/auth` deve rispondere JSON, non HTML/404** (POST body vuoto → 400 json se la function c'è).
- **`/api/proxy` non 404** (senza token → 401).
- **marker V1/Lab nel bundle = zero** (ppp-opt3, ppp-detail, Sin giro compatible, Sin alternativa, PremiumPlannerPopup, PremiumProposalsLabPanel, ManualGiroSection, Giros y huecos).
- Stampa il **rollback target** (`6a3024ce…`/2195c66 → `6a2533b4`/777ae55) e il comando `restoreSiteDeploy` pronto.

**Collaudo su PROD live → tutto ✅, exit 0:**
```
✅ version.json ok (commit 01bf952)
✅ /api/auth funzione VIVA (http 400, json)
✅ /api/proxy viva (http 401)
✅ bundle senza marker V1/Lab (/static/js/main.803b633a.js)
✅ DEPLOY OK — login/functions vive, V1 zero.
```
→ Avrebbe **beccato il guasto del 2026-06-15** (`--dir=build` senza functions): `/api/auth` sarebbe stato ❌ e lo script avrebbe gridato "ROLLBACK". Da lanciare **subito dopo ogni deploy**: `scripts/verify-prod-deploy.sh`.

## 2. Audit cache headers statici
| Risorsa | Cache-Control attuale | Giudizio |
|---|---|---|
| `index.html` | `public, max-age=0, must-revalidate` | ✅ corretto (deve rivalidare per prendere i nuovi hash) |
| `/static/js/main.<hash>.js` | `public, max-age=0, must-revalidate` | ⚠️ sub-ottimale: l'asset è **content-hashed** → rivalidato a OGNI load (304 inutile) |
| `public/_headers` | presente (security headers `/*`) ma **senza** regola cache `/static/*` | ⚠️ manca l'immutable |

## 3. Patch proposta (CREATA, NON deployata — sicura)
**`public/_headers`** — aggiunto blocco (additivo, security headers `/*` invariati):
```
/static/*
  Cache-Control: public, max-age=31536000, immutable
```
- Sicuro: `/static/*` contiene solo file **content-hashed** (`main.<hash>.js/css`, `media/<hash>`) → cache eterna ok.
- `index.html` NON è sotto `/static/` → resta `must-revalidate` → un nuovo deploy fa prendere subito i nuovi hash.
- `service-worker.js` è a root → resta must-revalidate (corretto).
- **Build verificato:** `build/_headers` contiene la regola (CRA copia `public/_headers`).
- **Effetto:** dopo il prossimo deploy, gli asset `/static/*` non vengono più rivalidati a ogni apertura → caricamento app più rapido per i ritorni.

## Diff (01bf952..HEAD) — SOLO safety, niente codice funzionale
```
ladieci-app33/public/_headers              (M: + blocco /static/* immutable)
ladieci-app33/scripts/verify-prod-deploy.sh (nuovo: controllo post-deploy)
```
Nessun NuevoPedidoModal / Planner / V1 / backend / package.json toccato.

## Rollback target (documentato nello script)
`restoreSiteDeploy` → **`6a3024ce3b07a6d99692f0cd`** (2195c66, ha api+auth) → in cascata `6a2533b4` (777ae55).

## Safety
- ✅ STOP prima di deploy. Nessun production deploy / DB write / cleanup / push main / consolidation.
- ✅ NuevoPedidoModal vecchio / Planner / V1 / backend NON toccati.
- ✅ `ORDINI_2026-05-23.md` non toccato. Produzione invariata (`01bf952` / `6a3035…` locked).

## Prossimo passo (richiede TUO OK)
Quando autorizzi: deploy della `safety/...` (069c273) **completo di functions** (`--functions=…`) — porta in live l'immutable cache; lo script `verify-prod-deploy.sh` è già usabile da subito (è solo un tool locale, non serve deploy per lanciarlo). Procedura blindata + esecuzione automatica di `verify-prod-deploy.sh` come postcheck. Non procedo senza autorizzazione.
