# PLANNER UX-1 — Frontend Runtime Smoke (03)

**Data:** 2026-06-14
**Branch:** `consolidation/nuevo-pedido-v1-unified-2026-06-09`
**HEAD:** `7557701` — fix show suggested hora action from recommended_hora
**Scope:** smoke read-only del mapping 3 slot di `PremiumPlannerPopup` dopo patch UX-1.
**Verdetto:** ✅ **OK** — mapping 3 slot corretto, `buildThreeOptions` non va ritoccato.

---

## 1. Recovery / preflight

Recupero dopo sessione interrotta. Stato confermato:

- **HEAD** = `7557701` (atteso) ✓
- **WIP UX-1 presente**: `ladieci-app33/src/components/PremiumPlannerPopup.jsx` modificato
  (`git diff --stat`: 173 ins / 386 del). Marker chiave verificati nel codice:
  - `buildThreeOptions` (riga 170)
  - bottoni `ppp-opt3` con `is-empty` / `is-active` (riga 291)
  - accordion `ppp-detail` (riga 309) con `RouteTimeline` + `MiniZoneMap` **on-demand**
  - guard `Array.isArray(opp.mapPath)` (riga 541)
  - `OPP_BLOCKED` esclude `blocked` / `no_recomendado` / `lleno` dai 3 slot (riga 167)
- **NuevoPedidoModal.jsx** non modificato ✓
- **Nessun file backend toccato** ✓
- **`ORDINI_2026-05-23.md`** non toccato ✓
- **Nessun** build / deploy / commit / push ✓

## 2. File temporanei trovati

- `ladieci-app33/src/components/PremiumPlannerPopup.smoke.test.js` — **harness della
  sessione precedente, già completo** (5 casi, render statico, `stripStyle`, parser DOM).
  Era esattamente il lavoro interrotto ("strip dello `<style>` + dump DOM reale" già implementato).
- `.tmp_grep` — directory **vuota** del 2026-06-06, **non legata** a questa sessione.
  Non toccata (mandato "no cleanup", pre-esistente).
- `ladieci-app33/src/components/__tests__/` — contiene `confirmGating.static.test.mjs` e
  `usaEstaHora.static.test.mjs` (feature precedenti, non di questa sessione). Non toccati.

## 3. Metodo smoke

- `ReactDOMServer.renderToStaticMarkup` su `PremiumPlannerPopup` con contract-fixture sintetici
  (`premium-planner-strategic-preview-v1`).
- Nessun browser, nessun backend, nessun DB, nessun Confirmar.
- `stripStyle()` rimuove il blocco `<style>` inline prima degli assert.
- Parser DOM puro che estrae i bottoni `ppp-opt3` (label / time / status / empty / active / disabled)
  e ispeziona il blocco `ppp-detail` (`ppp-rt` = RouteTimeline, `ppp-map-card` = MiniZoneMap).
- Esecuzione: `CI=true npx react-scripts test --watchAll=false --testPathPattern="PremiumPlannerPopup.smoke"`.

### Fix applicato all'harness (NON al componente)

Prima run: **4/5 falliti** — `parseOptions` ritornava `[]` perché il regex pretendeva
`<button class="ppp-opt3...`, mentre React (`renderToStaticMarkup`) emette `type="button"`
**prima** di `class`. Caso 5 "passava" solo perché non indicizza l'array opzioni.

Regex corretto in `PremiumPlannerPopup.smoke.test.js`:
```
/<button\b[^>]*?\bclass="ppp-opt3([^"]*)"([^>]*)>(.*?)<\/button>/gs
```
Dopo il fix: **5/5 PASS**. Il componente non è stato modificato per lo smoke.

## 4–5. Casi e risultati

| Caso | Directa | Giro | Alternativa | Detail (RT / map) |
|---|---|---|---|---|
| 1 — direct only | ✅ attiva `21:00` (compatible) | grigio/disabled `Sin giro compatible` | grigio/disabled `Sin alternativa` | RT sì · map **no** (Directa non ha opp) |
| 2 — giro compatible | ✅ `21:00` | ✅ `15:00` (compatible) | grigio/disabled | — |
| 3 — alternativa | ✅ `21:00` | ✅ `15:00` (compatible) | ✅ `15:00` (**ajuste**, ≠ giro) | — |
| 4 — no_recomendado/lleno | ✅ `21:00` | grigio/disabled | grigio/disabled | — |
| 5 — accordion | grigio/disabled `Sin directa` | ✅ `15:00` (sel) | grigio/disabled | RT **e** map nel detail |

Invarianti verificati su tutti i casi: `rtBeforeDetail=false`, `mapBeforeDetail=false`
→ né RouteTimeline né MiniZoneMap renderizzati nel top-grid; compaiono **solo** dentro
`ppp-detail`. `MiniZoneMap` appare solo quando la slot selezionata ha una `opp` (Caso 5);
con Directa selezionata (opp=null) la mappa è correttamente assente (casi 1–4).

- **Caso 2**: l'opportunity `no_recomendado`/blocked **non** entra in Giro né Alternativa.
- **Caso 4**: due opp blocked (`no_recomendado` + `lleno`) → entrambi gli slot restano disabled;
  nessun bottone primario mostra status `recomendado`/`llena`.
- **Caso 3**: Alternativa prende la prima opp valida **distinta** da quella usata come Giro.

## 6. Failure del mapping

Nessuno. L'unico fallimento iniziale era un bug del parser dell'harness (regex), risolto.

## 7. `buildThreeOptions` va ritoccato?

**No.** La logica dei 3 slot è corretta:
- Directa da `firstAvailable` (fallback `bestProposal`).
- Giro = prima opp `kind:"agregar"` non bloccata.
- Alternativa = prima opp non bloccata diversa dal giro.
- `OPP_BLOCKED` esclude `blocked` / `no_recomendado` / `lleno` dai primari.

## 8. Git status finale

```
 M ladieci-app33/src/components/PremiumPlannerPopup.jsx
?? ladieci-app33/src/components/PremiumPlannerPopup.smoke.test.js   (harness, TENUTO come regression test su scelta utente)
?? PLANNER_UX_1_FRONTEND_RUNTIME_SMOKE_03_REPORT.md                 (questo report)
?? (altri report markdown pre-esistenti, ORDINI_2026-05-23.md, ecc. — non toccati)
```
HEAD invariato: `7557701`.

> Nota: su decisione utente l'harness `PremiumPlannerPopup.smoke.test.js` è **tenuto** come
> test di regressione (resta untracked finché non si committa), coerente con i
> `*.static.test.mjs` già presenti in `__tests__/`. Non è stato rimosso.

## 9. Safety

- ✅ zero deploy
- ✅ zero commit / push
- ✅ zero backend
- ✅ zero DB write
- ✅ zero cleanup (`.tmp_grep` pre-esistente lasciata intatta)
- ✅ zero Netlify / Railway / production
- ✅ `ORDINI_2026-05-23.md` non toccato
- ✅ `NuevoPedidoModal.jsx` non toccato
- WIP UX-1 `PremiumPlannerPopup.jsx` intatto + harness regression tenuto
