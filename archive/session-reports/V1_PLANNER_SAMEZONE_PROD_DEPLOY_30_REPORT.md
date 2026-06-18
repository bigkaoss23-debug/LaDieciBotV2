# V1_PLANNER_SAMEZONE_PROD_DEPLOY_30_REPORT

**Azione:** deploy backend produzione del fix P0 same-zone rider availability `a7ad091`.
**Autorizzazione:** frase esatta ricevuta — `AUTORIZZO DEPLOY BACKEND V1 PROD SAMEZONE FIX`.
**Data:** 2026-06-18
**Esito:** ✅ **DEPLOY COMPLETE — prod live aggiornato.**

---

## 1. Preflight (Step A)

- Repo `/Users/bigart/Downloads/ladieci-bot`, branch `backup/v2-route-impact-slip-guard-2026-06-14`
- working tree **pulito** · HEAD `a7ad091d9e7d71b7656b6e08e44c7d9575560284`
- Full backend test suite: **63 file OK, 0 falliti**

## 2. Target prod provato (Step B)

`railway service ladieci_bot` (EXIT 0) → `railway status`:

| Campo | Valore |
|---|---|
| Project | `surprising-tenderness` / Environment `production` |
| Linked service | **`ladieci_bot`** |
| URL | `https://ladiecibot-production.up.railway.app` |
| service ID | `221886cc-524e-456a-adc6-812fd50f222e` |
| **Deployment PRIMA (rollback target)** | **`397d4061-50b5-4400-bc38-a6b2ceab0f4d`** |

## 3. Deploy (Step C)

`railway up --service ladieci_bot --ci` → **Deploy complete**
- image created `2026-06-18T16:00:51Z`, digest `sha256:d15ef5e9cf5bf3086f4eff40644b2cdc66d8a94ea6ca54ed7c17e281a94556df`

## 4. Smoke read-only post-deploy (Step D)

| Endpoint (`https://ladiecibot-production.up.railway.app`) | Risultato |
|---|---|
| `/health` | `{"ok":true,...}` |
| `/version` | `{"service":"ladieci_bot","env":"production","commit":"unknown","deploymentId":"80228fb0-b163-440f-9857-e281b43c070a","bootTime":"2026-06-18T16:01:05Z","uptimeSec":16}` |
| `/status` | HTTP 200 |

- **Nuovo deployment `80228fb0-b163-440f-9857-e281b43c070a`** (era `397d4061`) + **boot fresco** = nuovo artefatto in esecuzione.
- `commit="unknown"`: `railway up` non inietta la SHA (limite noto, già osservato su staging e sul prod precedente). **Identità artefatto** stabilita al deploy: `git rev-parse HEAD = a7ad091` con working tree pulito.
- La build è bit-identica a quella validata runtime su staging (28B, `fearless-reverence`), dove il comportamento same-zone è stato confermato corretto.

## 5. Cosa è andato in produzione

Tip `a7ad091`. Delta rispetto al prod precedente: catena lineare planner-correctness (≤ `ae8e22e..a7ad091` = 5 commit; per la prova temporale del gate, prod NON aveva `193b818`/`a7ad091`). Tutto il delta è **read-only planner/preview + test** (zero write/WA/migration/frontend/secrets — safety check del GATE_29).

## 6. Rollback (se necessario)

Railway → rollback al deployment **`397d4061-50b5-4400-bc38-a6b2ceab0f4d`** (il precedente, boot 2026-06-14). Meccanismo per deploymentId, non richiede la SHA. Branch backup equivalente base: `backup/v2-driver-replan-stale-2026-06-13` (`ae8e22e`, stima).

## 7. Stato finale CLI

CLI Railway riportato su **`fearless-reverence`** (staging) come leave-state sicuro (evita `railway up` accidentale su prod). Verificato via `railway status`.

## 8. Safety

- ✅ deploy autorizzato con frase esatta · ✅ SOLO `ladieci_bot` (target provato prima)
- ✅ no Supabase write (delta read-only; nessun DB toccato durante il deploy)
- ✅ no Netlify deploy · ✅ no push main · ✅ no frontend · ✅ no WhatsApp · ✅ no ordini test
- ✅ no secrets stampati (non ho usato/cercato la chiave API prod)
- ✅ `ORDINI_2026-05-23.md` non toccato
- ✅ CLI lasciato su staging

## 9. Note / follow-up consigliati (NON eseguiti)

- **Verifica comportamentale prod del fix:** opzionale, richiederebbe la chiave API prod (per `previewStrategicOpportunities` read-only) o un ordine-marker di test con cleanup fuori servizio → autorizzazione separata.
- **Micro-fix UX (separato):** evitare `recommended:true` su un diretto `no_recomendado` quando è l'unica proposta.
- Considerare l'iniezione della git SHA in `/version` per i prossimi deploy (oggi sempre `unknown` con `railway up`).

> Deploy concluso. Nessun push main, nessun frontend, nessuna scrittura DB.
