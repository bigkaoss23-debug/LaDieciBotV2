# PLANNER_UX_1 — FRONTEND CLEANUP PLAN — 02 REPORT

**Fecha:** 2026-06-14
**Branch:** `consolidation/nuevo-pedido-v1-unified-2026-06-09`
**Modo:** PIANO TECNICO + patch proposta (NON applicata). Cero deploy · cero backend · cero DB · cero commit prima del report · `ORDINI_2026-05-23.md` intocado.
**Obiettivo UX-1:** ripulire `PremiumPlannerPopup.jsx` con i **dati già disponibili**, senza aspettare il `serviceLine` completo del backend.

---

## 0. Scope (cosa NON si tocca)

- ❌ `NuevoPedidoModal.jsx` (resta com'è in UX-1 — niente 3 bottoni nel Nuevo Pedido).
- ❌ Confirmar gating (`NuevoPedidoModal.jsx:1213-1237`).
- ❌ BUG A "Usa esta hora" (`plannerSuggestedHora`, `1197-1199` / `1682-1697`).
- ❌ Backend planner safety (slip guard / promised gap).
- ❌ `ManualGiroSection.jsx`, `api/manualGiro.js`, `createManualGiroUnsafe` (write).

**Unico file toccato in UX-1: `ladieci-app33/src/components/PremiumPlannerPopup.jsx`.**

---

## 1. Audit finale del WIP `PremiumPlannerPopup.jsx`

Stato: 1157 righe, WIP locale (+70/-3 vs HEAD), montato solo con `strategicPreview` valido (contract `premium-planner-strategic-preview-v1`). Frontend renderer puro (nessun calcolo).

Render body attuale (`return`, righe ~234-410):

| # | Blocco | Righe | Verdetto UX-1 |
|---|---|---|---|
| 1 | `ppp-top-grid` → `ppp-best-card` + **`Solo vista previa`** (no-op) | 259-282 | **Sostituire** con header + 3 opzioni |
| 2 | `MiniZoneMap` nel top-grid | 283 | **Spostare** dentro l'accordion dettaglio |
| 3 | `RouteTimeline` (opp selez. o best) | 290 | **Tenere**, dentro l'accordion dettaglio |
| 4 | `ppp-advanced` → `ManualRouteSection` (LAB) + `BackendSummary` | 295-335 | `ManualRouteSection` **fuori dal popup operatore**; `BackendSummary`→ridurre a serviceLine placeholder |
| 5 | `ppp-quick-section` "Otras opciones rápidas" (opportunities[]) | 337-362 | **Rimuovere** (1° dei 3 render duplicati) |
| 6 | `ppp-timeline-card` "Giros y huecos" (opportunities[] di nuovo) | 364-393 | **Rimuovere** (2° duplicato) |
| 7 | `ppp-notes` `PLANNER_NOTES_DEFAULT` | 395-407 | **Rimuovere** (copy dev-ish) |

Componenti definiti nel file: `OpportunityPreview` (413-448), `RouteTimeline` (467-534, **riusare**), `ManualRouteSection` (546-672, **rimuovere dal flusso**), `MiniZoneMap` (674-800, **riusare in accordion**), `BackendSummary` (816-866, **ridurre**).

**Dato chiave:** le `opportunities[]` hanno già `kind` (`agregar`/`crear`), `status` (`compatible`/`ajuste`/`no_recomendado`/`lleno`), `routeTimeline`, `routeEtas`, `baseline`, `capacity`. `firstAvailable{eta,status}` = la "directa". → I 3 slot si derivano **senza backend nuovo**.

---

## 2. Patch proposta (minima, chirurgica)

Idea: introdurre un selettore puro `buildThreeOptions(view)` e riscrivere SOLO il render body tra `<header>` e la chiusura `</section>`. Nessun cambio ai contract, ai fetch, all'adapter, al gating.

### 2.1 Nuovo helper puro (sopra il componente, zona helper)

```js
// ── UX-1: deriva 3 slot FISSI dalle opportunities[] + firstAvailable già calcolati.
// Renderer-only: solo lookup/filtri sui campi backend, nessun calcolo orario.
const OPP_BLOCKED = (o) => o.blocked || o.status === 'no_recomendado' || o.status === 'lleno';

const buildThreeOptions = (view) => {
  const opps = Array.isArray(view.opportunities) ? view.opportunities : [];
  const fa = view.firstAvailable || null;
  const best = view.bestProposal || {};

  // a) Directa / hora sugerida — da firstAvailable (fallback bestProposal).
  const directa = (fa && (fa.eta || fa.status)) || best.entrega
    ? {
        slot: 'directa',
        label: 'Directa',
        time: (fa && fa.eta) || best.entrega || '—',
        status: (fa && fa.status) || best.status || 'compatible',
        routeTimeline: best.routeTimeline || null,
        opp: null,
      }
    : null;

  // b) Giro compatible — prima opp kind 'agregar' NON bloccata.
  const giroOpp = opps.find((o) => o.kind === 'agregar' && !OPP_BLOCKED(o)) || null;
  const giro = giroOpp
    ? { slot: 'giro', label: 'Giro compatible', time: giroOpp.time, status: giroOpp.status, routeTimeline: giroOpp.routeTimeline || null, opp: giroOpp }
    : null;

  // c) Alternativa — prima opp NON bloccata distinta dalla scelta come giro.
  const altOpp = opps.find((o) => o !== giroOpp && !OPP_BLOCKED(o)) || null;
  const alternativa = altOpp
    ? { slot: 'alt', label: 'Alternativa', time: altOpp.time, status: altOpp.status, routeTimeline: altOpp.routeTimeline || null, opp: altOpp }
    : null;

  return { directa, giro, alternativa };
};

const OPTION_EMPTY_COPY = { directa: 'Sin directa', giro: 'Sin giro compatible', alt: 'Sin alternativa' };
```

### 2.2 Nuovo render body (sostituisce le righe 259-407)

```jsx
        {/* ── Header semplice: 3 opzioni fisse ───────────────────────────── */}
        <section className="ppp-options3" aria-label="Opciones de entrega">
          {(['directa', 'giro', 'alt']).map((slot) => {
            const opt = three[slot === 'alt' ? 'alternativa' : slot];
            const isSel = selectedSlot === slot;
            const tone = opt ? (toneStyles[opt.opp?.severity] || toneStyles.ok) : toneStyles.info;
            return (
              <button
                key={slot}
                type="button"
                className={`ppp-opt3${opt ? '' : ' is-empty'}${isSel ? ' is-active' : ''}`}
                style={opt ? { '--tone': tone.accent, '--toneBg': tone.bg, '--toneBorder': tone.border } : undefined}
                disabled={!opt}
                aria-pressed={isSel}
                onClick={() => { if (opt) { setSelectedSlot(slot); selectOption(opt); } }}
              >
                <span className="ppp-opt3-label">{opt ? opt.label : OPTION_EMPTY_COPY[slot]}</span>
                {opt && <strong className="ppp-opt3-time">{opt.time || '—'}</strong>}
                {opt && opt.status && <small className="ppp-opt3-st">{statusLabels[opt.status] || opt.status}</small>}
              </button>
            );
          })}
        </section>

        {/* ── Dettaglio espandibile (accordion) della opzione scelta ──────── */}
        {selectedOption && (
          <section className="ppp-detail" aria-label="Detalle de la opción">
            <RouteTimeline routeTimeline={selectedOption.routeTimeline} />
            {selectedOption.opp && <MiniZoneMap zoneMap={view.zoneMap} opp={selectedOption.opp} />}
            {selectedOption.opp?.warning && <p className="ppp-preview-warn">⚠ {selectedOption.opp.warning}</p>}
          </section>
        )}

        {/* ── Línea de servicio (PLACEHOLDER UX-1): accordion semplice, solo se
             il backend manda righe. Niente salida→entrega→regreso finché il
             contract serviceLine non lo espone (backend-first, fuori UX-1). ── */}
        {Array.isArray(view.serviceLine) && view.serviceLine.length > 0 && (
          <section className="ppp-serviceline" aria-label="Línea de servicio">
            <button type="button" className="ppp-adv-toggle" aria-expanded={showServiceLine}
              onClick={() => setShowServiceLine(v => !v)}>
              {showServiceLine ? '▾' : '▸'} Línea de servicio
            </button>
            {showServiceLine && (
              <ul className="ppp-sl-list">
                {view.serviceLine.map((e, i) => <li key={`sl-${i}`}>{serviceLineLabelOf(e)}</li>)}
              </ul>
            )}
          </section>
        )}
```

### 2.3 Stato del componente (sostituisce `selectedOppId`/`showAdvanced`)

```js
  const three = buildThreeOptions(view);
  // slot iniziale: directa se esiste, poi giro, poi alt.
  const firstSlot = three.directa ? 'directa' : three.giro ? 'giro' : three.alternativa ? 'alt' : null;
  const [selectedSlot, setSelectedSlot] = useState(firstSlot);
  const [showServiceLine, setShowServiceLine] = useState(false);
  const selectedOption = three[selectedSlot === 'alt' ? 'alternativa' : selectedSlot] || null;
  const selectOption = (opt) => labLog('preview-only', { slot: opt.slot, status: opt.status });
```

`serviceLineLabelOf` (oggi dentro `BackendSummary`, righe 807-814) va **estratto come helper top-level** per riusarlo nel placeholder. `applyBest`, `OpportunityPreview`, l'intero `ManualRouteSection` e `BackendSummary` (tranne `serviceLineLabelOf`) diventano dead code → si rimuovono.

### 2.4 CSS (additivo, in coda a `PREMIUM_PLANNER_POPUP_CSS`)

```css
.ppp-options3{ display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:18px; }
.ppp-opt3{ display:flex; flex-direction:column; gap:4px; padding:14px; border-radius:12px;
  background:var(--toneBg,rgba(255,255,255,0.03)); border:1px solid var(--toneBorder,rgba(255,255,255,0.10));
  color:#F7F8FA; cursor:pointer; text-align:left; }
.ppp-opt3.is-active{ box-shadow:0 0 0 2px var(--tone,#58E86B) inset; }
.ppp-opt3.is-empty{ opacity:0.45; cursor:not-allowed; background:rgba(255,255,255,0.02); border-style:dashed; }
.ppp-opt3-label{ font-size:12px; font-weight:800; letter-spacing:0.3px; }
.ppp-opt3-time{ font-size:22px; font-weight:900; color:var(--tone,#F7F8FA); }
.ppp-opt3-st{ font-size:11px; color:#9aa3ad; }
.ppp-detail{ margin-bottom:18px; }
.ppp-serviceline{ margin-top:6px; }
.ppp-sl-list{ margin:8px 0 0; padding-left:18px; font-size:12px; color:#aeb6bf; }
```

---

## 3. File toccati

| File | Cambio |
|---|---|
| `ladieci-app33/src/components/PremiumPlannerPopup.jsx` | **unico** file. Render body riscritto (259-407), +helper `buildThreeOptions`, +stato `selectedSlot`/`showServiceLine`, estrazione `serviceLineLabelOf`, +CSS. Rimossi `OpportunityPreview`, `ManualRouteSection`, `applyBest`, gran parte di `BackendSummary`. |

Props `manual*`/`onCalcManualRoute` restano nella firma (compat con `NuevoPedidoModal` che le passa) ma **non più usate** → si possono lasciare ignorate in UX-1 (nessun cambio al modal). Il modal continua a passarle senza effetto.

---

## 4. Cosa viene RIMOSSO

- Triplo render `opportunities[]` → "Otras opciones rápidas" + "Giros y huecos" eliminate.
- `Solo vista previa` (CTA) + `applyBest` (no-op).
- `ManualRouteSection` (builder rotte LAB Q1→Q5) dal popup operatore.
- `MiniZoneMap` dal top-grid (rientra solo dentro l'accordion dettaglio).
- `ppp-notes` / `PLANNER_NOTES_DEFAULT`.
- `OpportunityPreview` (sostituito dal dettaglio accordion).
- `BackendSummary` ridotto a sola `serviceLine` (firstAvailable/warnings/blockers escono dal summary — `firstAvailable` ora alimenta lo slot "Directa").

## 5. Cosa viene RINOMINATO / RICOLLOCATO

- `Solo vista previa` → **eliminata** (non rinominata: non promette azione, non serve in read-only).
- `best-card` "Mejor propuesta" → diventa lo slot **Directa** della riga 3-opzioni.
- `MiniZoneMap` → da top a **dentro `ppp-detail`** (on-demand).
- `RouteTimeline` → resta, come **dettaglio espandibile** dentro `ppp-detail`.
- `serviceLineLabelOf` → da locale a helper top-level.

## 6. Cosa resta PLACEHOLDER

- **Línea de servicio**: accordion semplice (lista `{hora · zone · label}`), nascosto se `serviceLine` vuoto. **Niente** `salida→entrega→regreso` per giro finché il backend non estende `serviceLine` (paso backend-first, fuori UX-1). Documentato a UI con commento, senza testo dev visibile.

---

## 7. Rischi

1. **Mapping 3-opzioni è una scelta di prodotto.** `buildThreeOptions` usa euristica (giro = primo `agregar` non bloccato; alt = primo restante non bloccato). Se il backend ordina diversamente, l'assegnazione potrebbe non combaciare con l'aspettativa operatore. → Validare con un `strategicPreview` reale prima di considerarlo chiuso.
2. **`firstAvailable` potrebbe non avere `routeTimeline`.** Lo slot Directa mostra `best.routeTimeline` come fallback; se nullo, l'accordion Directa mostra solo `RouteTimeline` vuoto (che ritorna `null` → niente, safe). Nessun crash.
3. **`MiniZoneMap` usa `opp.mapPath`** (riga 785) senza guard: se un'opp non porta `mapPath`, `.map` crasha. Latent bug pre-esistente, ora più esposto perché la mappa entra nel dettaglio. → Aggiungere guard `Array.isArray(opp.mapPath)` nel patch (incluso, 1 riga).
4. **Props manual inutilizzate**: ESLint no-unused-vars potrebbe lamentarsi. → Lasciare nella firma con commento, o prefisso `_`. Nessun impatto runtime.
5. **Regressioni visive** solo dentro il popup (read-only). Nessun rischio su Confirmar/BUG A/backend (fuori scope).

---

## 8. Test necessari (locali, no deploy)

- **Render 3 slot** con un `strategicPreview` reale: directa presente, giro presente/assente (grigio `Sin giro compatible`), alt presente/assente (grigio `Sin alternativa`).
- **Nessun slot bloccato come primario**: opp `no_recomendado`/`lleno` non finiscono in giro/alt (filtro `OPP_BLOCKED`).
- **Accordion**: click su uno slot → mostra `RouteTimeline` + `MiniZoneMap` inline; cambio slot → cambia dettaglio; nessun popup nuovo.
- **`Solo vista previa` assente**; nessun `ManualRouteSection` nel popup.
- **serviceLine**: con righe → accordion collassato apribile; vuoto → sezione nascosta.
- **Empty-state**: `data` null / contract non riconosciuto → ancora "Planner no disponible" (ramo `if (!view)` invariato).
- **No-crash mapPath**: opp senza `mapPath` non rompe la mappa.
- **Smoke build**: `npm run build` (locale) verde, nessun import/symbol orfano dopo le rimozioni.

---

## 9. Stato esecuzione — APPLICATA in locale (no commit/deploy)

Scelta utente: **(A) applica in locale**. Fatto.

- File modificato: `ladieci-app33/src/components/PremiumPlannerPopup.jsx` (**+173 / −386**, da 1157 → 876 righe).
- **Nessun commit, nessun deploy, nessun backend, nessun DB.** `NuevoPedidoModal.jsx` intatto (props `manual*`/`onCalcManualRoute` continuano a essere passate ma ora ignorate dal popup). `ORDINI_2026-05-23.md` intatto.
- **Verifica build:** CRA dev server (netlify dev :8888, già attivo) ha ricompilato a ogni save → `Compiled successfully!`, zero `Failed to compile`, zero errori/warning ESLint. *(Verifica visiva del render non eseguita: il popup si monta solo con uno `strategicPreview` reale dal backend, e netlify dev punta al DB di produzione → niente flussi che scrivono. Per refactor read-only la compilazione pulita è la prova adeguata.)*

Cleanup effettivo applicato oltre alla riscrittura del render:
- Rimossi componenti morti: `OpportunityPreview`, `ManualRouteSection` (+`MANUAL_ROUTE_ZONES`), `BackendSummary`, helper `msgOf`, consts `kindLabels` / `etaSlipBadge`, e la sezione note `PLANNER_NOTES_DEFAULT` dal render.
- Conservato `serviceLineLabelOf` (riusato dal placeholder), `RouteTimeline`, `MiniZoneMap` (+ guard `mapPath`).

Prossimi passi possibili (NON fatti):
- Provare il render aprendo il planner con dati reali e validare il mapping dei 3 slot.
- Quando il backend estende `serviceLine` (triple salida→entrega→regreso per giro), sostituire il placeholder con la linea serata vera (UX-2).
