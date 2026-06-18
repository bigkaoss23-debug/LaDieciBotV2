# PLANNER_DELTA_PROMISED_GUARD_A2_DEPLOY_03 — REPORT

**Data:** 2026-06-14
**Tipo:** Deploy backend Railway production del guardrail A.2 (promised gap guard) `dc36160`
**Esito:** ✅ **OK — deploy live, health/status verdi (dopo recovery cold-start DB), smoke A–D PASS**
**Safety:** zero frontend · zero Netlify · zero DB write · zero cleanup · zero schema/migration · zero push main · zero patch extra · soglia 25 invariata · `ORDINI_2026-05-23.md` non toccato

Completa il blocco planner-safety: A.1 slip guard (`6e2b529`) + A.2 promised gap guard (`dc36160`) ora entrambi live.

---

## 1. Preflight

Repo `/Users/bigart/Downloads/ladieci-bot`.

| Check | Atteso | Risultato |
|---|---|---|
| `git status --short` | clean | ✅ vuoto |
| `git rev-parse --short HEAD` | `dc36160` | ✅ `dc36160` |
| `git branch --show-current` | branch lavoro | ✅ `backup/v2-route-impact-slip-guard-2026-06-14` |
| backup remoto | → `dc361606…` | ✅ `dc361606db6cb90e6e27047ae3db453940ec4429` |
| soglia | `= 25` | ✅ riga 116, non cambiata |
| Railway link | surprising-tenderness / production / ladieci_bot | ✅ deployment `d623be4a` |

### Baseline live (pre-deploy)
- `/health` → `{ok:true}`
- `/version` → deployment **`d623be4a`**, commit `unknown`, bootTime `14:34:59Z`
- `/status` → backend **green**, database **green** (214ms), ordini **green** (`todayCount:0`, `lastCreatedAt:null`), WhatsApp idle **yellow**
- **Nessun ordine reale attivo, servizio freddo → via libera.**

---

## 2. Deploy

`railway up --service ladieci_bot --environment production --detach`
- Build/deployment id: **`397d4061-50b5-4400-bc38-a6b2ceab0f4d`**
- Live ~45s dopo upload. Nessun push main, nessun cambio env, nessun DB write.

---

## 3. Deployment precedente vs nuovo

| | Pre-deploy | Post-deploy |
|---|---|---|
| deploymentId | `d623be4a-05ac-46a5-932b-b1daf2e96104` | **`397d4061-50b5-4400-bc38-a6b2ceab0f4d`** |
| bootTime | `2026-06-14T14:34:59Z` | **`2026-06-14T15:20:48Z`** |
| commit (`/version`) | `unknown` | `unknown` (atteso — railway up) |
| commit reale (artefatto) | `6e2b529` | **`dc36160`** |

---

## 4. Health / Status / Version dopo deploy

- `/health` → `{ok:true}` ✅
- `/version` → deployment `397d4061`, bootTime nuovo, uptime 10s, commit `unknown` ✅
- `/status` → **transitorio red al boot** (uptime 11s): `database.ok:false, db_timeout, 1041ms` — cold-start. **Recovery confermato** con re-poll:

| poll | overall | database |
|---|---|---|
| 1 | yellow | green 956ms |
| 2 | yellow | green 570ms |
| 3 | yellow | green 292ms |
| 4 | yellow | green 401ms |
| 5 | yellow | green 703ms |

Stato stabile: backend **green**, database **green**, ordini **green** (`todayCount:0`), WhatsApp idle **yellow** (accettabile). Il red iniziale era un `db_timeout` di cold-start (Supabase warming), non un guasto — coerente con i cold-start precedenti (es. 891ms al boot del deploy slip guard).

---

## 5. Smoke read-only / artifact

**Limite dichiarato:** endpoint live non esercitabili senza ordini reali (`todayCount:0`, no DB write). Smoke eseguito contro **l'artefatto deployato**: working tree `dc36160` == codice live, via `previewStrategicOpportunities` + `routeImpact` (puri, no IO). Script temporaneo creato, eseguito, **rimosso** (tree clean).

| Smoke | Atteso | Risultato |
|---|---|---|
| **A** gap 50 | `no_recomendado` + `Horarios lejanos: 50 min` | ✅ `no_recomendado` · `Horarios lejanos: 50 min entre pedidos (máx 25)` |
| **B** boundary | 25 non scatta · 26 scatta | ✅ 25 → `compatible` · 26 → `no_recomendado` |
| **C** direct | `compatible`/valid | ✅ `firstAvailable.status=compatible`, `bestProposal=compatible`, `opportunities=[]`, nessun "Horarios lejanos" |
| **D** manual giro +8 | resta `ajuste` | ✅ `ajuste` (path manual giro non toccato) |

**SMOKE A–D: ALL PASS.** (Nota: la prima esecuzione di C dava "undefined" per un bug del finder dello script — il direct senza anchor sta in `firstAvailable`/`bestProposal`, non in `opportunities[]`; riverificato → `compatible`.)

---

## 6. Rollback target

Se necessario: `railway up` del commit `6e2b529` (≈ deployment `d623be4a`, slip guard senza A.2). Main resta `0bb9d8c`. I redeploy precedenti sono ripristinabili entro la retention immagine Railway.

---

## 7. Git status finale

`/Users/bigart/Downloads/ladieci-bot`:
- branch `backup/v2-route-impact-slip-guard-2026-06-14`, HEAD `dc36160`
- working tree **clean** (script smoke rimosso)
- `origin/main` invariato (`0bb9d8c`), nessun push
- backup remoto A.2 `backup/v2-delta-promised-gap-guard-a2-2026-06-14` = `dc36160`

`ORDINI_2026-05-23.md` (repo frontend) non toccato.

---

## 8. Safety

| Vincolo | Stato |
|---|---|
| Zero frontend / Netlify | ✅ |
| Zero DB write / cleanup / schema | ✅ |
| Zero push main / patch extra | ✅ |
| Soglia 25 invariata | ✅ |
| `ORDINI_2026-05-23.md` intatto | ✅ |

---

## Verdetto

✅ **OK** — nuovo deployment live (`d623be4a` → `397d4061`), bootTime nuovo, health verde e status stabile (backend/DB/ordini green dopo recovery cold-start), smoke A–D tutti PASS contro l'artefatto.

A.2 promised gap guard è ora in produzione: gap promesse > 25 min → `no_recomendado` con warning "Horarios lejanos"; boundary 25/26 corretto; direct `compatible` e manual giro `ajuste` intatti.

**Nota smoke:** verifica via artefatto (working tree == codice deployato), non via endpoint live con ordini reali (impossibile senza DB write). Health/status/deploymentId verificati live. **Nota status:** il red iniziale di `/status` era un `db_timeout` di cold-start, recuperato entro pochi secondi (DB tornato green) — non un guasto, nessun rollback necessario.
