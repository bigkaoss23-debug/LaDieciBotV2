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

