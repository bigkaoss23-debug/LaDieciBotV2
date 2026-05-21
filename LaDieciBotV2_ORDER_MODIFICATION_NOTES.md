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
