# Premium Planner — Backend Contract

Contract dei dati che il **planner/backend** deve restituire per alimentare
`PremiumPlannerPopup` (sezioni *Mejor propuesta*, *Otras opciones rápidas*,
*Giros y huecos*, *Notas del planner* e la mini mappa zone).

> **Status:** LAB Premium / futuro backend. Il live attuale **non si tocca**.
> Oggi il popup gira su fixture statica (`PREMIUM_PLANNER_LAB_DATA`,
> contract `premium-planner-popup-lab-v2`). Questo documento definisce la forma
> che quei dati dovranno avere quando arriveranno da un backend reale.

---

## 1. Scopo

- Definire il contract per **preview di strategic opportunities** (proposte di
  giro suggerite dal planner) e per la **preview di un giro manuale**.
- Riguarda solo **LAB Premium / Premium V1**, non il flusso live attuale.
- Il backend è la **fonte unica** di tutta l'intelligenza: il popup è un
  renderer.

---

## 2. Principio — fonte di verità

- Il **planner/backend calcola tutto**: compatibilità, canali, ETA, ritardi,
  capacity, baseline, warning, blocked.
- Il **frontend renderizza soltanto** i campi già presenti nella risposta,
  seleziona localmente una opportunity, evidenzia la mappa e mostra
  warning/blocker.
- **Vietati calcoli nel frontend.** Niente aritmetica su orari, niente confronto
  `eta` vs `promised`, niente logica `se Q2+Q5 allora compatible`, niente
  derivazione di `blocked`/`warning` da `status`.

Verifica già in vigore lato componente (vedi commit
`8aa24a5 refactor keep premium planner popup as pure renderer`): nessuna
funzione `calculate*/estimate*/can*/isCompatible*/getChannel*`, nessun
`split(':')`/`map(Number)`, nessuna aritmetica tempi/capacity.

---

## 3. Actions future (backend)

| Action | Tipo | Descrizione |
|---|---|---|
| `previewStrategicOpportunities` | read-only | Dato l'ordine in bozza, restituisce le opportunità di giro suggerite + best proposal + service line. Alimenta l'apertura del popup. |
| `previewManualGiro` | read-only | Dato l'ordine + un giro candidato (existing o nuovo), restituisce **una** opportunity risolta con rotta, ETA per fermata, baseline, capacity, status. Alimenta il click su una riga/quick option. |
| `applyManualGiro` | write (solo futuro) | Applica realmente il giro. **Deve ricalcolare** prima di scrivere (vedi §10). Non incluso nel LAB renderer. |

Le prime due sono **read-only**: nessuna scrittura, nessun ordine creato.

---

## 4. Input — `previewStrategicOpportunities`

```jsonc
{
  "currentOrderDraft": {
    "zone": "Q2",                 // zona risolta dell'ordine in bozza
    "direction": "sur",           // direzione/canale derivato dal planner
    "hora": "21:00",              // hora richiesta
    "horaFlexible": true,         // se l'operatore accetta proposte alternative
    "pizzas": 3,                  // dimensione carico
    "tipoConsegna": "DOMICILIO"
  },
  "fornoState": { /* slot occupati, prossimo libero, capacità slot */ },
  "driverState": { /* driver liberi/occupati, hora rientro stimata */ },
  "serviceLine": [ /* ordini/giri già pianificati con zona + hora */ ],
  "capacityRules": { /* limiti rider, durata max giro, tempo max pizza */ },
  "channelMap": { /* canali sur/oeste e coppie incompatibili */ }
}
```

`previewManualGiro` riceve in più il **giro candidato** (`giroId` o richiesta di
`crear`) su cui valutare l'inserimento.

---

## 5. Output (top-level)

```jsonc
{
  "contract": "premium-planner-popup-lab-v2",
  "mode": "live | static_lab",
  "source": "planner | mock",
  "currentOrder": { "zone": "Q2", "hora": "21:00", "pizzas": 3 },
  "firstAvailable": { /* prima opzione disponibile, anche non ottimale */ },
  "bestProposal": {
    "id": "best-direct-q1-1555",
    "type": "directa",
    "entrega": "15:55",
    "salidaHorno": "15:48",
    "driverStatus": "Driver disponible",
    "routeLabel": "Directa · recomendada",
    "severity": "ok",
    "ctaLabel": "Aplicar propuesta"
  },
  "opportunities": [ /* vedi §6 */ ],
  "serviceLine": [ /* righe "Giros y huecos", se distinte dalle opportunities */ ],
  "zoneMapHint": {
    "zones": [ { "id": "Q1", "name": "Centro", "color": "#0097A7", "hasPizzeria": true } ],
    "seaLabel": "MAR MEDITERRÁNEO"
  },
  "warnings": [ /* avvisi globali */ ],
  "blockers": [ /* motivi di blocco globali */ ],
  "safety": { "readOnly": true, "writes": false }
}
```

`firstAvailable` ≠ `bestProposal`: il planner non deve solo dare la prima
disponibile, ma anche proporre opportunità di giro quando il cliente è
flessibile.

---

## 6. Opportunity object

```jsonc
{
  "id": "opp-q2-q5-2100",
  "kind": "agregar",                 // "agregar" (entra in giro esistente) | "crear" (giro nuovo)
  "giroId": "giro-q5-2100",          // null se kind = "crear"
  "channel": "sur",                  // "sur" | "oeste" | "cross"
  "currentOrderZone": "Q2",
  "routeZones": ["Q2", "Q5"],        // zone evidenziate sulla mappa
  "mapPath": ["Pizzería", "Q2", "Q5"],
  "routeEtas": [
    { "zone": "Q2", "eta": "20:50", "promised": null,    "slips": false, "slipLabel": null, "isNew": true },
    { "zone": "Q5", "eta": "21:00", "promised": "21:00", "slips": false, "slipLabel": null, "isNew": false }
  ],
  "baseline": { "directEta": "20:40", "label": "Directa sin giro" },
  "capacity": { "pizzas": "3/6", "routeMin": 22, "limitMin": 30, "state": "ok" },
  "status": "compatible",            // "compatible" | "ajuste" | "no_recomendado" | "lleno"
  "severity": "ok",                  // chiave tono UI (ok/warning/manual/new/info/blocked)
  "blocked": false,                  // planner decide: non applicabile normalmente
  "warning": null,                   // stringa già redatta, o null
  "title": "Agregar a giro Q5 21:00",
  "subtitle": "Q2 entra a las 20:50 antes de Las Marinas",
  "chip": "agregar",
  "explanation": "Inserta Q2 antes del Q5 sin volver a pizzería.",
  "quickOptionId": "quick-q2-q5"     // link opzionale verso la quick option corrispondente
}
```

Tutti i campi sono **output**: il frontend non ne deriva nessuno.
`slipLabel` (es. `"+5"`) è **già calcolato** dal planner — il renderer lo stampa
e basta.

---

## 7. Regole semantiche (decise dal planner)

| `status` | Significato |
|---|---|
| `compatible` | Nessuna fermata importante slitta oltre soglia. Si può inserire pulito. |
| `ajuste` | Inseribile, ma impatta qualcosa (una fermata slitta entro soglia). Mostrare il +N e chi paga il ritardo. |
| `no_recomendado` | Canali diversi o qualità a rischio (pizza fredda, rotta troppo lunga). Non verde; forzabile solo con avviso. |
| `lleno` | Capacity piena: il giro non accetta più pizze. |

`blocked = true` quando il planner stabilisce che l'opportunity **non si può
applicare normalmente** (tipicamente `no_recomendado` o `lleno`). Guida la mappa
in rosso e il testo "No recomendado". È un flag indipendente, non derivato dal
frontend.

`severity` è solo la chiave del tono visivo (colore card/mappa) e la decide il
planner insieme allo `status`.

---

## 8. Baseline (confronto obbligatorio)

Ogni opportunity porta sempre il termine di paragone, così l'operatore giudica
se il giro conviene:

- `baseline.directEta` → consegna **diretta sin giro** (es. `20:40`).
- `routeEtas` → consegna **en giro / manual** (es. `Q2 20:50 → Q5 21:00`).

Senza baseline l'operatore non può valutare il tradeoff (10 min più tardi ma un
viaggio risparmiato).

---

## 9. Route impact (rotta intera)

L'inserimento di un ordine **ricalcola tutta la rotta**, non solo la fermata
nuova. Lo `status` va valutato sull'intero `routeEtas`, perché ogni fermata a
valle può slittare.

```
Q2 20:50 → Q5 21:00            // compatible: Q5 resta sul promesso
Q2 20:50 → Q5 21:05 (+5)       // ajuste: inserire Q2 sposta Q5 oltre il promesso
```

Quando una fermata `slips: true`, il planner riempie `slipLabel` (`"+5"`) e
`promised`, così il renderer evidenzia chi paga il ritardo.

---

## 10. Revalidate on apply

Le opportunity sono calcolate sullo stato **attuale** dei giri e possono
diventare stantie tra "vedo la riga" → "clicco" → "applico".

Al futuro `Aplicar propuesta` / `applyManualGiro`:

1. il backend **ricalcola** rotta, ETA, capacity e status;
2. se ETA / capacity / status sono cambiati rispetto alla preview, il frontend
   deve mostrare una **nuova conferma** con i valori aggiornati;
3. **mai applicare una preview stantia** senza ricalcolo.

---

## 11. Capacity

`capacity` è multi-dimensione e la calcola il planner:

| Dimensione | Campo | Esempio |
|---|---|---|
| Pizze vs limite rider | `pizzas` | `"3/6"` |
| Durata totale giro vs limite | `routeMin` / `limitMin` | `22 / 30` min |
| Tempo max pizza in giro | (regola interna) | oltre soglia → qualità a rischio |
| Stato sintetico | `state` | `"ok"` \| `"tight"`/`"warning"` \| `"full"` |

`state = "full"` corrisponde a `status = "lleno"` e `blocked = true`.

---

## 12. Canali

Schema operativo (configurabile nel planner, **non** calcolato dal frontend):

- **sur:** Q1 → Q2 → Q5
- **oeste:** Q1 → Q3 → Q4
- **cross / incompatibile:** coppie in direzioni distinte, es. `Q5+Q3`,
  `Q5+Q4`, `Q2+Q4`. Non devono mai essere verdi automaticamente → `no_recomendado`,
  forzabili solo con avviso.

La mappa è uno **schema operativo a zone**, non Google Maps / routing preciso:
pizzería in Q1 Centro, mare a est. Colori zona:
Q1 `#0097A7`, Q2 `#CE93D8`, Q3 `#E65100`, Q4 `#C2185B`, Q5 `#7CB342`.

---

## 13. Safety

- `previewStrategicOpportunities` e `previewManualGiro` sono **read-only**.
- **Nessuna scrittura** durante la preview: niente ordini creati, niente stato
  cambiato, niente WhatsApp.
- **No PII raw** se non necessaria al render (zona/ETA bastano; non servono
  telefono/indirizzo completo nella risposta di preview).
- `apply` è un'action **separata** e **ricalcolata** (§10).

---

## 14. Responsabilità del frontend

Il popup **fa solo**:

- render dei campi ricevuti;
- selezione locale di una opportunity (state + `console.debug`);
- highlight della mappa in base a `routeZones` / `mapPath` / `blocked`;
- visualizzazione di `warning` / blocker e dei badge `slipLabel`;
- **nessun calcolo**.

---

## 15. Acceptance criteria

- [ ] Nessuna aritmetica ETA nel frontend.
- [ ] Nessuna logica di compatibilità nel frontend.
- [ ] Tutti i campi "intelligenti" (status, channel, ETA, slip, baseline,
      capacity, blocked, warning) arrivano dal backend/planner.
- [ ] Il frontend funziona con la fixture mock **solo in LAB**; in live i dati
      arrivano dalle action di §3.
