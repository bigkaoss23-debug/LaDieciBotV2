# PLANNER_UX_REBUILD_AUDIT_01 — REPORT

**Fecha:** 2026-06-14
**Branch:** `consolidation/nuevo-pedido-v1-unified-2026-06-09`
**Modo:** AUDIT + PLAN. Cero patch · cero deploy · cero commit · cero DB write.
**Intocado:** `ORDINI_2026-05-23.md`.

Archivos leídos:
`NuevoPedidoModal.jsx` (1921 l) · `DireccionInlinePanel.jsx` (231 l) · `PremiumPlannerPopup.jsx` (1157 l, WIP local +70/-3) · `PremiumProposalsCompact.jsx` (239 l) · `api/premiumProposals.js` · `api/manualGiro.js` · `api.js` (métodos planner).

---

## 1. Verdicto seco

**ATTENZIONE — no CRÍTICO.**

La separación Nuevo Pedido / Planner **ya existe arquitectónicamente**: el modal es limpio, el popup es un componente aparte, y todos los datos llegan del backend ya calculados (el frontend es renderer puro, sin `Date.now`/aritmética horaria). No hace falta refactor estructural para separar las dos pantallas.

Lo que está mal es **distribución y formato**, no la arquitectura:

1. El popup renderiza **el mismo `opportunities[]` tres veces** (best-card preview, "Otras opciones rápidas", "Giros y huecos") → ruido, no las **3 opciones fijas** que pide la spec.
2. La **línea de la serata ya existe como dato** (`serviceLine[]`) pero está **enterrada** dentro del acordeón "Avanzado" → `BackendSummary`, como `<ul>` de texto plano. No son filas horizontales por giro.
3. `Solo vista previa` (CTA prohibida por spec) sigue ahí, y `applyBest` es no-op.
4. El mapa se tira encima del operador en el `top-grid`, antes de que pida detalle.
5. En Nuevo Pedido hay **dos hints de giro duplicados** + un strip que vuelca blockers/warnings → demasiado.
6. `ManualRouteSection` (constructor LAB de rutas Q1→Q5 a clics) vive dentro del popup operador: es herramienta LAB, no flujo de decisión.

El **único riesgo real de datos** (→ ATTENZIONE): `serviceLine[]` hoy trae sólo `{hora, zone, label}` (ver `serviceLineLabelOf`), **no** el triple `salida→entrega→regreso` por giro que pide la spec §4.4. El triple sí existe, pero en `routeTimeline` **por oportunidad candidata** (el giro propuesto para ESTE pedido), no por cada giro ya existente de la noche. Hay que confirmar/extender el backend para la línea de la serata completa.

---

## 2. Mapping actual

### 2.1 Nuevo Pedido — `NuevoPedidoModal.jsx`
Modal real de alta de pedido. Contiene:

- **Cliente / teléfono / origen** (WA/TEL/Barra) — header.
- **`DireccionInlinePanel`** — dirección, nota, zona (auto + manual), hora, badge tipo.
  - Pill compacta **`Giro {zona} · {slot_hora}`** cuando `backendTiming.giro.suggested` (`DireccionInlinePanel.jsx:57-66`).
  - Botón **`Para ahora`** (sólo RITIRO, `onParaAhora` → `aplicarParaAhora` → `earliest_hora` backend).
  - CTA **`◎ Ver propuestas`** (`DireccionInlinePanel.jsx:224`) → `onOpenPlannerLab` → abre el popup.
- **Inline planner hint strip** (`NuevoPedidoModal.jsx:1649-1718`): auto-fetch de `previewOrderPlanner`. Vuelca: `⚠ Bloqueado`, `blockers[0].message`, `→ {hora}` + `Usa esta hora`, `🔄 {giro}` + `Usa giro compatible`, hasta 2 `warnings`.
- **Confirmar gating** (`1213-1237`): `canConfirmOrder = ok && !plannerBlocksConfirm`, donde `plannerBlocksConfirm` = `recommendation.can_confirm_requested_hora === false` o blocker `requested_hora_too_soon`. Razón visible en `:1834`. **Esto está bien — conservar tal cual.**
- **Dos bloques muertos** `{false && …}` (`1442-1518` pill zona, `1520-1646` `slotFeedback`): ~205 líneas de UI vieja desactivada. Basura para borrar.
- Estados planner: `strategicPreview` (popup), `plannerPreview` (hint inline), `manualRoutePreview` (ruta manual LAB), `backendTiming` (timing card).

### 2.2 `PremiumPlannerPopup.jsx` (WIP local, NO deployado)
Renderer read-only del contract `premium-planner-strategic-preview-v1`. Sin engine, sin mock (la fixture fue eliminada). Estructura de render:

| Bloque | Líneas | Qué muestra |
|---|---|---|
| `ppp-top-grid` → `ppp-best-card` | 259-282 | "Mejor propuesta", entrega, `OpportunityPreview`, **CTA `Solo vista previa`** (no-op) |
| `MiniZoneMap` | 283, 674-799 | mapa de zonas + polilínea ruta, **siempre visible** |
| `RouteTimeline` | 290, 467-534 | línea Salida→Entrega→Regreso de la opp seleccionada |
| `ppp-advanced` (colapsable) | 295-335 | `ManualRouteSection` (LAB) + `BackendSummary` |
| `ppp-quick-section` "Otras opciones rápidas" | 337-362 | botones de `opportunities[]` |
| `ppp-timeline-card` "Giros y huecos" | 364-393 | **mismo `opportunities[]` otra vez**, como filas |
| `ppp-notes` | 395-407 | `PLANNER_NOTES_DEFAULT` (copy dev-ish) |
| `BackendSummary` | 816-866 | `firstAvailable` + **`serviceLine` (la línea de serata, escondida)** + warnings + blockers |

Helpers puros reutilizables: `adaptStrategicContract` (121-167), `RouteTimeline`, `MiniZoneMap`, `OpportunityPreview`, `toneStyles`, `statusLabels`.

### 2.3 `PremiumProposalsCompact.jsx`
Componente compacto read-only (máx 4 cards + mini-detalle on-demand). **No montado en ningún sitio** (comentario: "Montaje en el modal = paso futuro"). Vocabulario `KIND_LABEL`: `direct/insertion/alternative/not_recommended` — **distinto** del strategic (`agregar/crear`). Candidato fuerte como base de la "capa de 3 opciones".

### 2.4 Entregas / Manual giro
- `api/manualGiro.js`: `previewManualGiroRoute` (READ) + `createManualGiroUnsafe` (WRITE, detrás de flag `REACT_APP_MANUAL_GIRO_WRITE`, default OFF). El WRITE **no** se toca en este flujo.
- `ManualGiroSection.jsx` / `TabEntregas.jsx`: herramientas del LAB/Entregas, fuera del alta de pedido. No relevantes para Nuevo Pedido clean.

---

## 3. Datos que ya llegan del backend (inventario para la rebuild)

| Contract / método | Campos útiles ya calculados |
|---|---|
| `previewOrderTiming` → `backendTiming` | `forno_out`, `suggested_hora`, `hora_proposta`, `durata_andata_min`, `zona`, `geo_source`, `driver{has_conflict,message}`, **`giro{suggested,zona,slot_hora}`**, `warnings[]` |
| `previewOrderPlanner` → `plannerPreview` (`nuevo-pedido-planner-preview-v1`) | `ok`, `recommendation{can_confirm_requested_hora, recommended_hora/suggested_hora/hora_proposta, reason}`, `geo{source}`, `giro{slot_hora,zona}`, `warnings[]`, `blockers[{code,message}]`, `alternatives[]`, `availability_rows[]` |
| `previewStrategicOpportunities` → `strategicPreview` (`premium-planner-strategic-preview-v1`) | `opportunities[{id,kind(agregar/crear),status(compatible/ajuste/no_recomendado/lleno),channel,routeZones[],routeEtas[{zone,eta,slips,slipLabel}],baseline{directEta},capacity{pizzas,routeMin,limitMin,state},blocked,warning,severity,title,subtitle,chip,routeTimeline}]`, `firstAvailable{eta,status}`, `bestProposal{id,title,severity,routeTimeline}`, **`serviceLine[{hora,zone,label}]`**, `warnings[]`, `blockers[]`, `safety` |
| `routeTimeline` (additivo, `route-timeline-v2`) | `timeline[{seq,type(departure/delivery/return),zone,eta,label,status,isNewOrder,isAnchor,promised,slipLabel,marginLabel,warning}]`, `summary{directEta,giroEta,returnEta,tradeoffLabel}`, `risk`, `operatorMessage` |
| `previewManualGiroRoute` → `manualRoutePreview` | `routeTimeline`, `blockers[]`, `warnings[]` (LAB) |

**Clave:** `routeTimeline.timeline` ya marca `isNewOrder` / `isAnchor` por nodo → la **agregación visual §4.6 (stops existentes + nuevo stop) ya es renderizable hoy** sin tocar backend.

---

## 4. Target UX vs estado actual (gap por sección)

| Spec | Estado actual | Gap |
|---|---|---|
| §4.1 mini-riga en Nuevo Pedido | Pill `Giro Q · hora` **+** hint strip con `Usa giro compatible` (duplicado y disperso) | Consolidar en **una** fila + `Ver planner` |
| §4.2 planner centrado en hora operador | `openPlannerLab` envía `startTime: hora`, `horaFlexible:!forzaHora` ✅ | OK, sólo verificar que no salte a giro lejano |
| §4.3 tres opciones fijas | `opportunities[]` (N variable) renderizado ×3; `no_recomendado` puede ser card primaria | Reescribir a 3 slots fijos (Directa / Giro / Alternativa), grises si faltan |
| §4.4 línea de la serata (filas por giro) | `serviceLine[]` como `<ul>` de texto, **dentro de "Avanzado"** | Sacar al primer nivel, formato fila `salida→entrega→regreso`; **falta dato triple por giro** |
| §4.5 acordeón, no popup-sobre-popup | Selección de opp actualiza inline (best+map+RouteTimeline) — **no abre popup** ✅; pero no hay acordeón por fila de serata | Añadir acordeón por fila; reusar `RouteTimeline`+`MiniZoneMap` |
| §4.6 agregación visual | `routeTimeline` con `isNewOrder/isAnchor` ya disponible | Sólo falta el contenedor visual que lo resalte |
| §5 "no queremos" | `Solo vista previa`, mapa upfront, notas dev, `no_recomendado` como botón, ManualRoute LAB en flujo operador | Eliminar todo eso |

---

## 5. Qué sacar de Nuevo Pedido

1. **Hint strip planner** (`1649-1718`) → reducir a **una** mini-fila de giro compatible + `Usa esta hora`. Mover blockers/warnings al Planner.
2. **Dos bloques muertos `{false && …}`** (`1442-1646`, ~205 l) → borrar.
3. Renombrar CTA **`◎ Ver propuestas` → `Ver planner`** (`DireccionInlinePanel.jsx:224`).
4. Quitar la duplicación: pill en header de `DireccionInlinePanel` **vs** strip inline → dejar una sola fuente visual.

## 6. Qué queda en Nuevo Pedido

- Cliente, teléfono, origen, dirección/nota, zona, **hora**, productos, **Confirmar** (+ su gating actual — conservar).
- `Para ahora` (RITIRO).
- **Una** mini-fila de giro compatible (§4.1) + `Ver planner`.

---

## 6bis. Mini-riga giro compatible (§4.1) — especificación

- **Datos:** `backendTiming.giro` (`suggested`, `zona`, `slot_hora`) o `plannerPreview.giro` — **ya disponibles**. Entrega estimada = `slot_hora`.
- **Microcopy:** `Giro {zona} disponible · entrega {slot_hora}` con botón `Agregar al giro {zona}` (aplica hora local) + link `Ver planner`.
- **Comportamiento:** se muestra **sólo** si `giro.suggested === true` y misma zona. Si no hay giro → **nada** (modal limpio). Sin mapa, sin timeline, sin warnings aquí.

---

## 7. Planner (popup) — target

1. **Cabecera de 3 opciones fijas** (sustituye `top-grid` + "Otras opciones" + "Giros y huecos"):
   - `Directa / Hora sugerida` · `Giro compatible` · `Alternativa`.
   - Ausente → botón **gris disabled** + `Sin giro compatible` / `Sin alternativa`.
   - **Sin** botón primario `No recomendado` (sólo warning/detalle).
   - Fuente: mapear `opportunities[]`/`firstAvailable`/`giro`/`alternatives` a los 3 slots (ver Riesgos §10 sobre vocabulario `kind`).
2. **Línea de la serata** (primer nivel, no "Avanzado"): una fila horizontal por giro/salida →
   `Q1 · salida 14:55 → entrega 15:00 → regreso 15:07` + retraso/estado. Fuente: `serviceLine[]` **extendido** (ver §10).
3. **Acordeón por fila** (no popup nuevo): al click, despliega inline el zoom del giro = `RouteTimeline` (Salida/Entrega/Regreso, ya con `isNewOrder/isAnchor`) + `MiniZoneMap` **on-demand**. Al cerrar, vuelve a la serata.
4. **Agregación visual** (§4.6): dentro del acordeón, resaltar stops existentes + nuevo stop usando flags `isNewOrder/isAnchor` de `routeTimeline`.
5. Eliminar: `Solo vista previa`, `ManualRouteSection` (a LAB), `PLANNER_NOTES_DEFAULT`, mapa upfront.

---

## 8. Componentes reutilizables (tal cual o casi)

- **`RouteTimeline`** (`PremiumPlannerPopup.jsx:467-534`) — renderer puro Salida/Entrega/Regreso con slip/margin/promised. **Núcleo del acordeón §4.5/§4.6.** Reusar.
- **`MiniZoneMap`** (674-799) — reusar, pero montar **dentro del acordeón** (on-demand), no en top-grid.
- **`adaptStrategicContract`** (121-167) — adapter pass-through. Reusar.
- **`PremiumProposalsCompact`** — base de la capa de 3 opciones (ya es read-only/compacto). Reusar adaptando a 3 slots fijos.
- **Confirmar gating** (`NuevoPedidoModal.jsx:1213-1237`) — conservar intacto.
- Pill giro de `DireccionInlinePanel` — base de la mini-riga.
- Helpers: `toneStyles`, `statusLabels`, `proposalStatusColor`, `etaSlipBadge`.

## 9. Componentes a reescribir / retirar

- **`top-grid` + best-card + `Solo vista previa`** → cabecera de 3 opciones.
- **"Otras opciones rápidas" + "Giros y huecos"** (doble render de `opportunities[]`) → colapsar en **una** línea de serata con acordeón.
- **`BackendSummary`** → su `serviceLine` sube a primer nivel con formato fila; el resto (warnings/blockers) se reubica.
- **`ManualRouteSection`** → fuera del popup operador (queda sólo en LAB).
- **Hint strip** de `NuevoPedidoModal` → mini-riga única.
- **`PLANNER_NOTES_DEFAULT`** → eliminar.

---

## 10. Riesgos

1. **Dato faltante (ATTENZIONE):** `serviceLine[]` trae sólo `{hora,zone,label}`, no `salida/entrega/regreso` por giro existente. La spec §4.4 exige el triple por fila. → Confirmar/extender backend: `serviceLine[]` debe exponer por cada giro de la noche un `routeTimeline`-like (o al menos `salida/entrega/regreso/retraso/estado`). **No calcular en frontend** (regla dura backend-first).
2. **Vocabulario `kind` divergente:** strategic = `agregar/crear`; `PremiumProposalsCompact` = `direct/insertion/alternative/not_recommended`. Decidir **qué contract alimenta las 3 opciones** y unificar el mapeo (Directa/Giro/Alternativa) antes de tocar UI.
3. **Doble fuente de "giro":** `backendTiming.giro` (timing) y `plannerPreview.giro` (planner) pueden divergir. Elegir una sola fuente para la mini-riga para no mostrar dos horas distintas.
4. **WIP no committeado:** `PremiumPlannerPopup.jsx` tiene cambios locales (+70/-3). Decidir si es la base antes de empezar, para no perder/duplicar trabajo.
5. **Regresión gating Confirmar:** cualquier reescritura del popup no debe tocar `canConfirmOrder` — es safety live. Tests de no-regresión obligatorios.

---

## 11. Orden de implementación recomendado

1. **Limpieza Nuevo Pedido** (bajo riesgo, sin backend): borrar bloques `{false&&}` muertos; reducir hint strip a una mini-riga; renombrar `Ver propuestas`→`Ver planner`. *(Decidir antes si se committea el WIP.)*
2. **Confirmar contract de las 3 opciones** + **extender `serviceLine`** (backend, backend-first): triple salida/entrega/regreso por giro de la noche. Sin esto la línea de serata §4.4 no se puede renderizar fiel.
3. **Cabecera 3 opciones** en el popup (grises si faltan; sin `No recomendado` primario).
4. **Línea de serata** a primer nivel (filas por giro) desde `serviceLine` extendido.
5. **Acordeón por fila** reusando `RouteTimeline` + `MiniZoneMap` on-demand.
6. **Agregación visual** (`isNewOrder/isAnchor`) dentro del acordeón.
7. **Retirar** `Solo vista previa`, `ManualRouteSection`, notas dev.

> Pasos 1, 3, 5, 6, 7 son **frontend puro** (datos ya existen). Paso 2 es el **único que toca backend** y es bloqueante para §4.4 fiel.

---

## 12. Tests necesarios

- **Mini-riga §4.1:** aparece sólo con `giro.suggested`; oculta sin giro; `Agregar al giro` aplica `slot_hora` local sin tocar Confirmar/DB.
- **3 opciones §4.3:** cada slot presente/ausente → activo vs gris disabled con copy correcto; `no_recomendado` nunca como botón primario.
- **Centrado §4.2:** `startTime` = hora del operador; con hora 16:15 el planner no salta a un giro 17:00.
- **Serata §4.4:** filas por giro con `salida→entrega→regreso` y retraso/estado (tras extender backend).
- **Acordeón §4.5:** abre inline (no popup), muestra `RouteTimeline`+mapa, cierra y vuelve a serata.
- **Agregación §4.6:** stops existentes + nuevo stop resaltados (`isNewOrder`).
- **No-regresión gating:** too-early (RITIRO + DOMICILIO, `requested_hora_too_soon`) sigue bloqueando Confirmar; caso B/C con `can_confirm=true` sigue confirmable.
- **Vacío:** modal sin productos/dirección → sin warnings, sin mapa, sin strip.

---

## Veredicto final

**ATTENZIONE.** Audit completo y plan claro. La separación Nuevo Pedido / Planner **no requiere refactor estructural** (la arquitectura ya está separada y el frontend es renderer puro). El trabajo es **redistribución de UI + 3-opciones + sacar la línea de serata del acordeón**, casi todo frontend con datos ya disponibles.

**Único bloqueo de datos:** la línea de la serata §4.4 necesita que el backend exponga el triple `salida/entrega/regreso` por cada giro de la noche en `serviceLine[]` (hoy sólo `{hora,zone,label}`). Backend-first, paso 2. Todo lo demás se puede construir ya.
