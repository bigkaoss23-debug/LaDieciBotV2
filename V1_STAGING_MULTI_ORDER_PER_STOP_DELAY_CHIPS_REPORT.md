# V1_STAGING_MULTI_ORDER_PER_STOP_DELAY_CHIPS — REPORT

Fecha: 2026-06-20 · STAGING ONLY · cero toque prod. Frontend-only, backend NO tocado.

---

## AUDIT — campos disponibles por parada
`RouteTimeline` recibe `routeTimeline.timeline[]`; cada nodo `delivery` (mapper backend
`routeTimeline.js`) trae ya calculado:
- `eta` (HH:MM), `zone`, `label`, `isNewOrder`/`isAnchor`, `status`.
- **`slipLabel`** = `"+N"` (solo positivo; `+0`/ausente → null) = **el retraso en minutos
  de esa parada, YA calculado por `routeImpact`**. ← el dato que necesitábamos.
- `promised`, `marginLabel` (`"-9 vs prometido"`), `warning` (`"Q5 se mueve +9 min"`) →
  existen pero son **debug**: ya estaban suprimidos del render y siguen suprimidos.

**Conclusión:** el retraso por parada **ya existe** en el contrato (`slipLabel`). La
banda semáforo (0–5 / 6–10 / >10) es **bucketizar un número ya calculado** = puramente
presentacional (mismas franjas que el backend `clientDelayBand`). **Frontend-only
suficiente. Sin gap backend. Sin cálculos inventados.**

Dónde renderizar: (1) fila compacta `.ppp-sl-head` (ya mostraba un `+N` plano ámbar),
(2) detalle expandido `RouteTimeline` (no mostraba nada por parada).

## PATCH (frontend-only)
- Helper `delayChipFromSlip(slipLabel)` → `{min, band, label}` desde `"+N"`:
  - banda `verde` 1–5 · `amarillo` 6–10 · `rojo` >10. `+0`/ausente → `null` (sin chip).
  - copy humano: `"+N min"`; banda roja → `"revisar +N min"` (mirar, **NO bloquea**).
- **Fila compacta** (`previewLegsFromTimeline` + `.ppp-sl-head`): el ancla que se mueve
  muestra el chip semáforo banded; el nuevo pedido sigue como `Cliente HH:MM` (sin chip).
- **Detalle expandido** (`RouteTimeline` meta): chip `.ppp-rt-delay` banded por ancla.
- CSS: variantes `.band-verde/.band-amarillo/.band-rojo` para `.ppp-sl-slip` y `.ppp-rt-delay`.
- Eliminado helper muerto `posSlip` (sustituido por `delayChipFromSlip`) → sin no-unused-var.
- NO se reintroduce ningún debug (`prometido`/`margin`/`se mueve`/`No recomendado`/raw).

## FILES CHANGED
- `ladieci-app33/src/components/PremiumPlannerPopup.jsx`
- `ladieci-app33/src/components/PremiumPlannerPopup.perStopDelayChips.test.js` (NUEVO)

## FRONTEND-ONLY: SÍ. Backend NO tocado.

## TESTS
- Popup: **48/48 PASS** (7 suites; +5 nuevos en perStopDelayChips):
  fila compacta +4 verde / +9 amarillo / +12 rojo·revisar (cliente nuevo sin chip);
  detalle expandido 3 chips banded; sin slip / slip 0 → sin chip sin crash;
  sin debug labels (prometido/margin/se mueve/No recomendado/delayBand/slipLabel);
  chips de propuesta antes de Giros y huecos + una sola timeline.

## BUILD
- Staging build OK (`CI=true`, `ALLOW_V1=1`, `GENERATE_SOURCEMAP=false`, env staging).
  Bundle local determinista **`main.cb397c06.js`**, zero prod refs.

## DEPLOY
- Commit (pendiente abajo) en branch `backup/v1-env-split-backend-url-2026-06-17`,
  push FF → Netlify staging `a3ad035a` auto-build.
- Verificación live abajo (bundle / zero prod refs / CSP).

## SMOKE
- Cubierto por unit tests (render de los chips banded) + verificación del bundle live.
  El stack staging real (backend `fearless-reverence`) **no produce >2 paradas por giro**
  hoy (motor estratégico = `[actual + 1 ancla]`), así que el caso 3-paradas es sintético
  en test; el render es genérico (N paradas) y queda listo para el `giro_id` compartido.
  No se crearon datos test nuevos para este paso (no necesarios).

## ZERO PROD TOUCH
- Solo staging. Prod `wnswassgfuuivmfwjxsf` / `ladieci_bot` / `02bd4c7a` intactos.
  Sin push main, sin deploy prod, sin WhatsApp, sin secretos impresos.

## BACKLOG
- `giro_id` compartido para multi-order >2 paradas (cambio backend) — el render por
  parada ya lo soportará sin cambios.
- `riderSavingMin`.
- rotación key staging.
- commit del test backend characterization (`previewStrategicProposalRouteTimeline`)
  cuando se decida tocar `ladieci-bot`.
