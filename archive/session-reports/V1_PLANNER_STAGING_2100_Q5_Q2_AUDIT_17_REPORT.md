# V1_PLANNER_STAGING_2100_Q5_Q2_AUDIT_17_REPORT

Data: 2026-06-17 — **AUDIT. Anchor Q5 21:00 creato e portato EN_COCINA. Q2 SOLO bozza (NON confermata). Schermata lasciata aperta sul popup planner. Nessun cleanup. Nessuna patch/deploy/push. Production intoccata.**

---

## 1. Come ho trovato/usato l'ambiente
- **Staging V1 verificato (read-only, live):** `https://ladieci-v1-staging.netlify.app/version.json`
  - commit **`c07c68f`** (`c07c68fe6132…`), branch `consolidation/nuevo-pedido-v1-unified-2026-06-09`, bundle `static/js/main.4a15067f.js`, deployId `6a3050ec885ff40547a33e81`, HTTP 200.
  - Site staging atteso **`a3ad035a`**. **NON** production (`02bd4c7a` / `069c273` / `6a303f3d`).
- **Esecuzione test:** su **build V1 locale** (stesso identico commit `c07c68f`, `netlify dev` :8888 dal repo `LaDieciBotV2-github/ladieci-app33`), **su autorizzazione esplicita dell'utente** ("OK al localhost V1") perché lo strumento di preview non può pilotare l'URL pubblico (solo localhost) e nessun browser Chrome era collegato. Il sito live e il locale condividono lo **stesso codice V1, stesso backend Railway e stesso DB Supabase prod**.
  - Login: **login OK** (bypass dev locale documentato in `auth.js`; PIN non riportato).
  - ⚠️ Nota: esisteva un secondo dev server attivo (`p1a` :8899, worktree `LaDieciBotV2-p1a`) su cui il browser di preview era inizialmente finito — **è un'app diversa, NON V1 canonica**. Fermato. Test rifatto da zero su :8888 (c07c68f). Nessun dato scritto da :8899.

## 2. Marker V1 confermati (UI)
`Nuevo Pedido` ✅ · canali `☎ Teléfono / 🍺 Barra` ✅ · `◎ Ver propuestas` ✅ · popup `Propuestas de entrega` ✅ · `Giros y huecos` ✅ · mappa zone (Esquema operativo por zonas) ✅.

## 3. Cleanup marker precedenti (FASE 1)
- Rimosso 1 cliente TEST residuo: `id=671` `TEST_V1_PLANNER_1500_Q5_Q2_Q1_2026_06_16_DELETE_OK_Q5` (marker vecchio autorizzato).
- Baseline post-cleanup: ordenes/clientes/manual_giros/wa_msgs con marker = **0/0/0/0**. Ordini attivi totali 0, EN_ENTREGA 0, ordini oggi 0. `DRIVER_STATO=LIBERO`, `LAST_CLOSE_DATE=2026-06-16`.

## 4. ANCHOR Q5 21:00 (FASE 2) — creato e portato EN_COCINA
Canale Teléfono → canal `MANUAL`. Indirizzo `Avenida Playa Serena 166` → **Q5 LAS MARINAS**, durata 13, geo `google-from-cache-street`. 1 pizza (El Pelusa). Total 14,50€.

| campo | valore |
|---|---|
| id / numero | **#001** |
| zona | Q5 / Las Marinas |
| hora | 21:00 |
| estado | **EN_COCINA** |
| forno_out | 20:47 (= 21:00 − 13) |
| durata_andata_min | 13 |
| salida_driver_estimada | **20:47** |
| entrega_estimada | **21:00** |
| retraso_estimado_min | 0 |
| conflicto_driver | false |
| manual_giro_id | null |
| canal | MANUAL |
| en_cocina_at / confirmado_at | 2026-06-17 07:26:43 UTC |

- Appare in **Pedidos (Tel)** e in **Cocina** (badge "1"). ✅
- Appare nel planner come **anchor in `serviceLine`** (`#001 Q5 promised 21:00`) — vedi sotto.
- Nota: in `POR_CONFIRMAR` `salida/entrega` erano `null`; passando a `EN_COCINA` il backend li ha popolati (20:47 / 21:00).

## 5. Q2 BOZZA + planner (FASE 3) — NON confermato
Bozza: Teléfono, `Calle Cuba 5, Roquetas de Mar` → **Q2 BUENAVISTA**, durata 6, geo `cache-street`, hora **20:45**, 1 pizza. **`Confirmar` NON premuto.** DB: presente solo `#001` (Q2 NON creato). Popup `Ver propuestas` aperto e lasciato a schermo.

### Prima pagina (modal)
- `🗺 Q2 BUENAVISTA` · `↻ 6 min` · `📡 cache-street` · `→ 20:45` · bottone `Usa esta hora`.
- Nessun "muy pronta", confirm non bloccato. Termini tecnici presenti nel DOM: `cache-street`, `haversine`, `google`, `Google no disponible`.

### Popup planner "Propuestas de entrega"
- **Mejor propuesta: `Entrega 20:45` — "Crear giro Q2" — `compatible`** + bottone `Aplicar propuesta`.
- Box proposte:
  - **20:45 · Crear giro Q2 · compatible** (selezionata, bordo viola) — DIRETTO / giro separato (rank 1)
  - **20:52 · Giro compatible · ajuste** — COMBINATO con Q5 (rank 2)
  - **— · Sin opción** (vuoto)
- Mappa: `Ruta estimada: Pizzería → Q2` (CANAL SUR). Mostra **solo Q2**, non `Pizzería → Q2 → Q5`.
- `Giros y huecos` → riga **Q5**: `SALIDA —` · `ENTREGA 21:00` · `REGRESO —` · 1 pz.
- Notas del planner: "Las filas son oportunidades… Canal sur: Q1→Q2→Q5. Canal oeste: Q1→Q3→Q4. Cruzar canales no es recomendado."

### JSON preview sintetico (`previewOrderPlanner` — contract `premium-planner-strategic-preview-v1`, `read_only`)
- **input / currentOrder:** `{zona:Q2, promised:20:45, pizzas:1}`
- **firstAvailable:** `{zone:Q2, eta:20:45, status:compatible}`
- **bestProposal:** `cand-crear-q2` · kind `crear` · giroId `null` · channel `sur` · mapPath `[Pizzería,Q2]` · status `compatible` · severity `manual` · "Crear giro Q2" · routeTimeline: salida Pizzería **20:38** → Q2 **20:45** (+0 margen) → regreso **20:54**, risk `ok`.
- **opportunities[0]:** `cand-agregar-q2-q5-#001` · kind `agregar` · giroId `#001` · mapPath `[Pizzería,Q2,Q5]` · routeEtas Q2 **20:52** (+7 vs 20:45) / Q5 **21:04** (+4 vs 21:00) · status `ajuste` · severity `warning` · "Q2 se mueve +7 min · Q5 se mueve +4 min" · regreso 21:21.
- **serviceLine:** `[{id:#001, zone:Q5, promised:21:00, pizzas:1}]` — **solo promised; nessun salida/entrega/regreso**.
- **proposals[]:** rank1 `cand-crear-q2` (direct, "Crear giro Q2", 20:45, "Q2 (sur)", compatible); rank2 `cand-agregar-q2-q5-#001` (insertion, label **vuota**, 20:52, "Q2 → Q5 (sur)", ajuste).
- **warnings:** [] · **blockers:** [] · **safety:** `{readOnly:true, writes:false, pii:redacted}`.

## 6. Bug osservati

### A. Planner / algoritmo
- **Primo buco libero corretto:** sì — `firstAvailable=20:45` rispetta la `requested_hora` (20:45). Il planner non riscrive l'ora.
- **Q2 entra nel giro Q5:** sì, è **possibile** (`cand-agregar-q2-q5-#001`, combinato `Pizzería→Q2→Q5`, Q2 20:52 / Q5 21:04), ma classificato **`ajuste`** (Q2 +7, Q5 +4).
- **bestProposal = DIRETTO** ("Crear giro Q2", giro separato), non il combinato — stesso pattern dell'audit #15.
- **🔴 Bug rilevante (P1):** il diretto "Crear giro Q2" è marcato **`compatible · sin retrasos`** ma **ignora l'impegno del rider sull'anchor Q5**. Single-rider: il giro Q2 separato esce 20:38 e rientra **20:54**, ma il Q5 deve partire **20:47** → fisicamente il rider non può fare entrambi senza ritardare il Q5. Il combinato (`ajuste`) è la lettura onesta del vincolo single-rider; il diretto, dato come "migliore", non mostra l'impatto a valle sul Q5. (Coerente con `[[planner-same-channel-aggregation-no-time-window]]` / slip-guard.)

### B. Disallineamenti UI
- **Card grande ↔ box selezionato ↔ Aplicar:** **coerenti** (tutti = "Crear giro Q2" 20:45). Nessun desync card/bottone in questo scenario (la `[[q2-planner-screen-audit-findings]]` segnalava desync: qui non riprodotto su c07c68f).
- **Mappa ↔ proposta:** coerente con la selezione (mostra `Pizzería → Q2`, il diretto).
- **`Giros y huecos`:** **salida/regreso = "—"** per il Q5 (entrega 21:00 ok). Bug noto di propagazione: `serviceLine` espone solo `{id,zone,promised,pizzas}`.

### C. Microcopy
- `cache-street` / `google-from-cache-street` esposto grezzo (`📡`). `haversine`/`Google no disponible` presenti nel DOM.
- `Compatible` ambiguo (qui = "0 slip", non "zona compatibile").
- Etichette: diretto = "Crear giro Q2"; il combinato in UI = "Giro compatible" ma nel contract `proposals[].label` è **vuota** (`""`).
- `Sin opción` per lo slot vuoto.

### D. Patch candidate (NON applicate — solo lista)
1. **[P1]** Far considerare al selettore il vincolo single-rider/anchor nel proporre il "crear" diretto: se il giro separato collide col rientro necessario per l'anchor (Q5), il diretto non deve risultare `compatible · sin retrasos`. File probabili: `src/core/delivery/deliveryProposalSelector.js`, `src/agents/previewOrderPlanner.js`, `src/core/delivery/strategicOpportunities.js`. Rischio: medio (tocca ranking/severity).
2. **[P1]** Propagare `salida/entrega/regreso` nell'`serviceLine` (oggi solo `promised`). File: `previewOrderPlanner.js` / `src/core/delivery/shadowPreviewContract.js` (loadSnapshot/sanitizeAnchor). Rischio: basso (additivo, read-only).
3. **[P2]** Microcopy: mappare `geo_source` a stato affidabilità (verde/giallo/arancione) invece del termine tecnico; chiarire `Compatible`; riempire `label` della proposta insertion. Rischio: basso.

## 7. Cleanup
- **PENDING** (per istruzione: nessun cleanup finché l'utente non guarda la schermata). Da eliminare quando autorizzato: SOLO marker `TEST_V1_PLANNER_2100_Q5_Q2_Q1_DELETE_OK` (#001 + eventuale cliente). Verifica attesa: ordenes/clientes/manual_giros/wa_msgs = 0.

## 8. Production
- **Intoccata.** Nessun deploy/push/patch. Sito prod `069c273` / `6a303f3d` / site `02bd4c7a` non toccato.

## Stato finale
- DB: solo `#001` Q5 EN_COCINA (marker). Q2 = bozza non creata.
- Schermata localhost V1 lasciata **aperta sul popup `Propuestas de entrega`** per ispezione utente.
- **STOP dopo Q2 popup.** NON Q1, NON confermare Q2, NON cleanup.
