# NUEVO_PEDIDO_PERFORMANCE_AUDIT_01 — REPORT

**Data:** 2026-06-15 · **Tipo:** AUDIT READ-ONLY (nessuna modifica codice, nessun deploy)
**Codice analizzato:** produzione live `2195c66` (branch release `release/prod-old-ui-wa-cocina-hotfix-2026-06-15`, base 777ae55) → `ladieci-app33/src/components/NuevoPedidoModal.jsx`

---

## Premessa importante (buona notizia)
Nel codice **di produzione** il modal è **molto più snello** di quanto temuto nel primo audit (`LIVE_PERFORMANCE_AUDIT_APP_SLOW_01`, che leggeva per errore il working-tree `consolidation`). In produzione **NON esistono** `previewOrderPlanner`, `previewStrategicOpportunities`, `previewManualGiroRoute`, `getManualGiros`: quelle sono Planner UX/V1, **fuori dalla live**. Quindi niente catena di 4-6 preview.

---

## 1. Inventario chiamate (produzione 2195c66)

| # | Chiamata | Trigger (useEffect deps) | Debounce | Cancel/guard | Quando |
|---|---|---|---|---|---|
| A | `getClientes` (:432) | `[visible]` | no | no | 1× all'apertura (autocomplete nomi) |
| B | `getClientePorTel` (:414) | `[tel, visible]` | **sì** (setTimeout + cleanup) | cleanup clearTimeout | a ogni pausa di battitura tel |
| C | `sb.select DRIVER_STATO` (:475) | `[visible]` | no | no | 1× all'apertura (stato driver) |
| D | **`resolveAddress`** (:507) | `[direccion, tel, tipoConsegna, zonaManuale]` | **sì 800ms** (geocodeTimer) | ⚠️ **NO** in-flight guard | a ogni pausa su indirizzo (DOMICILIO) |
| E | **`previewOrderTiming`** (:679) | `[visible, tipoConsegna, direccion, hora, zonaManuale]` | **sì 450ms** | ✅ `cancelled` flag | a ogni pausa su indirizzo/hora (DOMICILIO) |
| F | `upsertCliente` (:294) | submit (solo se "preferito") | n/a | n/a | 1× al salvataggio, opzionale |

Calcoli **locali, ZERO API**: `slotFeedback` (forno + proposta driver, :570-661) e i conta-pizze sono pura computazione client su `ordenes` già in memoria. **Aggiungere prodotti NON genera chiamate.**

## 2. Sequenziali vs duplicate

- **All'apertura:** A + C in parallelo (2 letture). OK.
- **Battitura tel:** B (debounced). OK.
- **Battitura/modifica indirizzo (DOMICILIO):** partono **D *e* E** sullo stesso input. **Qui sta lo spreco:**
  - `resolveAddress` (D) geocoda l'indirizzo → zona/lat/lon (per il badge zona).
  - `previewOrderTiming` (E) geocoda **di nuovo** lo stesso indirizzo server-side → ritorna zona, durata_andata_min, geo_source, forno_out, suggested_hora, ecc.
  - → **doppia geocodifica dello stesso indirizzo** (D è in gran parte un sottoinsieme di E). Il backend cacha (geo_cache), quindi la seconda è spesso un cache-hit, ma restano **2 round-trip** Netlify→Railway per ogni modifica indirizzo, con debounce **disallineati** (E a 450ms parte prima di D a 800ms).
- **Modifica hora:** rilancia solo E (hora è nelle sue deps); D **non** dipende da hora → corretto, nessun doppione su hora.

## 3. Debounce / cancel attuali
- B: debounced ✅
- D (`resolveAddress`): debounced 800ms ✅ — ma **senza guardia in-flight**: se l'indirizzo cambia mentre una richiesta è in volo, il risultato vecchio può sovrascrivere il nuovo (race da out-of-order). Difetto minore.
- E (`previewOrderTiming`): debounced 450ms ✅ + `cancelled` flag ✅ (fatto bene).
- A, C: una tantum all'apertura (no debounce, ma sono singole).

## 4. Stima round-trip — nuovo DOMICILIO tipico
Apri → nome → tel → indirizzo (nuovo) → hora (auto/conferma) → prodotti:
- apertura: **2** (A getClientes + C DRIVER_STATO)
- tel: **1** (B)
- indirizzo: **2** (D resolveAddress + E previewOrderTiming) ← di cui ~1 è geocodifica duplicata
- hora: **1** (E si rilancia) — spesso auto-impostata da E, quindi può non aggiungere nulla
- prodotti: **0**

**≈ 5-6 round-trip**, di cui **1 sprecato** (la seconda geocodifica). Se l'operatore riscrive l'indirizzo più volte, ogni riscrittura aggiunge **+2**.

---

## 5. Verdetto

**Inevitabili (servono per correttezza/UX):**
- E `previewOrderTiming` — fonte unica autoritativa (zona/durata/forno/hora proposta). Tenere.
- B `getClientePorTel` — prefill cliente. Tenere (già debounced).
- A `getClientes`, C `DRIVER_STATO` — servono, ma **ricaricate a ogni apertura** del modal.

**Sprechi:**
- **D `resolveAddress` = spreco principale**: geocodifica duplicata di ciò che E già ritorna (zona/durata/source). È la candidata n.1 alla rimozione.
- D senza guardia in-flight (race su risultati stantii).
- A/C ricaricate ogni apertura invece di una volta a livello app.

## 6. Patch consigliata (post-audit, NON in questo step)

**Opzione 1 — minima, frontend-only, BASSO rischio (consigliata per prima):**
1. Aggiungere a D la stessa `cancelled`-guard di E (elimina la race).
2. Allineare i due debounce (es. entrambi 600ms) così D ed E non partono sfasati e la cache geo è già calda quando parte E.
3. (Opz.) Caricare `getClientes` + `DRIVER_STATO` **una volta** a livello app (o cache di sessione) invece che a ogni apertura modal.
→ Riduce le ripartenze e la race, senza toccare il contratto backend.

**Opzione 2 — eliminare il doppione (vincita maggiore, rischio MEDIO):**
- **Rimuovere D `resolveAddress`** e derivare il badge zona/lat/lon/durata da `backendTiming` (la risposta di E, che già geocoda e ritorna `zona`, `durata_andata_min`, `geo_source`). Dimezza i round-trip indirizzo (da 2 a 1).
- ⚠️ **Vincolo:** `slotFeedback` usa `zonaInfo.lat/lon`; il contratto di `previewOrderTiming` ritorna `zona`/`durata_andata_min`/`geo_source` ma **lat/lon non sono garantiti** nella risposta. Se servono, andrebbe **aggiunto lat/lon alla risposta backend** → diventa una modifica backend (fuori dallo scope "NON backend"). In alternativa `slotFeedback` si appoggia solo a `durata_andata_min` (già preferito da `risolviTempoAndata`).

## 7. Rischio
- Opzione 1: **basso** — solo guardia + tuning debounce; comportamento invariato, meno chiamate sprecate. Testabile in staging.
- Opzione 2: **medio** — cambia da dove arriva il badge zona; richiede verificare lo shape reale di `previewOrderTiming` (e probabilmente un piccolo aggiunta backend per lat/lon). Da fare come task separato, con test, NON sulla live di corsa.

**Raccomandazione:** partire dall'**Opzione 1** (sicura, frontend-only) su **branch separato + staging**, misurare; valutare l'Opzione 2 solo dopo, coordinata col backend. Nessuna fretta sulla live.

---

## Safety
- ✅ Audit READ-ONLY: nessun deploy / patch / DB write / cleanup / push main / consolidation in produzione.
- ✅ `ORDINI_2026-05-23.md` non toccato. Produzione invariata (`2195c66` / `6a3024ce…` locked).
