# V1_STAGING_LOCK_ANCHOR_ROUTE_DEPARTURE_AND_PREVIEW_CLARITY — REPORT (UI CLEANUP)

**Data:** 2026-06-20
**Obiettivo (sotto-task UI):** ripulire il popup planner `Propuestas de entrega` per l'operatore —
niente dati tecnici/debug, niente falsi allarmi. Tradurre status/slip/margin del backend in
linguaggio operativo (ore/orario), non in minuti grezzi.
**Tipo:** **frontend-only.** Backend NON toccato (continua a mandare status/slip/margin; il
frontend li traduce). Nessun deploy.

---

## 1. File toccato

`ladieci-app33/src/components/PremiumPlannerPopup.jsx` (+ nuovi test).

## 2. Cosa è cambiato (renderer-only, zero calcolo)

### a) Dettaglio espanso (RouteTimeline) — meta depurata
Rimossi dalla timeline verticale i label di debug:
- badge `nuevo` (`bd-new`) e `en giro` (`bd-anchor`)
- `prometido HH:MM` (`ppp-rt-prom`)
- slip `-118 vs prometido` (`ppp-rt-slip`)
- `+0 margen` / `+106 margen` (`ppp-rt-margin`)
- il warning crudo per-nodo in minuti (`Q2 se mueve +118 min`)

Resta solo **tipo parada + zona**. Il pedido nuovo si distingue ancora dal **colore del nodo**
(`.is-new`, arancio). Il dato "Q2 più tardi" compare **una sola volta**, umano, nell'aviso della
card (`operatorMessage` soft).

### b) Badge `No recomendado` → `Confirmar con cliente`
`RouteTimeline` accetta `clientAcceptance`. In preview di incastro del nuovo pedido, un
`risk: no_recomendado` (= "il cliente deve accettare la nuova ora") diventa badge **ámbar
"Confirmar con cliente"**, non più allarme rosso.
`No recomendado` rosso resta SOLO per pericolo reale (rompe l'anchor, ritarda confermato, rider
non disponibile, capacità) — quei path non passano `clientAcceptance`.

### c) Riga compatta "Giros y huecos" → preview con Q2 incluso
Quando `Encajar Q5` è selezionato, la riga non mostra più il giro VECCHIO
(`salida 18:47 → entrega 19:00 → regreso 19:13`) ma la **preview utile** estratta dal
`routeTimeline` reale:
`Q5 + Q2 · Salida 18:47 → [Hora cliente 18:48] → Entrega Q5 19:00 → Regreso 19:17`.

### d) Chip verde "Hora cliente"
L'entrega del nuovo pedido (`isNewOrder`) è resa come **chip verde** `Hora cliente 18:48` nella
riga compatta — l'ora da proporre al cliente è la cosa più visibile.

## 3. Test

`PremiumPlannerPopup.uiCleanup.test.js` (nuovo, 6 test) + suite esistente.
Coperti: no badge `No recomendado` (→ `Confirmar con cliente`); no headline `se mueve +118 min`;
no `nuevo`/`+0 margen`/`-118`/`prometido` nel dettaglio; riga compatta aggiornata con Q2; chip
verde `Hora cliente 18:48`; nessun dato tecnico duplicato nella riga.

```
Test Suites: 4 passed, 4 total
Tests:       30 passed, 30 total   (24 esistenti invariati + 6 nuovi)
```

## 4. Non fatto / note
- **Nessun deploy.** Modifiche solo in working tree.
- CSS delle classi ora inutilizzate (`bd-new`, `bd-anchor`, `ppp-rt-prom/slip/margin`) lasciato:
  sono solo definizioni, nessun render le usa più (verificato via grep).
- Backend invariato: la pulizia è 100% di traduzione lato frontend, come richiesto.
