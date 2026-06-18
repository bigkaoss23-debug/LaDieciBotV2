# PLANNER UX — OPERATOR DRAFT — READ-ONLY — 01

**Verdetto: OK** — planner osservato in draft, zero scritture, zero Confirmar.

> Nota ambiente: per rapidità eseguito su **preview locale** (`netlify dev` :8888, branch `9c1be6d` + modifiche non committate a `NuevoPedidoModal.jsx`/`PremiumPlannerPopup.jsx`), **non** sul sito staging. Stesso codebase consolidation, UX un filo più avanti dello staging. **Localhost punta a backend Railway + Supabase di PRODUZIONE** → mantenuta disciplina draft/no-write. Login via **DEV_AUTH_BYPASS** (PIN dev 123456): nessun PIN reale gestito, nessun write su `config` (il login reale farebbe `upsert`, evitato).

---

## Input draft usato
- Cliente test pre-esistente: **STRESS_B_Q2** / +34900000002 (id cliente 107, creato 16 mag — NON da questa sessione)
- Tipo: **DOMICILIO**, zona **Q2 Buenavista**
- Indirizzo: Calle Cuba 5, Roquetas de Mar (geo: cache-street, 6 min, *Google no disponible → haversine*)
- Prodotto: 1× **El Pelusa** (Margarita Clásica) 12.00€ → Total **14.50€** (incl. 2,50€ entrega)
- Ora: nessuna forzata → planner propone **22:10** (ENTREGA EST. 22:10 / SALIDA HORNO 22:04)
- **Confirmar pedido: MAI premuto**

## Sequenza screenshot (viste inline in chat)
1. Modal Nuevo Pedido con draft (0 prodotti, Confirmar disabilitato)
2. Picker prodotti → selezione El Pelusa (badge 1, 12€)
3. Planner "Propuestas de entrega" aperto (badge *Vista previa*)
4. Modal con 1 prodotto, badge **✓ Compatible**, Confirmar verde (non premuto)
5. Dashboard Servicio dopo chiusura modal (draft scartato)

## Cosa dice il planner (trascrizione fedele)
**Header:** "✦ Propuestas de entrega" · badge verde **"Vista previa"** (NON "Solo vista previa") · ×

**Mejor propuesta:** `Entrega 22:10` · `Crear giro Q2` · **compatible** · bottone verde **"Aplicar propuesta"**

**Layer 3 opzioni:**
| # | Opzione | Stato |
|---|---------|-------|
| 1 | 22:10 · Crear giro Q2 | **compatible** (selezionata, bordo viola) |
| 2 | — | **Sin opción** |
| 3 | — | **Sin opción** |

→ Una sola opzione praticabile; gli slot "Directa"/"Alternativa" mostrano **empty-state "Sin opción"**, non bottoni finti. **Nessun `no_recomendado`** (scenario compatibile, primario verde corretto).

**Esquema operativo por zonas (MiniZoneMap):** Q1 CENTRO · Q2 BUENAVISTA · Q3 IES · Q4 CORTIJOS · Q5 LAS MARINAS · MAR MEDITERRÁNEO. Marker **Pizzería** + badge "1" + marker **22:10** su Q2. `Ruta estimada: Pizzería → Q2 · CANAL SUR`.

**Giros y huecos** (oportunidades live, righe espandibili ▸):
- Q1 · SALIDA — · **ENTREGA 21:20** · REGRESO — · 2 pz
- Q1 · SALIDA — · **ENTREGA 21:50** · REGRESO — · 2 pz

**Notas del planner:** "Las filas son oportunidades del planner, no pedidos confirmados. Tocar una fila previsualiza el impacto en el mapa, no aplica nada. Canal sur: Q1→Q2→Q5. Canal oeste: Q1→Q3→Q4. Cruzar canales no es recomendado."

## Verifica safety UX (checklist)
- Nuevo Pedido resta pulito: ✓ (planner in overlay separato)
- Tre opzioni leggibili: ✓ (1 reale + 2 "Sin opción")
- `no_recomendado` non è bottone primario: ✓ (non comparso; primario = compatible verde)
- Giros y huecos mostra altri giri: ✓ (2 righe Q1)
- Nessun popup-su-popup: ✓ (il picker si chiude prima del planner)
- Nessun "Solo vista previa": ✓ (badge corretto = "Vista previa")
- Nessuna write network: ✓ (vedi sotto)

## Rete — solo lettura
- POST `/api/proxy` osservati = azioni **`preview*`** (`previewOrderPlanner`, `previewManualGiroRoute`, `previewStrategicOpportunities`) → calcoli read-only sul backend (confermato in `src/api.js` e `netlify/functions/api.js`, il proxy inoltra `?action=` senza persistere).
- GET: `getClientes`, lookup `clientes?tel=...`, `config` heartbeat, `/status`, `/health`.
- **Nessun** `crearOrden` / `updateEstado` / crear giro.

## Problemi UX / dati da segnalare
1. **Slot "Directa"/"Alternativa" come "Sin opción":** il primario è "Crear giro Q2" senza una "Directa" esplicita. Per single-rider è coerente (va creato un giro), ma per l'operatore l'assenza di un'etichetta "Directa" può risultare poco chiara. Da valutare se mostrare la directa anche come informativa.
2. **Geo Google non disponibile → haversine** (6 min, cache-street): ETA approssimata. Pre-esistente, non bloccante, ma incide sulla precisione del planner.
3. **Guard `no_recomendado` NON esercitato live:** lo scenario Q2 vicino era compatibile, quindi la UI slip>15 / Δpromised>25 → `no_recomendado` non è stata vista. Verifica visiva rimandata (richiederebbe un draft con hora che forzi slip grande — fattibile a freddo, sempre senza Confirmar).

## Invarianza DB (prima → dopo)
| metrica | pre-Fase2 | post-Fase2 | nota |
|---|---|---|---|
| ordenes | 10 | **11** | +1 = ordine REALE operatore **#011 CARLOS** (DOMICILIO Q1, Av. Sabinar 153, 21:50, creato 20:58:12) — **non mio** |
| ordini STRESS/TEST | 0 | **0** | mio draft mai persistito ✓ |
| clientes | 209 | 209 | nessun cliente creato (STRESS_B_Q2 esiste dal 16 mag) ✓ |
| manual_giros attivi | 0 | 0 | nessun giro creato ✓ |

I 14 `orden_estado_logs` negli ultimi 20 min = transizioni del servizio live (creazioni #009–#011 + LISTO), non riconducibili a questa sessione (i preview non loggano).

---

### Conclusione Fase 2
Il planner nuovo è **funzionante e read-only-safe**: badge "Vista previa", primario compatibile, empty-state corretti, mappa zone e "Giros y huecos" coerenti col servizio live, note esplicative chiare. Nessuna scrittura generata. Unico gap di copertura: la UI `no_recomendado` non è stata vista perché lo scenario era compatibile (osservazione, non difetto).
