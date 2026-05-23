# La Dieci Bot V2 — Netlify Functions Deploy Fix (incident 2026-05-23)

Incidente live: PIN operatore non funzionava in piena ora di servizio.
Root cause + fix + regola futura. Niente PIN, token o segreti in questo
documento.

---

## Sintomo

- Operatore in pizzeria digita PIN sull'app Netlify e riceve sempre
  "PIN incorrecto", anche con PIN corretto noto a lui.
- Frontend `App.jsx:checkPin` chiama `auth.login(pin, "operador")` che fa
  `POST /api/auth`. La risposta arriva ma non è il JSON atteso →
  `result.success=false` → badge errore PIN.

## Diagnosi rapida (read-only)

1. `config.APP_PIN` su Supabase: presente, formato corretto (6 cifre). ✅
2. Rate-limit `AUTH_BLOCK_*`: vuoto. ✅
3. RLS policy su `config`: permette lettura `APP_PIN` con anon key. ✅
4. **`curl -X POST https://magnificent-lollipop-6dff70.netlify.app/api/auth`**
   → restituisce HTML `<title>Page not found</title>` (404 Netlify standard).

→ La Netlify Function `auth.js` non è servita. Stesso per `/api/proxy`
(la function `api.js`).

## Root cause

Deploy CLI eseguiti il 23/05 per `DELIVERY-VIS-01` e `VERSION-01-FE` con
comando:

```
npx -y netlify-cli@latest deploy --prod \
  --dir=ladieci-app33/build \
  --site=02bd4c7a-a50b-4964-90da-8c1af1122932
```

Manca il flag `--functions=ladieci-app33/netlify/functions`. Risultato:
Netlify CLI pubblica SOLO la cartella `build/` come static deploy e la
sezione `functions` del deploy precedente viene di fatto azzerata. Le
Functions `auth.js` e `api.js` non sono più servite a `/api/auth` e
`/api/proxy`.

In `ladieci-app33/netlify.toml`:
```
[build]
  command = "npm run build"
  publish = "build"
  functions = "netlify/functions"
```
`netlify.toml` viene letto SOLO durante un build server-side (MCP, o
`netlify deploy` senza `--dir`). Quando si passa `--dir=build/`, il CLI
salta il build e non legge `functions` dal toml — bisogna passarlo
esplicito da CLI.

## Fix applicato

Re-deploy CLI con flag corretto:

```
npx -y netlify-cli@latest deploy --prod \
  --dir=ladieci-app33/build \
  --functions=ladieci-app33/netlify/functions \
  --site=02bd4c7a-a50b-4964-90da-8c1af1122932
```

Output CLI ha mostrato `Finished hashing 17 files and 2 functions`. Le 2
functions (`auth.js`, `api.js`) sono tornate live.

Verifica post-fix:
- `POST /api/auth` con PIN corretto → JSON `{token, role:"operador", expiresIn:"10h"}`. ✅
- `POST /api/auth` con PIN errato → JSON `{error:"PIN incorrecto", intentosRestantes:N}`. ✅
- Login operatore ripristinato in pieno servizio.

Deploy ID Netlify post-fix: `6a11e94208f97065b195843b`.

## Smoke obbligatorio post-deploy frontend Netlify (CLI o MCP)

Da oggi, un deploy Netlify frontend NON è considerato valido finché TUTTI
questi smoke non passano:

1. **App root HTTP 200**
   ```
   curl -sL -o /dev/null -w "%{http_code}" https://magnificent-lollipop-6dff70.netlify.app
   ```
   Deve restituire `200`.

2. **`/version.json` HTTP 200 con commit atteso**
   ```
   curl -s https://magnificent-lollipop-6dff70.netlify.app/version.json
   ```
   Deve restituire JSON con `commit` corrispondente al SHA del commit deployato.

3. **`POST /api/auth` con PIN reale** (gestito dall'operatore o variabile shell,
   **mai trascritto in alcun documento**)
   ```
   curl -s -X POST https://magnificent-lollipop-6dff70.netlify.app/api/auth \
     -H "Content-Type: application/json" \
     -d "{\"pin\":\"<PIN_OPERATORE>\",\"role\":\"operador\"}"
   ```
   Risposta attesa: JSON con `token`, `role`, `expiresIn`.
   Se ritorna HTML "Page not found" o stringa che inizia per `<!DOCTYPE` →
   **Functions mancanti, rollback immediato**.

4. **`POST /api/auth` con PIN palesemente errato**
   ```
   curl -s -X POST https://magnificent-lollipop-6dff70.netlify.app/api/auth \
     -H "Content-Type: application/json" \
     -d '{"pin":"999999","role":"operador"}'
   ```
   Risposta attesa: JSON con `error:"PIN incorrecto"` e `intentosRestantes:N`.
   Se ritorna HTML → idem, **rollback immediato**.

5. **Dashboard Netlify** → tab Deploys → click sul deploy nuovo → verificare
   che la riga "Functions" mostri **2 functions** (`auth`, `api`). Se mostra
   `0`, il deploy è incompleto.

## Rollback

Se uno qualsiasi degli smoke fallisce:

- **Veloce:** Netlify dashboard → Deploys → identificare l'ultimo deploy con
  Functions integre (es. ID precedente noto) → "Publish deploy". Tempo target
  < 2 min. Risolve immediatamente l'incidente PIN.
- **Permanente:** rideployare con il comando CLI corretto (vedi §"Fix
  applicato") o con MCP `deploy-site` quando funziona.

## Regola futura

1. **Mai usare** `netlify-cli deploy --prod --dir=ladieci-app33/build --site=...`
   senza `--functions=ladieci-app33/netlify/functions`. Sezione aggiornata
   in `LaDieciBotV2_RELEASE_PROTOCOL.md` §6.1 con il comando "vietato"
   esplicito.
2. **Preferire MCP** `deploy-site` quando disponibile — fa build server-side
   e legge `netlify.toml` automaticamente.
3. **Smoke `/api/auth` è obbligatorio** dopo ogni deploy Netlify, anche se
   il diff è "solo CSS" — perché il CLI può accidentalmente azzerare le
   Functions anche su deploy innocui.
4. **Mai scrivere PIN reali, token JWT, API key, segreti Supabase/Anthropic/
   Google/WhatsApp** in questo documento, nei commit, nei log, nei
   postmortem. Variabili ambientali sì, valori reali no.

## Impatto

- Servizio live disturbato ~X minuti tra deploy rotto e fix (orari precisi
  nel log Netlify dashboard del 23/05).
- Login PIN operatore non funzionante per quel periodo.
- Frontend root + assets statici intatti (l'app caricava, ma PIN gate
  bloccava).
- Backend Railway e DB Supabase intatti.
- Nessuna perdita di dati ordini.

## Riferimenti

- `LaDieciBotV2_RELEASE_PROTOCOL.md` §6.1 — sezione aggiornata.
- `ladieci-app33/netlify.toml` — definisce `functions = "netlify/functions"`
  per il path MCP/build server-side.
- `ladieci-app33/netlify/functions/auth.js` — Netlify Function PIN gate.
- `ladieci-app33/netlify/functions/api.js` — Netlify Function proxy
  autenticato verso Railway.
- Deploy ID fix: `6a11e94208f97065b195843b`.

STOP DOC.
