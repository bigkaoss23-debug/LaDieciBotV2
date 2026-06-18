# Delivery Status Labels — Operator Semantics (UI only) — 2026-06-06

**Repo frontend:** `LaDieciBotV2-github/ladieci-app33` · **Branch:** `feature/delivery-status-labels-operator-semantics-2026-06-06` (da `origin/main` = `4af1360`).
**Modalità:** SOLO testi UI. Nessun backend / DB / API / enum / planner / deploy.

## Obiettivo
Correggere la semantica visibile all'operatore per i DOMICILIO:
- `EN_ENTREGA` = il driver **esce** dalla pizzeria col giro (NON "consegnato").
- `RETIRADO` = il driver **rientra** in pizzeria (giro chiuso), **NON** consegna al cliente.
- La consegna cliente è solo stimabile (`en_entrega_at + durata_andata_min`).
- Per i RITIRO, "Retirado"/"Entregado" restano corretti (cliente ritira al banco).

## File modificati (3 src + 1 report)
| File | Cambio |
|---|---|
| `src/components/ordenes/TabListos.jsx` | badge done + label stato EN_ENTREGA, tipo-aware |
| `src/components/entregas/TabEntregas.jsx` | bottone override operatore + confirm + tooltip + notify |
| `src/core/orders/stateMachine.js` | commento semantica su `ORDER_STATE_LABELS` (no logica) |
| `DELIVERY_STATUS_LABELS_OPERATOR_SEMANTICS_REPORT_2026-06-06.md` | questo report |

## Cambi label (prima → dopo)
### DOMICILIO (corretti)
| Punto | Prima | Dopo |
|---|---|---|
| TabListos — badge ordine completato (RETIRADO) | `✅ Entregado` | DOMICILIO → `🛵 Driver volvió` (RITIRO resta `✅ Entregado`) |
| TabListos — label stato in giro | `🛵 En camino` (EN_ENTREGA) | `🛵 Driver fuera` |
| TabEntregas — bottone override operatore (EN_ENTREGA→RETIRADO) | `✓ Entregado` | `✓ Driver volvió` |
| TabEntregas — confirm dialog | `¿Confirmar entrega? … cerrará el pedido como entregado.` | `¿Driver de vuelta? … cerrará el giro (RETIRADO).` |
| TabEntregas — tooltip | `Marcar como entregado desde el panel del operador` | `Marcar driver de vuelta (RETIRADO) desde el panel del operador` |
| TabEntregas — notify override | `✓ Entregado (operador)` | `✓ Driver volvió (operador)` |

### RITIRO (NON toccato, già corretto)
- TabListos — bottone `🛍 Retirado` (ramo `tipo_consegna !== "DOMICILIO"`): invariato.
- TabListos — badge done per RITIRO: resta `✅ Entregado`.
- ServicioPage `setRetirado` notify `🛍 Retirado — Buon appetito!`: invariato (path RITIRO).

## Cosa NON è stato cambiato (e perché)
- **`RepartidorPage.jsx` (app driver)**: bottoni `Salgo` / `Entregado`, "Entregados esta noche", notify `Entregado — Tarjeta/Efectivo`. **Lasciati intenzionalmente**: sono azioni in **prima persona del driver** al cliente; rinominarli in "Driver volvió" è una **decisione di prodotto** sull'UX driver, fuori dallo scope "semantica operatore/pizzeria". Documentato come step successivo.
- **`TabBanco.jsx` / `TabManual.jsx`**: header `✅ Entregados · N` — conteggi aggregati su tab a prevalenza RITIRO (banco/manual). Non per-ordine DOMICILIO. Lasciati.
- **`TabEntregas` `ResumenEntregados` (`✓ Entregados esta noche · N`)**: tally retrospettivo notturno, non un click; lasciato (basso rischio).
- **`OrdenCard.jsx` badge `✅ Entregado`**: dentro una mappa statica `styles[estado]`, renderla tipo-aware richiederebbe ristrutturazione; lo stato RETIRADO è terminale e raramente compare nelle liste attive. Lasciato.
- **`WADettaglio.jsx` / `WaLista.jsx` `✅ Entregado`**: viste WhatsApp status; lasciate (bassa priorità, fuori dal flusso completamento delivery operatore).
- **Nessun** cambio a: enum `EN_ENTREGA`/`RETIRADO`, action API (`marcarEnEntrega`/`marcarEntregado`/`updateEstado`), payload, DB, planner.

## Build
- `CI=true npm run build` → **Compiled successfully** (bundle `main.e8645cfe.js`, −1.02 kB). Zero errori.

## Safety
❌ no backend · ❌ no DB · ❌ no migration · ❌ no deploy · ❌ no push · ❌ no geo_cache · ❌ no WhatsApp reale · ❌ no CommitWriter · ❌ no cambio stati/API/logica. Solo testi/label UI.

## Cosa resta (follow-up)
1. Decisione prodotto su `RepartidorPage` (app driver): se mostrare "Driver volvió" anche lì o mantenere "Entregado" prima-persona.
2. UI cliente vs operativo per il `+5 reparto` (ajuste operativo, già esposto in shadow `operationalAdjustments`).
3. Eventuale badge "driver dentro/fuera" coerente in tutte le viste.
4. Deploy frontend Netlify separato, solo dopo review esplicita.
