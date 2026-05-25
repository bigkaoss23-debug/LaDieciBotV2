# La Dieci Bot V2 — Delivery Manual Giro Operator Stress Test

Last created: 2026-05-25.

Scope: human/operator stress test for `DELIVERY-MANUAL-GIRO-01A`.

This is an operator validation matrix, not a technical unit-test plan. It validates whether the manual giro UI in `TabEntregas` is understandable, useful during service, and safe around existing delivery states.

## 1. Test Objective

- Validate whether the operator understands and uses `giro manual` correctly.
- Validate whether the UI survives real service edge cases without becoming noisy.
- Validate that manual giros do not confuse automatic zone grouping, order states, `Salgo/Llegado/Entregado`, Cocina, or Repartidor.
- Validate that `giro manual` stays what P1A says it is: UI-only, volatile, local, non-persistent, and non-authoritative.

## 2. Test Rules

- Do not test in production unless a human explicitly decides it.
- Do not deploy as part of this test.
- Do not use `Salgo`, `Llegado`, or `Entregado` timestamps as truth for ETA, training, or route quality.
- Do not treat `giro manual` as route optimization.
- Do not change DB, backend, migrations, Supabase, Railway, Netlify, or `.env`.
- Keep browser console open during every test.
- Annotate every confusing UI moment, even if the function technically works.
- Every row must be marked `PASS`, `FAIL`, or `BLOCKED`, with `NOTE OPERATORE`.

## 3. Setup Required

Recommended environment:

- Local dev or staging only.
- Browser with console open.
- Operator can access `Servicio > Entregas`.
- `TabEntregas` has enough delivery orders to test real grouping.

Required test data:

- At least 2 delivery orders in `EN_COCINA`.
- At least 2 delivery orders in `LISTO`.
- At least 2 delivery orders in `EN_ENTREGA`.
- Orders in the same zone.
- Orders in different zones.
- Orders with compatible `hora` values.
- Orders with `hora` distance greater than 15 minutes.
- Orders with `hora` distance greater than 25 minutes.
- If safely simulable: one order without `zona`.
- If safely simulable: one order without `direccion`.

Historical evidence:

- `ORDINI_2026-05-23.md` supports the rule that delivery click timings can be manual/batch-click and must remain untrusted.
- Do not copy customer details from historical orders into test notes unless a human explicitly approves.

## 4. Operator Test Matrix

Legend:

- `PASS`: behavior matches expected result and operator understands it.
- `FAIL`: behavior is broken, unsafe, or misleading.
- `BLOCKED`: test could not be executed because required data/state was missing.
- `NOTE OPERATORE`: write what the operator actually felt or misunderstood.

| ID | Title | Setup | Operator Action | Expected Result | Check In UI | Check In Console | PASS/FAIL | Notes |
|---|---|---|---|---|---|---|---|---|
| A01 | Basic creation, same zone | 2 delivery orders, both `LISTO`, same zone, compatible time. | Select both, click `Crear giro manual`. | A local group `G1` is created. Both cards show `giro manual · G1`. | No duplicate cards. Existing automatic zone block remains. Actions unchanged. | No React/runtime errors. |  |  |
| A02 | Basic creation, different zones | 2 delivery orders, both `LISTO`, different zones. | Select both, click `Crear giro manual`. | Group is allowed. Warning `Zonas diferentes` appears. | Warning is visible but not blocking. Operator understands this is manual override. | No errors. |  |  |
| A03 | Three orders in one giro | 3 delivery orders in selectable states. | Select all 3, create giro. | All 3 show same giro id. | Chips are readable on all cards. No separate duplicate section appears. | No errors. |  |  |
| A04 | Cancel selection before creation | At least 2 selectable delivery orders. | Select 2 orders, click `Cancelar selección`. | Selection clears and no giro is created. | Action bar disappears. No chips remain. | No errors. |  |  |
| B01 | Mixed states: EN_COCINA + LISTO | One `EN_COCINA`, one `LISTO`. | Select both and create giro. | Giro is allowed. | `EN_COCINA` card remains info-only; `LISTO` keeps normal allowed action. | No errors. |  |  |
| B02 | Mixed states: LISTO + EN_ENTREGA | One `LISTO`, one `EN_ENTREGA`. | Select both and create giro. | Giro is allowed. | `LISTO` and `EN_ENTREGA` retain their own state actions. | No errors. |  |  |
| B03 | Mixed states: EN_COCINA + EN_ENTREGA | One `EN_COCINA`, one `EN_ENTREGA`. | Select both and create giro. | Giro is allowed with stronger warning. | Warning `Cocina + en camino` is visible enough. | No errors. |  |  |
| B04 | EN_COCINA does not enable driver actions | One `EN_COCINA` in a manual giro. | Inspect card after grouping. | No driver action appears because of the giro. | Only `En cocina` pill/marker; no send/driver action unlocked. | No errors. |  |  |
| C01 | Warning: different zones | 2 selectable orders with different `zona`. | Select both. | Warning appears before creation and remains on grouped cards. | Warning is visible but not alarming like a hard error. | No errors. |  |  |
| C02 | Warning: hora >15 minutes | 2 selectable orders with `hora` difference over 15 minutes. | Select both. | Soft warning `Horarios >15 min`. | Operator notices it before creating. | No errors. |  |  |
| C03 | Warning: hora >25 minutes | 2 selectable orders with `hora` difference over 25 minutes. | Select both. | Stronger warning `Horarios >25 min`. | Strong warning is distinguishable from soft warning. | No errors. |  |  |
| C04 | Warning: missing zona | Selectable order without `zona`, plus another selectable order. | Select both. | Warning `Sin zona`. | Order can still be manually grouped if operator chooses. | No errors. |  |  |
| C05 | Warning: missing address | Selectable order without `direccion`, plus another selectable order. | Select both. | Warning `Sin direccion`. | Missing address remains obvious on the card. | No errors. |  |  |
| C06 | Warning: already in another giro | Create `G1`, then select one `G1` order with another order. | Attempt to create new giro. | Warning `Ya en giro`; creating new giro moves selected order into new group. | Old group either remains valid or auto-dissolves if below 2. | No errors. |  |  |
| D01 | Remove one order from 3-order giro | A manual giro with 3 orders. | Click `x` on one grouped order. | That order leaves the giro; the other 2 remain grouped. | Removed order loses chip. Remaining two keep same giro id. | No errors. |  |  |
| D02 | Remove one order from 2-order giro | A manual giro with 2 orders. | Click `x` on one grouped order. | Giro auto-dissolves because fewer than 2 active orders remain. | Both cards lose giro chip. | No errors. |  |  |
| D03 | Dissolve giro | A manual giro with 2+ orders. | Click `disolver`. | Entire giro disappears. | All related chips disappear. No order disappears. | No errors. |  |  |
| D04 | Recreate after dissolve | Dissolve `G1`, then create another giro. | Select 2 orders and create giro again. | New giro is created. Id may advance (`G2`) because counter is session-local. | Operator is not confused by advanced id. | No errors. |  |  |
| D05 | Move order from G1 to G2 | Existing `G1`; select one `G1` order and another order. | Create a new giro. | Selected `G1` order moves to new giro; old giro remains only if still has 2+ orders. | No duplicate group membership shown. | No errors. |  |  |
| E01 | Lifecycle LISTO -> EN_ENTREGA | Order in manual giro is `LISTO`. | Use normal delivery action to move it to `EN_ENTREGA`. | Order remains visible if still active and chip does not break UI. | State icon/action changes according to normal flow. Giro chip remains only if order is active/selectable. | No errors. |  |  |
| E02 | Lifecycle EN_ENTREGA -> RETIRADO | Order in manual giro is `EN_ENTREGA`. | Mark as delivered with normal operator flow. | Order exits active Entregas flow. Giro updates or dissolves safely. | No stale chip on removed/retired order. | No errors. |  |  |
| E03 | Order disappears from list | Any grouped order is removed from active list by normal data refresh/state change. | Wait for refresh or trigger normal state change. | UI does not crash. Giro removes inactive id. | Remaining group either stays valid or dissolves. | No errors. |  |  |
| E04 | Refresh page | One or more manual giros exist. | Refresh browser. | Manual giros disappear. | No chips remain after refresh. This is expected P1A behavior. | No errors. |  |  |
| E05 | No persistence after refresh | After E04. | Reopen Entregas after refresh. | No manual giro is restored from backend. | Operator understands this is volatile. | No errors. |  |  |
| F01 | Many orders in Entregas | Busy Entregas screen with many delivery cards. | Create 2-3 manual giros. | UI remains readable. | Chips do not dominate cards. Action bar remains compact. | No errors. |  |  |
| F02 | Rapid selection | Many selectable orders. | Select/unselect quickly. | Selection state stays correct. | Action bar count matches selected cards. | No errors. |  |  |
| F03 | Multiple giros G1/G2/G3 | Enough orders for 3 groups. | Create 3 manual giros. | Each group has distinct id. | No visual duplication. No accidental merging. | No errors. |  |  |
| F04 | No duplicated visual orders | Multiple manual and automatic groupings visible. | Scan Entregas. | Orders appear only in their existing automatic blocks/list. | No separate `Giros manuales` section exists. | No errors. |  |  |
| F05 | Chip density | Cards with long names/address plus giro chip/warnings. | Inspect on desktop and mobile width if possible. | Text remains readable. | Chip/warnings do not cover address, totals, or actions. | No errors. |  |  |
| G01 | Normal delivery flow without giro | Delivery order not in manual giro. | Use ordinary delivery actions. | Existing behavior unchanged. | No manual UI required for normal flow. | No errors. |  |  |
| G02 | Normal Salgo / send driver | `LISTO` delivery order. | Use normal send driver action. | Normal state transition still works. | Loading indicator uses existing `loadingId`. | No errors. |  |  |
| G03 | Registrar salida manualmente | `EN_ENTREGA` order with missing `partito_alle`. | Click `Registrar salida`. | No `setDriverLoading` runtime error. Loading state clears after action. | Button disables while request is in progress if visible. | No `setDriverLoading is not defined`. |  |  |
| G04 | Entregado/manual override | `EN_ENTREGA` order. | Confirm delivered with operator override. | Existing delivered flow works. | Order becomes delivered/removed as before. | No errors. |  |  |
| G05 | Giro does not affect driver actions | Group contains mixed states. | Inspect all grouped cards. | Actions depend on each card state, not on giro membership. | `EN_COCINA` has no driver actions; `LISTO`/`EN_ENTREGA` keep their normal rules. | No errors. |  |  |
| H01 | Operator meaning check | Operator sees `giro manual · G1`. | Ask what it means. | Operator says it is a manual grouping, not automatic route calculation. | Label is clear enough. | N/A |  |  |
| H02 | Volatile behavior check | Operator creates giro, then refreshes. | Ask what happened. | Operator understands it disappears in P1A. | If surprising, mark UX risk. | N/A |  |  |
| H03 | Manual/untrusted check | Operator uses Salgo/Llegado/Entregado around a giro. | Ask whether system should calculate ETA from this. | Operator understands those clicks are not reliable truth yet. | No UI implies automatic ETA/training. | N/A |  |  |
| H04 | Real-service usefulness | Operator uses prototype during a simulated busy moment. | Ask if they would use it in true service. | Operator can name at least one useful real case. | If it slows them down, mark product risk. | N/A |  |  |
| H05 | Requested UI changes | After full test. | Ask what should change before deploy/P1B. | Operator gives concrete notes. | Capture wording, location, and priority. | N/A |  |  |

## 5. Success Criteria

Minimum pass threshold for P1A as a valid UI prototype:

- All blocking safety tests pass: `B04`, `E04`, `E05`, `G01`, `G02`, `G03`, `G04`, `G05`.
- At least 80% of the full executable matrix passes.
- No console runtime errors during manual giro creation, edit, dissolve, refresh, or normal delivery flow.
- Operator can explain in their own words what `giro manual` means.
- Operator can explain that P1A is volatile and disappears after refresh.
- No order is visually duplicated.
- No driver action becomes available because an order belongs to a manual giro.

Blocking errors:

- Runtime crash in `TabEntregas`.
- Any `EN_COCINA` order gains driver actions because of manual giro.
- Manual giro creates, changes, or persists backend data in P1A.
- Manual giro changes `estado`, `hora`, `forno_out`, `zona`, address, or delivery fee.
- Refresh restores a manual giro unexpectedly.
- Order appears duplicated in the UI.
- `Registrar salida` throws `setDriverLoading is not defined`.
- Operator believes the feature is automatic route optimization.

UX minor issues:

- Chip too small, but understandable.
- Warning wording needs improvement.
- Giro id counter advances after dissolve (`G2` after dissolving `G1`) and operator is not confused.
- Warning colors need tuning but are not mistaken for hard blocks.
- Dense cards need spacing adjustments but remain usable.

Pass to P1B/persistent version only if:

- Operator approves the gesture as useful.
- Blocking tests are green.
- The team decides what persistence means: order-level metadata, local audit event, or first-class giro entity.
- The team decides how to show persistence without pretending route optimization.
- The team decides whether Cocina should receive a minimal marker in a later step.

Do not continue to P1B if:

- Operator does not understand the feature.
- Operator would not use it during real service.
- Manual grouping makes the delivery screen slower to scan.
- It creates confusion between automatic zone groups and human judgment.
- It encourages using `Salgo/Llegado` as reliable ETA/training data.

## 6. Operator Verdict

Choose exactly one after the test:

- `APPROVE AS UI PROTOTYPE`
- `NEEDS UI FIX`
- `NEEDS PRODUCT RETHINK`
- `DO NOT CONTINUE`

Operator notes:

```text
Verdict: APPROVE AS UI PROTOTYPE
Tester: Codex autonomous run + human operator confirmation
Date: 2026-05-25
Environment: localhost:8888 via `DEV_AUTH_BYPASS=true netlify dev` (no deploy)
Main reason: All blocking matrix cases pass (B04, G01-G05, no duplications, refresh leaves no chip, manual driver salida loading fix verified). UX discoverability fixed in commit a8f97da (visible "+" toggle + dashed helper text).
Top 3 fixes before next step:
1. Persistence/data-contract (P1C) before any further user-facing change.
2. Decide if `manualGiroSeq` should reset after total dissolve.
3. Add a clearer volatility hint before the first giro is created (current hint only inside chip tooltip).
```

## 7. Post-Test Review Checklist

- Did `ORDINI_2026-05-23.md` remain only historical/manual-untrusted context?
- Were no sensitive customer details copied into notes?
- Were no DB/backend/migration/env changes made?
- Was no deploy performed?
- Did normal delivery still work without manual giro?
- Did the fix for manual `Registrar salida` remain green?
- Did the operator explicitly confirm whether the prototype is worth persisting?

## Operator Verdict Decision Guide

Use this guide after completing the matrix and operator interview.

Choose `APPROVE AS UI PROTOTYPE` if:

- All blocking cases pass.
- The operator understands the concept of `giro manual`.
- The UI is usable under service pressure.
- No invalid driver actions are enabled.
- There are no visual duplications or confusing duplicate order placements.
- Volatile/refresh behavior is understood and accepted for P1A.

Choose `NEEDS UI FIX` if:

- The concept is valid, but the UI is confusing.
- Chips, buttons, or warnings are too noisy.
- Selection, order removal, or dissolve behavior is not clear enough.
- The operator would use it after small visual corrections.

Choose `NEEDS PRODUCT RETHINK` if:

- The operator does not understand the concept.
- Manual giro does not match the real service flow.
- Volatile/local behavior makes the test not useful enough.
- Persistence or multi-operator behavior is required before judging the feature properly.

Choose `DO NOT CONTINUE` if:

- The feature creates dangerous operational confusion.
- It enables or suggests wrong driver actions.
- It causes order/state errors.
- It slows down service.
- The operator says they would not use it during real service.
