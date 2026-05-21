# La Dieci Bot V2 — Order Modification Notes

Obiettivo: chiarire come gestire modifiche ordine dopo la creazione e come renderle visibili in Cocina senza creare caos operativo.

## Stato attuale da verificare

- Un ordine esistente puo' essere riaperto/modificato da Telefono/Barra/customer order tab tramite bottone modifica.
- Possibile flusso modifica da WhatsApp tab: da verificare.
- Non serve modificare direttamente da Cocina o Listos.
- Il sistema legge/scrive da Supabase.
- Cocina aggiorna live da Supabase.
- Aggiungere pizza/drink dopo creazione dovrebbe aggiornare Supabase e Cocina live.
- Ogni pizza ha mini blocco/modifica.

## Note vs ingredienti

Distinzione operativa:

- Note cucina manuali:
  - appaiono rosse o in box nota
  - esempi: `sin cebolla`, `muy hecha`, `cortar`
  - rimozioni ingredienti sono gratis e trattate come nota cucina
- Ingredienti extra:
  - visibili separatamente
  - hanno prezzo
  - sono fatturati nel totale

Cucina non deve vedere prezzi. Prezzi sono per operatore/cassa/rider.

## Rischio principale

Se un ordine e' gia' in `EN_COCINA` e viene modificato, Cocina potrebbe non notare:

- una nota nuova
- una nota cambiata
- un ingrediente aggiunto
- una pizza aggiunta
- una bibita/dessert aggiunto

Rischio specifico: se un box rosso nota esisteva gia', una modifica successiva potrebbe non essere percepita.

## UX future da investigare

Possibili badge/testi UI in spagnolo:

- `MODIFICADO`
- `Nota actualizada`
- `Ingrediente añadido`
- `Revisar cambios`

Regola: niente label italiane in UI.

## Regole operative proposte per stato ordine

### POR_CONFIRMAR

- Modifica libera.
- Nessun alert cucina necessario.

### EN_COCINA

- Modifica permessa.
- Cocina deve vedere indicatore chiaro di modifica.
- Se modifica impatta cucina, serve evidenza persistente fino a presa visione.

### LISTO

- Aggiunte non-cucina facili:
  - drinks
  - desserts freddi/non cucina
- Modifiche che impattano cucina:
  - warning forte
  - oppure rollback esplicito `↩ Volver a cocina`

### EN_ENTREGA

- Nessuna modifica cucina normale.
- Possibile solo comunicazione manuale/rider.
- Eventuali note delivery devono essere canale separato.

### RETIRADO

- Chiuso.
- Nessuna modifica operativa standard.

## Canale note rider/delivery futuro

Possibili note non-cucina:

- gia' pagato
- chiamare all'arrivo
- portal / scala / piano
- cliente scende
- lasciare al banco/portiere se autorizzato
- pagamento specifico

Queste note non devono confondersi con note cucina.

## Micro-step consigliati

1. Ricognizione codice su modifica ordine:
   - Telefono
   - Barra
   - WhatsApp
   - `modificaOrden`
   - `api.updateOrden`
2. Test manuale:
   - ordine `EN_COCINA`
   - aggiungi pizza
   - aggiungi drink
   - modifica nota
   - aggiungi extra
   - verifica Cocina live
3. Solo dopo, progettare badge `MODIFICADO` / `Revisar cambios`.

## Stato fix MOD-1 — 2026-05-21

Audit Order Modification ha identificato il rischio **M1**: il flusso WhatsApp F2 (`statoOrd.haOrdine === true`) chiamava `aggiungiItems` in automatico e inviava un riepilogo "Ya lo añadimos a tu pedido en cocina" al cliente, **anche se l'ordine era già in `EN_COCINA`/`LISTO`**. Questo bypassava la regola assoluta "il bot WhatsApp non deve mandare ordini direttamente in cucina senza review umana".

Fix applicato: commit `25f00f3 fix prevent whatsapp auto modifications for kitchen orders`.

### Prima del fix

- Cliente WhatsApp con ordine aperto invia un nuovo item → orchestrator F2 ([orchestrator.js:165-181](ladieci-bot/src/agents/orchestrator.js)).
- Branch chiamava `aggiungiItems(statoOrd.ordenId, ia.items)` senza guardia sullo stato.
- Se `autoOn`, inviava al cliente "Anotado, X! Aquí el pedido actualizado..." con totale aggiornato.
- Ordine già in cucina/listo poteva quindi essere modificato senza che l'operatore lo sapesse.

### Dopo il fix

Nel branch `if (statoOrd.haOrdine)` aggiunto check su `statoOrd.estado` contro un set di stati bloccati:

- Stati bloccati per modifica automatica: `EN_COCINA`, `LISTO`, `EN_ENTREGA`, `RETIRADO`, `COMPLETADO`.
- Se l'ordine esistente è in uno di questi stati:
  - **non** viene chiamato `aggiungiItems`
  - **non** viene inviato il riepilogo automatico al cliente
  - `wa_msgs` viene scritto come `IN_TRATTAMENTO`
  - `motivo: "modificacion_orden_en_cocina"`
  - l'operatore decide manualmente da Preguntas
- L'ordine esistente resta **invariato**.

### Stato `POR_CONFIRMAR`

- Comportamento precedente **invariato**: aggiunte automatiche su ordine pre-cucina restano consentite se già previste dal flow.
- Non rientra negli stati bloccati.
- Flussi 2B (correccion/aggiunta su `POR_CONFIRMAR`) e 2C (cambio orario) non sono toccati dal fix.

### Rischi residui (NON coperti da questo fix)

- **RR1**: il cliente non riceve ancora alcun messaggio automatico tipo "Recibimos tu cambio, lo revisa un operario". Possibile percezione di silenzio del bot. Fix proposto in micro-step separato (MOD-1b).
- **RR2**: `getStatoCliente` ([agentCucina.js:36](ladieci-bot/src/agents/agentCucina.js)) oggi seleziona solo `EN_COCINA,LISTO`. Gli stati `EN_ENTREGA/RETIRADO/COMPLETADO` nel set bloccato sono difensivi/future-proof: oggi non possono attivare la guardia perché `haOrdine` resta `false`. Nessuna azione richiesta finché la query non viene allargata.
- **RR3**: badge `MODIFICADO` / `Revisar cambios` in Cocina ancora non implementato (vedi sezione "UX future da investigare").
- **RR4**: nessun `mod_ts` / `mod_count` su `ordenes`, nessuna audit log delle modifiche.
- **RR5**: il fix include anche `tipo=correccion` su ordine già in cucina (entrava nello stesso branch F2). Coerente con "review umana per ordini in cucina", ma cambia comportamento secondario rispetto al solo `tipo=ordine`.

### Test eseguiti

- `node --check orchestrator.js`: SYNTAX OK.
- Harness mock (no DB, no rete, no `.env`) con 5 scenari:
  1. `statoOrd.estado=POR_CONFIRMAR` → `aggiungiItems` ancora chiamato, flusso 2 NUEVO (regressione zero).
  2. `statoOrd.estado=EN_COCINA` → `aggiungiItems` NON chiamato, `invia` NON chiamato, `wa_msg` IN_TRATTAMENTO con `msg=null`, motivo `modificacion_orden_en_cocina`.
  3. `statoOrd.estado=LISTO` → idem.
  4. `statoOrd.estado=EN_ENTREGA` (difensivo) → bloccato.
  5. `tipo=modifica_complessa` con `haOrdine:true` → routing precedente intatto, non entra in F2.
- Esito: PASS 5/5.

### File toccati

- `ladieci-bot/src/agents/orchestrator.js` (+9 / −0).
- Nessun cambio a frontend, schema DB, prompt WhatsApp, classificazione IA, altri flussi.

## Stato fix MOD-4 — 2026-05-21

Guardia server-side che rifiuta modifiche su pedidos in stato terminale. Chiude i gap M-06 (EN_ENTREGA) e M-07 (RETIRADO/COMPLETADO) documentati in [LaDieciBotV2_TEST_MATRIX.md](LaDieciBotV2_TEST_MATRIX.md) sezione Order Modification. Estende la copertura MOD-1 (bot WhatsApp) al path API dashboard/REST.

Commit chain:

- `ab51982 test reproduce order modification terminal state bug` — bug-repro DS-pattern.
- `0163cfd fix reject order modifications in terminal states` — fix + test convertito a regression.
- `8e5b240 test order modification delivery hora cascade` — regression M-08 cascade post-modify (test-only, nessuna patch produzione necessaria).

### Forma del fix

- File toccato: [agentOrdini.js](ladieci-bot/src/agents/agentOrdini.js).
- Module-level: `const MODIFICA_TERMINAL_STATES = new Set(["EN_ENTREGA", "RETIRADO", "COMPLETADO"]);`
- All'ingresso di `modificaOrdine(ordenId, updates)`: `sbSelect` minimo (`id=eq.X&select=estado`); se `estado ∈ MODIFICA_TERMINAL_STATES` → return:
  ```json
  { "success": false, "error": "estado_terminal", "estado": "<actual>", "message": "No se puede modificar un pedido en estado terminal." }
  ```
- Niente costruzione di `upd`, niente `sbUpdate`, niente `risincronizzaGiro` quando bloccato.
- Best-effort sul fetch: se `sbSelect` fallisce/non torna estado, fall-through al path legacy (non irrigidiamo flussi legittimi su transient failure).
- `POR_CONFIRMAR`, `NUEVO`, `EN_COCINA`, `LISTO` restano modificabili. Le regole di visibilità su `EN_COCINA`/`LISTO` (badge, warning) restano da implementare in MOD-2/MOD-3/MOD-5.
- `index.js` non toccato (sia action `modificaOrdine` sia alias `updateOrden` passano dalla stessa funzione).
- UI non toccata.

### Regression test

[orderModification.terminalStates.bug.test.js](ladieci-bot/tests/orderModification.terminalStates.bug.test.js) — pure Node + mock supabase via `require.cache`. Verifica:

1. `EN_ENTREGA`: `res.success === false`, `error === "estado_terminal"`, nessun `sbUpdate("ordenes")` emesso.
2. `RETIRADO`: idem.
3. `COMPLETADO`: idem.
4. `res.estado` riflette lo stato bloccato corrente.
5. Sanity: `EN_COCINA` resta modificabile e produce update legittimo.

Esecuzione: 16/16 PASS.

### M-08 cascade post-modify

[orderModification.deliveryHoraCascade.test.js](ladieci-bot/tests/orderModification.deliveryHoraCascade.test.js) — pure Node + mock supabase stateful. Verifica che una modifica `hora` su delivery in `EN_COCINA`:

1. NON viene bloccata da MOD-4 (`success=true`).
2. Ricalcola `forno_out` coerentemente con `calcolaFornoOutFallback`.
3. Attiva `risincronizzaGiro` → cascade-sync su `forno_out` downstream stale (riusa `planFornoOutSync` di DS-5-C).
4. Sanity guard: stesso ordine in `EN_ENTREGA` continua a essere bloccato da MOD-4 (no regressione).

Esecuzione: 11/11 PASS.

### Rischi residui (NON coperti da questo fix)

- **RR1**: la guardia copre solo `modificaOrdine`. `aggiungiItems` ([agentOrdini.js:466](ladieci-bot/src/agents/agentOrdini.js:466)) resta path separato, oggi consumato solo dall'orchestrator WhatsApp F2 (chiuso da MOD-1). Estensione MOD-4 ad `aggiungiItems` rinviata.
- **RR2**: il frontend `ModificaOrdenModal.jsx` non gestisce ancora l'errore `estado_terminal`. Oggi può permettere l'apertura del modal su stati terminali; il backend risponde errore ma l'UX non lo surface in modo chiaro. Va affrontato dentro MOD-3/MOD-5.
- **RR3**: badge `MODIFICADO` / `Revisar cambios` in Cocina (MOD-3) ancora non implementato — M-02/M-03 restano P2 gated.
- **RR4**: nessun `mod_ts` / `mod_count` su `ordenes` (MOD-2). M-02/M-03/M-05 gated.
- **RR5**: la guardia fallisce in modo silenzioso (fall-through al path legacy) se `sbSelect` lancia. Accettato per non amplificare incident sui flussi legittimi; va monitorato via `console.warn` log.

## Prep MOD-2 / MOD-3 — 2026-05-21

Setup pending per il badge "MODIFICADO" in Cocina (vedi audit nella sessione corrente). Tre artefatti creati, **nessuna migration applicata, nessun wiring backend, nessun render UI**.

- **Migration pending**: [ladieci-bot/migrations/2026-05-21_add_mod_audit_fields.sql](ladieci-bot/migrations/2026-05-21_add_mod_audit_fields.sql) — aggiunge `mod_ts TIMESTAMPTZ NULL`, `mod_count INT NOT NULL DEFAULT 0`, `cocina_started_at TIMESTAMPTZ NULL`. Idempotente (`IF NOT EXISTS`). File creato ma NON eseguito su Supabase: applicazione manuale su V2 test richiede approvazione esplicita (regola progetto, vedi LaDieciBotV2_NEXT_CRITICAL_AREAS.md §"Update 2026-05-21").
- **Utility frontend pura**: [ladieci-app33/src/utils/orderModBadge.js](ladieci-app33/src/utils/orderModBadge.js) — `isModifiedAfterCocina(orden)` ritorna `true` solo se `mod_ts > cocina_started_at` con date valide. Robusta a `null/undefined/{}/Array/Date/Number/ISO offsets`. CJS export per consentire test Node puro (l'import frontend funziona via webpack).
- **Test pure Node**: [ladieci-app33/src/utils/orderModBadge.test.js](ladieci-app33/src/utils/orderModBadge.test.js) — 20 asserzioni (degenerati, campi mancanti, date invalide, confronti =/</>, ISO timezone, Date object, epoch ms). Esecuzione: 20/20 PASS.

### Cosa resta da fare (micro-step separati)

- **Apply migration `2026-05-21_add_mod_audit_fields.sql`** su V2 test → richiede approvazione esplicita.
- **Backend wiring** in [agentOrdini.js](ladieci-bot/src/agents/agentOrdini.js): `cambiaStato` su `EN_COCINA` scrive `cocina_started_at = COALESCE(cocina_started_at, now())`; `modificaOrdine` dopo guardia MOD-4 setta `mod_ts = now()` e incrementa `mod_count`.
- **Render badge** in [TabCocina.jsx](ladieci-app33/src/components/cocina/TabCocina.jsx) e [PanelCocina.jsx](ladieci-app33/src/components/cocina/PanelCocina.jsx) usando `isModifiedAfterCocina(o)`. Stringa spagnola breve. Dismiss UX da decidere (RR2 MOD-4: anche gestione errore `estado_terminal` lato modal).
