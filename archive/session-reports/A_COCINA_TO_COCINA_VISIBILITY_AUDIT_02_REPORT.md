# A_COCINA_TO_COCINA_VISIBILITY_AUDIT_02 — REPORT

**Data:** 2026-06-14 ~19:34 UTC (servizio live)
**Modalità:** READ-ONLY. Zero write, zero deploy, zero patch, zero state change, zero ordini creati.
**Problema (corretto):** l'ordine esiste già; dopo il click **«A Cocina»** la card appare in Cocina **dopo un po'**.

---

## VERDETTO: 🟢 C — Realtime perso → attesa fallback (con bug architetturale nel gate del fallback)

- ❌ **A (write lenta)** — ESCLUSO. La scrittura DB è **istantanea** (vedi §3).
- 🟡 **B (DB immediato ma UI refresh lento)** — solo marginale: il refetch è sub-secondo.
- ✅ **C (realtime perso → fallback)** — **CAUSA PRIMARIA**. Quando l'evento realtime non arriva al browser dell'operatore, il fallback poll a 5s **non parte**, perché è gated su `wsConnected` che riflette solo «socket aperto», non «sottoscrizione che consegna eventi».
- 🟡 **D (browser/rete operatore)** — concausa: l'infra realtime lato server è **sana** (provato), quindi la perdita evento è dal lato connessione/browser dell'operatore.

---

## 3. DATI MISURATI

### Scrittura DB istantanea — A ESCLUSO
Confronto, per ogni passaggio a `EN_COCINA`, tra **evento log `confirmed`** e **`en_cocina_at`/`updated_at`** dell'ordine:

| Ordine | log `confirmed` (EN_COCINA) | `en_cocina_at` (DB) | Δ log↔DB | gap |
|---|---|---|---|---|
| #017 | 19:31:21.107 | 19:31:20.824 | **~0.28s** (DB *prima* del log) | <5s ✅ |
| #016 | 19:31:20.006 | 19:31:19.710 | ~0.30s | <5s ✅ |
| #015 | 19:21:40.549 | 19:21:40.265 | ~0.28s | <5s ✅ |
| #013 | 19:13:39.226 | 19:13:38.950 | ~0.28s | <5s ✅ |
| #012 | 19:06:01.183 | 19:06:00.879 | ~0.30s | <5s ✅ |
| #011 | 18:58:17.364 | 18:58:17.049 | ~0.31s | <5s ✅ |

→ La riga DB (`updated_at` = `en_cocina_at`) viene scritta **prima** dell'insert del log. **Nessun gap >5s, nessuno >10s, nessuno >30s.** Il DB ha lo stato `EN_COCINA` entro frazioni di secondo dal click. **La lentezza NON è nella write.**

### Ultimi 20 eventi `orden_estado_logs` (origin/stato)
Tutti `origin: dashboard` (operatore) o `entregas` (rider). Sequenza coerente, nessuna anomalia:
`#017 POR_CONFIRMAR→EN_COCINA 19:31:21`, `#016 POR_CONFIRMAR→EN_COCINA 19:31:20`, `#015 …→EN_COCINA 19:21:40`, `#012/#013/#011 confirmed`, ecc. Nessun evento duplicato o fuori ordine.

### Ultimi ordini (campi timing reali)
`en_cocina_at` presente e popolato per tutti gli `EN_COCINA`/successivi; coincide con `updated_at` al passaggio. `#014` resta `POR_CONFIRMAR` con `en_cocina_at: null` (mai mandato in cocina — corretto).

### Realtime infra — SANA (provato live)
Probe WebSocket read-only su `wss://…/realtime/v1/websocket`:
```
WS_OPEN
phx_reply status=ok  resp={"postgres_changes":[{"id":130333853,"event":"*","schema":"public","table":"ordenes"}]}
system status=ok      (Subscribed to PostgreSQL)
```
→ La sottoscrizione `postgres_changes` su `ordenes` è **accettata e attiva**. Replication abilitata, RLS non blocca (l'anon legge `ordenes`, infatti `getOrdenes` funziona). Lato server, ogni UPDATE su `ordenes` **deve** generare un evento.

---

## 4. ANALISI CODICE FRONTEND (`777ae55`, `src/App.jsx` + `components/cocina/`)

### Cosa legge la Cocina
- `TabCocina.jsx:152` → `.filter(o => o.estado === ORDER_STATES.EN_COCINA)` ✅ corretto.
- `PanelCocina.jsx:71` → `.filter(o => o.estado === "EN_COCINA")` ✅ corretto.
- `ordenes` arriva come prop da `ServicioPage` → stato globale in `App.jsx`. La card appare appena `ordenes` contiene l'ordine con `estado: EN_COCINA`.

### Realtime / refresh (`App.jsx:176-330`)
- **NON c'è polling periodico** in condizioni normali. Il commento dice «ZERO POLLING».
- Apre un WebSocket Supabase Realtime, join su `ordenes`/`wa_msgs`/`conv`.
- `ws.onmessage`: su `event === "postgres_changes"` chiama **`loadAll()`** → refetch completo (`getOrdenes` ~0.16-0.35s + `getWaMsgs` + `conv`) e ricostruisce lo state. Quindi su evento ricevuto la card appare **sub-secondo** → conferma che B non è la causa primaria.
- **Fallback poll 5s:** `setInterval(() => { if (mounted && !wsConnected) loadAll(); }, 5000)`.

### ⚠️ Bug architetturale — il fallback è inibito da un flag che non misura la salute della sottoscrizione
```js
let wsConnected = false;
ws.onopen  = () => { wsConnected = true;  ... }   // diventa true al socket OPEN
ws.onclose = () => { wsConnected = false; ... }    // torna false solo su CLOSE/ERROR
const fallbackPoll = setInterval(() => { if (!wsConnected) loadAll(); }, 5000);
```
- `wsConnected` riflette **solo «socket aperto»**, non «sto ricevendo eventi `postgres_changes`».
- Se il socket diventa **half-open / zombie** (sospensione laptop, blip Wi-Fi, timeout NAT/proxy, rete operatore instabile) **senza** scatenare `onclose`/`onerror`, allora:
  1. gli eventi realtime **smettono di arrivare**, ma
  2. `wsConnected` resta `true`, quindi **il fallback poll 5s non parte mai**.
- L'heartbeat (`30s`) fa solo `ws.send(...)` se `readyState===1`: **non verifica** che arrivi un `phx_reply`, quindi un socket zombie non viene rilevato finché lo stack TCP del browser non scade. → La card appare solo al successivo **reconnect** (`onclose → setTimeout 3s → loadAll`) o quando un **altro** evento DB qualsiasi riesce a passare e scatena `loadAll`.
- Conseguenza pratica: in una rete sana la card è istantanea; appena la connessione dell'operatore «singhiozza», la card compare **«dopo un po'»** (decine di secondi), esattamente il sintomo riportato. Su una serata movimentata il sintomo si maschera (altri eventi DB fanno scattare `loadAll`); nei momenti tranquilli si nota di più.

### Può perdere un evento e aspettare il poll 5s?
- **No, peggio:** se il socket è *davvero* chiuso il poll 5s recupera. Ma nel caso zombie (socket «aperto» ma muto) il poll **è disattivato** e non c'è recupero a 5s → attesa fino al reconnect.

---

## 5. NETWORK / REALTIME

- WebSocket Supabase Realtime: **attivo e sottoscritto** lato infra (provato, `status=ok`).
- Fallback poll 5s: presente ma **gated su `wsConnected`** (vedi bug sopra).
- Errori console / 401 / 429 / timeout: **non osservabili da qui** — richiedono il **browser reale dell'operatore** (DevTools → Console/Network sulla sua sessione). Da questa postazione l'handshake è pulito (nessun 401/429). Verifica consigliata in §6.

---

## 6. AZIONI

### Immediate operative (in servizio, ZERO codice)
1. **Sul browser dell'operatore**, aprire DevTools → Network → WS: verificare che il websocket `realtime/v1/websocket` sia **aperto e con frame in arrivo**. Se è chiuso/rosso o senza frame → è il caso zombie.
2. **Workaround immediato:** un **refresh manuale (F5)** della pagina forza `loadAll` + nuovo WS → la card compare subito. Da usare come tampone finché non si corregge il gate.
3. Verificare la stabilità della rete/Wi-Fi della postazione cucina (il sintomo è legato a connessione che singhiozza).

### Post-servizio tecniche (fuori servizio, sul backend/codice reale — NO patch ora)
1. **Fix del gate fallback** (causa radice): far ripartire il poll quando la *sottoscrizione* non è viva, non solo quando il socket è chiuso. Opzioni: (a) poll periodico **sempre attivo** a 5-10s indipendente dal WS (semplice, robusto); (b) heartbeat con verifica del `phx_reply` + watchdog «nessun evento/heartbeat da N s → forza reconnect»; (c) marcare `wsConnected=false` se non arrivano `phx_reply` agli heartbeat entro timeout.
2. **Debounce su `loadAll`** scatenato da `postgres_changes` (oggi un refetch completo per ogni evento) per evitare thundering-herd quando gli eventi arrivano a raffica.
3. (Opzionale) Aggiornamento **ottimistico locale** dello stato alla pressione di «A Cocina»: la card può apparire in Cocina subito lato client, riconciliata poi dal backend — elimina del tutto la dipendenza dal realtime per il feedback immediato all'operatore.

---

## SAFETY — confermato
- ✅ Zero write DB (solo SELECT + sottoscrizione realtime read-only).
- ✅ Zero deploy / patch / commit / push.
- ✅ Zero state change (nessun Confirmar / A Cocina / updateEstado).
- ✅ Zero ordini creati, zero cleanup.
- ℹ️ Unica scrittura su filesystem: questo report (nuovo file).
