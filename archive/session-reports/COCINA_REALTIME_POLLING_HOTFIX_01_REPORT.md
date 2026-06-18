# COCINA_REALTIME_POLLING_HOTFIX_01 — REPORT

**Data:** 2026-06-15 (fuori servizio)
**Base:** `cb13736` (prod corrente) · **Branch:** `hotfix/prod-cocina-realtime-polling-2026-06-15` @ `2195c66` (worktree isolato, NON consolidation)
**Deploy:** ❌ NON eseguito — STOP prima del deploy, in attesa di autorizzazione.

---

## Bug corretto — "Cocina stantia"

`App.jsx` (cb13736, identico a 777ae55 per questo blocco):
```js
let wsConnected = false;
ws.onopen  = () => { wsConnected = true; ... }   // socket OPEN
ws.onclose = () => { wsConnected = false; ... }   // solo su CLOSE/ERROR
const fallbackPoll = setInterval(() => { if (!wsConnected) loadAll(); }, 5000);
```
Il poll girava **solo se `!wsConnected`**. Un socket **zombie** (aperto ma muto, senza `onclose` — sospensione laptop, blip Wi-Fi, timeout NAT) lasciava `wsConnected=true` e il polling **spento**: le card `EN_COCINA` comparivano in ritardo (solo quando per caso arrivava un altro evento DB). L'heartbeat (ogni 30s) inviava ma **non verificava** le risposte → lo zombie non veniva rilevato.

---

## Patch (1 file logico modificato + 2 util nuovi)

### `App.jsx` — `useEffect` realtime
1. **Safety poll SEMPRE attivo** (ogni 5s), a prescindere da `wsConnected`. Ricarica **in background `silent`** (nessun flicker su `syncStatus`) se i dati sono vecchi di oltre **`SAFETY_STALE_MS = 7000`**. → la Cocina non resta più stantia anche con socket zombie. Peggior caso di staleness ~7-12s.
2. **Realtime invariato** per l'aggiornamento immediato: quando consegna eventi, `lastLoadAt` è recente e il safety poll è un **no-op** (nessun doppio fetch).
3. **Watchdog socket-zombie** (`wsWatchdog`, ogni 10s): se siamo `wsConnected` ma non riceviamo **alcun** messaggio WS (nemmeno le risposte agli heartbeat) da oltre **`WS_SILENCE_MS = 35000`** → `ws.close()` → `onclose` ricollega dopo 3s + `loadAll`, risanando la subscription.
4. **`loadAll(opts)`** ora accetta `{silent:true}`: aggiorna `lastLoadAt` sempre, ma salta `setSyncStatus` quando silent → **nessun cambio grafico** (l'indicatore di sync si comporta come prima sugli eventi reali).
5. **Indicatore minimo** = `console.debug` non invasivo (`[cocina] safety-poll reload (stale Xs)`, `[cocina] ws-watchdog ... reconnect`). Scelto il log al posto del badge "Actualizado hace Xs" per rispettare il vincolo "nessun cambio grafico" sulla live. (Il badge visibile resta candidato per V1.)

### `src/utils/realtimeFreshness.js` (NUOVO) — predicati puri testabili
- `shouldSafetyReload(now, lastLoadAt, staleMs)` → ricaricare? (indip. dal WS)
- `isWsZombie(now, lastWsMsgAt, wsConnected, silenceMs)` → forzare reconnect?

### `src/utils/realtimeFreshness.test.js` (NUOVO) — 8 unit test

---

## Cosa NON è cambiato (vincoli rispettati)
- ❌ Nessun cambio grafico (solo console.debug; `silent` evita flicker di `syncStatus`).
- ❌ Nessun cambio al flusso ordine (loadAll, merge `_temp`/`pendingPatches`, filtri invariati).
- ❌ `TabCocina`/`PanelCocina` **non toccati** (filtro `EN_COCINA` invariato).
- ❌ Nessun backend / Railway / DB / schema.
- ❌ Nessun Planner UX / Nuevo Pedido V1 / Lab.

---

## Verifiche

| Check | Esito |
|---|---|
| Branch / base | `hotfix/prod-cocina-realtime-polling-2026-06-15` da `cb13736` ✅ |
| `git diff --stat cb13736` | **1 file** modificato (App.jsx +49/−8) + 2 util nuovi ✅ |
| File nel commit | SOLO `App.jsx`, `realtimeFreshness.js`, `realtimeFreshness.test.js` ✅ |
| Marker V1/Lab nei file toccati | tutti **0** ✅ |
| Unit test `realtimeFreshness.test.js` | **8 passed / 8** ✅ |
| Build `CI=false npm run build` | *Compiled successfully* — `main.ef049176.js` (222.92 kB gz) ✅ |

**Nota test runtime:** la logica di decisione è coperta dagli 8 unit test sui predicati puri. Il comportamento integrato (timer/reconnect) non è unit-testato qui per non rifattorizzare in modo invasivo l'`useEffect`; va osservato in staging/preview prima del deploy (es. simulando un socket muto → la card EN_COCINA deve comparire entro ~7-12s; nessun flicker dell'indicatore sync nei periodi tranquilli).

---

## Safety
- ✅ Zero deploy (STOP come richiesto) · zero DB write · zero cleanup · zero state change · zero push main.
- ✅ Worktree isolato da `cb13736`; `consolidation` e la sua working tree non toccati.
- ✅ Production live invariata: ancora `cb13736` / `6a2fab72f27a0e26497d4f4c`, locked.
- ✅ `ORDINI_2026-05-23.md` non toccato.

---

## Prossimo passo (richiede TUO OK esplicito)
Quando autorizzi: il deploy seguirà la stessa procedura del precedente (precheck diff 3 file, build, unlock→deploy `--site 02bd4c7a…`→re-lock, postcheck version=nuovo commit/marker V1 zero/backend intatto). Non procedo senza "vai / deploya". Branch di backup pronto: `2195c66`.
