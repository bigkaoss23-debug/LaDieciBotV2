# FRONTEND PREVIEW PLANNER MIGRATION PLAN

> Documento di pianificazione. **Nessuna patch**: descrive come migrare
> `NuevoPedidoModal.jsx` Premium da frontend ibrido/legacy a cockpit che
> consuma l'action backend `previewOrderPlanner` (contract
> `nuevo-pedido-planner-preview-v1`).
>
> Data: 2026-06-07 · Repo frontend: `LaDieciBotV2-github` · Branch:
> `mockup/nuevo-pedido-compact-local-only` (HEAD `9a81f1e`).

---

## 1. Principio architetturale

- **Backend/planner = fonte unica di verità.**
- Frontend Premium = **cockpit/display**: mostra, non decide.
- Il frontend **NON** calcola disponibilità.
- Il frontend **NON** calcola lead time.
- Il frontend **NON** decide la compatibilità di un giro.
- Il frontend **NON** filtra giri started / too-close.
- Il frontend **NON** ha fallback locale che propone orari.
- Se il planner **non risponde** → mostra **"Planner non disponibile"** e
  **non calcola** nulla in locale. Nessuna seconda fonte di verità.

Regola operativa: se manca un dato, si corregge backend/API/contract — **mai**
si reintroduce calcolo nel frontend.

---

## 2. Stato attuale frontend

- **Branch:** `mockup/nuevo-pedido-compact-local-only`
- **HEAD:** `9a81f1e` ("fix align nuevo pedido premium with live delivery hotfixes")
- **Working tree:**
  - `M ladieci-app33/src/components/NuevoPedidoModal.jsx` — diff pendente
    (rimozione cerotti parziale, vedi §9). **Non committato, non toccato.**
  - `?? ORDINI_2026-05-23.md` — untracked. **Non toccato.**
- **Stash:** 2 presenti (`stash@{0}` FIX-35 parked, `stash@{1}` premium CSS
  compaction parked). **Non toccati.**
- **Premium UI presente:** `NPFS_CSS` / classi scoped `.npfs`, layout
  fullscreen, pannelli `np-customer-panel` + `np-address-panel`.
- **Modale ibrido:** già usa `api.previewOrderTiming` → stato `backendTiming`,
  ma conserva ancora scheduling locale legacy (vedi §8).

---

## 3. Stato backend necessario

- `previewOrderPlanner` **esiste nel backend lab**:
  - repo: `ladieci-bot`
  - branch: `fix/backend-delivery-no-aggregate-started-giro-2026-06-06`
  - HEAD: `adda13c`
  - backup remoto: `origin/backup/preview-order-planner-readonly-2026-06-07`
- **NON è live** (nessun deploy Railway).
- L'action è cablata solo nel branch/lab `index.js`, **non in produzione**.
- **Conseguenza:** finché il backend non è deployato (o un ambiente lab punta a
  quel branch), una chiamata frontend `api.previewOrderPlanner` contro il proxy
  live riceverebbe `{ error: "unknown action: previewOrderPlanner" }`.
- **Prerequisito test end-to-end:** deploy backend controllato **oppure**
  ambiente lab che punti al branch backend. Nessun test frontend end-to-end
  prima di questo.

---

## 4. API frontend da aggiungere

Aggiunta futura in `ladieci-app33/src/api.js`, speculare a `previewOrderTiming`
(linee 306-308):

```js
previewOrderPlanner: function(input = {}) {
  return proxyPost({ action: 'previewOrderPlanner', ...input });
}
```

Caratteristiche:

- **Additivo** (nuova funzione, non tocca le esistenti).
- **Zero UI** (solo layer API).
- **Safe** da aggiungere subito, ma **non funzionante end-to-end** finché il
  backend non è deployato (§3).
- Passa per `proxyPost` → `/api/proxy` (Netlify Function con JWT) → Railway `/api`.

---

## 5. Stato frontend da introdurre

Nuovi stati React in `NuevoPedidoModal.jsx` (sostituiscono progressivamente
`backendTiming`/`slotFeedback`):

- `plannerPreview` — l'ultimo contract `nuevo-pedido-planner-preview-v1` ricevuto.
- `plannerPreviewLoading` — booleano, true durante la fetch.
- `plannerPreviewError` — errore safe (per mostrare "Planner non disponibile").
- `plannerPreviewLastInputKey` — chiave derivata dagli input (per dedup/guard,
  evita rifetch identici).

---

## 6. Trigger della preview planner

Chiamare `api.previewOrderPlanner` quando cambia uno di:

- `tipoConsegna`
- `direccion`
- `zonaManuale` (override zona operatore)
- `hora`
- `items`
- conteggio pizze
- `horaTouchedByOperator`

Con **debounce** (es. ~300-400ms) e **guard** su `plannerPreviewLastInputKey`
per non rifare chiamate identiche. Per `RITIRO` la preview parte ma non richiede
geo. Abortire/ignorare risposte stale (richieste sovrapposte).

---

## 7. Mapping contract → UI

Contract `nuevo-pedido-planner-preview-v1` → UI Premium:

| Campo contract | UI Premium |
|---|---|
| `recommendation.recommended_hora` | orario consigliato / prima ora disponibile |
| `recommendation.forno_out` | "Salida horno" |
| `recommendation.salida_driver` | "Salida rider" |
| `recommendation.entrega_estimada` | "Entrega estimada" |
| `recommendation.can_confirm_requested_hora` | abilita/disabilita conferma ora richiesta |
| `blockers[]` | blocchi **rossi/gialli** (impediscono conferma) |
| `warnings[]` | avvisi **gialli** (advisory) |
| `giro.recommended` | badge "Giro recomendado" |
| `giro.giro_id` / `giro.slot_hora` / `giro.can_attach` | dettaglio giro nel popup Planner |
| `alternatives[]` | alternative orarie selezionabili |
| `availability_rows[]` | tabella disponibilità (display, **non** decisione locale) |
| `geo.zona` | pill zona |
| `geo.durata_andata_min` | pill minuti andata |
| `geo.geo_source` | pill fonte geo |
| `driver.has_conflict` / `driver.message` | avviso conflitto driver |
| `contract` / `source` / `mode` | **guard di validità**: accettare solo se `contract === "nuevo-pedido-planner-preview-v1"`, `source === "planner"`, `mode === "read_only"` |

> Nota: i nomi esatti dei sottocampi (`recommendation.*`, `giro.*`) vanno
> verificati contro `mapPlannerResult` in `src/agents/previewOrderPlanner.js`
> al momento dell'implementazione, per evitare drift.

---

## 8. Legacy local scheduling da rimuovere

Da `NuevoPedidoModal.jsx` (riferimenti riga al working tree attuale):

- **Import** (riga 4) da `../zones`:
  - `proposeForNewOrder`
  - `risolviTempoAndata`
  - `tempoAndata`
  - `suggerisciOrario`
- `slotFeedback` (stato riga 231; usi 830, 866, 1166-già-dead, 1423).
- `proposeForNewOrder(ordenes, newOrderInfo)` (riga 684) — simulazione driver locale.
- Fallback `deliveryStatus` basato su `slotFeedback` (ramo righe 830-845).
- Blocco "Suggerimento giro esistente" / "Feedback slot forno" (popup, righe
  1086-1263; alcuni già dietro `{false && …}`).
- CTA locali `setHoraFromOperator(sugg.orario)` / `Añadir a este giro` /
  prossimo slot, **se** basate su calcolo locale (righe 1152, 1197, 1263, 1585).
- `buildDisponibilidad(ordenes)` (riga 167/1432) — da sostituire con il render
  di `availability_rows[]` dal contract; **non** deve decidere disponibilità.
- Qualunque `setHoraFromOperator(...)` alimentato da suggerimento locale non-planner.

Rimozione **una alla volta**, ciascuna solo dopo che il campo planner
corrispondente è mappato in UI (§7), per non perdere funzionalità.

---

## 9. Pending diff attuale

- Diff pendente su `NuevoPedidoModal.jsx` rispetto a `9a81f1e`: `−135 / +15`.
- **Cosa fa:** rimozione cerotti — elimina la logica locale che *decideva* giro
  compatibile e *filtrava* giri started/too-close:
  - costanti `MIN_DELIVERY_LEAD_MIN`, `GIRO_AGGREGATION_MARGIN_MIN`,
    `GIRO_COMPATIBLE_RECOMMENDATION_WINDOW_MIN`;
  - helper `nowMinutes`, `timeDiffMin`, `findRecommendedCompatibleGiro`;
  - il gate `startMin < minStartMin` e il calcolo `aggregable/compatible/no_agregable`;
  - `buildDisponibilidad` diventa **info-only**; il badge "Giro compatible" ora
    deriva **solo** da `backendTiming.giro.suggested`.
- **Rischio:** basso. Verificato **nessun riferimento penzolante** ai simboli
  rimossi; helper + unici consumatori eliminati insieme → file non in mezzo-stato rotto.
- **Coerente** con l'architettura (frontend non decide giro/disponibilità/lead-time).
- **Incompleto:** non rimuove gli altri path legacy (`proposeForNewOrder`,
  `slotFeedback`, `suggerisciOrario`).
- **Raccomandazione:** **NON committare** finché non si decide se completare la
  pulizia nello stesso commit o separarla dallo switch a `previewOrderPlanner`.

---

## 10. Struttura UI Premium da preservare

Tre sezioni/card:

1. **Cliente** — autocomplete **inline**, nessun popup; bordo **verde** se
   cliente valido/autocompilato (`np-customer-panel.is-ok`).
2. **Dirección** — **inline**, nessun popup; selezione indirizzo
   preferito/esistente inline, nuovo indirizzo gestito nella sezione; bordo
   **verde** se Google-confirmed, **giallo** se richiede attenzione.
3. **Propuestas/Planner** — **unico popup ammesso**; neutro di default, diventa
   **giallo** se `warnings`/`blockers`/modifica.

Stato visivo:

- Cliente verde se valido/autofill.
- Dirección verde se Google-confirmed; giallo se indirizzo/delivery richiede attenzione.
- Propuestas/Planner neutro → giallo se warning/modifica.

Da preservare: `NPFS_CSS`, classi `.npfs`, layout fullscreen, palette oro/avana.

---

## 11. Ordine di migrazione consigliato

**Step 0 — Decisione disponibilità backend (BLOCCANTE)**
Decidere come rendere `previewOrderPlanner` raggiungibile dal frontend lab
(deploy backend controllato **oppure** ambiente lab che punta al branch
backend). Nessun test frontend end-to-end finché il backend non risponde.

**Step 1 — API frontend**
Aggiungere `api.previewOrderPlanner` (additivo, zero UI).

**Step 2 — Stato planner preview**
Aggiungere `plannerPreview*` + chiamata read-only con debounce/guard. UI
minimale/non invasiva (console o micro-indicatore) per validare i dati.

**Step 3 — UI mapping**
Mostrare `recommendation`/`warnings`/`blockers`/`giro`/`alternatives`/
`availability_rows` nel pannello **Propuestas/Planner**.

**Step 4 — Rimozione legacy**
Rimuovere i fallback locali **uno alla volta** (§8). Se il planner non è
disponibile → mostrare errore, **non** calcolare.

**Step 5 — Test lab**
Scenari: RITIRO · DOMICILIO Q1 · Q5/Marina · giro futuro compatibile · giro
partito/non aggregabile · backend non disponibile · operatore cambia hora
+5/+10 · indirizzo Google-confirmed.

---

## 12. Rischi

- **Backend non live** → migrazione non testabile end-to-end finché non risolto Step 0.
- **Unknown action** se il frontend chiama `previewOrderPlanner` contro il proxy
  di produzione prima del deploy backend.
- **Diff pendente non committato** → rischio di perdita/confusione se si
  accumulano altre modifiche sopra.
- **Doppia fonte di verità** se si lascia attivo un fallback locale accanto al planner.
- **Perdita di utilità UI** se si rimuove il legacy **prima** di aver mappato i
  campi planner corrispondenti (ordine §11 va rispettato).

---

## 13. Raccomandazione finale

1. **Prima** decidere la disponibilità del backend (lab/deploy) — Step 0.
2. **Poi** aggiungere `api.previewOrderPlanner` (Step 1).
3. **Poi** collegare lo stato `plannerPreview` (Step 2).
4. **Solo dopo** rimuovere il legacy local scheduling, uno alla volta (Step 4).
5. **NON** deployare il Premium finché non passa il test lab completo (Step 5).

Sul pending diff: tenerlo (buon lavoro, basso rischio), ma non committarlo
finché il piano non definisce se completare la pulizia nello stesso commit.
