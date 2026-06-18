# FRONTEND_LIVE_UNEXPECTED_DEPLOY_AUDIT_01 — REPORT

**Date:** 2026-06-14
**Type:** Read-only audit (no deploy / no rollback / no unlock / no patch / no commit / no DB)
**Trigger:** User reported the live app "looks like the frontend got published again" — verify whether production `02bd4c7a` was updated by mistake.

---

## VERDICT: ✅ OK — FALSE ALARM

**Production is intact and locked on the safe commit `7557701`. No unexpected deploy occurred. UX-1 (`9c1be6d`) is correctly isolated on staging only.**

The most likely cause of the user's perception: they opened **staging** (`ladieci-v1-staging.netlify.app`), a unique deploy URL, or a cached/old tab — not production.

---

## 1. URLs verified

| Surface | URL |
|---|---|
| Production | https://magnificent-lollipop-6dff70.netlify.app |
| Staging | https://ladieci-v1-staging.netlify.app |

> Browser tab the user is actually viewing was **not** directly observable from here. Recommendation below covers how the user can confirm.

## 2. Production `/version.json`

```
commit:    7557701   ✅ expected
deployId:  6a2ecb8f924c8b12a12cd618   ✅ expected
context:   production
buildTime: 2026-06-14T15:41:04Z
```

## 3. Staging `/version.json`

```
commit:    9c1be6d   ✅ expected
deployId:  6a2ed8d169063284abcdde5c   ✅ expected
buildTime: 2026-06-14T16:37:38Z
```
UX-1 (`9c1be6d`) lives on staging, as designed.

## 4. Netlify API — production published deploy (site `02bd4c7a`)

```
published_deploy id: 6a2ecb8f924c8b12a12cd618   ✅ expected
locked:              True                        ✅ expected
state:               ready
title:               "prod BUG A 7557701 usa esta hora recommended_hora"
```
Published deploy matches the locked safe deploy. Lock is still in place.

## 5. Netlify API — staging published deploy (site `a3ad035a`)

```
published_deploy id: 6a2ed8d169063284abcdde5c   ✅ expected
locked:              None (not locked — expected for staging)
state:               ready
title:               "UX-1 9c1be6d staging visual smoke"
```

## 6. Production bundle markers

Production HTML references bundle: **`main.02df9214.js`**
(NOT the CRITICO marker `main.6f935b50.js`)

UX-1 marker scan on the live production bundle:

| Marker | Count |
|---|---|
| `ppp-opt3` | 0 |
| `ppp-detail` | 0 |
| `Sin giro compatible` | 0 |
| `Sin alternativa` | 0 |
| `Solo vista previa` | 0 |

No UX-1 code present in the production bundle. (`Solo vista previa` also absent, but the decisive UX-1 markers `ppp-opt3`/`ppp-detail` are absent and the commit is `7557701` — production is the pre-UX-1 build, consistent and clean.)

## 7. Repo / local Netlify state

```
branch:    consolidation/nuevo-pedido-v1-unified-2026-06-09
HEAD:      9c1be6d
.netlify/state.json siteId: 02bd4c7a  ← linked to PRODUCTION
```
⚠️ **Standing trap (known):** local `.netlify` is linked to PRODUCTION (`02bd4c7a`). Any `netlify deploy` run from here without an explicit `--site` targets prod. No action taken — flagged only. Local HEAD is on `9c1be6d` (UX-1), which is *not* what's published to prod.

---

## Diagnosis classification

- [x] **OK / false alarm** — Production `7557701` (locked), staging `9c1be6d`. User likely viewing staging / unique deploy / cache.
- [ ] ATTENZIONE
- [ ] CRITICO

## Recommendation

1. **No rollback / no action needed.** Production is correct and locked.
2. Ask the user to confirm the URL in their address bar:
   - `magnificent-lollipop-6dff70.netlify.app` → production (safe, `7557701`).
   - `ladieci-v1-staging.netlify.app` → staging (UX-1 `9c1be6d`, expected).
   - A `<hash>--...netlify.app` → a unique deploy preview.
3. If they are on the production URL but still see a different UI: it's a **cache / service-worker / stale tab** issue, not a deploy. Have them do a hard refresh (Cmd+Shift+R) or open in incognito, then re-check.
4. Standing risk to address separately (not now): local `.netlify` linked to prod — keep using explicit `--site` on every deploy.

## Changes made

**Zero.** No deploy, rollback, unlock, patch, commit, push, backend, or DB write. `ORDINI_2026-05-23.md` untouched. Only this report file was written.
