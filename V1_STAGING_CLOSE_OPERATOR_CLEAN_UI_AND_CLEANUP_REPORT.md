# V1_STAGING_CLOSE_OPERATOR_CLEAN_UI_AND_CLEANUP — REPORT FINALE

**Data:** 2026-06-20 · STAGING ONLY · prod zero touch · backend NON modificato.
**Esito:** blocco UI planner operator-clean **CHIUSO** (photo smoke PASS). Checkpoint + cleanup staging + backlog registrato. Nessun nuovo fix UI.

---

## Photo smoke — PASS (riassunto)
Popup `Propuestas de entrega` su staging:
button `Confirmar giro compatible` · chip `Usar giro Q5` · card pulita · mappa `Pizzería → Q2 → Q5` · `Giros y huecos` con `Q2 + Q5` · salida 18:47 · cliente 18:54 · Q5 19:06 `+6` · regreso 19:23 · dettaglio pulito. Nessun `nuevo` / `prometido` / `No recomendado` / `se mueve` / auto-apply.
**Verdetto: UI planner popup per questa fase = PASS / chiusa.**

## Deploy live (già verificato, nessun deploy aggiuntivo)
- Netlify staging `ladieci-v1-staging` (`a3ad035a`).
- Deploy **`6a36b5a2e5c2727c6eb99571`** · bundle **`main.d5b81e3a.js`**.
- Zero prod refs nel `.js` · CSP staging-only (`fearless-reverence` + `tdikhfeinufaahagmpjz`).

## FASE 1–2 — checkpoint scoped
File nel commit (scope esatto, niente fuori scope):
- `ladieci-app33/src/components/PremiumPlannerPopup.jsx`
- `ladieci-app33/src/components/PremiumPlannerPopup.nextGiro.test.js`
- `ladieci-app33/src/components/PremiumPlannerPopup.uiCleanup.test.js`
- `ladieci-app33/netlify.toml` (`GENERATE_SOURCEMAP=false`)
- `PLANNER_RULES_V1_OPERATOR_TRADEOFF.md` (spec)
- report di chiusura dell'arco UI (questo + i 3 report dell'arco) + `supabase_staging_cleanup_001.sql`

Esclusi: build output, dump, dati ordini, secrets, file fuori scope (altri report/sql di task non correlati restano untracked).

- **Commit hash:** vedi messaggio di chiusura / `git log` (questo report è dentro al commit, quindi non porta il proprio hash).
- **Backup branch:** `backup/v1-staging-planner-operator-clean-ui-final-2026-06-20` (vedi hash nel messaggio). NON push su main.

## FASE 3 — cleanup staging #001
- Confermato ambiente STAGING: `config.PIZZERIA_NOME = "La Dieci (STAGING)"`.
- `#001` LORENA SANCHEZ Q5 EN_COCINA 19:00 era ANCORA presente.
- **Fatto via anon (RLS aperta):** rimosse le **30** righe `orden_estado_logs` orfane di `#001`.
- **Bloccato:** la riga `ordenes #001` NON è cancellabile con la anon key (RLS lock su `ordenes`); il metodo sicuro (`eliminaOrdine` backend / service_role) richiede una chiave staging non disponibile localmente — **non estratta/non stampata** per rispetto delle regole.
- **Residuo dichiarato:** `ordenes` = **1** (solo `#001`); `orden_estado_logs(#001)` = 0; `manual_giros` = 0.
- **Azione pending:** eseguire `supabase_staging_cleanup_001.sql` (scoped a `#001`, con guard anti-prod) nel SQL editor del progetto staging per rimuovere la riga `ordenes`. Dopo: `ordenes` totali di test = 0.
- Preservati: seed `clientes`, `geo_cache`, config staging. Nessun dato prod toccato.

## Conferme
- **Backend NON modificato** (working tree `ladieci-bot` pulito; solo letto in read-only).
- **Prod zero touch:** no Netlify prod (`02bd4c7a`), no Supabase prod (`wnswassgfuuivmfwjxsf`), no backend prod (`ladiecibot-production`), no WhatsApp, no push main, nessun deploy prod, nessun segreto/token/PIN stampato.

## Pending / Backlog (non implementati ora)
1. **`PLANNER_COCINA_FREEZE_15_MIN`** — task BACKEND separato: cucina congelata se `salida/forno_out − now < 15 min` (no anticipo/ritardo/rimescolo; assorbi sulle successive). Solo documentato nella spec, NON implementato.
2. **Chip ritardi per-stop multi-ordine** in timeline (`Q5 +6`, `Q2 +4`, …) quando più ordini nello stesso giro — backlog UI, nessun task ora.
3. **`riderSavingMin` + `cocinaState`** — campi backend assenti (vedi §7 spec); restano backlog (non inventare nel frontend).
4. **Cleanup `ordenes #001`** — eseguire `supabase_staging_cleanup_001.sql` su staging (privilegi service/SQL editor).
