# La Dieci Bot V2 — Service Postmortem 22/05/2026

Report del servizio live del 22/05/2026.
Compilato a caldo per decidere le prossime patch con metodo (vedi
`LaDieciBotV2_RELEASE_PROTOCOL.md` §4 "Regole servizio live" §9 "Anti-pattern").

---

## 1. Snapshot versioni live (fine giornata 22/05)

### Frontend Netlify
- Sito: `magnificent-lollipop-6dff70.netlify.app` (Site ID `02bd4c7a-a50b-4964-90da-8c1af1122932`)
- Ultimo deploy autorizzato della giornata: deploy ID `6a10acc6d6fb2092251eb845` (DELIVERY-ETA-04).
- Bundle main hash: `main.a8696697.js`.
- Sorgente: repo `LaDieciBotV2` branch `main` HEAD locale ≥ `2cd3685` (`fix avoid saving fallback delivery eta`).
- Prima della giornata erano già live i fix:
  - `af391d3` (avoid misleading delivery eta fallback)
  - `1951a6d` (show delivery orders in kitchen on entregas tab)
  - `d907c86` `726d7cc` `afed67e` (rinforzo colori UI)
  - `e0e60fb` `4f0e221` (prevent double actions service buttons)

### Backend Railway
- URL: `https://ladiecibot-production.up.railway.app`
- Repo sorgente: `bigkaoss23-debug/ladieci_bot`
- HEAD `main` post-fix di giornata: **`f60e1bb`** (`fix allow street cache fallback with coordinates`, DELIVERY-ETA-05).
- Commit precedenti di giornata in produzione:
  - `2c3946a` (retry geocode senza civico — ETA-02 prep)
  - `15729fc` (accept street-level google geocode fallback — ETA-02/03)
- `/health` osservato `{ok:true}` durante l'intera giornata; **`/version` non esiste ancora** → SHA live non verificabile lato client.

### DB / migration / env
- **Nessuna migration** applicata il 22/05.
- **Nessuna scrittura** manuale a `ordenes`, `geo_cache`, `clientes`, `storico`.
- **Nessun env** modificato (Railway `DASHBOARD_API_KEY`, `SUPABASE_KEY`, `GOOGLE_MAPS_API_KEY`, `ANTHROPIC_KEY`, ecc. invariati).
- SELECT live read-only fatti su `geo_cache`, `ordenes`, `config` (chiavi non sensibili) durante audit DELIVERY-ETA-LIVE-DATA-01.

---

## 2. Timeline sintetica (22/05)

| Ora (approx) | Evento |
|--------------|--------|
| Pre-servizio | Live già con fix mattutini (af391d3, 1951a6d, colori, double-actions). |
| Servizio attivo | Operatore segnala TabEntregas non mostra delivery prima di LISTO (sospetto regressione `2be997b`). |
| Servizio attivo | Operatore segnala "ETA 30 min" su ordini delivery non realistica → audit DB live. |
| Servizio attivo | Audit `geo_cache`: 3 righe Lucena (`calle lucena`, `calle lucena12`, `calle lucena20`) con lat/lon ma `durata_andata_min=null`. Ordini DOMICILIO di oggi: `#003` El Greco corretto (google, 4 min), `#001` Lucena pre-patch (durata=30, geo_source=null, lat/lon=null). |
| Servizio attivo | Patch DELIVERY-ETA-04 (frontend) → commit `2cd3685` + deploy Netlify (deploy ID `6a10acc6…`). Verificato: build OK, smoke browser preview, watchdog 🟢. |
| Servizio attivo | Test live operatore: "Calle Lucena" → trova Q5; "Calle Lucena 12" → "No detectada". Avviata diagnosi ETA-05. |
| Servizio attivo | Diagnosi ETA-05 conclusa: street fallback escludeva righe con `durata_andata_min IS NULL`. |
| Servizio attivo | Patch backend ETA-05 → commit `f60e1bb` + backup `backup/live-delivery-eta-05-2026-05-22` + push main `ladieci_bot` → Railway redeploy auto. |
| Post-servizio | Creazione matrici docs:`DELIVERY_ETA_STRESS_MATRIX`, `DELIVERY_VIS_STRESS_MATRIX`, `OPS_HEALTH_STRESS_MATRIX`, `RELEASE_PROTOCOL`, ciascuna con backup branch dedicato. |
| Post-servizio | Nessun ulteriore deploy. Sistema lasciato in stato verificato. |

---

## 3. Problemi reali emersi

### 3.1 Colori Pizzeria / pannello fasi
Sintomo: colori percepiti pallidi / componenti sbagliati. Fix applicati pre-22/05 (`d907c86`, `726d7cc`, `afed67e`) ma non c'è stato un round formale di verifica "operatore guarda davvero questa vista?". **Dubbio aperto** se il file rinforzato è effettivamente quello che l'operatore vede nelle ore di punta.

### 3.2 TabEntregas non mostrava delivery EN_COCINA
Sintomo: prima del fix `1951a6d`, gli ordini delivery sparivano dalla tab Entregas fino allo stato LISTO. Origine: commit `2be997b` (non oggi) che ha introdotto filtri `isWaitingDriverState` / `isDriverOnTheWayState`. Fix `1951a6d` ha riportato visibilità ma resta dubbio su "vede troppo presto" vs "non vede affatto". Vedi `LaDieciBotV2_DELIVERY_VIS_STRESS_MATRIX.md`.

### 3.3 ETA Lucena / Lursena con civico falliva
Sintomo: "Calle Lucena 12" → "No detectada". Cause concorrenti:
- chiave cache `calle lucena12` (senza spazio) ≠ `calle lucena 12` (con spazio) → cache exact miss
- street fallback filtro `durata_andata_min NOT NULL` escludeva righe Lucena utili
- downstream Google retry/Nominatim/Photon non garantiti per varianti con civico
Fix ETA-05 (`f60e1bb`) ha rimosso il filtro durata dal street fallback. Canonicalizzazione spazio resta TODO.

### 3.4 Fallback 30 falso
Sintomo: ordine `#001` Lucena con `durata_andata_min=30`, `geo_source=null`, `zona_lat=null`. Causa: frontend cadeva su `zona.tempoGiro=30` quando resolver non aveva durata/coords, e quel valore finiva in DB come reale. Fix ETA-04 (`2cd3685`): salvare `null` invece di 30 quando mancano snapshot e coords.

### 3.5 geo_cache con lat/lon ma durata null
3 righe Lucena (photon/nominatim) + `avenida las marinas 100` (google) hanno lat/lon validi ma `durata_andata_min=null`. Provider non-Google non popolano durata; Google a volte non risponde. Conseguenza: street fallback (pre-ETA-05) le scartava, e consumer doveva cadere su haversine.

### 3.6 Mancanza endpoint `/version`
Post-deploy backend non c'è modo dal frontend di verificare quale commit gira davvero su Railway. `/health` ritorna solo `{ok:true}`. Senza `/version` la diagnosi "il deploy è davvero live?" è cieca → ETA-05 diagnosi ha dovuto assumere il deploy come dato.

### 3.7 Bisogno stress matrix prima del deploy
Diverse patch in giornata (ETA-02/03/04/05) → metodo "fixiamo come arriva il bug" funziona, ma genera rumore live. Da qui la decisione di formalizzare matrici e protocol prima di nuove patch.

---

## 4. Fix applicati durante servizio

### Frontend (LaDieciBotV2)

| Commit | Categoria | Cosa cambia | Rischio residuo | Verificato |
|--------|-----------|-------------|------------------|-------------|
| `2cd3685` | T3+T8 (DELIVERY-ETA-04) | In `NuevoPedidoModal`, se mancano snapshot ETA reale *e* coords → `durata_andata_min = null` invece di 30. Solo riga `158-161` + 4 righe nuove. | Altri 3 punti in stesso file (`tgPerHora`, `tgNew`, `tgReal`) usano ancora `risolviTempoAndata` con fallback, ma sono visualizzazione/simulazione, non scritture DB. Riga 500 era già safe. | ✅ build CRA verde, deploy Netlify (deploy ID `6a10acc6…`), smoke preview |

Documenti committati (T1):

| Commit | Doc |
|--------|-----|
| `c5365ab` | DELIVERY ETA stress matrix |
| `c654a20` | DELIVERY visibility stress matrix |
| `65da276` | OPS health stress matrix |
| `d80fd78` | Release protocol |

### Backend (ladieci-bot)

| Commit | Categoria | Cosa cambia | Rischio residuo | Verificato |
|--------|-----------|-------------|------------------|-------------|
| `2c3946a` | T8 prep ETA-02 | Helper `stripHouseNumber` + test. | — | ✅ test verdi pre-push |
| `15729fc` | T8 (DELIVERY-ETA-02/03) | Retry Google senza civico con `allowApproximate=true` (accetta GEOMETRIC_CENTER) quando il primo tentativo fallisce. `partial_match` già scartato in `geoResolver.js:218`. | Senza `/version` non confermabile che Railway sia davvero su questo SHA — assumed. | ✅ `node --check`, test unit verdi |
| `f60e1bb` | T8 (DELIVERY-ETA-05) | In `loadFromCache` street-fallback: rimosso filtro `durata_andata_min=not.is.null`. Accetta righe con solo lat/lon validi. 1 riga modificata. | Cache key normalization (spazio prima del civico) resta P2 aperto. | ✅ syntax + test unit verdi + backup `backup/live-delivery-eta-05-2026-05-22` |

### Stati ordine / UI colori / double-actions
Già committati prima del 22/05 (`d907c86`, `726d7cc`, `afed67e` colori; `e0e60fb`, `4f0e221` double-actions). Inclusi qui perché live durante il servizio. Verifica visiva diretta operatore non formalizzata (vedi 3.1).

---

## 5. Cosa ha funzionato

1. **Backup branches sistematici** — ogni push su `main` accompagnato da `backup/live-…` o `backup/v2-…`. Nessun rollback necessario, ma se servisse il costo è < 5 min.
2. **Gate test/build prima del push** — sia frontend che backend hanno superato unit test + build/syntax check prima di andare live. Nessuna sorpresa post-deploy.
3. **Fix Lucena post ETA-05** — diagnosi (audit DB read-only + lettura `geoResolver.js`) ha identificato causa esatta prima di patchare. Patch chirurgica di 1 riga. È il modello da replicare.
4. **Nuovo metodo docs/matrix** — 4 documenti formalizzano la conoscenza:
   - DELIVERY_ETA_STRESS_MATRIX
   - DELIVERY_VIS_STRESS_MATRIX
   - OPS_HEALTH_STRESS_MATRIX
   - RELEASE_PROTOCOL
   Ognuno con backup remoto V2. Niente è solo "nella testa di Claude".

---

## 6. Cosa non ha funzionato

1. **Deploy colori su componente sbagliato (sospetto)** — i fix `d907c86`/`726d7cc`/`afed67e` hanno rinforzato colori, ma manca conferma operatore "questo è effettivamente ciò che vedo durante il rush". Possibile mismatch tra componente target e componente live.
2. **Mancanza test indirizzi pre-servizio** — la fragilità `Calle Lucena 12` non era nota prima del live. La matrice ETA esiste ora ma non è ancora stata *eseguita* su 10 indirizzi reali.
3. **`/version` backend assente** — diagnosi ETA-05 ha dovuto assumere che Railway servisse `15729fc`. Senza endpoint di verifica, una patch "rotta in deploy" sarebbe stata invisibile alla diagnosi.
4. **Troppe patch in live** — ETA-02, ETA-03, ETA-04, ETA-05 nella stessa giornata. Anche se ognuna chirurgica, il volume aumenta superficie di errore e affatica l'operatore (più F5).
5. **Diagnosi iniziale incompleta** — quando è emerso "ETA 30 finto" si è patchato subito il salvataggio (ETA-04), ma la causa root (cache durata null + street fallback bloccato) è venuta fuori solo nel giro successivo (ETA-05). Saltare la diagnosi completa fa fare 2 deploy invece di 1.
6. **Verifica visiva operatore non sistematizzata** — niente checklist "operatore guarda X, vede Y, conferma Z" per i cambi UI (colori, Entregas).

---

## 7. Decisioni operative future

1. **Niente deploy live senza matrice rilevante in stato P0 verde.**
   Cambia delivery? `DELIVERY_ETA_STRESS_MATRIX` P0 deve essere verde.
   Cambia visibilità Entregas? `DELIVERY_VIS_STRESS_MATRIX` P0.
   Cambia watchdog/health? `OPS_HEALTH_STRESS_MATRIX` P0.
2. **Patch live solo emergenza bloccante** (vedi RELEASE_PROTOCOL §4): bug attivo che produce ordini errati / risposte rotte / cassa che salta / watchdog rosso. Tutto il resto aspetta fuori servizio.
3. **Fallback mai salvato come reale.** Regola architetturale. UI mostra "—" o warning, DB scrive `null`. Vale per durata, ma anche per coords / source.
4. **Se durata non è verificata → warning UI.**
   Frontend: badge "ETA da verificare in Maps" + tooltip. Operatore decide informato.
5. **SELECT live read-only e mirato.**
   Quando serve audit DB durante servizio: solo SELECT su tabelle dichiarate, filtri specifici (data, id), niente dump enormi, niente chiavi sensibili (`TOKEN`, `KEY`, `SECRET`, `API`, `WA`, `ANTHROPIC`, `SUPABASE`, `DASHBOARD`).

---

## 8. Backlog priorizzato

### P0 — prima del prossimo servizio
1. **Eseguire DELIVERY_ETA_STRESS_MATRIX su 10 indirizzi reali** (rows 1, 2, 5, 7, 8, 10, 14, 18, 25, 27 della tabella). Read-only / locale dove possibile. Output: PASS/FAIL per riga + log discrepanze.
2. **Verificare geo_cache Lucena/Marinas post ETA-05** — confermare che "Calle Lucena 12" ora trova zona via street-fallback. Audit con SELECT mirata: nuova riga con `source=cache-street` non viene scritta (è puramente derivata).
3. **Implementare Delivery Visibility EN_COCINA in Entregas** (Opzione B frontend-only): mostrare card in 🔥 En cocina con bottoni driver disabilitati. No backend change. Eseguire `DELIVERY_VIS_STRESS_MATRIX` E2E prima del deploy.
4. **Endpoint `/version` backend** — espone SHA commit + timestamp build. Permette al frontend di mostrare versione live (debug operatore + diagnosi futura).
5. **Smoke test click multipli pre-servizio** — verifica che `e0e60fb`/`4f0e221` reggono effettivamente double-click rapidi (NUEVO→POR_CONFIRMAR→EN_COCINA→LISTO→EN_ENTREGA→RETIRADO).

### P1
- **OPS Health audit** del codice esistente (`App.jsx` `wsConnected`, `ServicioPage.jsx` watchdog) vs `OPS_HEALTH_STRESS_MATRIX`. Identificare gap.
- **Warning ETA UI più chiaro** — badge + tooltip "ETA da verificare" quando `durataAndataMin=null` ma zona presente.
- **Cache haversine completion** — in `loadFromCache`, se hit con lat/lon ma durata null, calcolare e restituire haversine come `durataAndataMin` invece di delegare al consumer.

### P2
- **Cleanup naming** `tempoGiro` / `durataAndataMin` / `tgFinale` / `tgPerHora` / `tgNew` / `tgReal` → un solo nome (`etaAndataMin`). Refactor fuori-hotfix.
- **Canonicalizzazione `Calle Lucena12` ↔ `Calle Lucena 12`** in `direccionToCacheKey`. Richiede piano di cache cleanup.
- **LISTO audit + migration** sui legacy `COMPLETATO` italiano in `ordenes`/`storico` (vedi CLAUDE.md "verificare se ancora usato").
- **Bot IA fail-closed** — se Claude restituisce null > N volte di fila, il bot risponde con messaggio standard "stiamo verificando, scrivici fra poco" invece di silenzio.

---

## 9. Domande aperte

1. **Il colore Pizzeria è davvero risolto?**
   I fix `d907c86`/`726d7cc`/`afed67e` hanno toccato i componenti giusti? Serve conferma operatore davanti al display attivo durante il rush.
2. **Quanti ordini hanno ancora `durata_andata_min=30` da prima del fix ETA-04?**
   Da audit serata 22/05: almeno `#001` (Lucena). Conta esatta da ricavare con SELECT sull'archivio post-chiusura.
3. **Serve pulizia `geo_cache`?**
   Righe `calle lucena`, `calle lucena12`, `calle lucena20`, `avenida las marinas 100` con `durata_andata_min=null`: candidate a refresh Google Distance Matrix una volta sola, o eliminate per essere ri-popolate al primo hit.
4. **Quale vista usa davvero l'operatore per i delivery?**
   TabEntregas? PanelCocina? RepartidorPage? Senza conferma diretta, i fix UI sono tiri al buio. Va chiesto esplicitamente.
5. **PWA / cache operatori aggiornata?**
   Operatori con tab aperte da giorni potrebbero girare su bundle pre-ETA-04. Niente service worker hard-refresh oggi → un Ctrl+R esplicito può essere necessario al cambio turno.

---

## 10. Prossimo step consigliato

**DELIVERY_ETA_MATRIX_RUN_01** — eseguire test su 10 indirizzi reali dalla tabella `DELIVERY_ETA_STRESS_MATRIX.md` §4, in modalità read-only (DB SELECT) + simulazione locale (cache key normalize, lookup geo_cache, predicato resolver) prima di chiamare API live.

Indirizzi proposti (P0/P1 mix):
1. `Calle Lucena`
2. `Calle Lucena 12`
3. `Calle Lucena 12, 04740 Roquetas de Mar, Almería, España`
4. `Calle Lucena12`
5. `Avenida Las Marinas 50`
6. `Avenida Las Marinas 70`
7. `Avenida Las Marinas 100`
8. `Calle El Greco 5`
9. `Av. Las Marinas 50` (variante abbreviazione)
10. `Calle Lúcena 12` (variante accentata)

Output atteso: tabella con `input → cache_key normalizzata → riga cache trovata (sì/no/quale) → ramo cascata atteso → PASS/FAIL`. Nessun deploy in questa fase, nessuna chiamata API live, niente DB write.

---

## Allegati / riferimenti

- `LaDieciBotV2_DELIVERY_ETA_STRESS_MATRIX.md`
- `LaDieciBotV2_DELIVERY_VIS_STRESS_MATRIX.md`
- `LaDieciBotV2_OPS_HEALTH_STRESS_MATRIX.md`
- `LaDieciBotV2_RELEASE_PROTOCOL.md`
- Backup branches creati il 22/05:
  - `backup/live-delivery-eta-05-2026-05-22` (repo ladieci_bot)
  - `backup/v2-delivery-eta-stress-matrix-2026-05-22`
  - `backup/v2-delivery-vis-stress-matrix-2026-05-22`
  - `backup/v2-ops-health-stress-matrix-2026-05-22`
  - `backup/v2-release-protocol-2026-05-22`

STOP DOC.
