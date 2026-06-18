# LIVE_PERFORMANCE_AUDIT_APP_SLOW_01 — REPORT

**Data:** 2026-06-14 ~19:30 UTC (servizio live)
**Modalità:** READ-ONLY. Zero write, zero deploy, zero state change, zero cleanup. `ORDINI_2026-05-23.md` non toccato.
**Segnalazione operatore:** «l'app ci mette tanto a caricare» + «quando fa l'ordine ci mette tempo a uscire in cucina».

---

## 1. VERDICT: 🟡 ATTENZIONE (nessun CRITICO)

Nessun componente è down o in degrado grave. Backend, DB, frontend e flusso ordini sono **tutti funzionanti e con latenze sub-secondo o pochi secondi**. Non c'è coda bloccata, non ci sono ordini incastrati, nessun deploy inatteso.

La lentezza percepita è **reale ma strutturale**, non un guasto:
- **Load app:** accettabile, ma il bundle JS viene rivalidato ad ogni caricamento (cache non-immutable) e `getStorico` scarica 572 KB.
- **«Ordine lento a uscire in cucina»:** è la somma di (a) flusso a **due passi by-design** (crea → `POR_CONFIRMAR` → click manuale «A Cocina») e (b) **catena di chiamate preview pre-creazione** nel modal Nuevo Pedido, ognuna passa per la Netlify Function → Railway → (geocode Google) → Supabase.

---

## 2. COSA È LENTO (e cosa NO)

| Area | Stato | Note |
|---|---|---|
| Backend Railway | 🟢 OK | `/health` 0.27–0.65s, uptime 4h, deploy atteso |
| Supabase / DB | 🟢 OK | latency stabile **191 ms** (un picco isolato a 417 ms) |
| Letture UI (carico ordini) | 🟢 OK | ordenes 0.16–0.35s (27 KB); wa_msgs 0.27s |
| Carico Economia/Storico | 🟡 | `getStorico` = **572 KB / 0.58s**, aggregazione client-side su 500 righe |
| Bundle frontend | 🟡 | 225 KB gz, `cache-control: max-age=0, must-revalidate` → **rivalidazione ad ogni load** |
| Netlify Function proxy (writes) | 🟡 | overhead **0.28–0.52s per chiamata**, prima ancora di Railway/DB |
| Flusso Nuevo Pedido → cocina | 🟡 | **4–6 round-trip preview** sequenziali + 2 step stato |
| Refresh/polling UI | 🟢 OK | Realtime WebSocket + fallback poll 5s (no polling aggressivo) |

---

## 3. DATI MISURATI

### Sistema (Fase 1)
- **Frontend** `/version.json`: commit `777ae55` ✅, deploy `6a2533b4926549d7ee8937b1` ✅, locked, TTFB 0.17s.
- **Backend** `/version`: deployment `397d4061` ✅ (atteso), commit `unknown` (pattern `railway up` noto), uptime 14.8 ks.
- **Backend** `/status`: `level: yellow` — **ma solo per WhatsApp idle** (`whatsappInbound/Processed lastAt:null`); `backend: green`, `database: green` (417 ms a freddo → 191 ms stabile a regime), `ordini todayCount: 15`, `lastCreatedAt 19:25`.
- `/status` impiega ~0.91s perché esegue il check DB inline; `/health` (no DB) 0.27s.

### Frontend / network (Fase 4)
- `index.html`: 539 B, `cache-control: public,max-age=0,must-revalidate` (corretto per SPA).
- `main.66b46ad7.js`: **225 KB gz**, total 0.70s, **`cache-control: max-age=0, must-revalidate`** ⚠️ (un asset hashato dovrebbe essere `immutable`; così ogni load fa una rivalidazione 304).
- Service worker presente (`sw.js` 200) — possibile caching stantio ma non causa di lentezza.
- Netlify Function `/api/proxy`: 0.28–0.52s solo per rispondere (401 unauth) → è l'**overhead fisso di ogni write**.

### Ordini per stato (Fase 2) — `ordenes`, 16 righe totali
| Stato | Conteggio |
|---|---|
| NUEVO | 0 |
| POR_CONFIRMAR | 3 |
| EN_COCINA | 4 |
| LISTO | 3 |
| EN_ENTREGA | 0 |
| RETIRADO | 6 |
| COMPLETADO | 0 |

Nessun accumulo anomalo. I 3 `POR_CONFIRMAR` sono coerenti: `#016` (hora 21:24) e `#017` (hora 22:00) sono **prenotazioni future trattenute correttamente**; `#014` (canal WA) è in attesa di conferma operatore.

### Lifecycle timing (Fase 3) — da `orden_estado_logs` (presente e popolato)
Tempo **creato → EN_COCINA** (click «A Cocina» immediato), include tempo umano + 1 write:
- `#012` (DOMICILIO): 19:05:59 → 19:06:01 = **~2,0s**
- `#015` (DOMICILIO): 19:21:36 → 19:21:40 = **~4,4s**
- `#011` (DOMICILIO): 18:58:12 → 18:58:17 = **~5,1s**
- `#013` (RITIRO): 19:13:27 → 19:13:39 = **~12,0s** (operatore ha atteso)

→ **La transizione di stato lato sistema è sub-secondo.** I gap sono prevalentemente tempo-operatore. Nessun ordine bloccato per lag tecnico.

---

## 4. IPOTESI: CONFERMATE vs ESCLUSE

**ESCLUSE (non sono la causa):**
- ❌ Backend Railway lento — green, sub-secondo.
- ❌ DB Supabase lento — 191 ms stabili.
- ❌ Letture UI lente / polling aggressivo — Realtime WS, letture sub-secondo.
- ❌ Ordini incastrati in `POR_CONFIRMAR` per bug — i pendenti sono prenotazioni future / WA in attesa, by-design.
- ❌ Deploy inatteso — frontend/backend ai commit attesi, locked.
- ❌ WhatsApp rosso — il `yellow` è solo idle inbound (nessun messaggio recente), non un guasto.

**CONFERMATE (contribuiscono alla lentezza percepita):**
- ✅ **«Lento a uscire in cucina» = flusso a due passi + preview pesanti.** Il modal Nuevo Pedido invoca in sequenza `previewOrderTiming`, `resolveAddress` (geocode Google/Nominatim — il più lento, soprattutto DOMICILIO), `previewOrderPlanner`, di nuovo `previewOrderTiming`, `previewStrategicOpportunities`, `previewManualGiroRoute`. Ogni chiamata = ~0.3–0.5s di Netlify Function + Railway + geocode. Poi `createOrden` crea in `POR_CONFIRMAR`, e serve un **secondo click «A Cocina»** (`updateEstado` → `EN_COCINA`) perché la cucina mostra solo `EN_COCINA`.
- ✅ **«Lento a caricare» = bundle rivalidato ad ogni load + Economia pesante** (572 KB storico). Non drammatico ma sommato dà l'impressione di lentezza all'avvio.

**Da chiarire con l'operatore (Fase 5):** intende «dopo Confirmar non lo vedo subito in Cocina»? → è **comportamento previsto**: l'ordine va in Tel/`POR_CONFIRMAR` e richiede il click «A Cocina». Oppure intende «il modal Nuevo Pedido è lento a rispondere mentre compilo»? → è la catena di preview/geocode.

---

## 5. AZIONI CONSIGLIATE

### Immediate operative (in servizio, ZERO modifiche al codice)
1. **Confermare con l'operatore quale dei due** intende: (a) il modal lento a compilare, o (b) l'ordine non appare subito in Cocina dopo Confirmar. Cambia completamente la diagnosi.
2. Se è (b): ricordare il flusso — l'ordine creato sta in **Tel / POR_CONFIRMAR** finché non si preme **«A Cocina»**. Non è un bug né un lag.
3. Per ordini RITIRO senza indirizzo, evitare di triggerare geocode (già così): il ritardo grosso è solo sui DOMICILIO con indirizzo nuovo (cache miss).
4. Nessun riavvio/deploy necessario: sistema sano.

### Post-servizio tecniche (NON ora, da pianificare separatamente)
1. **Cache bundle immutable:** servire `/static/*` con `cache-control: public, max-age=31536000, immutable` (header Netlify/`_headers`). Elimina la rivalidazione ad ogni load. Asset già hashati → sicuro.
2. **Ridurre/parallelizzare le preview del modal Nuevo Pedido:** oggi più round-trip sequenziali browser→Netlify→Railway→geocode. Valutare: (a) un solo endpoint aggregato preview, (b) `Promise.all` dove indipendenti, (c) debounce/cancel su typing, (d) cache geocode lato edificio (già esiste `geo_cache` — verificare hit-rate).
3. **Alleggerire `getStorico`:** 572 KB scaricati e aggregati client-side ogni apertura Economia. Spostare l'aggregazione su un endpoint Railway o paginare.
4. **Tappare il geocode lento:** se Google `resolveAddress` è il collo di bottiglia sui DOMICILIO nuovi, misurare con `delivery_logs` (tabella presente) la latenza reale per call e cachare più aggressivamente.
5. **Monitor esterno** su `/health` (già in backlog) per distinguere lentezza percepita da degrado reale.

---

## 6. SAFETY — confermato

- ✅ Zero write su DB (solo SELECT/HEAD read-only via anon key).
- ✅ Zero deploy / rollback / commit / push.
- ✅ Zero state change (nessun Confirmar, nessun «A Cocina», nessun updateEstado).
- ✅ Zero ordini test creati.
- ✅ Zero cleanup.
- ✅ `ORDINI_2026-05-23.md` non aperto né toccato.
- ℹ️ Unica scrittura su filesystem: **questo report** (nuovo file, coerente con gli altri `*_REPORT.md` del repo).

---

## NOTA — se servisse un fix (CRITICO non riscontrato)

Non è stato trovato nulla di CRITICO, quindi **nessuna patch proposta**. Gli interventi al §5 «post-servizio» vanno fatti **fuori servizio**, sul backend reale `/Users/bigart/Downloads/ladieci-bot` (no cerotti frontend) e seguendo la regola deploy prod (solo da `main` con OK esplicito).
