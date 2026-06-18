# BLOCK_0_CLEANUP_REPORT

Data: 2026-06-17 — cleanup dati TEST V1 Planner. **Solo marker. Nessun dato reale toccato. Nessun deploy/push.**

## Marker pulito
`TEST_V1_PLANNER_2100_Q5_Q2_Q1_DELETE_OK`

## Eliminati
- `ordenes` **#001** (Q5, EN_COCINA, marker `…_DELETE_OK_Q5`) → 1 riga
- `clientes` **id 672** (creato dall'anchor, tel 600000021, marker) → 1 riga
- Bozza Q2 (tel 600000022): **non aveva lasciato nulla** (mai confermata).

## Verifica finale (tutti = 0)
| voce | valore |
|---|---|
| ordenes marker | 0 |
| clientes marker | 0 |
| clientes (qualsiasi TEST%) | 0 |
| manual_giros marker | 0 |
| wa_msgs marker | 0 |
| ordini attivi totali | 0 |

DB pulito. La schermata localhost mostra ancora la bozza Q2 stantia (riferiva #001 ora eliminato) — nessun impatto DB; verrà ricreata nel BLOCCO 7.

**BLOCK 0 = PASS.**
