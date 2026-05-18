# La Dieci — Operator Dashboard

Sistema di gestione ordini WhatsApp per la pizzeria **La Dieci** (Roquetas de Mar).
L'app viene usata da più operatori contemporaneamente sullo stesso browser — **mai usare localStorage**.

---

## Stato — Maggio 2026

### Completato ✅
- **Descuento per ordine (17/05/2026)**: sconto cliente € fisso o % sul totale finale. UI in due punti: NuevoPedidoModal (creazione manuale, se cliente paga subito) e TabListos al RETIRADO (incasso last-minute prima di selezionare metodo pago). Helper `aplicarDescuento` in `constants.js` (frontend) e `helpers.js` (backend, autoritativo). Componente `<DescuentoInput />` in `src/components/ui/`. Nuove colonne su `ordenes` e `storico`: `descuento_tipo` (`EURO`|`PERCENT`|NULL), `descuento_valor` (numero digitato), `descuento_importe` (€ effettivi scontati). `totale` resta sempre il prezzo finale post-sconto. Backend ricalcola server-side in `creaOrdine`/`modificaOrdine`/`cambiaStato`. Messaggio WhatsApp di conferma include la riga `Descuento: -X€` quando applicato. Badge `-2€ desc` su `OrdenCard`. Spec: `feature_descuento_2026-05-17.md`.
- **Delivery Snooze per-card (17/05/2026)**: bottone `+5` cumulativo (cap 20 min) su card DOMICILIO in `TabCocina`. Sposta countdown e ordinamento visivi senza toccare `hora`/`forno_out`. Campo `ui_offset_min` su `ordenes` (default 0), reset naturale a chiusura serata (escluso da `buildStoricoPayload`). Risolve "driver in giro + pickup urgenti": il pizzaiolo snooza i delivery così i pickup salgono in priorità visiva. Backend endpoint `setUiOffset` con validazione [0,20]. Helper `applyUiOffset` in `src/utils/uiOffset.js`, componente `SnoozeButton` in `src/components/ui/`, integrato in 5 punti display: TabCocina, PanelCocina, TabEntregas, RepartidorPage, NuevoPedidoModal (conta-pizze slot). Spec: `feature_delivery_snooze_2026-05-17.md`.
- Backend GAS tradotto integralmente in Node.js (`/Users/bigart/Downloads/ladieci-bot`)
- Deploy su Railway: **`ladiecibot-production.up.railway.app`** — Online ✅
- Webhook WhatsApp aggiornato da GAS a Railway
- **`src/api.js` migrato** — punta a Railway, non più a GAS
- CORS abilitato su Railway (include header `X-Api-Key`)
- **API Key auth** su Railway (`X-Api-Key: ld_92ed94d5ef63ab0327f7c61467898cf3`) — env var `DASHBOARD_API_KEY` impostata su Railway
- **Supabase RLS** su tabella `config` — anon key non può leggere chiavi sensibili
- Endpoint `rispondiWA`, `getConvThread` aggiunti a Railway
- **Regola anti-invenzione** nel prompt di `interpreta()`
- Bug fix: `EconomiaPage` crashava per `giorniDettaglio` mancante
- Bug fix: `generaRispostaIA` bloccato su "Generando..." per sempre
- Bug fix: header `X-Api-Key` mancante su `generaRispostaIA` e `getConvThread` in `TabPreguntas.jsx`
- Bug fix: label bottone verde Preguntas (`Añadir al pedido · Avisar cliente` vs `Enviar al cliente`)
- Watchdog ServicioPage pinga `/health` Railway — 3 stati salute (ok/warning/error)
- **`ABBINAMENTI_NOMI`** aggiunto a `config.js` come costante condivisa (agentWhatsapp + agenteMiglioramento)
- **agenteMiglioramento**: sezione `CAPACIDADES YA GESTIONADAS` nel prompt — evita suggerimenti già implementati
- **Bug fix orchestratore**: messaggio duplicato in Flusso 2B → stato `IN_TRATTAMENTO` invece di doppia aggiunta
- **Bug fix `api.js`**: 5 `await` mancanti su `sb.update()` in `updateEstado` e `createOrden`
- **Bug fix `App.jsx`**: WebSocket + polling entrambi attivi (`wsConnected` flag) — polling solo se WS è down
- **Bug fix `App.jsx`**: memory leak `notificatiIds` Set — trim a 250 quando supera 500
- **`WADettaglio.jsx`**: chiamate `generaRispostaIA` migrate da GAS a Railway (+ header `X-Api-Key`)
- **Railway `index.js`**: 6 endpoint POST mancanti aggiunti: `updateWaStato`, `updateOrden`, `updateEstado`, `createOrden`, `updateNotaCucina`, `eliminaConversazione`
- **Bug fix `ServicioPage.jsx`**: `onConfirmaDaConfermare` — `blockedTels` settato prima degli `await` (race condition WebSocket); stato IN_TRATTAMENTO → NUEVO (non COMPLETATO) per far riapparire l'ordine in Pedidos
- **Deploy Netlify** — frontend aggiornato in produzione
- **Bug fix cron chiusura serata** (10/05/2026): il `setTimeout` in-process moriva ai riavvii Railway, lasciando ordini non archiviati. Aggiunto `chiudiServizioGuarded` idempotente (LAST_CLOSE_DATE in config), `catchUpChiusura()` all'avvio del server (finestra 22-06 Madrid), endpoint `triggerCloseIfNeeded` per cron esterno. Fallback `on_conflict=orden_id` sull'upsert storico
- **DB**: dropata la unique constraint sbagliata `storico_orden_id_unique` — ora `(orden_id, fecha)` permette uno stesso #id su giorni diversi
- **Eliminato `saveStorico`** dal frontend — l'archivio era prematuro (al RETIRADO) e duplicava le righe della chiusura serata, con format `fecha` italiano vs ISO. Ora la sola sorgente di scrittura su `storico` è il backend Railway
- **TabListos + ServicioPage** (13/05/2026): filtro `LISTO` ora include anche `EN_ENTREGA` — l'ordine resta visibile come "🛵 En camino" invece di sparire quando il driver schiaccia Salgo
- **RepartidorPage** (13/05/2026): zone ordinate per urgenza (hora minima degli ordini dentro la zona), non più per ordine fisso `ZONE_DELIVERY`
- **NuevoPedidoModal** (13/05/2026): refactor status block delivery — un solo verdetto OK/BLOCKED/WARN che ragiona su forno + driver attivo + conflitti futuri DB. Eliminati i 2 box contraddittori
- **Supabase service_role su Railway** (13/05/2026): `SUPABASE_KEY` su Railway aggiornato alla `sb_secret_*` (era anon publishable). Adesso il backend bypassa RLS e popola `delivery_logs`, scrive `geo_cache`, legge tutte le config sensibili
- **RLS lock storico + archivio_conv** (13/05/2026): anon poteva scrivere/cancellare l'archivio finanziario — chiuso con policy `FOR SELECT TO public USING (true)` (solo lettura)
- **RLS policy geo_cache** (13/05/2026): policy `FOR ALL TO public` aggiunta — il frontend ora può popolare la cache di velocizzazione zona
- **Config writes frontend → Railway proxy** (13/05/2026): 4 chiamate dirette `sb.upsert("config",...)` in `ServicioPage.jsx` (RLS le bloccava silenziosamente) migrate a `api.post setConfig`. Adesso il toggle Bot ON/OFF e `toggleAiForza` funzionano davvero
- **Watchdog Railway cleanup** (13/05/2026): tolte chiamate fantoccio (`setConfig` + `rispondiWA` via Railway quando Railway è down — non potevano funzionare). Aggiunti suono allarme + browser Notification con `requireInteraction:true`
- **Silent catch loggati** (13/05/2026): pattern `.catch(()=>{})` nei path critici (config init, TabPreguntas confirm buttons, updateWaStato) ora hanno `console.warn` — basta bug invisibili per mesi
- **Fix `TabPreguntas.jsx:409`** (16/05/2026): `risposteCache` letto con `msg.id` (UUID) invece di `sel` (tel) — la risposta IA veniva generata correttamente ma mai mostrata. Refactor anti-cerotto: una sola chiave (`sel`) per tutta la cache
- **DB migration `forno_out`** (16/05/2026): aggiunta colonna `forno_out text` a `ordenes` con backfill geometrico (`hora - durata_andata_min`). Pronta ma **non ancora consumata** dal codice — vedi sezione bug aperti sotto

### 🐛 Bug aperti emersi durante test E2E (16/05/2026)

Sessione di test con 5+ ordini fake via webhook. Sistema funziona ma 4 bug architetturali emersi:

**1. `forno_out` calcolato in 9 punti separati invece di 1 sorgente DB** — ✅ **Step A FATTO 16/05/2026 (backend)**
   - Pattern del bug: `forno_out = hora - durata_andata_min` calcolato in 9 punti frontend ignorando lo stato del driver
   - Risultato: pizza poteva uscire dal forno PRIMA che il driver fosse rientrato dal giro precedente → 7 min sul bancone freddo (caso Paco Q2 21:40)
   - **Fix architetturale Step A**: backend ora scrive `forno_out` in DB ad ogni `creaOrdine`/`modificaOrdine`.
     - `zones.js`: nuova funzione `calcolaFornoOut({tipoConsegna, hora, durataAndataMin, driverLiberoMin})` — sorgente unica
     - Regola: `forno_out = max(hora − andata, driver_libero)` per DOMICILIO; `= hora` per RITIRO
     - `getCaricoDelivery` include `forno_out` nel return (usato dall'orchestrator)
     - `creaOrdine`: scrive `forno_out`. Fallback cascade-aware se chiamato senza (es. operatore manuale)
     - Commit `685749b`, deploy Railway live, smoke test E2E passato (RITIRO 20:30→20:30, DOMICILIO Q2 21:40/11→21:29)
   - **Step B FATTO 16/05/2026**: frontend legge `o.forno_out` con fallback legacy
     - 5 punti modificati (NuevoPedidoModal:387 conta-pizze, TabCocina:129, PanelCocina:42, TabEntregas.calcHoraForno, RepartidorPage:84)
     - NuevoPedidoModal:365 lasciato com'è (è il calcolo live per l'ordine che l'operatore sta digitando, non ancora persistito — backend lo calcolerà alla creazione)
     - Verifica E2E in browser preview: TabCocina + TabEntregas mostrano `⏱ 21:29 🛵 21:40` per ordine test Q2 21:40 durata 11. Zero errori console
     - Deploy Netlify live (bundle `main.8a445c54.js`)
   - **Step C (TODO, dopo qualche giorno produzione)**: rimuovere fallback legacy nei 5 punti

**2. Stati `DA_CONFERMARE` (it) vs `DA_CONFIRMARE` (mix)** — ✅ **FIXATO 16/05/2026 nel codice**
   - Sweep su 14 file (frontend + backend Railway): tutto rinominato a `POR_CONFIRMAR` (spagnolo proprio, coerente con `NUEVO`/`RETIRADO`)
   - Cerotto `OrdenCard.jsx:19-20` rimosso — ora `const estado = o.estado;`
   - Duplicate keys nei `RANK` di `TabManual.jsx`/`TabBanco.jsx` consolidate in una sola chiave
   - **⚠️ Migration DB ancora da eseguire** prima del redeploy: `UPDATE ordenes SET estado='POR_CONFIRMAR' WHERE estado IN ('DA_CONFIRMARE','DA_CONFERMARE')` (e idem su `storico` se contiene questi stati)

**3. Google `partial_match` non rilevato in `geoResolver`** — ✅ **FIXATO 16/05/2026**
   - Test con indirizzo finto "Urbanización Las Marinas, Calle Poseidón 3, Roquetas" → Google ha restituito coordinate del centro (Q1, 3 min) invece di Las Marinas (Q5, 30 min)
   - Causa: Google API può restituire ROOFTOP con `partial_match: true` quando interpola un indirizzo non esistente
   - Fix applicato in `geoResolver.js:154` — check `r.partial_match === true` dopo location_type validation → cade su Nominatim/Photon/keyword

**4. `simulateDriverSchedule` non considera che il nuovo ordine spingerà indietro i giri successivi** (severity: bassa)
   - Quando si aggrega un ordine a un giro esistente same-zone-slot, non viene ricontrollato che i giri successivi non siano stretti dal driver
   - Esempio reale visto: Paco Q2 21:40 con durata=11 → pizza esce 21:29 ma driver impegnato fino 21:36 (giro Q1 21:30) → 7 min sul bancone
   - **Fix**: legato al #1 (forno_out autoritativo dal cascade)

### 📋 Convenzioni naming (da rispettare nuovi sviluppi)

- **Stati ordine**: `NUEVO`, `POR_CONFIRMAR`, `EN_COCINA`, `LISTO`, `EN_ENTREGA`, `RETIRADO`, `COMPLETADO` (tutto spagnolo, no italiano misto)
  - ⚠️ Storicamente è esistito anche `COMPLETATO` (italiano) — verificare se ancora usato e migrare
- **Canali**: `WA`, `BANCO`, `MANUAL`, `TEL`
- **Tipo consegna**: `DOMICILIO`, `RITIRO`
- **Tipo modalità AI**: `BASIC` (auto sotto soglia 30€, max 3 pizze), `STRONG` (auto fino a 50€, da validare)

### Prossimi step
1. **🔥 Applicare i 3 fix rimanenti** in ordine: #2 (rename POR_CONFIRMAR) → #1+#4 (forno_out + cascade)
2. **Multi-tenant** — aggiungere `tenant_id` alle tabelle Supabase per supportare più pizzerie
3. **Flusso modifica_complessa**: items aggiornati nell'ordine dovrebbero riflettere la modifica (es. La Pulga → Diavola) — attualmente l'operatore deve modificare manualmente da Pedidos
4. **Cron esterno** opzionale (es. cron-job.org) che chiami `?action=triggerCloseIfNeeded` ogni notte 23:55 Madrid come backup del cron interno
5. **Monitor esterno Railway** — UptimeRobot o cron-job.org che pinga `/health` e manda email quando offline. Vedi memoria `project_alert_railway_pending`
6. **WADettaglio.jsx:886** — unico `sb.update("wa_msgs",...)` diretto rimasto. Da migrare a `api.post` quando si aggiunge endpoint sul backend
7. **Sweep silent catch in TabPreguntas** — ~15 `.catch(()=>{})` ancora presenti nei path IA generation (meno critici dei confirm buttons già fixati)
8. **App mobile dedicata per il driver** — RepartidorPage oggi gira nel browser, valutare app nativa per push notification
9. **Completare test E2E T07-T10** rimasti: T07 (variazione pizza → conf bassa), T08 (importo alto), T09 (indirizzo vago), T10 (recogida mista)

---

## Architettura Attuale

```
WhatsApp cliente
      │
      ▼
Node.js su Railway — backend/bot
      │
      ▼
Supabase — database (conv, wa_msgs, ordenes, config)
      │
      ▼
React App — Operator Dashboard (localhost:3000 dev / Netlify prod)
```

---

## Backend Node.js — Railway

**URL produzione:** `https://ladiecibot-production.up.railway.app`
**GitHub repo:** `https://github.com/bigkaoss23-debug/ladieci_bot`
**Cartella locale:** `/Users/bigart/Downloads/ladieci-bot`

### Struttura

```
ladieci-bot/
├── index.js                        # Express server (webhook + API dashboard)
├── src/
│   ├── config.js                   # Menu, INFO_RISTORANTE, whitelist
│   ├── agents/
│   │   ├── orchestrator.js         # Cervello centrale — flussi 1/2/2B/2C/3
│   │   ├── agentWhatsapp.js        # Interpreta messaggi + genera risposte Claude
│   │   ├── agentCucina.js          # Logica forno: slot 10min, rolling queue
│   │   ├── agentOrdini.js          # CRUD ordini Supabase
│   │   └── agenteMiglioramento.js  # Suggerimenti settimanali + approvazione
│   └── utils/
│       ├── supabase.js             # sbSelect/sbUpdate/sbUpsert/sbDelete — usa SUPABASE_KEY env var
│       ├── claude.js               # chiamaClaude() — API Anthropic, ritorna null su errore
│       ├── helpers.js              # Calcoli, messaggi, appendChat, upsertWaMsg
│       └── servizio.js             # chiudiServizio, scanServizio
```

### Endpoint GET /api

| action | Descrizione |
|---|---|
| `getOrdenes` | Ordini attivi (no RETIRADO/COMPLETADO) |
| `getWaMsgs` | Messaggi WA non COMPLETATO |
| `getConfig` | Config Supabase (tutte le chiavi) |
| `getConvThread` | Thread conv per wa_id (`?wa_id=...`) |
| `generaRispostaIA` | Genera risposta IA (`?testo=...&wa_id=...`) |
| `chiudiServizio` | Chiude il servizio notturno |
| `triggerCloseIfNeeded` | Chiusura idempotente (per cron esterni) — no-op se `LAST_CLOSE_DATE` = oggi Madrid |
| `scanServizio` | Scan ordini attivi prima di chiudere |
| `rigeneraSuggerimenti` | Genera nuovi suggerimenti bot |
| `approvaSuggerimento` | Approva/rifiuta suggerimento |

### Endpoint POST /api

| action | Descrizione |
|---|---|
| `cambiaStato` | Cambia stato ordine |
| `creaOrdine` | Crea nuovo ordine (backend) |
| `modificaOrdine` | Modifica ordine esistente |
| `aggiornaRispostaBot` | Salva bot_risposta su wa_msgs |
| `setConfig` | Aggiorna chiave config |
| `rispondiWA` | Invia messaggio WhatsApp (`wa_id`, `testo`) |
| `updateWaStato` | Aggiorna stato wa_msgs (`id`, `stato`, opz. `ordine_ref`) |
| `updateOrden` | Aggiorna items/hora ordine (`id`, `items`, `hora`) |
| `updateEstado` | Cambia stato ordine con logica collaterale (alias `cambiaStato`) |
| `createOrden` | Crea ordine da frontend (`data: {nombre,tel,items,hora,...}`) |
| `updateNotaCucina` | Aggiorna nota cucina (`id`, `nota_cucina`) |
| `eliminaConversazione` | Elimina conv per wa_id |

### Autenticazione
Tutti gli endpoint `/api` richiedono header `X-Api-Key: ld_92ed94d5ef63ab0327f7c61467898cf3`.
Env var su Railway: `DASHBOARD_API_KEY`.

### Deploy
```bash
cd /Users/bigart/Downloads/ladieci-bot
git add . && git commit -m "descrizione"
git push origin main   # Railway deploya automaticamente
```

---

## Frontend React — Netlify

**Sito:** `magnificent-lollipop-6dff70.netlify.app`
**Site ID:** `02bd4c7a-a50b-4964-90da-8c1af1122932`
**Cartella locale:** `/Users/bigart/Downloads/ladieci-app33`

```bash
npm start   # Dev locale

# Deploy produzione (solo con esplicito "vai / deploya" dall'utente)
npx -y @netlify/mcp@latest --site-id 02bd4c7a-a50b-4964-90da-8c1af1122932
```

**IMPORTANTE:** Non fare mai build+deploy senza esplicito "vai / deploya" dall'utente. Costa soldi.

---

## Supabase

**URL:** `https://wnswassgfuuivmfwjxsf.supabase.co`

| Tabella | Contenuto |
|---|---|
| `conv` | Conversazioni attive. `chat` (JSON array) = cronologia completa |
| `wa_msgs` | Messaggi WA in arrivo, con `ia_items`, `bot_risposta`, `stato` |
| `ordenes` | Ordini confermati/in cucina |
| `storico` | Archivio ordini completati (dopo chiudiServizio) |
| `archivio_conv` | Archivio conversazioni (dopo chiudiServizio) |
| `config` | Configurazione runtime (chiave/valore) — RLS attiva |
| `suggerimenti` | Suggerimenti bot pendenti/approvati/rifiutati |
| `clientes` | Profili clienti abituali |

### RLS su config
La tabella `config` ha RLS abilitata. La policy `public_read_non_sensitive` blocca la lettura di chiavi sensibili via anon key:
```sql
CREATE POLICY "public_read_non_sensitive" ON config
FOR SELECT TO anon
USING (chiave NOT IN ('WA_ACCESS_TOKEN', 'ANTHROPIC_KEY', 'WA_PHONE_ID', 'WA_BUSINESS_ID', 'WA_NUMBER'));
```
Il backend Railway deve usare la **service_role key** come `SUPABASE_KEY` per leggere tutte le chiavi.

### Logica forno
- Slot fissi ogni 10 minuti (19:30 → 23:00)
- Max 4 pizze per slot
- Rolling queue: se slot pieno, assegna il successivo libero

---

## Regole importanti

- **MAI localStorage** — app usata da più operatori sullo stesso browser
- **MAI deploy senza permesso esplicito** dell'utente
- **Supabase è il riferimento** — prima di dichiarare un bug nel backend, verificare i dati reali
- `conv.chat` (JSON array) è la fonte di verità per la cronologia messaggi
- `ia_items[].sub` è dove vengono salvate le note/variazioni del cliente
- `appendChat()` ha deduplicazione: finestra 30s
- Il bot risponde solo se `AUTO_RISPOSTA = TRUE` (config Supabase)
- Per modifiche al backend Railway: push su GitHub → Railway rideploya automaticamente
- **Tutti i fetch verso Railway** devono avere `headers: {"X-Api-Key": RAILWAY_API_KEY}`
- `chiamaClaude()` ritorna `null` su errore — gestire sempre il caso `null` nel chiamante
- **Mai scrivere su `storico` dal frontend** — sorgente unica di scrittura è il backend Railway (chiusura serata). Il frontend usa solo `api.getStorico()` in lettura
- **Mai usare `toLocaleDateString("es")` per la `fecha` di `storico`** — produce formato `d/m/yyyy` che convive male con l'ISO `YYYY-MM-DD` del backend. Usare sempre ISO

---

## Struttura src/ (Frontend)

```
src/
├── api.js                  # Supabase client + API helper → Railway
│                           # Esporta: sb, api, SUPABASE_URL, SUPABASE_KEY, API_URL, RAILWAY_API_KEY
├── constants.js            # Colori, MENU, CATS, helper vari
└── components/
    ├── wa/
    │   ├── TabWA.jsx           # Root WhatsApp: Pedidos + Preguntas
    │   ├── TabPreguntas.jsx    # Lista domande in attesa operatore
    │   ├── WADettaglio.jsx     # Dettaglio ordine singolo
    │   ├── WaLista.jsx         # Lista ordini Pedidos
    │   └── PreguntaCard.jsx    # Card singola Preguntas
    ├── ServicioPage.jsx        # Pagina servizio — watchdog pinga /health Railway
    ├── EconomiaPage.jsx        # Statistiche — legge da Supabase storico via api.getStorico()
    └── ui/                 # Componenti UI riutilizzabili
```

**Note importanti:**
- `TabPreguntas` è sempre montato — usa `display:none` CSS per preservare lo stato React
- `api.getStorico()` calcola analytics lato frontend da Supabase `storico` — include `giorniDettaglio`
- Il watchdog ServicioPage pinga `https://ladiecibot-production.up.railway.app/health` ogni 30s
- 3 stati salute: ok (normale) / warning (giallo lampeggiante, 1-2 fail) / error (rosso fisso, 3+ fail)
