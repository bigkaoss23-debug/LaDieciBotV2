# La Dieci Bot V2 — OPS Health / Watchdog Stress Matrix

Matrice operativa per il blocco
`monitoraggio salute sistema → indicatore operatore → reazione → recupero`.

Obiettivo: durante servizio live, l'operatore deve **vedere** in tempo reale se
backend, bot WhatsApp o DB sono offline o degradati, e sapere **cosa fare**
(continuare in manuale, chiamare tecnico, attendere). Niente deploy del
watchdog senza P0 verde.

---

## 1. Principio generale

1. **L'operatore non deve indovinare.**
   La salute del sistema è esplicita in UI, sempre visibile, in 1 sguardo.
2. **Allarme chiaro + azione consigliata.**
   "🔴 Backend desconectado — usar WhatsApp manual" è più utile di "Error".
3. **Falsi positivi peggiorano la fiducia.**
   Meglio mostrare ⚫ "Stato sconosciuto" che 🔴 quando non sappiamo davvero.
   Una connessione mobile traballante per 5s non è un'emergenza.
4. **Mai esporre segreti.**
   Token, API key, URL Supabase autenticati, payload WhatsApp privati non
   devono comparire nel pannello health né nei toast/log visibili.
5. **Manuale-first è la salvaguardia.**
   Se il bot cade, la pizzeria continua a girare su WhatsApp normale dal
   cellulare. Il watchdog deve dirlo all'operatore in chiaro.

---

## 2. Componenti da monitorare

| # | Componente | Cosa controllare | Come | Frequenza tipica |
|---|------------|------------------|------|-----------------|
| 1 | **Frontend online** | Tab attiva, JS non crashato, fetch funziona | `navigator.onLine`, error boundary React | Sempre |
| 2 | **Backend Railway** | `/health` ritorna `{ok:true}` | `GET /health` no-auth | Ogni 30s |
| 3 | **API getOrdenes** | Risposta valida, schema atteso, latenza | `api.getOrdenes()` polling normale | 5–10s |
| 4 | **Supabase lettura** | sb.from("ordenes").select() risponde | Conseguenza di getOrdenes/getWaMsgs | Idem |
| 5 | **Supabase scrittura** | Update stato, upsert config | Verifica indiretta su click stato | On-demand |
| 6 | **WhatsApp webhook ricezione** | Tempo dall'ultimo messaggio WA in `wa_msgs` | `MAX(ts) FROM wa_msgs` o config `LAST_WA_INBOUND_TS` | Ogni 60s |
| 7 | **WhatsApp outbound** | Invio messaggi non fallisce | Ultimo `rispondiWA` response + flag config `LAST_WA_OUTBOUND_OK` | Ogni outbound |
| 8 | **Claude / Anthropic** | `chiamaClaude` non torna null sistematicamente | Counter `CLAUDE_FAILS_LAST_HOUR` in config | Per chiamata |
| 9 | **Google geocoding** | resolveAddress non cade ZERO_RESULTS/timeout sistematicamente | Counter `GEO_FAILS_LAST_HOUR` | Per chiamata |
| 10 | **Polling / WebSocket** | `wsConnected` flag, polling attivo | `App.jsx` (esiste già) | Sempre |
| 11 | **Ultimo WA ricevuto** | Quanti min dall'ultimo messaggio inbound | derivato da #6 | 60s |
| 12 | **Ultimo WA processato** | Quanti min dall'ultimo `wa_msgs.stato=PROCESSADO` | `MAX(updated_at) FROM wa_msgs WHERE stato=...` | 60s |
| 13 | **PWA freshness** | SHA frontend == ultimo deploy noto | Confronto build hash vs `meta` versione | All'avvio |
| 14 | **Backend version** | SHA commit live vs ultimo push | `GET /version` (TODO, oggi non esiste) | All'avvio + ogni 5 min |

---

## 3. Stati sistema

### 🟢 Operativo
- **Condizione:** tutti i componenti #1–#12 verdi negli ultimi 60s.
  - `/health` ok da ≥2 tentativi consecutivi
  - getOrdenes ok ultima volta
  - lastWaInbound < 30 min (orario di servizio) o flag "fuori servizio" attivo
  - polling/WS attivo
- **Operatore vede:** badge verde "🟢 Sistema operativo".
- **Azione operatore:** nessuna, lavora normalmente.
- **Log:** niente, solo metriche.

### 🟡 Degradato
- **Condizione (OR):**
  - `/health` 1 fail isolato negli ultimi 90s (non ancora 3)
  - getOrdenes latenza > 5s ma ok
  - lastWaInbound 30–60 min in piena ora di servizio (sospetto webhook)
  - polling/WS riconnesso recentemente
  - 1–2 chiamate Claude/Geo fallite nell'ultima ora
- **Operatore vede:** badge giallo lampeggiante "🟡 Sistema lento" + tooltip con dettaglio (es. "Pedidos no actualizados desde 8 min").
- **Azione operatore:** continuare a lavorare ma verificare WhatsApp diretto se non arrivano ordini.
- **Log:** WARN locale (console), non interrompere.

### 🔴 Offline / intervento manuale
- **Condizione (OR):**
  - `/health` 3 fail consecutivi (≥90s offline)
  - getOrdenes fallita 3 volte di fila
  - lastWaInbound > 60 min in ora di servizio
  - polling+WS entrambi down
  - Supabase fetch non risponde
- **Operatore vede:** banner rosso fisso in testa pagina:
  - "🔴 Backend desconectado — usar WhatsApp manual"
  - "🔴 Pedidos no actualizados desde 12 min — revisar WhatsApp del móvil"
  - Suono allarme + Notification browser (`requireInteraction:true`, già implementato per Railway).
- **Azione operatore:**
  1. Passare a WhatsApp dal cellulare manuale.
  2. Continuare ordini su carta.
  3. Notificare tecnico (numero in `INFO_RISTORANTE` o nota fissa).
- **Log:** ERROR + timestamp + componente. Mai con token.

### ⚫ Stato sconosciuto
- **Condizione:** la tab è stata in background a lungo, oppure il browser ha
  appena ripreso connessione, oppure `/health` non è ancora stato chiamato
  (cold start). Non sappiamo se è verde o rosso.
- **Operatore vede:** badge grigio "⚫ Verificando…".
- **Azione operatore:** attendere 10–20s. Se resta grigio > 30s → trattare come 🟡.
- **Log:** debug.

---

## 4. Failure modes da testare

| # | Failure | Stato atteso | UI attesa | Falso positivo da evitare |
|---|---------|--------------|-----------|----------------------------|
| F1 | `/health` non risponde (timeout 5s) × 3 | 🔴 | "Backend desconectado" | Singolo timeout (è 🟡) |
| F2 | `/health` HTTP 500 isolato | 🟡 | "Sistema lento" | Persistente → 🔴 (3 fail) |
| F3 | `getOrdenes` HTTP 500 | 🟡 → 🔴 dopo 3 | "Pedidos no actualizados desde X min" | Una singola 500 dopo ok = 🟡 |
| F4 | Supabase lento (10s/call) | 🟡 | "Sistema lento" | Una latenza alta isolata = 🟢 |
| F5 | Supabase down (network error) | 🔴 | "Base de datos no disponible" | Errore CORS preflight = 🟡 |
| F6 | Webhook WA non riceve da 45 min in ora di servizio | 🟡 | "WhatsApp no verificado desde 45 min" | Fuori orario servizio = 🟢 |
| F7 | Webhook WA non riceve da 70 min in ora di servizio | 🔴 | "WhatsApp posiblemente caído — revisar móvil" | Pausa naturale tra ordini = 🟡 |
| F8 | `rispondiWA` outbound fallisce 3 volte | 🔴 | "Mensajes saliendo no llegan — usar móvil" | 1 fallimento = 🟡 |
| F9 | Claude API down (`chiamaClaude` null × 5) | 🟡 | "IA no disponible — interpretar manual" | Bot continua a leggere ordini, UI mostra warning |
| F10 | Google geocoding down/quota | 🟡 | "Geocoding limitado — verificar zonas" | Risolutore cade su Nominatim/Photon, niente 🔴 |
| F11 | Tablet pizzeria perde Wi-Fi (online → offline) | ⚫ poi 🔴 | "Sin conexión" | Recupero rapido → 🟢 senza intermedi |
| F12 | Polling JS bloccato (errore in setInterval) | ⚫ → 🟡 | "Pedidos no actualizados desde X" | Misurato da "tempo dall'ultimo poll riuscito" |
| F13 | PWA cache vecchia (utente con tab aperta da 2 giorni) | 🟡 | "Versión antigua — recargar" (no force) | Versione minor uguale = 🟢 |
| F14 | Backend env var `DASHBOARD_API_KEY` mancante (auth 401 tutte le chiamate) | 🔴 | "Backend rechaza credenciales — llamar técnico" | Singolo 401 = 🟡 |
| F15 | Railway redeploy in corso (5–30s di 502/503) | 🟡 lampeggiante | "Backend reiniciando…" | Non saltare a 🔴 prima di 90s |
| F16 | Notification permission negato | nessun cambio stato | Suono solo (no notification) | Non bloccare l'app |

---

## 5. UI operatore

### Dove
- Badge fisso in alto a destra, sempre visibile in tutti i tab (ServicioPage, TabWA, TabCocina, TabEntregas, Pedidos, Economia).
- Click sul badge apre pannello `Diagnóstico` con dettaglio componenti.

### Forma
- Cerchio colorato + 1 parola stato + tooltip con sotto-stati.
- Lampeggiante solo per 🟡 e durante 🔴 fresh (primi 60s).
- Suono allarme solo per 🔴, una volta, con bottone "Silenciar 5 min".

### Esempi messaggi (es-ES)
| Codice | Spagnolo |
|--------|----------|
| OK | "🟢 Sistema operativo" |
| WA_INBOUND_LENTO | "🟡 WhatsApp no verificado desde 12 min" |
| WA_INBOUND_OFFLINE | "🔴 WhatsApp posiblemente caído — revisar móvil" |
| WA_OUTBOUND_FAIL | "🔴 Mensajes saliendo no llegan — usar móvil" |
| BACKEND_DEGRADADO | "🟡 Sistema lento" |
| BACKEND_OFFLINE | "🔴 Backend desconectado — usar WhatsApp manual" |
| DB_OFFLINE | "🔴 Base de datos no disponible" |
| AUTH_KO | "🔴 Backend rechaza credenciales — llamar técnico" |
| PEDIDOS_STALE | "🟡 Pedidos no actualizados desde 8 min" |
| IA_KO | "🟡 IA no disponible — interpretar manual" |
| GEO_KO | "🟡 Geocoding limitado — verificar zonas" |
| RIAVVIO | "🟡 Backend reiniciando…" |
| VERIFICANDO | "⚫ Verificando…" |
| PWA_OLD | "🟡 Versión antigua — recargar" |

### Anti-rumore
- Soglia minima 3 fail consecutivi prima di 🔴 (eccetto F11 `navigator.onLine=false` esplicito).
- Cooldown 5 min su ri-allarme stesso codice.
- `silenziato_fino` in stato locale (non localStorage — multi-operatore).
- Mai mostrare stack trace o URL completo nel tooltip.

---

## 6. Test manuali

Per ciascun failure F1–F16:

1. Apri app in browser preview (`npm start --prefix ladieci-app33`).
2. Attendi badge 🟢.
3. Simula il guasto:
   - F1/F2: chrome devtools → Network → block `*/health`.
   - F3: block `*/api?action=getOrdenes`.
   - F4: throttling "Slow 3G".
   - F5: block Supabase host.
   - F6/F7: in DB SELECT-only impossibile simulare scrittura; usare DevTools per mockare `lastWaInbound` o testare in staging.
   - F8: mockare 500 sul POST `/api?action=rispondiWA`.
   - F11: chrome devtools → Network → Offline.
   - F13: cambia `meta` versione e ricarica.
   - F15: stop Railway 10s (richiede coord. con tecnico, no in produzione).
4. Verifica badge cambia colore secondo §3.
5. Verifica messaggio corrisponde a §5.
6. Verifica suono/notification per 🔴.
7. Ripristina e verifica recovery 🟢 entro 30s.

**Recovery test obbligatorio:** ogni failure deve avere un "torna verde" verificato. Una watchdog che resta rossa per sempre è peggio di nessuna.

---

## 7. Test automatici

In `ladieci-app33/src/utils/` (file nuovo, non implementato — solo specificato):

```
opsHealth.test.js
```

Casi:

| # | Input | Atteso |
|---|-------|--------|
| 1 | health: [ok, ok, ok] ultimi 3 | stato OK |
| 2 | health: [ok, fail, ok] | stato OK (isolato) |
| 3 | health: [fail, fail, fail] | stato OFFLINE |
| 4 | health: [ok, fail, fail] | stato DEGRADED |
| 5 | health timeout (>5s) × 3 | stato OFFLINE |
| 6 | getOrdenes: ultima ok < 60s | OK |
| 7 | getOrdenes: ultima ok 90–300s | DEGRADED (PEDIDOS_STALE) |
| 8 | getOrdenes: ultima ok > 300s | OFFLINE |
| 9 | lastWaInbound: 5 min fa, ora servizio | OK |
| 10 | lastWaInbound: 35 min fa, ora servizio | DEGRADED |
| 11 | lastWaInbound: 70 min fa, ora servizio | OFFLINE |
| 12 | lastWaInbound: 70 min fa, fuori orario | OK |
| 13 | outbound: 3 fail ultimi 5 min | OFFLINE |
| 14 | outbound: 1 fail isolato | OK |
| 15 | navigator.onLine=false | UNKNOWN poi OFFLINE dopo 30s |
| 16 | recovery: da OFFLINE a 2 ok consecutive | OK |
| 17 | cooldown: stesso codice 🔴 entro 5 min | no double alarm |
| 18 | composizione: BACKEND ok + WA stale | DEGRADED, codice WA_INBOUND_LENTO |
| 19 | composizione: BACKEND offline + WA ok | OFFLINE, codice BACKEND_OFFLINE (worst-wins) |
| 20 | unknown: cold start senza dati | UNKNOWN |

---

## 8. Patch futura consigliata

### 8.1 Audit codice esistente
Cosa già esiste (da CLAUDE.md):
- `ServicioPage.jsx` pinga `/health` Railway ogni 30s → 3 stati (ok/warning/error)
- Suono allarme + browser Notification con `requireInteraction:true` su Railway offline
- `wsConnected` flag in `App.jsx` con fallback polling
- Memory leak fix `notificatiIds` (trim 250 quando >500)

Cosa manca:
- Health esteso oltre `/health` (no WA inbound check, no DB check, no outbound check, no IA check)
- Indicatore visibile in tab diversi da Servicio
- Codici stato strutturati (oggi solo binario ok/warning/error)
- Endpoint `/version` o `/status` con SHA backend, ultimo WA inbound timestamp, contatori fail orari
- Cooldown allarmi
- Recovery test

### 8.2 Endpoint backend `/status` (proposta — NON applicata)
GET `/status` no-auth (o auth leggera):
```
{
  "ok": true,
  "version": "<sha>",
  "uptime_s": 12345,
  "last_wa_inbound_ts": 1779478000000,
  "last_wa_outbound_ts": 1779478500000,
  "last_wa_outbound_ok": true,
  "claude_fails_last_hour": 0,
  "geo_fails_last_hour": 2,
  "db_last_select_ok": true
}
```
Niente token, niente env, niente body messaggio WA.

### 8.3 Frontend `useOpsHealth()` hook
- Polling unico, composizione stati da §7.
- Esporta `{level: "ok"|"degraded"|"offline"|"unknown", codes: [...], message, suggestedAction}`.
- Cooldown integrato.
- Badge component `<OpsHealthBadge/>` riusabile montato in `App.jsx` (toolbar).

### 8.4 Log diagnostico
- Locale: console + ring buffer ultime 50 transizioni stato (non persistente).
- Remoto: opzionale, table `ops_health_log` (data, livello, codice). NIENTE payload sensibile.

---

## 9. Regole di release

**Niente deploy del watchdog / ops health** se:

1. Test automatici §7 non aggiunti o red.
2. Almeno 3 failure mode §4 P0 (F1, F3, F7, F8, F14) non testati manualmente con recovery verde.
3. Badge mostra stati senza tooltip o senza azione consigliata.
4. Log contiene token, API key, payload WhatsApp, URL autenticati.
5. Soglie di transizione (3 fail consecutivi, 60 min stale, ecc.) hardcoded senza commento.
6. Falso positivo durante Railway redeploy < 90s non gestito (F15).
7. Backup remoto `backup/v2-ops-health-YYYY-MM-DD` non creato prima del push su `main`.

**Niente allarme rosso se non sappiamo davvero che è rosso.** Preferire ⚫ "Verificando…" a 🔴 "Offline" su dati ambigui.

---

## Riferimenti

- `App.jsx` — `wsConnected`, polling fallback, notificatiIds trim
- `ServicioPage.jsx` — watchdog Railway esistente, suono + Notification
- CLAUDE.md sezione "Backend Node.js — Railway", endpoint `/health`
- Memoria `project_alert_railway_pending` (se ancora valida)
- Matrici complementari:
  - `LaDieciBotV2_DELIVERY_ETA_STRESS_MATRIX.md`
  - `LaDieciBotV2_DELIVERY_VIS_STRESS_MATRIX.md`

STOP DOC.
