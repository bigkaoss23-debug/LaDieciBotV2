# V1_PLANNER_MULTI_DRAFT_ALTERNATIVES_24_REPORT

**Data:** 2026-06-18 · **Backend V1:** `fearless-reverence` commit `193b818` · **UI:** http://localhost:8888 (locale, staging isolata)
**Esito globale:** 3 PASS + 1 PARTIAL. Logica direct/insertion/canali sostanzialmente corretta. Una lacuna rilevante su **stessa-zona** (TEST C).

---

## Perimetro confermato / Anti-prod
- localhost :8888 (non :8899) · `getConfig` = `La Dieci (STAGING)` / `PIANO=staging` · zero ref prod (`ladiecibot-production`/`wnswassgfuuivmfwjxsf`).
- backend `193b818`, service `fearless-reverence`, Supabase staging `tdikhfeinufaahagmpjz`.
- Tutte le preview con `safety.readOnly=true, writes=false`. Nessuna conferma, nessun "Aplicar propuesta", nessun item mandato in cucina.

## Stato anchor Q5 prima dei test
`#001` · EN_COCINA · Q5 · hora 21:00 · salida 20:40 · entrega 21:00 · regreso 21:20 · manual_giro_id null. Unico ordine in DB. `manual_giros=[]`, `wa_msgs=[]`.

---

## TEST A — Q2 troppo presto (20:25)
1. **Input:** Teléfono, DOMICILIO, `…_Q2_EARLY`, Calle Cuba 5/Buenavista, 20:25, 1× El Gaucho (15,50€)
2. **Zona risolta:** Q2 BUENAVISTA (photon, andata 9 min) — stato ✅ Compatible
3. **Card principale:** `Entrega 20:25 · Crear giro Q2 · compatible`
4. **Direct:** rank1 `direct` **compatible** `recommended:true` — "Ruta compatible sin retrasos: Q2 20:25"
5. **Giro/alternativa:** rank2 `insertion` **no_recomendado** — "Q2 20:32 → Q5 20:44" (forzerebbe Q5 troppo presto)
6. **Warning:** nessuno
7. **ServiceLine:** `Q5 salida 20:40 / entrega 21:00 / regreso 21:20`
8. **Mappa:** Pizzería → Q2 (CANAL SUR), nessun Q5 in rotta (direct)
9. **JSON:** proposals[0]=direct/compatible, proposals[1]=insertion/no_recomendado; bestProposal=crear/compatible
10. **Verdict: ✅ PASS** — prima della salida Q5 il direct è possibile; il planner NON forza un giro inutile (l'insertion è marcata no_recomendado).

## TEST B — Q2 tardi/sovrapposto (20:55)
1. **Input:** Teléfono, DOMICILIO, `…_Q2_LATE`, Calle Cuba 5/Buenavista, 20:55, 1× El Gaucho
2. **Zona:** Q2 BUENAVISTA (✅ Compatible)
3. **Card principale:** `Entrega 21:02 · Añadir al giro · ajuste`
4. **Direct:** rank2 `direct` **no_recomendado** — "Conflicto rider: vuelve 21:04, pero Q5 debe salir 20:40" (departure 20:48 → Q2 20:55 → return 21:04)
5. **Giro:** rank1 `insertion` **ajuste** `recommended:true` — "Q2 21:02 → **Q5 21:14**" (slip **+14** su Q5)
6. **Warning:** direct riderConflict; insertion senza warning esplicito oltre "ajuste"
7. **ServiceLine:** `Q5 salida 20:40 / entrega 21:00 / regreso 21:20`
8. **Mappa:** Pizzería → Q2 (21:02) → Q5 (21:14), CANAL SUR
9. **JSON:** proposals[0]=insertion/ajuste, proposals[1]=direct/no_recomendado; bestProposal(legacy)=crear/no_recomendado (riderConflict)
10. **Verdict: ✅ PASS** (con riserva) — direct correttamente respinto; insertion proposta con il +14 su Q5 **dichiarato** in rotta (21:14). ⚠️ il +14 è etichettato solo **"ajuste"** (stessa label di +4/+7): la soglia di severità non scala.

## TEST C — stessa zona Q5 (21:05)
1. **Input:** Teléfono, DOMICILIO, `…_Q5_SAMEZONE`, Las Marinas, 21:05, 1× El Gaucho
2. **Zona:** Q5 MARINAS (nominatim, andata 20 min) — ✅ Compatible
3. **Card principale:** `Entrega 21:05 · Crear giro Q5 · compatible`
4. **Direct:** UNICA proposta — rank1 `direct` **compatible** `recommended:true` — "Ruta compatible sin retrasos: Q5 21:05" (departure 20:50 → Q5 21:05 → return 21:22)
5. **Giro/alternativa:** **NESSUNA** (no insertion)
6. **Warning:** `{code:"no_anchors", message:"No hay pedidos ancla compatibles"}` · UI: "No hay otros giros esta tarde" + "No hay pedidos ancla compatibles"
7. **ServiceLine:** **`[]` VUOTA** (l'anchor Q5 #001 sparisce, a differenza di A/B/D)
8. **Mappa:** Pizzería → Q5 (CANAL SUR), giro singolo
9. **JSON:** opportunities=0; bestProposal=crear/compatible, riderConflict null, timeline depart 20:50 / Q5 21:05 / return 21:22
10. **Verdict: ⚠️ PARTIAL** — il planner crea uno slot separato (interpretazione accettabile) MA:
    - **non riconosce l'anchor Q5 #001 come ancla compatibile** (`no_anchors`) pur essendo stessa zona → **nessuna aggregazione** offerta;
    - marca il direct Q5 21:05 come **"compatible · sin retrasos"** ignorando che il driver è impegnato sul giro #001 (salida 20:40 → regreso 21:20): il nuovo direct parte 20:50, **dentro** la finestra del giro esistente → **conflitto rider non rilevato**;
    - `serviceLine` vuota è incoerente con gli altri test (dove #001 compariva). Vedi raccomandazioni.

## TEST D — Q1 (20:45)
1. **Input:** Teléfono, DOMICILIO, `…_Q1_CHANNEL`, Plaza Itálica, 20:45, 1× El Gaucho
2. **Zona:** Q1 CENTRO (nominatim, andata 8 min) — ✅ Compatible
3. **Card principale:** `Entrega 20:50 · Añadir al giro · ajuste`
4. **Direct:** rank2 `direct` **no_recomendado** — "Conflicto rider: vuelve 20:52, pero Q5 debe salir 20:40"
5. **Giro:** rank1 `insertion` **ajuste** `recommended:true` — "Q1 → Q5 (sur)", "Q1 20:50 → Q5 21:07" (+7 su Q5)
6. **Warning:** direct riderConflict; nessun crossing (corretto)
7. **ServiceLine:** `Q5 salida 20:40 / entrega 21:00 / regreso 21:20`
8. **Mappa:** Pizzería → Q1 → Q5, **CANAL SUR** (Q1 e Q5 stesso canale)
9. **JSON:** proposals[0]=insertion "Q1→Q5 (sur)"/ajuste, proposals[1]=direct/no_recomendado
10. **Verdict: ✅ PASS** — logica canali rispettata: Q1 è su canal sur (Q1→Q2→Q5), quindi l'insertion Q1→Q5 è valida; direct respinto per conflitto rider.

### Probe extra cross-channel (read-only JSON, no UI, no write)
Q4 (oeste) vs anchor Q5 (sur): il backend **NON** offre alcun giro Q4→Q5 (solo `direct`, no_recomendado per rider conflict) → rispetta "Cruzar canales no es recomendado". ✓ (Nota minore: per Q4 il `direct no_recomendado` ha comunque `recommended:true` perché è l'unica opzione = best-of-bad. Warning `missing_travel_times` su Q4 in staging.)

---

## Tabella comparativa
| Test | Zona | Hora | Card principale | Direct | Giro/insertion | Slip Q5 | ServiceLine | Verdict |
|---|---|---|---|---|---|---|---|---|
| A early | Q2 sur | 20:25 | Crear giro Q2 · compatible | **compatible (best)** | no_recomendado | — | Q5 ok | ✅ PASS |
| B late | Q2 sur | 20:55 | Añadir al giro · ajuste | no_recomendado | **ajuste (best)** | **+14** (→21:14) | Q5 ok | ✅ PASS* |
| C samezone | Q5 sur | 21:05 | Crear giro Q5 · compatible | **compatible (best)** | nessuna (no_anchors) | — | **vuota** | ⚠️ PARTIAL |
| D Q1 | Q1 sur | 20:45 | Añadir al giro · ajuste | no_recomendado | **ajuste (best)** | +7 (→21:07) | Q5 ok | ✅ PASS |

\* PASS con riserva sulla label "ajuste" per slip +14.

## DB finale (read-only) — invariato
- `ordenes` = **solo `#001`** Q5 EN_COCINA (manual_giro_id null). Nessun draft creato (Q2_EARLY / Q2_LATE / Q5_SAMEZONE / Q1_CHANNEL **assenti**).
- `manual_giros` = `[]` · `wa_msgs` = `[]` · Q5 #001 ancora EN_COCINA.
- Production Netlify/Railway/Supabase **intoccata**. Nessun write reale, nessun manual_giro, nessun WhatsApp.

## Issue UX/contract emerse
1. **[Alta — TEST C] Stessa-zona non aggregata + conflitto rider non rilevato.** Un secondo Q5 a 21:05 produce `no_anchors` e `serviceLine:[]`: l'anchor Q5 #001 (EN_COCINA, non ancora partito) non viene considerato. Risultato: nessuna proposta di accorpamento e direct marcato "compatible" benché il driver sia occupato dal giro #001 fino a 21:20. Due same-zone genererebbero due viaggi sovrapposti.
2. **[Media — TEST B] Soglia "ajuste".** +4, +7 e +14 min sull'anchor ricevono tutti la stessa etichetta "ajuste"; un +14 dovrebbe forse scalare a una severità più alta.
3. **[Bassa — globale] Campo legacy `bestProposal` incoerente.** In TEST B `bestProposal`=direct `no_recomendado` mentre `proposals[0]`=insertion recommended. La UI usa correttamente `proposals[]`, ma chi leggesse `bestProposal` otterrebbe la proposta sbagliata (già segnalato nel blocco 22).
4. **[Bassa] `recommended:true` su `no_recomendado`** quando è l'unica opzione (cross-channel Q4): semanticamente ambiguo.

## Raccomandazioni future (NESSUNA patch ora)
- Far rientrare gli ordini same-zone EN_COCINA (non ancora EN_ENTREGA) nel set di ancore, così TEST C offre accorpamento o quantomeno rileva il conflitto rider; verificare perché `serviceLine` si svuota nel caso same-zone.
- Introdurre una soglia di slip che faccia passare l'insertion da "ajuste" a un warning più forte oltre N minuti.
- Allineare/deprecare il campo legacy `bestProposal` verso `proposals[0]`.
- (Opz.) chiarire `recommended` quando l'unica opzione è `no_recomendado`.

## Next step
- Cleanup del marker `TEST_V1_STAGING_Q5_Q2_2100_DELETE_OK` **solo dopo autorizzazione esplicita**.
- Eventuale blocco di fix per la lacuna same-zona (TEST C) — solo su autorizzazione.

STOP. Nessuna patch, nessun deploy, nessun cleanup. localhost :8888 resta aperto.
