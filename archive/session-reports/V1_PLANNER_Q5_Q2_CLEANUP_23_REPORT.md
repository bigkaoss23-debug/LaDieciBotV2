# V1_PLANNER_Q5_Q2_CLEANUP_23_REPORT

**Data:** 2026-06-18
**Task:** V1_PLANNER_Q5_Q2_CLEANUP_23
**Verdict:** ✅ **PASS** — marker rimosso completamente da Supabase staging, baseline `ordenes` tornata a 0, seed/config/geo_cache intatti, production non toccata.

---

## 1. Anti-prod check
- Target: `https://tdikhfeinufaahagmpjz.supabase.co` (**staging** `tdikhfeinufaahagmpjz`) — confermato non-prod.
- Nessun contatto con `wnswassgfuuivmfwjxsf` (Supabase prod), `ladiecibot-production` (Railway prod), `02bd4c7a-…` (Netlify prod).
- Delete eseguito via proxy locale :8888 → backend V1 `fearless-reverence` → Supabase staging. Letture via REST staging (anon publishable). Nessun segreto stampato.

## 2. Conteggi pre-cleanup (marker `TEST_V1_STAGING_Q5_Q2_2100_DELETE_OK`)
| Tabella | total | marker | id markerizzati |
|---|---|---|---|
| ordenes | 1 | 1 | `#001` |
| clientes | 2 | 0 | — (2 seed `STAGING_SEED_*`) |
| manual_giros | 0 | 0 | — |
| wa_msgs | 0 | 0 | — |
| conv | 0 | 0 | — |
| storico | 0 | 0 | — |
| archivio_conv | 0 | 0 | — |

Match calcolato lato client su substring esatto del marker (evita falsi positivi del wildcard `_` di ILIKE). Unico dato test reale: `ordenes #001` (anchor Q5 EN_COCINA).

## 3. Righe eliminate per tabella
| Tabella | Eliminati | Metodo |
|---|---|---|
| ordenes | **1** (`#001`) | `eliminaOrdine` via proxy autenticato → `{"success":true}` (HTTP 200) |
| manual_giros | 0 | nessun marker |
| wa_msgs | 0 | nessun marker |
| conv | 0 | nessun marker |
| storico | 0 | nessun marker |
| archivio_conv | 0 | nessun marker |
| clientes | 0 | nessun marker (seed preservati) |

## 4. Conteggi post-cleanup
| Tabella | total | marker |
|---|---|---|
| ordenes | **0** | 0 |
| clientes | 2 (seed) | 0 |
| manual_giros | 0 | 0 |
| wa_msgs | 0 | 0 |
| conv | 0 | 0 |
| storico | 0 | 0 |
| archivio_conv | 0 | 0 |

`ordenes` totali staging tornate a **0** (baseline originaria). `manual_giros=[]`, `wa_msgs=[]`.

## 5. geo_cache non toccata
`geo_cache` = 5 righe, invariata (mai interrogata in scrittura né cancellata).

## 6. config non toccata
`config` = 18 righe, invariata. `PIZZERIA_NOME` resta `La Dieci (STAGING)`.

## 7. Production intoccata
Nessuna operazione su Supabase/Railway/Netlify di produzione. Solo staging.

## 8. Residui append-only lasciati intenzionalmente
- `orden_estado_logs` (e simili log audit append-only) **non interrogati né modificati**: il task indica di lasciarli salvo marker esplicito già previsto. Eventuali entry generate dal ciclo di vita di `#001` restano come audit storico (non markerizzate per nome). Nessuna azione su di esse.
- Clienti seed `STAGING_SEED_Cliente Q2` / `STAGING_SEED_Cliente Q5` preservati come da regola.

## 9. Verdict
✅ **PASS** — cleanup chirurgico completato: 1 riga eliminata (`ordenes #001`), 0 marker residui su tutte le tabelle, seed/config/geo_cache intatti, production intoccata.

STOP. Nessuna patch, nessun deploy, nessun fix same-zone aperto in questo blocco.
