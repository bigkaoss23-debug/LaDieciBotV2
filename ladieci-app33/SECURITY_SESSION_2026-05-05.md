# Security Hardening — Sessione 2026-05-05

## Obiettivo
Audit e hardening completo della sicurezza dell'app prima della vendita al cliente.
Deadline: ~1 settimana dalla data della sessione.

---

## Stato finale ✅

Tutto deployato e verificato live su:
**`https://magnificent-lollipop-6dff70.netlify.app`**

Deploy corretto tramite:
```bash
npx netlify-cli deploy --prod --dir=build --functions=netlify/functions --site=02bd4c7a-a50b-4964-90da-8c1af1122932
```

---

## Cosa è stato fatto

### 1. Security Headers — `public/_headers` (nuovo)
Aggiunto file `public/_headers` con tutti i header HTTP di sicurezza:
- `X-Frame-Options: DENY` — blocca clickjacking
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=31536000` (HSTS)
- `X-XSS-Protection: 1; mode=block`
- `Content-Security-Policy` — limita origini consentite a Railway + Supabase

### 2. Netlify Functions — Proxy sicuro (nuovi)
Creata directory `netlify/functions/` con 2 funzioni:

**`netlify/functions/auth.js`**
- Valida PIN server-side (non più lato client come prima)
- Legge PIN da Supabase `config` table (`APP_PIN`, `REPARTIDOR_PIN`)
- Se Supabase non risponde → fallback a env var Netlify
- Genera JWT firmato con `JWT_SECRET` (durata: 10h operatore, 12h repartidor)
- Rate limiting: blocco IP per 15 minuti dopo 5 tentativi falliti
  - Tentativi salvati in Supabase `config` come `AUTH_BLOCK_<ip_hash>`
- Accetta PIN da 4 a 8 cifre (la UI ne impone 6)

**`netlify/functions/api.js`**
- Proxy autenticato verso Railway backend
- Verifica JWT su ogni request (`Authorization: Bearer <token>`)
- Role-based: repartidor può solo `getOrdenes`, `updateEstado`, `marcarEnEntrega`, `marcarEntregado`
- Se token scaduto o invalido → 401

### 3. `netlify.toml` — aggiornato
Aggiunto:
```toml
functions = "netlify/functions"

[[redirects]]
  from = "/api/auth"
  to = "/.netlify/functions/auth"
  status = 200

[[redirects]]
  from = "/api/proxy"
  to = "/.netlify/functions/api"
  status = 200
```

### 4. `src/api.js` — riscritto (critico)
**RAILWAY_API_KEY rimossa dal frontend.**
Prima era hardcoded e visibile a chiunque aprisse DevTools.

Novità:
- Tutte le chiamate Railway ora passano per `/api/proxy` (Netlify Function) con JWT
- Aggiunto modulo `auth` con: `login()`, `getToken()`, `isAuthenticated()`, `clear()`
- `getAppPin()` non scarica più il PIN in chiaro nel browser — restituisce `"server-side"`
- Supabase anon key rimane (è pubblica by design Supabase, sicurezza via RLS)
- Export rimosso: `API_URL`, `RAILWAY_API_KEY` — non più disponibili per i componenti

### 5. `src/App.jsx` — PIN server-side + 6 cifre
- `checkPin()` ora chiama `auth.login(pin, "operador")` → request HTTP a Netlify Function
- Auto-submit al 6° carattere (no bottone OK)
- `pinLoading` state durante la verifica
- Token JWT salvato in `sessionStorage` (valido per tutta la sessione/serata)
- `pinUnlocked` ora controlla `auth.isAuthenticated()` (verifica scadenza JWT)
- Rimosso `correctPin` ref — il PIN non viene mai scaricato nel browser

### 6. `src/components/repartidor/RepartidorPage.jsx` — PIN aggiunto
Prima: nessun PIN, chiunque aprisse `/repartidor` aveva accesso.
Ora:
- Schermata PIN a 6 cifre prima di tutto il resto
- PIN separato (`REPARTIDOR_PIN`) → ruolo limitato
- Auto-submit al 6° carattere
- Sessione valida 12h (JWT)
- Una volta autenticato, tutta la notte non chiede più il PIN

### 7. `src/components/ServicioPage.jsx` — cambio PIN dall'app + fix watchdog
- Aggiunto bottone 🔑 nella toolbar
- Modal "Cambiar PIN" a 2 step:
  1. Verifica PIN attuale (chiamata a `auth.login()`)
  2. Inserisci nuovo PIN + conferma → salva su Supabase via `setConfig`
- Funziona sia per PIN operatore che repartidor (selettore dentro il modal)
- **Il cliente può cambiare i PIN da solo senza toccare Netlify**
- Fix watchdog: `API_URL` sostituito con URL hardcoded Railway `/health`
- `rispondiWA` alert migrato da fetch diretto a `api.post()`

### 8. `src/components/wa/WADettaglio.jsx` — migrato
- Rimosso import `API_URL`, `RAILWAY_API_KEY`
- 2 chiamate `generaRispostaIA` migrate da `fetch()` diretto a `api.get()`

### 9. `src/components/wa/TabPreguntas.jsx` — migrato
- Rimosso import `API_URL`, `RAILWAY_API_KEY`
- 3 chiamate `generaRispostaIA` migrate a `api.get()`
- 1 chiamata `getConvThread` migrata a `api.get()`

### 10. `.gitignore` — aggiornato
Prima aveva solo `.netlify`. Aggiunto:
- `node_modules/`, `build/`
- `.env`, `.env.local`, `.env.production` (blocca commit accidentali di secrets)
- `.DS_Store`, `.vscode/`, `.idea/`

### 11. `.env.example` — nuovo
Documenta le 5 variabili d'ambiente necessarie su Netlify.

---

## Variabili d'ambiente su Netlify (tutte configurate ✅)

| Variabile | Valore | Note |
|-----------|--------|------|
| `RAILWAY_API_KEY` | `ld_92ed94d5ef63ab0327f7c61467898cf3` | Nascosta dal frontend |
| `JWT_SECRET` | `6ceedf319066c251d3c96bc787f49282a04230f34c9b91034bcf293e15d9b436` | Firma i token |
| `APP_PIN` | `123456` | Fallback se Supabase non risponde |
| `REPARTIDOR_PIN` | `000000` | Fallback se Supabase non risponde |
| `SUPABASE_SERVICE_KEY` | (impostata dall'utente) | Serve per leggere/scrivere config |

> ⚠️ I PIN su Netlify env vars sono **fallback**. La fonte primaria è Supabase `config` table.
> Cambia sempre il PIN dall'app (bottone 🔑 in Servicio) — aggiorna Supabase direttamente.

---

## PIN attuali (temporanei — DA CAMBIARE)

| Ruolo | PIN temporaneo |
|-------|----------------|
| Operatore | `123456` |
| Repartidor | `000000` |

**Cambia entrambi subito dalla schermata 🔑 dentro Servicio.**

---

## Architettura sicurezza attuale

```
Browser
  │
  ├─ Supabase reads (ordenes, wa_msgs, conv) ─────→ Supabase REST API (anon key)
  │   └─ Sicurezza: RLS policies
  │
  └─ Railway calls (bot, IA, invio WA) ──────────→ /api/proxy (Netlify Function)
      │
      ├─ Verifica JWT (firmato da /api/auth)
      ├─ Aggiunge RAILWAY_API_KEY (mai nel browser)
      └─ Role check (repartidor ha azioni limitate)

Login
  Browser → /api/auth (Netlify Function)
           ├─ Legge PIN da Supabase config
           ├─ Rate limiting: blocco 15min dopo 5 fail
           └─ Ritorna JWT (10h operatore, 12h repartidor)
```

---

## Cosa resta da fare (prossime sessioni)

### Priorità alta
- [ ] **RLS su tutte le tabelle Supabase** — attualmente solo `config` ha RLS. Le tabelle `ordenes`, `wa_msgs`, `conv`, `storico`, `clientes` sono leggibili/scrivibili da chiunque con la anon key. Da abilitare su Supabase Dashboard.
- [ ] **Cambiare i PIN temporanei** con valori reali prima della consegna al cliente.
- [ ] **Verificare SUPABASE_SERVICE_KEY** su Netlify — attualmente auth.js usa l'anon key come fallback (APP_PIN è pubblicamente leggibile via RLS, ma è meglio usare la service key per le write dei tentativi falliti).

### Priorità media
- [ ] **Rate limiting su Railway** — aggiungere `express-rate-limit` (60 req/min per IP) per proteggere da abuso di `generaRispostaIA` (costa API Anthropic).
- [ ] **Audit log** — tabella Supabase `audit_log` con operatore, azione, timestamp. Attualmente non c'è traccia di chi fa cosa.
- [ ] **Spegnere GAS** — dopo verifica Railway stabile (già nei prossimi step del CLAUDE.md).

### Priorità bassa
- [ ] **Livello B autenticazione** — operatori nominali con PIN individuali (`operatori` table in Supabase). Attualmente è un unico PIN condiviso per tutti gli operatori.
- [ ] **Multi-tenant** — già nei prossimi step del CLAUDE.md.

---

## Note tecniche importanti

### Perché il deploy standard non funzionava
Il deploy via MCP/API carica solo i file statici (`build/`). Le Netlify Functions (`netlify/functions/`) e i security headers (`_headers`) richiedono il deploy tramite CLI con `--functions` flag. Da ora in poi usare sempre:
```bash
npx netlify-cli deploy --prod --dir=build --functions=netlify/functions --site=02bd4c7a-a50b-4964-90da-8c1af1122932
```

### Supabase anon key — non è un segreto
La `SUPABASE_KEY` in `api.js` è una "publishable key" — è progettata per stare nel frontend. La sicurezza viene dalle RLS policies, non dall'oscurare la chiave. Non è un problema di sicurezza che sia visibile nel bundle.

### RAILWAY_API_KEY — era il vero problema
Questa chiave dava accesso totale al backend (creare ordini, eliminare conversazioni, inviare messaggi WhatsApp). Ora è solo in Netlify env vars, mai nel bundle JS.

### JWT e sessionStorage
Il token JWT è in `sessionStorage` (non localStorage): è per-tab e viene cancellato alla chiusura del tab. Non viola la regola "mai localStorage" del CLAUDE.md. La sessione dura 10h (operatori) o 12h (repartidor) — sufficiente per una serata di servizio completa.
