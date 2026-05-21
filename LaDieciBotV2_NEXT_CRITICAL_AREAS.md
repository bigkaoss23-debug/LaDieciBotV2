# La Dieci Bot V2 — Next Critical Areas

Questo documento salva la pianificazione tecnica/operativa corrente. Serve a far ripartire una nuova sessione Codex/ChatGPT senza perdere il contesto.

## Blocchi gia' validati

- Full delivery lifecycle:
  - `POR_CONFIRMAR -> EN_COCINA -> LISTO -> EN_ENTREGA -> RETIRADO`
- Rollback operativo:
  - `LISTO -> EN_COCINA` da `Listos`
  - bottone UI: `↩ Volver a cocina`
  - confirm OK validato
  - confirm Cancel validato con Playwright/Chrome: `dialog.dismiss()`, ordine rimasto `LISTO`, presente in `Listos + Entregas`, non presente in `Cocina`, delta `/api/proxy = 0`
- `Entregas` mostra solo:
  - `DOMICILIO + LISTO`
  - `DOMICILIO + EN_ENTREGA`
  - non mostra `EN_COCINA`
- Snooze cucina:
  - `ui_offset_min +5/+10/+15/+20`
  - `hora` cliente non cambia
  - scheduling reparto/rider considera l'offset operativo
- Header servizio:
  - `Horno / live BASIC / Reparto`
  - carico forno e carico reparto validati
- LISTO audit:
  - migrazione SQL preparata
  - non applicata
  - backend/frontend non cablati

## Aree critiche aperte

### 1. Delivery/geocoding

Obiettivo: stressare il flusso manuale e i fallback prima di aumentare automazione WhatsApp Delivery.

Temi:

- indirizzo manuale operatore
- clienti frequenti/preferiti
- clienti occasionali che non devono sporcare la lista preferiti
- Supabase come cache/fonte per clienti e indirizzi salvati
- Google come geocoding/distance/time affidabile, non necessariamente autocomplete UI
- fallback chain da verificare:
  - Google
  - Nominatim
  - Photon/Proton
  - zone fallback/paracadute
- persistenza di lat/lng, distanza, durata Google/Nominatim, zona, confidence, normalizzazione indirizzo

Documento dedicato: `LaDieciBotV2_DELIVERY_STRESS_TEST_PLAN.md`

### 2. Order modifications

Obiettivo: assicurarsi che Cocina veda chiaramente modifiche fatte dopo l'invio in cucina.

Temi:

- ordine modificabile da Telefono/Barra/customer order tab
- verificare eventuale modifica da WhatsApp tab
- non serve modifica diretta da Cocina/Listos
- Cocina aggiorna live da Supabase
- note manuali e ingredienti extra sono distinti
- rischio: una nuova nota rossa puo' non essere notata se c'era gia' una nota
- future label possibili:
  - `MODIFICADO`
  - `Nota actualizada`
  - `Ingrediente añadido`
  - `Revisar cambios`

Documento dedicato: `LaDieciBotV2_ORDER_MODIFICATION_NOTES.md`

### 3. Nuevo Pedido/menu builder

Obiettivo: ispezionare/stressare il builder senza rifarlo.

Temi:

- step iniziale con nome, telefono opzionale, ritiro/delivery, indirizzo, orario, note
- telefono non obbligatorio per walk-in/pickup
- ritiro/delivery scelti subito
- delivery apre pannello servizio con forno/reparto/alert
- orario scelto manualmente
- possibile futuro default pickup `now + 5`
- custom pizza = base Margherita + extras
- extras oggi 0.50, ma deve restare possibile differenziare prezzi premium in futuro
- linee separate se pizze apparentemente simili hanno extras diversi
- totale live con delivery fee

### 4. WhatsApp Bot Basic

Obiettivo: test from-zero su pickup/basic prima di delivery autonomo.

Temi:

- bot collegato a numero test
- capisce menu completo
- crea ordine in `POR_CONFIRMAR`
- non manda mai direttamente in Cocina
- operatore resta gate per `EN_COCINA`
- limite Basic sopra 30 EUR va a operatore
- confidence sotto circa 80% va a operatore
- modifiche semplici tipo add/remove possono funzionare
- casi complessi/allergie/half-half devono andare a operatore o essere fortemente flaggati

Documento dedicato: `LaDieciBotV2_BOT_DELIVERY_STRATEGY.md`

### 5. WhatsApp Delivery Q1

Obiettivo: definire guardrail minimi per delivery autonomo sicuro.

Strategia desiderata:

- bot non bloccato di default
- automatizza solo casi semplici e sicuri
- Q1 prima versione
- max 30 EUR
- alta confidence
- no allergie
- no richieste strane/pagamento speciale
- no modifiche complesse
- outside Q1 -> operatore
- indirizzo ambiguo/low confidence -> operatore
- comunica orario approssimativo, non garanzia rigida

Documento dedicato: `LaDieciBotV2_BOT_DELIVERY_STRATEGY.md`

### 6. WhatsApp Review Agent

Obiettivo: miglioramento controllato del bot su conversazioni archiviate.

Temi:

- conversazioni archiviate a fine servizio/notte
- retention target 1-2 mesi
- review settimanale
- report con esempi reali, suggerimenti, motivo e correzione proposta
- approvazione umana obbligatoria
- no auto-training cieco

Documento dedicato: `LaDieciBotV2_WHATSAPP_REVIEW_AGENT.md`

### 7. Supabase LISTO audit

Obiettivo: rendere persistente origine/actor/timestamp del click `LISTO`.

Stato:

- migrazione pronta:
  - `ladieci-bot/migrations/2026-05-20_add_listo_audit_fields.sql`
- campi:
  - `listo_origin`
  - `listo_actor`
  - `listo_at`
- migrazione NON applicata
- wiring NON fatto

Regole:

- non applicare senza conferma esplicita del progetto Supabase target
- non cablare backend/frontend prima della migrazione e verifica schema
- migration e wiring devono restare micro-step separati

### 8. Chiusura servizio/end-of-night

Da trattare piu' avanti. Non e' priorita' immediata rispetto a delivery/geocoding, bot from-zero, modifiche ordine e guardrail delivery.

## Priorita' consigliata

1. Delivery/geocoding manual pipeline inspection + stress matrix
2. WhatsApp bot from-zero behavior tests
3. Order modification visibility in Cocina
4. WhatsApp Delivery Q1 guardrails
5. Nuevo Pedido/menu builder inspection
6. Supabase LISTO audit quando il DB target e' sicuro
7. Cierre servicio/end-of-night piu' avanti

