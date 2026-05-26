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
- Netlify deploy ID after P1C.1 production deploy: `6a158473fb848b0f501bf5ec`
- Frontend production version after P1C.1 deploy: `267c9d0edeb55a5e06a734025057cacf1679d35e`
- Backend live/manual-giro commit after main reconciliation: `e14abd6e93be2bf85ca64ad2649ba8fd3b54ea34`
- Backend local HEAD, `origin/main`, and Railway production were verified aligned to `e14abd6` on 2026-05-26. `/version` reported commit `e14abd6`, branch `main`; `/health` was OK; `/status` was OK with database green; `getManualGiros` returned `200 []`.
- P1C.1 is live on the correct Netlify site. The accidental deploy to `soft-stroopwafel-e517fe` is not production truth.

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
- P1C.2 (`forno_out` aggregation) remains blocked; P1D Cocina marker not started.

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
