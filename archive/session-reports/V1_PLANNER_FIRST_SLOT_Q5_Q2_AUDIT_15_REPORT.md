# V1_PLANNER_FIRST_SLOT_Q5_Q2_AUDIT_15_REPORT

Data: 2026-06-16 — **AUDIT ONLY. Nessuna patch, nessun cleanup, nessun deploy. Localhost lasciato aperto. Production intoccata.**

## Sintesi (TL;DR)
Il modal **auto-imposta `requested_hora = 10:55`** prima ancora che l'operatore scelga. Quel 10:55 viene dal **timing diretto** (`previewTiming.js`), che calcola "primo slot per un giro **SEPARATO**" = *rider rientra dal Q5 (~10:48) + andata Q2 (6) → 10:55*. Questo modello **non considera di combinare Q2 nel giro del Q5** (un solo viaggio Q1→Q2→Q5, che consegnerebbe Q2 ~10:22). Poi, aprendo *Ver propuestas*, il planner strategico **si àncora su 10:55** → il giro combinato a 10:55 diventa **no_recomendado** (11:02). Lo stesso disallineamento causa anche **"Aplicar → no disponible/scaduta"**.

---

## FASE 0 — Snapshot DB / driver / service day
- Ora Madrid backend: **10:08** (oggi 2026-06-16).
- Ordine TEST anchor (marker `…SAME_GIRO_GAP_2026_06_16_DELETE_OK`):

| id | zona | estado | hora | forno_out | salida_driver_estimada | entrega_estimada | durata | retraso | conflicto_driver | manual_giro_id |
|---|---|---|---|---|---|---|---|---|---|---|
| #001 | Q5 | EN_COCINA | 10:30 | 10:18 | 10:18 | 10:30 | 12 | 0 | false | null |

- created/updated: 2026-06-16 07:51 UTC (09:51 CEST) — **oggi**, no rollover.
- **DRIVER_STATO = `{"stato":"LIBERO"}"`**, **EN_ENTREGA = 0** → rider non fisicamente fuori, ma il Q5 (EN_COCINA, salida 10:18) lo "impegna" nel cascade pianificato.
- LAST_CLOSE_DATE = 2026-06-15. 10:30/10:55 sono **oggi**.

## FASE 1 — Snapshot preview Q2 (strategic)
`input[type=time]` del modal = **10:55** (auto). Indirizzo `Calle Cuba 5` → **Q2 Buenavista**, durata 6, `geo_source=cache-street`.

| requested_hora | firstAvailable | bestProposal | opportunities (agregar al giro Q5) | proposals |
|---|---|---|---|---|
| **10:55** | Q2 10:55 compatible | `cand-crear-q2` "Crear giro Q2" (DIRETTO, severity manual) | `cand-agregar-q2-q5-#001` → **no_recomendado**, time 11:02 | direct 10:55 + not_recommended 11:02 |
| **10:15** | Q2 10:15 compatible | `cand-crear-q2` (DIRETTO) | `cand-agregar-q2-q5-#001` → **ajuste**, time **10:22** | direct 10:15 + insertion(ajuste) 10:22 |

`serviceLine` = `[#001 Q5]` ma **salida/entrega/regreso = null** (bug noto: il backend non propaga i timestamp dell'ancora). `warnings`/`blockers` vuoti. `safety {readOnly,writes:false}`.

### Risposte alle domande FASE 1
1. **requested_hora del Q2** = **10:55** (auto-impostata dal modal, non scelta dall'operatore).
2. Il planner **rispetta** requested_hora: `hora_proposta = horaRichiesta` (mai riscritta) e `firstAvailable` segue la richiesta.
3. `firstAvailable` = 10:55 **perché requested_hora è 10:55**. Esiste un candidato prima (combinato 10:22) ma solo se requested_hora ≈ 10:15.
4. Il candidato prima (10:22) **non viene scelto** perché a requested 10:55 il giro combinato slitta a 11:02 (> requested) → no_recomendado, e il diretto 10:55 vince.
5. `bestProposal` = **direct** ("Crear giro Q2", giro separato), MAI agregar.
6. Q5 10:30 **appare** in `serviceLine` (`#001`).
7. Q5 10:30 **appare** in `opportunities` come anchor (`cand-agregar-q2-q5-#001`, `giroId #001`).
8. Q2 **ha** l'opportunity per entrare nel giro Q5; è **ajuste@10:22** se richiesto ~10:15, **no_recomendado@11:02** se richiesto 10:55.
9. Nessun filtro lo elimina; è lo **slip/promised-gap** + il **requested_hora=10:55** che lo declassano.

## FASE 2 — Audit algoritmo "primo slot libero"
Codepath del 10:55 (frontend → backend):
1. `NuevoPedidoModal.jsx:1039-1047` — su DOMICILIO, se l'operatore non ha toccato l'ora: **`setHora(backendTiming.suggested_hora)`** → pinna 10:55.
2. `backendTiming` = `api.previewOrderTiming(...)` (`NuevoPedidoModal.jsx:870`).
3. Backend `previewTiming.js:336-358` — `resolveRiderAvailability(activeOrders)` → `rider.busyUntilMin` (rientro dal giro Q5).
   - `salidaPropostaMin = horaRichiestaMin − durataAndata`
   - se `rider.busyUntilMin > salidaPropostaMin` → conflict, e **`riderSuggMin = rider.busyUntilMin + durataAndata`** → **`suggested_hora = 10:55`**.
4. `agentCucina.js:134` — `minMin = Math.max(minMin, sim.driverLiberoMin)` (pavimento = rider libero, cascade-aware).

**Natura del calcolo:** "primo slot **dopo i giri esistenti** del rider" = **giro SEPARATO**. NON è "primo slot assoluto" né "primo slot combinando nel giro compatibile". `previewTiming` conosce solo i **manual_giros** (`findCompatibleManualGiro`, `previewTiming.js:367`), non gli **strategic anchor** come il Q5 → quindi non offre il combinato.

**Regola che sposta Q2 a 10:55:** `rider busy` (il Q5 occupa il rider fino al rientro) → `suggested_hora = busyUntil + andata`. Non è forno pieno (Horno 0/8), non è Google/haversine (solo label), non è stale/cache. È il **modello single-rider sequenziale** che ignora la combinazione.

## FASE 3 — Same-giro Q5/Q2 (fattibilità reale)
- Q5: promised/hora 10:30, zona Q5 (Las Marinas, canal sur), durata 12, salida 10:18, entrega 10:30, rientro teorico ~10:42.
- Q2: zona Q2 (Buenavista, canal sur), durata 6.
- **Combinando in un giro** (Q1→Q2→Q5): consegna Q2 ~**10:22**, consegna Q5 ~10:30 (poco/zero slip), rientro dopo. Il planner lo classifica:
  - requested ~10:15 → **ajuste** (entrega 10:22) → fattibile, slip ≤ soglia 15.
  - requested 10:55 → **no_recomendado** (11:02) → perché 10:55 è dopo il giro, l'inserzione "in coda" slitta oltre soglia.
- Quindi **sì, Q2 poteva entrare nel giro del Q5** (stesso canal sur, consegna ~10:22). Lo impedisce solo il **requested_hora=10:55 auto-pinnato**.

## FASE 4 — "Aplicar propuesta → no disponible/scaduta"
Gating in `NuevoPedidoModal.jsx`:
- `:1144` `isBlocked = horaTouchedByOperator && blockedByBackend`
- `:1167` `isBlocked = horaMin < sugMin` (ora sotto il minimo suggerito)
- `:1226` `can_confirm_requested_hora === false` || blocker `requested_hora_too_soon` → **BLOCCO HARD** → "Hora pedida muy pronta · usa la hora sugerida o cambia hora".

**Meccanica del bug:** applicare una proposta strategica **anticipata** (es. il giro combinato 10:22) chiama `setHoraFromOperator(10:22)` → `horaTouchedByOperator=true`. Il modal **ri-esegue `previewOrderTiming`** che (modello separato) ritorna `suggested_hora=10:55` → **`horaMin(10:22) < sugMin(10:55)` → isBlocked** → "muy pronta/no disponible". Cioè: **il planner strategico dice 10:22 OK, ma il timing diretto lo rifiuta come troppo presto.** Stesso disallineamento della FASE 2.
(Non è preview-timestamp scaduto, non è selected-proposal persa, non è sessione: è il **mismatch suggested_hora(diretto) vs hora_proposta(strategico)**.)

## FASE 5 — UI prima pagina (proposte, NON applicate)
1. **`cache-street` / `google` / `haversine`** → non mostrare il termine tecnico. Mappare a stato affidabilità:
   - verde "Dirección confirmada" (geocoding sicuro), giallo "Estimación aproximada" (haversine/cache), arancione "Revisar dirección" (partial/manual).
2. **Riga "Usa esta hora"** (oggi testo lungo sotto) → mini-riga vicino a *Ver propuestas*:
   - "Primer hueco libre: **10:55**" + bottoncino "Usar";
   - se c'è giro compatibile: "**Giro compatible: Q5 10:30**" + "Ver / añadir al giro";
   - se nessuno, non mostrare nulla.
3. **Badge `Compatible`** → ambiguo: chiarire che è **compatibilità di zona/canal**, non "ora confermata". Evitare il doppione con la riga sotto.

---

## Patch consigliate (NON applicate)
1. **[Causa primaria]** Far considerare il **giro combinato** nel suggerimento orario. Opzioni:
   - (a) `previewTiming` deve includere gli **strategic anchor** (non solo i manual_giros) nel calcolo di `suggested_hora`: se esiste un giro compatibile (stesso canal, finestra ok), `suggested_hora` = ETA del combinato (~10:22), non il floor del giro separato;
   - (b) oppure il modal **non auto-pinna** `suggested_hora` su DOMICILIO con giri compatibili: lascia requested_hora vuota/richiesta finché l'operatore apre *Ver propuestas*, così il planner sceglie la prima soluzione (combinato incluso).
2. **[Aplicar scaduta]** Quando si applica una proposta strategica, il gating confirm deve usare la **stessa fonte** del planner (`can_confirm_requested_hora` del contract strategico per QUELLA proposta), non ri-eseguire `previewOrderTiming` separato che floora a 10:55. Cioè: una hora **avallata dal planner** non deve essere ri-bloccata come "muy pronta".
3. **[serviceLine vuota]** Bug backend già noto: `loadSnapshot`/`sanitizeAnchor` non propagano `salida_driver_estimada`/`entrega_estimada`/`forno_out` all'anchor → `serviceLine.salida/entrega/regreso = null`. Aggiungere il mapping; calcolare `regreso` (colonna inesistente) come `entrega + durata_ritorno`.
4. **[UI]** vedi FASE 5 (affidabilità indirizzo, mini-riga hueco/giro, chiarire Compatible).

## Stato finale
- Dati TEST **lasciati** (anchor #001 Q5 in DB, marker) per ispezione — **nessun cleanup**.
- **Localhost V1 lasciato aperto** (porta 8888, build `main.4a15067f.js` / commit `c07c68f`).
- Production `069c273 / 6a303f3d / locked` **intoccata**. Nessuna patch/deploy/push.

**STOP dopo report.**
