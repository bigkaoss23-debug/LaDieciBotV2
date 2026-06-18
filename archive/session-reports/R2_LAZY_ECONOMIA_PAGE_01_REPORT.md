# R2_LAZY_ECONOMIA_PAGE_01 — REPORT

**Data:** 2026-06-15 · **Tipo:** patch frontend-only (code-split) · **STOP prima di deploy**
**Branch:** `hotfix/prod-lazy-economia-page-2026-06-15` @ `60c8952` (worktree isolato, base `069c273` = prod attuale)

---

## Obiettivo
Ridurre il bundle iniziale **senza cambiare il comportamento dati**: lazy-load di `EconomiaPage`, così il suo codice non entra nel bundle principale scaricato da Servizio/Delivery.

## Patch (1 solo file: `App.jsx`)
1. Import statico `EconomiaPage` → **`const EconomiaPage = lazy(() => import('./components/EconomiaPage'))`** (+ `lazy, Suspense` da react).
2. Render avvolto SOLO per Economia in **`<Suspense fallback={…}>`** con fallback leggero ("Cargando economía…", stile tema scuro).
3. **Nessun** cambio a: quando parte `getStorico`, URL/screen logic, Delivery/`loadAll`, NuevoPedidoModal, Planner/V1, backend.

## Verifica (build-level)
- **Build** `CI=false npm run build` → *Compiled successfully* ✅
- **Code-split confermato:**
  | | gz |
  |---|---|
  | main bundle (prima, 069c273) | 223.06 kB |
  | main bundle (dopo) `main.5cd6cd6c.js` | **213.95 kB** (−~9 kB) |
  | chunk Economia `303.4721c72c.chunk.js` (on-demand) | **12.78 kB** |
- **EconomiaPage è nel CHUNK, non nel main:** stringa UI `Ticket medio` → main:0, **chunk:3**; `giorniDettaglio` → main:1 (solo il metodo `api.getStorico`), chunk:8.
- **`getStorico` data-fetch invariato:** resta nel `useEffect` di `EconomiaPage` (`EconomiaPage.jsx:481`), parte solo al mount (`screen==="economia"`). Il `getStorico ×1` nel main è il **metodo `api.getStorico`** in `api.js` (globale, sempre nel main — non è la chiamata).
- **Marker V1/Lab nel build → 0** (ppp-opt3, PremiumPlannerPopup, ManualGiroSection).
- **diff da 069c273 → solo `App.jsx`.**
- functions `auth.js`+`api.js` presenti (non toccate).

## Effetto atteso
- Servizio/Delivery: bundle iniziale **~9 kB gz più leggero** (niente codice Economia da scaricare/parsare all'avvio).
- Economia: entrando, React carica il chunk `303.*.chunk.js` (12.78 kB) e poi `getStorico` come prima. Differenza di UX: un brevissimo fallback "Cargando economía…" mentre arriva il chunk (rete permettendo, impercettibile in cache).
- **getStorico NON parte su Servizio/Delivery** (era già così; la patch non cambia il *quando* del fetch, solo il *quando* del caricamento del codice).

## Nota su verifica runtime
Il *timing* del fetch è strutturalmente invariato (lo stesso `useEffect` di prima): la patch sposta solo il **caricamento del codice**, non l'esecuzione. Un eventuale smoke runtime (instrumentazione `fetch` come in P1A) confermerebbe che `getStorico` parte solo entrando in Economia e che il chunk `303` viene scaricato solo lì — da fare come step separato prima del deploy, se vuoi.

## Safety
- ✅ Nessun deploy (STOP) · zero DB write / backend / cleanup / push main / consolidation.
- ✅ Niente NuevoPedidoModal / Planner / V1 / Delivery-loadAll / URL-screen logic.
- ✅ Produzione invariata: `069c273` / `6a303f3d6163c6482cc531cd` locked, login OK.
- ✅ `ORDINI_2026-05-23.md` non toccato.

## Prossimo passo (richiede TUO OK)
Opzionale smoke runtime su staging, poi deploy production **completo di functions** (`--functions=…`) con i postcheck e `verify-prod-deploy.sh`. Branch pronto: `60c8952`. Non procedo senza autorizzazione.
