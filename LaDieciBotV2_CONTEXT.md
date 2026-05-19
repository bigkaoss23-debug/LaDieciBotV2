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

## Core delivery stabile

- `ladieci-app33/src/core/delivery/geo.js`
- `ladieci-app33/src/core/delivery/scheduling.js`
- `ladieci-app33/src/core/delivery/zonesData.js`
- `ladieci-app33/src/core/delivery/index.js`
- `ladieci-app33/src/zones.js` resta facciata compatibile per UI e import esistenti.

## Guardia fine servizio delivery

Commit validato:

- `0d9bef9 fix guard delivery suggestions after service end`

Dettagli:

- Modificato solo `ladieci-app33/src/core/delivery/scheduling.js`.
- `proposeForNewOrder()` ora supporta `latestDeliveryMinute`.
- Default: `23 * 60`.
- Se la proposta delivery supera fine servizio, ritorna:
  - `ok: false`
  - `outOfServiceWindow: true`
  - `consegnaPropostaH: null`
  - `motivo: "Delivery non disponibile oltre le 23:00"`
- Supporta limite custom via `options`.
- Harness passato:
  - proposta entro le 23:00 valida
  - proposta oltre le 23:00 bloccata
  - default senza opzione OK
  - limite custom OK
- `npm run build` passato.
- Nessuna UI modificata.
- Nessun backend modificato.
- Pickup non toccato.
- `.env` non toccato.

## Warning UI fine servizio delivery validato

Commit validato:

- `060bfeb fix remove duplicate delivery force button`

Test manuale:

- Eseguito su `http://localhost:3010`.
- Flusso: `Nuevo Pedido` -> `Entrega a domicilio`.
- Indirizzo: `C. Delfin, 45-47`.
- Ora delivery: `23:30`.
- Zona rilevata: `Q2 Buenavista`.
- Warning visibile:
  - `Delivery no disponible después de las 23:00. Puedes forzarlo solo como excepción especial.`
- Testo secondario visibile:
  - `No se aplicará ninguna sugerencia automática fuera del horario normal.`
- `Aplicar sugerencia` non appare.
- Resta un solo bottone:
  - `Forzar como excepción`
- La duplicazione del bottone e' risolta.
- Nessun nuovo codice da modificare.

Nota UX futura: gli alert operativi nel modal sono ancora da riorganizzare in una zona unica, perche' alcuni warning possono apparire in posizioni visivamente confuse.

## Core orders stabile

- `ladieci-app33/src/core/orders/stateMachine.js`
- `ladieci-app33/src/core/orders/transitionIntents.js`
- `ladieci-app33/src/core/orders/creationIntents.js`
- `ladieci-app33/src/core/orders/telemetry.js`
- `ladieci-app33/src/core/orders/index.js`

## Core cucina creato

File:

- `ladieci-app33/src/core/kitchen/capacity.js`

Funzioni pure:

- `slot5()`
- `slot10()`
- `countPizzas()`
- `countPizzasForKitchenWindow()`
- `getKitchenCapacityStatus()`
- `suggestNextAvailableKitchenSlot()`

Regola operativa:

- Non calcola il tempo singolo pizza-per-pizza.
- Modella il throughput reale forno/pizzaiolo.
- Il collo di bottiglia e' il forno.
- Capacita' effettiva: 4 pizze ogni 5 minuti.
- Default: 8 pizze ogni 10 minuti.
- Se lo slot e' libero/non sovraccarico, `suggestedHora` torna `null`.
- Se lo slot e' sovraccarico, suggerisce il prossimo slot disponibile.

Validazione fatta:

- 8 pizze alle 20:30 su finestra 10 min: non sovraccarico.
- 10 pizze alle 20:30 su finestra 10 min: sovraccarico, suggerisce slot dopo.
- 4 pizze su finestra 5 min: non sovraccarico.
- 5 pizze su finestra 5 min: sovraccarico.
- `npm run build` passato.

Nota: per ora il core cucina e' puro e non collegato a UI, backend, WhatsApp o DB. Il prossimo step possibile sara' collegarlo a `NuevoPedidoModal`, ma non e' ancora da fare.

## Feedback cucina pickup validato

Commit validato:

- `c82539d feat show pickup kitchen capacity feedback`

Test visuale locale:

- Netlify Dev su `http://localhost:3010`.
- PIN `123456` OK.
- `Nuevo Pedido` pickup/ritiro mostra il feedback vicino all'orario.
- Stati visti:
  - `Horno ok: 0/8 pizzas en 10 min`
  - `Horno ok: 1/8 pizzas en 10 min`
  - `Horno sobrecargado: 9/8 pizzas en 10 min. Sugerido: 10:10`
- Aggiungendo pizze in bozza il numero aumenta live.
- Delivery/domicilio nasconde il feedback pickup.
- Popup/logica delivery resta invariata.
- Salvataggio pickup OK con ordine test `#001`.
- Nessun blocco su slot sovraccarico.
- Nessun React error overlay.
- Auth/API/create order `200`.
- Git status pulito, solo ignored `.env`, `.netlify`, `node_modules`.
- Nota ambiente: `build/` ignorata rimossa perche' Netlify Dev serviva HTML al posto di bundle JS.
- Rischio residuo: verificare da UI reale che cambiando manualmente l'orario il feedback si ricalcoli correttamente.

## Cleanup layout feedback pickup

Commit validato:

- `3b7fa3f fix move pickup capacity feedback below address`

Dettagli:

- Modificato solo `ladieci-app33/src/components/NuevoPedidoModal.jsx`.
- Spostato il render di `pickupKitchenStatus`.
- Nessuna modifica a testo, condizioni, calcoli o stile interno.
- Nuovo ordine visivo:
  - `Nome / telefono / ora` -> `indirizzo/zona` -> `feedback forno`
- `npm run build` passato.
- Test visuale locale su `http://localhost:3010` passato.
- Il feedback `Horno ok: 0/8 pizzas en 10 min` ora appare sotto la riga indirizzo.
- Delivery/popup non toccati.
- Nessun React error overlay.
- `.env` non toccato.

Nota: questo e' un primo micro-step verso una futura area unica `info operative / alert`.

## Area Info operativa pickup

Commit validato:

- `008782b feat add operational info area for pickup feedback`

Dettagli:

- Modificato solo `ladieci-app33/src/components/NuevoPedidoModal.jsx`.
- Aggiunto wrapper discreto `Info operativa` attorno al feedback forno pickup/ritiro.
- Testi e logica invariati:
  - `Horno ok: X/8 pizzas en 10 min`
  - `Horno sobrecargado: X/8 pizzas en 10 min. Sugerido: HH:mm`
- Nuovo ordine visivo confermato:
  - `cliente/telefono/ora` -> `indirizzo/zona` -> `Info operativa`
- Delivery popup non toccato.
- `Aplicar sugerencia` non toccato.
- `Forzar como excepción` non toccato.
- Core/backend/telemetry non toccati.
- `.env` non toccato.
- `npm run build` passato.
- Test visuale locale su `http://localhost:3010` passato.
- Nessun React error overlay.

Nota: questo e' il primo step concreto verso una futura area unica degli alert operativi. Per ora contiene solo feedback forno pickup/ritiro; delivery resta nel popup.

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
- `export()`
- `countsByType`
- `countsByComponent`
- `countsByAction`
- `countsByTransition`
- `invalidCount`
- `rollbackCount`
- `legacyBypassCount`
- `creationBySource`
- `creationByCanal`

`export()` restituisce un oggetto copiabile con `exportedAt`, `summary` ed `events`. La `summary` usa `summary()` e `events` e' una copia snapshot, non un riferimento vivo all'array interno. Serve solo a rendere piu' ordinati i test manuali da console: non cambia runtime operativo, conteggi, eventi, backend, UI o DB.

## Stato validato

La base core orders + delivery telemetry e' validata.

Test validati:

- Test 1 pickup completo: `VALIDATED` (`#014`).
- Test 2 delivery completo: `VALIDATED` (`#009`).
- Test 3 creazione manual/operator: `VALIDATED`.
- Test 4 telefono: `VALIDATED` con nota, oggi tracciato come `MANUAL`.
- Test 5 banco/barra: `VALIDATED`.
- Test 7 cambio pagamento: `VALIDATED` (`payment-update`).
- WhatsApp natural flow: `VALIDATED`.
- WhatsApp operator sends to kitchen: `VALIDATED`.
- Test 8 transizione non valida: `VALIDATED in isolation`.

Conclusione:

```text
Core orders + delivery telemetry base: VALIDATED
```

## WhatsApp: chiarimento operativo

- "Confermato al cliente" non significa "mandato in cucina".
- Il bot puo' preparare/completare il pedido e il backend puo' creare l'ordine WA in `POR_CONFIRMAR`.
- Solo l'operatore manda davvero in cucina tramite `POR_CONFIRMAR -> EN_COCINA`.
- `EN_COCINA` resta lo stato unico della cucina.
- Nel flusso naturale testato, il backend ha creato l'ordine `#022` in `POR_CONFIRMAR`; la UI ha poi validato `waConfirm` come `POR_CONFIRMAR -> EN_COCINA`.

## Fix importanti fatti

- Rimosso doppio `RETIRADO` da `TabListos`.
- Rimosso doppio `LISTO` da `TabCocina`.
- I cambi pagamento sono registrati come `payment-update`, non come transition o legacy-bypass.
- Fixato legacy-bypass delivery: `logLegacyBypass` non ha piu' `from/to` top-level; from/to legacy sono in `metadata`.
- Aggiunto `creationByCanal` al summary telemetry.
- La transizione invalida `POR_CONFIRMAR -> RETIRADO` viene intercettata come `invalid-transition`.

## Stato non bloccante

- Test 6 fallback WhatsApp senza `ordenRef` resta secondario/non bloccante: non rappresenta il flusso naturale del bot.
- Il telefono resta tracciato come `MANUAL` per ora.
- Non serve un test UI reale per la transizione invalida adesso: il core e' gia' validato in isolation senza UI/API/DB.

## Commit recenti importanti

- `d55023e dev auth: allow local operator pin bypass`
- `8c56175 fix duplicate retirado transition telemetry`
- `f123c29 fix duplicate listo transition telemetry`
- `2fbdc4e fix payment update telemetry noise`
- `8a0778b fix delivery legacy telemetry transition count`
- `c5cd432 docs validate whatsapp natural kitchen transition`
- `bde0085 docs validate invalid transition test`
- `eeaefde feat add telemetry export helper`
- `570336e feat add kitchen capacity core`
- `0d9bef9 fix guard delivery suggestions after service end`
- `060bfeb fix remove duplicate delivery force button`
- `3b7fa3f fix move pickup capacity feedback below address`
- `008782b feat add operational info area for pickup feedback`

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

- Aggiornare la matrice solo quando vengono validati nuovi micro-test.
- Consolidare, se serve, una lettura/export dev della telemetry senza cambiare runtime operativo.
- Valutare solo piu' avanti una UI/debug dashboard.
- Continuare con micro-step mirati, niente refactor massivi.
