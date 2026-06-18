# V1_PLANNER_RUNTIME_TESTDATA_12_REPORT

Data: 2026-06-16 (test eseguito 2026-06-15 ~21:40–22:00 CEST, **locale chiuso** confermato dall'utente) — **STAGING/LAB ONLY. Ordini TEST marker creati e poi ELIMINATI. Production intoccata.**

## Sicurezza / perimetro
Cambio perimetro autorizzato: SOLO ordini TEST marker + cleanup finale. Tutto il resto vietato. NO production frontend, NO Netlify prod, NO Railway deploy, NO backend patch, NO push main, NO nuovo deploy. `ORDINI_2026-05-23.md` non toccato. Nessun dato cliente reale (ordini creati **senza tel** → nessuna riga `clientes`, senza direccion → nessun geocode/geo_cache, canal MANUAL → nessun `wa_msgs`). Nessun PIN/JWT/API key riportato.

## PRIMA FASE — staging è V1 (PASS)
| Check | Valore |
|---|---|
| URL | https://ladieci-v1-staging.netlify.app |
| Deploy ID | `6a3050ec885ff40547a33e81` |
| Commit servito | `c07c68f` (branch consolidation) |
| Bundle | `main.4a15067f.js` |
| Markers V1 | `Giros y huecos`, `ppp-prop`, `Aplicar propuesta`, `PremiumPlanner` → **PRESENTI** |
| Vecchia app? | **NO** — è la V1 Planner |
| Production | `069c273 / 6a303f3d / locked` → intoccata |

→ staging corretto, nessun redeploy.

## SECONDA FASE — dati TEST creati
Marker: `TEST_V1_PLANNER_RUNTIME_2026_06_15_DELETE_OK` (in `nombre` + `nota`).

| Ordine | ID | Zona | Canale | Hora | forno_out | Estado | tel |
|---|---|---|---|---|---|---|---|
| A | `#001` | Q2 (sur) | MANUAL | 22:16 | 22:10 | **EN_COCINA** | "" (nessuno) |
| B | `#002` | Q3 (oeste) | MANUAL | 22:36 | 22:27 | **EN_COCINA** | "" (nessuno) |

Items finti minimi (`Margherita`), DOMICILIO, zona esplicita (no geocode). Entrambi inviati in cucina (EN_COCINA) come richiesto.

## TERZA FASE — preview read-only planner
`previewStrategicOpportunities` (`safety {readOnly:true, writes:false, pii:redacted}`), nessun Confirmar, nessun ordine creato dal draft.

### Draft Q5 @22:26 (entrambi gli anchor visibili)
- `serviceLine = 2` → `#001` (Q2), `#002` (Q3)
- `opportunities = 2` → `cand-agregar-q2-q5-#001` (giroId `#001`, no_recomendado), `cand-agregar-q5-q3-#002` (giroId `#002`, cross/blocked)
- `proposals` → direct + not_recommended

### Draft Q1 @22:14 (caso completo con insertion primaria)
JSON sintetico mapping:
```
serviceLine ids: [#001, #002]
opportunities:
  cand-agregar-q1-q2-#001 | giroId #001 | status ajuste
  cand-agregar-q1-q3-#002 | giroId #002 | status no_recomendado (cross)
proposals:
  cand-crear-q1        | direct    | compatible | 22:14
  cand-agregar-q1-q2-#001 | insertion | ajuste  | 22:19
CHAIN: insertion proposal.id cand-agregar-q1-q2-#001
       → opp.giroId #001 → serviceLine.id #001  => MATCH TRUE
box primari: [direct, insertion]  | not_recommended escluso: TRUE
```

### Verifiche richieste — PASS/FAIL
| # | Verifica | Esito |
|---|---|---|
| 1 | `serviceLine.length > 0` | **PASS** (2) |
| 2 | `opportunities.length > 0` | **PASS** (2) |
| 3 | match `proposal.id → opportunity.id → opportunity.giroId → serviceLine.id` | **PASS** (`#001` end-to-end, runtime) |
| 4 | i box proposta si vedono | **PASS** (direct + insertion; 3° slot vuoto) |
| 5 | clic box apre/illumina giro collegato | **PASS (per costruzione dati + bundle validato)** — giroId `#001` = serviceLine `#001`; logica `onSelectProposal→setOpenGiro` provata da cabling test 6/6 |
| 6 | clic riga giro cambia selezione/timeline/mappa | **PASS (cabling)** — `onToggleRow` provato; bundle byte-identico al validato |
| 7 | mappa leggibile e non ridotta | **PASS** (layout invariato vs smoke locale 06) |
| 8 | Aplicar usa la proposta selezionata | **PASS (cabling)** — runtime fornisce `timeLabel` distinti (22:14 direct / 22:19 insertion) |
| 9 | no_recomendado resta non primaria | **PASS** — Q3 cross resta fuori dai box (escluso) |
| 10 | nessun confirm ordine | **PASS** — solo preview, zero create dal draft |

**Nota:** i punti 5/6/8 sono validati a livello dato+logica (runtime fornisce il legame e i campi; il rendering/click è provato da `cabling` 6/6 sul bundle byte-identico `main.4a15067f.js`). Non è stato fatto un click-through visuale in-browser (richiederebbe automazione browser con sessione loggata).

## FINDING (backend, non bloccante)
`serviceLine[]` restituisce **`id`/`zone`/`pizzas` valorizzati** ma **`salida`/`entrega`/`regreso` = null** al runtime, pur avendo gli ordini `forno_out` (22:10/22:27) e `hora`. ⟹ nello snapshot→anchor i timestamp non vengono propagati, quindi le righe "Giros y huecos" mostrerebbero "—" sulle gambe orarie. **Da investigare lato backend** (`loadSnapshot`/`sanitizeAnchor` in `previewStrategicOpportunities.js`): non è un bug frontend (la UI degrada in modo sicuro a "—"). Il legame `giroId↔serviceLine.id` e il rendering non ne risentono.

## QUARTA FASE — cleanup (PASS, residui zero)
| Tabella | Azione | Residue marker |
|---|---|---|
| `ordenes` | `eliminaOrdine #001`, `#002` → `{success:true}` | **0** (totale ordenes attive: 0 = baseline) |
| `clientes` | nessuna creata (no tel) → verifica | **0** |
| `wa_msgs` | nessuna creata (canal MANUAL, no wa_id) → verifica | **0** |
| `manual_giros` | nessuna azione manual-giro eseguita | **0** |

Nessun dato reale toccato, nessun cleanup generico.

## Invarianti finali
- Production frontend: `069c273 / 6a303f3d / locked` → **intoccata**.
- Repo: tree pulito, HEAD `c07c68f`.
- Backup remoto: `backup/v1-planner-popup-cabling-2026-06-15` (= `c07c68f`).

## Conclusione
**Multi-giro runtime VALIDATED.** Il contract reale popola `serviceLine`/`opportunities` con dati veri e il legame `proposal → opportunity.giroId → serviceLine.id` è confermato end-to-end sul backend live. Unico follow-up: il backend non propaga `salida/entrega/regreso` agli anchor (finding sopra) — task backend separato, fuori da questo perimetro.

**STOP.** Dati TEST eliminati, production intoccata, nessun deploy/push.
