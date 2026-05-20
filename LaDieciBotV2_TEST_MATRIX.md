# La Dieci Bot V2 — Matrice test stati ordine e telemetry

## Scopo

Questa matrice serve a validare manualmente il core ordini V2, le transition telemetry e le creation telemetry senza toccare la live.

Regole:

- Testare solo la repo V2.
- Non toccare produzione/live.
- Non committare `.env`.
- Non fare refactor durante i test.
- Ogni test va eseguito come micro-step isolato.
- Prima di ogni test pulire la telemetry.

## Setup locale

Percorso progetto:

```text
/Users/bigart/Downloads/LaDieciBotV2-github
```

Frontend:

```text
ladieci-app33
```

Avvio frontend con Netlify Dev:

```bash
cd /Users/bigart/Downloads/LaDieciBotV2-github/ladieci-app33
npx netlify dev --port 3010 --target-port 3002 --command "env PORT=3002 npm start"
```

Nota: se dopo `npm run build` Netlify Dev serve `/static/js/bundle.js` come HTML, eliminare la cartella generata `build/` e riavviare Netlify Dev.

## Accesso locale

URL:

```text
http://localhost:3010
```

PIN dev:

```text
123456
```

## Comandi telemetry

Pulire telemetry prima di ogni scenario:

```js
window.__ORDER_TELEMETRY__.clear()
```

Leggere summary:

```js
window.__ORDER_TELEMETRY__.summary()
```

Valori importanti da controllare:

- `countsByType`
- `countsByAction`
- `countsByTransition`
- `invalidCount`
- `rollbackCount`
- `legacyBypassCount`
- `creationBySource`
- `total`

## Test 1 — Pickup completo

Stato: validato.

Ordine validato: `#014`.

Obiettivo: validare un ordine ritiro/local completo senza delivery.

Passi:

1. Aprire `http://localhost:3010`.
2. Login con PIN `123456`.
3. Eseguire:

   ```js
   window.__ORDER_TELEMETRY__.clear()
   ```

4. Creare nuovo ordine ritiro/local da operatore.
5. Aggiungere almeno una pizza.
6. Confermare ordine.
7. Portare ordine in cucina: `POR_CONFIRMAR -> EN_COCINA`.
8. Segnare pronto: `EN_COCINA -> LISTO`.
9. Segnare ritirato: `LISTO -> RETIRADO`.
10. Leggere:

    ```js
    window.__ORDER_TELEMETRY__.summary()
    ```

Risultato atteso:

- `order-creation: 1`
- `transition: 3`
- `POR_CONFIRMAR->EN_COCINA: 1`
- `EN_COCINA->LISTO: 1`
- `LISTO->RETIRADO: 1`
- `invalidCount: 0`
- `rollbackCount: 0`

Risultato validato:

- `order-creation: 1`
- `transition: 3`
- `POR_CONFIRMAR->EN_COCINA: 1`
- `EN_COCINA->LISTO: 1`
- `LISTO->RETIRADO: 1`
- `invalidCount: 0`
- `rollbackCount: 0`
- `legacyBypassCount: 0`

## Test 2 — Delivery completo validato

Stato: validato.

Ordine validato: `#009`.

Passi validati:

1. Creare ordine delivery con indirizzo.
2. Portare ordine in cucina: `POR_CONFIRMAR -> EN_COCINA`.
3. Segnare pronto: `EN_COCINA -> LISTO`.
4. Mandare in consegna: `LISTO -> EN_ENTREGA`.
5. Forzare entregado/retirado: `EN_ENTREGA -> RETIRADO`.
6. Leggere telemetry summary.

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

Conclusione validata:

```text
Core orders + delivery telemetry base: VALIDATED
```

Nota: `handleForzaEntregado` puo' comparire due volte in `countsByAction` perche' emette sia `legacy-bypass` sia `transition`. Deve pero' comparire una sola volta in `countsByTransition` come `EN_ENTREGA->RETIRADO`.

## Test 3 — Creazione operatore/manuale

Stato: validato.

Obiettivo: validare creation intent da flusso operatore/manuale.

Passi:

1. Pulire telemetry.
2. Aprire nuovo ordine.
3. Usare canale manuale/telefono secondo UI disponibile.
4. Inserire cliente, orario e almeno un item.
5. Confermare ordine.
6. Leggere summary.

Risultato atteso:

- `order-creation: 1`
- `creationBySource.operator: 1`
- Nessuna transition finche' l'ordine non viene mandato in cucina.
- `invalidCount: 0`
- `rollbackCount: 0`

Metadata da controllare nell'ultimo evento creation:

- `tempId`
- `clientReqId`
- `source: operator`
- `canal`
- `initialState`
- `tipo_consegna`
- `itemsCount`
- `hasClienteId`
- `hasTelefono`
- `hasDireccion`
- `zona`
- `zonaManuale`
- `forzado`
- `yaPagado`
- `hasDescuento`
- `temp: true`

Risultato validato:

- `countsByAction.addOrden: 1`
- `countsByType.order-creation: 1`
- `creationBySource.operator: 1`
- `creationByCanal.MANUAL: 1`
- `countsByTransition`: vuoto
- `invalidCount: 0`
- `rollbackCount: 0`
- `legacyBypassCount: 0`
- `total: 1`

## Test 4 — Creazione telefono

Stato: validato con nota.

Obiettivo: validare creation intent da ordine telefonico.

Passi:

1. Pulire telemetry.
2. Creare ordine da tab `Tel`.
3. Inserire nome, telefono e item.
4. Confermare ordine.
5. Leggere summary.

Risultato atteso:

- `order-creation: 1`
- `creationBySource.operator: 1`
- `canal` coerente con telefono/TEL.
- Nessuna transition se non si manda in cucina.
- `invalidCount: 0`
- `rollbackCount: 0`

Risultato validato:

- Creato dal bottone `Nuevo Pedido`.
- `source: operator`
- Canal effettivo registrato: `MANUAL`
- Nota: il telefono oggi non ha canal dedicato in telemetry; viene tracciato come `MANUAL`.

## Test 5 — Creazione banco

Stato: validato.

Obiettivo: validare creation intent da banco/barra.

Passi:

1. Pulire telemetry.
2. Creare ordine da tab `Barra`/`Banco`.
3. Inserire item.
4. Confermare ordine.
5. Leggere summary.

Risultato atteso:

- `order-creation: 1`
- `creationBySource.operator: 1`
- `canal` coerente con banco/barra.
- Nessuna transition se non si manda in cucina.
- `invalidCount: 0`
- `rollbackCount: 0`

Nota: eventuale ambiguita' `BANCO/BARRA` va osservata, non corretta durante questo test.

Risultato validato:

- `source: operator`
- `creationByCanal.BANCO: 1`
- `countsByTransition`: vuoto
- `invalidCount: 0`
- `rollbackCount: 0`
- `legacyBypassCount: 0`

Nota tecnica: `creationBySource` indica chi o quale sistema crea l'ordine. Per `Nuevo Pedido` resta correttamente `operator`. `creationByCanal` indica il canale operativo dell'ordine. Il banco viene tracciato come `BANCO`. Il telefono per ora viene tracciato come `MANUAL`, non come canale separato.

## Test 6 — Fallback WhatsApp senza ordenRef confermato da UI

Obiettivo: validare creation intent per messaggio WhatsApp che crea direttamente un ordine in `EN_COCINA`.

Nota importante: questo test non rappresenta il flusso naturale del bot, ma un fallback tecnico per messaggi WhatsApp confermabili dalla UI senza ordine gia' collegato.

Passi:

1. Pulire telemetry.
2. Usare un messaggio WhatsApp senza `ordenRef`.
3. Confermare ordine WhatsApp.
4. Leggere summary.

Risultato atteso:

- `order-creation: 1`
- source/canal coerenti con WhatsApp.
- `initialState: EN_COCINA`
- Nessuna transition `POR_CONFIRMAR->EN_COCINA`, perche' e' una creation gia' in cucina.
- `invalidCount: 0`
- `rollbackCount: 0`

Metadata da controllare:

- `tempId`
- `clientReqId`
- `source`
- `canal`
- `initialState`
- `component`
- `action`
- `metadata.waMsgId` se disponibile
- presenza o assenza di `ordenRef`

Risultato verifica flusso WhatsApp naturale:

- `wa_id` test: `34600111222`
- Primo messaggio: `Hola, quiero una El Pelusa para recoger`
- Risultato primo messaggio: `wa_msg` in `NUEVO`, `ia_items` presente, `ia_hora` vuoto, `ordine_ref` vuoto
- Secondo messaggio: `A las 22:50`
- Risultato secondo messaggio: backend completa il pedido naturale
- Ordine creato: `#022`
- `ordine_ref` valorizzato: `#022`
- Stato ordine: `POR_CONFIRMAR`
- Canal: `WA`

Conclusione: il flusso WhatsApp naturale NON resta senza `ordenRef`. Quando il cliente fornisce l'ora, il backend crea un ordine collegato in `POR_CONFIRMAR`. Quindi l'operatore deve poi mandarlo in cucina con la normale azione `A Cocina`.

### WhatsApp natural flow — operator sends to kitchen: VALIDATED

Dati validati:

- `wa_id` test: `34600111222`
- Ordine creato dal backend: `#022`
- Stato iniziale ordine: `POR_CONFIRMAR`
- Canal: `WA`
- Azione UI: `waConfirm`

Telemetry dopo conferma operatore:

- `countsByAction.waConfirm: 1`
- `countsByType.transition: 1`
- `countsByTransition.POR_CONFIRMAR->EN_COCINA: 1`
- `creationBySource`: vuoto
- `creationByCanal`: vuoto
- `invalidCount: 0`
- `rollbackCount: 0`
- `legacyBypassCount: 0`
- `total: 1`

Nota: in questo test non compare `order-creation` nella telemetry frontend perche' l'ordine `#022` era gia' stato creato dal backend durante il flusso WhatsApp naturale. La UI valida solo la transizione finale dell'operatore verso `EN_COCINA`.

## Test 7 — Cambio pagamento senza rumore telemetry

Stato: validato.

Ordine validato: `#015`.

Obiettivo: verificare che il cambio metodo pagamento non sporchi `countsByTransition`.

Passi:

1. Portare un ordine a `RETIRADO`.
2. Leggere summary e annotare `countsByTransition`.
3. Cambiare metodo pagamento da badge in `Listos`.
4. Leggere di nuovo summary.

Risultato atteso:

- `countsByTransition` invariato dopo il cambio pagamento.
- Non devono comparire:
  - `null->RETIRADO`
  - `RETIRADO->RETIRADO`
- Deve comparire `payment-update` in `countsByType`.
- Non deve comparire `legacy-bypass` per il cambio pagamento.
- `invalidCount: 0`
- `rollbackCount: 0`

Risultato validato:

- `payment-update: 5`
- `transition` rimasto `3`
- `countsByTransition` invariato
- `legacyBypassCount: 0`
- `invalidCount: 0`
- `rollbackCount: 0`

Nota: `onCambiaPago` ora usa `logPaymentUpdate()` con type `payment-update`, commit `04b8ac5 fix payment update telemetry type`.

## Test 8 — Transizione non valida

Stato: validato in isolation.

Obiettivo: verificare che la state machine segnali una transition non valida senza rompere runtime.

Modalita' test validata:

- Eseguito in isolamento da terminale dentro `ladieci-app33`.
- Nessuna UI.
- Nessuna API.
- Nessun DB.
- Nessun file permanente modificato.
- Moduli reali usati: `stateMachine.js` e `telemetry.js`.

Transizione simulata:

- `from: POR_CONFIRMAR`
- `to: RETIRADO`
- `action: simulateInvalidTransition`
- `component: TestMatrix`
- `orderId: TEST-INVALID`
- `metadata: { dryRun: true }`

Summary ottenuto:

- `countsByType.invalid-transition: 1`
- `countsByComponent.TestMatrix: 1`
- `countsByAction.simulateInvalidTransition: 1`
- `countsByTransition.POR_CONFIRMAR->RETIRADO: 1`
- `invalidCount: 1`
- `rollbackCount: 0`
- `legacyBypassCount: 0`
- `creationBySource: {}`
- `creationByCanal: {}`
- `lastEvent.valid: false`
- `countsByType.transition` non compare

Conclusione: il test e' stato validato in isolamento per evitare scritture UI/API/DB. La state machine/telemetry intercetta correttamente `POR_CONFIRMAR -> RETIRADO` come transizione invalida.

Passi suggeriti per un futuro test UI, solo se davvero necessario:

1. Pulire telemetry.
2. Individuare un flusso legacy o manuale che provi una transizione fuori matrice.
3. Eseguire il flusso solo se e' sicuro.
4. Leggere summary.

Risultato atteso:

- `invalidCount` aumenta.
- Runtime non si rompe.
- La transizione non valida viene tracciata come `invalid-transition`.
- Nessun rollback inatteso.

Nota: non forzare casi rischiosi su dati importanti.

## Header servizio — Horno/Reparto mirror

Commit collegati:

- `2919a55 feat prepare service header status layout`
- `85852e1 fix prioritize tablet service header layout`
- `41ef0cd fix spanish horno label in service header`
- `1ac3fc1 feat show reparto load in service header`
- `d31098b fix mirror horno reparto header layout`
- `797e70c docs validate mirrored service header loads`

### Caso 1 — Layout mirror base

Struttura validata:

```text
🔥 Horno ... -> barra Horno -> live · BASIC -> barra Reparto -> 🛵 Reparto ...
```

Risultato: `VALIDATED`

Note:

- Horno, live, BASIC, Reparto visibili.
- Layout simmetrico.
- iPad/tablet OK.
- Desktop OK.
- Telefono sotto 520px solo fallback.

### Caso 2 — Reparto offset

Valori validati:

- `Reparto OK` con offset `0`
- `Reparto +5 min`
- `Reparto +10 min`
- `Reparto +15 min`
- `Reparto +20 min`

Risultato: `VALIDATED`

### Caso 3 — Reparto massimo tra piu' delivery attivi

Dati validati:

- Delivery attivi con `ui_offset_min`: `+5`, `+15`, `0`
- Header mostra `Reparto +15 min`

Risultato: `VALIDATED`

### Caso 4 — Reparto ignora terminali

Dati validati:

- Delivery `RETIRADO` con `ui_offset_min +20`
- Non influenza barra Reparto

Risultato: `VALIDATED`

### Caso 5 — Reparto ignora non-delivery

Dati validati:

- Ordine `RITIRO` con `ui_offset_min +20`
- Non influenza barra Reparto

Risultato: `VALIDATED`

### Caso 6 — Horno basso carico

Dati validati:

- `Horno 0% Libre`
- Barra quasi vuota

Risultato: `VALIDATED`

### Caso 7 — Horno medio/alto carico

Dati validati:

- 30 pizze attive -> `Horno 75% Cargado`
- 40 pizze attive -> `Horno 100% SATURO`

Risultato: `VALIDATED`

### Caso 8 — Horno cambio label

Label validate:

- `Libre`
- `Cargado`
- `SATURO`

Risultato: `VALIDATED`

### Caso 9 — Horno ignora terminali

Dati validati:

- Ordini `RETIRADO`, anche con molte pizze.
- Non lasciano Horno falsamente carico.

Risultato: `VALIDATED`

### Caso 10 — Reparto offset non influenza Horno

Dati validati:

- `ui_offset_min +20` cambia Reparto.
- Percentuale Horno resta invariata.

Risultato: `VALIDATED`

### Caso 11 — Horno + Reparto combinati

Dati validati:

- `Horno 100% SATURO`
- `Reparto +20 min`
- `live · BASIC` resta visibile

Risultato: `VALIDATED`

Problema minore noto:

- Su viewport stretto/browser in-app, `SATURO` puo' essere ellissato come `SATU...`.
- Non rompe layout.
- Accettato perche' telefono/viewport stretto e' fallback.

Controlli tecnici:

- Nessun React error overlay.
- API OK.
- Ordini test eliminati.
- Git pulito sui file tracciati.
- `.env` non toccato.

## Entregas — Semantica delivery/reparto

Commit collegati:

- `200464a feat add delivery semantic state helpers`
- `2be997b feat align entregas with delivery semantic states`
- `856de02 fix clarify operator salida action`

Flusso operativo:

```text
POR_CONFIRMAR -> EN_COCINA -> LISTO -> EN_ENTREGA -> RETIRADO
```

Semantica validata:

- `POR_CONFIRMAR` = da confermare.
- `EN_COCINA` = cucina sta lavorando.
- `LISTO + DOMICILIO` = ordine pronto, in attesa del repartidor.
- `EN_ENTREGA + DOMICILIO` = repartidor/en camino.
- `RETIRADO` = ciclo chiuso / consegnato.

Nota UI:

- L'app deve restare in spagnolo.
- Non introdurre label italiane nella UI.
- Termini corretti usati: `Entregado`, `Registrar salida`, `Reparto`, `Horno`.

### Caso 1 — DOMICILIO + EN_COCINA

Risultato: `VALIDATED`

- Non appare in `Entregas`.
- Non conta nel badge `Entregas`.
- Resta contato in `Cocina`.

### Caso 2 — DOMICILIO + LISTO

Risultato: `VALIDATED`

- Appare in `Entregas`.
- Conta nel badge `Entregas`.
- Bottone `🛵` presente.

### Caso 3 — DOMICILIO + EN_ENTREGA

Risultato: `VALIDATED`

- Appare in `Entregas`.
- Conta nel badge `Entregas`.
- Bottoni esistenti presenti:
  - `⚠️ Registrar salida` se manca salida.
  - `✓ Entregado`.

### Caso 4 — RITIRO + LISTO

Risultato: `VALIDATED`

- Non appare in `Entregas`.
- Non conta nel badge `Entregas`.

### Caso 5 — RETIRADO

Risultato: `VALIDATED`

- Non appare nella lista attiva `Entregas`.
- Resta solo nel riepilogo `Entregados esta noche`.

Controlli tecnici:

- Controllo lingua: OK, nessuna nuova label italiana visibile.
- `npm run build`: OK.
- Nessun React error overlay.
- API `POST /api/proxy`: OK.
- Ordini test `#001`-`#005` eliminati via API.
- `.env` non toccato.
- Git pulito sui file tracciati.

Nota override operatore:

- Il repartidor normalmente registra la partenza dalla sua pagina.
- `TabEntregas` resta pannello operatore di supervisione/override.
- Se il repartidor dimentica la salida o ha problemi tecnici, l'operatore puo' registrarla manualmente.
- Bottone visibile in `TabEntregas.jsx`:
  - prima: `⚠️ Salgo`
  - ora: `⚠️ Registrar salida`
- Title:
  - `Registrar manualmente la salida del repartidor`
- `✓ Entregado` resta invariato.
- Nessuna logica, handler, API, backend o transizione cambiata.

## Tabella stato test

| Test | Scenario | Stato | Ultimo ordine | Esito atteso | Note |
| --- | --- | --- | --- | --- | --- |
| 1 | Pickup completo | Validato | `#014` | 3 transition pulite | `legacyBypassCount: 0` |
| 2 | Delivery completo | Validato | `#009` | 4 transition pulite | Base telemetry validata |
| 3 | Creazione operatore/manuale | Validato | - | `order-creation: 1` | `creationByCanal.MANUAL: 1` |
| 4 | Creazione telefono | Validato con nota | - | `creationBySource.operator: 1` | Canal registrato come `MANUAL` |
| 5 | Creazione banco | Validato | - | `creationBySource.operator: 1` | `creationByCanal.BANCO: 1` |
| 6 | Fallback WhatsApp senza `ordenRef` confermato da UI | Da testare | - | creation in `EN_COCINA` | Non e' il flusso naturale del bot |
| 7 | Cambio pagamento | Validato | `#015` | `countsByTransition` invariato | `payment-update: 5`, `legacyBypassCount: 0` |
| 8 | Transizione non valida | Validato in isolation | `TEST-INVALID` | `invalid-transition: 1` | Nessuna UI/API/DB |
| Header | Horno/Reparto mirror | Validato | - | Header simmetrica e carichi coerenti | Horno e Reparto validati |
| Entregas | Semantica delivery/reparto | Validato | - | Solo `LISTO` e `EN_ENTREGA` delivery visibili | `EN_COCINA` resta in Cocina |

## Criteri generali di validazione

Un test e' pulito se:

- Non genera rollback inattesi.
- Non genera transition duplicate.
- Non sporca `countsByTransition` con eventi non-transizione.
- Le creation hanno source/canal coerenti.
- Gli eventi legacy restano osservabili ma non falsano le transition.

## Note operative

- Dopo ogni `npm run build`, `build/` puo' interferire con Netlify Dev. Se accade, eliminare `build/` e riavviare.
- `.env` locale resta necessario per auth dev e proxy Railway, ma non va mai committato.
- Le verifiche vanno fatte su `http://localhost:3010`, non su `http://localhost:3002`.
