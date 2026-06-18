# PLANNER UX-1 — Staging Deploy + Visual Smoke (07)

**Data:** 2026-06-14
**Azione:** deploy del commit UX-1 `9c1be6d` su **staging** + smoke read-only del nuovo `PremiumPlannerPopup`.
**Verdetto:** ✅ **OK** (smoke via DOM/text audit — screenshot interattivi non possibili, vedi §7).

---

## 1. Preflight

- **Branch:** `consolidation/nuevo-pedido-v1-unified-2026-06-09`
- **HEAD locale:** `9c1be6d` ✓
- **Remote consolidation:** `9c1be6d` ✓
- **main:** `970daa6` (intatto) ✓
- **Tracked modificati:** nessuno (solo untracked noti: report + `ORDINI_2026-05-23.md`)
- **PROD `02bd4c7a` (magnificent-lollipop-6dff70):** deploy `6a2ecb8f924c8b12a12cd618`, **locked: True** — da preservare
- **STAGING `a3ad035a` (ladieci-v1-staging):** deploy PRIMA = `6a2ec9b6c5fc3dd1002f2f72`
- **⚠️ Trap Netlify CLI:** `.netlify/state.json` linkato a **PROD** (`02bd4c7a`) → deploy staging eseguito SOLO con `--site a3ad035a-e73f-4da3-8873-6403e31f04b6` esplicito.

## 2. Build

`CI=false npm run build` (da `ladieci-app33`) → **Compiled successfully**.
- bundle: `static/js/main.6f935b50.js` (242.49 kB gz, −232 B)
- `public/version.json` rigenerato dal prebuild → commit **`9c1be6d`** (build artifact, non tracked)
- **Marker UX-1 nel build (build/static/js):**
  - `ppp-opt3`: 20 ✓
  - `ppp-detail`: 4 ✓
  - `Sin giro compatible`: 2 ✓
  - `Sin alternativa`: 2 ✓
  - `Solo vista previa`: **0** ✓ (rimosso)

## 3. Staging deploy

```
netlify deploy --site a3ad035a-e73f-4da3-8873-6403e31f04b6 --dir build --prod
```
- **Deploy ID:** `6a2ed8d169063284abcdde5c`
- **Production URL (staging site):** https://ladieci-v1-staging.netlify.app
- Deploy live in 20.5s.

## 4. Production unchanged (prova)

- `magnificent-lollipop-6dff70.netlify.app/version.json` → commit **`7557701`**, deployId `6a2ecb8f924c8b12a12cd618`
- Netlify API site `02bd4c7a` → published_deploy_id `6a2ecb8f924c8b12a12cd618`, **locked: True**
- ✅ Production INVARIATA e ancora locked. Nessun deploy su prod.

## 5. Bundle markers (staging LIVE)

`curl https://ladieci-v1-staging.netlify.app/version.json` → commit `9c1be6d`.
Bundle live `static/js/main.6f935b50.js`:
- `ppp-opt3`: 10 ✓
- `Sin giro compatible`: 1 ✓
- `Sin alternativa`: 1 ✓
- `Solo vista previa`: **0** ✓
- `recommended_hora` (BUG A fix): 1 ✓

## 6. Visual smoke — risultati

> **Nota metodo:** lo smoke interattivo in browser (login + Nuevo Pedido + preview + screenshot)
> NON è stato possibile: nessun browser Chrome collegato e login staging gated da PIN Supabase
> (multi-operatore, non in mio possesso). Per il piano è previsto il fallback **DOM/text audit**,
> che fornisce evidenza concreta sul codice realmente deployato (bundle live) + render statico
> del componente (stesso commit `9c1be6d`).

### Case 1 — Direct only — ✅
Render statico (`renderToStaticMarkup`, contract `firstAvailable` presente, `opportunities:[]`):
```
[ATTIVO ·sel] "Directa" · 21:00 (compatible)
[GRIS/disabled] "Sin giro compatible" disabled
[GRIS/disabled] "Sin alternativa" disabled
detalle: rtBeforeDetail=false mapBeforeDetail=false
```
Header 3 opzioni presente; Directa attiva; Giro/Alternativa grigi; nessun `Solo vista previa`;
nessuna mappa nel top-grid (`mapBeforeDetail=false`).

### Case 2 — Giro compatible / no_recomendado escluso — ✅
```
[ATTIVO ·sel] "Directa" · 21:00 (compatible)
[ATTIVO] "Giro compatible" · 15:00 (compatible)
[GRIS/disabled] "Sin alternativa" disabled
```
Con opp `no_recomendado`+blocked in lista: NON compare come bottone primario; warning resta nel
detail, non come CTA verde. (Caso 4 harness conferma: due opp blocked → entrambe escluse.)

### Case 3 — Detail accordion — ✅
```
detalle: hasDetail=true rtInDetail=true mapInDetail=true | rtBeforeDetail=false mapBeforeDetail=false
```
`RouteTimeline` e `MiniZoneMap` compaiono SOLO dentro `ppp-detail`, mai nel top-grid. Nessun
popup-on-popup (è un `<section class="ppp-detail">` inline, non un nuovo overlay).

### Case 4 — Nuevo Pedido resta pulito — ✅
`src/components/NuevoPedidoModal.jsx`:
- `ppp-opt3`: **0** · `buildThreeOptions`: **0** → il modal NON ha guadagnato bottoni planner.
- Le proposte vivono SOLO in `PremiumPlannerPopup` (commento riga 262), montato condizionatamente
  solo con `strategicPreview` valido (righe 1886-1887). Nessuna UI planner-heavy dentro Nuevo Pedido.

### Case 5 — Confirmar safety / BUG A — ✅ (statico)
- `recommended_hora` presente nel bundle live (1 hit) → fix BUG A "Usa esta hora" deployato su staging.
- Confirmar gating presente (commit `9c1be6d` discende da `7557701` che contiene il gating).
- Nessun ordine creato, nessun Confirmar premuto, nessun A Cocina.

## 7. Screenshot / evidenza

Screenshot **non prodotti** (no browser collegato + login PIN gated). Fornita evidenza
DOM/text equivalente:
- bundle live staging (marker presenti / rimossi)
- `/version.json` staging = `9c1be6d`
- render statico DOM dei casi 1–5 (harness 5/5, commit `9c1be6d`)
- audit sorgente `NuevoPedidoModal.jsx`

> Se serve un pass pixel-level: collegare l'estensione Chrome **oppure** effettuare login
> manuale su https://ladieci-v1-staging.netlify.app e segnalarmelo — riprendo lo smoke visivo
> (open Nuevo Pedido → preview read-only → popup → screenshot), senza premere Confirmar.

## 8. Verdetto UX

**✅ OK** — il nuovo `PremiumPlannerPopup` è live su staging con:
- header 3 opzioni fisse (Directa / Giro compatible / Alternativa)
- blocked/no_recomendado/lleno mai come bottoni primari
- opzioni mancanti grigie/disabled
- RouteTimeline + MiniZoneMap solo nel detail accordion (mai top-grid)
- `Solo vista previa` rimosso
- NuevoPedidoModal invariato e pulito

## 9. Issues trovati

Nessun issue funzionale sul mapping. Unica limitazione: smoke **visivo pixel-level** non eseguito
(tooling/login) → coperto da DOM/text audit. Non bloccante.

## 10. Next action

- **Nessun patch tweak necessario** sul componente: mapping corretto, bundle pulito.
- Eventuale **pass visivo pixel-level su staging** (Chrome collegato o login manuale) prima di
  preparare la produzione — opzionale.
- Produzione: da preparare **più tardi**, solo su esplicito "vai/deploya". PROD resta locked a `7557701`.

## 11. Safety

- ✅ zero production deploy (PROD `7557701`, deploy `6a2ecb8f`, locked True — verificato)
- ✅ zero backend (nessuna modifica Railway)
- ✅ zero DB write (nessun ordine, nessun Confirmar/A Cocina/updateEstado/delete)
- ✅ zero cleanup (`.tmp_grep` intatta; build artifact `version.json` non tracked, lasciato)
- ✅ zero push main (main `970daa6` invariato)
- ✅ `ORDINI_2026-05-23.md` non toccato / non staged
- ✅ deploy SOLO su staging `a3ad035a` con `--site` esplicito (trap CLI evitato)
