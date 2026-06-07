# PREMIUM PLANNER POPUP MASTER SPEC

## 1. Stato e scopo

Questa spec riguarda SOLO il nuovo LAB Premium / nuovo planner popup.
NON riguarda il live attuale.
Il live attuale resta congelato e non va toccato finche il nuovo sistema non e completo, testato e approvato.

Definizioni:

- LIVE ATTUALE = produzione esistente, non toccare.
- LAB PREMIUM = branch/laboratorio frontend dove costruiamo nuova UX.
- PREMIUM V1 = primo rilascio futuro della nuova UX, non live oggi.

Regole dure:

- No deploy.
- No push.
- No backend.
- No DB/Supabase.
- No ordini reali.
- No WhatsApp.
- No modifica live.
- No modifica produzione.

## 2. Master visual confermato

La base estetica confermata e la meta destra del mockup validato: popup indipendente "Propuestas de entrega", non embedded nella pagina Nuevo Pedido.

Struttura master:

1. Header: "Propuestas de entrega"
2. Card alta "Mejor propuesta"
3. Mini mappa/schema zone nella card alta
4. Sezione "Otras opciones rapidas"
5. Sezione grande "Giros y huecos"
6. Piccola "Notas del planner"

Regola:
Il popup e indipendente.
Non deve contenere editing Direccion.
Non deve sostituire il footer "Confirmar pedido".
Non deve salvare o aggregare ordini al primo click.

## 3. Layout del popup

### 3.1 Header

- Titolo: "Propuestas de entrega".
- Close X.
- Eventuale stato aggiornamento.

### 3.2 Mejor propuesta

Mostra:

- Entrega HH:MM.
- Salida horno HH:MM.
- Driver disponible / warning.
- Tipo proposta:
  - Directa.
  - Giro compatible.
  - Oportunidad de giro.
  - Giro manual estimado.
  - Forzado por operador.
- Bottone:
  - "Aplicar propuesta" / "Usar propuesta".

Nota:
questo bottone applica la proposta dentro il flusso, ma non deve confermare l'ordine finale reale.

### 3.3 Mini schema operativo zone

Sostituire il vecchio schema fantasy/circolare con mini versione semplificata della mappa reale da `LaDieci_Zone_Consegna 2(1).html`.

Regole mappa:

- Deve essere uguale come logica/spiaccicata alla mappa reale, poi adattata in miniatura.
- Non mappa Google.
- Non routing preciso.
- Schema operativo visivo.
- Mare a est/destra.
- Pizzeria dentro Q1.
- Zone e colori ufficiali:
  - Q1 Centro teal/cyan `#0097A7`.
  - Q2 Buenavista light purple/pink `#CE93D8`.
  - Q3 IES orange `#E65100`.
  - Q4 Cortijos magenta `#C2185B`.
  - Q5 Las Marinas green `#7CB342`.
- Disposizione:
  - Q1 Centro a est/destra, pizzeria dentro Q1.
  - Q2 sotto/sud rispetto a Q1.
  - Q3 ovest/sinistra di Q1.
  - Q4 piu ovest/sinistra.
  - Q5 sud-ovest/lower-left.
  - Mare come strip blu a destra.
- Usare poche linee/corridoi operativi.
- Evidenziare rotta stimata:
  - esempio: Pizzeria -> Q1 -> Q5.
- Caption:
  - "Esquema operativo por zonas".
  - "Ruta estimada · no es ruta exacta".

Importante:
la mini mappa deve aiutare l'operatore a capire la direttrice, non promettere precisione GPS.

### 3.4 Otras opciones rapidas

Devono essere card/bottoni cliccabili.
Devono avere gli stessi colori/stati della linea "Giros y huecos".

Esempi:

- Verde: Q1 compatible / hueco disponible.
- Giallo: Ajuste +5 / stretto ma possibile.
- Viola/blu: Q1+Q5 / giro manual estimado / forzado.
- Arancione: nuevo giro.
- Rosso: no recomendado / non agregable.

Ogni opzione rapida deve corrispondere visivamente a una riga della timeline sotto.

### 3.5 Giros y huecos

E la parte chiave del popup.
Deve essere semplice, non NASA.

Riga tipo:

- Ora a sinistra.
- Badge zona/zone.
- Stato breve.
- Sotto-nota breve.
- Chip a destra.
- Eventuale + / chevron / tap target.

Esempi:

- 15:45 · Q1 · en curso · Ruta actual.
- 15:55 · Q1 · libre · Hueco disponible.
- 16:10 · Q1+Q5 · compatible · Giro manual estimado.
- 16:25 · Q5 · nuevo giro · Pedido asignado.
- 16:40 · Driver vuelve libre · Fin de ruta Q1+Q5.

Regola click:
cliccare una riga NON salva nulla.
Cliccare una riga chiama il planner per simulare: "posso aggiungere questo ordine a questo giro/slot?"

## 4. Colori e stati

Colori funzionali:

- Verde = compatible / libre / ok.
- Giallo = posible con ajuste / stretto / warning leggero.
- Arancione = nuevo giro / impatto medio.
- Rosso = no recomendado / no agregable / alto rischio.
- Viola/blu = giro manual estimado / multi-zona / forzado por operador.

Gli stessi colori devono apparire:

- Nelle opzioni rapide.
- Nella timeline.
- Nei badge proposta.
- Eventualmente nella mini mappa.

## 5. Nuovo concetto: opportunita di giro

Il planner non deve solo calcolare "prima consegna disponibile".
Deve anche aiutare l'operatore a proporre al cliente un orario strategico quando il cliente e flessibile.

Esempio base:
Giro gia presente:
21:00 · Q5 Las Marinas.

Tempi indicativi:

- Q5 circa 15 min.
- Q2 circa 7 min.
- Q1 circa 5 min.

Se entra un nuovo ordine Q2 e il cliente non ha ora precisa, mostrare:

- Primera disponible: es. 20:20 · Directa · Nuevo giro.
- Oportunidad de giro: 20:45 · Q2 compatible con Q5 21:00.

Se il cliente accetta 20:45:

- Q2 puo essere agganciato al giro Q5.
- Il rider evita un ritorno inutile in pizzeria.
- Il planner conferma con preview prima di applicare.

Regola fondamentale:
Il planner non deve spingere sempre a ritardare il cliente.
Deve mostrare:

1. Prima disponibile.
2. Opzione efficiente di giro.
3. Richiesta cliente/manuale se presente.

L'operatore al telefono decide cosa proporre.

## 6. Canali operativi / compatibilita zone

Configurare il planner con canali semplici.

### Canale sud / Marina

Q1 -> Q2 -> Q5.

Questo canale puo essere verde se tempi/capacita/forno stanno in piedi.

Esempi:

- Q1 + Q2 + Q5 = compatible se entro margini.
- Q2 + Q5 = compatible.
- Q1 + Q5 = compatible_estimado / possibile.
- Altro Q5 + Q5 = compatible se capacita ok.

### Canale ovest

Q1 -> Q3 -> Q4.

Da rifinire con test reali.

### Combinazioni non consigliate

Da non proporre verde:

- Q5 + Q3.
- Q5 + Q4.
- Q2 + Q4.
- Altre combinazioni tra direttrici diverse.

Messaggio:
"No recomendado: zonas en direcciones distintas. Mejor crear dos giros para evitar retraso/enfriamiento."

## 7. Limiti operativi

Il planner deve controllare:

- Forno: tutte le pizze pronte in tempo.
- Driver: disponibilita e ritorno.
- Capacita rider / max pizze trasportabili.
- Massimo ordini per giro.
- Promessa cliente.
- Ritardo generato su ordini esistenti.
- Tempo massimo pizza in giro.
- Compatibilita canale.
- Eventuale giro successivo che verrebbe impattato.

## 8. Flusso click sulla linea

Quando l'operatore clicca una riga in "Giros y huecos":

NON fare:

- Non salvare subito.
- Non creare giro subito.
- Non aggregare subito.

Fare:

- Chiamare planner preview.
- Mostrare stato loading: "Analizando giro...".
- Mostrare preview:
  - Prima uscita.
  - Seconda piu tardi.
  - Orario consigliato.
  - Manuale.
  - Ritardi.
  - Capacita.
  - Warning.
  - Se forzabile o no.

Esempio preview:
"Preview giro manual Q1 + Q2 + Q5".

- Salida recomendada: 20:35.
- Q1 estimada: 20:40.
- Q2 estimada: 20:48.
- Q5 estimada: 21:00.
- Driver vuelve: 21:15.
- Capacidad: OK.
- Forno: OK.
- Riesgo: bajo/medio.

## 9. Manuale / adjustment

L'operatore puo:

- Accettare suggerita.
- Scegliere prima uscita.
- Scegliere seconda piu tardi.
- Scegliere manuale.
- Aggiungere +5/+10/+15.
- Forzare, se permesso.

Ogni modifica manuale deve ricalcolare la preview.

Stati:

- Giro compatible.
- Giro manual estimado.
- Forzado por operador.
- No recomendado.
- No agregable.

## 10. Output atteso dal planner backend

Questa sezione propone una shape futura concettuale, senza implementare ora.

Contract possibile:

- `premium-planner-popup-v1` oppure futura action dedicata.
- `first_available`.
- `strategic_opportunities[]`.
- `best_proposal`.
- `quick_options[]`.
- `service_line[]`.
- `manual_preview`.
- `zone_map_hint`.
- `warnings[]`.
- `blockers[]`.
- `safety`.

Per manual giro preview:

- `target_giro_id` / `target_slot`.
- `involved_zones`.
- `channel`.
- `recommended_hora_ref`.
- `options`:
  - `first_order_time`.
  - `second_order_time`.
  - `planner_recommended`.
  - `manual`.
- `estimated_deliveries[]`.
- `driver_return`.
- `capacity_status`.
- `oven_status`.
- `impact_on_existing_orders[]`.
- `verdict`.
- `force_allowed`.
- `reason`.

Nota:
questa e una direzione di contratto, non autorizza modifiche backend in questa fase.

## 11. Cose da NON fare

- Non toccare live.
- Non fare routing Google multi-stop in V1 Premium.
- Non promettere precisione GPS.
- Non creare mille allarmi.
- Non nascondere la prima consegna disponibile.
- Non aggregare al primo click.
- Non permettere zone assurde verdi.
- Non duplicare logica tra Nuevo Pedido ed Entregas.
- Non creare due sistemi manual giro diversi.

## 12. Relazione con Manual Giro esistente

La nuova Premium deve evolvere la logica gia esistente in Entregas:

- Selezione ordini.
- Primo ordine / secondo ordine / manuale.
- Giro manuale.
- Conferma operatore.

Nuovo comportamento:
"simula prima, applica dopo".

Il manual giro attuale non va buttato.
Va usato come riferimento funzionale e reso piu intelligente.

## 13. Acceptance criteria

- Popup indipendente "Propuestas de entrega".
- Mini mappa reale semplificata, non fantasy.
- Colori ufficiali zone.
- Opzioni rapide colorate come timeline.
- "Giros y huecos" leggibile.
- Click timeline = preview, non save.
- Prima disponibile sempre visibile.
- Opportunita giro visibile quando esiste.
- Q1/Q2/Q5 canale compatibile.
- Q5+Q3/Q4 non consigliato.
- Operator adjustment +5/+10/+15.
- No live touched.
- No deploy.
- No push.
- No backend.
- No DB/Supabase.
- No ordini reali.
- No WhatsApp.
