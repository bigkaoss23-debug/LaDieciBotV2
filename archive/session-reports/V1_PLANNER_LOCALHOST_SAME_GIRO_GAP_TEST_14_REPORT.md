# V1_PLANNER_LOCALHOST_SAME_GIRO_GAP_TEST_14_REPORT

Data: 2026-06-16 — **TEST AUTONOMO LOCALHOST V1, a microstep. In corso.** Solo ordini TEST marker + cleanup finale. NO production, NO deploy, NO push. PIN/JWT/API key non riportati.

Marker: `TEST_V1_PLANNER_SAME_GIRO_GAP_2026_06_16_DELETE_OK`

> ⚠️ STATO: fermo dopo **FASE 1** (come da istruzione "STOP microstep dopo Q5"). Q5 anchor **lasciato in DB** per le FASI 2/3. Localhost **aperto**. Cleanup NON ancora eseguito.

---

## FASE 0 — Preflight (PASS)
| Check | Valore |
|---|---|
| Repo | `LaDieciBotV2` (-github) |
| Branch | `consolidation/nuevo-pedido-v1-unified-2026-06-09` |
| HEAD | `c07c68f` (= atteso) |
| git status (src/scripts) | pulito |
| **Localhost V1** | **http://localhost:8888** → `netlify dev` (CRA :3002 + functions api/auth), serve commit **`c07c68f`** = nuovo modal V1 + PremiumPlannerPopup cablato (NON la vecchia UI `-p1a` su :3000/:8899) |
| Login locale | OK (role operador, `DEV_AUTH_BYPASS`, PIN non stampato) |
| Production | `069c273 / 6a303f3d / locked` → intoccata |
| Ora Madrid | 09:25 CEST → **locale chiuso** (sicuro) |

### Baseline DB (tutti 0)
| Tabella | Marker count |
|---|---|
| `ordenes` (totali attive) | 0 |
| `ordenes` marker | 0 |
| `clientes` marker | 0 |
| `wa_msgs` marker | 0 |
| `manual_giros` marker | 0 (esistono solo vecchi reali, es. `mg_260525_1`) |

---

## FASE 1 — Anchor Q5 creato (via localhost V1)
Creato senza tel/direccion (→ niente cliente/geo/wa), canal MANUAL, EN_COCINA.

| Campo | Valore |
|---|---|
| order id | `#001` |
| nombre | `…_DELETE_OK #Q5` |
| zona | Q5 (Las Marinas) |
| hora promessa | 11:25 (now+2h) |
| estado | EN_COCINA |
| **forno_out** | **11:13** |
| **salida_driver_estimada** | **11:13** |
| **entrega_estimada** | **11:25** |
| regreso / regreso_estimado / driver_return | **None (colonna inesistente nello schema `ordenes`)** |
| pizzas / n_pizze | None (non sono colonne; derivati dagli items) |
| manual_giro_id | None |
| tipo_consegna | DOMICILIO · durata_andata_min 12 |
| appare in getOrdenes | SÌ |

### Verifica anchor/serviceLine nel preview (draft Q2 @11:10, now 09:30)
- Q5 `#001` **appare** come anchor → `serviceLine n=1` (zone Q5, pizzas 2)
- `opportunities`: `#001` status **ajuste** (insertion) → il planner propone di usare il giro
- `proposals`: direct (compatible, 11:10) + insertion (ajuste, **11:17**)

### 🔴 BUG C — ROOT CAUSE individuata (FASE 1)
L'ordine `#001` **HA** `salida_driver_estimada`=11:13 e `entrega_estimada`=11:25 in DB, **ma** la `serviceLine` del preview ritorna **`salida`/`entrega`/`regreso` = null**.
⟹ Il problema NON è dati mancanti: è il **mapping snapshot→anchor del backend** (`loadSnapshot` / `sanitizeAnchor` / `buildAnchorsFromSnapshot` in `previewStrategicOpportunities.js`) che **non legge** `forno_out` / `salida_driver_estimada` / `entrega_estimada` dalla riga ordine.
Inoltre `regreso` **non esiste** come colonna in `ordenes` → la gamba "Regreso" non potrà mai essere reale finché il backend non la calcola (es. `entrega + durata_ritorno`).
→ La UI "Giros y huecos" mostra "—" per colpa del backend, non del frontend. **Task backend separato.**

---

## Prossimi microstep (NON ancora eseguiti)
- **FASE 2**: preview bozza Q2 @ (Q5−15=11:10), JSON completo + analisi primo-buco-libero / same-giro / no_recomendado.
- **FASE 3**: preview bozza Q1, stesso scenario.
- **FASE 5**: audit bug A–E.
- **FASE 6**: cleanup marker (eliminaOrdine #001 + verifica zero).

## Invarianti correnti
- Production intoccata (`6a303f3d` locked). Repo pulito `c07c68f`.
- Localhost V1 **aperto** su http://localhost:8888 (lasciare aperto).
- Q5 `#001` ancora in DB (necessario per FASI 2/3; cleanup in FASE 6).

**STOP microstep dopo FASE 1.** In attesa di "continua" per FASE 2 (Q2). Nessun Q2/Q1 creato. Nessun cleanup. Localhost lasciato aperto.
