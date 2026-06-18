# FRONTEND CONFIRMAR GATING — AUDIT 01 — REPORT

**Data:** 2026-06-14
**Scope:** SOLO frontend `NuevoPedidoModal.jsx`. Nessun backend / deploy / commit / push / migration / cleanup.
**Ambiente verifica:** netlify dev :8888 (PROD `.env` → Railway + Supabase). Backend live ≈ `96ec441`.
**Verdetto:** ✅ **OK** — Confirmar ora si blocca sui casi hard (too-early RITIRO + DOMICILIO), senza falsi-rossi sugli ordini confermabili.

---

## 1. Root cause

Il bottone `Confirmar` usava solo `ok` (requisiti base form):

```js
// PRIMA
const ok = items.length > 0 && nombre.trim().length > 0 && zonaAssegnata && (!yaPagedo || metodoPago !== "");
...
<button disabled={!ok || submitting} />
```

`ok` **non** consultava il planner preview, già disponibile nel componente (`plannerPreview`,
fetch read-only `previewOrderPlanner`, stato a `NuevoPedidoModal.jsx`). Quindi un ordine
con `recommendation.can_confirm_requested_hora === false` (too-early / hora non realizzabile)
restava confermabile: l'inline mostrava solo un avviso giallo, ma il bottone era verde.
Bug critico: l'operatore poteva creare un ordine che il backend dichiara non confermabile.

### Contract reale del planner (catturato live 2026-06-14)

| Caso | input | `can_confirm_requested_hora` | blocker code | `ok` (contract) |
|------|-------|------------------------------|--------------|-----------------|
| A — Q1 21:35 valido        | DOMICILIO | **true**  | — | true |
| B — Q2 21:40 driver-conflict | DOMICILIO | **true**  | `separate` "no llega a la hora pedida" | true |
| C — Q5 21:55 far            | DOMICILIO | **true**  | `separate` "no llega a la hora pedida" | true |
| D — too-early DOMICILIO     | DOMICILIO | **false** | `separate` (msg "muy pronta") | true |
| D — too-early RITIRO        | RITIRO    | **false** | `requested_hora_too_soon` | true |
| E — RITIRO valido           | RITIRO    | **true**  | — | true |

**Due scoperte chiave dell'audit:**
1. **`contract.ok` è `true` anche quando `can_confirm_requested_hora` è `false`** → `plannerOk`
   (= `plannerPreview.ok !== false`) NON è un segnale di blocco affidabile. Il segnale
   autoritativo è `recommendation.can_confirm_requested_hora`.
2. **Il blocker `separate` / "no llega a la hora pedida" appare in B e C con
   `can_confirm_requested_hora = true`** (esiste un giro compatibile). Bloccare sul
   messaggio "no llega" → **falso-rosso** su ordini che il backend considera confermabili.
   → Il gate hard deve basarsi su `can_confirm_requested_hora === false`, NON sul testo "no llega".

---

## 2. Patch (fatta) — frontend-only

File: [`NuevoPedidoModal.jsx`](ladieci-app33/src/components/NuevoPedidoModal.jsx) (+33 righe nette, 3 punti).

**(a) Derivati di gating** (dopo i derivati planner esistenti, ~riga 1206):
```js
const plannerBlocksConfirm = plannerRecommendation
  ? (plannerRecommendation.can_confirm_requested_hora === false
     || plannerBlockers.some(b => b?.code === "requested_hora_too_soon"))
  : false;
const confirmBlockReason = plannerBlocksConfirm
  ? (plannerBlockers[0]?.message
     || (plannerRecommendation?.reason === "requested_hora_too_soon"
          ? "Hora pedida muy pronta · usa la hora sugerida o cambia hora"
          : "Hora no confirmable · revisa el planner"))
  : "";
const canConfirmOrder = ok && !plannerBlocksConfirm;
```

**(b) Bottone** ([:1865](ladieci-app33/src/components/NuevoPedidoModal.jsx#L1865)): `disabled={!ok…}` → `disabled={!canConfirmOrder…}` (anche lo style).

**(c) Difesa in profondità** in `handleConfirm` ([:447](ladieci-app33/src/components/NuevoPedidoModal.jsx#L447)): `if (plannerBlocksConfirm) return;`.

**(d) Motivo leggibile** in footer ([:1825](ladieci-app33/src/components/NuevoPedidoModal.jsx#L1825)), stesso pattern di "Zona no detectada":
```jsx
{plannerBlocksConfirm && (
  <small style={{ color: "#fca5a5", fontWeight: 800 }}>🚫 {confirmBlockReason}</small>
)}
```

### Decisioni di design
- **`canConfirmOrder`** è il gate unico del bottone (= `ok` + `!plannerBlocksConfirm`).
- **`timingBlocksConfirm` valutato e scartato di proposito.** `backendTiming` (previewOrderTiming)
  NON espone un array `blockers` né un segnale too-early affidabile (il forno naïve può restare
  nel passato). Casi B/C hanno `driver.has_conflict=true` ma `can_confirm_requested_hora=true`:
  un gate basato su `backendTiming.driver` causerebbe falsi-rossi. Il planner è la fonte di
  verità → un gate timing separato è stato escluso per non regredire. (Segnalo lo scostamento
  dalla richiesta letterale: nel codice reale non esiste `backendTiming.blockers`.)
- **"no llega a la hora pedida" da solo NON blocca**: con `can_confirm=true` c'è un giro
  compatibile (B/C) → resta confermabile, mostrato come review nel pannello planner esistente.
- **Preview non disponibile/non caricata** (`plannerRecommendation === null`) → `plannerBlocksConfirm=false`:
  il form NON si congela, si ricade sul comportamento legacy `ok`. Non-regressivo.

---

## 3. File modificati / aggiunti

| File | Tipo | Modifica |
|------|------|----------|
| `ladieci-app33/src/components/NuevoPedidoModal.jsx` | M | gating Confirmar (33 righe) |
| `ladieci-app33/src/components/__tests__/confirmGating.static.test.mjs` | ?? (nuovo) | test statico standalone |
| `FRONTEND_CONFIRMAR_GATING_AUDIT_01_REPORT.md` | ?? (nuovo) | questo report |

*(`PremiumPlannerPopup.jsx` risulta `M` ma è WIP preesistente, NON toccato in questa sessione.)*

---

## 4. Test

### 4.1 Test live (browser preview, ordini NON creati)
Reload completo per bundle fresco, poi Servizio → NUEVO PEDIDO. Stato verificato via DOM
(`button.np-confirm.disabled` + `<small>🚫</small>`).

| # | Caso | Input | Confirmar | Motivo | Esito |
|---|------|-------|-----------|--------|-------|
| 1 | DOMICILIO too-early (`planner_ui_confirm_D.png`) | Q1 12:10, nome, 1 pizza | **disabled** | 🚫 "Hora pedida muy pronta · mínimo 12:48 (cocina + andata)" | ✅ PASS |
| 2 | DOMICILIO valido (A) | Q1 21:35, nome, 1 pizza | enabled | — | ✅ PASS |
| 3 | Q5 "no llega" (C) | Las Marinas 21:55, nome, 1 pizza | enabled (review, non blocco) | — | ✅ PASS |
| 4 | RITIRO too-early (D) | hora 12:36, nome, 1 pizza | **disabled** | 🚫 "Hora pedida muy pronta · mínimo 12:42 (cocina)" | ✅ PASS |
| 5 | RITIRO valido (E) | hora 21:00, nome, 1 pizza | enabled | — | ✅ PASS |

Note: nei casi too-early `ok` era **true** (nome + prodotto presenti) → prova che è il
**gate planner** a bloccare, non i requisiti base. Confirmar NON è mai stato cliccato → zero
ordini creati. Zero errori console. HMR/compilazione dev passata.

### 4.2 Test statico mirato
[`confirmGating.static.test.mjs`](ladieci-app33/src/components/__tests__/confirmGating.static.test.mjs)
— replica 1:1 la logica `deriveConfirmGate` e l'asserisce contro le fixture dei contract reali.
Eseguibile con `node confirmGating.static.test.mjs` (il progetto non ha harness/`test` script).

```
✅ A Q1 valido → enabled
✅ B Q2 driver-conflict (giro) → enabled
✅ C Q5 no-llega (giro) → enabled
✅ D DOMICILIO too-early → BLOCKED
✅ D RITIRO too-early → BLOCKED
✅ E RITIRO valido → enabled
✅ A valido ma ok=false → not confirmable
✅ preview null + ok=true → enabled
✅ preview null + ok=false → not confirmable
9/9 test passati
```

### 4.3 Casi richiesti dallo spec — copertura
1. DOMICILIO too-early → disabled + motivo ✅ (live #1 + statico)
2. DOMICILIO valido → enabled ✅ (live #2 + statico)
3. Q5 blocker "no llega" → enabled con review (can_confirm=true; bloccare = falso-rosso) ✅ — vedi §2 design
4. RITIRO valido → enabled, no driver contamination ✅ (live #5 + statico)
5. Preview unavailable → non regressivo (non blocca) ✅ (statico: preview null)

---

## 5. Rischio regressione

| Scenario | Comportamento | OK? |
|----------|---------------|-----|
| RITIRO valido | can_confirm=true → enabled | ✅ no regressione |
| DOMICILIO valido | can_confirm=true → enabled | ✅ |
| manual hora operatore valida | gate solo su can_confirm | ✅ |
| giro compatible (B/C) | can_confirm=true → enabled | ✅ no falso-rosso |
| preview non caricata | plannerRecommendation null → non blocca | ✅ no freeze |
| backend preview non disponibile | plannerPreview null → fallback `ok` legacy | ✅ |

Nota tecnica: `handleConfirm` (riga ~447) referenzia `plannerBlocksConfirm` dichiarato più
sotto nello stesso scope del componente. È valido: il guard viene valutato al click (post-render),
quando la const è inizializzata. Confermato dalla compilazione dev senza errori e dal test live.

---

## 6. Safety

- ✅ Solo frontend (`NuevoPedidoModal.jsx`) + 1 test + 1 report. Nessun backend.
- ✅ Nessun deploy / commit / push / migration.
- ✅ Nessun cleanup; ordini TEST #001–#012 + manual giro `mg_260614_1` intatti.
- ✅ Confirmar **mai cliccato** in nessun test → zero ordini creati.
- ✅ `ORDINI_2026-05-23.md` non toccato.
- ✅ BUG A ("Usa esta hora") NON modificato (fuori scope).
- ✅ Tutte le preview backend usate erano read-only (`safety.writes:false`).

### git status (fine sessione)
```
 M ladieci-app33/src/components/NuevoPedidoModal.jsx     ← patch di questa sessione
 M ladieci-app33/src/components/PremiumPlannerPopup.jsx  ← WIP preesistente (non toccato)
?? HANDOFF_staging_b8d89e4.md
?? ORDINI_2026-05-23.md
?? PLANNER_UI_INSPECTION_WITH_EXISTING_TEST_DATA_02_REPORT.md
?? FRONTEND_CONFIRMAR_GATING_AUDIT_01_REPORT.md
?? ladieci-app33/src/components/__tests__/
```

---

## 7. Verdetto finale

✅ **OK** — Confirmar si blocca sui casi hard (too-early RITIRO + DOMICILIO) con motivo
leggibile, e resta abilitato su tutti gli ordini confermabili (A/B/C/E) senza falsi-rossi né
freeze quando il planner non è disponibile. Bug critico chiuso, patch minima frontend-only,
test live (5/5) e statici (9/9) verdi.
