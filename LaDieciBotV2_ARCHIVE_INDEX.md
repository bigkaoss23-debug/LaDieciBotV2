# La Dieci Bot V2 — Archive Index

Last consolidated: 2026-05-26.

This index classifies documentation so future sessions know what to read, what to treat as historical, and what not to use as live truth.

## 1. Global Warnings

- `origin/main` is historical and not reliable as current state. At audit time it was `d70df9c`, while local `main` was `50c3667` and ahead by 136 commits.
- Old prompt files can contain stale instructions and sensitive values. Do not use them as live project context.
- Files marked `SENSITIVE` or `DO NOT USE AS LIVE` must not be pasted into new prompts.
- `ORDINI_2026-05-23.md` is useful operational evidence but was untracked at audit time.
- Duplicate project folders in `Downloads` are not canonical unless a human explicitly designates them.
- P1C.1 frontend manual-giro persistence is live on Netlify production as of 2026-05-26. Frontend feature commit `addc6a7` and docs/deploy closure commit `267c9d0` are recorded; deploy ID `6a158473fb848b0f501bf5ec` on site `magnificent-lollipop-6dff70`.
- P1D-MIN Cocina manual-giro visibility is live on Netlify production as of 2026-05-26. Frontend commit `eaf9e1a` is backed up on `backup/v2-manual-giro-p1d-min-cocina-2026-05-26`; deploy ID `6a159b40ef9b5b0b4e8ec515` on site `magnificent-lollipop-6dff70`.
- P1E light stress on production passed 2026-05-26 against live frontend `eaf9e1a` and backend `e14abd6`: 2-order, 3-order, remove, auto-dissolve, state transition, multi-tab/refresh all OK; chiusura servizio with active giro was deliberately not exercised in production; cleanup completed (`manual_giros` activos `[]`, audit `mg_260526_4/5/6/7` left dissolved). No code, no deploy, no DB schema, no backend code change.
- P1F zone-stress on production passed 2026-05-26 against same live targets, via localhost `netlify dev` :8888 with authenticated UI. 8 multi-zone DOMICILIO orders (3 Q1 / 3 Q2 / 2 Q3, real Roquetas addresses sourced from `clientes`), cascade slip 0–+84 min, 3 manual giros (Q1+Q1 `mg_9`, Q2+Q3 `mg_11`, Q1+Q2+Q3 `mg_12`) all with chip/badge/refresh/disolver OK; final `manual_giros` activos `[]`; audit `mg_260526_8/9/10/11/12` left dissolved. Cleanup: 8 ordenes via backend `eliminaOrdine` (id `#NNN`), 8 clientes via SQL; storico 0. Bug bloccanti 0; non-blocking warning principale: no strong UI alert when slip > 30 min vs richiesta cliente. Dev server stopped, port 8888 released.
- Backend manual-giro endpoints are live and backend local HEAD/`origin/main`/Railway production were aligned to `e14abd6e93be2bf85ca64ad2649ba8fd3b54ea34` before the frontend deploy.
- `WA-ALLERGY-SAFETY-01` is live on Railway production as of 2026-05-27. Backend repo `ladieci_bot`, commit `f8fe69f20ec22ee4d5297e7808d1b7fdd8a855a5` (`f8fe69f fix guard whatsapp allergy orders`, +31 lines in `src/agents/orchestrator.js` only). Backup branch `backup/wa-allergy-safety-01-2026-05-27`; Railway deployment ID `1f6b0125-6382-4926-9780-0195c3cab116`; `/version` reports commit `f8fe69f`. No frontend/DB/schema/migration/env touched. T1/T2/T3 post-fix tests on production all PASS, DB cleaned post-test, `manual_giros` and `geo_cache` untouched.
- Backend live repository on Railway is `/Users/bigart/Downloads/ladieci-bot` (remote `bigkaoss23-debug/ladieci_bot`). The `ladieci-bot` directory inside this `LaDieciBotV2-github` repo is NOT live and must not be used as deploy source.
- Future Netlify CLI deploys must use the correct site ID: `--site 02bd4c7a-a50b-4964-90da-8c1af1122932`. The accidental `soft-stroopwafel-e517fe` deploy is not production truth.

## 2. Documentation Classification

| File | Status | Reason | Read When | Do Not Read When |
|---|---|---|---|---|
| `LaDieciBotV2_MASTER_CONTEXT.md` | AUTHORITATIVE | Canonical consolidated context. | Starting any new session. | Never as historical only. |
| `LaDieciBotV2_ROADMAP.md` | AUTHORITATIVE | Canonical current/future priorities. | Planning next work. | Never replace with old planning docs. |
| `LaDieciBotV2_ARCHIVE_INDEX.md` | AUTHORITATIVE | Canonical map of docs. | Deciding whether a file is safe context. | Never ignore when reading old docs. |
| `LaDieciBotV2_RELEASE_PROTOCOL.md` | AUTHORITATIVE | Best source for deploy/release discipline and Netlify/Railway rules. | Any deploy/release discussion. | As product roadmap. |
| `LaDieciBotV2_NETLIFY_FUNCTIONS_DEPLOY_FIX_2026-05-23.md` | AUTHORITATIVE / DEPLOY REPORT | Documents Netlify Functions incident and required CLI flag. | Any Netlify deploy work. | Never skip before CLI deploy. |
| `LaDieciBotV2_SERVICE_POSTMORTEM_2026-05-22.md` | AUTHORITATIVE / HISTORICAL | Strong source for real-service bugs and live state on 2026-05-22. | Understanding production incidents. | As proof of current live after later commits. |
| `LaDieciBotV2_CONTEXT.md` | CURRENT PARTIAL | Broad context with many valid decisions, but too large and mixed with stale sections. | Need deep project background. | As the only source of truth. |
| `LaDieciBotV2_TEST_MATRIX.md` | CURRENT PARTIAL / TEST DOC | Useful consolidated tests, very large. | Selecting regression tests. | As narrative/product truth. |
| `LaDieciBotV2_DELIVERY_ETA_STRESS_MATRIX.md` | CURRENT PARTIAL | Best source for ETA/geocoding principles and known fixes. | Delivery ETA/geocoding work. | For route optimization. |
| `LaDieciBotV2_DELIVERY_VIS_STRESS_MATRIX.md` | CURRENT PARTIAL | Best source for Entregas visibility and grouped-delivery hints. | `DELIVERY-MANUAL-GIRO-01`. | As proof all visibility behavior is live. |
| `LaDieciBotV2_DELIVERY_MANUAL_GIRO_OPERATOR_STRESS_TEST.md` | AUTHORITATIVE / TEST DOC | Operator validation matrix for `DELIVERY-MANUAL-GIRO-01A` UI prototype. Verdict recorded: APPROVE AS UI PROTOTYPE (2026-05-25). | Validating any future change to manual giro UI; planning P1B/P1C. | As proof of persistence/data contract — 01A is UI-only. |
| `LaDieciBotV2_DELIVERY_MANUAL_GIRO_01BC_SPEC.md` | AUTHORITATIVE / SPEC | Records approved hybrid persistence model and P1C.1/P1D-MIN closure status. P1C.1 frontend commit `addc6a7` and P1D-MIN commit `eaf9e1a` are live on Netlify production; P1C.2 `forno_out` aggregation remains blocked. | Any manual giro persistence, endpoint, deploy, rollback, or follow-up work. | As authorization to change `forno_out`. |
| `LaDieciBotV2_ORDER_MODIFICATION_NOTES.md` | CURRENT PARTIAL | Good source for modification guards and pending badge work. | Order modification work. | As delivery roadmap. |
| `LaDieciBotV2_OPS_HEALTH_STRESS_MATRIX.md` | CURRENT PARTIAL / PLANNED | Useful design for health/status, not all live. | Planning ops health. | As proof `/status` is complete live. |
| `LaDieciBotV2_BOT_DELIVERY_STRATEGY.md` | CURRENT PARTIAL / PLANNED | Conservative bot delivery strategy. | WhatsApp delivery planning. | As active P1. |
| `LaDieciBotV2_WHATSAPP_REVIEW_AGENT.md` | CURRENT PARTIAL / PLANNED | Review Agent design and mitigations. | Review/audit agent planning. | As active delivery work. |
| `LaDieciBotV2_DELIVERY_STRESS_TEST_PLAN.md` | HISTORICAL / SUPERSEDED | Older delivery/geocoding test plan, superseded by ETA/VIS matrices. | Investigating old delivery decisions. | Starting new delivery work. |
| `LaDieciBotV2_NEXT_CRITICAL_AREAS.md` | SUPERSEDED / DO NOT USE AS LIVE | Old priority list; current P1 is `DELIVERY-MANUAL-GIRO-01`. | Understanding past planning. | Choosing next priority. |
| `ORDINI_2026-05-23.md` | HISTORICAL / UNTRACKED | Real-service order evidence; supports manual/untrusted delivery tracking decision. | Studying service behavior and delivery click reliability. | As schema/API truth. |
| `ladieci-app33/RIUNIONE_ZONE_HANDOFF.md` | HISTORICAL | Valuable zone/product context from 2026-05-11. | Understanding zone boundary and manual grouping needs. | As current implementation truth. |
| `ladieci-app33/discusion-rediseno-sistema-delivery-2026-05-11.md` | HISTORICAL | Explains delivery total redesign after real service issue. | Understanding why delivery fee/totals changed. | As current delivery roadmap. |
| `ladieci-app33/AGENTS.md` | PROMPT ONLY / DO NOT USE AS LIVE | Old agent prompt with stale next steps and potentially sensitive operational details. | Only to recover historical instructions, with caution. | As current context for Codex. |
| `ladieci-app33/CLAUDE.md` | PROMPT ONLY / DO NOT USE AS LIVE | Duplicate/near-duplicate old prompt with stale/sensitive context. | Only for archaeology. | As current context for Claude/Codex. |
| `ladieci-app33/SECURITY_SESSION_2026-05-05.md` | SENSITIVE HISTORICAL / DO NOT USE AS CONTEXT | Contains sensitive values or security material. | Only for controlled security cleanup/redaction. | Any normal planning/coding session. |

## 3. Sensitive File Warning

The following files must be treated as sensitive or unsafe for normal prompt context:

- `ladieci-app33/SECURITY_SESSION_2026-05-05.md`
- `ladieci-app33/AGENTS.md`
- `ladieci-app33/CLAUDE.md`

Do not copy secrets, PINs, API keys, tokens, or credential-like values from these files into any new document or prompt.

## 4. Superseded Planning Warning

The following files may still contain useful history, but must not drive the next work item:

- `LaDieciBotV2_NEXT_CRITICAL_AREAS.md`
- `LaDieciBotV2_DELIVERY_STRESS_TEST_PLAN.md`

Current priority is:

```text
DELIVERY-MANUAL-GIRO-01
```

## 5. Deploy Documentation Warning

Before any future frontend deploy, read:

- `LaDieciBotV2_RELEASE_PROTOCOL.md`
- `LaDieciBotV2_NETLIFY_FUNCTIONS_DEPLOY_FIX_2026-05-23.md`

Required Netlify CLI flag:

```bash
--functions=ladieci-app33/netlify/functions
```

Missing that flag can remove Netlify Functions and break operator login/proxy behavior.

## 6. Manual-Untrusted Data Warning

`ORDINI_2026-05-23.md` supports the current rule that delivery tracking events are manual/untrusted.

Use these events for operational history only. Do not use them yet for ETA training, automatic routing, or reliable travel-time calculations.
