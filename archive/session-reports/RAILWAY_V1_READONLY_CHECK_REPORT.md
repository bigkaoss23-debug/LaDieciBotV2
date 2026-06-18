# RAILWAY_V1_READONLY_CHECK_REPORT

**Data:** 2026-06-17
**Tipo:** verifica READ-ONLY del backend Railway V1. Nessuna scrittura, nessun deploy,
nessun tocco a prod. Nessun valore segreto stampato.

**Backend V1:** `https://fearless-reverence-production-80bc.up.railway.app`
(nota: "production" è il nome autogenerato Railway — host **diverso** da
`ladiecibot-production`, è il V1 staging).

---

## ESITI

| Endpoint | Risultato | Esito |
|---|---|---|
| `/health` | `{ok:true}`, HTTP 200 | ✅ |
| `/status` | ok, `level=yellow`, **db=green**, commit `193b818` | ✅ |
| `/version` | commit `193b818`, branch `backup/v2-planner-rider-conflict-compatible-giro-2026-06-17`, deploymentId `a6413848` | ✅ |
| `getConfig.PIZZERIA_NOME` | `La Dieci (STAGING)` | ✅ staging |
| chiavi `WA_*` in config | **nessuna** | ✅ WA non configurato |
| ref prod `wnswassgfuuivmfwjxsf` in config | **0** | ✅ nessun ref prod |

### Note
- `level=yellow` deriva **solo** da `whatsappInbound`/`whatsappProcessed = yellow`
  (lastAt null → WhatsApp mai ricevuto/processato), cioè **WA inattivo come voluto**.
  `database=green`, `backend=green`.
- `PIZZERIA_NOME="La Dieci (STAGING)"` + assenza chiavi `WA_*` = config **staging**
  seedata (`tdikhfeinufaahagmpjz`), non prod.
- Commit backend `193b818` = planner-fix atteso.

## CONCLUSIONE
Backend Railway V1 **isolato su Supabase staging**, WhatsApp non configurato, nessun
riferimento a produzione. **PASS.** Pronto a fare da backend per il preview V1.

(Production non toccata: nessuna chiamata al backend prod, nessuna scrittura.)
