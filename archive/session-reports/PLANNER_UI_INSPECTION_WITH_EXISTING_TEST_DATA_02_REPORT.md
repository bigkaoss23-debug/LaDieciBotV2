# PLANNER UI INSPECTION — WITH EXISTING TEST DATA — REPORT 02

**Data:** 2026-06-14
**Ambiente:** PRODUZIONE (netlify dev :8888 → `.env` → Railway prod + Supabase prod `wnswassgfuuivmfwjxsf`). Nessun DB test isolato.
**Backend live:** deployment `78baa172…` ≈ commit `96ec441` ("fix guard planner against too-early confirmations").
**Modalità:** ispezione read-only. Nessun deploy / commit / push / patch / cleanup / delete.

---

## 1. Snapshot dati TEST in DB (#001–#012) — NON eliminati

Creati 2026-06-14 ~10:57, marker `TEST_STRESS_*`, tel `""`, canal MANUAL, 1 pizza, EN_COCINA (tranne #005). Fonte: `/tmp/stress_ids.json`.

| # | Caso | Tipo | Zona / indirizzo | Hora | Forno | Note |
|---|------|------|------------------|------|-------|------|
| 001 | R1 | RITIRO | — | 21:00 | 21:00 | |
| 002 | R2 | RITIRO | — | 21:10 | 21:10 | |
| 003 | D1 | DOMICILIO | Q1 Avda Juan Carlos I 50 | 21:30 | 21:26 | manual_giro `mg_260614_1` |
| 004 | D2 | DOMICILIO | Q1 Avda Juan Carlos I 50 | 21:35 | 21:31 | manual_giro `mg_260614_1` |
| 005 | D3 | DOMICILIO | Q1 | 21:40 | — | **RETIRADO** (test replan; nascosto da getOrdenes) |
| 006 | D4 | DOMICILIO | Q2 | 21:45 | 21:36 | |
| 007 | D5 | DOMICILIO | Q2 | 21:50 | 21:43 | |
| 008 | D6 | DOMICILIO | Q5 | 21:55 | 21:43 | |
| 009 | D7 | DOMICILIO | Q1 | 22:00 | 21:55 | |
| 010 | D8 | DOMICILIO | Q2 | 22:05 | 21:56 | |
| 011 | D9 | DOMICILIO | Q5 | 22:10 | 21:58 | |
| 012 | D10 | DOMICILIO | Q1 | 22:15 | 22:11 | salida rider 23:37 (cascade) |

**manual_giro `mg_260614_1`**: membri [#003, #004], hora_ref 21:26, entrega_ref 21:30. 0 clientes creati.

**Cleanup futuro (SOLO su ordine esplicito utente):** `dissolveManualGiro("mg_260614_1")` + `eliminaOrdine` per #001→#012.

---

## 2. Finding strutturali confermati

### 2.1 Cocina UI
#003/#004 mostrano chip `GIRO MANUAL · G1`, `⏱ 21:26 +5`, `🛵 GIRO 21:30`. Badge tab "Cocina 11".

### 2.2 Entregas UI
Gruppo "Giro manual G1 ⏱21:26 Q1 (2 pedidos · Disolver)"; gruppi Q2 BUENAVISTA, Q5 MARINAS; header "9 Total · 4 Q1 · 3 Q2 · 2 Q5". Ogni card: "⚠ Repartidor tarde · salida HH:MM · +N min · entrega est. HH:MM".

### 2.3 Incoerenza manual giro (backlog noto: "manual-giro replan no-op")
Dentro G1, #004 mostra "salida 21:37 +6 min · entrega 21:41" che **contraddice** il "🛵 GIRO 21:30" del giro. I campi driver dei membri non si re-sincronizzano sul giro.

### 2.4 Cascata single-rider (DB)
10 delivery 21:30–22:15 saturano il rider → `retraso_estimado_min` cresce fino a 86 (#012 salida 23:37), `conflicto_driver=true` sui pile-up. **`forno_out` NON contaminato** dai tempi rider (#012 forno 22:11 vs salida 23:37). ✓

### 2.5 Driver replan su stato (#005 LISTO→EN_ENTREGA→RETIRADO)
`forno_out` degli altri STABILE ✓. Ma salida/entrega/retraso degli altri NON cambiati (prudent-replan / floor committati). **[Da confermare se voluto.]**

### 2.6 Finding "+585 margen"
Con draft-hora vicina a "ora" (es. 11:40/12:00) mescolata con anchor serali (21:30), lo strategic mostra "+585 margen" assurdo. Causa = draft-hora fuori dalla finestra anchor, non bug costante (con hora allineata i margini sono corretti). Conferma indiretta in questa sessione: `earliest_hora` RITIRO = `12:25` → ora Madrid ~12:00, ben lontana dalle hora di test serali. **Da valutare:** lo strategic dovrebbe filtrare anchor fuori finestra / usare una service window coerente.

---

## 3. Casi A–E

### Caso A — Q1 same-zone (Avda Juan Carlos I 50, hora 21:35) — `planner_ui_A_*.png`
- **UI:** inline "✅ Compatible", ENTREGA 21:35, SALIDA HORNO 21:31, chip "✅ 21:30 · Q1 [Usa giro compatible]".
- **Backend:** giro proposto `AU:Q1|1290` (slot 21:30) = **giro AUTO, NON il manual giro G1**.
- **Strategic:** "Mejor propuesta · Crear giro Q1" (kind crear) + AGREGAR Q1 21:40(+5)→Q2 21:47(+2).
- **Verdict:** ⚠️ ATTENZIONE — **doppione**: propone creare un nuovo Q1 ignorando sia G1 sia l'auto Q1. Margini sani perché draft-hora allineata agli anchor.

### Caso B — Q2 cross-zone (Urbanizacion Playa Serena, hora 21:40) — `planner_ui_B_*.png`
- **UI:** badge "⚠ Revisar"; zona "Q2 BUENAVISTA · 9 min · google-from-nominatim"; ENTREGA 21:40, SALIDA HORNO 21:31; warning **"⚠ Driver en Q1 21:30 · vuelve ~21:37 · sugerido 00:05 (no se aplica solo)"**; blocker "no llega a la hora pedida" + chip "🔁 21:40 · Q2 [Usa giro compatible]".
- **Backend `previewOrderTiming`:** `zona=Q2`, `durata 9`, `forno_out=21:31`, `suggested_hora="00:05"`, warning `driver_conflict` "Driver en Q1 21:30 · vuelve ~21:37", `driver.has_conflict=true`, `giro.suggested=false`.
- **Anomalia "sugerido 00:05" — ROOT CAUSE (backend):** [`previewTiming.js:324`](../ladieci-bot/src/agents/previewTiming.js#L324) `suggestedHora = toH(propose.consegnaPropostaMin)`. `proposeForNewOrder` restituisce un `consegnaPropostaMin` **fuori giornata** che `toH()` rende grezzo come `00:05` (wrap oltre la mezzanotte). Reso 1:1 in UI da [`NuevoPedidoModal.jsx:1362-1366`](ladieci-app33/src/components/NuevoPedidoModal.jsx#L1362). **Non corretto (ispezione).**
- **Verdict:** ⚠️ ATTENZIONE — blocca/avvisa correttamente (driver conflict reale), ma il valore "sugerido" è garbage temporale → consiglio inutilizzabile per l'operatore.

### Caso C — Q5 far (Las Marinas, Roquetas de Mar, hora 21:55) — `planner_ui_C_*.png`
- **UI:** badge "✅ Compatible"; zona "Q5 LAS MARINAS · 12 min · google-from-nominatim"; ENTREGA 21:55, SALIDA HORNO 21:43; riga "no llega a la hora pedida" + chip "🔁 21:50 · Q5 [Usa giro compatible]". Nessun warning rider nell'inline.
- **Backend `previewOrderTiming`:** `zona=Q5`, `durata 12`, `forno_out=21:43`, `suggested_hora=null`, NO warnings, `driver.has_conflict=false`.
- **Backend `previewOrderPlanner`:** `recommended_hora=21:50`, `can_confirm_requested_hora=true`, `entrega_estimada=21:50`; giro `AU:Q5|1310` slot 21:50 **`salida_driver=22:26`**; alternatives auto Q5 21:50 e 22:10; blocker `separate` "no llega a la hora pedida" (hora 22:38).
- **Verdict:** ⚠️ ATTENZIONE — NON bloccato, badge verde "Compatible", consiglia di aggregare a un auto-giro Q5. Ma `salida_driver=22:26` (36 min dopo lo slot nominale 21:50) — la saturazione single-rider **NON è mostrata** all'operatore: vede verde mentre il rider partirebbe oltre mezzora dopo. Stessa classe di incoerenza del 2.3 (slot/entrega vs salida reale).

### Caso D — too-early (Q1, hora ≈ now+3) — `planner_ui_D_*.png` (da sessione precedente)
- **UI:** badge "⚠ Revisar"; warning "⚠ Hora pedida muy pronta · mínimo HH:MM (cocina + andata) · sugerido …" + blocker "Hora pedida muy pronta · mínimo …".
- **Backend `previewOrderPlanner`:** `can_confirm=false`, reason `requested_hora_too_soon`, `forno_out=null`. ✓ (FIX backend OK)
- **Problemi residui:**
  1. Il box "SALIDA HORNO" mostra ancora forno naive nel passato (da `previewOrderTiming`, non gated sul planner).
  2. **Confermato live in questa sessione (vedi §4): il bottone Confirmar NON è gated sul planner.**
- **Verdict:** 🔴 ALTA (al limite del CRITICO) — il backend rifiuta, ma il frontend lascia confermare → metà fix mancante.

### Caso E — RITIRO (indirizzo vuoto, hora 21:00) — `planner_ui_E_*.png`
- **UI:** header passa a "RITIRO"; "RETIRAR A LAS 21:00 · SALIDA HORNO 21:00"; badge "✅ Horno 1/8 · 10 min"; nessun indirizzo/rider/giro.
- **Backend `previewOrderTiming`:** `tipo=RITIRO`, `zona=null`, `durata=null`, `forno_out=21:00` (= hora), `driver.has_conflict=false`, `giro.suggested=false`, `earliest_hora=12:25`.
- **Verdict:** ✅ OK — forno-only corretto, nessun rider, nessun giro, `forno_out == hora`.

---

## 4. Verifica gating "Confirmar too-early" (NON cliccato)

Confermato leggendo il codice in questa sessione:
- [`NuevoPedidoModal.jsx:410`](ladieci-app33/src/components/NuevoPedidoModal.jsx#L410):
  `const ok = items.length > 0 && nombre.trim().length > 0 && zonaAssegnata && (!yaPagedo || metodoPago !== "");`
- [`NuevoPedidoModal.jsx:1833`](ladieci-app33/src/components/NuevoPedidoModal.jsx#L1833):
  `disabled={!ok || submitting}`

`ok` **non referenzia** `plannerPreview.recommendation.can_confirm_requested_hora` né i blocker di `backendTiming`. → Con un prodotto + nome, **l'operatore PUÒ confermare un ordine too-early** (e per estensione anche un ordine con blocker driver/separate): l'inline mostra solo avvisi, nessun blocco effettivo. **Confirmar NON è stato cliccato** (creerebbe un ordine non valido).

---

## 5. BUG A — "Usa esta hora" non appare MAI (NON corretto, step separato)

Backend `recommendation` espone solo `recommended_hora`, mai `hora_proposta`/`suggested_hora`. [`NuevoPedidoModal.jsx:1646`](ladieci-app33/src/components/NuevoPedidoModal.jsx#L1646) richiede `hora_proposta || suggested_hora` per renderizzare il bottone → mai mostrato. Confermato in UI (Caso A: c'è "Usa giro compatible" ma NON "Usa esta hora") e via API.

---

## 6. Verdetto complessivo

| Area | Verdetto |
|------|----------|
| RITIRO (Caso E) | ✅ OK |
| `forno_out` non contaminato da rider | ✅ OK |
| Q1 same-zone (Caso A) | ⚠️ doppione giro |
| Q2 cross-zone (Caso B) | ⚠️ "sugerido 00:05" garbage |
| Q5 far (Caso C) | ⚠️ salida rider 22:26 nascosta, badge verde fuorviante |
| Too-early gating Confirmar (Caso D) | 🔴 ALTA |
| "Usa esta hora" (BUG A) | ⚠️ bottone morto |
| Manual giro replan (2.3) | ⚠️ no-op noto |

**Bug prioritari (suggeriti, NON applicati):**
1. 🔴 **Gating Confirmar sul planner** — includere `can_confirm_requested_hora` / blocker in `ok` (Caso D §4). Più vicino al CRITICO.
2. ⚠️ **"sugerido 00:05"** — fixare `consegnaPropostaMin` fuori-giornata in `proposeForNewOrder` o sanitizzare prima di `toH()` (Caso B §3).
3. ⚠️ **Cascade single-rider nascosto** — Caso C: badge "Compatible" mentre `salida_driver=22:26`; surface del ritardo reale nell'inline.
4. ⚠️ **Doppione proposta giro** — Caso A: strategic propone "crear Q1" ignorando G1 + auto Q1.
5. ⚠️ **BUG A "Usa esta hora"** — allineare contract recommendation ↔ render frontend.
6. ⚠️ **Manual giro replan no-op** — re-sincronizzare i campi driver dei membri sul giro.

---

## 7. Safety

- ✅ Nessun deploy / commit / push / patch / migration.
- ✅ Nessun cleanup, nessun ordine eliminato. #001–#012 + manual giro `mg_260614_1` lasciati in DB.
- ✅ Nessun ordine reale non-TEST toccato. `ORDINI_2026-05-23.md` non toccato.
- ✅ Tutte le preview backend `safety.writes:false` (read-only).
- ✅ Confirmar NON cliccato in nessun caso.
- ✅ Working tree frontend invariato (solo `M PremiumPlannerPopup.jsx` WIP preesistente).
- Screenshot inline in chat (il tool non salva .png su disco); nomi logici: `planner_ui_A/B/C/D/E_*.png`.
