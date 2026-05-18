# La Dieci Bot V2 — Contesto operativo

## Regola madre

- La live resta intoccata.
- La V2 e' un clone separato.
- Ogni modifica va fatta solo sulla repo V2.

## Percorsi

- Progetto locale: `/Users/bigart/Downloads/LaDieciBotV2-github`
- Frontend: `ladieci-app33`
- Backend: `ladieci-bot`

## Avvio locale frontend

```bash
npx netlify dev --port 3010 --target-port 3002 --command "env PORT=3002 npm start"
```

Nota: se dopo `npm run build` Netlify Dev serve `/static/js/bundle.js` come HTML, eliminare la cartella generata `build/` e riavviare Netlify Dev.

## URL locale

```text
http://localhost:3010
```

## PIN dev locale

```text
123456
```

## Auth dev

- Il bypass PIN e' solo dev in `ladieci-app33/netlify/functions/auth.js`.
- Richiede `DEV_AUTH_BYPASS=true`.
- Il file `.env` locale contiene `DEV_AUTH_BYPASS`, `APP_PIN`, `JWT_SECRET`, `RAILWAY_API_KEY`.
- `.env` non va mai committato.
- `RAILWAY_API_KEY` deve corrispondere al `DASHBOARD_API_KEY` configurato nel backend Railway.

## Core delivery creato

- `ladieci-app33/src/core/delivery/geo.js`
- `ladieci-app33/src/core/delivery/scheduling.js`
- `ladieci-app33/src/core/delivery/zonesData.js`
- `ladieci-app33/src/core/delivery/index.js`
- `ladieci-app33/src/zones.js` resta facciata compatibile per UI e import esistenti.

## Core orders creato

- `ladieci-app33/src/core/orders/stateMachine.js`
- `ladieci-app33/src/core/orders/transitionIntents.js`
- `ladieci-app33/src/core/orders/creationIntents.js`
- `ladieci-app33/src/core/orders/telemetry.js`
- `ladieci-app33/src/core/orders/index.js`

## Transition intents integrati

- `POR_CONFIRMAR -> EN_COCINA`
- `EN_COCINA -> LISTO`
- `LISTO -> EN_ENTREGA`
- `EN_ENTREGA -> RETIRADO`

## Creation intents integrati

- Creazione operatore/manuale/banco/telefono.
- Creazione WhatsApp senza `ordenRef` direttamente in `EN_COCINA`.

## Telemetry

La telemetry dev e' esposta in browser su:

```js
window.__ORDER_TELEMETRY__
```

Espone:

- `events`
- `summary()`
- `clear()`
- `countsByType`
- `countsByComponent`
- `countsByAction`
- `countsByTransition`
- `invalidCount`
- `rollbackCount`
- `legacyBypassCount`
- `creationBySource`

## Stato validato telemetry base

Test manuale delivery completato con ordine `#009`.

Risultato validato:

- `order-creation: 1`
- `transition: 4`
- `legacy-bypass: 1`
- `POR_CONFIRMAR->EN_COCINA: 1`
- `EN_COCINA->LISTO: 1`
- `LISTO->EN_ENTREGA: 1`
- `EN_ENTREGA->RETIRADO: 1`
- `invalidCount: 0`
- `rollbackCount: 0`
- `legacyBypassCount: 1`
- `total: 6`

Conclusione:

```text
Core orders + delivery telemetry base: VALIDATED
```

## Fix importanti fatti

- Rimosso doppio `RETIRADO` da `TabListos`.
- Rimosso doppio `LISTO` da `TabCocina`.
- Rimosso rumore pagamento da `onCambiaPago`.
- Fixato legacy-bypass delivery: `logLegacyBypass` non ha piu' `from/to` top-level; from/to legacy sono in `metadata`.

## Commit recenti importanti

- `d55023e dev auth: allow local operator pin bypass`
- `8c56175 fix duplicate retirado transition telemetry`
- `f123c29 fix duplicate listo transition telemetry`
- `2fbdc4e fix payment update telemetry noise`
- `8a0778b fix delivery legacy telemetry transition count`

## Regole di lavoro con Codex

Ogni prompt deve specificare:

- cosa fare
- cosa non toccare
- file ammessi
- verifiche richieste
- commit richiesto

Regole:

- micro-step
- test prima di commit
- niente refactor massivi
- non toccare produzione
- non committare `.env`
- Codex esegue codice/test/commit
- ChatGPT guida architettura e decisioni

## Prossimi step possibili

- Creare matrice test stati ordini.
- Verificare flusso WhatsApp creation intent.
- Verificare ordine manuale/banco/telefono.
- Consolidare telemetry dev panel o export leggibile.
- Solo dopo pensare a UI/debug dashboard.
