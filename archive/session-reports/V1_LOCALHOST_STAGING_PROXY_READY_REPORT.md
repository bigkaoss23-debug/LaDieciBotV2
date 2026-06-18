# V1_LOCALHOST_STAGING_PROXY_READY_REPORT

**Data:** 2026-06-17
**Task:** V1_LOCALHOST_STAGING_PROXY_KEY_FIX
**Esito:** ✅ PASS — localhost :8888 ora autentica al backend V1 staging. Nessun ordine creato (come da task).

---

## Obiettivo
Allineare SOLO la `RAILWAY_API_KEY` del `.env` locale alla `DASHBOARD_API_KEY` del service Railway V1 `fearless-reverence`, senza stampare segreti, così che la UI locale (:8888) possa autenticarsi al backend V1 (prima tornava 401).

## Perimetro rispettato
NO ordini · NO planner test · NO DB write · NO cleanup · NO deploy · NO push main · NO Netlify production · NO Railway production (`ladieci_bot`) · NO Supabase prod · `ORDINI_2026-05-23.md` non toccato · nessun segreto stampato.

---

## FASE 1 — Localhost giusto ✅
- localhost corretto = **:8888**, repo = `/Users/bigart/Downloads/LaDieciBotV2-github/ladieci-app33`
- `:8899` = p1a/trappola → NON usato
- `netlify.toml` (app33) punta a:
  - `BACKEND_API_URL` / `REACT_APP_BACKEND_API_URL` = `fearless-reverence-production-80bc` (V1)
  - `SUPABASE_URL` / `REACT_APP_SUPABASE_URL` = `tdikhfeinufaahagmpjz` (staging)
- `.env` locale: **zero** ref prod (`ladiecibot-production`, `wnswassgfuuivmfwjxsf`). Chiavi presenti: `DEV_AUTH_BYPASS`, `APP_PIN`, `JWT_SECRET`, `RAILWAY_API_KEY` (nessun URL).

## FASE 2 — Chiave V1 letta senza stamparla ✅
- Service individuato: **`fearless-reverence`** dentro il progetto `surprising-tenderness` (stesso progetto del prod `ladieci_bot`, che NON è stato letto né toccato). I 3 progetti non-prod (`powerful-heart`, `proactive-illumination`, `modest-creativity`) non lo contengono.
- Confronto checksum (valori MAI stampati):
  | Sorgente | len | sha256[:12] |
  |---|---|---|
  | V1 `DASHBOARD_API_KEY` (fearless-reverence) | 61 | `20ec487f2e27` |
  | `.env` locale `RAILWAY_API_KEY` (prima) | 35 | `e3177bcf9745` (chiave prod `ld_92e…`) |
- Checksum **diversi** → validata la chiave V1 contro `fearless-reverence-…/api?action=getConfig` → **HTTP 200**, `PIZZERIA_NOME=La Dieci (STAGING)`.
- `.env` aggiornato: `RAILWAY_API_KEY` ora len **61**, sha256[:12] **`20ec487f2e27`** (= V1). Altre chiavi invariate.
- File temporaneo con il segreto rimosso; nessun valore stampato.

## FASE 3 — Restart locale ✅
- Riavviato solo `ladieci-dev :8888`. `:8899` non toccato.
- Env injection confermata nei log: `.env` → `JWT_SECRET, RAILWAY_API_KEY, APP_PIN`; `netlify.toml` → `BACKEND_API_URL, SUPABASE_URL` (+ REACT_APP_* + anon key) staging.

## FASE 4 — Anti-prod check locale ✅
| Check | Esito |
|---|---|
| auth operador `123456` | token OK |
| auth repartidor `654321` | token OK |
| proxy `getConfig` | `PIZZERIA_NOME = La Dieci (STAGING)`, `PIANO = staging` |
| ref `ladiecibot-production` / `wnswassgfuuivmfwjxsf` | **zero** |
| proxy `getOrdenes` | `0` |

Il proxy locale ora raggiunge il backend V1 senza 401: la pipeline browser → Netlify function (:8888) → Railway V1 → Supabase staging è operativa.

---

## Note / correzioni rispetto allo stato dichiarato nei task precedenti
- **PIN:** sullo staging `APP_PIN` (operador) = `123456`; `REPARTIDOR_PIN` = `654321`. Il "auth staging 654321 PASS" dei task era il PIN **rider**, non operatore. Per creare ordini come operatore serve `123456`.
- La chiave prod era effettivamente in `.env` (`ld_92e…`), confermando la causa del 401.

## Stato
- **PRONTO** per il test planner (Q5/Q2) dalla UI locale :8888.
- **NESSUN ordine creato**, nessun cleanup necessario, prod intatto.

STOP come da task.
