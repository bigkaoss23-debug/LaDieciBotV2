# NUEVO_PEDIDO_PERFORMANCE_P1A_RUNTIME_SMOKE_02 — REPORT

**Data:** 2026-06-15 · **Tipo:** runtime smoke su preview locale del worktree P1A — NON production.
**Branch:** `hotfix/prod-nuevo-pedido-performance-p1a-2026-06-15` · commit `01bf952` · base `2195c66`.

---

## VERDETTO: ✅ OK
Tutti i 6 comportamenti attesi confermati a runtime · solo letture/preview · **zero write DB** · **zero errori console**.

---

## Precheck
- Branch `hotfix/prod-nuevo-pedido-performance-p1a-2026-06-15` · HEAD **`01bf952`** ✅
- `git diff --name-only 2195c66..HEAD` → SOLO `NuevoPedidoModal.jsx` + `utils/nuevoPedidoGeocode.js` + `utils/nuevoPedidoGeocode.test.js` ✅
- Test: `nuevoPedidoGeocode` 10/10 + `pedidosVisibility` 11/11 + `realtimeFreshness` 8/8 = **29/29** ✅
- Build già verde (turno patch).

## Setup smoke — read-only by design
- `netlify dev` (porta 8899) sul codice del worktree P1A (necessario per il login). Login via **dev-bypass ufficiale** dell'app (sessione già autenticata, nessuna forgiatura).
- **Indirizzi già in `geo_cache`** ("Av. Playa Serena 33" Q5, "CALLE PORTUGAL, 3" Q1) → `resolveAddress`/`previewOrderTiming` = **cache-hit = lettura**, nessuna geocodifica nuova → **niente write su geo_cache**.
- `fetch` instrumentato (read-only) per loggare ogni POST `/api/proxy` con action+timestamp e distinguere `resolveAddress` da `previewOrderTiming`.
- Navigato senza `?dev=1` → DevHeartbeat (unica write al mount) non parte. Confirmar mai premuto.

## Risultati per test
| # | Caso | Atteso | Esito |
|---|---|---|---|
| 1 | **RITIRO** (no indirizzo) | `resolveAddress` NON parte | ✅ log = solo `GET` + `previewOrderTiming` |
| 2 | **DOMICILIO indirizzo corto** ("Cu") | nessuna chiamata | ✅ log **vuoto** (né resolve né timing: gated <5 char) |
| 3 | **DOMICILIO indirizzo reale** ("Av. Playa Serena 33") | una `resolveAddress` dopo debounce | ✅ `resolveAddress: 1`, `previewOrderTiming` ok |
| 4 | **Cambio indirizzo veloce** (Portugal→Playa Serena entro 150ms) | debounce collassa, **ultima vince** | ✅ `resolveAddress: 1` (collassata) e zona mostrata = **Q5** (ultimo indirizzo), **non Q1** (vecchio) |
| 5 | **previewOrderTiming** | continua a funzionare | ✅ parte regolarmente (test 1/3/4) |
| 6 | **Confirmar** | non premuto | ✅ mai cliccato |

Nota test #3: `previewOrderTiming` parte 2 volte (1ª su indirizzo, 2ª quando l'auto-hora aggiorna `hora`) — comportamento **pre-esistente** in 2195c66, non introdotto dalla patch.

## Network (tutta la sessione)
- `POST /api/auth` ×1 (login dev-bypass, NON una write DB).
- `POST /api/proxy` ×6 (tutte `resolveAddress`/`previewOrderTiming` = preview/read su indirizzi cached).
- **ZERO `createOrden` / `updateEstado` / `setConfig` / `eliminaOrdine`** ovunque.
- **ZERO POST/PATCH/DELETE diretti su Supabase `/rest/v1`** (nessuna write DB diretta).

## Console
- **Zero errori** (`level=error` vuoto). Solo `[SMOKE]` (instrumentazione) e i `[cocina] safety-poll` (hotfix Cocina già nel base 2195c66, benigni).

## Conclusione
La patch P1A si comporta a runtime come progettato: gating corretto (RITIRO/indirizzo corto non chiamano), debounce che collassa i cambi rapidi in **una** chiamata, e **last-wins** verificato (la zona finale riflette l'ultimo indirizzo, non quello vecchio). `previewOrderTiming` invariato. Nessuna write, nessun errore.

## Safety
- ✅ Nessun production deploy / DB write / cleanup / push main / consolidation / V1.
- ✅ Produzione invariata: `2195c66` / `6a3024ce3b07a6d99692f0cd` locked, login OK.
- ✅ `ORDINI_2026-05-23.md` non toccato.
- ✅ A fine sessione: server fermato; `.env` copiato nel worktree (segreti) **rimosso**; worktree pulito a `01bf952`.

## Prossimo passo (richiede TUO OK)
Patch pronta e validata a runtime. Deploy production **completo di functions** (`--functions=…`) con procedura blindata + postcheck `/api/auth`+`/api/proxy`, **solo su tua autorizzazione esplicita**. Branch: `01bf952`.
