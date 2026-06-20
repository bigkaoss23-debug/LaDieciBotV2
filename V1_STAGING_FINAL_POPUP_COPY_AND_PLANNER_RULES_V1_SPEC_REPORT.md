# V1_STAGING_FINAL_POPUP_COPY_AND_PLANNER_RULES_V1_SPEC — REPORT

**Data:** 2026-06-20 · STAGING ONLY · prod zero touch.

---

## BLOCCO A — micro-fix UI/copy popup `Propuestas de entrega` (frontend-only)

### File modificati
- `ladieci-app33/src/components/PremiumPlannerPopup.jsx` — copy/gerarchia.
- `ladieci-app33/src/components/PremiumPlannerPopup.nextGiro.test.js` + `…uiCleanup.test.js` — assert aggiornati.
- `ladieci-app33/netlify.toml` — già con `GENERATE_SOURCEMAP=false` (dal task precedente).

### Copy/gerarchia cambiati
1. **Bottone** giro compatibile: `Revisar antes de aplicar` → **`Confirmar giro compatible`** (resta ámbar `is-warning`, non verde pieno, per il piccolo impatto Q5). Il path rider-busy/unsafe mantiene `Revisar antes de aplicar` (invariato).
2. **Card superiore SECA**: rimosso il warning `Atención: Q5 llegaría 19:06 (+6 min)` dalla card. Card = `Giro compatible Q5` · `Entrega cliente 18:54` · `Ruta Q2 → Q5 (sur)` · bottone. (Helper `anchorSlipNote` e `cardSlipNote` rimossi: niente unused-var.)
3. **`+6` del Q5** vive in **Giros y huecos** (riga compatta): `Q5 19:06 +6` come **chip ámbar** più visibile (`.ppp-sl-slip` ora bordo+sfondo), non allarme rosso.
4. **Dettaglio espanso**: rimossa la frase ridondante `Confirmar antes de aplicar` (+ operatorMessage crudo già soppresso). Resta: titolo `Vista previa con el nuevo pedido` + badge `Confirmar con cliente` + timeline pulita (Salida 18:47 / Entrega cliente Q2 18:54 / Entrega giro Q5 19:06 / Regreso 19:23).
5. **Non reintrodotti**: `nuevo`, `prometido`, `-99 vs prometido`, `No recomendado`, `Q2 se mueve +99 min`, `oportunidad`, timeline duplicata.

### Test & build
- `PremiumPlannerPopup` suite: **35/35 PASS** (CI=true). Build strict CI=true green.

### Deploy (STAGING ONLY)
- Site `ladieci-v1-staging` (`a3ad035a`, `--site` esplicito, mai PROD `02bd4c7a`), `--functions netlify/functions`, `GENERATE_SOURCEMAP=false`.
- **Deploy ID: `6a36b5a2e5c2727c6eb99571`** · **bundle live: `main.d5b81e3a.js`**.
- **Verifica live (hard):** 0 ref prod (`ladiecibot-production`/`wnswassgfuuivmfwjxsf`/`02bd4c7a`); copy nuovo presente (`Confirmar giro compatible`, `Giro compatible`, `Entrega cliente`, `Usar giro`); `Confirmar antes de aplicar`=0, `Atención`=0; CSP staging-only (`fearless-reverence` + `tdikhfeinufaahagmpjz`, no prod). `Revisar antes de aplicar`=1 atteso (path rider-busy invariato).

---

## BLOCCO B — Planner Rules V1 (spec)

### File spec creato
- **`PLANNER_RULES_V1_OPERATOR_TRADEOFF.md`** (nuovo, nessun doc canonico preesistente — verificato: solo REPORT sparsi).

### Regole registrate
Tolleranza clienti 0–5 🟢 / 6–10 🟡 / >10 🔴 (rosso = decisione consapevole, non vietato) · cucina non modificabile sotto 15 min dalla salida/forno_out · risparmio rider solo informativo (mai blocco) · operatore sempre ultimo decisore · blocco vero solo per casi tecnici forti · esempio canonico Q2→Q5 (+6) · chip UI consigliati.

### Stato codice (dichiarato, backend NON toccato)
- ✅ **Implementato**: §5 blocco solo tecnico — `routeImpact.classifyRouteImpact` mette `blocked:false` per slip/durata/qualità (forzabile); blocco vero solo cross/no-impact/capacità. §3 nessuna regola "risparmio<X → blocca". §4 (FE) chip `Cliente`/`Q5 +N`, niente debug labels.
- ⚠️ **Parziale**: §1 oggi `NO_RECOMENDADO_SLIP_MIN=15` → una sola banda gialla (≤15 ajuste, >15 no_recomendado); mancano banda verde 0–5 e soglia rossa >10. §2 esiste anchor salida lock + `forno_out` autoritativo, ma manca freeze esplicito "salida−now<15min".
- ❌ **BACKLOG (non inventato nel FE)**: calcolo `riderSavingMin` (assente nel backend) → chip `Ahorra N min rider`; campo `cocinaState` → chip `Cocina estable/bloqueada`; bande tolleranza; freeze cucina <15 min. Dettaglio e ordine in §7 della spec.

---

## Conferme finali
- **Backend NON toccato** (solo letto, read-only, per dichiarare lo stato). Nessuna scrittura.
- **Prod zero touch**: no Netlify prod, no Supabase prod, no backend prod, no WhatsApp, no push main, nessun segreto/token/PIN stampato.
- **`#001` Q5 anchor**: NON verificato programmaticamente (richiede auth/PIN sul proxy staging) → confermare vivo durante l'ultimo photo smoke; altrimenti cleanup col protocollo solito (PREVIEW poi DELETE fuori servizio).
- Modifiche FE/spec in working tree, **non committate**.
