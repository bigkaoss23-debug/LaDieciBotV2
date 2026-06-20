# V1_STAGING_PLANNER_OPERATOR_CLEAN_UI_FINAL — REPORT

**Data:** 2026-06-20
**Obiettivo:** ultimo cleanup UI del popup `Propuestas de entrega` — far parlare la UI da operatore, non da debugger. La logica planner è già corretta (popup apre giusto, route Q2→Q5, salida anchor non anticipata, timeline unica in `Giros y huecos`).
**Tipo:** **frontend-only**, renderer-only. Backend NON toccato (continua a mandare status/slip/margin; il FE li traduce). STAGING ONLY.

---

## 1. File modificati

- `ladieci-app33/src/components/PremiumPlannerPopup.jsx` — tutto il cleanup.
- `ladieci-app33/src/components/PremiumPlannerPopup.nextGiro.test.js` — aggiornati gli assert al nuovo copy (superato il copy della pass precedente).
- `ladieci-app33/src/components/PremiumPlannerPopup.uiCleanup.test.js` — riallineato alla "foto" del task (Q5 +6) + nuovi test card/chip/slip.

## 2. Cosa cambia in UI (labels rimosse / sostituite)

### Card superiore (giro compatibile)
| Prima | Dopo |
|---|---|
| `Encajar Q5` + `oportunidad` (ámbar/⚠) | **`Giro compatible Q5`** (verde/✓) |
| `Entrega 18:54` | **`Entrega cliente 18:54`** |
| `Q2 → Q5 (sur)` | **`Ruta Q2 → Q5 (sur)`** |
| `Confirmar con cliente: entrega pasaría a 18:54` + `Q2 se mueve +99 min · Q5 se mueve +6 min` | aviso piccolo: **`Atención: Q5 llegaría 19:06 (+6 min)`** (solo se l'ancla si muove) altrimenti `Solo si el cliente acepta esta hora.` |
| status `oportunidad` | rimosso |
- Bottone invariato: **`Revisar antes de aplicar`** (no auto-apply).

### Chip proposta
- `Encajar Q5` + status `oportunidad` → **`Usar giro Q5`** + ruta (`Q2 → Q5 (sur)`), niente `oportunidad`.

### Giros y huecos — riga compatta (quando `Usar giro Q5` selezionato)
- Prima: baseline vecchio `Q5 salida 18:47 → entrega 19:00 → regreso 19:13`.
- Dopo: preview reale `Q2 + Q5 · Salida 18:47 → [Cliente 18:54] → Entrega Q5 19:06 (+6) → Regreso 19:23`.
  - `Cliente 18:54` = **chip verde** (`.ppp-sl-leg.is-client`).
  - `(+6)` = slip ancla piccolo ámbar (`.ppp-sl-slip`), non allarme rosso.

### Giros y huecos — dettaglio espanso (RouteTimeline)
- Rimossi: badge `nuevo`/`en giro`, `prometido HH:MM`, slip `-99 vs prometido`, `+0 margen`, warning crudo per-nodo.
- Rimosso headline crudo `operatorMessage` (`Q2 se mueve +99 min · Q5 se mueve +6 min`) e il **summary duplicato** `ENTREGA GIRO / REGRESO` (già nella riga compatta).
- Sostituiti con: sottotitoli umani **`Entrega cliente`** (Q2) / **`Entrega giro`** (Q5) + un solo aviso `Q5 llegaría 19:06 (+6 min) · Confirmar antes de aplicar`.
- Badge `No recomendado` → **`Confirmar con cliente`** (ámbar) quando il motivo è solo accettazione cliente (`clientAcceptance`). Resta rosso solo per pericolo reale.

## 3. Regola No-invención
Tutte le ore/slip vengono dai campi GIÀ calcolati dal backend (`eta`, `slipLabel`, `routeTimeline`). Il FE legge `slipLabel` `+6` e `eta` `19:06` → compone `Q5 llegaría 19:06 (+6 min)`. Nessun calcolo orario lato frontend.

## 4. Test
```
Test Suites: 4 passed, 4 total
Tests:       34 passed, 34 total
```
(smoke + cabling + nextGiro aggiornati + uiCleanup ampliato). Build produzione: **green**, bundle `main.e3053a54.js`.

## 5. Deploy (FATTO — STAGING ONLY)
- Site: **`ladieci-v1-staging`** (`a3ad035a-e73f-4da3-8873-6403e31f04b6`), `--site` esplicito (mai PROD `02bd4c7a`).
- **Deploy ID finale: `6a36b03a3270fa8cfb9c67b3`** · URL: https://ladieci-v1-staging.netlify.app
- **Bundle live: `main.be6b4632.js`** (verificato sul live, hard).
- Incluse le functions (auth+proxy) con `--functions netlify/functions` (no drop su deploy --prod).
- ⚠️ Trappola gestita: la prima build LOCALE `npx react-scripts build` (bypassava il prebuild guard, env staging assenti) aveva baked-in i fallback PROD nel bundle (`ladiecibot-production`, `wnswassgfuuivmfwjxsf`). NON deployata. Rebuild corretto via `npm run build` con env staging + guard → Netlify rebuilda server-side con l'env store staging.
- Primo deploy `6a36afb2cee1296e606137c0` (bundle `fc5c6ac4`) aveva il `.js` pulito ma il `.map` conteneva i literali fallback prod (URL pubblici). Aggiunto `GENERATE_SOURCEMAP=false` in `netlify.toml` [build.environment] → redeploy `6a36b03a…` (`be6b4632`) senza `.map`.

### Verifica live (hard)
- `main.be6b4632.js`: **0** ref prod (`ladiecibot-production` / `wnswassgfuuivmfwjxsf` / `02bd4c7a`); staging refs presenti (`fearless-reverence` ×3, `tdikhfeinufaahagmpjz` ×3).
- `.js.map`: NON pubblicato (la URL risponde 200 ma è il fallback SPA `index.html`, content-type `text/html`, zero ref prod).
- **CSP live staging-only**: `connect-src 'self' fearless-reverence…railway.app tdikhfeinufaahagmpjz.supabase.co (+wss) nominatim photon`. Nessun dominio prod.

## 6. Zero prod touch
- Nessuna modifica a backend Railway, Supabase, WhatsApp. Nessuna scrittura DB. Nessun push su main. Nessun segreto/token/PIN stampato. netlify.toml resta scoped al branch (staging).

## 7. Cleanup `#001` / residui staging
- Nessun ordine test creato in questo task (frontend-only). **`#001` Q5 NON verificato programmaticamente qui** (richiederebbe auth/PIN sul proxy staging): da confermare vivo durante il photo smoke manuale. Eventuale residuo `#001`/`#005` → protocollo solito (PREVIEW poi DELETE fuori servizio).

## 8. Photo smoke (manuale, atteso)
Hard refresh staging → Nuevo Pedido → Big Art / C. Delfín → click `Próximo giro Q5`:
card `Giro compatible Q5` · `Entrega cliente 18:54` · `Ruta Q2 → Q5` · aviso `Atención: Q5 llegaría 19:06 (+6 min)` se Q5 slitta · chip `18:54 Usar giro Q5` · riga compatta `Salida 18:47 → Cliente 18:54 → Q5 19:06 (+6) → Regreso 19:23` · dettaglio pulito · bottone `Revisar antes de aplicar` · no auto-apply.
