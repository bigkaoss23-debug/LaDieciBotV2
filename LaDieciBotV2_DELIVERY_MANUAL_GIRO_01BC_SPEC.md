# La Dieci Bot V2 — DELIVERY-MANUAL-GIRO-01B/01C Spec

Last updated: 2026-05-26.

Scope: spec markdown only for the future persistent version of `DELIVERY-MANUAL-GIRO-01`. Successor of P1A (volatile UI prototype, commit `a8f97da`, verdict APPROVE AS UI PROTOTYPE). No deploy decisions inside this file — those happen after explicit operator authorization.

Current closure note 2026-05-26: P1C.1 backend endpoints and frontend Entregas wiring are implemented, validated, and live. P1D-MIN Cocina visibility is also live. Backend local HEAD/`origin/main`/Railway production are aligned at `e14abd6e93be2bf85ca64ad2649ba8fd3b54ea34`. Frontend P1C.1 commit `addc6a736d8d87758a7c7eb78b0439903ea005b7` (`addc6a7 feat persist manual delivery giros in entregas`) is backed up at `backup/v2-manual-giro-p1c1-frontend-2026-05-26`; P1D-MIN commit `eaf9e1a7ba608377ea778f464317708c1d8c554e` (`eaf9e1a feat show manual delivery giro in cocina`) is backed up at `backup/v2-manual-giro-p1d-min-cocina-2026-05-26`. Production Netlify deploy `6a159b40ef9b5b0b4e8ec515` is live on site `magnificent-lollipop-6dff70` (`02bd4c7a-a50b-4964-90da-8c1af1122932`).

## 1. Goal / Non-goal

Goal: when the operator knows two delivery orders from different automatic zones are physically close, allow grouping them in a single manual giro that **synchronizes production and delivery timing** across operators and survives page refresh.

Non-goal: route optimization, ETA training, driver performance scoring, automatic giro suggestions, multi-tenant, mobile-specific UI.

## 2. Current P1A behavior

`ladieci-app33/src/components/entregas/TabEntregas.jsx` keeps three React `useState`: `manualGiros`, `selectedManualGiroOrderIds`, `manualGiroSeq`. Selection uses the `+` button (24×24, yellow soft), creation needs ≥2 orders, chip `giro manual · G<n>` appears on each card, dissolve and per-order remove are local, auto-dissolve when active orders < 2. No API call, no DB write, no Cocina change, no impact on `forno_out` or `salida`. Refresh wipes everything.

## 3. Product rules (carry over to P1B/P1C)

- Operator-gated: nothing happens without the operator selecting.
- Manual/untrusted data: `Salgo`/`Llegado`/`Entregado` timestamps on grouped orders remain untrusted exactly as today.
- Cocina stays minimal: at most a small textual marker, no glow, no border, no dominant color.
- Driver actions remain bound to order `estado`; being in a giro never unlocks an invalid action.
- Operator can always override: warnings are soft, never hard blocks.

## 4. Data contract proposal

Minimal entities required.

`manual_giros`
- `id` text PK (short code, e.g. `mg_<seq>_<yymmdd>` or UUID — see Open Questions).
- `seq` int (per-day or global counter for display label `G<seq>`).
- `created_at` timestamptz.
- `created_by` text (operator identifier if available — see Open Questions).
- `dissolved_at` timestamptz NULL (soft-delete marker).

`ordenes` (extension)
- `manual_giro_id` text NULL — soft FK to `manual_giros.id`.
- `manual_giro_added_at` timestamptz NULL (per-order audit).

No other table touched. `delivery_logs`, `storico`, `clientes`, `config` unchanged.

Display label `G<n>` derives from `manual_giros.seq`, not from frontend state.

## 5. Persistence model options

A — Dedicated table `manual_giros` + join table `manual_giro_orders` (pure normalized). Pro: full add/remove history per order. Con: JOIN everywhere in Entregas render, more endpoints.

B — Metadata columns on `ordenes` only (`manual_giro_id`, `manual_giro_seq`, `manual_giro_added_at`). Pro: simplest migration, no JOIN. Con: no giro-level audit (who created, who dissolved), no entity to reason about.

C — Hybrid: `manual_giros` table + denormalized `manual_giro_id` on `ordenes`. Pro: giro-level audit preserved, render queries simple, auto-dissolve trivial. Con: per-order history of "was in giro X, moved to Y" is lost.

D — Single jsonb blob in `public.config` polled by frontend. Pro: zero migration. Con: race conditions with concurrent operators, no audit, no SQL queries. **Rejected.**

## 6. Recommended model

Option C (Hybrid).

Motivation:
- Audit at giro level preserved (debug: "why was this giro created/dissolved?").
- Entregas render: single SELECT on `ordenes` joined optionally with `manual_giros` only for header metadata.
- Auto-dissolve: SELECT COUNT WHERE manual_giro_id = X → if < 2, UPDATE manual_giros SET dissolved_at = now() + UPDATE ordenes SET manual_giro_id = NULL.
- Untrusted policy easy: any training/aggregate query adds `WHERE manual_giro_id IS NULL` or excludes via the `manual_giros` table presence.
- Rollback safe: column is nullable, old frontend continues to ignore it.

### Decision Gate — APPROVED 2026-05-25

Operator approved Option C as the persistence model. P1C.1 persistence + endpoints + frontend wiring base completed locally by 2026-05-26. P1C.2 (forno_out aggregation, §13) remains blocked behind a feature flag with default OFF and requires pizzaiolo validation in real service before any activation. Cocina UI changes stay out of scope until P1D. See §20 for per-question answers (Q1, Q2, Q3, Q5, Q6, Q7, Q8 decided; Q4 still blocked).

## 7. UI impact in Entregas

P1A keeps working visually. Internal change:
- `manualGiros` state derived from `ordenes` fetch (group by `manual_giro_id`), not from local `useState`.
- `manualGiroSeq` removed; display label uses `manual_giros.seq` from backend.
- Create/remove/dissolve trigger backend calls, with refetch after mutations and no optimistic giro membership update.
- Existing `ordenes` fetch/realtime provides `manual_giro_id`; frontend polls `getManualGiros` for metadata (`seq`, active/dissolved state). No new realtime channel.

Visual surface (chip, helper text, `+` button, action bar, warnings) unchanged from `a8f97da`.

## 8. Minimal UI impact in Cocina

Single addition: in TabCocina and PanelCocina order cards, a small `manual G<n>` text appended after the customer name in muted gray.
- No border, no background, no glow, no icon.
- Same font size as the order id grey text.
- Hidden when `manual_giro_id IS NULL`.

No new buttons, no new sections, no header changes in Cocina.

## 9. State transitions

Create: client sends `[orderId, orderId, ...]` (≥2). Backend transaction: INSERT manual_giros row → UPDATE ordenes SET manual_giro_id = new.id for all selected orders → return giro with seq. All-or-nothing.

Add order: UPDATE ordenes SET manual_giro_id = X, manual_giro_added_at = now() WHERE id = orderId AND manual_giro_id IS NULL (or moves: WHERE id = orderId, overwriting any prior id; see §11).

Remove order: UPDATE ordenes SET manual_giro_id = NULL WHERE id = orderId. Then auto-dissolve check.

Dissolve (explicit): UPDATE manual_giros SET dissolved_at = now() WHERE id = X → UPDATE ordenes SET manual_giro_id = NULL WHERE manual_giro_id = X.

Auto-dissolve: triggered after any remove or after any order status change that drops it from selectable set. If active orders count < 2 → same as explicit dissolve.

## 10. Refresh/reload behavior

Frontend reconstructs `manualGiros` from `ordenes` rows: group by `manual_giro_id NOT NULL`. Counter `G<n>` shown is the `seq` from backend, no local generation. Refresh/close/reopen tab/new operator → identical view (modulo polling delay). Multi-operator safe by construction.

## 11. Dissolve/remove behavior

- Operator clicks ×on a chip: remove that single order from giro. Auto-dissolve check runs.
- Operator clicks "disolver": explicit dissolve. All orders detached, giro soft-deleted.
- Order moves to a terminal state (RETIRADO, COMPLETADO): automatic remove from giro + auto-dissolve check.
- Order moves back from EN_ENTREGA to LISTO via operator override: stays in giro (no automatic re-add to a dissolved one).
- Moving an order from G1 to G2: single UPDATE overwriting `manual_giro_id`. G1 auto-dissolve check runs.
- Soft-delete via `dissolved_at` keeps the row in `manual_giros` for audit, but hides it from active queries (`WHERE dissolved_at IS NULL`).

## 12. Interaction with order statuses

Selectability rule from P1A unchanged: `tipo_consegna = 'DOMICILIO' AND estado IN ('EN_COCINA','LISTO','EN_ENTREGA')`.

Status change rules:
- EN_COCINA → LISTO: stays in giro.
- LISTO → EN_ENTREGA: stays in giro. Driver actions still bound to per-order state.
- EN_ENTREGA → RETIRADO: leaves giro automatically.
- LISTO → EN_COCINA (operator override): stays in giro.
- POR_CONFIRMAR / NUEVO: never in giro (not selectable).

A giro containing a mix of EN_COCINA and EN_ENTREGA is allowed (with warning, as in P1A) but the production sync recommendation in §13 must still apply.

## 13. Interaction with salida / forno_out

Recommended default to validate: align active orders in the manual giro to the latest effective `forno_out`/salida target, with operator/product validation required before implementation.

Rationale: orders with different `hora` values would otherwise sit on the kitchen counter cooling. Aligning to the latest forno_out trades earlier orders being slightly later (still hot) against avoiding cold pizzas. But aligning to the earliest would force the kitchen to push later orders unnaturally early. **Neither extreme is obviously right** — needs validation with a real pizzaiolo/operator during a service before implementation.

Until validated:
- Backend MUST NOT silently rewrite `forno_out` based on giro membership.
- P1C implementation parks this decision behind a feature flag or a separate step (call it P1C.2 if needed).
- TabCocina shows the per-order `forno_out` exactly as today; the `manual G<n>` marker is the only signal of grouping.

Decided 2026-05-25: parking confirmed. P1C.1 must NOT change `forno_out` based on giro membership under any circumstance. P1C.2, if ever implemented, MUST ship behind a feature flag with default OFF and stay OFF until the pizzaiolo validates the aggregation rule during a real service.

## 14. What must NOT feed ETA/training yet

Any future ETA model, route optimization, or driver scoring query MUST exclude rows where `manual_giro_id IS NOT NULL` (or the equivalent presence-check). Reason: manual giros are operator overrides; treating them as ground truth biases the model.

Add an explicit comment in the data dictionary and in any aggregation query at write time. The training exclusion is a hard rule, not a heuristic.

## 15. Manual/untrusted delivery tracking rule (extension)

The existing rule that `Salgo`/`Llegado`/`Entregado` timestamps on delivery orders are manual/untrusted (see `LaDieciBotV2_MASTER_CONTEXT.md` §9) extends unchanged to grouped orders. Being in a giro does not make the timestamps trustworthy. `delivery_logs` rows generated by these clicks are still aggregated by zone and stay aggregated by zone, regardless of giro membership.

## 16. Edge cases

- Two operators dissolve the same giro simultaneously: second UPDATE is a no-op (`dissolved_at IS NULL` becomes `IS NOT NULL` after first). No error surfaced.
- Operator A moves order X from G1 to G2 while operator B is removing X from G1: last-write-wins on `manual_giro_id`. Auto-dissolve check on G1 still runs from B's remove. Refresh resolves visual divergence.
- Service close (`chiudiServizio`): policy is to soft-dissolve all active giros at close time and detach all orders. `manual_giros` rows remain for storico/audit.
- Refresh mid-creation: optimistic chip disappears on the next fetch if the backend call failed. Show a brief "Error creando giro manual" toast.
- Order deleted entirely (`eliminaOrdine`): cascade detaches from giro, auto-dissolve check runs.
- 0 selectable orders left after status churn: existing giros auto-dissolve as their counts cross the threshold.

## 17. Human/operator stress test matrix for P1B/P1C

Reuse cases A01–H05 from `LaDieciBotV2_DELIVERY_MANUAL_GIRO_OPERATOR_STRESS_TEST.md`. Add these new cases:

- P1-01 two-operator concurrent create same giro id: each must get a distinct seq.
- P1-02 two-operator concurrent add order to different giros: order ends in one of the two, no duplication, the other operator sees the truth on next refresh.
- P1-03 two-operator dissolve same giro simultaneously: both succeed, no error toast.
- P1-04 refresh during create: chip appears on success, never as a ghost.
- P1-05 service close with active giros: all dissolved cleanly, no orphan `manual_giro_id`.
- P1-06 order moves to RETIRADO with 2-order giro: auto-dissolve triggers, no leftover chip.
- P1-07 LISTO → EN_COCINA override on grouped order: stays in giro, no error.
- P1-08 mixed-zone giro with hora delta > 25 min: warning visible, forno_out rule from §13 behaves as documented (read-only check until validated).
- P1-09 Cocina marker readability: `manual G<n>` visible but not dominant on busy TabCocina screen.
- P1-10 ETA/training query verification: aggregated tables exclude `manual_giro_id IS NOT NULL` rows.

Operator verdict template same as P1A matrix.

### P1C.1 realistic smoke result — PASSED 2026-05-26

Local frontend + Railway backend smoke used two normal delivery orders with real kitchen items:
- `TEST_GIRO_COCINA_2026-05-26_DELETE_OK_A`, tel `699000301`, Q1, `hora` 21:20, `1x El Pelusa`, `forno_out` 21:05.
- `TEST_GIRO_COCINA_2026-05-26_DELETE_OK_B`, tel `699000302`, Q2, `hora` 21:40, `1x El Pelusa`, `forno_out` 21:38.

Validated:
- Both orders visible in Entregas and Cocina before grouping.
- `createManualGiro` from UI created `mg_260526_1` and chip `giro manual · G1`.
- Page refresh preserved the chip.
- Removing one order auto-dissolved the giro with toast `Giro disuelto: quedan menos de 2 pedidos`; `getManualGiros` returned `[]`.
- Recreate created `mg_260526_2`; explicit `disolver` cleared chips; final `getManualGiros` returned `[]`.
- Cocina remained read-only for P1C.1: no manual marker, no UI change, no `forno_out` change.
- Cleanup removed only test orders and clients `699000301/699000302`; no `storico` rows existed. `mg_260526_1` and `mg_260526_2` remain as dissolved audit rows.

### P1C.1 production deploy result — LIVE 2026-05-26

- Backend verified before frontend deploy: local HEAD, `origin/main`, and Railway production aligned to `e14abd6e93be2bf85ca64ad2649ba8fd3b54ea34`; `/version` commit `e14abd6` branch `main`; `/health` OK; `/status` OK with database green; `getManualGiros` returned `200 []`.
- Frontend deployed to correct Netlify site `magnificent-lollipop-6dff70`, site ID `02bd4c7a-a50b-4964-90da-8c1af1122932`, deploy ID `6a158473fb848b0f501bf5ec`, production URL `https://magnificent-lollipop-6dff70.netlify.app`.
- `/version.json` showed commit `267c9d0`, commitFull `267c9d0edeb55a5e06a734025057cacf1679d35e`; Netlify functions `api` and `auth` were loaded.
- Authenticated production smoke passed without exposing PIN: `Servicio > Entregas` loaded, showed `Sin entregas a domicilio`, no visible UI crash, no phantom manual-giro chips, and no data created or modified.
- `getManualGiros` was not directly tested with a real auth token during the final human smoke, but the authenticated Entregas path loaded correctly.
- Accidental Netlify deploy to `soft-stroopwafel-e517fe` is not production truth. Future deploys must include `--site 02bd4c7a-a50b-4964-90da-8c1af1122932`, `--dir=ladieci-app33/build`, and `--functions=ladieci-app33/netlify/functions`.

### P1D-MIN Cocina visibility result — LIVE 2026-05-26

- Frontend commit `eaf9e1a7ba608377ea778f464317708c1d8c554e` (`eaf9e1a feat show manual delivery giro in cocina`) added only Cocina-side visibility: a small manual-giro badge/grouping in normal Cocina and full-screen PanelCocina.
- Scope remained frontend-only: no backend, no DB schema, no Repartidor/Economia, no route optimization, no `forno_out` write.
- Backup branch: `backup/v2-manual-giro-p1d-min-cocina-2026-05-26`.
- Local realistic smoke used two real delivery test orders with items; Cocina normal and PanelCocina full-screen both showed `GIRO MANUAL · G3` on grouped orders, refresh preserved it, `disolver` removed it, final `getManualGiros=[]`, and `forno_out` stayed unchanged.
- Cleanup removed only test orders/clients `699000401/699000402`; `mg_260526_3` remains as a dissolved audit row.
- Production deploy completed on Netlify site `magnificent-lollipop-6dff70`, site ID `02bd4c7a-a50b-4964-90da-8c1af1122932`, deploy ID `6a159b40ef9b5b0b4e8ec515`, production URL `https://magnificent-lollipop-6dff70.netlify.app`, unique URL `https://6a159b40ef9b5b0b4e8ec515--magnificent-lollipop-6dff70.netlify.app`.
- `/version.json` showed commit `eaf9e1a`, commitFull `eaf9e1a7ba608377ea778f464317708c1d8c554e`; Netlify functions `api` and `auth` were loaded and JSON error paths were OK.
- Production smoke passed: app loaded; existing session/login available without exposing PIN; `Servicio > Entregas` loaded with `Sin entregas a domicilio`; `Servicio > Cocina` loaded with `Cocina al día — sin pedidos`; no visible crash; no test orders created; no real data touched.

## 18. Implementation phases

- P1B — this spec + decision gate per §6 + open questions answered per §20. **Status: DONE 2026-05-25.** No code shipped in this phase.
- P1C.1 — migration + minimal backend endpoints (`createManualGiro`, `addOrderToManualGiro`, `removeOrderFromManualGiro`, `dissolveManualGiro`) + frontend wiring of P1A UI to backend. **Status: DONE AND LIVE 2026-05-26.** Frontend commit `addc6a7`; docs/deploy closure commit `267c9d0`; backup branch `backup/v2-manual-giro-p1c1-frontend-2026-05-26`; production Netlify deploy `6a158473fb848b0f501bf5ec`. Build, realistic Entregas+Cocina smoke, and authenticated production smoke passed. Out of scope: `forno_out` aggregation, Cocina UI changes.
- P1C.2 — separate step: `forno_out` aggregation rule from §13 implemented behind a feature flag with default OFF. **Status: BLOCKED.** Gated by Q4 (pizzaiolo validation in real service).
- P1D-MIN — Cocina mini-marker `giro manual · G<n>` in normal Cocina and full-screen PanelCocina. **Status: DONE AND LIVE 2026-05-26.** Frontend commit `eaf9e1a`; backup branch `backup/v2-manual-giro-p1d-min-cocina-2026-05-26`; production Netlify deploy `6a159b40ef9b5b0b4e8ec515`. No backend, no DB schema, no `forno_out` write.
- P1E — human stress test in real service using §17 matrix. **Status: not started.** Verdict gate before any deploy.

Each phase has its own backup branch and its own commit. No phase is implemented in the same session as the previous one without explicit operator authorization.

## 19. Explicit deploy policy

- No deploy without explicit operator authorization.
- P1C.1 is already deployed to production. Future Netlify CLI deploys must target the correct site explicitly:
  `netlify deploy --prod --site 02bd4c7a-a50b-4964-90da-8c1af1122932 --dir=ladieci-app33/build --functions=ladieci-app33/netlify/functions`.
- Migration is a separate, reviewed step; rollback plan is "drop column and table" (column is nullable, table is independent).
- Backup branch `backup/v2-manual-giro-p1c-migration-<date>` mandatory before P1C.1.
- Backup branch `backup/v2-manual-giro-p1d-cocina-<date>` mandatory before P1D.
- `origin/main` stays untouched throughout. All work lands on backup branches first.

## 20. Open questions

Answers recorded 2026-05-25 (operator decision). P1C.1 unblocked. Q4 still blocks P1C.2 only.

1. `manual_giros.id` format: short code `mg_<seq>_<yymmdd>`, UUID, or simple bigserial? Affects display vs uniqueness vs guessability.
   **Decided 2026-05-25**: short code `mg_<yymmdd>_<seq>` (e.g. `mg_260525_3`). Readable in logs, naturally scoped by day.

2. `seq` reset: per-day reset at service close, or monotonic forever? Per-day is friendlier for operators ("G3 today" vs "G412").
   **Decided 2026-05-25**: per-day reset aligned to Madrid TZ and `chiudiServizio`. Compute as `COALESCE(MAX(seq),0)+1` on rows with same Madrid date. Add UNIQUE constraint on `(day, seq)` to guard race.

3. `created_by`: do we have a reliable operator identifier today? If not, accept `created_by IS NULL` for P1C.1 and revisit when operator login lands.
   **Decided 2026-05-25**: no per-operator login today. Accept `created_by = 'pin_dashboard'` placeholder (or NULL). Revisit when per-operator login ships.

4. `forno_out` aggregation rule (§13): validate with pizzaiolo during a real service before P1C.2.
   **BLOCKED 2026-05-25**: requires pizzaiolo validation during a real service. P1C.2 only, behind feature flag, default OFF. No automatic `forno_out` change may ship in P1C.1.

5. Move-between-giros confirmation: silent (as P1A) or require operator confirm dialog?
   **Decided 2026-05-25**: silent as in P1A. Revisit in P1E only if operator confusion is observed in real service.

6. Auto-dissolve trigger: backend on every detach call, or scheduled job? Per-call is simpler and good enough at La Dieci scale.
   **Decided 2026-05-25**: per-call backend, inside the detach transaction. No scheduled job.

7. WebSocket vs poll: existing pattern enough, or new channel for giro events?
   **Decided 2026-05-25**: existing WS+polling pattern (see `App.jsx`) is sufficient. No new realtime channel. Include `manual_giro_id` in the `ordenes` payload.

8. `chiudiServizio` handling: soft-dissolve all giros, or hard-archive into `storico_manual_giros`?
   **Decided 2026-05-25**: soft-dissolve in place (`dissolved_at = chiusura time`). No `storico_manual_giros` table. Re-evaluate only if `manual_giros` grows beyond practical query size.

P1C.1 may begin in a separate session with explicit operator authorization. Q4 remains the sole open gate for P1C.2.
