# FRONTEND-SHADOW-PREVIEW-INTERNAL-20 — Report

**Fecha:** 2026-06-04
**Tarea:** Primera UI interna/admin/read-only para la Shadow Preview del Delivery Planner.
**Repo frontend:** `/Users/bigart/Downloads/LaDieciBotV2-github` · app `ladieci-app33`
**Deploy:** NINGUNO (este task es solo código + build + backup branch).

---

## 1. Qué se ha creado

| Archivo | Tipo | Descripción |
|---|---|---|
| `ladieci-app33/src/components/ShadowPreviewPanel.jsx` | nuevo | Componente de vista read-only del contract `shadow-preview-contract-v1`. |
| `ladieci-app33/src/api/shadowPreview.js` | nuevo | Cliente read-only `fetchShadowPreview({date})` (solo GET) vía proxy. |
| `ladieci-app33/netlify/functions/api.js` | modificado (mínimo) | Rama read-only `action=shadowPreview` que reenvía a `/api/delivery/shadow-preview`. |
| `ladieci-app33/src/App.jsx` | modificado | Deep-link oculto `/shadow-preview` detrás del PIN; sin botón operador. |
| `FRONTEND_SHADOW_PREVIEW_INTERNAL_20_REPORT_2026-06-04.md` | nuevo | Este informe. |

## 2. Dónde es accesible

- Deep-link **oculto**: `/shadow-preview`, protegido por el gate PIN→JWT (igual que `/servizio`).
- **No** hay ningún botón/enlace desde Home, Cocina, Entregas, Economía ni Servicio. Hay que conocer la URL.
- No cambia ningún flujo operativo (Cocina/Entregas/Pedidos intactos).

## 3. Cómo llama al endpoint

```
ShadowPreviewPanel
  → fetchShadowPreview({ date })            // src/api/shadowPreview.js, solo GET
  → GET /api/proxy?action=shadowPreview&date=YYYY-MM-DD   (Authorization: Bearer <JWT app>)
  → Netlify function api.js (verifica JWT, bloquea rol repartidor)
  → GET https://ladiecibot-production.up.railway.app/api/delivery/shadow-preview?date=...
       (X-Api-Key añadida server-side, NUNCA expuesta al frontend)
```

- Reutiliza el **mismo** auth flow JWT del resto de la app. No inventa nada nuevo.
- La `X-Api-Key` permanece en la Netlify function (secreto server-side).
- El rol `repartidor` queda bloqueado: `shadowPreview` no está en `REPARTIDOR_ALLOWED` → 403.

## 4. Por qué es read-only

- El cliente hace **solo `fetch` con `method: "GET"`**. No hay POST/PUT/PATCH/DELETE.
- La rama del proxy solo reenvía el parámetro `date` por GET.
- Las `actions` del contract se muestran como **chips informativos NO clicables** (`role="note"`, `cursor:default`), bajo el rótulo "Sugerencias (no ejecutan acciones)".
- No hay botones tipo "aplicar plan", "forzar", "modificar orden". No hay CommitWriter. No se toca Supabase ni ordenes.

## 5. Qué muestra

- **Header:** título `Vista previa planner`, badge de status (`OK`/`WARNING`/`CRITICAL`), badge `🔒 Solo lectura`, origen + fecha (`source.type` / `source.date`).
- **Resumen:** totalOrders, deliveryOrders, pickupOrders, nº de zonas (+ chips), warningsCount, differencesCount, groupedMessagesCount.
- **Avisos del planner (`groups`):** title, message, operatorHint, level, count, zones, tags. Empty state si no hay.
- **Sugerencias (`actions`):** chips no clicables con label; nota aclaratoria de que la app no aplica cambios.
- **Safety (técnico):** readOnly / writesEnabled / piiIncluded / rawDiagnosticsHidden (verde si el valor es el esperado), + version y generatedAt.
- **Estados:** loading, error 401 (sesión), 400 missing_date / invalid_date, error de red, y summary 0 pedidos (válido).

## 6. Qué NO muestra

- Sin raw diagnostics. Sin raw orders. Sin teléfono, dirección, nombre de cliente ni notas (PII). Sin token, sin API key, sin stacktrace, sin endpoint crudo innecesario.

## 7. Build / test

- `npm run build`: **Compiled successfully**, sin errores. Bundle `main.0335292c.js` (+2.32 kB gzip).
- Static check del bundle: contiene `Vista previa planner`, `Solo lectura`, `Sugerencias (no ejecutan acciones)`, `Avisos del planner`, `shadowPreview`.
- Tests unitarios existentes (`react-scripts test --watchAll=false`): ver sección de resultados al final del task.

## 8. Safety

- Sin write methods en el código nuevo (solo `fetch` GET). Los matches de grep son comentarios o el falso positivo `<inPUT>` (date picker).
- Sin CommitWriter, sin insert/update/delete/upsert/rpc reales.
- Sin PII renderizada (solo campos del contract: zonas, tags, contadores, mensajes operativos).
- Sin cambios en backend, Supabase, migraciones ni config de deploy.

## 9. Próximo paso recomendado

- Revisión visual en preview local / staging y, en un task separado **explícitamente aprobado**, deploy Netlify con `--site 02bd4c7a-a50b-4964-90da-8c1af1122932` (requiere que la env var de la Netlify function permita la nueva rama; la rama reusa `RAILWAY_API_KEY`/`JWT_SECRET` ya existentes).
- NO conectar CommitWriter. NO añadir acciones operativas reales.
