# La Dieci Bot V2 — Delivery ETA Stress Matrix

Matrice operativa di stress test per il blocco
`indirizzi → geocode/cache → zona → durata → forno_out → Entregas`.

Obiettivo: nessun deploy del flusso delivery/ETA se la sezione P0 di questa
matrice non è verde in test manuali + browser preview.

---

## 1. Principio generale

1. **Durata reale o calcolata → mostra minuti.**
   Reale = Google Distance Matrix. Calcolata = Haversine su lat/lon validi.
2. **Durata fallback → NON salvarla come reale in DB.**
   `zona.tempoGiro` (es. 30 min) è un placeholder UX, non un dato osservato.
   Se finisce in `ordenes.durata_andata_min` come se fosse reale, inquina
   medie storiche, `delivery_logs`, e nasconde i casi che andavano misurati.
3. **Quando non sappiamo → warning, non bugia.**
   UI deve mostrare "—" o "ETA da verificare in Maps", non un numero finto.

---

## 2. Cascata ETA attesa

Ordine in cui il resolver deve provare a determinare zona + durata:

| Step | Sorgente | Cosa dà | Note |
|------|----------|---------|------|
| 1 | **Cache exact** (`geo_cache.direccion_key` match esatto) | zona, lat, lon, [durata] | Hit anche se durata=null (Bug B fix 17/05). Haversine ricalcola al consumo. |
| 2 | **Cache street fallback** (stessa via, civico diverso) | zona, lat, lon, [durata] | Filtro: lat/lon NOT NULL. **Niente più filtro durata** (ETA-05 fix 22/05). source=`cache-street`. |
| 3 | **Cliente storico** (telefono → indirizzo confermato) | zona, lat, lon, durata | Solo se direccion del cliente normalizza alla stessa cache-key dell'input. |
| 4 | **Google con civico** | zona, lat, lon, durata | Accetta solo ROOFTOP / RANGE_INTERPOLATED. `partial_match=true` scartato (ETA-03 fix 16/05). |
| 5 | **Google senza civico (retry stripped)** | zona, lat, lon, durata | ETA-02 fix. Accetta GEOMETRIC_CENTER (`allowApproximate=true`). Tradeoff ±2-3 min vs fallback. |
| 6 | **Nominatim** | zona (da classifyByCoord), lat, lon, durata=null | Salva in cache con source=`nominatim`. Durata=null → consumer fa haversine. |
| 7 | **Photon** | zona, lat, lon, durata=null | Bbox locale. source=`photon`. |
| 8 | **Keyword zona** | solo zona, no coords | `assegnaZonaDaKeyword`. Last resort prima del manual. |
| 9 | **Fallback / manual_required** | nulla | UI: "No detectada" + obbligo di scelta zona manuale. **MAI** salvare zona.tempoGiro come durata reale. |
|10 | **UI warning** | — | Se zona OK ma durata=null/sospetta → badge "ETA da verificare". |

Side effects attesi:
- Step 4/5/6/7 fanno `saveToCache` quando zona valida e non fuoriZona.
- Step 1/2 incrementano `hit_count` (best-effort, non bloccante).
- "Blindata" = `n_ordini_consegnati >= 1` → bypassa shadow/refresh.

---

## 3. Bug trovati in servizio live (22/05/2026)

### 3.1 "30 falso" → DELIVERY-ETA-04 (frontend)
Sintomo: ordini con `durata_andata_min=30`, `geo_source=null`, `zona_lat=null` in DB.
Causa: `risolviTempoAndata(...)` cadeva su `zona.tempoGiro = 30` e il valore veniva
salvato come durata reale.
Fix: in `NuevoPedidoModal.jsx`, se mancano sia snapshot ETA reale sia
coordinate fresche → `durata_andata_min = null` invece di 30.
Commit: `2cd3685`.

### 3.2 "Calle Lucena 12" → No detectada
Sintomo: "Calle Lucena" trovava Q5, "Calle Lucena 12" no.
Cause concorrenti:
- `direccionToCacheKey` non canonizza spazio civico ("calle lucena12" ≠ "calle lucena 12").
- Street fallback escludeva righe con `durata_andata_min IS NULL` → tutte le righe Lucena utili (lat/lon validi, durata null) escluse.
Fix applicato: street fallback ora accetta righe con lat/lon validi anche se durata null.
Commit: `f60e1bb`.

### 3.3 Cache con lat/lon validi ma durata null
Sintomo: 3 righe Lucena + `avenida las marinas 100` con coords ma `durata_andata_min=null`.
Causa: provider photon/nominatim non popolano durata; Google Directions non è stato
chiamato/è fallito sul refresh.
Fix architetturale (TODO P1): completare lazy con haversine quando lat/lon ma durata
null in `loadFromCache`, oppure batch refresh Google Distance Matrix per righe stale.

### 3.4 Street fallback bloccato da `durata_andata_min NOT NULL`
Vedi 3.2. Risolto ETA-05.

### 3.5 Entregas non vedeva delivery prima di LISTO
Fix precedente commit `1951a6d` (`fix show delivery orders in kitchen on entregas tab`).

### 3.6 Colori pallidi pizzeria / componenti sbagliati
Fix style commits `d907c86`, `726d7cc`, `afed67e`.

---

## 4. Tabella stress test indirizzi (30+ casi)

P0 = blocca release. P1 = warning ammesso. P2 = best-effort.

| # | Pri | Input | Zona attesa | Durata attesa (min) | Fonte attesa | PASS | FAIL | Note |
|---|-----|-------|-------------|---------------------|--------------|------|------|------|
| 1  | P0 | `Calle Lucena` | Q5 | ~7-9 (haversine) | cache exact | zona Q5, durata coerente, niente "No detectada" | "No detectada" o durata=30 | Riga storica `calle lucena` in cache. |
| 2  | P0 | `Calle Lucena 12` | Q5 | ~7-9 | cache-street (ETA-05) | matched `calle lucena`, source `cache-street` | "No detectada" | Bug originale ETA-05. |
| 3  | P0 | `Calle Lucena, 12` | Q5 | ~7-9 | cache-street | come #2 | come #2 | Virgola → spazio in normalizzazione. |
| 4  | P0 | `Calle Lucena  12` (doppio spazio) | Q5 | ~7-9 | cache-street | come #2 | come #2 | Step 4 helpers comprime spazi. |
| 5  | P0 | `Calle Lucena12` (no space) | Q5 | ~7-9 | cache exact (riga `calle lucena12`) | hit photon row | miss → manual | Differenza con #2: chiave diversa oggi. |
| 6  | P1 | `Calle Lursena 12` | Q5 | ~7-9 | Google retry stripped o Nominatim | classifica Q5 | manual | Tipo nome utente. |
| 7  | P0 | `Avenida Las Marinas 50` | Q5 | ~8 | cache exact (google) | zona Q5, durata≈8 google | durata≠8 o miss | Riga `avenida las marinas 50` blindata. |
| 8  | P0 | `Avenida Las Marinas 70` | Q5 | ~10 | cache exact (google) | zona Q5, durata≈10 google | miss/30 | Riga `avenida las marinas 70` (consegnati ≥1). |
| 9  | P1 | `Avenida Las Marinas 100` | Q5 | ~10 (haversine) | cache exact, durata null → haversine | zona Q5, durata haversine | "No detectada" | Riga google ma durata null → consumer haversine. |
| 10 | P0 | `Calle El Greco 5` | Q1 | ~3-5 | cache/google | zona Q1, durata≈3-5 | zona diversa o 30 | Caso #003 verificato live (4 min, google). |
| 11 | P1 | `Calle El Greco` | Q1 | haversine | Google retry stripped | zona Q1 | manual | Senza civico. |
| 12 | P1 | `Calle Cuba 5` | Q1/Q2 | google | Google | zona, durata reale | partial_match → cascata | Indirizzo reale Roquetas. |
| 13 | P1 | `Plaza Constitución` | Q1/Q2 | google retry stripped | Google approximate | zona OK | manual | Plaza, no civico. |
| 14 | P2 | `Calle Inventada Que No Existe 99` | — | — | manual_required | "No detectada" + UI manual | salva durata=30 finta | Stress fallback. |
| 15 | P2 | `qwerty asdf 1` | — | — | manual_required | manual | salva zona random | Garbage input. |
| 16 | P1 | `Marinas` | Q5 | — | keyword | keyword zona Q5, no coords, no durata | salva durata=30 | Keyword-only. |
| 17 | P1 | `marinas` (minuscolo) | Q5 | — | keyword | come #16 | case-sensitive bug | Normalizzazione lower. |
| 18 | P2 | `Aguadulce, Calle Mar 5` | fuori zona | — | pre-flight LOCALITA_FUORI_ZONA | `fuori_zona_localita` | classifica zona valida | Pre-flight in geoResolver. |
| 19 | P2 | `El Ejido, Avenida 1` | fuori zona | — | pre-flight | fuori_zona | classifica come Roquetas | Pre-flight. |
| 20 | P1 | `Avenida Reino de España 250` | (Q?) | google | Google | zona corretta | strip "España" rompe key | Test che "españa" non venga strippato senza virgola. |
| 21 | P1 | `Calle 5 de Marzo 3` | (Q?) | google | Google | zona corretta | normalize taglia "5" | Numero NEL nome via. |
| 22 | P1 | `Calle 28 de Febrero 10` | (Q?) | google | Google | zona corretta | "28" trattato come civico → strippato | Bug noto stripHouseNumber su prefisso numerico. |
| 23 | P2 | `C/ Lucena 12` | Q5 | come #2 | cache-street | matched `calle lucena` | manual | Abbreviazione C/. |
| 24 | P2 | `c/ lucena 12` | Q5 | cache-street | come #23 | come #23 | manual | Lower-case + abbrev. |
| 25 | P2 | `Av. Las Marinas 50` | Q5 | ~8 | cache exact dopo `av.` → `avenida` | hit `avenida las marinas 50` | miss | Canonicalizzazione Av./Avd./Avda. |
| 26 | P2 | `Avda Las Marinas 50` | Q5 | ~8 | come #25 | come #25 | miss | Variante. |
| 27 | P1 | `Calle Lucena 12, 04740 Roquetas de Mar, Almería, España` | Q5 | come #2 | cache-street | suffissi strippati, key = `calle lucena 12` | manual | Test step 1bis helpers. |
| 28 | P1 | `Calle Lucena 12 - piso 3` | Q5 | come #2 | cache-street | "piso 3" strippato, key = `calle lucena 12` | manual | Step 2 helpers. |
| 29 | P1 | `Calle Lucena 12 3ºA` | Q5 | come #2 | cache-street | "3ºA" strippato | manual | Step 2 helpers. |
| 30 | P1 | `Calle Lucena 12 bajo izq` | Q5 | come #2 | cache-street | "bajo izq" strippato | manual | Step 2 helpers. |
| 31 | P2 | `   Calle Lucena 12   ` (con spazi attorno) | Q5 | come #2 | cache-street | trim OK | manual | Whitespace edges. |
| 32 | P2 | `CALLE LUCENA 12` (tutto maiuscolo) | Q5 | come #2 | cache-street | lower OK | miss | Case folding. |
| 33 | P2 | `Calle Lúcena 12` (con accento) | Q5 | come #2 | cache-street | NFD strip diacritici | miss | Step 1 NFD. |

PASS = ciò che deve succedere. FAIL = sintomo da bloccare.

---

## 5. Test end-to-end (per ogni indirizzo P0)

Sequenza minima da eseguire in browser preview con WhatsApp simulato o
NuevoPedidoModal manuale:

1. **Crea ordine domicilio** dal modal con l'indirizzo target.
2. **Verifica risoluzione indirizzo** nel modal:
   - badge zona corretto
   - durata coerente o "—" con warning (mai 30 falso)
   - source mostrato (cache / cache-street / google / nominatim / photon / keyword / manual)
3. **Conferma ordine** → arriva in `ordenes`:
   - `zona`, `zona_lat`, `zona_lon` popolati o tutti null (mai mix incoerente)
   - `durata_andata_min` = reale OR null (mai 30 da fallback)
   - `geo_source` coerente con `durata_andata_min`
   - `durata_google_min`, `durata_haversine_min` per A/B
4. **TabCocina** mostra la card delivery con `forno_out` autoritativo backend
   (`max(hora - andata, driver_libero)`).
5. **TabEntregas** la vede subito (anche pre-LISTO, fix `1951a6d`).
6. Stato → **LISTO** → countdown driver coerente.
7. Stato → **EN_ENTREGA** → resta visibile in TabListos (fix 13/05).
8. Stato → **RETIRADO** → archiviato. `delivery_logs` aggiornato con durata reale.

Controlli post-test sul DB (READ-ONLY):
- `ordenes` ultimo ordine: nessun `durata_andata_min=30 AND geo_source IS NULL`.
- `geo_cache`: la nuova riga (se ne crea una) ha source coerente.
- `delivery_logs`: durata_stimata vs durata reale (cassa di analisi A/B).

---

## 6. Regole di release

**Niente deploy del flusso delivery/ETA** (backend `geoResolver.js` / `zones.js` /
`creaOrdine`-`forno_out`; frontend `NuevoPedidoModal.jsx` / `TabCocina` /
`TabEntregas`) se:

1. Almeno una riga P0 in tabella §4 è in stato FAIL non risolto.
2. Esiste in DB un ordine recente con `durata_andata_min=30 AND geo_source IS NULL`
   creato post-patch.
3. La sequenza E2E §5 fallisce su un P0.
4. Test unitari rilevanti red:
   - `stripHouseNumber.test.js`
   - `isAcceptableLocationType.test.js`
   - `orderModBadge.test.js`
   - `orderModifyError.test.js`
5. Build CRA `npm --prefix ladieci-app33 run build` non verde.

Backup remoto `backup/live-delivery-eta-YYYY-MM-DD` obbligatorio prima di
ogni push su `main` del backend.

---

## 7. TODO

### Backend (P1)
- **Cache completion lazy**: in `loadFromCache`, se hit con lat/lon ma `durata_andata_min IS NULL`, calcolare haversine e restituirla come `durataAndataMin` invece di null (oggi è già accettata, ma il consumer la ricalcola — accentrare).
- **Batch refresh Google Distance Matrix** per righe geo_cache stale (>30gg) o con durata null.
- **Canonicalizzazione spazio civico** in `direccionToCacheKey` (helpers.js): `replace(/([a-zñáéíóú])\s*(\d)/g, "$1 $2")` per uniformare `Calle Lucena12` ↔ `Calle Lucena 12`. Richiede cleanup cache (`UPDATE geo_cache SET direccion_key=...`).
- **Endpoint `/version`** che ritorna commit SHA e timestamp build. Necessario per verificare che Railway abbia davvero deployato l'ultimo push (oggi `/health` ritorna solo `{ok:true}`).
- **Watchdog deploy**: log riga `[boot] commit=<SHA>` allo startup Railway così è grep-abile sui logs.

### Frontend (P1)
- **Badge "ETA da verificare"** in `NuevoPedidoModal` quando `zonaInfo.durataAndataMin == null` ma `zonaInfo.zona` presente. Oggi mostra "—", aggiungere icona warning + tooltip "Controlla in Maps".
- **Modal conferma "salvataggio durata sintetica"**: se l'operatore ha forzato zona manuale e non c'è durata reale, mostrare modal "Senza ETA verificata — conferma?" prima di submit.
- **Cleanup naming**: `tempoGiro` (zona statica) vs `durataAndataMin` (resolver) vs `tgFinale` vs `tgPerHora` vs `tgNew` vs `tgReal` — uniformare a 1 nome (`etaAndataMin`?). Refactor non chirurgico → da pianificare separatamente.
- **Indicatore source visibile**: oggi `metodo` (polygon/cache/keyword/manual_required) è interno. Mostrare badge piccolo con source effettivo (`cache-street`, `google`, `nominatim`, ...) per debug operatore.

### Ops / health
- **Cleanup cache stale**: righe con `durata_andata_min IS NULL` AND `n_ordini_consegnati = 0` AND `updated_at < now() - 30d` → eligible refresh/delete. Task SQL separato, NON ora.
- **Watchdog endpoint `/version`** consumato da `ServicioPage.jsx` per mostrare SHA backend live.
- **Smoke test post-deploy automatico**: script che chiama `resolveAddress` su 5 indirizzi P0 e verifica zona+durata atteso.

---

## Cambi recenti tracciati

| Data | Commit | Scope | Descrizione |
|------|--------|-------|-------------|
| 16/05 | `(geoResolver.js:154)` | ETA-03 | `partial_match` scartato. |
| 22/05 | `15729fc` | ETA-02 | Google retry stripped accetta GEOMETRIC_CENTER. |
| 22/05 | `2c3946a` | ETA-02 prep | Retry geocode senza civico. |
| 22/05 | `2cd3685` | ETA-04 (frontend) | No più `durata=30` salvata quando manca snapshot reale + coords. |
| 22/05 | `f60e1bb` | ETA-05 | Street fallback accetta lat/lon anche con durata null. |

STOP DOC.
