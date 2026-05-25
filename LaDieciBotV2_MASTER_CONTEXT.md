# La Dieci Bot V2 — Master Context

Last consolidated: 2026-05-25.

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
- Netlify deploy ID after functions fix documented: `6a11e94208f97065b195843b`
- Backend live commit documented after 2026-05-22 service fix: `f60e1bb`
- Backend `/health` documented as live.
- Backend `/version` was documented as missing/future in the 2026-05-22 post-mortem and must not be assumed live without verification.

## 4. Branch And Commit Truth

Current local audit state:

- Local branch: `main`
- Local HEAD at audit time: `a8f97da fix make manual giro selection discoverable`
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

Backup branches may contain newer work than `origin/main`; they are references, not automatic proof of production.

## 5. Deploy And Release Rules

Manual-first release discipline is mandatory.

Do not deploy unless explicitly requested by the human operator.

For Netlify CLI frontend deploys, always include Netlify Functions:

```bash
netlify deploy --prod --dir=ladieci-app33/build --functions=ladieci-app33/netlify/functions
```

The known build output path for this app is `ladieci-app33/build`. Before deploying, still verify the actual build output exists and is the intended production bundle.

Never deploy frontend while omitting `--functions=ladieci-app33/netlify/functions`. That can remove Netlify Functions and break `/api/auth` and `/api/proxy`.

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
- 01A (volatile UI prototype) closed as APPROVE AS UI PROTOTYPE on 2026-05-25 (commit `a8f97da` UX discoverability fix). 01B/01C/01D not started.

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
