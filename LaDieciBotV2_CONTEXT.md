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

## Ready operativo delivery

Commit validato:

- `e90cee5 feat add operational ready helper`

Dettagli:

- Modificato solo `ladieci-app33/src/core/delivery/scheduling.js`.
- Aggiunto ed esportato helper:
  - `getOperationalReadyMinute(order, options = {}, deps = {})`
- Scopo: calcolare il minuto operativo ready/dispatch senza modificare `hora` cliente.
- `hora` resta l'orario promesso al cliente.
- `ui_offset_min` rappresenta lo snooze/ritardo operativo interno.
- Priorita' calcolo:
  1. `forno_out + ui_offset_min`
  2. fallback `hora - tempoAndata + ui_offset_min`
  3. se `ui_offset_min` manca, vale `0`
- Harness passato:
  - `forno_out 20:20 + ui_offset 5` -> `20:25`
  - fallback `hora 20:30 - tempoAndata 10 + ui_offset 5` -> `20:25`
  - missing `ui_offset_min` defaults to `0`
  - `hora` originale non modificata
- `npm run build` passato.
- Helper creato ed esportato inizialmente senza collegarlo alla simulazione.
- `.env` non toccato.

## Ready operativo nel rider scheduling

Commit validato:

- `5599cc4 feat apply operational ready in driver schedule`

Dettagli:

- Modificato solo `ladieci-app33/src/core/delivery/scheduling.js`.
- `simulateDriverSchedule()` ora usa `getOperationalReadyMinute()`.
- `ui_offset_min` ora influenza disponibilita' rider e suggerimenti successivi.
- `hora` cliente NON viene modificata.
- Aggiunto concetto `operationalReadyMin`.
- La partenza rider ora rispetta tre vincoli:
  - driver libero
  - partenza teorica `hora - tempoAndata`
  - operational ready time
- Se non c'e' offset, comportamento invariato.
- Se c'e' `ui_offset_min`, la partenza operativa si sposta avanti.
- Se c'e' `forno_out`, ha priorita' nel calcolo ready.
- Fallback: `hora - tempoAndata + ui_offset_min`.

Harness passato:

- no offset: ready/partenza invariati
- no offset: consegna resta orario promesso
- offset `+5`: ready e partenza shiftano da `20:20` a `20:25`
- offset `+5`: consegna operativa shiftata a `20:35` mentre `hora` resta `20:30`
- `forno_out` ha priorita'
- proposta successiva vede rider disponibile piu' tardi
- suggested hour validato a `20:55`

Build:

- `npm run build` passato.

Nota operativa: questo collega lo snooze/calibrazione cucina al core rider scheduling. Serve a evitare che il sistema proponga delivery successivi troppo ottimisti quando la cucina ha spostato avanti l'uscita operativa.

## Validazione manuale ready operativo rider

Commit validato:

- `5599cc4 feat apply operational ready in driver schedule`

Test manuale completato:

- Ordine delivery test: `#002`
- Stato: `EN_COCINA`
- Zona: `Q2`
- `hora`: `21:00`
- `forno_out`: `20:50`
- `ui_offset_min` iniziale: `0`

Risultato in `Cocina`:

- Prima del click `+5`, la card mostrava orario operativo `20:50`.
- Dopo click `+5`, la card mostrava `20:55`.
- Bottone `+5` attivo e reset `x` visibile.
- Richiesta `POST /api/proxy` con risposta `200`.
- Dopo refresh, `ui_offset_min: 5` persisteva e la card restava su `20:55`.
- `hora` cliente restava `21:00`.

Verifica scheduling rider:

- Delivery B con cliente salvato `STRESS_A_Q1`, zona `Q1`, ora richiesta `21:00`.
- Con A offset `0`: popup `Driver en Q2 21:00 · vuelve ~21:13`, suggerenza `21:20`.
- Con A offset `+5`: popup `Driver en Q2 21:00 · vuelve ~21:18`, suggerenza `21:25`.

Conclusione:

- `simulateDriverSchedule()` considera correttamente `ui_offset_min`.
- Il suggerimento rider diventa piu' prudente di 5 minuti.
- `hora` cliente non viene modificata.
- Nessun React overlay.
- Nessun errore console bloccante.
- API/server `POST /api/proxy` `200`.
- Git status pulito sui file tracciati.
- Netlify Dev fermato dopo il test.

## Warning limite snooze operativo

Commit validato:

- `ff1c1c4 feat show snooze max offset warning`

Dettagli:

- Modificato solo `ladieci-app33/src/components/ui/SnoozeButton.jsx`.
- Quando `current >= 20`, ora appare un messaggio persistente:
  - `Máximo +20 min. Usa × para reiniciar.`
- Il messaggio chiarisce all'operatore che il limite massimo dello snooze operativo e' raggiunto.
- Il limite massimo `20` esisteva gia'.
- Il click oltre `+20` era gia' bloccato e lampeggiava rosso, ma mancava un messaggio visibile stabile.
- `SnoozeButton` e' condiviso da `TabCocina` e `PanelCocina`, quindi il warning vale sia per cucina normale sia per fullscreen/panel.
- Non sono stati cambiati API, backend, scheduling, `uiOffset.js`, reset `x`, parent components o `.env`.
- `npm run build` passato con solo warning Node/react-scripts gia' noto.
- Git status pulito sui file tracciati.

Nota locale: dopo un falso allarme in cui `+5` sembrava non aggiornare l'orario, il problema e' stato ricondotto all'ambiente/proxy locale. Con Netlify Dev e `/api/proxy` correttamente attivi, `SnoozeButton` funziona: cliccando `+5`, l'orario operativo avanza di 5 minuti e `ui_offset_min` viene applicato.

## Header servizio specchiata: Horno e Reparto

Commit validati:

- `2919a55 feat prepare service header status layout`
- `85852e1 fix prioritize tablet service header layout`
- `41ef0cd fix spanish horno label in service header`
- `1ac3fc1 feat show reparto load in service header`
- `d31098b fix mirror horno reparto header layout`

Contesto:

- La header servizio usa layout specchiato:
  - `🔥 Horno ...` -> barra Horno -> `live · BASIC` -> barra Reparto -> `🛵 Reparto ...`
- Target UX principale: iPad/tablet e desktop.
- Telefono/viewport stretto e' solo fallback compatto.
- Non bisogna sacrificare leggibilita' iPad per mobile stretto.

Logica Reparto:

- `repartoOffsetMax` viene calcolato localmente in `ladieci-app33/src/components/ServicioPage.jsx`.
- Usa il massimo `ui_offset_min` tra ordini `DOMICILIO` attivi.
- Esclude stati terminali tramite helper esistente `isTerminalState`.
- Stati terminali esclusi: `RETIRADO`, `COMPLETATO`, `CHIUSO_FORZATO`.
- Ordini non-delivery, tipo `RITIRO`, non influenzano la barra.

Valori UI Reparto:

- `0` / nessun offset -> `🛵 Reparto OK`
- `5` -> `🛵 Reparto +5 min`
- `10` -> `🛵 Reparto +10 min`
- `15` -> `🛵 Reparto +15 min`
- `20` -> `🛵 Reparto +20 min`

Validazione Reparto:

- `Reparto OK`, `+5`, `+10`, `+15`, `+20` mostrati correttamente.
- Con piu' delivery attivi, mostra il massimo `ui_offset_min`.
- Ordini terminali non influenzano Reparto.
- Ordini non-delivery tipo `RITIRO` non influenzano Reparto.
- Layout OK con `Reparto +20 min`.

Validazione Horno:

- Basso carico OK:
  - `Horno 0% Libre`
  - barra quasi vuota
  - testo visibile
- Medio/alto carico OK:
  - `Horno 75% Cargado` con 30 pizze attive
  - `Horno 100% SATURO` con 40 pizze attive
- Cambio label OK:
  - visti `Libre`, `Cargado`, `SATURO`
- Stati terminali OK:
  - ordini `RETIRADO`, anche con molte pizze, non lasciano Horno falsamente carico
- Offset Reparto non influenza Horno:
  - `ui_offset_min +20` cambia Reparto, ma non cambia percentuale Horno
- Horno + Reparto insieme OK:
  - `Horno 100% SATURO` + `Reparto +20 min` convivono
  - `live · BASIC` resta visibile

Problema minore accettato:

- Su viewport stretto del browser in-app, `SATURO` puo' essere leggermente ellissato come `SATU...`.
- La riga non si rompe.
- Per ora e' accettato perche' telefono/viewport stretto e' fallback.

Controlli tecnici:

- Nessun React error overlay.
- Nessun errore console bloccante.
- API OK.
- Ordini test eliminati.
- Git pulito sui file tracciati.
- `.env` non toccato.

## Entregas: semantica delivery/reparto

Commit validato:

- `2be997b feat align entregas with delivery semantic states`
- `856de02 fix clarify operator salida action`
- `8873c40 fix confirm operator entregado action`

Flusso operativo:

```text
POR_CONFIRMAR -> EN_COCINA -> LISTO -> EN_ENTREGA -> RETIRADO
```

Semantica:

- `POR_CONFIRMAR` = da confermare.
- `EN_COCINA` = cucina sta lavorando.
- `LISTO + DOMICILIO` = ordine pronto, in attesa del repartidor.
- `EN_ENTREGA + DOMICILIO` = repartidor/en camino.
- `RETIRADO` = ciclo chiuso / consegnato.

Nota UI:

- L'app deve restare in spagnolo.
- Non introdurre label italiane nella UI.
- Termini corretti usati: `Entregado`, `Registrar salida`, `Reparto`, `Horno`.

Modifiche introdotte:

- Aggiunti/exportati helper semantici delivery:
  - `isWaitingDriverState(order)`
  - `isDriverOnTheWayState(order)`
  - `isDeliveryActiveState(order)`
- `TabEntregas` ora mostra solo:
  - `DOMICILIO + LISTO`
  - `DOMICILIO + EN_ENTREGA`
- `DOMICILIO + EN_COCINA` non appare piu' in `Entregas`.
- Badge `Entregas` in `ServicioPage` usa la stessa semantica della lista visibile.
- `RITIRO + LISTO` non appare in `Entregas`.
- `RETIRADO` non appare nella lista attiva, ma resta nel riepilogo `Entregados esta noche`.
- Il tab Entregas resta anche pannello operatore di supervisione/override.
- Se il repartidor dimentica di registrare la salida o ha problemi tecnici, l'operatore puo' registrarla manualmente.
- In `TabEntregas.jsx`, il bottone visibile e' stato cambiato:
  - da `⚠️ Salgo`
  - a `⚠️ Registrar salida`
- Title aggiornato:
  - `Registrar manualmente la salida del repartidor`
- `✓ Entregado` e' un'azione terminale operatore: porta l'ordine a `RETIRADO` e puo' chiudere il giro se e' l'ultimo ordine.
- Per evitare click accidentali, il click su `✓ Entregado` passa prima da confirm nativo:
  - `¿Confirmar entrega? Esta acción cerrará el pedido como entregado.`
- Se il confirm torna `false`, il codice fa `return` prima di chiamare `onForzaEntregado`.
- Se conferma, comportamento invariato.
- Nessuna logica, API, backend o transizione cambiata.

Validazione:

- `DOMICILIO + EN_COCINA`: OK, non appare in Entregas; resta contato in Cocina.
- `DOMICILIO + LISTO`: OK, appare in Entregas, conta nel badge, bottone `🛵` presente.
- `DOMICILIO + EN_ENTREGA`: OK, appare in Entregas, conta nel badge, bottoni `⚠️ Registrar salida` se manca salida e `✓ Entregado` presenti.
- `RITIRO + LISTO`: OK, non appare e non conta nel badge Entregas.
- `RETIRADO`: OK, non appare nella lista attiva; resta solo nel riepilogo `Entregados esta noche`.
- Confirm `✓ Entregado`: OK, ordine test passato a `RETIRADO` e finito in `Entregados esta noche`.
- Cancel `✓ Entregado`: guardia validata a codice; non validata manualmente al 100% per limite dell'automazione sul confirm nativo.
- Controllo lingua: OK, nessuna nuova label italiana visibile.
- `npm run build`: OK.
- Nessun React error overlay.
- API `POST /api/proxy`: OK.
- Ordini test eliminati via API.
- `.env` non toccato.
- Git pulito sui file tracciati.

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

Nota: questo e' il primo step concreto verso una futura area unica degli alert operativi.

## Delivery alert in Info operativa

Commit validato:

- `6aa65b1 feat show delivery service alert in operational info`

Validazione visuale:

- Dopo restart pulito Netlify Dev, `http://localhost:3010` funziona.
- Test manuale con nuovo ordine `Entrega a domicilio`.
- Ora delivery: `23:30`.
- Nella pagina principale del modal, dentro `Info operativa`, appare il riepilogo delivery fuori orario.
- Il messaggio indica di aprire il dettaglio domicilio per forzare/cambiare.
- Aprendo il menu/tab domicilio, appare il warning completo fuori servizio.
- Dentro domicilio resta la possibilita' di forzare come eccezione tramite bottone sotto.
- Nessuna duplicazione dei bottoni nella pagina principale.

Modello UX confermato:

- `Info operativa` = riepilogo visibile subito.
- Popup/dettaglio domicilio = warning completo + azioni.

## Loading disponibilita' delivery in Info operativa

Commit validato:

- `9cfe756 feat show delivery availability loading in operational info`

Dettagli:

- Modificato solo `ladieci-app33/src/components/NuevoPedidoModal.jsx`.
- Aggiunto `showDeliveryAvailabilityLoading`.
- Condizione:
  - `tipoConsegna === "DOMICILIO" && direccion && zonaLoading === true`
- Incluso in `hasOperationalInfo`.
- Testo UI spagnolo:
  - `Calculando zona y disponibilidad de delivery...`
- Serve per il flusso clienti abituali/preferiti con indirizzo auto-compilato.
- Quando l'operatore seleziona un cliente salvato, l'app mostra che sta calcolando zona/disponibilita' delivery.
- Quando il calcolo finisce, il messaggio sparisce e compaiono dati reali zona/tempo o alert.
- Validato su `http://localhost:3010` con cliente salvato `STRESS_E_Q2`.
- Pickup invariato.
- Popup delivery invariato.
- `npm run build` passato.
- Nessun errore console bloccante.
- `.env` non toccato.
- Netlify Dev fermato dopo verifica.

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
- `e90cee5 feat add operational ready helper`
- `5599cc4 feat apply operational ready in driver schedule`
- `060bfeb fix remove duplicate delivery force button`
- `3b7fa3f fix move pickup capacity feedback below address`
- `008782b feat add operational info area for pickup feedback`
- `6aa65b1 feat show delivery service alert in operational info`
- `9cfe756 feat show delivery availability loading in operational info`
- `ff1c1c4 feat show snooze max offset warning`
- `2919a55 feat prepare service header status layout`
- `85852e1 fix prioritize tablet service header layout`
- `41ef0cd fix spanish horno label in service header`
- `1ac3fc1 feat show reparto load in service header`
- `d31098b fix mirror horno reparto header layout`
- `200464a feat add delivery semantic state helpers`
- `2be997b feat align entregas with delivery semantic states`
- `856de02 fix clarify operator salida action`

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
