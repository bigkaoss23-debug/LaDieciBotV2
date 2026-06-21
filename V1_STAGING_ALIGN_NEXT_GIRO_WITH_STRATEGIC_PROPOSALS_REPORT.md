# V1_STAGING_ALIGN_NEXT_GIRO_WITH_STRATEGIC_PROPOSALS — REPORT

Fecha: 2026-06-20 · STAGING ONLY · cero toque prod (Supabase `wnswassgfuuivmfwjxsf`,
backend `ladieci_bot`, Netlify `02bd4c7a` intactos). No push main, no deploy.

---

## ROOT CAUSE DEFINITIVO

Dos contratos distintos alimentan el mismo popup, vía **dos llamadas API separadas**
en `NuevoPedidoModal.jsx`:

| Contrato | Llamada | Input | Produce |
|---|---|---|---|
| `nuevo-pedido-planner-preview-v1` | `api.previewOrderPlanner` | `{direccion, hora, ...}` (resuelve geo server-side) | `nextGiroOpportunity` (nearest anchor futuro) |
| `premium-planner-strategic-preview-v1` | `api.previewStrategicOpportunities` | `{startTime, currentOrderDraft:{zone: zonaInfo?.zona?.id ?? null}}` | `proposals[]` / `opportunities[]` / `serviceLine` |

**La elegibilidad de anchor YA está unificada**: `previewOrderPlanner` importa
`buildAnchorsFromSnapshot` de `previewStrategicOpportunities`
([previewOrderPlanner.js:18](../ladieci-bot/src/agents/previewOrderPlanner.js)) — mismos
estados (`EN_COCINA`/`LISTO`), mismo anti-stale, mismo filtro DOMICILIO. No hay
divergencia de *reglas*.

**La divergencia es de INPUT/TIMING entre las dos llamadas:**
- `previewOrderPlanner` resuelve la `direccion` él mismo → siempre tiene la zona + los
  anchors → emite `nextGiroOpportunity` (incluso Q2).
- `previewStrategicOpportunities` depende de que el frontend ya tenga `zonaInfo`
  resuelta (`currentOrderDraft.zone` puede llegar `null` → `missing_current_order` →
  `proposals: []`); y aunque la zona esté resuelta, el candidato puede quedar
  **bloqueado/sin ruta** (cross-channel / missing-travel → `routeImpactInput=null` →
  `routeEtas:[]` → excluido del selector) o filtrado (same-zone).

Resultado en la foto: el hint `nextGiroOpportunity` ofrecía "Usar giro Q2" pero
`proposals[]`/`serviceLine` no tenían respaldo para Q2 → `realInsertionProposal` fallaba
→ el frontend generaba un **chip ligero sin ruta** → contradicción "chip Q2 / mapa
Pizzería→Q1".

### ¿Q2 debía ser anchor o no?
**Cuando Q2 es un anchor válido (EN_COCINA/LISTO, mismo canal, con tiempos de viaje),
el estratégico SÍ genera la proposal real con routeTimeline completa** — demostrado por
el nuevo test backend `previewStrategicProposalRouteTimeline.test.js` (8/8): pedido Q1 +
anchor Q2 → proposal con `routeTimeline` que incluye **ambas paradas** Q1+Q2 (no solo
Pizzería→Q1) + departure/return + `serviceLine` enlazable. → **El backend es correcto.**
El chip de la foto venía de un caso donde Q2 **no** tenía respaldo real en el estratégico
(zona sin resolver en esa llamada / candidato bloqueado), no de un fallo del motor.

---

## DECISIÓN / PATCH

**Regla de producto implementada:** un chip/botón `Usar giro X` confirmable solo existe
si lo respalda una proposal/opportunity REAL con `routeTimeline` completa y `giroId`
coherente. **Opción A** (preferida): sin respaldo real → el chip NO se muestra; el
operador ve solo las propuestas reales. (Opción B —hint no clickable— descartada.)

- **backend changed: NO.** Forzar al estratégico a emitir una proposal que legítimamente
  no tiene (candidato bloqueado / zona sin resolver) sería inventar una ruta — prohibido.
  La elegibilidad ya está unificada por construcción.
- **frontend changed: SÍ.** Reconciliación en el punto que tiene ambos contratos
  (`PremiumPlannerPopup`): `syntheticNextGiro` ya **no** crea el chip ligero de fallback
  (`hasRealRoute:false`); devuelve `null` cuando no hay `realInsertionProposal`. Se
  conserva intacta la rama de respaldo real (task 54): chip "Usar giro X" con
  `routeTimeline`/mapa/timeline reales.
- **safety previa (working tree, conservada):** `selectedOpp` ya no cae al directo Q1 en
  un chip oportunidad, y el chip de cocina sigue retirado de la card.

---

## FILES CHANGED (working tree, sin commit/deploy)
- `ladieci-app33/src/components/PremiumPlannerPopup.jsx` — `syntheticNextGiro`: elimina
  el chip de fallback sin ruta (Opción A). (+ patches previos: `selectedOpp`, chip cocina.)
- `ladieci-app33/src/components/PremiumPlannerPopup.nextGiro.test.js` — 2 tests del viejo
  chip ligero (task 47) reescritos a la regla nueva (sin respaldo → sin chip).
- `ladieci-app33/src/components/PremiumPlannerPopup.selectedRouteCoherence.test.js` — test B
  actualizado (chip suprimido sin respaldo).
- `ladieci-app33/src/components/PremiumPlannerPopup.cocinaChip.test.js` — (patch previo).
- `ladieci-bot/tests/previewStrategicProposalRouteTimeline.test.js` — **NUEVO** test de
  contrato backend (characterization, sin cambio de producción).

## TESTS
- Frontend popup: **43/43 PASS** (6 suites).
  - nextGiro: con respaldo real (not_recommended #001) → chip con ruta real; **sin
    respaldo → sin chip, card en best**.
  - selectedRouteCoherence A: chip con route real → mapa incluye Q2; B: sin respaldo → sin chip.
  - cocinaChip: chip ausente, warning fuera de notas.
- Backend (sin cambio de producción): **PASS** —
  strategicOpportunities 82, previewStrategicOpportunities 127, …Index 43, …Staleness 25,
  deliveryProposalSelector 32, routeTimeline 61, plannerCocinaFreeze15Min 35,
  **previewStrategicProposalRouteTimeline 8 (NUEVO)**, previewOrderPlannerIndex 9.

## DEPLOY STATUS
- **NO desplegado.** Solo working tree. Pendiente autorización explícita.
  - Frontend cambia → deploy staging FE desde `backup/v1-env-split-backend-url-2026-06-17`
    (site `a3ad035a`), build env staging, `CI=true`, `GENERATE_SOURCEMAP=false`.
  - Backend **no cambia** (solo se añadió un test) → no requiere deploy backend.

## SMOKE MANUAL
- **Pendiente** (requiere deploy + datos test staging con marker + cleanup). Verificación
  hecha vía unit/contract tests. El test backend nuevo reproduce el escenario Q1+anchor Q2
  y prueba que la ruta completa existe cuando Q2 es anchor válido.

## CLEANUP
- Sin datos test creados en esta sesión. Nada que limpiar.

## ZERO PROD TOUCH
- Confirmado: sin tocar Supabase prod, backend prod, Netlify prod. Sin push, sin deploy,
  sin WhatsApp real, sin secretos impresos.

## BACKLOG restante
- Las ramas `hasRealRoute === false` del render (card "Próximo giro · revisar…",
  `selectedOpp` neutro) quedan como **guardas defensivas inalcanzables** (todo chip
  sintético es ahora `hasRealRoute:true`). Limpieza opcional futura.
- Multi-order real (>2 stops por giro): el motor modela `[actual + 1 anchor]`; un
  `giro_id` compartido para 3+ pedidos es cambio mayor de backend.
- `riderSavingMin`, per-stop delay chips multi-order, rotación key staging.
