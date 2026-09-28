# DELIVERY × ECONOMIA DECOUPLING V1 — B-1: FRONTEND COLLECTION SURFACE GUARD FIX

Data: **2026-09-20** · Ambiente: **LOCALE** (nessuno staging write, nessuna produzione, nessun backend, nessun DB) · Stato: **UNTRACKED / non committato / non pushato / non deployato / nessuna migration applicata.**
Oggetto: `collectionSurfaceGuards.static.test.mjs` (baseline 13/13 → candidata 12/13). B2 **non riaperto**.

## VERDETTO

**`DELIVERY_ECONOMY_B1_FRONTEND_GUARD_PASS`**

* Causa radice: **il guard era stale E cieco** — non c'è un buco di prodotto. Il trip-close è preservato (un solo percorso, `closeActiveTrip` → `api.chiudiGiro()`, zero pagamenti); il refactor però aveva reso **vacuo** il tripwire «il handler non cita `marcarEntregado`» e il guard non conosceva le superfici di incasso nuove.
* Fix: **2 file di test, 0 file di prodotto**. Guard originale **13/13**; nuovo guard di inventario **18/18**.
* **24/24 mutanti uccisi, tutti da almeno un guard statico** (M1–M5 del mandato + 11 extra).
* FE completo: Jest **171/171 suite, 2457/2457 test**; stessi 3 rossi `cocina*` della baseline; nessuna regressione.
* `OUT_OF_SCOPE = 0`.

> Dopo il PASS: **nessun commit, nessun deploy, nessun apply, nessun rollout.** Il passo successivo è `SECOND INDEPENDENT PRODUCT REVIEW — FINAL` sulla candidata completa B1+B2 (**non eseguita** in questa sessione).

---

## A. Preflight

| Elemento | Atteso | Verificato prima di modificare |
|---|---|---|
| Worktree con **esattamente** il branch | `feature/delivery-economy-decoupling-v1-fe` | `/Users/bigart/Downloads/ladieci-delivery-economy-decoupling-fe` (unico su 33 worktree) |
| HEAD | `fb79322b2693d03ed66105f97d56ba6cf8c9f2b6` | identico |
| Commit locali sopra la baseline | 0 | 0 |
| `git status` salvato | — | 22 righe (17 tracciati M/D + 5 untracked) |
| Diff tracciato salvato | — | 1363 righe, sha256 `089334bf30f64c6a…` (identico a quello salvato a inizio filone) |
| Hash dei file modificati/untracked | — | salvati (`fe_tracked_files.sha256`, `fe_untracked.sha256`) |
| Delta B2/backend coinvolto? | no | snapshot del BE (HEAD, 43 righe di status, diff tracciato, hash untracked) salvato **prima**; a fine sessione **identico**, salvo il report B2 (correzione documentale ammessa, §M) |

## B. Riproduzione del failure (prima di toccare codice)

Il **file di test è byte-identico** fra baseline e candidata (sha256 `06b35215c4b00200…`): cambia solo il sorgente che controlla.

| | Baseline `fb79322` (export pulito) | Candidata pre-fix |
|---|---|---|
| Esito | **Totale: 13 | PASS: 13 | FAIL: 0** — exit 0 | **Totale: 13 | PASS: 12 | FAIL: 1** — exit 1 |

Test fallito, verbatim:
```
[TabEntregas.handleForzaEntregado is no longer a collection surface at all]
  PASS  the handler never references marcarEntregado — the #723 risk is removed, not guarded
  FAIL  the handler calls the canonical trip-closure action, not a payment one  -> expected the handler to call the canonical close_rider_trip action (api.chiudiGiro)
```
**Cosa cerca il guard.** `handlerBody(ENTREGAS, "handleForzaEntregado")` estrae il *corpo* del handler e richiede che contenga `api.chiudiGiro()` (nome assemblato a runtime per il guard di linguaggio). **Perché la baseline passa:** il handler chiamava direttamente `api.chiudiGiro()`. **Perché la candidata fallisce:** con B3 esiste un solo percorso, `closeActiveTrip`, condiviso dal controllo per-riga e da quello a livello di giro («Giro en curso → Driver volvió»); il handler è ora `setLoadingId(id); await closeActiveTrip(); setLoadingId(null);` e la chiamata sta un livello più in là.

## C. Causa radice: **guard stale + tripwire cieco** (caso A, non caso B)

**Il prodotto mantiene la protezione corretta.** `closeActiveTrip` è l'**unico** chiamante di `api.chiudiGiro()` in `TabEntregas`; il suo corpo non contiene alcuna chiamata di pagamento, consegna o `updateEstado`; `handleForzaEntregado` e `handleDriverVolvio` vi delegano soltanto. Lo provano anche i test runtime dedicati (§F).

**Ma il refactor aveva indebolito il guard oltre il simbolo stantio.** L'altro check, «il handler non cita `marcarEntregado`», è diventato **vacuo**: il corpo è una delega di tre righe, quindi passa comunque. Prova (mutante M3b: `closeActiveTrip` che chiama `marcarEntregado`, cioè **la forma originale del bug #723** dentro il nuovo percorso):

| Guard | vs candidata non mutata | vs candidata **con la regressione #723 in `closeActiveTrip`** |
|---|---|---|
| **Originale** | 12/13 (il check stale fallisce; «non cita marcarEntregado» **PASS**) | **12/13 identico**: la regressione è **invisibile** («non cita marcarEntregado» **PASS**) |
| **Riparato** | 13/13 | **11/13**: falliscono entrambi i check del percorso trip-close |

Conseguenze per il fix: (1) **non** reintrodurre `handleForzaEntregado` con `api.chiudiGiro()` inline né ritoccare la regex per far passare il test — sarebbe rimasto cieco; (2) il guard deve **seguire l'indirezione** e verificare l'intero percorso; (3) le superfici di incasso nuove vanno **inventariate**, perché nessun guard può proteggere una superficie che non conosce.

## D. Inventario delle superfici di incasso (tutti i call path)

Metodo: scansione dei **186 file di prodotto** (esclusi test/standalone/setup), commenti rimossi, per ogni entry point che può muovere denaro o confermare una consegna; più le `action:` di `api.js` con nome «pagamento-simile». Coincide con l'elenco ricavato a mano da `grep`.

| # | Superficie (componente · azione) | Ruolo | Stato ordine | Chiamata | Contesto service | Classe |
|---|---|---|---|---|---|---|
| 1 | `RepartidorPage.handleEntregado` — «Entregado» + Efectivo/Tarjeta del **rider** | rider (server: `rider_collect_and_complete_stop`) | stop `EN_ENTREGA` del proprio giro | `api.marcarEntregado` | derivato dal server | EXPECTED (invariata; legge la risposta con `isPaymentFailure`) |
| 2 | `RepartidorPage` — chiusura giro dopo l'ultimo stop | rider | — | `api.chiudiGiro` | — | EXPECTED (fatto operativo, non incasso) |
| 3 | `TabEntregas.handleConfirmarEntrega` — «Marcar como entregado» (solo entrega / entrega + cobro) | admin/operator (server: `operator_confirm_delivery_v1`) | riga `EN_ENTREGA` | `api.confirmarEntregaOperador` | derivato dal server (ricevuta off-service ammessa, B2) | **EXPECTED (nuova, inventariata + contratto §3 del guard)** |
| 4 | `TabEntregas.closeActiveTrip` — «Driver volvió» per-riga e a livello di giro | operativo | — | `api.chiudiGiro` **soltanto** | — | EXPECTED (**mai** collection: L1) |
| 5 | `EconomiaPendientes` «Registrar cobro» → `CheckCashPanel` → `cashApi.pay` | admin, operator (`canCollectOrderPayment`) | famiglia `RETIRADO` non pagato, non-Mesa, con identità, `COLLECT` dal backend | `POST /api/cash/v1/checks/:orderUid/payments` | nessuno inviato; derivato dal server | **EXPECTED (nuova, inventariata + contratto §2 del guard)** |
| 6 | `ServicioPage` cassa da Listos → `CheckCashPanel` (rimborso / correzione solo admin) | admin/operator | Listos non terminale (footer consegna attivo) e terminale `isDone` («Abrir en caja», consegna **spenta**) | `cashApi.pay`, poi `api.updateEstado(RETIRADO)` dal solo footer consegna | server | EXPECTED (invariata) |
| 7 | `ServicioPage.setRetirado` — ritiro + metodo di pagamento | admin/operator | ritiro | `api.updateEstado(…RETIRADO…)` | server | EXPECTED (invariata; `isPaymentFailure`) |
| 8 | `ServicioPage.onCambiaPago` — correzione del metodo | admin/operator | `RETIRADO` | `api.updateEstado(…RETIRADO…)` | server | EXPECTED (invariata; `isPaymentFailure`) |
| 9 | `TabMesa` — Payment Hub di un tavolo | ruoli Mesa | ordine di tavolo | `mesaApi.pay` | server | EXPECTED (invariata; mai attraverso Cash V1) |
| 10 | `NuevoPedidoModal` — ordine creato già pagato | admin/operator | creazione | `ya_pagado` nel payload di `createOrden` | server | EXPECTED (invariata; il ledger registra, il client dichiara l'intento) |
| — | `FinalizarServicioModal`, `TabListos`, `EconomiaPage` | — | — | nessuna delle otto chiamate d'incasso | — | nessuna superficie (solo chip/badge/callback) |

**UNEXPECTED: 0.** Ogni voce è ora pinnata nell'inventario con il **numero esatto di call site per file**; una voce in più o in meno fa fallire il test.

## E. Patch

`git diff`: **2 file, 0 file di prodotto.** Patch completo: 299 righe, sha256 `92a45eff7e5697ab0ec6ba194a9b5fceca14c6836cf68b0a55b8c5da474f1c6c` (allegato; si applica pulito alla baseline).

| File | Δ | Cosa |
|---|---|---|
| `ladieci-app33/src/components/__tests__/collectionSurfaceGuards.static.test.mjs` | **+42 −14** | i **due** check stale riscritti per seguire l'indirezione (il file resta a **13** check) + testata |
| `ladieci-app33/src/components/__tests__/collectionSurfaceInventory.static.test.mjs` | **nuovo, 208 righe, 18 check** | inventario delle superfici + contratto delle superfici nuove |

### E.1 Guard originale: i due check riscritti
```diff
@@ -15,8 +15,12 @@
 // correction went further than fixing the payment-outcome check — it removed the ability
 // to collect from this control entirely: only the physical rider can know a delivery
 // happened, so the operator's control now calls ONLY close_rider_trip (a trip-lifecycle
-// action, not a collection one) and never references marcarEntregado at all. See the
-// dedicated block below, which proves that removal, not merely a guarded collection.
+// action, not a collection one) and never references marcarEntregado at all. Since
+// DELIVERY x ECONOMY DECOUPLING (B3) that call lives in closeActiveTrip, shared with the
+// trip-level "Driver volvió" control, and the handler only delegates to it: the dedicated
+// block below therefore checks the WHOLE trip-close path. It proves that removal, not
+// merely a guarded collection. (The inventory of every collection surface, and the contract
+// of the newer ones, is collectionSurfaceInventory.static.test.mjs.)
 //
 // This test is source-static on purpose: these handlers live inside 1000+ line components
 // with heavy context, and the contract being protected is structural (guard BEFORE the
@@ -91,19 +95,32 @@ for (const [label, source, handler] of [
   });
 }
 
-console.log("\n[TabEntregas.handleForzaEntregado is no longer a collection surface at all]");
-
-check("the handler never references marcarEntregado — the #723 risk is removed, not guarded", () => {
+console.log("\n[TabEntregas 'Driver volvió' is a trip action, never a collection surface]");
+
+// DELIVERY x ECONOMY DECOUPLING (B3): the per-row control ("Driver volvió" on a delivery row) and the trip-level control
+// (banner "Giro en curso") now end in ONE function, closeActiveTrip; the per-row handler only delegates to it. The
+// contract is therefore about the WHOLE trip-close path, not about the text of one handler: a handler that merely
+// delegates would satisfy any check on its own body (and did: the old "never references marcarEntregado" check became
+// vacuous the moment the body was three lines). Every function of the path is checked, so the property survives the
+// indirection instead of being stated about the wrong function.
+const PER_ROW_HANDLER = "handleForzaEntregado";
+const TRIP_CLOSE_PATH = [PER_ROW_HANDLER, "handleDriverVolvio", "closeActiveTrip"];
+// Everything that can collect money or confirm a delivery from this component (the operator's own delivery
+// confirmation handleConfirmarEntrega included): none of it may be reachable from the trip-close path.
+const COLLECTING = /marcarEntregado|confirmarEntregaOperador|updateEstado|cashApi|mesaApi|CheckCashPanel|createCashRequestId|handleConfirmarEntrega|[Pp]ayment/;
+
+check("no function of the trip-close path references a collection or delivery-confirmation action — the #723 risk is removed, not guarded", () => {
   // The strongest possible fix to "a collection could be invented here": there is no
-  // collection call left to invent one from. If this ever regresses (someone re-adds a
-  // marcarEntregado call to this handler), the isPaymentFailure/describePaymentFailure
+  // collection call left to invent one from. If this ever regresses (someone adds a
+  // collection call anywhere on the path), the isPaymentFailure/describePaymentFailure
   // guard above must come back with it — this assertion is the tripwire for that.
-  const forced = handlerBody(ENTREGAS, "handleForzaEntregado");
-  assert.doesNotMatch(forced, /marcarEntregado/,
-    "TabEntregas.handleForzaEntregado references marcarEntregado again — it must either stay a non-collection trip action, or regain the isPaymentFailure guard");
+  for (const name of TRIP_CLOSE_PATH) {
+    assert.doesNotMatch(handlerBody(ENTREGAS, name), COLLECTING,
+      `TabEntregas.${name} (trip-close path) references a collection / delivery-confirmation action — Driver volvió must stay a trip action, distinct from any payment`);
+  }
 });
 
-check("the handler calls the canonical trip-closure action, not a payment one", () => {
+check("the trip-close path reaches the canonical trip-closure action through ONE function (closeActiveTrip), calls nothing else, and is not a payment one", () => {
   // The canonical action name is assembled at runtime (same idiom as
   // servicioPageLiveTimeClockIsPurePresentation.static.test.js's LEGACY_CLOSE_ACTION and
   // serviceEnsureOutcome.test.js's KIND_TOKENS): scripts/check-domain-language.js
@@ -111,9 +128,20 @@ check("the handler calls the canonical trip-closure action, not a payment one",
   // forbidden-symbol literal as new legacy vocabulary. The regex built from it still
   // matches exactly that runtime symbol, proven just below.
   const CLOSE_TRIP_ACTION = ["chi", "udi", "Giro"].join("");
-  const forced = handlerBody(ENTREGAS, "handleForzaEntregado");
-  assert.match(forced, new RegExp(`api\\.${CLOSE_TRIP_ACTION}\\(\\)`),
-    `expected the handler to call the canonical close_rider_trip action (api.${CLOSE_TRIP_ACTION})`);
+  const closeFn = handlerBody(ENTREGAS, "closeActiveTrip");
+  assert.match(handlerBody(ENTREGAS, PER_ROW_HANDLER), /\bcloseActiveTrip\(\)/,
+    "the per-row control no longer delegates to closeActiveTrip: the single trip-close path was split");
+  assert.match(handlerBody(ENTREGAS, "handleDriverVolvio"), /\bcloseActiveTrip\(\)/,
+    "the trip-level control no longer delegates to closeActiveTrip: the single trip-close path was split");
+  assert.match(closeFn, new RegExp(`api\\.${CLOSE_TRIP_ACTION}\\(\\)`),
+    `expected closeActiveTrip to call the canonical close_rider_trip action (api.${CLOSE_TRIP_ACTION})`);
+  // ONE path: this is the only call of the close action in the component, and the only api call anywhere on the path.
+  assert.equal((ENTREGAS.match(new RegExp(`api\\.${CLOSE_TRIP_ACTION}\\(`, "g")) || []).length, 1,
+    "the canonical trip-closure action is called from more than one place in TabEntregas");
+  for (const name of TRIP_CLOSE_PATH) {
+    const calls = [...handlerBody(ENTREGAS, name).matchAll(/\bapi\.(\w+)\(/g)].map((m) => m[1]);
+    assert.ok(calls.every((c) => c === CLOSE_TRIP_ACTION), `TabEntregas.${name} calls api.${calls.join(", api.")} — the trip-close path may call only the trip-closure action`);
+  }
 });
 
 console.log("\n[the frontend never invents a collection]");
```
Cosa dimostrano ora: (1) **nessuna funzione del percorso** (`handleForzaEntregado`, `handleDriverVolvio`, `closeActiveTrip`) cita `marcarEntregado`, `confirmarEntregaOperador`, `updateEstado`, `cashApi`, `mesaApi`, `CheckCashPanel`, `createCashRequestId`, `handleConfirmarEntrega` o `payment`; (2) entrambi i controlli **delegano** a `closeActiveTrip`, che chiama `api.<chiusura giro>()`, che è l'**unico** chiamante nel componente, e l'**unica** `api.*` chiamata sull'intero percorso. Regex ristrette a nomi di API/superfici (nessun match su testo di copy), nessuna allowlist generica, nessun simbolo legacy reintrodotto.

### E.2 Guard di inventario (nuovo, 18 check)
* **Inventario** (10 check): il walker vede davvero l'albero (non passa a vuoto); 8 entry point ciascuno con i call site **esatti** (`api.marcarEntregado`, `api.confirmarEntregaOperador`, `api.updateEstado(…RETIRADO…)`, `cashApi.pay`, `mesaApi.pay`, `<CheckCashPanel`, la chiusura giro, `ya_pagado:`); `api.js` non espone azioni «pagamento-simili» oltre le tre inventariate.
* **Pendientes** (5 check): `canCollect` è una **pura congiunzione** di backend-`COLLECT` + consegna confermata + non-Mesa + identità + `canCollectOrderPayment(role)`; il pannello si apre **solo** via `canCollect`; il pannello riusato è montato con consegna/rimborso/correzione **spenti** e senza `onDelivered`; Pendientes non referenzia writer di consegna/giro/service/pagamento; `canCollectOrderPayment` = admin | operator e nient'altro.
* **Conferma consegna operatore** (3 check): tiene la risposta e controlla `!res || res._ok === false` **prima** del successo (`proxyPost` non lancia mai: un 409 è un oggetto truthy); invia metodo + `clientRequestId` fresco, **mai un importo**; non patcha l'ordine come pagato e **non chiude il giro**.

## F. Prova del contratto (RETIRADO / EN_ENTREGA / paid / trip-close)

| Regola | Prova runtime (Jest, verdi) | Prova statica |
|---|---|---|
| `RETIRADO` + unpaid → «Registrar cobro» **presente** se autorizzato | `1 · a delivered, unpaid order of a CLOSED service is listed as 'Entregado' with 12,50 € and a 'Registrar cobro' button`; `roles · admin sees 1`, `roles · operator sees 1` | `canCollect` (5 condizioni) |
| `EN_ENTREGA` + unpaid → «Entrega sin confirmar», **nessuna** collect | `9 · EN_ENTREGA + unpaid stays 'Entrega sin confirmar' and offers NO 'Registrar cobro'`; `9b · defence in depth: even if COLLECT arrived on an unconfirmed delivery, or on a Mesa, or with no identity, there is NO button` (include un item idoneo con `allowedActions: []`: il backend decide) | clausola `SIN_CONFIRMAR` in `canCollect` |
| paid / saldato → nessuna collection | `fully-paid order shows no payment form`; `2b · … the pendency is gone` (la voce esce per rilettura canonica); `5 · already settled elsewhere: NO second payment` | Pendientes elenca solo `Por cobrar`; il pannello si apre solo via `canCollect` |
| Pendientes registra **solo** denaro | `2 · … NO delivery / refund / adjustment controls`; `7 · the FE never asks for, nor sends, a service`; `7b · the FE writes NOTHING but the payment: no delivery, trip, close/open-service or order-state call, ever`; `static · Pendientes reaches money only through CheckCashPanel` | mount con `allowDelivery/canRefund/canAdjust = false`, niente `onDelivered` |
| `closeActiveTrip` / «Driver volvió» **senza effetto economico** | `D · "Driver volvió" closes the trip through close_rider_trip ONLY`; `G · closing the trip never turns an EN_ENTREGA order into RETIRADO: no order mutation of any kind is sent`; `"Driver de vuelta" calls ONLY close_rider_trip, never marcarEntregado`; `never optimistically mutates the order…`; `declining the confirm() dialog calls neither…` | **L1**: il percorso trip-close non referenzia alcuna collection e chiama solo `api.<chiusura giro>` |
| La consegna dell'operatore **non** è il ritorno del driver | `B · the operator confirms the LAST delivery: … the trip is NOT closed and stays ACTIVE`; `"Solo entregado": … no trip close …` | `handleConfirmarEntrega` non chiude il giro |
| La collection passa **solo** dal writer autorizzato | `2b · ONE cashApi.pay for the order identity, NO amount on the wire`; `"Entregado y cobrado · efectivo/tarjeta/bizum": ONE call, full mode, a fresh clientRequestId, and the client sends NO amount` | inventario: `cashApi.pay` solo in `CheckCashPanel`, `confirmarEntregaOperador` solo in `TabEntregas` |

**`CheckCashPanel` riusato in Pendientes:** espone il form di pagamento (metodo, «Cobrar todo» o «Importe libre» — un pagamento parziale canonico limitato al residuo, **non** una correzione d'importo) e la chiusura. Consegna (`allowDelivery && onDelivered`), rimborso (`canRefund` in `MesaPaymentsList`) e correzione (`canAdjust` in `MesaCommercialAdjustments`, che ritorna `null` se falso) sono spenti dai props. Nessuna mutazione di consegna, di giro o di driver.

## G. Prova dei ruoli

Modello già verificato: il proprietario reale è rappresentato come **`admin`** (CHECK di staging su `auth_actors`, `ROLE_SUB` del JWT, login che emette solo `admin|operator|rider`); **nessun ruolo `owner` introdotto** nel FE.

* **Pendientes**: `admin` 1 bottone, `operator` 1 bottone; `owner`, `cashier`, `legacy_operator`, `rider`, ruolo vuoto: **0** (7 casi `test.each`, tutti verdi); `canCollectOrderPayment` è pinnata a `ROLE.ADMIN || ROLE.OPERATOR` e a nient'altro (guard §2).
* **Entregas (conferma operatore)**: l'autorità è il **server** (`operator_confirm_delivery_v1`: solo admin/operator con `session_version` valida; il rider riceve `AUTH_FORBIDDEN_ROLE`, provato dall'harness B2 S4) e il FE mostra la copy tipizzata («Tu rol no puede confirmar entregas»). Il FE **non** aggiunge un gate di ruolo su `TabEntregas`: la schermata Servicio è dietro PIN e il rider parte da `/repartidor` (osservazione, §L).

## H. Mutation testing (copie temporanee: il candidato non è mai stato modificato dai mutanti)

Runner fuori dal repo (`mutate_b1.mjs`, allegato): fotografa il candidato corretto, per ogni mutante copia lo snapshot, applica la mutazione con **ancora esatta** (assente/ambigua ⇒ errore, mai un no-op silenzioso) e lancia **L1** (guard originale), **L2** (guard di inventario) e **L3** (i test Jest pertinenti). Control sullo snapshot: collectionSurfaceGuards 13/13 | collectionSurfaceInventory 18/18; runtime 99 passed, 0 failed.

**24/24 mutanti uccisi; tutti da almeno un guard statico (L1 o L2).** Per livello: L1 = 6, L2 = 23, L3 (runtime) = 18; 6 sono uccisi **solo** da guard statici perché non hanno un test runtime (M5, M11: proprio il caso «superficie non inventariata»).

| Mutante | Cosa rompe | Livello | Runtime | Prima asserzione statica che lo uccide |
|---|---|---|---|---|
| `M1a` | Pendientes: drop the backend's COLLECT gate (the FE would reconstruct the collection on its own) | L2+L3 | 1 falliti | canCollect requires the backend's COLLECT, a confirmed delivery, a non-Mesa order, its permanent identity and a payin… |
| `M1b` | operator delivery confirmation: stop reading the refusal (proxyPost's {_ok:false} becomes a success) | L2+L3 | 1 falliti | it keeps the backend's answer and does not announce success before checking it (proxyPost never throws: a 409 is a tr… |
| `M1c` | Pendientes: the button is wired straight to setCollectItem (no canCollect) | L2+L3 | 9 falliti | 'Registrar cobro' opens the panel ONLY through canCollect (no other path sets the item to collect) |
| `M2a` | Pendientes: 'Registrar cobro' offered on an unconfirmed delivery (EN_ENTREGA / SIN_CONFIRMAR) | L2+L3 | 1 falliti | canCollect requires the backend's COLLECT, a confirmed delivery, a non-Mesa order, its permanent identity and a payin… |
| `M2b` | Pendientes: 'Registrar cobro' offered on a Mesa order | L2+L3 | 1 falliti | canCollect requires the backend's COLLECT, a confirmed delivery, a non-Mesa order, its permanent identity and a payin… |
| `M3a` | closeActiveTrip also calls confirmarEntregaOperador (delivery + payment) | L1+L2+L3 | 4 falliti | no function of the trip-close path references a collection or delivery-confirmation action — the #723 risk is removed… |
| `M3b` | closeActiveTrip also calls marcarEntregado (the original #723 shape) | L1+L2+L3 | 5 falliti | no function of the trip-close path references a collection or delivery-confirmation action — the #723 risk is removed… |
| `M3c` | closeActiveTrip delegates to handleConfirmarEntrega (a collection helper) | L1+L3 | 2 falliti | no function of the trip-close path references a collection or delivery-confirmation action — the #723 risk is removed… |
| `M3d` | closeActiveTrip no longer calls the trip-closure action (it collects instead) | L1+L2+L3 | 5 falliti | no function of the trip-close path references a collection or delivery-confirmation action — the #723 risk is removed… |
| `M3e` | the per-row control calls the trip-closure action itself again (the single path is split) | L1+L2+L3 | 2 falliti | the trip-close path reaches the canonical trip-closure action through ONE function (closeActiveTrip), calls nothing e… |
| `M4a` | Pendientes: the role clause is removed from canCollect (any signed-in role sees 'Registrar cobro') | L2+L3 | 5 falliti | canCollect requires the backend's COLLECT, a confirmed delivery, a non-Mesa order, its permanent identity and a payin… |
| `M4b` | canCollectOrderPayment returns true for every role | L2+L3 | 5 falliti | canCollectOrderPayment is exactly the payment writer's audience: admin and operator (the real owner IS an admin) |
| `M4c` | canCollectOrderPayment is widened to cashier | L2+L3 | 1 falliti | canCollectOrderPayment is exactly the payment writer's audience: admin and operator (the real owner IS an admin) |
| `M5a` | a NEW component calls cashApi.pay | L2 | — | cashApi.pay( appears only at the inventoried call sites |
| `M5b` | TabListos gains a marcarEntregado call | L2 | — | api.marcarEntregado( appears only at the inventoried call sites |
| `M5c` | api.js gains a new payment-like proxy action (cobrarOrden) | L2 | — | api.js exposes no payment-like proxy action beyond the inventoried ones (a new money action would be a new surface) |
| `M5d` | Finalizar mounts a second Cash V1 panel | L2 | — | <CheckCashPanel appears only at the inventoried call sites |
| `M5e` | a new updateEstado(...RETIRADO) call in Entregas (a collection-capable state change) | L2 | — | api.updateEstado( ... RETIRADO appears only at the inventoried call sites |
| `M6` | Pendientes mounts the Cash V1 panel with refund enabled | L2+L3 | 1 falliti | the reused Cash V1 panel is mounted with delivery, refund and amount correction OFF, and with no delivery callback |
| `M7` | Pendientes mounts the panel with a delivery callback + delivery footer | L2+L3 | 2 falliti | the reused Cash V1 panel is mounted with delivery, refund and amount correction OFF, and with no delivery callback |
| `M8` | the operator's delivery confirmation also closes the trip (delivery == driver returned) | L2+L3 | 2 falliti | it never patches the order optimistically as paid and never closes the trip: a delivery is not the driver's return |
| `M9` | the operator's delivery confirmation sends an amount from the client | L2+L3 | 3 falliti | it sends the method and a fresh request id per press, and NEVER an amount (the backend derives it from the canonical … |
| `M10` | the operator's delivery confirmation marks the order cobrado locally | L1+L2+L3 | 3 falliti | no component assigns cobrado: true on its own |
| `M11` | Pendientes closes a trip (a collection path that closes the driver's trip) | L2 | — | api.chiudiGiro( appears only at the inventoried call sites |

Mappa sul mandato: **M1** = M1a (gate `COLLECT` del backend), M1b (risposta di rifiuto ignorata), M1c (bottone senza `canCollect`); **M2** = M2a (EN_ENTREGA), M2b (Mesa); **M3** = M3a–M3e (`closeActiveTrip` invoca `confirmarEntregaOperador` / `marcarEntregado` / `handleConfirmarEntrega`, non chiude più il giro, o il percorso si rompe in due); **M4** = M4a (clausola ruolo tolta), M4b (`true` per ogni ruolo), M4c (allargato a `cashier`); **M5** = M5a–M5e (nuovo componente con `cashApi.pay`, `marcarEntregado` in `TabListos`, nuova azione `cobrarOrden` in `api.js`, secondo `CheckCashPanel` in Finalizar, nuovo `updateEstado(RETIRADO)` in Entregas). Extra: M6 (rimborso abilitato in Pendientes), M7 (consegna/correzione abilitate), M8 (la conferma consegna chiude il giro), M9 (importo dal client), M10 (`cobrado: true` locale), M11 (Pendientes chiude un giro).

## I. Test mirati

| Cosa | Esito |
|---|---|
| `collectionSurfaceGuards.static.test.mjs` | **13/13** (pre-fix 12/13) |
| `collectionSurfaceInventory.static.test.mjs` | **18/18** |
| Jest mirato: Pendientes (×2 file + Ledger Gate + Smoke), `CheckCashPanel`, Entregas (×3), `adminRbac`, Finalizar (`serviceStateGateDeliveryEconomy`, `closeServiceOutcome`) | **11/11 suite, 152/152 test**, 0 falliti |

Per file: `EconomiaPendientes.postCloseCollection` 23/23 · `EconomiaPendientes` 25/25 · `CheckCashPanel` 23/23 · `TabEntregas.operatorDeliveryConfirmation` 9/9 · `TabEntregas.tripLevelDriverVolvio` 8/8 · `TabEntregas.driverVueltaClosesTripNotDelivery` 4/4 · `serviceStateGateDeliveryEconomy` 8/8 · `economiaSmokeFixBatch` 33/33 · `economiaLedgerGate` 5/5 · `adminRbac` 7/7 · `closeServiceOutcome` 7/7.

## J. Regressione FE completa (`test:all` del repository)

Confronto **baseline `fb79322` (export pulito)** vs **candidata corretta**:

| Suite | Baseline | Candidata corretta |
|---|---|---|
| `check:domain-language` | OK (397 file) | OK (402 file) |
| Jest (`react-scripts test`) | 168/168 suite, **2412/2412** test | 171/171 suite, **2457/2457** test |
| `test:standalone` | 4/4 file (20 + 81 + 13 asserzioni) | 4/4 file (identico) |
| `test:mjs` | 29/32 file | 30/33 file |
| File `.mjs` rossi | `cocinaCardPixelGrid`, `cocinaDeliveryCardHeaderReadability`, `cocinaDeliveryVisualContract` | **gli stessi 3** (stesse 6 asserzioni fallite per nome) |
| `guard-no-lab-markers` | — | exit 0 (in locale è un *skip*: vale solo in produzione) |

Il passaggio 168→171 suite / 2412→2457 test è il **delta Delivery × Economia** (4 suite nuove, 1 rimossa, +6 in `CheckCashPanel`), non questo fix: **questa patch non tocca alcun file eseguito da Jest**. Il solo cambiamento dei `.mjs` è +1 file (l'inventario) e il guard di B-1 di nuovo verde. I file che la suite ha letto sono rimasti byte-identici durante l'esecuzione.

## K. Classificazione del diff

| Modifica | Classe |
|---|---|
| `collectionSurfaceGuards.static.test.mjs` (+42 −14) | **STALE_GUARD_UPDATE** |
| `collectionSurfaceInventory.static.test.mjs` (nuovo, 208) | **SUPPORTING_TEST** (richiesto da M5: il guard deve rilevare una superficie non inventariata) |
| File di prodotto FE (`src/**` non-test) | **0 modifiche** → `REQUIRED = 0` (nessun gap di prodotto) |
| Correzione terminologica del report B2 (§M) | correzione documentale **mandata** (punto 20), fuori dal diff FE |
| Questo report | artefatto richiesto, escluso dal diff di prodotto |
| **`OUT_OF_SCOPE`** | **0** |

Controlli di codice morto sul fix: `handleForzaEntregado` **non** è stato reintrodotto né toccato (esiste già nella baseline e nella candidata); nessuna funzione morta aggiunta; nessun doppio percorso di collection; nessun import inutile nei due file; nessun ramo legacy riattivato.

## L. Rilievi residui (solo quelli rimasti)

1. **Nessun gate di ruolo FE su `TabEntregas`** per la conferma consegna: l'autorità è il server (403 tipizzato + copy). È il pattern già presente per ogni altra azione di quella schermata; non è un percorso di incasso per ruoli non autorizzati, ma la review finale può chiedere un gate di presentazione.
2. Il guard originale asserisce `isPaymentFailure` solo su `setRetirado` e `RepartidorPage.handleEntregado`. `confirmEntregaFromCash` e `onCambiaPago` (ServicioPage) lo applicano nel codice, ma **non** sono asseriti; l'inventario ne pinna i call site (3 `updateEstado(RETIRADO)`), non la lettura della risposta. Preesistente, fuori dal minimo di B-1.
3. Un guard statico per call site ha un limite intrinseco: una collection instradata con un **nome di API nuovo e non «pagamento-simile»** (e non ricondotta a un entry point noto) non verrebbe vista dall'inventario; verrebbero visti i nuovi call site dei metodi noti, le nuove `action:` di `api.js` dal nome plausibile e i nuovi mount del pannello.
4. Il guard riparato descrive la **struttura della candidata** (`closeActiveTrip`): non è pensato per la baseline.
5. La stessa frase «catalogo live» compare anche in `DELIVERY_ECONOMY_DECOUPLING_V1_CORRECTION_2026-09-19.md` (banner/§12.9.1): **non toccata**, perché il mandato limita la correzione al report B2.
6. Tre `.mjs` `cocina*` rossi: **preesistenti**, identici alla baseline, non correlati a B-1.

## M. Correzione documentale ammessa (punto 20 del mandato)

`DELIVERY_ECONOMY_DECOUPLING_V1_B2_OFFSERVICE_RECEIPT_FIX_2026-09-20.md`: la frase **«letto dal catalogo live»** (riga 81) era ambigua in un lavoro dichiarato STAGING / sola lettura; «live» qualificava in altri 12 punti letture fatte sul catalogo o sullo stato di **staging**. Tutte corrette con 13 sostituzioni esatte (`live` → `staging` / formulazione tecnica: «catalogo staging», «md5 su staging», «CHECK letto dal catalogo staging», «Nessuna UAT su staging», «la versione di staging è 17.6», …). Sono rimasti «live» solo la riga 60 («live su staging», già esplicita) e i **diff embedded**, che sono testo letterale dei file di migration/fixture. Nessun altro rewrite; copia precedente conservata nello scratchpad.

## N. Stato finale

Nessun commit, push, merge, deploy, apply; nessuna scrittura su staging o produzione; **nessuna modifica** a backend, DB, migration 139/rollback, `order_post_payment_v1`, vincolo, harness B2, manifest, Caja, Economía backend. FE: HEAD `fb79322b…`, 0 commit sopra la baseline; delta rispetto all'inizio della sessione = **due file di test**. BE: HEAD `2e3e59a`, diff tracciato e hash untracked identici allo snapshot iniziale, **eccetto** il report B2 (§M).

**VERDETTO: `DELIVERY_ECONOMY_B1_FRONTEND_GUARD_PASS`**
