# La Dieci Bot V2 — Roadmap

Last consolidated: 2026-05-26.

This is the canonical roadmap for future sessions. It separates active work from suspended, planned, and historical work. Do not treat older planning files as current unless this roadmap points to them.

## 1. Active Priority

P1 active workstream:

```text
DELIVERY-MANUAL-GIRO-01
```

## 2. Product Objective

Create a lightweight manual delivery grouping flow for real service operations.

The operator must be able to group delivery orders into the same manual delivery round when automatic zones are not enough, especially around boundary cases or naturally compatible routes.

The feature must help kitchen and delivery coordinate without pretending to be an automatic routing system.

## 3. Included Scope

Included:

- Manual operator-controlled grouping of delivery orders.
- Clear visual indication that orders belong to a manual giro.
- Minimal Cocina signal: adjacent/near orders, compatible time, small marker.
- Entregas signal for grouped deliveries.
- Respect existing order lifecycle and delivery states.
- Respect `forno_out`, planned salida, and operator intent.
- Record manual grouping metadata/audit if needed.
- Keep data marked as manual/untrusted where appropriate.

## 4. Explicitly Excluded Scope

Excluded for this P1:

- Heavy route optimization.
- Automatic ETA training from `Salgo/Llegado`.
- Automatic route sequencing.
- Driver performance metrics.
- Rewriting delivery zone logic.
- Complex kitchen text or large explanatory UI.
- Resuming Economia work.
- Bot automatically sending grouped orders to kitchen.

## 5. Open Questions Before Coding

Answer these before implementation:

- Is a manual giro a first-class saved group, or metadata copied onto selected orders?
- Can one giro contain orders from different zones?
- Can one giro contain orders with different promised `hora` values?
- Which field is authoritative for group salida: existing `forno_out`, a new salida objetivo, or operator-selected time?
- What happens if one order in the giro is delayed or sent back from `LISTO` to `EN_COCINA`?
- Can a giro be edited or dissolved after creation?
- Should the marker appear only in UI, or also in printed/exported tickets if those exist?
- What minimum audit is required without making the feature heavy?

## 6. Suggested Micro-Steps

### DELIVERY-MANUAL-GIRO-01A — Product Shape

Status: DONE 2026-05-25. Volatile UI prototype shipped (commit `8b3ce19`), driver loading fix (`60f983d`), operator stress test matrix (`d40c203`), UX discoverability fix (`a8f97da`). Operator verdict: APPROVE AS UI PROTOTYPE. Not deployed.

Define the exact operator action:

- where the grouping starts;
- which orders are selectable;
- what label/marker appears;
- what data is stored;
- how the group is undone.

Output should be a short implementation spec, not code.

### DELIVERY-MANUAL-GIRO-01B — UI-Only Prototype Scope

Design the minimum visible behavior:

- Entregas shows grouped orders together or visibly linked.
- Cocina shows only a small `giro manual` marker and keeps the layout calm.
- Driver actions remain state-bound.

No ETA calculations.

### DELIVERY-MANUAL-GIRO-01C — Data Contract

Status: DONE and LIVE 2026-05-26 for P1C.1 persistence/wiring. Hybrid model approved and implemented across backend + frontend; frontend commit `addc6a7` is backed up at `backup/v2-manual-giro-p1c1-frontend-2026-05-26`; docs/deploy closure commit is `267c9d0`. Backend main/prod is aligned at `e14abd6`.

Decide the smallest safe data shape:

- group identifier or order-level marker;
- manual/untrusted flag;
- operator timestamp;
- optional salida objective;
- no dependence on real travel time.

No migration or database work until human approval.

### DELIVERY-MANUAL-GIRO-01D — Implementation

Status: PARTIAL. P1C.1 Entregas persistence is implemented, tested, and live on Netlify production. Cocina marker remains intentionally not implemented; `forno_out` aggregation remains blocked.

Only after product and data contract are approved:

- implement minimal frontend behavior;
- add or adjust backend only if explicitly required;
- keep changes small;
- do not deploy without explicit request.

### DELIVERY-MANUAL-GIRO-01E — Service Validation

Status: P1C.1 realistic smoke PASSED 2026-05-26 and production authenticated smoke PASSED after deploy. Broader real-service validation remains future work.

Validate during or after a real service:

- operator can group quickly;
- Cocina stays readable;
- Entregas helps dispatch;
- no false ETA confidence;
- manual/untrusted data remains clearly separated.

## 7. Minimum Tests

Before considering the P1 done, test:

- Two delivery orders same zone, same compatible time, grouped manually.
- Two delivery orders different zones but human-compatible route, grouped manually.
- One grouped order still `EN_COCINA`, one `LISTO`.
- Grouped order moves `LISTO -> EN_ENTREGA`.
- Grouped order is rolled back or delayed.
- Giro is edited or dissolved, if supported.
- Cocina remains minimal and readable.
- Entregas shows group without enabling invalid driver actions.
- No `Salgo/Llegado` duration is used for ETA/training.
- Existing ungrouped delivery flow still works.

Reference test sources:

- `LaDieciBotV2_DELIVERY_VIS_STRESS_MATRIX.md`
- `LaDieciBotV2_DELIVERY_ETA_STRESS_MATRIX.md`
- `LaDieciBotV2_TEST_MATRIX.md`
- `ORDINI_2026-05-23.md` for manual/untrusted evidence

P1C.1 smoke closure 2026-05-26:
- Two real delivery orders with real items were created via normal order flow: Q1/Q2, `hora` 21:20/21:40, each `1x El Pelusa`.
- Orders were visible in Entregas and Cocina.
- Create manual giro succeeded (`mg_260526_1`), chip `giro manual · G1` persisted after refresh.
- Removing one order auto-dissolved the giro and returned `getManualGiros=[]`.
- Recreate succeeded (`mg_260526_2`), explicit `disolver` cleared chips and returned `getManualGiros=[]`.
- Cocina stayed read-only for the feature: no manual-giro marker, no UI change, `forno_out` unchanged (`21:05`, `21:38`).
- Cleanup removed only test orders/clients `699000301/699000302`; `mg_260526_1` and `mg_260526_2` remain dissolved audit rows.
- Backend main/prod alignment completed before frontend deploy: local HEAD, `origin/main`, and Railway production verified at `e14abd6e93be2bf85ca64ad2649ba8fd3b54ea34`; `/health` OK; `/status` OK with database green; `getManualGiros` returned `200 []`.
- Production frontend deploy completed on correct Netlify site `magnificent-lollipop-6dff70` (site ID `02bd4c7a-a50b-4964-90da-8c1af1122932`), deploy ID `6a158473fb848b0f501bf5ec`, URL `https://magnificent-lollipop-6dff70.netlify.app`, `/version.json` commit `267c9d0`, functions `api` and `auth` loaded.
- Authenticated production smoke passed: existing login/session OK without exposing PIN; `Servicio > Entregas` loaded; UI showed `Sin entregas a domicilio`; no visible crash; no phantom manual-giro chips; no data created or modified. `getManualGiros` authenticated was not directly tested with a real token in that smoke.
- Accidental deploy to `soft-stroopwafel-e517fe` is not a valid production deploy. Future Netlify CLI deploys must include `--site 02bd4c7a-a50b-4964-90da-8c1af1122932`, `--dir=ladieci-app33/build`, and `--functions=ladieci-app33/netlify/functions`.

## 8. Workstreams Suspended

Economia/caja:

- Suspended by human decision.
- Recent commits exist, including ticket list, redesign, cleanup, and top clientes.
- Do not continue this workstream unless explicitly reactivated.

Route optimization:

- Excluded.
- Manual grouping should not become automatic route planning.

ETA training from delivery clicks:

- Excluded for now.
- `Salgo/Llegado/Entregado` are recorded but untrusted.

## 9. Future Workstreams

Future, not P1:

- Backend `/version` confirmation if still missing.
- Ops health/status hardening.
- Order modification badge UX.
- WhatsApp Delivery Q1 conservative automation.
- WhatsApp Review Agent with safer preview/diff/versioning.
- Economia continuation, only after human reactivation.
- Delivery data-quality strategy after enough reliable service data exists.

## 10. Criteria Of Done For DELIVERY-MANUAL-GIRO-01

Done means:

- Operator can manually group compatible delivery orders.
- Grouping is visible in Entregas.
- Cocina gets only a small, useful marker.
- Existing state rules remain intact.
- No heavy route optimization has been introduced.
- No untrusted delivery timing is used for calculations.
- Ungrouped delivery flow is unchanged.
- Minimum tests above pass.
- Documentation is updated in this roadmap and master context if behavior changes.

Note 2026-05-26: 01A volatile prototype criteria met; 01B/P1C data contract approved; P1C.1 frontend persistence wiring committed (`addc6a7`), backup pushed, backend main/prod aligned at `e14abd6`, and Netlify production deployed at `267c9d0` on the correct site. Full P1 still requires P1D Cocina marker decision/implementation if still desired and broader real-service validation 01E.

## 11. Rules For Future Codex Sessions

- Start from `LaDieciBotV2_MASTER_CONTEXT.md`, this roadmap, and `LaDieciBotV2_ARCHIVE_INDEX.md`.
- Do not read old prompt files as live truth.
- Do not trust `origin/main` as current state.
- Do not touch backend, database, migrations, `.env`, Railway, Netlify, or Supabase unless explicitly requested.
- Do not deploy, push, or commit unless explicitly requested.
- If a document conflicts with these canonical files, stop and report the conflict.
- Keep the product manual-first and operator-gated.
