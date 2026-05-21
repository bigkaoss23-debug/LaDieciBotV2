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

- migrazione pronta e applicata manualmente su V2 test:
  - `ladieci-bot/migrations/2026-05-20_add_listo_audit_fields.sql`
- campi:
  - `listo_origin`
  - `listo_actor`
  - `listo_at`
- backend wiring commit:
  - `5b7ff08 fix persist listo audit fields on backend`
- validato:
  - schema DB presente
  - syntax check backend
  - harness mock Supabase
- pending:
  - real API/DB validation su backend V2 test deployato o backend locale con service key corretta
  - frontend wiring `setListo -> api.updateEstado` con metadata persistenti

Regole:

- non fare ulteriori wiring prima del test reale backend
- test SQL diretto non basta: non valida la guardia backend `nuovoStato === "LISTO"`
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

## Update 2026-05-21 — Order Modification P1 chiusi

I 3 casi P1 di `Order Modification` (vedi `LaDieciBotV2_TEST_MATRIX.md` sezione M-01..M-08) sono ora coperti:

- **M-06** (`EN_ENTREGA`) e **M-07** (`RETIRADO` / `COMPLETADO`): chiusi con commit `0163cfd fix reject order modifications in terminal states`. Guardia server-side `MODIFICA_TERMINAL_STATES` in `agentOrdini.modificaOrdine`. Regression test: `ladieci-bot/tests/orderModification.terminalStates.bug.test.js` (16/16 PASS).
- **M-08** (cambio `hora` delivery in `EN_COCINA` con cascade downstream): coperto con commit `8e5b240 test order modification delivery hora cascade`. Test-only, nessuna patch produzione: la cascade era già attiva via `risincronizzaGiro` → `planFornoOutSync` post DS-5-C. Test: `ladieci-bot/tests/orderModification.deliveryHoraCascade.test.js` (11/11 PASS).

Dettaglio fix in `LaDieciBotV2_ORDER_MODIFICATION_NOTES.md` sezione "Stato fix MOD-4 — 2026-05-21".

### Prossimi blocchi consigliati (Order Modification residuo)

- **MOD-2 apply** migration `2026-05-21_add_mod_audit_fields.sql` (file pending creato, **NON applicato**). Aggiunge `mod_ts`, `mod_count`, `cocina_started_at` su `ordenes`. Richiede approvazione esplicita per migration DB.
- **MOD-2 wiring backend** in `agentOrdini.cambiaStato` (su `EN_COCINA` setta `cocina_started_at` con COALESCE) + `agentOrdini.modificaOrdine` (su success setta `mod_ts` e incrementa `mod_count`). Da fare DOPO apply.
- **MOD-3** render badge `MODIFICADO` in `TabCocina.jsx` + `PanelCocina.jsx` (logica già pronta in `ladieci-app33/src/utils/orderModBadge.js`, testata 20/20). Sblocca M-02 / M-03 / M-05 (P2 gated). Stringa spagnola breve. Dismiss UX da decidere.
- **MOD-5** UX warning forte o rollback esplicito a `EN_COCINA` quando modifica items con impatto cucina su `LISTO`. UI-heavy.
- **MOD-1b** avviso automatico cliente "Recibimos tu cambio, lo revisa un operario" su path WhatsApp F2.
- **RR1 MOD-4**: estensione guardia anche ad `aggiungiItems` (oggi consumato solo da orchestrator F2 chiuso da MOD-1, ma è export pubblico).
- **RR2 MOD-4**: ✅ parzialmente chiuso. Parser puro `parseEstadoTerminalError` (`2d8e36e`) + wiring path modal `modificaOrden` (`129ad21`) + wiring path `waAddicion` (`3abd493`). Restano **P3 aperti**: `waConfirm` cambio hora rapido ([ServicioPage.jsx:398](ladieci-app33/src/components/ServicioPage.jsx:398)) e `onConfirmaDaConfermare` ([ServicioPage.jsx:818](ladieci-app33/src/components/ServicioPage.jsx:818)). Intent dei due path = ordini pre-cucina, blast radius basso (edge case race). Patch micro stessa forma dei due fix già fatti.
- **Vincolo operativo durante servizio**: push/deploy/migration apply su Supabase rimangono **vietati**. Apply migration `2026-05-21_add_mod_audit_fields.sql` e backend wiring MOD-2 vanno schedulati fuori servizio con approvazione esplicita. MOD-3 render badge pending da MOD-2 apply + wiring.
