# NUEVO_PEDIDO_PERFORMANCE_P1A_PATCH_01 — REPORT

**Data:** 2026-06-15 · **Tipo:** patch frontend-only LOW-RISK · **STOP prima di deploy/staging** (come richiesto)
**Branch:** `hotfix/prod-nuevo-pedido-performance-p1a-2026-06-15` @ `01bf952` (worktree isolato, base `2195c66`)

---

## Audit pre-patch (confermato su 2195c66)
- `resolveAddress` (effect): debounce **800ms**, **SENZA** guardia `cancelled` → race su risposte stantie.
- `previewOrderTiming` (effect): debounce **450ms**, **CON** `cancelled` flag già presente.
- I due effect partono sugli stessi trigger (indirizzo) con debounce sfasati.

## Patch applicata (scope rispettato)
File toccati (diff da 2195c66): **solo**
- `ladieci-app33/src/components/NuevoPedidoModal.jsx` (M)
- `ladieci-app33/src/utils/nuevoPedidoGeocode.js` (nuovo)
- `ladieci-app33/src/utils/nuevoPedidoGeocode.test.js` (nuovo)

Modifiche:
1. **Guardia anti-race su `resolveAddress`** — `createLatestOnly()`: ogni run dell'effect rende "corrente" una nuova richiesta e invalida le precedenti; nel callback async, prima di ogni `setZonaInfo`/`setZonaLoading` si controlla `isCurrent()`. Se l'operatore cambia indirizzo mentre una richiesta è in volo, **la risposta vecchia NON aggiorna più lo stato** (last-wins). Il `cleanup` chiama `cancel()` → niente update post-chiusura modal.
2. **Debounce allineato a ~600ms** (`GEOCODE_DEBOUNCE_MS`) per `resolveAddress` (era 800) e `previewOrderTiming` (era 450) → non partono più sfasati.
3. **`shouldGeocode()`** centralizza la condizione "quando geocodare" (no chiamata su indirizzo vuoto/corto, RITIRO, zona manuale) — comportamento invariato, solo più chiaro/testabile.

Vincoli rispettati:
- ❌ `resolveAddress` NON rimosso · ❌ contratto backend invariato · ❌ nessuna chiamata nuova
- ❌ nessun cambio layout/aspetto · ❌ nessun cambio flusso Confirmar/A Cocina
- I payload di `setZonaInfo` sono **identici** all'originale.

## Test / verifica
- **`nuevoPedidoGeocode.test.js` → 10/10** ✅:
  - risposta vecchia non aggiorna stato / ultima vince / out-of-order (solo l'ultima applica)
  - `cancel()` invalida la corrente (unmount)
  - input vuoto/corto/RITIRO/manuale → niente chiamata
  - debounce = 600
- Hotfix esistenti non rotte: `pedidosVisibility` 11/11 + `realtimeFreshness` 8/8 → **19/19** ✅
- **Build** `CI=false npm run build` → *Compiled successfully* (`main.803b633a.js`, 223.06 kB) ✅
- **Marker V1/Lab nel bundle → tutti 0** (ppp-opt3, ppp-detail, Sin giro compatible, Sin alternativa, PremiumPlannerPopup, PremiumProposalsLabPanel, ManualGiroSection) ✅
- Nessun dev server collegato al DB prod (non avviato).

## Effetto atteso (performance percepita)
- Meno chiamate sprecate mentre si digita l'indirizzo (debounce unico 600ms, niente doppio-fire sfasato).
- Niente "salti" del badge zona da risposte stantie out-of-order → UI più stabile.
- Zero rischio sul flusso ordine (nessun cambio di contratto/flow/UI).

## Safety
- ✅ Nessun deploy (STOP) · zero backend / DB write / cleanup / push main / consolidation / V1/Planner.
- ✅ Produzione invariata: `2195c66` / `6a3024ce3b07a6d99692f0cd` locked, login OK.
- ✅ `ORDINI_2026-05-23.md` non toccato.

## Prossimo passo (richiede TUO OK)
Quando vorrai: test runtime su **staging separato** (non sulla live), poi deploy production **completo di functions** (`--functions=…`, mai `--dir=build` da solo) con la procedura blindata e i postcheck `/api/auth`+`/api/proxy`. Branch pronto: `01bf952`. **Non procedo senza tua autorizzazione esplicita.**
