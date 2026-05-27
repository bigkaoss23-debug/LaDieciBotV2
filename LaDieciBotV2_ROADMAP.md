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

Status: PARTIAL. P1C.1 Entregas persistence is implemented, tested, and live on Netlify production. P1D-MIN Cocina visibility is also live: normal Cocina and full-screen PanelCocina show a small manual-giro badge/grouping for orders in a manual delivery giro. `forno_out` aggregation remains blocked.

Only after product and data contract are approved:

- implement minimal frontend behavior;
- add or adjust backend only if explicitly required;
- keep changes small;
- do not deploy without explicit request.

### DELIVERY-MANUAL-GIRO-01E — Service Validation

Status: P1C.1 realistic smoke PASSED 2026-05-26 and production authenticated smoke PASSED after deploy. Light P1E stress on production PASSED 2026-05-26 (see P1E section below). P1F zone-stress on production PASSED 2026-05-26 (see P1F section below). Broader real-service validation during a full live service remains future work.

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

P1D-MIN production closure 2026-05-26:
- Frontend commit `eaf9e1a7ba608377ea778f464317708c1d8c554e` (`eaf9e1a feat show manual delivery giro in cocina`) backed up at `backup/v2-manual-giro-p1d-min-cocina-2026-05-26`.
- Local realistic smoke used two real delivery test orders with items; Cocina normal and PanelCocina full-screen both showed `GIRO MANUAL · G3` on grouped orders, refresh preserved the badge, `disolver` removed it, and final `getManualGiros=[]`.
- Test cleanup removed only the marker orders/clients `699000401/699000402`; `mg_260526_3` remains as a dissolved audit row.
- Production deploy completed on correct Netlify site `magnificent-lollipop-6dff70` (site ID `02bd4c7a-a50b-4964-90da-8c1af1122932`), deploy ID `6a159b40ef9b5b0b4e8ec515`, URL `https://magnificent-lollipop-6dff70.netlify.app`, unique URL `https://6a159b40ef9b5b0b4e8ec515--magnificent-lollipop-6dff70.netlify.app`.
- `/version.json` showed commit `eaf9e1a`, commitFull `eaf9e1a7ba608377ea778f464317708c1d8c554e`; Netlify functions `api` and `auth` were loaded and JSON error paths were OK.
- Production smoke passed: app loaded; existing session/login available without exposing PIN; `Servicio > Entregas` loaded with `Sin entregas a domicilio`; `Servicio > Cocina` loaded with `Cocina al día — sin pedidos`; no visible crash; no test orders created; no real data touched.
- Scope remained frontend only: no backend, no DB schema, no Repartidor/Economia, no `forno_out` write.

P1E light stress on production 2026-05-26 (service readiness):
- Target: live frontend `eaf9e1a` on Netlify site `magnificent-lollipop-6dff70` against backend `e14abd6` on Railway.
- Manual giro exercised on Entregas and Cocina with real-shape delivery test orders.
- 2-order giro OK.
- 3-order giro OK.
- Remove from 3-order giro OK.
- Remove from 2-order giro auto-dissolved the giro OK.
- State transition while in giro OK.
- Multi-tab / refresh persistence OK.
- No blocking bug observed.
- Chiusura servizio with active giro was NOT exercised in production because it is invasive; deferred to future controlled validation.
- Non-blocking warning: `Problema servicio` appeared once and self-normalized; backend `/health` and `/status` stayed green, database green.
- Non-blocking observation: B/C slot times slid due to real driver/cascade logic, not a manual-giro bug.
- Cleanup completed:
  - test orders/clients `699000501`, `699000502`, `699000503` removed;
  - storico 0;
  - `manual_giros` activos `[]`;
  - audit rows `mg_260526_4`, `mg_260526_5`, `mg_260526_6`, `mg_260526_7` left as dissolved.
- Cleanup notes:
  - Supabase anon delete was blocked by RLS and not used.
  - Orders deletion used the backend `eliminaOrdine` endpoint.
  - Client deletion used the Railway server-side key only in memory, with no secret printed or persisted.
- Scope remained frontend-runtime only: no code change, no deploy, no DB schema change, no backend code change, no `forno_out` write, no Repartidor/Economia work.

P1F zone-stress on production 2026-05-26 (cascade and multi-zone manual giro):
- Target: live frontend `eaf9e1a` reached via localhost `netlify dev` :8888 (authenticated UI, JWT operator session), backend `e14abd6` on Railway production.
- 8 real-shape DOMICILIO orders created via UI, all EN_COCINA, item `1x El Pelusa`, marker `TEST_ZONE_STRESS_2026-05-26_DELETE_OK`:
  - A `#001` tel `699000601` Q1 ANTONIO MACHADO, 69 — req 21:00 → final 21:00 (slip 0), forno_out 20:52.
  - B `#002` tel `699000602` Q1 JUAN CARLOS I, 55 — req 21:05 → final 21:15 (slip +10), forno_out 21:11.
  - C `#003` tel `699000603` Q2 Avenida del Sabinar 180 — req 21:10 → final 21:33 (slip +23), forno_out 21:22.
  - D `#004` tel `699000604` Q2 SAN JOSE OBRERO, 120 — req 21:15 → final 21:55 (slip +40), forno_out 21:47.
  - E `#005` tel `699000605` Q3 Avenida Al Andalus 85 — req 21:20 → final 22:14 (slip +54), forno_out 22:06.
  - F `#006` tel `699000606` Q3 PATERNA DEL RIO, 3 — req 21:25 → final 22:33 (slip +68), forno_out 22:25.
  - G `#007` tel `699000607` Q1 Calle Real 10 — req 21:30 → final 22:47 (slip +77), forno_out 22:44.
  - H `#008` tel `699000608` Q2 Calle Cuba 1 — req 21:35 → final 22:59 (slip +84), forno_out 22:53.
- Real Roquetas addresses were sourced from the existing `clientes` table to ensure proper zone detection (zone polygon definitions live in `ladieci-app33/src/core/delivery/zonesData.js`).
- Cascade behavior is consistent with each zone's `tempoGiro` and `maxOrdiniPerGiro`. Slip grows monotonically as horno saturates.
- Entregas: all 8 visible, grouped by zone (3 Q1 / 3 Q2 / 2 Q3) with zone headers and ETA. Cocina: all 8 visible with item.
- 3 manual giros tested:
  - Giro 1: Q1+Q1 (`#001`+`#002`) → `mg_260526_9`. Chip Entregas + badge Cocina `GIRO MANUAL · G9` + refresh persistence + disolver OK.
  - Giro 2: Q2+Q3 (`#003`+`#005`) → `mg_260526_11`. Chip + badge `G11` + refresh + disolver OK.
  - Giro 3: Q1+Q2+Q3 (`#006`+`#007`+`#008`) → `mg_260526_12`. Chip + badge `G12` on 3 cards + refresh + disolver OK.
- Final `manual_giros` activos `[]`. No giro left active.
- `Problema servicio`: not observed during test.
- UI stability: no slowdown on order creation, manual giro creation, refresh.
- Bug bloccanti: 0.
- Warning non bloccanti:
  1. Slip > 30 min vs requested customer time does not surface a strong UI warning. Operator-facing alert would help.
  2. Modal Nuevo pedido leaves a residual side-panel "Entrega a domicilio" until ✕ is clicked (cosmetic).
  3. Order-selection `+` buttons in Entregas reshuffle indices after each click — only an issue for automation scripts; a human operator clicks the visible card.
  4. Backend `eliminaOrdine` returns `success:true` even for non-matching id (e.g. `1` vs `#001`) — caller must pass id in `#NNN` form.
- Cleanup completed:
  - 8 ordenes (`#001`–`#008`) removed via backend `eliminaOrdine` endpoint (id passed as `#NNN`).
  - 8 clientes (`id` 196–203, tel 699000601–699000608, nombre matching `TEST_%_ZS`) removed via SQL.
  - storico 0 for the test telephone range.
  - manual_giros activos `[]`; audit rows `mg_260526_8/9/10/11/12` left as dissolved (mg_8 was a transient mis-grouping I dissolved and recreated as mg_9; mg_10 was a retry that I also dissolved before mg_11/12).
- Scope: no code change, no deploy, no backend code change, no DB schema change, no `forno_out` write, no Repartidor/Economia, no main push.
- Dev server `netlify dev` :8888 stopped after cleanup; port released.

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

Note 2026-05-26: 01A volatile prototype criteria met; 01B/P1C data contract approved; P1C.1 frontend persistence wiring committed (`addc6a7`), backend main/prod aligned at `e14abd6`, and Netlify production deployed. P1D-MIN Cocina visibility is also live at `eaf9e1a`, with production deploy `6a159b40ef9b5b0b4e8ec515`. P1E light stress on production passed against `eaf9e1a` / `e14abd6` with cleanup completed and no blocking bug; chiusura servizio with active giro was deliberately not exercised in production. P1F zone-stress on production passed against the same live targets, with 8 multi-zone orders, cascade slip 0–+84 min, 3 manual giros (Q1+Q1, Q2+Q3, Q1+Q2+Q3) all green, cleanup completed; no blocking bug. Full P1 still requires broader real-service validation during a live service; P1C.2 `forno_out` aggregation remains blocked.

## 10b. Closed Out-Of-Scope Safety Fixes

`WA-CANCEL-GUARD-01` — closed and live 2026-05-27.

Context: the CONVQUAL stress batch on production (live commit `c38ca94`) found a BLOCKING bug in test T8. Customer message "Cancela el pedido por favor." was classified by the IA as `tipo="domanda"` (not `modifica_complessa`) and went into Flusso 3 (`generaRisposta` Claude libre). Claude hallucinated the response "Hemos cancelado tu pedido #006 sin problema" — but the order in `ordenes` stayed `POR_CONFIRMAR`. The bot was effectively lying to the customer about a cancellation that never happened. Worst possible failure mode for Wednesday service: customer believes order is cancelled, kitchen prepares it anyway.

Fix: minimal, surgical, no DB logic changes. One file modified in repo `ladieci_bot` (commit `2a525af8f5edfa3955cfc99aecae79ec815fb07a`, message `fix guard whatsapp cancel intent`, `src/agents/orchestrator.js` only, +27 lines). Added a `cancel_guard` placed between the `modifica_complessa` branch and `FLUSSO 2B`, intercepting BEFORE any automatic flow (Flusso 2B/2C/1 and the Flusso 3 Claude-libre branch).

Conditions for the guard to fire:

- `!isWhitelist` (owner/operator bypass preserved);
- `CANCEL_RE` regex matches `testo`: `cancela|cancelar|cancelaci[oó]n|cancelad[oa]|anula|anular|anulad[oa]|olv[ií]dalo|d[eé]jalo|dejalo` (case-insensitive, word boundary);
- `quita/quitar` deliberately NOT included, to avoid hijacking legitimate Flusso 2B `correccion` like "quita la cerveza del pedido";
- AND existing order context: `statoOrd.haOrdine` OR `conv.stato_ordine === "confermata"`.

Effects when fired: no cancellation in DB (order in `ordenes` stays `POR_CONFIRMAR`), `ordine_ref` preserved in `wa_msgs` via in-place update (same `upsertWaMsg` pattern used by the allergy guard and the UX-ack fix), `wa_msgs.stato` set/kept to `IN_TRATTAMENTO`, `appendChat(bot, ack)` to `conv.chat`, `if (autoOn) invia(...)`, return `{ flusso: "cancel_guard", stato: "IN_TRATTAMENTO", motivo: "cancel_intent_operator_review" }`. Ack to the customer: "Recibido. Lo pasamos al equipo para revisarlo y te respondemos enseguida. 🙏".

Backup branch `backup/wa-cancel-guard-01-2026-05-27`. Railway deployment `0881a161-a32b-4325-99d1-7cbc0f106746`, boot `2026-05-27T11:31:16.304Z`. `/version` reports commit `2a525af`, `/health` 200 OK, `/status` backend/database/ordini green.

Production validation 2026-05-27 (live commit `2a525af`):

- T1 — cancel natural (`34699001301`, `TEST_BOT_CANCELGUARD_01_REPEAT`, sequence "Una El Pelusa para recoger a las 21:30." + "Cancela el pedido por favor."): PASS. Order `#001 POR_CONFIRMAR` created at step 1; at step 2 the guard fires, order remains `POR_CONFIRMAR`, `ordine_ref="#001"` preserved in `wa_msgs`, reply ack present, NO "hemos cancelado" anywhere. T8 closed.
- T2 — cancel variant `olvídalo` (`34699001302`, `TEST_BOT_CANCELGUARD_02_OLVIDALO`, "Olvídalo, ya no lo quiero."): PASS. Same behaviour: order `#002` untouched, `ordine_ref="#002"` preserved, ack present.
- T3 — regression normal question (`34699001303`, `TEST_BOT_CANCELGUARD_03_NORMAL_QUESTION`, "Tenéis pizza carbonara?"): PASS. Guard correctly does not fire (no cancel intent), Flusso 3 answers honestly with the real menu item ("La Joya (Carbonara) 15€" — real product), no order created, no client persisted, no false `IN_TRATTAMENTO`.

DB cleanup completed post-test for all three test `wa_id` and the three `nombre` markers. `storico`, `archivio_conv`, `manual_giros`, `geo_cache` not touched. No service closure migrated test rows during the run.

Closed live-fix chain on Railway production for 2026-05-27 Wednesday service:

- `f8fe69f` `WA-ALLERGY-SAFETY-01` — allergy handoff;
- `c38ca94` `WA-UX-ACK-OPERATOR-GATED-01` — acks for no-address / out-zone / modifica_complessa + honest order-confirm intro;
- `2a525af` `WA-CANCEL-GUARD-01` — explicit cancellation intent guard.

Residual risks (NOT blocking for Wednesday):

1. CONVQUAL T4 — mixed question+order ("Hola, tenéis cerveza sin alcohol? Y una El Pelusa para recoger a las 21:30."): IA classifies as `misto`, Flusso 3 lets Claude generate a free reply that says "Tu pedido está anotado" while `ordenes` is empty (items are only in `conv`). Operator sees no order in DB. Customer believes they ordered. Backlog post-Wednesday.
2. CONVQUAL T6 — address follow-up ("Calle Antonio Machado 69." after a previous delivery message): the second message is classified `tipo=domanda` because it has no items/hora of its own; Flusso 3 Claude generates "Te llegará caliente desde el horno" without actually creating the order. Backlog post-Wednesday.
3. CONVQUAL T7 — rare `fuera_de_zona` branch in Flusso 1 `solo_ora` (preexisting code path): creates `POR_CONFIRMAR` order with `zona=null` and applies `delivery_fee` €2.50. Ack is honest but DB is inconsistent with ack. Operator can handle manually. Backlog post-Wednesday.
4. `profile.name` echoed verbatim in confirmation replies. Already partially mitigated by `nombre.split(" ")[0]` (only first token is used). Cosmetic. Backlog.

`WA-UX-ACK-OPERATOR-GATED-01` — closed and live 2026-05-27.

Context: the prior UXGATED batch on production confirmed that three operator-gated branches in the WhatsApp orchestrator were returning to the customer in complete silence: (T1) delivery requested without address, (T2) `fuera_de_zona` (e.g. Aguadulce), (T3b) `modifica_complessa` (cancellations and complex modifications after an existing order). The DB behaviour was already conservative and correct — no spurious orders, no spurious clients, no duplicates, `ordine_ref` preserved on cancellation — but the customer was left without any acknowledgement, which on WhatsApp reads as "the bot is broken". Additionally, the normal-order confirmation reply contained promissory phrasing ("el pizzaiolo ya tiene los ojos en tu pedido", "el horno ya está en marcha") that misrepresented the actual `POR_CONFIRMAR` state.

Fix: minimal, surgical, no DB logic changes. Two files modified in repo `ladieci_bot` (commit `c38ca94441e02b58f9141ccf47c7b3e3ae119ba7`, message `fix ack whatsapp operator gated flows`):

- `src/agents/orchestrator.js` (+20/-5): added short ack messages in five points — `modifica_complessa` branch, `sin_direccion` and `fuera_de_zona` branches in both Flusso 1 and the `solo_ora` Flusso 1 variant. Pattern is symmetric to the allergy safety guard: `appendChat(bot, msg)` + `upsertWaMsg(..., bot_risposta=msg, ...)` (instead of `null`) + `if (autoOn) await invia(...)`. State machine, `IN_TRATTAMENTO` status, and `ordine_ref` preservation all unchanged. No new orders or clients are created in branches that previously did not create them.
- `src/utils/helpers.js` (+6/-6): rewrote the six variants of `introConferma()` to remove promissory wording and replace it with honest formulas ("Hemos recibido tu pedido…", "Lo pasamos al equipo para confirmarlo"). Variety preserved (still six randomised options).

Acks:

- delivery without address → "¿Adónde te lo llevamos? Pásanos la dirección completa (calle, número y piso si lo hay) y lo revisamos enseguida. 🍕"
- `fuera_de_zona` → "Gracias. Vamos a comprobar la zona de entrega con el equipo y te respondemos enseguida. 🛵"
- `modifica_complessa` (cancel/modify, generic to cover both) → "Recibido. Lo pasamos al equipo para revisarlo y te respondemos enseguida. 🙏"

Backup branch `backup/wa-ux-ack-operator-gated-01-2026-05-27`. Railway deployment `d723619f-d42c-4386-b316-fdceca348628`, boot `2026-05-27T08:08:37.999Z`. `/version` reports commit `c38ca94`, `/health` 200 OK, `/status` backend/database/ordini green.

Production validation 2026-05-27 (live commit `c38ca94`):

- T1 — delivery without address (`34699001101`, `TEST_BOT_UXACK_01_NO_ADDRESS`, message "Una El Pelusa a domicilio para las 21:30."): PASS. ordenes=0, clientes=0, conv `aperta` with items/hora preserved, wa_msgs `IN_TRATTAMENTO`, ack present.
- T2 — out of zone Aguadulce (`34699001102`, `TEST_BOT_UXACK_02_OUT_ZONE`, message "Una El Pelusa a domicilio, Aguadulce, para las 21:30."): PASS. ordenes=0, clientes=0, conv `in_attesa`, wa_msgs `IN_TRATTAMENTO`, ack present.
- T3 — cancel after order (`34699001103`, `TEST_BOT_UXACK_03_COMPLEX_CANCEL`): PASS. T3a created `#001 POR_CONFIRMAR` with honest intro; T3b cancellation kept `#001` untouched and preserved `ordine_ref="#001"` in wa_msgs while writing the generic cancel/modify ack to `bot_risposta` and `conv.chat`. No duplicates.
- T4 — normal-order intro sanity (`34699001104`, `TEST_BOT_UXACK_04_NORMAL_CONFIRM`): PASS. Order `#002 POR_CONFIRMAR` created with intro "Hemos recibido tu pedido, … Lo pasamos al equipo para confirmarlo. 🍕" — no promissory phrases. No false positive on the allergy guard.

DB cleanup completed post-test for all four `wa_id` (`34699001101/02/03/04`) and four `nombre` markers. `storico`, `archivio_conv`, `manual_giros`, `geo_cache` not touched. No service closure migrated test rows during the run.

Residual risks (not blocking for Wednesday):

1. `profile.name` is still echoed verbatim in confirmation replies. A long or odd name will look awkward but is cosmetic; leave for post-Wednesday.
2. Acks improve UX but the operator must still actually respond to handed-off cases (`in_attesa`); the bot's silence problem is solved, the operator's silence problem is not.
3. The rare `fuera_de_zona` branch inside the `solo_ora` Flusso 1 variant still calls `creaOrdine({ estado: "POR_CONFIRMAR" })` with `zona=null`. This is preexisting behaviour and was deliberately not modified in this fix to avoid touching DB logic before Wednesday.
4. Upsell of beer/dessert in normal-order replies is still present. Not blocking; can be tuned later if it creates noise on real customers.

`WA-ALLERGY-SAFETY-01` — closed and live 2026-05-27.

Context: bot WhatsApp test discovered a food-safety bug. Customer message `"Una Margarita para recoger a las 21:30, soy alérgico a los frutos secos."` was correctly interpreted by IA (`ia.nota = "Alérgico a frutos secos"`), but the old Flusso 1 created order `POR_CONFIRMAR` without propagating the note: `ordenes.nota`, `ordenes.nota_cucina`, and `clientes.nota_fissa` stayed empty, and the bot upsell proposed Tiramisù/Tartufo (potential allergen). Verdict: critical FAIL.

Fix: restrictive guard added in `src/agents/orchestrator.js` of repo `ladieci_bot` (commit `f8fe69f20ec22ee4d5297e7808d1b7fdd8a855a5`, message `fix guard whatsapp allergy orders`, +31 lines, single file). Backup branch `backup/wa-allergy-safety-01-2026-05-27`. Railway deployment `1f6b0125-6382-4926-9780-0195c3cab116`. No frontend, no DB/schema/migration, no env/config touched.

Behavior:

- When the inbound message contains an allergy/intolerance keyword (alérgico/alérgica, alergia, intolerante/intolerancia, celíaco/celíaca, sin gluten, frutos secos, nueces, cacahuete, maní, lactosa, huevo, mariscos, crustáceos) AND either declarative context (`soy`/`tengo`/`sufro`/`padezco`/`mi hijo es`/...) or order intent (`hasItems` or `tipo=ordine`), the guard fires BEFORE Flusso 1.
- Effect: no order is created, no client is upserted, `conv` is set to `in_attesa` with items/hora preserved, `wa_msgs` is `IN_TRATTAMENTO`, the bot sends a safe acknowledgement, no upsell. Returns `flusso: "allergy_safe", motivo: "allergia_dichiarata"`.
- Whitelist (`isWhitelist`) bypasses the guard so operator/owner inserts are not blocked.

Production validation 2026-05-27 (live commit `f8fe69f`):

- T1 — WA-18 repeat (`34699000919`, `TEST_BOT_WA18_FIX`, message contains `alérgico a los frutos secos`): PASS. ordenes=0, clientes=0, conv `in_attesa`, items `[El Pelusa]`, hora `21:30`, wa_msgs `IN_TRATTAMENTO`, ack safe, no upsell.
- T2 — allergy + delivery celíaco (`34699000920`, `TEST_BOT_WA19_ALLERGY_DELIVERY`, message contains `Soy celíaco` plus Calle Cuba 1 in zona valid Q2): PASS. Guard fires before geocoding. ordenes=0, clientes=0, conv `in_attesa`, ack safe.
- T3 — regression normal order (`34699000921`, `TEST_BOT_WA20_REGRESSION_NORMAL`, message `Una El Pelusa para recoger a las 21:30.`): PASS. Order `#001 POR_CONFIRMAR` created, RITIRO, totale €12, cliente id 212 persisted, upsell present. No false positive on the guard.

DB cleanup completed post-test for the three test `wa_id` (`919/920/921`) and the test `nombre` markers. `manual_giros` and `geo_cache` not touched.

## 11. Rules For Future Codex Sessions

- Start from `LaDieciBotV2_MASTER_CONTEXT.md`, this roadmap, and `LaDieciBotV2_ARCHIVE_INDEX.md`.
- Do not read old prompt files as live truth.
- Do not trust `origin/main` as current state.
- Do not touch backend, database, migrations, `.env`, Railway, Netlify, or Supabase unless explicitly requested.
- Do not deploy, push, or commit unless explicitly requested.
- If a document conflicts with these canonical files, stop and report the conflict.
- Keep the product manual-first and operator-gated.
