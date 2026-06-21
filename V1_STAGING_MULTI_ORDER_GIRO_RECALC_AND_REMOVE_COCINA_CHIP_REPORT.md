# V1_STAGING_MULTI_ORDER_GIRO_RECALC_AND_REMOVE_COCINA_CHIP — REPORT

Fecha: 2026-06-20 · STAGING ONLY · cero toque prod (Supabase `wnswassgfuuivmfwjxsf`,
backend `ladieci_bot`, Netlify `02bd4c7a` intactos). No push main, no deploy.

---

## AUDIT (hecho ANTES de patchar)

### ¿Cómo representa el backend un giro con varios pedidos?
**No lo agrupa.** En el path estratégico cada *anchor* es UN pedido individual
(`EN_COCINA` / `LISTO`, vía `ANCHOR_ELIGIBLE_STATES`). `strategicOpportunities.buildCandidateForAnchor`
construye un candidato = `[pedido_actual, UN anchor]`. No existe `manual_giro_id` /
`group id` / `route key` compartido entre varios pedidos de un mismo giro. Un "giro
Q5+Q2" son en realidad **dos anchors separados** (Q5 y Q2), cada uno genera su propio
candidato: `[Q1,Q5]` y `[Q1,Q2]`.

### ¿La propuesta "Usar giro Q2" trae routeTimeline completa o solo un hint?
**Trae routeTimeline COMPLETA.** Cada opportunity recibe `attachRouteTimeline(...)`
(`previewStrategicOpportunities.js:444`) con la ruta entera `Pizzería→Q1→Q2→regreso`,
y el selector la propaga a cada proposal (`deliveryProposalSelector.js:96`,
`routeTimeline: opp.routeTimeline`) **incluso para `not_recommended`**. → **Caso 1**
del enunciado: el backend YA manda la ruta; el bug es de integración/render.

### ¿Dónde se pierde la ruta? (bug = frontend / integración de contratos)
El chip **"Usar giro Q2" de la foto es el FALLBACK ligero sintético**, no la propuesta
real. Lo delata la card: muestra `Próximo giro · revisar en Giros y huecos`, que solo se
pinta cuando `cardProposal.hasRealRoute === false` (`PremiumPlannerPopup.jsx`).

Ese chip se construye desde **`nextGiroOpportunity`** (contrato `previewOrderPlanner`),
distinto de **`proposals[]`** (`previewStrategicOpportunities`). El enganche a la ruta
real depende de:
```
realInsertionProposal = baseProposals.find(p => proposalGiroId(p) === String(ng.anchorOrderId))
```
Cuando ese lookup falla → chip ligero sin ruta → y el mapa **caía al directo Q1**
(`selectedOpp` → `view.bestProposalOpp`). De ahí la incoherencia **"chip dice Q2 /
mapa muestra Pizzería→Q1"**.

**Causa raíz del fallo del lookup en la foto:** los dos backends no coinciden sobre si
Q2 es un anchor usable. `previewOrderPlanner` ofreció "Usar giro Q2" como `nextGiro`,
pero `previewStrategicOpportunities`/`serviceLine` **no tenían fila ni proposal para Q2**
(en la foto `Giros y huecos` lista Q5 y Q1, **no Q2** → Q2 no estaba `EN_COCINA`/`LISTO`).
El chip era una promesa que el resto del contrato no podía cumplir.

**Veredicto:** bug **frontend/integración** (la ruta completa SÍ existe en backend cuando
el anchor es elegible; se perdía en el render por el fallback al directo, y el chip
sintético se ofrecía sin respaldo). No es un bug de cálculo del motor.

---

## PATCH (Caso 1 — render frontend; backend NO tocado)

### BLOQUE A — coherencia de la propuesta seleccionada
`PremiumPlannerPopup.jsx` · nuevo `selectedOpp` (orden de verdad explícito):
1. fila de giro abierta sin proposta → su línea;
2. **proposta con route real** (`resolveProposalOpp`) → esa ruta completa
   (`Pizzería→Q1→Q2`), card+mapa+detalle la siguen;
3. **opportunity sin route propia pero ligada a un giro de `serviceLine`** → la línea de
   ESE giro (nunca el directo Q1);
4. **opportunity sin route ni giro de respaldo** (caso foto) → **mapa NEUTRO**
   (`routeZones:[]`, `mapPath:[]`) → el caption de ruta no se pinta: el chip queda como
   hint "revisar en Giros y huecos" sin que el mapa finja el directo como giro;
5. por defecto (directo/best) → ruta del pedido actual.

Resultado: **se elimina la contradicción "chip Q2 / mapa Pizzería→Q1"** en todos los
casos. Cuando el backend trae la ruta combinada (anchor elegible), el mapa muestra el
giro completo con Q1 dentro.

### BLOQUE B — retirar el chip de cocina de la UI operador
- Eliminado el cómputo `cardCocina` y el JSX del chip de la card.
- Filtrado el warning `cocina_frozen_under_15` de "Notas del planner".
- Eliminado el CSS muerto `.ppp-cocina-chip / .is-frozen / .is-stable / .ppp-cocina-min`.
- **Backend intacto**: sigue enviando `cocinaFrozen` / `cocinaState` / `minutesToSalida`
  + warning. Contract y tests backend sin cambios.

---

## FILES CHANGED (working tree, sin commit/deploy)
- `ladieci-app33/src/components/PremiumPlannerPopup.jsx` (A + B)
- `ladieci-app33/src/components/PremiumPlannerPopup.cocinaChip.test.js` (reescrito → asserts ausencia)
- `ladieci-app33/src/components/PremiumPlannerPopup.selectedRouteCoherence.test.js` (NUEVO, bloque A)

## TESTS
- Frontend popup: **43/43 PASS** (6 suites). Incluye:
  - cocinaChip: chip ausente (frozen/stable), warning fuera de notas, resto intacto.
  - selectedRouteCoherence A: "Usar giro Q2" con route real → mapa incluye Q2.
  - selectedRouteCoherence B: chip ligero sin respaldo → mapa NO muestra directo Q1.
- Backend: **no tocado**; `strategicOpportunities` 82/82 PASS (sanity).

## DEPLOY STATUS
- **NO desplegado.** Cambios solo en working tree. Frontend staging se despliega desde
  branch `backup/v1-env-split-backend-url-2026-06-17` (site `a3ad035a`) **solo con
  autorización explícita**. Branch actual: `consolidation/nuevo-pedido-v1-unified-2026-06-09`.

## SMOKE MANUAL
- **Pendiente** (requiere deploy staging + datos test en DB staging con marker + cleanup).
  No ejecutado: el escenario multi-order no se reproduce fiable en preview localhost sin
  escribir órdenes en staging. Verificación hecha vía unit tests del render.

## ZERO PROD TOUCH
- Confirmado: sin tocar Supabase prod, backend prod, Netlify prod. Sin push, sin deploy,
  sin WhatsApp real, sin secretos impresos.

---

## BACKLOG restante
- **Integración de contratos (raíz real):** alinear `previewOrderPlanner.nextGiroOpportunity`
  con la elegibilidad de anchor de `previewStrategicOpportunities` para que el chip
  "Usar giro Q2" SIEMPRE tenga proposal+route de respaldo (o no se ofrezca). Hoy el
  frontend ya no contradice, pero el chip ligero sin ruta sigue siendo un hint pobre
  cuando Q2 no es anchor elegible. **Decisión de producto pendiente** (¿suprimir el chip
  sin respaldo, o relajar la elegibilidad de anchor?). Necesita datos staging reales.
- **Multi-order real (>2 stops por giro):** el motor estratégico modela `[actual + 1 anchor]`;
  un giro con 3+ pedidos confirmados no se agrega como secuencia única. Requiere un
  `giro_id` compartido en backend (cambio mayor).
- `riderSavingMin` (info), per-stop delay chips multi-order, rotación key staging.
