# FRONTEND_USA_ESTA_HORA_BUG_A_FIX_01 — REPORT

**Data:** 2026-06-14
**Tipo:** Fix frontend BUG A — bottone "Usa esta hora" non appare (mismatch contract)
**Esito:** ✅ **OK — "Usa esta hora" appare con `recommended_hora`, gating invariato, zero write**
**Safety:** zero deploy · zero production · zero backend · zero DB write · zero cleanup · zero schema/migration · zero push main · zero Planner UX · WIP `PremiumPlannerPopup.jsx` non toccato · `ORDINI_2026-05-23.md` non toccato

---

## 1. Root cause

Nel render del riepilogo planner di `NuevoPedidoModal.jsx`, il bottone **"Usa esta hora"** era condizionato a:

```js
plannerRecommendation?.hora_proposta || plannerRecommendation?.suggested_hora
```

Il backend live `previewOrderPlanner` (commit `6e2b529`, deployment `d623be4a`) restituisce invece l'ora consigliata come **`recommendation.recommended_hora`** (vedi adapter too-early `96ec441`). Nessuno dei due campi letti dal frontend esisteva nel contract live → la condizione era sempre falsa → **bottone mai renderizzato**, pur essendoci un'ora consigliata valida.

`Usa giro compatible` (basato su `plannerGiro.slot_hora`) e il Confirmar gating (basato su `can_confirm_requested_hora`) erano **già corretti**, quindi il problema era isolato al solo bottone "Usa esta hora".

### Audit pre-patch (confermato sul codice)
1. `plannerRecommendation` costruito a `NuevoPedidoModal.jsx:1192` da `plannerPreview?.recommendation`.
2. "Usa esta hora" renderizzato a `NuevoPedidoModal.jsx:1675-1689`.
3. Campi usati: `hora_proposta || suggested_hora` (mancava `recommended_hora`).
4. "Usa giro compatible" a `:1690-1701`, usa `plannerGiro.slot_hora` → **non toccato**.
5. `setHoraFromOperator` (`:690`) = solo stato locale: `horaCustom.current=true; setHoraTouchedByOperator(true); setHora(nextHora)`. **Nessuna network.**
6. Click del bottone → solo `setHoraFromOperator(...)`. Nessun endpoint.
7. Confirmar gating (`:1218`) basato su `can_confirm_requested_hora === false` → **non toccato**.

---

## 2. File modificati

| File | Modifica |
|---|---|
| `ladieci-app33/src/components/NuevoPedidoModal.jsx` | +12/-5: derivato `plannerSuggestedHora` + uso nel render (BUG A) |
| `ladieci-app33/src/components/__tests__/usaEstaHora.static.test.mjs` | nuovo test statico (7 casi) |

**`PremiumPlannerPopup.jsx` NON toccato** (resta WIP pre-esistente nel working tree).

---

## 3. Patch fatta

Derivato compatibile, definito una sola volta accanto a `plannerRecommendation` (no duplicazione, no rename del contract backend):

```js
const plannerSuggestedHora = plannerRecommendation
  ? (plannerRecommendation.hora_proposta || plannerRecommendation.suggested_hora || plannerRecommendation.recommended_hora || null)
  : null;
```

Usato nel render block:
- condizione: `plannerOk !== false && plannerSuggestedHora && (...)`
- valore click: `const horaProposta = plannerSuggestedHora;` → `onClick={() => setHoraFromOperator(horaProposta)}`
- label `→ {horaProposta}` invariata.

Precedenza preservata: `hora_proposta` > `suggested_hora` > `recommended_hora` (i contract legacy continuano a vincere se presenti). Nessuna feature nuova, nessun endpoint, nessuna modifica a gating/giro/popup.

---

## 4. Test passati

### Test statici (replica 1:1 della logica del componente)
- **`usaEstaHora.static.test.mjs` → 7/7 PASS** (Test 1 + Test 2):
  - `recommended_hora` only → "Usa esta hora" **aparece** (= "21:45")
  - `hora_proposta`/`suggested_hora` legacy prevalgono → backward-compat
  - nessuna hora → bottone **non** appare
  - `giro.slot_hora` presente → **"Usa giro compatible" invariato** (slot_hora="21:50")
  - `ok=false` → nessun hint; `preview null` → niente
- **`confirmGating.static.test.mjs` → 9/9 PASS** (Test 3, non-regressione):
  - DOMICILIO too-early → BLOCKED · RITIRO too-early → BLOCKED
  - DOMICILIO/RITIRO valido → enabled · Q5 "no llega" (can_confirm true) → enabled (no falso-rosso)
  - ok=false / preview null → coerenti

### Test 4 — no DB write
- `setHoraFromOperator` è solo stato locale (ref + 2 setState) → **nessuna network al click**.
- Confirmar mai premuto, nessun ordine/manual_giro creato, nessun cambio stato.
- La patch non aggiunge alcuna chiamata fetch/api.

---

## 5. Build result

`CI=false npm run build` (da `ladieci-app33`): **Compiled successfully.**
- Bundle: `main.348a0026.js` (243.68 kB gzip, **+954 B** vs `main.e928fb23.js` di production).
- ⚠️ **WIP presente:** la build è stata fatta sul working tree corrente, che include il WIP pre-esistente `PremiumPlannerPopup.jsx` (M, non mio). Per questo il bundle differisce da production e **non è un artefatto deployabile pulito**. È una build di sola verifica di compilazione — **nessun deploy** previsto in questo step. Per un eventuale deploy futuro andrà ribuildato con WIP stashato.

---

## 6. Conferma zero DB write

✅ Nessuna chiamata di scrittura introdotta. Il fix tocca solo render condizionale + un handler locale (`setHoraFromOperator`). Nessun `api.post`, nessun create/update/delete/manual_giro, Confirmar mai premuto, nessun ordine creato. Backend production invariato (`d623be4a`), nessuna interazione con Railway/Supabase.

---

## 7. Conferma Confirmar gating invariato

✅ Il gating (`plannerBlocksConfirm` / `canConfirmOrder`) NON è stato toccato: resta basato su `can_confirm_requested_hora === false` + blocker `requested_hora_too_soon`. Test `confirmGating.static.test.mjs` 9/9 PASS confermano nessuna regressione (too-early disabled, validi enabled, Q5 no-llega enabled).

---

## 8. Git status

`/Users/bigart/Downloads/LaDieciBotV2-github`, branch `consolidation/nuevo-pedido-v1-unified-2026-06-09`:
- `M ladieci-app33/src/components/NuevoPedidoModal.jsx` ← patch BUG A (mia, +12/-5)
- `M ladieci-app33/src/components/PremiumPlannerPopup.jsx` ← WIP pre-esistente, **non mio**, non toccato
- `?? ladieci-app33/src/components/__tests__/usaEstaHora.static.test.mjs` ← test nuovo (mio)
- altri `??` = report markdown invariati; `ORDINI_2026-05-23.md` non toccato
- Nessun commit, nessun push.

---

## 9. Safety

| Vincolo | Stato |
|---|---|
| Zero deploy / production | ✅ |
| Zero backend / Railway | ✅ (resta `d623be4a`) |
| Zero DB write / cleanup / schema | ✅ |
| Zero push main / commit | ✅ |
| Zero Planner UX (popup, giro, gating) | ✅ |
| WIP `PremiumPlannerPopup.jsx` non toccato | ✅ |
| `ORDINI_2026-05-23.md` intatto | ✅ |

---

## Verdetto

✅ **OK** — "Usa esta hora" ora appare quando il backend manda solo `recommended_hora` (e mantiene la backward-compat con `hora_proposta`/`suggested_hora`); il click applica l'ora al draft locale via `setHoraFromOperator`; "Usa giro compatible" e Confirmar gating restano invariati (16/16 assert statici verdi); zero write.

**Nota verifica:** lo smoke è coperto da test statici che replicano 1:1 la logica del componente (non da smoke interattivo browser, che richiederebbe login PIN + risposta backend reale e rischierebbe stato live). La patch è confinata a render condizionale + handler locale.

**Nota build:** bundle non deployabile pulito (include WIP). Per deploy futuro: stashare `PremiumPlannerPopup.jsx`, ribuildare, verificare bundle pulito. Step di deploy NON parte di questo task.
