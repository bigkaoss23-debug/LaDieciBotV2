# La Dieci Bot V2 — Delivery Stress Test Plan

Obiettivo: validare il pipeline delivery/geocoding manuale e i fallback prima di aumentare l'automazione WhatsApp Delivery.

## Architettura operativa attuale

- L'indirizzo puo' essere inserito manualmente dall'operatore.
- I clienti frequenti/preferiti possono essere salvati e poi selezionati/autocompilati.
- I clienti occasionali one-time non devono riempire la lista preferiti.
- Se cliente/indirizzo esiste in Supabase, usare il dato salvato prima di chiamare provider esterni.
- Se non esiste, usare Google Maps/geocoding.
- Google serve per geocoding, distanza e tempo; non deve per forza essere autocomplete UI.
- I dati risolti vanno salvati in Supabase per ridurre uso futuro delle API Google.

## Fallback chain da verificare

Catena attesa o da confermare nel codice:

1. Google
2. Nominatim
3. Photon/Proton
4. Zone fallback/paracadute

Se tutti i provider esterni falliscono, usare fallback zona/manuale.

## Fallback manuale zona validato

Commit validato:

- `6b8e01c fix allow manual delivery zone fallback`

Scenario testato:

- Indirizzo unknown/non geocodabile:
  - `Calle Inventada Codex 999 Roquetas de Mar`

Risultato: `VALIDATED`

- Se `resolveAddress` fallisce o ritorna senza zona, `NuevoPedidoModal` mantiene stato `manual_required`.
- UI mostra alert zona non detectada.
- Pulsante mappa `Ver ruta` resta disponibile.
- Bottoni manuali `Q1`-`Q5` visibili.
- Selezione manuale `Q2 BUENAVISTA` validata.
- `Confirmar pedido` si abilita dopo la selezione manuale.
- Payload salvato con:
  - `zona: Q2`
  - `zona_manuale: true`
  - `zona_lat: null`
  - `zona_lon: null`
  - `durata_andata_min: 20`
  - `durata_google_min: null`
  - `durata_haversine_min: null`
  - `geo_source: null`
  - `delivery_fee: 2.5`
- Indirizzo e `direccion_note` preservati.
- Flusso operativo verificato:
  - ordine creato da UI
  - visibile in `Cocina`
  - dopo `LISTO`, visibile in `Entregas`
  - visibile in `Repartidor`

Nota: nel fallback manuale `lat/lon` possono restare `null`; la zona manuale e il tempo giro sono il paracadute operativo.

## Zone delivery

- Le zone sono 5.
- Sono disegnate manualmente per il paese e la posizione della pizzeria vicino al mare.
- Target tempo consegna: circa 15 minuti.
- Massimo operativo circa 18 minuti.
- Delivery fee attuale: 2.50 EUR fissi per tutte le zone.
- L'app aggiunge automaticamente 2.50 EUR quando viene selezionato delivery.

## Dati Supabase da verificare

Verificare, senza stampare segreti:

- cliente salvato
- telefono
- indirizzo normalizzato
- note indirizzo / interno / scala / piano separati
- lat/lng
- distanza
- durata Google
- durata Nominatim/fallback se presente
- zona
- tempo zona
- confidence
- geo cache / normalized address fields

## Matrix zone Q1-Q5

Per ogni zona:

- indirizzo pulito completo
- indirizzo con abbreviazione (`C/`, `Avda`, accenti mancanti)
- indirizzo con piano/interno
- indirizzo con numero civico ambiguo
- indirizzo noto da cliente salvato
- indirizzo nuovo
- indirizzo al bordo zona
- indirizzo fuori zona
- indirizzo non trovato

Expected:

- zona coerente
- durata coerente
- fee 2.50
- Supabase aggiornata/cachata
- UI mostra alert chiaro se fallback/manuale

## Dirty input matrix

Testare:

- `C Delfin 45`
- `C. Delfín 45 3A`
- `calle delfin 45-47`
- indirizzo senza accento
- indirizzo con virgola/localita/CAP
- indirizzo solo edificio
- indirizzo senza numero
- indirizzo con note tipo `portal 2`, `piso 4`, `bajo`
- indirizzo scritto male ma riconoscibile
- indirizzo completamente ambiguo

## Failure/fallback cases

Simulare o osservare:

- Google KO
- Google ritorna risultato distante/sbagliato
- Nominatim KO
- Photon/Proton KO
- tutti KO -> fallback zona
- provider lento
- cache esistente ma confidence bassa
- cliente salvato con indirizzo vecchio
- cliente salvato con indirizzo corretto e provider diverso

## Rider/payment cases

Vista reparto tipo Uber Eats deve mostrare:

- cliente
- telefono
- indirizzo
- pizze
- drinks
- prezzo
- zona
- orario
- ordine per zona/orario

Pagamento:

- tarjeta
- efectivo
- Bizum

Dopo pagamento/consegna:

- ordine chiuso/archiviato
- non influenza piu' Reparto
- non influenza Horno

## Mini-service stress

E' gia' stato testato un mini-servizio di circa 10 delivery e ha funzionato. Serve stress piu' strutturato:

- 10 delivery Q1-Q5 distribuiti
- 3 indirizzi sporchi
- 2 clienti salvati
- 2 nuovi clienti
- 1 fuori zona
- 1 fallback manuale
- 1 pagamento cash
- 1 tarjeta
- 1 Bizum
- 1 rollback o modifica orario

## Output atteso

Per ogni test salvare:

- input operatore
- provider usato
- zona
- durata
- confidence
- delivery fee
- UI alert/suggerimento
- stato Supabase
- eventuale fallback
- note su errore o correzione

## Priorità risoluzione zona — verificato 2026-05-21 (DS-1)

Audit harness offline read-only su `risolviIndirizzo()` ([ladieci-bot/src/utils/geoResolver.js](ladieci-bot/src/utils/geoResolver.js)). Nessuna chiamata DB o rete reale: `sbSelect` e `fetch` mockati. Output testuale dell'harness validato su 5 scenari.

### Ordine reale di precedenza osservato

1. **`loadFromCache` chiave esatta** — vince sempre se `lat/lon/zona/durata_andata_min` presenti.
2. **`loadFromCache` street fallback** — quando la chiave esatta è miss ma esiste un'altra riga con `direccion_key ILIKE '<via>%'` con lat/lon/durata completi. Selezione: `n_ordini_consegnati DESC, hit_count DESC, updated_at DESC`.
3. **`loadFromCliente`** — vince solo se cache miss totale **E** cliente ha `direccion_confermata_il + zona + zona_lat + zona_lon + durata_andata_min` **E** `direccionToCacheKey(cli.direccion) === direccionToCacheKey(direccion)`.
4. **Google** (se `GEO_PROVIDER` ∈ `google|shadow` e `KEY` presente).
5. **Nominatim**.
6. **Photon**.
7. **Keyword zona** (`assegnaZonaDaKeyword`, no lat/lon, no cache).
8. **`null` / fallback manuale UI** (alert + Q1-Q5 manuali).

Conclusione sintetica: **cache esatta > cache-street > cliente > provider esterni > keyword > null**.

### Concetto "cache blindata"

- Riga in `geo_cache` con `n_ordini_consegnati >= 1` è considerata "blindata": autorità assoluta sopra anche Google.
- `n_ordini_consegnati` viene incrementato in `chiudiServizio` (servizio.js) sugli ordini archiviati.
- `forceRefresh=true` su cache blindata: viene loggato come warn ma esegue comunque (escape hatch operatore).

### Cache-street fallback — NON precedentemente documentato in questo plan

- File: [geoResolver.js:88-115](ladieci-bot/src/utils/geoResolver.js).
- Quando la chiave esatta è miss, il sistema estrae il prefisso "tipo + nome via" (rimuove il numero civico finale via regex `\s+\d.*$`) e cerca con `ILIKE '<prefisso>%'` altre righe della stessa via con dato Google completo.
- Razionale documentato nel codice: "dentro la stessa via, i tempi macchina dalla pizzeria variano di 1-2 min — più affidabile dell'haversine × 1.70 (vedi Bug A, ordine #001 Avenida Playa Serena: 23 min haversine vs ~10 min reali)".
- Mancano guard rail su:
  - distanza massima tra civici nella stessa via;
  - lunghezza della via (vie lunghe come Avenida del Mar / Avenida Reino de España possono avere civici in zone diverse).
- Output `source: "cache-street"` in `buildResult`.

### Scenari osservati DS-1

| # | Scenario | Sorgente osservata | Provider chiamato | Risultato |
|---|----------|--------------------|--------------------|-----------|
| 1 | cache miss + cliente miss + provider KO | `null` (emptyResult) | sì (Nominatim, Photon) | `zona=null` → UI fallback manuale |
| 2 | cache hit esatta + cliente miss | `google` (cached:true) | no | `zona` dalla cache |
| 3 | cache miss + cliente con `direccion_confermata_il` + dati completi | `cliente` (cached:true) | no | `zona` dal cliente |
| 4 | cache blindata Q3 (`n_ord_consegnati=3`) + cliente aggiornato Q5 | `google` (dalla cache) | no | `zona=Q3` — **cliente più recente IGNORATO** |
| 5 | cache miss esatto `Calle Mayor 200` + cache-street fallback su `Calle Mayor 1` | `cache-street` (cached:true) | no | `zona/durata` del civico 1 applicate al civico 200 |

### Decisioni business aperte (NON automatizzare senza approvazione)

1. **TTL / invalidazione cache blindata**: oggi nessuna. Se l'indirizzo è stato "trasferito" tra zone (errore geocode storico o ristrutturazione zone Q1-Q5), la riga non viene mai rivalutata finché qualcuno non fa `forceRefresh` esplicito.
2. **Soglia civico-distanza per cache-street**: oggi match libero su prefisso via. Da decidere se introdurre vincolo (`|civico_richiesto - civico_match| <= N`) o vincolo zona stabile (tutti i match in una via devono avere stessa `zona`).
3. **Re-verifica cliente con `direccion_confermata_il` vecchio**: oggi nessun TTL. Cliente confermato 12 mesi fa è trattato come fresco.

### Pre-flight fuori zona

Aggiunto per chiarezza: prima di chiamare cache/cliente/provider, [geoResolver.js:445-458](ladieci-bot/src/utils/geoResolver.js) blocca esplicitamente località come `aguadulce, almería, vícar, mojonera, el ejido, adra, berja, dalías`. Più affidabile di qualsiasi geocoder che può avere dati misti tra comuni limitrofi.

### Stato test

- Harness offline DS-1: `PASS 5/5` osservati.
- Nessun test in `LaDieciBotV2_TEST_MATRIX.md` formalizza ancora questi scenari come golden.
- Nessuna patch al codice. Comportamento "cache blindata vince" è intenzionale e va decisa business prima di toccare.

### Prossimi micro-step proposti (NON eseguiti)

- **DS-2** (i18n `SnoozeButton.jsx`, 2 `title=` italiani → spagnolo). Indipendente.
- **DS-3** (questo step se non già coperto: aggiunta cache-street nel plan — fatta qui).
- **DS-4** (golden test `direccionToCacheKey` frontend vs backend). Harness offline.
- **DS-5** (scenario "bug #4 cascade" su `simulateDriverSchedule`). Harness offline.
- **DS-6** (surface `hora_finale` slittato al frontend). Tocca 3 file.
- **DS-7** (mini-service 10 delivery formale su V2 test). Solo dopo deploy.

## Harness offline DS-4 — `direccionToCacheKey` parity — 2026-05-21

Harness offline read-only su `direccionToCacheKey` frontend ([api.js:25-54](ladieci-app33/src/api.js)) vs backend ([helpers.js:299-345](ladieci-bot/src/utils/helpers.js)). Nessun DB, nessuna rete, nessun `.env`. Le due funzioni sono estratte testualmente dai source e invocate come funzioni anonime in-process.

### Risultato parità FE↔BE

- **20 input sporchi → 20 match. Drift FE↔BE: zero.**
- Differenza sui source: BE 2683 char vs FE 1735 char, **solo per via dei commenti** più verbosi sul backend. Logica regex identica.

### Collisioni desiderate confermate

Input diversi → stessa key, comportamento atteso (la chiave è progettata per accomunare varianti sporche dello stesso indirizzo):

| Key | Input che vi collassano |
|---|---|
| `calle mayor 1` | `Calle Mayor 1` · `calle mayor, 1` · `C/ Mayor 1` |
| `avenida reino de espana 200` | `Avenida Reino de España 200` · `Av. Reino de España, 200` |
| `calle cervantes 12` | `Calle Cervantes 12` · `C. Cervantes, 12` |
| `calle jose ojeda 8` | `Calle José Ojeda 8` · `Calle Jose Ojeda 8` |
| `calle andalucia 7` | `Calle Andalucía 7` · `Calle Andalucia 7` |

### Rischio drift

- **Oggi**: nessuno. Le due funzioni sono allineate byte-per-byte (modulo commenti).
- **Futuro**: nessun test automatico previene il drift se uno dei due file viene editato senza aggiornare l'altro. Il commento `Mirror di direccionToCacheKey() in helpers.js — DEVE restare allineata` in [api.js:23-24](ladieci-app33/src/api.js) è una guardia documentale, non meccanica.

### Ambiguità funzionale separata (non drift)

`Calle Cuba 5`, `Calle Cuba nº5`, `Calle Cuba numero 5` producono **3 key diverse** (`calle cuba 5`, `calle cuba nº5`, `calle cuba numero 5`):

- Entrambi BE e FE si comportano allo stesso modo → **non è drift**.
- È un'ambiguità del normalizer in sé: il pattern `nº` / `numero` davanti al civico non viene rimosso.
- Conseguenza: la `geo_cache` può finire con 3 righe per lo stesso indirizzo fisico, e cliente/operatore che scrivono la stessa via in modo diverso non condividono il cache hit.

### Stato test e prossimi passi DS-4

- Harness offline: PASS 20/20.
- Nessuna patch al codice.
- Proposta micro-step futuro: file `ladieci-bot/tests/cacheKey.parity.test.js` (~60 righe, runner `node` puro, niente Jest) che esegue i 20 input contro entrambi i source come CI guard contro drift futuro. Non eseguito ora.
- Decisione business aperta: normalizzare `nº` / `numero` come prefisso civico (oggi no). Patch non urgente.

## Harness offline DS-5 — `simulateDriverSchedule` bug #4 — 2026-05-21

Harness offline read-only su `simulateDriverSchedule` ([zones.js:277-327](ladieci-bot/src/utils/zones.js)) e `proposeForNewOrder` ([zones.js:374+](ladieci-bot/src/utils/zones.js)). Nessun DB, nessuna rete. Scenario costruito per riprodurre il "Bug #4 cascade" già citato in CLAUDE.md come noto e aperto.

### Risultato real-time

- `simulateDriverSchedule` è **cascade-aware corretto** quando rilanciato: ricalcola tutti i giri da capo basandosi sullo stato corrente del DB, senza side-effect.
- Il caso "Paco" (commit `685749b` Step A backend) è confermato risolto: forno_out per Paco Q2 21:40 durata 11 con giro Q1 21:30 in corso = `21:39`, hora_finale = `21:50`, slittato `true`. Pizza non fredda.

### Bug #4 CONFERMATO sul persistito DB

Scenario riproducibile:

| Step | Ordini in DB | Schedule simulato |
|---|---|---|
| 1 | O1 Q2 21:45 d8 + O2 Q3 22:00 d10 | Giro Q2: parte 21:37, rientro **21:56**. Giro Q3: parte **21:56**, rientro 22:19. `forno_out` O2 corretto = `21:51`. |
| 2 | + aggiunta O3 Q2 21:45 **d14** (aggregato same-zone-slot Q2 21:50) | Giro Q2 ora tg max(8,14)=14, rientro **22:02** (+6 min). Giro Q3 partenza **22:02** (+6 min). `forno_out` O2 corretto post-aggregazione = `22:02` (+11 min vs originale). |
| 3 | O2 nel DB ha però ancora il vecchio `forno_out` salvato al momento della sua creazione | **Mismatch**: pizza O2 esce dal forno al vecchio orario ma il driver è ancora impegnato nel giro Q2 esteso → pizza in attesa sul bancone. |

### Causa del bug

- `risincronizzaGiro` ([agentOrdini.js:44-65](ladieci-bot/src/agents/agentOrdini.js:44)) aggiorna i `forno_out` dei **sibling** dello stesso giro (es. fratelli dell'ordine appena aggregato in Q2 21:50), ma **non** dei giri successivi (Q3 22:00).
- `proposeForNewOrder` ([zones.js:374+](ladieci-bot/src/utils/zones.js)) ritorna `{ok:true, aggregato:true, motivo:"Aggregado al giro Q2 …"}` senza alcun avviso di downstream impact sul giro Q3.
- Il caller non riceve mai segnale "altri ordini sui giri seguenti necessitano di ricomputo forno_out".

### Rischio

- Severity dichiarata `bassa` in CLAUDE.md `bug #4`.
- Riproducibilità: aumenta in modo lineare con la divergenza di `durata_andata` tra gli ordini aggregati nello stesso slot. Nel test: durate 8 vs 14 → delta +6 min driver, +11 min forno_out O2.
- Conseguenza concreta: pizza pronta troppo presto, freddezza progressiva sul bancone, **non è un crash** ma un degrado qualità nei servizi affollati.

### Non patchare ora

- Servirebbe prima un **test golden** che fissi il comportamento atteso post-fix (`risincronizzaGiro` esteso o nuovo `risincronizzaSchedule(zonaPartenza)` con recompute downstream).
- Decisione business aperta: quando ricomputare (sincrono nel POST, asincrono via job, on-demand a `/api/scanServizio`)? Se notificare la cucina del cambio `forno_out` o silenzioso?
- Possibili patch future:
  - **DS-5-A** (estensione): `risincronizzaGiro` ricalcola anche i giri con `partenzaMin >= rientroMin_modificato`.
  - **DS-5-B** (separazione): nuovo `risincronizzaScheduleDownstream(fromZona, fromSlot)` chiamato esplicitamente dopo `creaOrdine`/`modificaOrdine` quando il giro target ha visto cambio di `tg`.
- Nessuna delle due in scope oggi.

### Stato test DS-5

- Harness offline: scenario "bug #4 stress" riprodotto con delta misurabile.
- Caso Paco (scenario base cascade): regressione **non** osservata, confermato che Step A `685749b` ha chiuso il sotto-caso.
- Test commit-abile rinviato finché non c'è decisione business sulla forma del fix.
