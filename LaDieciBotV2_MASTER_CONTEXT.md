# La Dieci Bot V2 — Master Context

Last consolidated: 2026-05-26.

This is the canonical starting context for future Codex/ChatGPT sessions on La Dieci Bot V2. Prefer this file over older prompts, recaps, post-mortems, and micro-step notes.

## 1. Project Identity

La Dieci Bot V2 is the operational system for La Dieci pizzeria. It supports order intake, operator confirmation, kitchen flow, delivery flow, cash/economy views, WhatsApp/bot orchestration, and operational health checks.

Core principle: the system is operator-gated. The bot can help prepare or clarify orders, but it must not send orders to kitchen without operator confirmation.

## 2. Correct Repository And Paths

- Canonical frontend repository/worktree: `/Users/bigart/Downloads/LaDieciBotV2-github`
- Frontend app directory: `ladieci-app33`
- Backend code present in this repo: `ladieci-bot`
- Backend production repository is separate and has been documented as `bigkaoss23-debug/ladieci_bot`
- Git remote for this repo: `https://github.com/bigkaoss23-debug/LaDieciBotV2.git`

Do not use duplicate project folders in `Downloads` as source of truth unless a human explicitly says so.

## 3. Probable Live State

Verified from documentation and local git history only. Not verified by touching production services.

- Frontend live documented: `https://magnificent-lollipop-6dff70.netlify.app`
- Backend live documented: `https://ladiecibot-production.up.railway.app`
- Netlify site ID documented: `02bd4c7a-a50b-4964-90da-8c1af1122932`
- Netlify deploy ID after P1D-MIN production deploy: `6a159b40ef9b5b0b4e8ec515`
- Frontend production version after P1D-MIN deploy: `eaf9e1a7ba608377ea778f464317708c1d8c554e`
- Backend live/manual-giro commit after main reconciliation: `e14abd6e93be2bf85ca64ad2649ba8fd3b54ea34`
- Backend local HEAD, `origin/main`, and Railway production were verified aligned to `e14abd6` on 2026-05-26. `/version` reported commit `e14abd6`, branch `main`; `/health` was OK; `/status` was OK with database green; `getManualGiros` returned `200 []`.
- P1D-MIN is live on the correct Netlify site. The accidental deploy to `soft-stroopwafel-e517fe` is not production truth.

## 4. Branch And Commit Truth

Current local audit state:

- Local branch: `main`
- Local HEAD after P1C.1 frontend closure: `addc6a7 feat persist manual delivery giros in entregas`
- `origin/main` at audit time: `d70df9c add order telemetry summary and fix lockfile`
- Local `main` was ahead of `origin/main` by 137 commits.

Important rule: `origin/main` is historical and not reliable as current live state. Do not reconstruct project truth from `origin/main` alone.

Important backup branches include:

- `origin/backup/v2-netlify-functions-deploy-fix-2026-05-23`
- `origin/backup/v2-delivery-vis-01-2026-05-23`
- `origin/backup/v2-delivery-eta-stress-matrix-2026-05-22`
- `origin/backup/v2-delivery-vis-stress-matrix-2026-05-22`
- `origin/backup/v2-service-postmortem-2026-05-22`
- `origin/backup/v2-release-protocol-2026-05-22`
- `origin/backup/v2-economia-clientes-01-minimal-2026-05-23`
- `origin/backup/v2-docs-canonical-context-roadmap-2026-05-25`
- `origin/backup/v2-delivery-manual-giro-01a-2026-05-25`
- `origin/backup/v2-fix-driver-loading-salida-2026-05-25`
- `origin/backup/v2-manual-giro-operator-stress-test-2026-05-25`
- `origin/backup/v2-manual-giro-ux-discoverability-2026-05-25`
- `origin/backup/v2-manual-giro-p1c1-frontend-2026-05-26` → `addc6a736d8d87758a7c7eb78b0439903ea005b7`
- `origin/backup/v2-manual-giro-p1d-min-cocina-2026-05-26` → `eaf9e1a7ba608377ea778f464317708c1d8c554e`

Backup branches may contain newer work than `origin/main`; they are references, not automatic proof of production.

## 5. Deploy And Release Rules

Manual-first release discipline is mandatory.

Do not deploy unless explicitly requested by the human operator.

For Netlify CLI frontend deploys, always target the correct site and include Netlify Functions:

```bash
netlify deploy --prod --site 02bd4c7a-a50b-4964-90da-8c1af1122932 --dir=ladieci-app33/build --functions=ladieci-app33/netlify/functions
```

The known build output path for this app is `ladieci-app33/build`. Before deploying, still verify the actual build output exists and is the intended production bundle.

Never deploy frontend while omitting `--site 02bd4c7a-a50b-4964-90da-8c1af1122932` or `--functions=ladieci-app33/netlify/functions`. Omitting `--site` can create or update the wrong Netlify site; omitting `--functions` can remove Netlify Functions and break `/api/auth` and `/api/proxy`.

Backend Railway deploy is separate from this frontend repo. Do not assume committing frontend changes deploys backend production.

Before any future deploy, check:

- frontend build output;
- Netlify Functions are included;
- `/api/auth` still works;
- `/version.json` or equivalent frontend version source if present;
- backend `/health`;
- whether backend `/version` exists before relying on it;
- smoke test of login, orders, kitchen, delivery, and functions count.

## 6. Architecture Modules

Main operational modules:

- WhatsApp / bot / orchestrator: receives and clarifies orders, but stays operator-gated.
- Operator confirmation: orders should not reach kitchen blindly.
- Orders lifecycle: `POR_CONFIRMAR`, `EN_COCINA`, `LISTO`, `EN_ENTREGA`, `RETIRADO`.
- Cocina: minimal kitchen view, scheduling around `forno_out`, visible operational markers only.
- Listos: ready orders and handoff.
- Entregas / Repartidor: delivery planning and execution actions.
- Delivery ETA / geocoding: zones, cache, providers, fallbacks, warnings.
- Economia / caja: sales, tickets, customers; currently paused as workstream.
- Ops health: watchdog/status ideas and partial implementation.
- Review Agent: WhatsApp review/audit ideas, not the current active priority.

## 7. Workstream State

Active P1:

- `DELIVERY-MANUAL-GIRO-01`
- 01A (volatile UI prototype) closed as APPROVE AS UI PROTOTYPE on 2026-05-25 (commit `a8f97da` UX discoverability fix).
- 01B/P1C data contract approved with hybrid model (`manual_giros` + `ordenes.manual_giro_id`).
- P1C.1 frontend persistence wiring closed and deployed on 2026-05-26: frontend commit `addc6a736d8d87758a7c7eb78b0439903ea005b7` (`addc6a7 feat persist manual delivery giros in entregas`) plus docs closure commit `267c9d0edeb55a5e06a734025057cacf1679d35e`; backup branch `backup/v2-manual-giro-p1c1-frontend-2026-05-26`.
- P1C.1 realistic smoke passed with two real delivery orders visible in Entregas and Cocina (Q1/Q2, 21:20/21:40, `1x El Pelusa`): create giro, refresh persistence, remove auto-dissolve, explicit dissolve, final `getManualGiros=[]`, no Cocina marker, `forno_out` unchanged. Test DB cleanup completed for orders/clients `699000301/699000302`; `mg_260526_1` and `mg_260526_2` left as dissolved audit rows.
- P1C.1 production deploy live on Netlify site `magnificent-lollipop-6dff70` (site ID `02bd4c7a-a50b-4964-90da-8c1af1122932`), deploy ID `6a158473fb848b0f501bf5ec`, URL `https://magnificent-lollipop-6dff70.netlify.app`, `/version.json` commit `267c9d0`, functions `api` and `auth` loaded.
- P1C.1 authenticated human smoke after deploy passed: existing login/session OK without exposing PIN; `Servicio > Entregas` loaded; UI showed `Sin entregas a domicilio`; no visible crash; no phantom manual-giro chips; no data created or modified. `getManualGiros` was not directly tested with a real token in that smoke, but the authenticated Entregas path loaded correctly.
- P1D-MIN Cocina visibility shipped on 2026-05-26: commit `eaf9e1a7ba608377ea778f464317708c1d8c554e` (`eaf9e1a feat show manual delivery giro in cocina`), backup branch `backup/v2-manual-giro-p1d-min-cocina-2026-05-26`. Scope: small visual badge/grouping for manual delivery giros in normal Cocina and full-screen PanelCocina only; no backend, no DB schema, no Repartidor/Economia, no `forno_out` write.
- P1D-MIN production deploy live on Netlify site `magnificent-lollipop-6dff70` (site ID `02bd4c7a-a50b-4964-90da-8c1af1122932`), deploy ID `6a159b40ef9b5b0b4e8ec515`, URL `https://magnificent-lollipop-6dff70.netlify.app`, unique URL `https://6a159b40ef9b5b0b4e8ec515--magnificent-lollipop-6dff70.netlify.app`, `/version.json` commit `eaf9e1a`, functions `api` and `auth` loaded.
- P1D-MIN production smoke passed: app loaded; existing session/login available without exposing PIN; `Servicio > Entregas` loaded with `Sin entregas a domicilio`; `Servicio > Cocina` loaded with `Cocina al día — sin pedidos`; no visible crash; no test orders created; no real data touched.
- P1E light stress on production passed on 2026-05-26 against the live frontend (`eaf9e1a`) and backend (`e14abd6`): manual giro exercised end-to-end on Entregas and Cocina with real-shape test orders; 2-order giro OK; 3-order giro OK; remove from 3-order giro OK; remove from 2-order giro auto-dissolved OK; state transition while in giro OK; multi-tab/refresh persistence OK; no blocking bug. Service-closure-with-active-giro path was NOT exercised in production because it is invasive. A non-blocking `Problema servicio` warning appeared once and self-normalized; backend/DB stayed healthy. Non-blocking observation: B/C slot times slid due to real driver/cascade logic, not a feature bug. P1E cleanup completed: test orders/clients `699000501/502/503` removed via backend `eliminaOrdine` endpoint and Railway server-side key (used only in memory, no secrets printed); Supabase anon delete was blocked by RLS and not used; `manual_giros` activos `[]`, storico 0; audit rows `mg_260526_4/5/6/7` left as dissolved.
- P1F zone-stress passed on 2026-05-26 against live frontend `eaf9e1a` and backend `e14abd6` via localhost authenticated UI (Netlify dev :8888 proxying to Railway production). 8 real-shape DOMICILIO orders (`#001`–`#008`, tel `699000601`–`699000608`, marker `TEST_ZONE_STRESS_2026-05-26_DELETE_OK`) covering 3 Q1 / 3 Q2 / 2 Q3 with real Roquetas addresses sourced from `clientes` table. Cascade scheduling observed (slip 0 → +84 min from A to H, consistent with zone `tempoGiro` and `maxOrdiniPerGiro`). Entregas grouped all 8 by zone; Cocina showed all 8 with item; no `Problema servicio` warning. 3 manual giros exercised — Q1+Q1 (`mg_260526_9`), Q2+Q3 (`mg_260526_11`), Q1+Q2+Q3 (`mg_260526_12`) — all with chip Entregas, badge Cocina `GIRO MANUAL · GN`, refresh persistence OK, explicit `disolver` OK. Final `manual_giros` activos `[]`. P1F cleanup completed: 8 ordenes removed via backend `eliminaOrdine` (id formato `#001`…`#008`), 8 clientes (`id` 196–203) removed via SQL on `clientes` rows whose `nombre` matched `TEST_%_ZS` and `tel` in the test range; audit rows `mg_260526_8/9/10/11/12` left as dissolved (mg_8 was a transient mis-grouping I dissolved and recreated as mg_9; mg_10 was a duplicate retry that I dissolved as well). Bug bloccanti: 0. Warning non bloccanti: (1) slip > 30 min vs richiesta cliente non emerge come avviso forte in UI; (2) modal Nuevo pedido lascia un side-panel residuo "Entrega a domicilio" finché non si clicca ✕; (3) "+" buttons in Entregas si rimescolano dopo ogni click — solo automation script, l'operatore umano clicca la card che vede; (4) backend `eliminaOrdine` risponde `success:true` anche con id non-matching (es. `1` invece di `1`/`#001`), va passato `#NNN`.
- P1C.2 (`forno_out` aggregation) remains blocked.

Suspended:

- Economia/caja, despite recent commits.

Current but partial:

- Delivery visibility.
- Delivery ETA/geocoding reliability.
- Ops health/status.
- Order modification UX/badges.
- WhatsApp Review Agent.

Historical or planning-only:

- Older delivery stress plans superseded by the 2026-05-22 ETA/VIS matrices.
- Old critical area lists superseded by current human priority.

## 8. Consolidated Product Decisions

- The operator remains the gate for kitchen.
- Heavy route optimization is excluded for now.
- Delivery zones work generally, but boundary cases require manual control.
- Delivery grouping should solve real service problems without becoming a route engine.
- Cocina must stay minimal: adjacent/near orders, same or compatible time, small `giro manual` marker, no heavy explanatory text.
- Entregas can show planning information before driver actions are available.
- Visible does not mean actionable: driver actions should remain constrained by order state.
- Fallback ETA or guessed duration must not be saved as real duration.
- If the system is uncertain, it should warn the operator instead of pretending precision.
- Bot delivery automation must be conservative and operator-confirmed.

## 9. Untrusted Data

Delivery tracking events such as `Salgo`, `Llegado`, and `Entregado` must be recorded, but treated as manual/untrusted.

Do not use these events yet for:

- ETA training;
- reliable delivery duration calculations;
- automatic route optimization;
- performance scoring;
- irreversible product decisions.

Reason: the 2026-05-23 order report includes delivery durations that appear to be manual/batch clicks, not real travel time.

## 10. Do Not Do

- Do not treat `origin/main` as current project truth.
- Do not deploy without explicit human request.
- Do not deploy Netlify frontend without `--functions=ladieci-app33/netlify/functions`.
- Do not touch `.env`, database, Supabase, Railway, Netlify config, or migrations unless explicitly asked.
- Do not use old prompt files as live truth.
- Do not include secrets, PINs, API keys, tokens, or copied credentials in documentation.
- Do not use `Salgo/Llegado` timings for ETA/training yet.
- Do not resume Economia unless a human reactivates that workstream.
- Do not turn `DELIVERY-MANUAL-GIRO-01` into route optimization.

## 11. Preferred Context Sources

Use these as primary sources:

- `LaDieciBotV2_RELEASE_PROTOCOL.md`
- `LaDieciBotV2_NETLIFY_FUNCTIONS_DEPLOY_FIX_2026-05-23.md`
- `LaDieciBotV2_SERVICE_POSTMORTEM_2026-05-22.md`
- `LaDieciBotV2_CONTEXT.md`
- `LaDieciBotV2_TEST_MATRIX.md` for consolidated tests only
- `LaDieciBotV2_DELIVERY_ETA_STRESS_MATRIX.md`
- `LaDieciBotV2_DELIVERY_VIS_STRESS_MATRIX.md`
- `LaDieciBotV2_ORDER_MODIFICATION_NOTES.md`
- `ladieci-app33/RIUNIONE_ZONE_HANDOFF.md`
- `ORDINI_2026-05-23.md` as historical/manual-untrusted evidence if present

Do not use as live truth:

- `ladieci-app33/AGENTS.md`
- `ladieci-app33/CLAUDE.md`
- `ladieci-app33/SECURITY_SESSION_2026-05-05.md`
- `LaDieciBotV2_NEXT_CRITICAL_AREAS.md`
- older superseded stress-test documents
