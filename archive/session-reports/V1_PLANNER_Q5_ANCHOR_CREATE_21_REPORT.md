# V1_PLANNER_Q5_ANCHOR_CREATE_21_REPORT

**Data:** 2026-06-18
**Task:** V1_PLANNER_ISOLATED_Q5_ANCHOR_CREATE_21
**Esito:** ✅ PASS — anchor Q5 creato dalla UI locale :8888 come operatore, portato a `EN_COCINA`. Q2 NON creato (come da task). localhost :8888 resta aperto.

---

## FASE 0 — Anti-prod preflight ✅
| Check | Esito |
|---|---|
| `:8888` raggiungibile | HTTP 200 |
| auth operador `123456` | token OK |
| proxy `getConfig` | `PIZZERIA_NOME = La Dieci (STAGING)`, `PIANO = staging` |
| `getOrdenes` | 0 |
| residui marker (proxy + Supabase staging) | 0 |
| ref prod (`ladiecibot-production` / `wnswassgfuuivmfwjxsf`) | zero |

Nessun residuo marker → nessuna cancellazione necessaria. Prod non toccato.

## FASE 1 — Ordine Q5 creato da UI (:8888) ✅
Flusso eseguito come operatore nella UI locale (preview):
- App già autenticata (DEV_AUTH_BYPASS operador); login PIN staging `123456` validato a parte.
- **Nuevo Pedido** → origine **☎ Teléfono**
- Nome cliente (marker): `TEST_V1_STAGING_Q5_Q2_2100_DELETE_OK_Q5`
- Indirizzo: `Urbanización Las Marinas, Roquetas de Mar` → modalità **DOMICILIO**, zona risolta **Q5 MARINAS** (📡 nominatim, ✅ Compatible, andata 20 min, SALIDA HORNO 20:40)
- Hora entrega: **21:00**
- Prodotto: **1× El Pelusa (Margarita Clásica)** — Total 14,50€ (12€ + 2,50€ entrega)
- **Confirmar pedido** → comparso il guard `window.confirm` "⚠️ HORA MUY LEJANA — 21:00 … 11h36 en el futuro" (atteso: 21:00 vs ora 09:23) → confermato come operatore (cliente l'ha chiesta esplicitamente nello scenario test)
- Card #001 comparsa in Pedidos come **⏳ Confirmando** → pulsante **🚀 A Cocina** → stato **EN_COCINA**
- NON mandato a EN_ENTREGA.

## FASE 2 — Verifica DB staging (Supabase `tdikhfeinufaahagmpjz`) ✅
Ordine letto da `ordenes`:

| Campo | Valore |
|---|---|
| id | `#001` |
| nombre | `TEST_V1_STAGING_Q5_Q2_2100_DELETE_OK_Q5` (marker ✓) |
| estado | **`EN_COCINA`** ✓ |
| tipo_consegna | `DOMICILIO` |
| zona | **`Q5`** ✓ |
| hora | **`21:00`** ✓ |
| forno_out | `20:40` |
| durata_andata_min | `20` |
| salida_driver_estimada | `20:40` *(null alla creazione → popolato alla transizione EN_COCINA)* |
| entrega_estimada | `21:00` *(idem, popolato su EN_COCINA)* |
| regreso/return | nessuna colonna popolata/presente |
| manual_giro_id | `null` |
| items | `[{n:"El Pelusa", q:1, p:12}]` |
| canal | `MANUAL` (l'origine "Teléfono" mappa a canal=MANUAL nel codice) |

**Nota runtime utile:** `salida_driver_estimada` ed `entrega_estimada` sulla riga `ordenes` erano `null` alla creazione (POR_CONFIRMAR) e si sono **popolati alla transizione `EN_COCINA`** (salida 20:40 = hora − andata; entrega 21:00 = hora).

**Integrità:** totale `ordenes` staging = **1** (`#001`), nessun duplicato nonostante i retry sul picker. Nessun cliente test creato (stellina/preferito non attivata; gli unici clientes sono i 2 seed `STAGING_SEED_*`, pre-esistenti, non col marker).

## Anti-prod / isolamento
- Tutte le scritture sono passate da `:8888` → proxy locale → Railway V1 `fearless-reverence` → Supabase staging `tdikhfeinufaahagmpjz`.
- `netlify.toml` punta a staging; `.env` non contiene URL; `RAILWAY_API_KEY` allineata a V1 (fix task precedente).
- Production Netlify/Railway/Supabase **non toccata**; nessuna query di scrittura verso prod.

## Screenshot
Tab **Cocina (1)** — card `#001`, marker visibile, **EN ESPERA**, hora 21:00, **El Pelusa ×1 Margarita Clásica**, pulsante LISTO. (Catturato a 09:26, countdown ~693 min coerente con target 21:00.)

## Stato finale
- Anchor Q5 in **EN_COCINA** su staging isolato.
- **Q2 NON creato** (come da task).
- **localhost :8888 resta aperto** (server `ladieci-dev` attivo, non fermato).
- Marker da pulire in un task successivo: `TEST_V1_STAGING_Q5_Q2_2100_DELETE_OK`.

STOP.
