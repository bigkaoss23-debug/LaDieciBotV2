# FRONTEND_EMERGENCY_ROLLBACK_REMOVE_V1_01 — REPORT

**Date:** 2026-06-14
**Action:** Controlled rollback of PRODUCTION FRONTEND ONLY (remove V1 from live).
**Authorized by:** user, in chat, with explicit target deploy/commit.
**Scope guard:** no backend, no Railway, no DB, no schema/migration, no main push, no patch, no staging deploy, `ORDINI_2026-05-23.md` untouched.

---

## VERDICT: ✅ OK

**Production frontend rolled back to `777ae55` / `6a2533b4926549d7ee8937b1`, locked = true. V1 (`7557701`) removed from live. Backend untouched.**

---

## 1. Pre-rollback state (verified)

Production site `02bd4c7a` / `magnificent-lollipop-6dff70`:

```
version.json: commit 7557701  /  deployId 6a2ecb8f924c8b12a12cd618
published:    6a2ecb8f924c8b12a12cd618
locked:       True
title:        "prod BUG A 7557701 usa esta hora recommended_hora"
```
Rollback target `6a2533b4926549d7ee8937b1` confirmed: same site `02bd4c7a`, state `ready` → safe to restore.

## 2. Rollback steps executed

| # | Step | Result |
|---|---|---|
| 1 | `unlockDeploy` 6a2ecb8f924c8b12a12cd618 | locked → **False** ✅ |
| 2 | `restoreSiteDeploy` 6a2533b4926549d7ee8937b1 | restored, state `ready` ✅ |
| 3 | `lockDeploy` 6a2533b4926549d7ee8937b1 | locked → **True** ✅ |

## 3. Post-rollback verification (production)

`/version.json` (no-cache):
```
commit:    777ae55          ✅ target
commitFull:777ae55d12f61678650b3e1193aa32140b7696dc
deployId:  6a2533b4926549d7ee8937b1   ✅ target
branch:    hotfix/disponibilidad-lead-time-dc62ab7-2026-06-06
buildTime: 2026-06-07T09:02:45Z
```

Netlify API published deploy:
```
published: 6a2533b4926549d7ee8937b1   ✅
locked:    True                        ✅
state:     ready
```

Bundle served: **`main.66b46ad7.js`** (the known-clean 777ae55 bundle).

UX-1 / V1 marker scan on live bundle — all absent:
| Marker | Count |
|---|---|
| `ppp-opt3` | 0 ✅ |
| `ppp-detail` | 0 ✅ |
| `Sin giro compatible` | 0 ✅ |
| `Sin alternativa` | 0 ✅ |
| `recommended_hora` | 0 ✅ |

## 4. Backend NOT touched (verified read-only)

Railway `ladiecibot-production`:
```
/health  → {"ok":true}  HTTP 200          ✅
/version → deploymentId 397d4061-50b5-4400-bc38-a6b2ceab0f4d, env production, HTTP 200   ✅
```
deploymentId `397d4061` = expected. No backend/Railway/DB action was performed at any point.

---

## Consequences (accepted by user)

This rollback also removes the V1 frontend fixes that shipped in `7557701`:
- **Confirmar gating** (planner hard-block gating on confirm)
- **Usa esta hora** / `recommended_hora` suggestion action

User explicitly accepted this trade-off to remove V1 from live immediately.

## Changes made

- Netlify production site `02bd4c7a`: unlocked old deploy, restored + re-locked deploy `6a2533b4926549d7ee8937b1` (commit `777ae55`).
- Wrote this report file.
- **Nothing else.** No backend, Railway, DB, schema, main push, patch, staging deploy, or cleanup. `ORDINI_2026-05-23.md` untouched.
