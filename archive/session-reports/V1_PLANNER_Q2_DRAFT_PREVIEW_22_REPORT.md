# V1_PLANNER_Q2_DRAFT_PREVIEW_22_REPORT

**Data:** 2026-06-18
**Task:** V1_PLANNER_ISOLATED_Q2_DRAFT_PREVIEW_22
**Verdict:** ✅ **PASS** — il giro Q2→Q5 è raccomandato (mejor operativo), il direct 20:45 NON è venduto come best ed è marcato `no_recomendado` per conflitto rider. Q2 resta solo bozza. Backend JSON e UI **coerenti**.

---

## 1. Perimetro confermato
SOLO V1 staging isolata, SOLO UI locale http://localhost:8888. Nessuna azione su production. Q2 NON confermato, NON mandato in cucina, nessuna proposta applicata, nessun manual_giro creato, nessun cleanup, nessuna patch/deploy.

## 2. Anti-prod check
| Check | Esito |
|---|---|
| localhost :8888 attivo | HTTP 200 ✓ |
| :8899 | non usato ✓ |
| `getConfig` | `PIZZERIA_NOME = La Dieci (STAGING)`, `PIANO = staging` ✓ |
| ref prod (`ladiecibot-production` / `wnswassgfuuivmfwjxsf`) | zero ✓ |
| backend commit | **`193b818`** (atteso), service `fearless-reverence`, branch `backup/v2-planner-rider-conflict-compatible-giro-…` ✓ |
| safety del contract | `{readOnly:true, writes:false, pii:"redacted"}` ✓ |

## 3. Stato anchor Q5 prima del test
`#001` · `EN_COCINA` · zona Q5 · hora 21:00 · salida 20:40 · entrega 21:00. Unico ordine in DB. Nessun Q2 residuo.

## 4. Dati bozza Q2 creata (NON confermata)
- Nome: `TEST_V1_STAGING_Q5_Q2_2100_DELETE_OK_Q2`
- Canale: Teléfono · Tipo: DOMICILIO
- Indirizzo: `Calle Cuba 5, Buenavista, Roquetas de Mar` → zona risolta **Q2 BUENAVISTA** (📡 photon, andata 9 min, SALIDA HORNO 20:36)
- Hora: **20:45** · Item: **1× El Gaucho (Diavola)** · Total **15,50€** (> 2,50€ fee) ✓
- Stato indirizzo nel modal: **⚠ Revisar** + warning inline `⚠️ Driver en Q5 21:00 · vuelve ~21:23 · sugerido 21:35 (no se aplica solo)`

## 5. Artefatti raccolti
- Screenshot popup "Propuestas de entrega · Vista previa" (mappa + Mejor propuesta + Giros y huecos).
- JSON backend `previewStrategicOpportunities` (contract `premium-planner-strategic-preview-v1`, input identico a quello del modal).
- innerText completo del popup.

## 6. Cosa vede l'operatore (UI)
Popup **"Propuestas de entrega · Vista previa"**:
- **Mejor propuesta:** `Entrega 20:52 · Añadir al giro · ajuste` + bottone "Aplicar propuesta" (NON cliccato).
- Mappa "Esquema operativo por zonas": zone Q1/Q2/Q3/Q4/Q5 + Pizzería + MAR. Rotta evidenziata **Pizzería → Q2 (stop 1, 20:52) → Q5 (stop 2, 21:04)** su **CANAL SUR**.
- Due chip opzione:
  - `20:52 · Añadir al giro · ajuste` (selezionata)
  - `20:45 · Crear giro Q2 · no recomendado` → "Sin opción"
- **Giros y huecos:** `Q5 · SALIDA 20:40 → ENTREGA 21:00 → REGRESO 21:20 · 1 pz`
- Notas: "Canal sur: Q1→Q2→Q5. Canal oeste: Q1→Q3→Q4. Cruzar canales no es recomendado."

## 7. Direct proposal Q2 (`proposals[]` rank 2 / `bestProposal`)
- kind `direct` ("Crear giro Q2") · status **`no_recomendado`** · recommended:false · hora 20:45 · zona "Q2 (sur)"
- `riderConflict: true` · warning: **"Conflicto rider: vuelve 20:54, pero Q5 debe salir 20:40"**
- routeTimeline: Pizzería 20:38 → Q2 20:45 (+0 margen) → Regreso 20:54. Il driver però è impegnato col giro Q5 (salida 20:40) → il direct non è applicabile da solo.
- salida (departure) 20:38 · entrega Q2 20:45 · regreso 20:54.

## 8. Giro compatibile Q2→Q5 (`proposals[]` rank 1 — RECOMMENDED)
- kind `insertion` · status **`ajuste`** · **recommended: true** · timeLabel 20:52 · zoneLabel **"Q2 → Q5 (sur)"**
- reason: **"Inserción posible con ajuste: Q2 20:52 → Q5 21:04"**
- Route: Pizzería → Q2 → Q5. Entrega Q2 **20:52**, entrega Q5 **21:04** (slip +4 min su Q5, da qui "ajuste").
- È la **Mejor propuesta** mostrata nella card grande. ✓ mejor operativo.

## 9. Alternative / Giros y huecos
- Alternative effettive: 2 (insertion rank1 recommended; direct rank2 no_recomendado "Sin opción").
- Giros y huecos mostra l'**anchor Q5 visibile** con la sua serviceLine completa (SALIDA/ENTREGA/REGRESO). Nessun altro hueco.

## 10. ServiceLine (JSON `serviceLine[]`)
`[{ id:#001, zone:Q5, promised:21:00, pizzas:1, salida:20:40, entrega:21:00, regreso:20:40→21:20 }]`
→ **salida 20:40 · entrega 21:00 · regreso 21:20** tutti presenti. ✓ (gap "serviceLine null" delle versioni precedenti **risolto** sul backend 193b818).

## 11. Mappa / ruta
Q2 e Q5 entrambi presenti, su CANAL SUR; linea/route coerente **Pizzería → Q2 → Q5** con ETA per tappa (20:52 / 21:04). Coerente. ✓

## 12. Verifica DB: Q2 non creato
`ordenes` staging = **1 sola riga** (`#001` Q5 EN_COCINA). **Nessun ordine Q2** creato. ✓

## 13. Verifica no writes reali
- `manual_giros` = `[]` (nessun giro reale creato) ✓
- `wa_msgs` = `[]` (nessun messaggio WhatsApp) ✓
- Q5 resta `EN_COCINA`, invariato ✓
- contract `safety.writes=false`, nessun "Aplicar propuesta"/"Añadir al giro"/"Confirmar" cliccato ✓
- Production intoccata ✓

## 14. Verdict — PASS
Tutte le 7 verifiche attese soddisfatte:
1. ✅ direct Q2 20:45 NON è best compatible (è rank2 `no_recomendado`).
2. ✅ direct mostra `conflicto rider` / `no_recomendado` per sovrapposizione con salida Q5 20:40.
3. ✅ giro Q2→Q5 è `recommended` / mejor operativo (insertion rank1, "Q2 20:52 → Q5 21:04").
4. ✅ card grande segue il recommended (insertion 20:52), non il direct.
5. ✅ serviceLine mostra salida/entrega/regreso.
6. ✅ mappa coerente Q2→Q5 (CANAL SUR).
7. ✅ Q2 resta bozza, non creato/confermato.

### ⚠️ Incongruenza non bloccante da segnalare
Il campo top-level legacy **`bestProposal`** del JSON punta ancora al candidato **direct** (`cand-crear-q2`, `status:no_recomendado`, `riderConflict:true`), mentre la lista additiva **`proposals[]`** (contract `premium-planner-proposal-selection-v1`) ranka correttamente l'insertion al rank 1 `recommended`. La UI usa `proposals[]` (corretto), quindi l'operatore vede il giro giusto; ma qualunque consumatore che leggesse `bestProposal` otterrebbe la proposta sbagliata (il direct no_recomendado). Da valutare in un blocco successivo (NON patchato qui).

## 15. Next step consigliato
- Cleanup del marker `TEST_V1_STAGING_Q5_Q2_2100_DELETE_OK` **solo dopo autorizzazione esplicita**.
- Valutare allineamento del campo legacy `bestProposal` a `proposals[0]` (o deprecarlo) — separato, con autorizzazione.

STOP. Nessuna patch, nessun deploy, nessun cleanup eseguito. localhost :8888 resta aperto.
