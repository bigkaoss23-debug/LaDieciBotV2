import { useState, Fragment } from 'react';

/*
 * PremiumPlannerPopup — renderer read-only del contract strategic (no engine).
 *
 * El popup se monta SOLO con un contract strategic válido (premium-planner-
 * strategic-preview-v1). Si `data` no es un contract válido renderiza un
 * empty-state seguro, NUNCA datos fabricados (la fixture mock fue eliminada).
 * El frontend NO calcula nada: solo renderiza, selecciona localmente una
 * opportunity y hace console.debug/no-op.
 *
 * Campos provistos por el motor (no derivados aquí):
 *   - status      compatible | ajuste | no_recomendado | lleno
 *   - kind        agregar | crear   (+ giroId)
 *   - channel     sur | oeste | cross
 *   - routeEtas[] eta / promised / slips / slipLabel (ej "+5")
 *   - baseline    directEta
 *   - capacity    pizzas / routeMin / limitMin / state
 *   - blocked     bool   (mapa en rojo / "No recomendado")
 *   - warning     string ya redactado
 *
 * BACKEND REQUIREMENT — previewManualGiro / strategic opportunities:
 *   dado el pedido actual + un giro candidato, devuelve YA RESUELTO:
 *   compatibilidad, canal, ETA por parada, retraso (+N) de cada parada,
 *   baseline directa, capacidad y los flags blocked/warning. El popup
 *   nunca recalcula tiempos ni decide si un pedido entra en un giro.
 */

// Geografia statica reale del locale; no ETA, no proposte, no mock operativo.
// Solo identità zona (id ↔ quartiere reale) + color + label della mappa. È la
// UNICA fonte di questa geografia: la usa il percorso reale (adapter
// strategic). Non duplicare i valori altrove.
const LOCAL_ZONE_MAP = {
  title: 'Esquema operativo por zonas',
  caption: 'Ruta estimada:',
  seaLabel: 'MAR MEDITERRÁNEO',
  zones: [
    { id: 'Q1', name: 'Centro', color: '#0097A7', hasPizzeria: true },
    { id: 'Q2', name: 'Buenavista', color: '#CE93D8' },
    { id: 'Q3', name: 'IES', color: '#E65100' },
    { id: 'Q4', name: 'Cortijos', color: '#C2185B' },
    { id: 'Q5', name: 'Las Marinas', color: '#7CB342' },
  ],
};

// Notas genéricas del planner (copy UI presentacional, NO datos de negocio ni
// ETAs). Fallback cuando el contract backend no trae warnings/blockers propios.
// Antes vivían dentro de la fixture mock PREMIUM_PLANNER_LAB_DATA (eliminada).
const PLANNER_NOTES_DEFAULT = [
  'Las filas son oportunidades del planner, no pedidos confirmados.',
  'Tocar una fila previsualiza el impacto en el mapa, no aplica nada.',
  'Canal sur: Q1→Q2→Q5. Canal oeste: Q1→Q3→Q4. Cruzar canales no es recomendado.',
];

const zoneColors = LOCAL_ZONE_MAP.zones.reduce((acc, zone) => {
  acc[zone.id] = zone.color;
  return acc;
}, {});

// Centro visual de cada zona en el mapa (x,y en % del recuadro .ppp-map). Sirve
// para colocar el nodo/badge en el CENTRO de la zona y para unir las paradas con
// la línea de tragitto. Son coordenadas de layout (presentacional), no datos de
// negocio. Pizzería vive en el centro de Q1.
const LOCAL_ZONE_CENTERS = {
  Q1: { x: 72, y: 36 },
  Q2: { x: 64, y: 70 },
  Q3: { x: 46, y: 36 },
  Q4: { x: 18, y: 36 },
  Q5: { x: 30, y: 80 },
};
const PIZZERIA_CENTER = LOCAL_ZONE_CENTERS.Q1;

const toneStyles = {
  ok: { accent: '#58E86B', bg: 'rgba(46, 210, 88, 0.10)', border: 'rgba(66, 232, 104, 0.38)' },
  warning: { accent: '#F0C45C', bg: 'rgba(240, 178, 48, 0.09)', border: 'rgba(240, 178, 48, 0.40)' },
  manual: { accent: '#B77CFF', bg: 'rgba(145, 88, 255, 0.11)', border: 'rgba(183, 124, 255, 0.42)' },
  new: { accent: '#FF7A1A', bg: 'rgba(255, 122, 26, 0.10)', border: 'rgba(255, 122, 26, 0.42)' },
  info: { accent: '#26DCEB', bg: 'rgba(38, 220, 235, 0.08)', border: 'rgba(38, 220, 235, 0.30)' },
  blocked: { accent: '#F87171', bg: 'rgba(248, 113, 113, 0.10)', border: 'rgba(248, 113, 113, 0.42)' },
};

const statusLabels = {
  compatible: 'compatible',
  ajuste: 'ajuste',
  no_recomendado: 'no recomendado',
  lleno: 'capacidad llena',
  oportunidad: 'oportunidad',
};
const channelLabels = { sur: 'canal sur', oeste: 'canal oeste', cross: 'cruzado' };

const labLog = (eventName, payload) => {
  console.debug('[PremiumPlannerPopup LAB]', eventName, payload);
};

// ── Adapter PRESENTAZIONALE puro: contract backend → shape del renderer ───────
// REGOLA renderer-only: qui si fanno SOLO lookup di label, join di routeZones e
// pass-through di campi GIÀ CALCOLATI dal backend (eta/slip/status/capacity/
// warning). NON si calcola ETA, ritardi, slip, capacity, compatibilità,
// zone/channel, route impact, status o warning. Niente Date.now, niente parsing
// orario, niente sottrazioni di tempo.
const STRATEGIC_CONTRACT = 'premium-planner-strategic-preview-v1';

// Icona presentazionale per stato (lookup, non calcolo).
const ACTION_LABEL_BY_STATUS = { compatible: '✓', ajuste: '◷', no_recomendado: '⚠', lleno: '✕' };
const actionLabelFor = (opp) => {
  if (opp.kind === 'crear' && !opp.blocked) return '↗';
  return ACTION_LABEL_BY_STATUS[opp.status] || '•';
};
// "time" della riga = ETA GIÀ CALCOLATO dell'ultima parada (solo lettura).
const lastEtaOf = (opp) => {
  const etas = Array.isArray(opp.routeEtas) ? opp.routeEtas : [];
  return etas.length ? (etas[etas.length - 1].eta || '') : '';
};
const zoneLabelOf = (opp) => (Array.isArray(opp.routeZones) ? opp.routeZones.join('+') : '');

// Aggiunge SOLO i 3 campi presentazionali mancanti; il resto è pass-through.
const adaptOpportunity = (opp) => ({
  ...opp,
  time: opp.time || lastEtaOf(opp),
  zoneLabel: opp.zoneLabel || zoneLabelOf(opp),
  actionLabel: opp.actionLabel || actionLabelFor(opp),
});

// Contract strategic → oggetto-vista per il renderer (+ extra read-only).
// bestProposal SOLO da firstAvailable/bestProposal reali:
// niente salidaHorno/driverStatus inventati (non esistono nel contract).
const adaptStrategicContract = (contract) => {
  const opportunities = (Array.isArray(contract.opportunities) ? contract.opportunities : []).map(adaptOpportunity);
  const fa = contract.firstAvailable || null;
  const bp = contract.bestProposal || null;
  const bpFirstEta = bp && Array.isArray(bp.routeEtas) && bp.routeEtas[0] ? bp.routeEtas[0].eta : null;
  const bestProposal = {
    id: (bp && bp.id) || 'best-strategic',
    label: 'Mejor propuesta',
    entrega: (fa && fa.eta) || bpFirstEta || null,
    status: (fa && fa.status) || (bp && bp.status) || null,
    routeLabel: (bp && bp.title) || 'Directa',
    severity: (bp && bp.severity) || 'ok',
    ctaLabel: 'Seleccionar en vista previa',
    // routeTimeline: pass-through del campo additivo YA CALCULADO por el backend
    // (route-timeline-v2). No se deriva nada aquí; null si el backend no lo manda.
    routeTimeline: (bp && bp.routeTimeline) || null,
    // SIN salidaHorno / driverStatus: no están en el contract strategic.
  };
  const notesFromContract = [
    // El estado de cocina (freeze 15 min) NO se muestra al operador por ahora: el
    // backend lo sigue enviando (cocinaFrozen/cocinaState/warning) pero es ruido en
    // esta fase. Filtramos su warning de las notas; si hay un problema real de
    // cocina, el planner lo señalará como bloqueo/aviso operativo, no como estado fijo.
    ...((contract.warnings || [])
      .filter((w) => w && w.code !== 'cocina_frozen_under_15')
      .map((w) => w && w.message).filter(Boolean)),
    ...((contract.blockers || []).map((b) => b && b.message).filter(Boolean)),
  ];
  return {
    contract: contract.contract,
    mode: contract.mode || 'read_only',
    source: 'backend-readonly',
    bestProposal,
    // opp grezza del candidato diretto: serve alla mappa (mapPath/routeZones/
    // routeTimeline) quando si seleziona la proposal kind:'direct'.
    bestProposalOpp: bp ? adaptOpportunity(bp) : null,
    // proposals[]: set GIÀ ranked dal backend (premium-planner-proposal-
    // selection-v1). Pass-through puro; il renderer filtra solo i primari.
    proposals: Array.isArray(contract.proposals) ? contract.proposals : [],
    zoneMap: LOCAL_ZONE_MAP, // geografía estática real del local (no backend, no mock)
    opportunities,
    plannerNotes: notesFromContract.length ? notesFromContract : PLANNER_NOTES_DEFAULT,
    firstAvailable: fa,
    serviceLine: Array.isArray(contract.serviceLine) ? contract.serviceLine : [],
    warnings: Array.isArray(contract.warnings) ? contract.warnings : [],
    blockers: Array.isArray(contract.blockers) ? contract.blockers : [],
    safety: contract.safety || null,
  };
};

// ── UX-2: i 3 bottoni "Otras opciones rápidas" vengono dai proposals[] GIÀ
// ranked dal backend (premium-planner-proposal-selection-v1). Renderer-only:
// nessun calcolo, solo filtro/lookup. not_recommended NON entra come bottone
// primario. Ogni proposal porta id (= opp.id) per risolvere l'opportunity
// sorgente e disegnare la rotta sulla mappa.
const PROPOSAL_ROLE_COPY = {
  direct: 'Directo',
  insertion: 'Añadir al giro',
  alternative: 'Alternativa',
  not_recommended: 'No recomendado',
};

// I 3 slot primari = proposte non-bloccanti (escluso not_recommended), max 3.
const primaryProposals = (proposals) =>
  (Array.isArray(proposals) ? proposals : [])
    .filter((p) => p && p.kind !== 'not_recommended')
    .slice(0, 3);

// Risolve l'opportunity sorgente di una proposal (per la mappa: mapPath/route).
// insertion/alternative/not_recommended → match per id in opportunities[];
// direct → l'opp grezza bestProposalOpp. Lookup puro, nessun calcolo.
const resolveProposalOpp = (proposal, view) => {
  if (!proposal || !view) return null;
  const opps = Array.isArray(view.opportunities) ? view.opportunities : [];
  const found = opps.find((o) => o && o.id === proposal.id);
  if (found) return found;
  if (proposal.kind === 'direct') return view.bestProposalOpp || null;
  return null;
};

// rowKey di una riga serviceLine: DEVE combaciare col render delle righe e con il
// lookup del legame proposta↔giro. Lookup puro, nessun calcolo.
const slRowKey = (e, i) => (e && e.id != null ? String(e.id) : `sl-${i}`);

// giroId trasportato da una proposta: diretto (proposal.giroId) o dalla sua opp
// sorgente (opp.giroId). È la chiave REALE del backend per legare proposta↔giro;
// se manca, la proposta non ha riga collegabile (nessun dato inventato qui).
const proposalGiroId = (proposal, view) => {
  if (!proposal) return null;
  if (proposal.giroId != null) return String(proposal.giroId);
  const opp = resolveProposalOpp(proposal, view);
  return opp && opp.giroId != null ? String(opp.giroId) : null;
};

// RIDER_SAVING_MIN (informativo, mai bloccante): copy del chip "Ahorra N min rider".
// Legge SOLO riderSavingMin del backend (combinedDurationMin/separateDurationMin NON
// si mostrano). null/undefined o <=0 → niente chip (no invenzione, no crash).
const formatRiderSavingChip = (proposal) => {
  const n = proposal && Number(proposal.riderSavingMin);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `🛵 Ahorra ${n} min rider`;
};

const PremiumPlannerPopup = ({
  onClose,
  data = null,
  labWarning = '',
  loading = false,
  // ── Ruta manual LAB (click-zona → previewManualGiroRoute) ──────────────────
  // Todos OPCIONALES: si onCalcManualRoute no se provee, la sección manual no se
  // renderiza → comportamiento idéntico al uso solo-strategic (sin romper nada).
  manualCurrentZone = null,   // zona del pedido actual ya resuelta (o null)
  manualStartTime = null,     // hora del draft (startTime explícito, o null)
  manualRoutePreview = null,  // contract premium-planner-manual-giro-route-preview-v1
  manualRouteLoading = false,
  manualRouteWarning = '',
  onCalcManualRoute = null,   // (selectedStops) => void  — el modal valida + llama backend
  onClearManualRoute = null,  // () => void
  // onApplyHora(time): aplica la hora de la propuesta al draft del pedido. Si el
  // contenedor NO lo pasa, el botón "Aplicar propuesta" no se renderiza (sin no-op).
  onApplyHora = null,
  // nextGiroOpportunity (task 47): hint "Próximo giro" da previewOrderPlanner. Si
  // se provee, se inyecta como SEGUNDA opción/chip ámbar "oportunidad" (no aplica
  // automáticamente, botón prudente). null → comportamiento idéntico al anterior.
  nextGiroOpportunity = null,
  // FIX 1 (init selection): si true y existe el chip oportunidad, el popup arranca
  // seleccionado en "Encajar …" (no en la best). Se usa al abrir desde la fila
  // "Próximo giro" de Nuevo Pedido. false → comportamiento normal (best/recommended).
  initialFocusOpportunity = false,
}) => {
  // Fuente de datos: SOLO el contract backend read-only si es válido. Sin él,
  // view=null → empty-state seguro abajo. NO hay fallback a fixture mock (eliminada):
  // el popup nunca renderiza ETAs fabricadas.
  const isStrategic = !!(data && data.contract === STRATEGIC_CONTRACT);
  const view = isStrategic ? adaptStrategicContract(data) : null;
  // ── UX-2: 3 bottoni dai proposals[] ranked del backend ──
  // Synthetic "Próximo giro" (task 47): se il container passa nextGiroOpportunity
  // (da previewOrderPlanner) e nessuna proposta reale copre già quel giro futuro,
  // lo inseriamo come SECONDA opzione (chip ámbar "oportunidad"). NON è applicabile
  // come il diretto: il bottone resta prudente (review), nessun verde ingannevole.
  const baseProposals = Array.isArray(view?.proposals) ? view.proposals : [];
  // task 54: el chip "Encajar Q5" debe ser una PREVIEW REAL. El backend YA calcula
  // la inserción del pedido en ese giro y la expone en proposals[] (kind
  // not_recommended, mismo ancla) CON timeLabel/zoneLabel/routeTimeline reales —
  // solo queda oculta porque va clasificada como no recomendada. Aquí buscamos esa
  // propuesta real por el ancla del hint (giroId === anchorOrderId) y la usamos como
  // chip oportunidad: así mapa/timeline/warning/entrega salen del backend, no de un
  // sintético. Lookup puro (proposalGiroId resuelve por opportunity).
  const realInsertionProposal = (() => {
    const ng = nextGiroOpportunity;
    if (!ng || ng.anchorOrderId == null) return null;
    return baseProposals.find((p) => p && proposalGiroId(p, view) === String(ng.anchorOrderId)) || null;
  })();
  const syntheticNextGiro = (() => {
    const ng = nextGiroOpportunity;
    if (!ng || !ng.zone || !ng.hora) return null;
    // dedup: se una proposta PRIMARIA reale copre già la stessa hora+zona, non duplichiamo.
    const dup = baseProposals.some((p) =>
      p && p.kind !== 'not_recommended' && p.timeLabel === ng.hora &&
      String(p.zoneLabel || '').toUpperCase().includes(String(ng.zone).toUpperCase()));
    if (dup) return null;
    if (realInsertionProposal) {
      // PREVIEW REAL: chip enganchada a la propuesta de inserción del backend.
      // Conserva id (→ resolveProposalOpp encuentra la opportunity con mapPath/
      // routeTimeline → mapa Pizzería→Q2→Q5), timeLabel (entrega del nuevo pedido
      // en el giro), zoneLabel y routeTimeline reales. Solo reetiquetamos como
      // oportunidad y exponemos el warning calculado.
      return {
        ...realInsertionProposal,
        kind: 'opportunity',
        isOpportunity: true,
        hasRealRoute: true,
        // copy OPERATIVA: el chip dice "Usar giro Q5" (acción clara), la card dice
        // "Giro compatible Q5" (anchorZone). Sin `oportunidad` ni `Encajar` técnico.
        label: `Usar giro ${ng.zone}`,
        anchorZone: ng.zone,
        zoneLabel: realInsertionProposal.zoneLabel || ng.zone,
        status: 'oportunidad',
        recommended: false,
      };
    }
    // ALIGN_NEXT_GIRO_WITH_STRATEGIC: SIN propuesta real de inserción que respalde el
    // hint, NO se genera chip. Regla de producto: cada chip/botón confirmable del
    // planner debe representar una propuesta COMPLETA (proposal/opportunity real con
    // routeTimeline + route/mapa + giroId coherentes). El hint `nextGiroOpportunity`
    // (de previewOrderPlanner) y las proposals[] (de previewStrategicOpportunities)
    // son dos contratos distintos; cuando divergen (Q2 no es anchor con ruta en el
    // estratégico: zona aún sin resolver, candidato cross/missing-travel, etc.) el
    // chip ligero "Usar giro X" sin ruta era una promesa que el resto del contrato no
    // podía cumplir → "chip Q2 / mapa Pizzería→Q1". Antes que inventar una ruta en el
    // frontend (prohibido), NO mostramos un chip confirmable sin respaldo: el operador
    // ve solo las propuestas reales. El hint sigue vivo en la fila "Próximo giro" de
    // Nuevo Pedido; abrir el planner recalcula. (No clickable secundario = opción B,
    // descartada: A preferida.)
    return null;
  })();
  // Augmented: [primo primario (direct), synthetic, ...resto primari, ...not_rec].
  const allProposals = (() => {
    if (!syntheticNextGiro) return baseProposals;
    // task 54: si la chip encarna una propuesta REAL (mismo id), la quitamos de la
    // base para no duplicarla — la chip ya la representa con su ruta real.
    const base = syntheticNextGiro.hasRealRoute
      ? baseProposals.filter((p) => p && p.id !== syntheticNextGiro.id)
      : baseProposals;
    const primaries = base.filter((p) => p && p.kind !== 'not_recommended');
    const notRec = base.filter((p) => p && p.kind === 'not_recommended');
    return [...primaries.slice(0, 1), syntheticNextGiro, ...primaries.slice(1), ...notRec];
  })();
  const proposals3 = primaryProposals(allProposals);
  // "Mejor propuesta" = la proposta RECOMMENDED scelta dal backend (rank 1),
  // non più il diretto fisso: quando il diretto è in conflitto rider il backend
  // promuove il giro compatibile come recommended → la card lo riflette. Render
  // puro (nessun calcolo qui): legge i campi GIÀ decisi dal contract.
  const recommendedProposal = allProposals.find((p) => p && p.recommended) || proposals3[0] || null;
  // FIX_36: la card NON deve dire "Mejor propuesta" (verde, consigliata) quando la
  // proposta in cima è INSICURA (status no_recomendado o conflitto rider): per
  // l'operatore sarebbe fuorviante. In quel caso → copy prudente + stile d'avviso.
  // Con status compatible/ajuste resta "Mejor propuesta" verde come prima.
  const serviceLine = Array.isArray(view?.serviceLine) ? view.serviceLine : [];
  // Default = prima proposta PRIMARIA (mai una not_recommended come selezione iniziale).
  const firstId = (proposals3[0] && proposals3[0].id) || (allProposals[0] && allProposals[0].id) || null;
  // FIX 1: si se abrió enfocando la oportunidad y el chip existe, arrancamos
  // seleccionados en él; si no existe (ya no hay proposal), fallback a la best.
  const initialSelectedId = (initialFocusOpportunity && syntheticNextGiro)
    ? syntheticNextGiro.id
    : firstId;
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  // Resuelve la fila "Giros y huecos" (key serviceLine) a partir del giroId del backend.
  const giroIdToRowKey = (gid) => {
    if (gid == null) return null;
    const idx = serviceLine.findIndex((e, i) => slRowKey(e, i) === String(gid));
    return idx >= 0 ? slRowKey(serviceLine[idx], idx) : null;
  };
  // single-timeline: la fila del giro ligado a la proposta seleccionada arranca YA
  // expandida → el detalle de la route vive DENTRO de "Giros y huecos" (no en un
  // bloque "Línea del giro" separado encima de los chips).
  const initialSelProp = allProposals.find((p) => p.id === initialSelectedId) || null;
  const initialOpenGiro = initialSelProp ? giroIdToRowKey(proposalGiroId(initialSelProp, view)) : null;
  const [openGiro, setOpenGiro] = useState(initialOpenGiro);
  const selectedProposal = allProposals.find((p) => p.id === selectedId) || allProposals[0] || null;

  // ── Card grande: di default mostra la RECOMMENDED (comportamento storico invariato).
  // Eccezione (task 47): se è selezionato il chip OPPORTUNITY sintetico, la card mostra
  // quell'opportunità (Entrega 22:00 · Encajar Q5 · oportunidad). Le proposte reali
  // (direct/insertion/no_recomendado) NON cambiano la card → fallback Aplicar invariato.
  const cardProposal = (selectedProposal && selectedProposal.isOpportunity)
    ? selectedProposal
    : recommendedProposal;
  const cardIsOpportunity = !!(cardProposal && cardProposal.isOpportunity);
  const bestUnsafe = cardIsOpportunity || !!(
    cardProposal
      ? (cardProposal.status === 'no_recomendado' || cardProposal.riderConflict === true)
      : (view?.bestProposal && (view.bestProposal.status === 'no_recomendado' || view.bestProposal.riderConflict === true))
  );
  const bestForCard = cardProposal
    ? {
        label: cardIsOpportunity
          // card title operativo: "Giro compatible Q5" (anchorZone). El chip lleva la
          // acción "Usar giro Q5"; la ruta ("Q2 → Q5") va como routeLabel.
          ? `Giro compatible ${cardProposal.anchorZone || cardProposal.zoneLabel || ''}`.trim()
          : (bestUnsafe ? 'Sin propuesta recomendable' : 'Mejor propuesta'),
        unsafe: bestUnsafe,
        opportunity: cardIsOpportunity,
        entrega: cardProposal.timeLabel || (view?.bestProposal && view.bestProposal.entrega) || null,
        status: cardIsOpportunity ? 'oportunidad' : (cardProposal.status || (view?.bestProposal && view.bestProposal.status) || null),
        routeLabel: cardIsOpportunity
          ? (cardProposal.hasRealRoute
              ? `Ruta ${cardProposal.zoneLabel || ''}`.trim()   // ej. "Ruta Q2 → Q5 (sur)"
              : 'Próximo giro · revisar en Giros y huecos')
          : (cardProposal.label || PROPOSAL_ROLE_COPY[cardProposal.kind] || (view?.bestProposal && view.bestProposal.routeLabel) || null),
      }
    : (view?.bestProposal || {});

  // PLANNER_COCINA_FREEZE_15_MIN — el chip de estado cocina ("Cocina estable/
  // congelada · NN min") se RETIRA de la UI del operador por ahora: era ruido y no
  // ayudaba a decidir. El backend sigue enviando cocinaFrozen/cocinaState/
  // minutesToSalida + warning (contract intacto); el frontend simplemente no los
  // pinta en la card. Si hay un problema real de cocina, el planner lo expresa como
  // bloqueo/aviso operativo, no como estado permanente. (No se calcula nada aquí.)

  // ── Ponte proposta ↔ riga "Giros y huecos" (per giroId reale del backend) ──
  // La proposta insertion porta il giroId del giro su cui inserisce; la riga
  // serviceLine porta il suo id. Il link è giroId === row.id. Lookup puro.
  const rowKeyForProposal = (p) => giroIdToRowKey(proposalGiroId(p, view));
  const proposalForRowKey = (key) => {
    if (key == null) return null;
    return allProposals.find((p) => proposalGiroId(p, view) === key) || null;
  };

  // Clic su un box proposta: seleziona + apre/scrolla la riga giro collegata (se c'è).
  const onSelectProposal = (p) => {
    if (!p) return;
    setSelectedId(p.id);
    // single-timeline: abre la fila del giro ligado (incluida la oportunidad, que
    // ahora muestra su route combinada DENTRO de esa fila). Sin giro ligado (p.ej.
    // direct "crear") → null (colapsa): su route ya vive en card+mapa.
    const rk = rowKeyForProposal(p);
    setOpenGiro(rk);
    if (rk && typeof document !== 'undefined') {
      const el = document.getElementById(`ppp-sl-${rk}`);
      try { if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
    }
    labLog('preview-only', { id: p.id, kind: p.kind, status: p.status });
  };

  // Clic su una riga giro: espande/chiude; se la riga è collegata a una proposta,
  // sincronizza la selezione così che mappa + Aplicar la seguano.
  const onToggleRow = (key) => {
    const willOpen = openGiro !== key;
    setOpenGiro(willOpen ? key : null);
    if (willOpen) {
      const p = proposalForRowKey(key);
      if (p) setSelectedId(p.id);
    }
  };

  // ── Mappa: riflette la SELEZIONE (proposta o riga giro), mai disaccoppiata. ──
  // Se è aperta una riga giro che NON corrisponde a una proposta, la mappa mostra
  // la rotta di QUELLA riga (sintetizzata dai soli timestamp/zona del backend).
  const openRowEntry = openGiro != null ? (serviceLine.find((e, i) => slRowKey(e, i) === openGiro) || null) : null;
  const openRowProposal = proposalForRowKey(openGiro);
  // Riga "Giros y huecos" del giro collegato alla proposta SELEZIONATA (via giroId
  // reale del backend), se esiste. Serve a far seguire la mappa al giro scelto.
  const selectedGiroRowKey = selectedProposal ? giroIdToRowKey(proposalGiroId(selectedProposal, view)) : null;
  const selectedGiroEntry = selectedGiroRowKey != null
    ? (serviceLine.find((e, i) => slRowKey(e, i) === selectedGiroRowKey) || null)
    : null;
  // La mappa segue SEMPRE la proposta selezionata, in quest'ordine di verità:
  //   1) riga giro aperta che non è una proposta → la sua linea;
  //   2) proposta con route reale (resolveProposalOpp) → quella route completa
  //      (p.ej. "Usar giro Q2" con ruta Pizzería→Q1→Q2 ya calculada por backend);
  //   3) proposta-oportunidad SIN route propia pero ligada a un giro existente →
  //      la linea de ESE giro (serviceLine). NUNCA el directo Q1: evita la
  //      incoherencia "chip dice Usar giro Q2 / mapa muestra Pizzería→Q1";
  //   4) proposta-oportunidad sin route NI giro de respaldo → mapa NEUTRO (sin
  //      claim de ruta): el chip queda como hint "revisar en Giros y huecos" sin
  //      que el mapa finja el directo como si fuese el giro;
  //   5) por defecto (directo/best) → la route del pedido actual.
  const selectedOpp = (() => {
    if (openRowEntry && !openRowProposal) return serviceLineOpp(openRowEntry, openGiro);
    const resolved = resolveProposalOpp(selectedProposal, view);
    if (resolved) return resolved;
    if (selectedProposal && selectedProposal.isOpportunity) {
      if (selectedGiroEntry) return serviceLineOpp(selectedGiroEntry, selectedGiroRowKey);
      return { id: `opp-neutral-${selectedProposal.id || 'x'}`, severity: 'info', blocked: false, routeZones: [], mapPath: [], routeTimeline: null };
    }
    return view ? view.bestProposalOpp : null;
  })();

  // ── Aplicar: applica la proposta SELEZIONATA; mai una no_recomendado/blocked.
  // Se la selezione non è applicabile → fallback sicuro alla mejor/recommended. ──
  const isApplicable = (p) => !!p && !p.isOpportunity && p.kind !== 'not_recommended' && p.status !== 'no_recomendado' && !p.blocked;
  const applyProposal = isApplicable(selectedProposal) ? selectedProposal : null;
  const applyTime = (applyProposal && applyProposal.timeLabel) || bestForCard.entrega || null;
  const applyIsRecommended = !applyProposal || applyProposal.timeLabel === bestForCard.entrega;
  // FIX_38: cuando NO hay propuesta aplicable (selección no_recomendado/blocked) el
  // botón cae a la hora de la card; si esa card es la insegura (rider ocupado), el
  // botón no debe seguir verde "Aplicar propuesta". Copy/estilo prudente coherente
  // con FIX_36 (misma señal `bestForCard.unsafe`). NO cambia la lógica de aplicar.
  const applyUnsafe = !applyProposal && !!bestForCard.unsafe;

  // Sin contract strategic válido → empty-state seguro. La fixture mock fue
  // eliminada, así que aquí NO se renderiza ninguna propuesta inventada. En el
  // flujo V1 el popup se monta solo con `strategicPreview` válido, por lo que
  // este ramo es la red de seguridad ante data null / contract no reconocido.
  if (!view) {
    return (
      <div className="ppp-overlay" onClick={onClose}>
        <style>{PREMIUM_PLANNER_POPUP_CSS}</style>
        <section className="ppp-shell" aria-label="Propuestas de entrega" onClick={e => e.stopPropagation()}>
          <header className="ppp-header">
            <div className="ppp-brand-mark" aria-hidden="true">
              <span>✦</span>
              <span>✦</span>
              <span>✦</span>
            </div>
            <h2>Propuestas de entrega</h2>
            <span className="ppp-lab-pill">No disponible</span>
            <button type="button" className="ppp-close" onClick={onClose} aria-label="Cerrar propuestas">×</button>
          </header>
          <p className="ppp-lab-warn" role="status">⚠ Planner no disponible · usa la hora manual.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="ppp-overlay" onClick={onClose}>
      <style>{PREMIUM_PLANNER_POPUP_CSS}</style>
      <section className="ppp-shell" aria-label="Propuestas de entrega" onClick={e => e.stopPropagation()}>
        <header className="ppp-header">
          <div className="ppp-brand-mark" aria-hidden="true">
            <span>✦</span>
            <span>✦</span>
            <span>✦</span>
          </div>
          <h2>Propuestas de entrega</h2>
          <span className="ppp-lab-pill">{loading ? 'Consultando…' : 'Vista previa'}</span>
          <button type="button" className="ppp-close" onClick={onClose} aria-label="Cerrar propuestas">×</button>
        </header>

        {loading && (
          <p className="ppp-lab-loading" role="status" aria-live="polite">
            ⟳ Consultando… <span>vista previa mientras tanto</span>
          </p>
        )}

        {!loading && labWarning && (
          <p className="ppp-lab-warn" role="status">⚠ {labWarning}</p>
        )}

        {/* ── TOP: Mejor propuesta (izq) + mapa de zonas con la ruta (der) ── */}
        <div className="ppp-top-grid">
          <section
            className={'ppp-best-card' + (bestForCard.opportunity ? ' is-opportunity' : (bestForCard.unsafe ? ' is-unsafe' : ''))}
            aria-label={bestForCard.label || 'Mejor propuesta'}
          >
            <div className="ppp-best-label">
              <span>{bestForCard.opportunity ? '✓' : (bestForCard.unsafe ? '⚠' : '✦')}</span>
              <strong>{bestForCard.label || 'Mejor propuesta'}</strong>
            </div>
            {/* Para un giro compatible la hora grande es la del cliente (Q2): "Entrega
                cliente 18:54". Para el resto, "Entrega HH:MM" como siempre. */}
            <h3>{bestForCard.opportunity ? 'Entrega cliente ' : 'Entrega '}{bestForCard.entrega || '—'}</h3>
            {bestForCard.routeLabel && <p className="ppp-type">{bestForCard.routeLabel}</p>}
            {/* RIDER_SAVING_MIN: chip informativo "Ahorra N min rider" bajo la ruta.
                Solo si el backend manda riderSavingMin>0; nunca bloquea ni cambia
                status. combinedDurationMin/separateDurationMin NO se muestran. */}
            {formatRiderSavingChip(cardProposal) && (
              <p className="ppp-rider-saving">{formatRiderSavingChip(cardProposal)}</p>
            )}
            {/* Chip de estado cocina RETIRADO de la UI del operador (ruido en esta
                fase). Backend sigue enviando los campos; no se pintan aquí. */}
            {/* status técnico ("oportunidad") NO se muestra para el giro compatible. */}
            {bestForCard.status && !bestForCard.opportunity && <p className="ppp-type">{statusLabels[bestForCard.status] || bestForCard.status}</p>}
            {bestForCard.unsafe && !bestForCard.opportunity && <p className="ppp-warn-note">El rider ya está ocupado. Revisar antes de confirmar.</p>}
            {/* card SECA para giro compatible: título + entrega cliente + ruta + botón.
                El impacto del ancla (Q5 +6) NO se repite aquí — vive en "Giros y
                huecos" donde se ve el giro. Caso degenerado sin ruta real → único hint. */}
            {bestForCard.opportunity && !(cardProposal && cardProposal.hasRealRoute) && (
              <p className="ppp-warn-note ppp-warn-soft">Próximo giro · revisar en Giros y huecos.</p>
            )}
            {/* Botón real SOLO si el contenedor pasa onApplyHora (aplica la hora al
                draft). Sin ese prop no se renderiza → cero no-op fantasma. */}
            {onApplyHora && applyTime && (
              <button
                type="button"
                className={'ppp-apply' + (applyUnsafe ? ' is-warning' : '')}
                title={applyUnsafe ? 'Confirma el giro: pequeño impacto en el giro existente' : undefined}
                onClick={() => onApplyHora(applyTime)}
              >
                {bestForCard.opportunity
                  ? 'Confirmar giro compatible'
                  : (applyUnsafe
                      ? 'Revisar antes de aplicar'
                      : (applyIsRecommended ? 'Aplicar propuesta' : `Aplicar ${applyTime}`))}
              </button>
            )}
          </section>

          {/* La mappa riflette la proposta selezionata (default: la diretta/best). */}
          <MiniZoneMap zoneMap={view.zoneMap} opp={selectedOpp} />
        </div>

        {/* single-timeline (task UI fix): NO hay bloque "Línea del giro" separado
            encima de los chips. El detalle de la route seleccionada vive DENTRO de
            "Giros y huecos" (acordeón de la fila del giro ligado). Los 3 chips quedan
            siempre estables justo bajo card+mapa. */}

        {/* ── 3 bottoni (più piccoli): proposals[] ranked del backend. not_recommended
            resta fuori dai primari; slot mancanti → grigio/disabled. ── */}
        <section className="ppp-props" aria-label="Otras opciones rápidas">
          {[0, 1, 2].map((i) => {
            const p = proposals3[i];
            const opp = p ? resolveProposalOpp(p, view) : null;
            const tone = p
              ? (p.isOpportunity ? toneStyles.warning : (toneStyles[opp?.severity] || toneStyles.ok))
              : toneStyles.info;
            const isSel = p && selectedId === p.id;
            return (
              <button
                key={p ? p.id : `empty-${i}`}
                type="button"
                className={`ppp-prop${p ? '' : ' is-empty'}${isSel ? ' is-active' : ''}`}
                style={p ? { '--tone': tone.accent, '--toneBg': tone.bg, '--toneBorder': tone.border } : undefined}
                disabled={!p}
                aria-pressed={!!isSel}
                onClick={() => onSelectProposal(p)}
              >
                <span className="ppp-prop-time">{p ? (p.timeLabel || '—') : '—'}</span>
                <span className="ppp-prop-title">{p ? (p.label || PROPOSAL_ROLE_COPY[p.kind] || 'Opción') : 'Sin opción'}</span>
                {/* el chip "Usar giro Q5" NO muestra el status técnico `oportunidad`:
                    en su lugar la ruta (zoneLabel). El resto mantiene su status. */}
                {p && !p.isOpportunity && p.status && <small className="ppp-prop-st">{statusLabels[p.status] || p.status}</small>}
                {p && (p.isOpportunity || !p.status) && p.zoneLabel && <small className="ppp-prop-st">{p.zoneLabel}</small>}
              </button>
            );
          })}
        </section>

        {/* ── Giros y huecos: OTROS giros de la tarde (no el pedido actual, que vive
            arriba en card+mapa). Cada giro = una fila horizontal (salida → entrega →
            regreso); click → despliega la línea vertical para decidir si insertar.
            Datos reales del backend (serviceLine v2). Sin otros giros → empty-state
            (la sección NO desaparece). ── */}
        <section className="ppp-timeline-card">
          <div className="ppp-card-title">
            <h3><span>↻</span> Giros y huecos</h3>
          </div>
          {!(serviceLine.length > 0) ? (
            <p className="ppp-sl-empty">No hay otros giros esta tarde · entrega directa sugerida arriba.</p>
          ) : (
            <div className="ppp-sl-rows">
              {serviceLine.map((e, i) => {
                const key = slRowKey(e, i);
                const open = openGiro === key;
                const linkedP = proposalForRowKey(key);
                const rowActive = !!(linkedP && selectedId === linkedP.id);
                // single-timeline: si esta fila es la del giro ligado a la proposta
                // SELECCIONADA y esa proposta trae una route combinada (Encajar Q5 →
                // Pizzería→Q2→Q5), el detalle muestra ESA route real; si no, la línea
                // propia del giro existente. Datos backend, render-only.
                const rowIsPreview = !!(rowActive && selectedOpp && selectedOpp.routeTimeline);
                const rowDetailTimeline = rowIsPreview ? selectedOpp.routeTimeline : serviceLineTimeline(e);
                // título claro: si es la preview con el nuevo pedido, dilo; si es la
                // línea del giro existente, "Giro actual".
                const rowDetailTitle = rowIsPreview ? 'Vista previa con el nuevo pedido' : 'Giro actual';
                // task: cuando "Encajar …" está seleccionado, la fila compacta deja de
                // mostrar el giro VIEJO (salida/entrega/regreso del ancla) y muestra la
                // PREVIEW útil con el nuevo pedido dentro: Salida → cada entrega (la del
                // pedido nuevo destacada como "Hora cliente", verde) → Regreso.
                const legs = rowIsPreview ? previewLegsFromTimeline(rowDetailTimeline) : null;
                return (
                  <div className={`ppp-sl-row${open ? ' is-open' : ''}${rowActive ? ' is-active' : ''}`} id={`ppp-sl-${key}`} key={key}>
                    <button
                      type="button"
                      className="ppp-sl-head"
                      aria-expanded={open}
                      onClick={() => onToggleRow(key)}
                    >
                      {legs ? (
                        <>
                          <span className="ppp-sl-zone">{(legs.deliveries.map((d) => d.zone).join(' + ')) || e.zone}</span>
                          <span className="ppp-sl-leg"><i>Salida</i><b>{legs.salida || '—'}</b></span>
                          {legs.deliveries.map((d, di) => (
                            <Fragment key={`${key}-leg-${di}`}>
                              <span className="ppp-sl-arrow" aria-hidden="true">→</span>
                              <span className={`ppp-sl-leg${d.isNew ? ' is-client' : ''}`}>
                                {/* pedido nuevo = chip verde "Cliente HH:MM" (la hora a
                                    proponer). Ancla = "Entrega Q5"; si se mueve, slip
                                    pequeño ámbar "(+6)", no alarma roja. */}
                                <i>{d.isNew ? 'Cliente' : `Entrega ${d.zone}`}</i>
                                <b>
                                  {d.eta || '—'}
                                  {!d.isNew && d.delay && (
                                    <em className={`ppp-sl-slip band-${d.delay.band}`}>{d.delay.label}</em>
                                  )}
                                </b>
                              </span>
                            </Fragment>
                          ))}
                          <span className="ppp-sl-arrow" aria-hidden="true">→</span>
                          <span className="ppp-sl-leg"><i>Regreso</i><b>{legs.regreso || '—'}</b></span>
                          <span className="ppp-sl-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
                        </>
                      ) : (
                        <>
                          <span className="ppp-sl-zone">{e.zone}</span>
                          <span className="ppp-sl-leg"><i>Salida</i><b>{e.salida || '—'}</b></span>
                          <span className="ppp-sl-arrow" aria-hidden="true">→</span>
                          <span className="ppp-sl-leg"><i>Entrega</i><b>{e.entrega || e.promised || '—'}</b></span>
                          <span className="ppp-sl-arrow" aria-hidden="true">→</span>
                          <span className="ppp-sl-leg"><i>Regreso</i><b>{e.regreso || '—'}</b></span>
                          {Number.isFinite(e.pizzas) && e.pizzas > 0 && <span className="ppp-sl-pz">{e.pizzas} pz</span>}
                          <span className="ppp-sl-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
                        </>
                      )}
                    </button>
                    {open && (
                      <div className="ppp-sl-detail">
                        <RouteTimeline routeTimeline={rowDetailTimeline} compact title={rowDetailTitle} clientAcceptance={rowIsPreview} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Notas del planner ── */}
        {Array.isArray(view.plannerNotes) && view.plannerNotes.length > 0 && (
          <section className="ppp-notes" aria-label="Notas del planner">
            <h3><span>♧</span> Notas del planner</h3>
            <ul>
              {view.plannerNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </section>
        )}
      </section>
    </div>
  );
};

// ── RouteTimeline — renderer PURO del campo additivo `routeTimeline` ──────────
// Dibuja la línea del giro Pizzería → entregas → Regreso usando SOLO datos YA
// CALCULADOS por el backend (contract route-timeline-v2). REGLA renderer-only:
// aquí NO se calcula ETA, retraso, margen, capacity, status, risk, compatibilidad
// ni route impact; no hay Date.now, ni parsing HH:MM, ni aritmética de horas. Lo
// único que se hace con los nodos es copiar+ordenar por el `seq` numérico que el
// backend ya provee (rendering, no business) y mapear status/risk a clases/labels.
const RT_RISK_LABELS = {
  ok: 'OK',
  tight: 'Margen justo',
  warning: 'Con ajuste',
  no_recomendado: 'No recomendado',
  blocked: 'Bloqueado',
  full: 'Lleno',
};
const RT_NODE_TYPE_LABELS = { departure: 'Salida', delivery: 'Entrega', return: 'Regreso' };

const RouteTimeline = ({ routeTimeline, compact = false, title = 'Línea del giro', clientAcceptance = false }) => {
  // Fallback seguro: sin routeTimeline o sin timeline[] → no render (UI actual intacta).
  if (!routeTimeline || !Array.isArray(routeTimeline.timeline) || routeTimeline.timeline.length === 0) {
    return null;
  }
  // Copia + sort por el `seq` numérico YA dado por el backend (rendering, no lógica).
  const nodes = [...routeTimeline.timeline].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const summary = routeTimeline.summary || null;
  const risk = routeTimeline.risk || null;
  // `No recomendado` como badge rojo SOLO para peligro operativo real (rompe el
  // ancla, retrasa un pedido confirmado, rider no disponible, capacidad). Cuando
  // estamos previsualizando encajar el nuevo pedido en un giro (clientAcceptance),
  // un `no_recomendado` significa solo "el cliente debe aceptar la nueva hora":
  // lo traducimos a un aviso ámbar operativo, no a una alarma roja confusa.
  const softNoRec = clientAcceptance && risk === 'no_recomendado';
  const riskLabel = softNoRec ? 'Confirmar con cliente' : (risk ? (RT_RISK_LABELS[risk] || risk) : null);
  const riskCls = softNoRec ? 'rt-warning' : `rt-${risk}`;
  // En preview de encaje (clientAcceptance): NO mostramos el operatorMessage crudo
  // del backend ("Q2 se mueve +99 min · Q5 se mueve +6 min"), ni el summary
  // (Entrega giro / Regreso), ni un aviso redundante "Confirmar antes de aplicar":
  // el badge `Confirmar con cliente` (arriba) + el impacto Q5 en la fila compacta ya
  // lo dicen. Queda solo: título + badge + timeline limpia. Fuera de preview, intacto.
  const showSummary = !clientAcceptance && summary
    && (summary.directEta || summary.giroEta || summary.returnEta || summary.tradeoffLabel);

  return (
    <section className={`ppp-rt${compact ? ' is-compact' : ''}`} aria-label={title}>
      <header className="ppp-rt-head">
        <h3><span>🛵</span> {title}</h3>
        {riskLabel && <span className={`ppp-rt-risk ${riskCls}`}>{riskLabel}</span>}
      </header>

      {!clientAcceptance && routeTimeline.operatorMessage && (
        <p className="ppp-rt-msg">{routeTimeline.operatorMessage}</p>
      )}

      {showSummary && (
        <dl className="ppp-rt-summary">
          {summary.directEta && (<div><dt>Directa</dt><dd>{summary.directEta}</dd></div>)}
          {summary.giroEta && (<div><dt>Entrega giro</dt><dd>{summary.giroEta}</dd></div>)}
          {summary.returnEta && (<div><dt>Regreso</dt><dd>{summary.returnEta}</dd></div>)}
          {summary.tradeoffLabel && (<div><dt>Balance</dt><dd>{summary.tradeoffLabel}</dd></div>)}
        </dl>
      )}

      <ol className="ppp-rt-line">
        {nodes.map((node, i) => {
          // subtítulo humano de la parada: el pedido nuevo = "Entrega cliente";
          // el pedido del giro (ancla) = "Entrega giro"; resto = Salida/Regreso.
          const typeLabel = node.type === 'delivery'
            ? (node.isNewOrder ? 'Entrega cliente' : (node.isAnchor ? 'Entrega giro' : 'Entrega'))
            : (RT_NODE_TYPE_LABELS[node.type] || node.type || '');
          const status = node.status || null;
          // Chip de retraso por parada (semáforo) SOLO para anclas (pedido ya
          // confirmado que se mueve). El nuevo pedido muestra su hora propuesta, no
          // un retraso. Lee el slip YA calculado por el backend; null → sin chip.
          const delay = (node.type === 'delivery' && !node.isNewOrder)
            ? delayChipFromSlip(node.slipLabel)
            : null;
          const cls = [
            'ppp-rt-node',
            `rt-type-${node.type || 'x'}`,
            status ? `rt-st-${status}` : '',
            node.isNewOrder ? 'is-new' : '',
            node.isAnchor ? 'is-anchor' : '',
          ].filter(Boolean).join(' ');
          return (
            <li key={`${node.seq ?? i}-${node.type || 'x'}-${node.zone || ''}`} className={cls}>
              <span className="ppp-rt-dot" aria-hidden="true" />
              <div className="ppp-rt-body">
                <div className="ppp-rt-top">
                  <strong className="ppp-rt-label">{node.label || typeLabel}</strong>
                  {node.eta && <span className="ppp-rt-eta">{node.eta}</span>}
                </div>
                {/* meta DEPURADA para el operador: solo tipo de parada + zona. Se
                    quitan badges/labels técnicos (`nuevo`, `en giro`, `prometido`,
                    slip `-118 vs prometido`, `+0 margen`) y el warning crudo en
                    minutos: son ruido de debug o duplican lo que ya dice la fila
                    compacta + el aviso humano de la card. El pedido nuevo se sigue
                    distinguiendo por el color del nodo (.is-new). */}
                <div className="ppp-rt-meta">
                  <span className="ppp-rt-kind">{typeLabel}</span>
                  {node.zone && <span className="ppp-rt-zone">{node.zone}</span>}
                  {delay && <span className={`ppp-rt-delay band-${delay.band}`}>{delay.label}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};


const MiniZoneMap = ({ zoneMap, opp }) => {
  const zonesById = zoneMap.zones.reduce((acc, zone) => {
    acc[zone.id] = zone;
    return acc;
  }, {});

  const tone = toneStyles[opp?.severity] || toneStyles.info;
  const activeZones = new Set(opp?.routeZones || []);
  const isBlocked = Boolean(opp?.blocked);
  const zoneClass = (id) => `ppp-zone zone-${id.toLowerCase()}${activeZones.has(id) ? ' is-active' : ''}`;

  // Paradas del giro (orden de tappa + eta + status) para dibujar nodos + línea de
  // tragitto SOBRE el mapa. Datos YA CALCULADOS: preferimos los nodos delivery de
  // routeTimeline (traen status); si no, caemos en routeEtas (slips → ajuste/ok).
  // Render-only: solo se indexa y se mapea flag→clase, sin cálculo de tiempos.
  const rtNodes = opp && opp.routeTimeline && Array.isArray(opp.routeTimeline.timeline)
    ? opp.routeTimeline.timeline
    : null;
  const stops = [];
  if (rtNodes) {
    rtNodes
      .filter((n) => n.type === 'delivery' && n.zone)
      .forEach((n, i) => stops.push({ zone: String(n.zone), order: i + 1, eta: n.eta || null, status: n.status || 'ok' }));
  } else if (opp && Array.isArray(opp.routeEtas)) {
    opp.routeEtas
      .filter((e) => e.zone)
      .forEach((e, i) => stops.push({ zone: String(e.zone), order: i + 1, eta: e.eta || null, status: e.slips ? 'ajuste' : 'ok' }));
  }

  // Solo paradas con centro de zona conocido → nodos colocables en el mapa.
  const placedStops = stops
    .map((s) => ({ ...s, c: LOCAL_ZONE_CENTERS[s.zone] }))
    .filter((s) => s.c);
  // Puntos de la polilínea: Pizzería (centro Q1) → cada parada en orden. Solo
  // une coordenadas ya definidas; ningún cálculo de ruta/tiempo aquí.
  const linePts = placedStops.length
    ? [PIZZERIA_CENTER, ...placedStops.map((s) => s.c)].map((p) => `${p.x},${p.y}`).join(' ')
    : '';
  const lastStop = placedStops.length ? placedStops[placedStops.length - 1].c : null;
  const returnPts = lastStop ? `${lastStop.x},${lastStop.y} ${PIZZERIA_CENTER.x},${PIZZERIA_CENTER.y}` : '';

  return (
    <section
      className={`ppp-map-card${isBlocked ? ' is-blocked' : ''}`}
      style={{ '--mapTone': tone.accent }}
      aria-label="Esquema operativo por zonas"
    >
      <h3>{zoneMap.title}</h3>
      <div className="ppp-map">
        <span className="ppp-road road-a" />
        <span className="ppp-road road-b" />
        <span className="ppp-road road-c" />
        <span className={zoneClass('Q4')}><b>{zonesById.Q4.id}</b><small>{zonesById.Q4.name.toUpperCase()}</small></span>
        <span className={zoneClass('Q3')}><b>{zonesById.Q3.id}</b><small>{zonesById.Q3.name.toUpperCase()}</small></span>
        <span className={zoneClass('Q1')}><b>{zonesById.Q1.id}</b><small>{zonesById.Q1.name.toUpperCase()}</small></span>
        <span className={zoneClass('Q2')}><b>{zonesById.Q2.id}</b><small>{zonesById.Q2.name.toUpperCase()}</small></span>
        <span className={zoneClass('Q5')}><b>{zonesById.Q5.id}</b><small>{zonesById.Q5.name.toUpperCase()}</small></span>
        <div className="ppp-sea">
          <span>⌁⌁</span>
          <span>⌁⌁</span>
          <span>⌁⌁</span>
          <strong>{zoneMap.seaLabel.split(' ').slice(0, 1).join(' ')}<br />{zoneMap.seaLabel.split(' ').slice(1).join(' ')}</strong>
          <span>⌁⌁</span>
          <span>⌁⌁</span>
        </div>

        {/* Capa de tragitto: línea que une Pizzería → paradas (en orden) + regreso
            punteado, y un nodo con eta en el CENTRO de cada zona de parada. Todo
            presentacional: une coordenadas y reexpone eta/status ya calculados. */}
        {linePts && (
          <svg className="ppp-route-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {returnPts && (
              <polyline className="ppp-route-return" points={returnPts} fill="none" vectorEffect="non-scaling-stroke" />
            )}
            <polyline
              className={`ppp-route-path${isBlocked ? ' is-blocked' : ''}`}
              points={linePts}
              fill="none"
              stroke={tone.accent}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}

        {/* Pizzería: nodo origen en el centro de Q1 */}
        <span className="ppp-route-hub" style={{ left: `${PIZZERIA_CENTER.x}%`, top: `${PIZZERIA_CENTER.y}%` }}>
          <i className="ppp-route-hub-pin" aria-hidden="true">🍕</i>
          <em>Pizzería</em>
        </span>

        {/* Nodos de parada: dot + badge (nº tappa + eta) en el centro de la zona */}
        {placedStops.map((s) => (
          <span
            key={`${opp?.id}-stop-${s.zone}`}
            className={`ppp-route-node st-${s.status}`}
            style={{ left: `${s.c.x}%`, top: `${s.c.y}%` }}
          >
            <i className="ppp-route-dot" aria-hidden="true" />
            {s.eta && (
              <em className="ppp-route-eta">
                <i className="ppp-route-n">{s.order}</i>{s.eta}
              </em>
            )}
          </span>
        ))}
      </div>

      {opp && Array.isArray(opp.mapPath) && opp.mapPath.length > 0 && (
        <div className="ppp-map-foot">
          <p className={`ppp-map-path${isBlocked ? ' is-blocked' : ''}`}>
            {zoneMap.caption}{' '}
            {opp.mapPath.map((step, i) => (
              <span key={`${opp.id}-${step}-${i}`}>
                {i > 0 && <i className="ppp-path-arrow"> → </i>}
                <b>{step}</b>
              </span>
            ))}
            {isBlocked && <em className="ppp-map-flag"> · No recomendado</em>}
          </p>
          {/* Leyenda de ETAs aligerada: los horarios viven ahora como badge sobre
              cada zona del mapa (ppp-zone-stop). Aquí solo queda ruta + canal. */}
          <span className="ppp-map-channel">{channelLabels[opp.channel] || opp.channel}</span>
        </div>
      )}
    </section>
  );
};

// serviceLineTimeline — costruisce un routeTimeline (shape route-timeline-v2) da
// una riga serviceLine usando SOLO i tempi reali del backend (salida/entrega/
// regreso). Nessun calcolo: mappa 3 timestamp → 3 nodi per il render verticale
// (Salida pizzería → Entrega zona → Regreso) dentro la fila espansa.
// previewLegsFromTimeline — extrae de un routeTimeline (la inserción del nuevo
// pedido en el giro) las patas que la FILA COMPACTA "Giros y huecos" necesita para
// mostrar la vista previa real: salida del giro, cada entrega (marcando la del
// pedido nuevo = `clientEta`, "Hora cliente") y regreso. Solo lee etas YA
// calculados por el backend; no calcula tiempos. Render-only.
// Chip de retraso por parada — semáforo presentacional sobre el slip YA CALCULADO
// por el backend (`slipLabel` = "+N", solo positivo). NO calcula tiempos: solo lee
// el número y lo bucketiza en banda de color, con las MISMAS franjas operativas que
// el backend (clientDelayBand): 0–5 verde, 6–10 amarillo, >10 rojo (revisar, NO
// bloquea). Retraso 0 / ausente → null (sin chip, sin ruido). Copy humano "+N min";
// para >10, "revisar +N min" (el operador debe mirarlo, no es un bloqueo).
const delayChipFromSlip = (slipLabel) => {
  const raw = slipLabel != null ? String(slipLabel).trim() : '';
  const m = raw.match(/^\+(\d+)$/);
  if (!m) return null;
  const min = parseInt(m[1], 10);
  if (!Number.isFinite(min) || min <= 0) return null;
  const band = min <= 5 ? 'verde' : (min <= 10 ? 'amarillo' : 'rojo');
  return { min, band, label: band === 'rojo' ? `revisar +${min} min` : `+${min} min` };
};

const previewLegsFromTimeline = (rt) => {
  const nodes = (rt && Array.isArray(rt.timeline)) ? [...rt.timeline].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)) : [];
  const dep = nodes.find((n) => n.type === 'departure') || null;
  const ret = nodes.find((n) => n.type === 'return') || null;
  const deliveries = nodes
    .filter((n) => n.type === 'delivery' && n.zone)
    // delay SOLO para el ancla (pedido ya confirmado que se mueve); el nuevo pedido
    // no muestra retraso — su hora absoluta es "Cliente HH:MM" (hora a proponer).
    // `delay` = chip semáforo {min,band,label} desde el slip backend (o null).
    .map((n) => ({ zone: String(n.zone), eta: n.eta || null, isNew: !!n.isNewOrder, delay: (!n.isNewOrder ? delayChipFromSlip(n.slipLabel) : null) }));
  const newDel = deliveries.find((d) => d.isNew) || null;
  return {
    salida: dep ? (dep.eta || null) : null,
    regreso: ret ? (ret.eta || null) : null,
    deliveries,
    clientEta: newDel ? newDel.eta : null,
    clientZone: newDel ? newDel.zone : null,
  };
};

const serviceLineTimeline = (e) => {
  if (!e || typeof e !== 'object') return null;
  const nodes = [];
  if (e.salida) nodes.push({ seq: 1, type: 'departure', zone: 'Q1', eta: e.salida, label: 'Salida pizzería' });
  if (e.entrega || e.promised) nodes.push({ seq: 2, type: 'delivery', zone: e.zone, eta: e.entrega || e.promised, label: `Pedido ${e.zone}`, promised: e.promised || null });
  if (e.regreso) nodes.push({ seq: 3, type: 'return', zone: 'Q1', eta: e.regreso, label: 'Regreso' });
  return { timeline: nodes, summary: null, risk: 'ok', operatorMessage: null };
};

// serviceLineOpp — opp PRESENTAZIONALE minima per far riflettere sulla mappa una
// riga "Giros y huecos" che NON corrisponde a nessuna proposta. Usa SOLO la
// timeline già derivata dai timestamp/zona del backend (serviceLineTimeline):
// nessun ETA/stato/canale inventato, solo le zone reali per disegnare la rotta.
const serviceLineOpp = (e, key) => {
  const rt = serviceLineTimeline(e);
  const zones = rt && Array.isArray(rt.timeline)
    ? rt.timeline.filter((n) => n.type === 'delivery' && n.zone).map((n) => String(n.zone))
    : [];
  return {
    id: `slopp-${key}`,
    severity: 'ok',
    blocked: false,
    channel: null,
    routeZones: zones,
    mapPath: zones.length ? ['Q1', ...zones] : [],
    routeTimeline: rt,
  };
};

const PREMIUM_PLANNER_POPUP_CSS = `
.ppp-overlay{ position:fixed; inset:0; z-index:12000; display:flex; align-items:center; justify-content:center; padding:28px; background:rgba(0,0,0,0.72); backdrop-filter:blur(8px); }
.ppp-shell{ width:min(1040px,100%); max-height:92vh; overflow:auto; padding:28px; border:1px solid rgba(77,103,123,0.55); border-radius:18px; color:#F7F8FA; background:radial-gradient(circle at 16% 8%,rgba(13,78,62,0.22),transparent 28%),linear-gradient(145deg,#071018 0%,#0A151B 52%,#081116 100%); box-shadow:0 26px 90px rgba(0,0,0,0.78), inset 0 1px 0 rgba(255,255,255,0.04); font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
.ppp-shell *{ box-sizing:border-box; }
.ppp-header{ display:grid; grid-template-columns:56px minmax(0,1fr) auto 48px; gap:14px; align-items:center; margin-bottom:24px; }
.ppp-brand-mark{ position:relative; width:48px; height:48px; color:#58EF75; }
.ppp-brand-mark span{ position:absolute; display:block; line-height:1; text-shadow:0 0 18px rgba(88,239,117,0.60); }
.ppp-brand-mark span:nth-child(1){ left:1px; top:10px; font-size:34px; }
.ppp-brand-mark span:nth-child(2){ right:5px; top:0; font-size:16px; }
.ppp-brand-mark span:nth-child(3){ right:10px; bottom:4px; font-size:15px; }
.ppp-header h2{ margin:0; color:#F4F7F8; font-size:28px; line-height:1.05; font-weight:850; letter-spacing:0; }
.ppp-lab-pill{ border:1px solid rgba(88,239,117,0.22); border-radius:999px; padding:7px 10px; color:#86F59A; background:rgba(88,239,117,0.07); font-size:11px; font-weight:800; white-space:nowrap; }
.ppp-close{ width:46px; height:46px; display:grid; place-items:center; border:1px solid rgba(154,176,191,0.30); border-radius:999px; color:#EFF5F6; background:rgba(255,255,255,0.035); font-size:30px; line-height:1; font-weight:250; cursor:pointer; }
.ppp-close:hover{ background:rgba(255,255,255,0.08); }
.ppp-lab-warn{ margin:0 0 16px; padding:10px 14px; border:1px solid rgba(240,178,48,0.42); border-radius:8px; color:#F8C16B; background:rgba(240,178,48,0.08); font-size:14px; font-weight:650; line-height:1.35; }
.ppp-lab-loading{ margin:0 0 16px; padding:10px 14px; border:1px solid rgba(38,220,235,0.42); border-radius:8px; color:#7FE9F2; background:rgba(38,220,235,0.08); font-size:14px; font-weight:650; line-height:1.35; }
.ppp-lab-loading span{ color:#9BB9C7; font-weight:500; }
.ppp-backend-summary{ margin-top:18px; padding:16px 18px; border:1px solid rgba(38,220,235,0.30); border-radius:10px; background:rgba(38,220,235,0.05); }
.ppp-bs-head{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
.ppp-bs-badge{ border:1px solid rgba(38,220,235,0.42); border-radius:999px; padding:5px 10px; color:#7FE9F2; background:rgba(38,220,235,0.08); font-size:11px; font-weight:800; letter-spacing:0.3px; }
.ppp-bs-safe{ color:#86C9D2; font-size:12px; font-weight:700; }
.ppp-bs-first{ margin:0 0 10px; color:#E6EEF0; font-size:16px; font-weight:600; }
.ppp-bs-first strong{ color:#9CA6AD; font-weight:700; }
.ppp-bs-block{ margin-top:10px; }
.ppp-bs-block h4{ margin:0 0 6px; color:#B7BCC2; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; }
.ppp-bs-block ul{ margin:0; padding-left:18px; color:#C7CDD1; font-size:14px; line-height:1.5; }
.ppp-bs-warn ul{ color:#F8C16B; }
.ppp-bs-err ul{ color:#F3A0A0; }
.ppp-rt{ margin-top:18px; padding:18px 20px; border:1px solid rgba(88,239,117,0.30); border-radius:10px; background:linear-gradient(150deg,rgba(10,28,36,0.9),rgba(5,14,20,0.78)); }
.ppp-rt-head{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
.ppp-rt-head h3{ display:flex; align-items:center; gap:10px; margin:0; color:#F3F7F8; font-size:19px; font-weight:740; }
.ppp-rt-risk{ border:1px solid currentColor; border-radius:999px; padding:4px 11px; font-size:12px; font-weight:800; letter-spacing:0.3px; }
.ppp-rt-risk.rt-ok{ color:#58E86B; }
.ppp-rt-risk.rt-tight{ color:#F0C45C; }
.ppp-rt-risk.rt-warning{ color:#F8C16B; }
.ppp-rt-risk.rt-no_recomendado,.ppp-rt-risk.rt-blocked,.ppp-rt-risk.rt-full{ color:#F87171; }
.ppp-rt-msg{ margin:0 0 12px; color:#DDE5E8; font-size:15px; font-weight:560; line-height:1.4; }
.ppp-rt-summary{ display:flex; flex-wrap:wrap; gap:10px 18px; margin:0 0 14px; }
.ppp-rt-summary > div{ display:flex; flex-direction:column; gap:2px; }
.ppp-rt-summary dt{ color:#8E99A1; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; }
.ppp-rt-summary dd{ margin:0; color:#EEF3F4; font-size:16px; font-weight:680; font-variant-numeric:tabular-nums; }
.ppp-rt-line{ list-style:none; position:relative; margin:0; padding:0 0 0 8px; }
.ppp-rt-line::before{ content:""; position:absolute; left:14px; top:14px; bottom:14px; width:2px; border-radius:999px; background:rgba(120,140,152,0.45); }
.ppp-rt-node{ position:relative; display:grid; grid-template-columns:24px minmax(0,1fr); gap:12px; padding:10px 0; }
.ppp-rt-dot{ z-index:1; align-self:start; margin-top:4px; width:14px; height:14px; border-radius:999px; background:#9BA8B0; box-shadow:0 0 0 3px rgba(5,14,20,0.9); }
.ppp-rt-node.rt-type-departure .ppp-rt-dot,.ppp-rt-node.rt-type-return .ppp-rt-dot{ background:#58EF75; box-shadow:0 0 0 3px rgba(5,14,20,0.9),0 0 14px rgba(88,239,117,0.55); }
.ppp-rt-node.is-new .ppp-rt-dot{ background:#FF7A1A; box-shadow:0 0 0 3px rgba(5,14,20,0.9),0 0 14px rgba(255,122,26,0.55); }
.ppp-rt-node.is-anchor .ppp-rt-dot{ background:#26DCEB; box-shadow:0 0 0 3px rgba(5,14,20,0.9),0 0 14px rgba(38,220,235,0.5); }
.ppp-rt-node.rt-st-warning .ppp-rt-dot,.ppp-rt-node.rt-st-ajuste .ppp-rt-dot,.ppp-rt-node.rt-st-tight .ppp-rt-dot{ background:#F0C45C; }
.ppp-rt-node.rt-st-blocked .ppp-rt-dot,.ppp-rt-node.rt-st-no_recomendado .ppp-rt-dot,.ppp-rt-node.rt-st-lleno .ppp-rt-dot{ background:#F87171; }
.ppp-rt-body{ min-width:0; }
.ppp-rt-top{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
.ppp-rt-label{ color:#F1F6F7; font-size:16px; font-weight:680; line-height:1.2; }
.ppp-rt-eta{ color:#EEF3F4; font-size:17px; font-weight:760; font-variant-numeric:tabular-nums; }
.ppp-rt-meta{ display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px; margin-top:5px; }
.ppp-rt-kind{ color:#8E99A1; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; }
.ppp-rt-zone{ border:1px solid rgba(120,140,152,0.42); border-radius:6px; padding:2px 8px; color:#D8DEE2; font-size:13px; font-weight:650; }
.ppp-rt-badge{ border-radius:6px; padding:2px 8px; font-size:12px; font-weight:750; }
.ppp-rt-badge.bd-new{ border:1px solid rgba(255,122,26,0.5); color:#FFB07A; background:rgba(255,122,26,0.10); }
.ppp-rt-badge.bd-anchor{ border:1px solid rgba(38,220,235,0.5); color:#7FE9F2; background:rgba(38,220,235,0.08); }
.ppp-rt-prom{ color:#9CA6AD; font-size:13px; font-weight:560; }
.ppp-rt-slip{ border:1px solid rgba(248,178,107,0.6); border-radius:6px; padding:2px 7px; color:#F8C16B; font-size:13px; font-weight:700; font-variant-numeric:tabular-nums; }
.ppp-rt-margin{ color:#9CA6AD; font-size:13px; font-weight:560; font-variant-numeric:tabular-nums; }
.ppp-rt-warn{ margin:6px 0 0; color:#F8C16B; font-size:13px; font-weight:620; line-height:1.3; }
.ppp-mr{ margin-top:18px; padding:18px 20px; border:1px solid rgba(183,124,255,0.34); border-radius:10px; background:linear-gradient(150deg,rgba(20,12,34,0.9),rgba(10,6,20,0.78)); }
.ppp-mr-head{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
.ppp-mr-head h3{ display:flex; align-items:center; gap:10px; margin:0; color:#F3F0FA; font-size:19px; font-weight:740; }
.ppp-mr-pill{ border:1px solid rgba(183,124,255,0.4); border-radius:999px; padding:4px 10px; color:#C9A6FF; background:rgba(183,124,255,0.08); font-size:11px; font-weight:800; white-space:nowrap; }
.ppp-mr-k{ color:#8E99A1; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; margin-right:4px; }
.ppp-mr-current{ display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.ppp-mr-current strong{ color:#FFB07A; font-size:16px; font-weight:760; }
.ppp-mr-picker{ display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.ppp-mr-chip{ min-width:42px; border:1px solid rgba(183,124,255,0.42); border-radius:8px; padding:7px 12px; color:#E7DEFB; background:rgba(183,124,255,0.10); font-size:14px; font-weight:750; cursor:pointer; }
.ppp-mr-chip:hover{ background:rgba(183,124,255,0.20); }
.ppp-mr-chip.is-on{ border-color:#C9A6FF; color:#0A0414; background:linear-gradient(120deg,#C9A6FF,#B77CFF); }
.ppp-mr-lab{ border:1px solid rgba(183,124,255,0.5); border-radius:6px; padding:2px 7px; color:#C9A6FF; background:rgba(183,124,255,0.10); font-size:11px; font-weight:800; }
.ppp-mr-seq{ display:flex; align-items:center; flex-wrap:wrap; gap:6px 8px; margin-bottom:14px; }
.ppp-mr-stop{ border:1px solid rgba(120,140,152,0.42); border-radius:6px; padding:3px 9px; color:#D8DEE2; font-size:13px; font-weight:650; }
.ppp-mr-stop.is-current{ border-color:rgba(255,122,26,0.5); color:#FFB07A; background:rgba(255,122,26,0.10); }
.ppp-mr-stop.is-anchor{ border-color:rgba(38,220,235,0.5); color:#7FE9F2; background:rgba(38,220,235,0.08); }
.ppp-mr-empty{ color:#8E99A1; font-size:13px; }
.ppp-mr-actions{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
.ppp-mr-calc{ border:1px solid rgba(183,124,255,0.6); border-radius:8px; padding:9px 18px; color:#0A0414; background:linear-gradient(120deg,#C9A6FF,#B77CFF); font-size:14px; font-weight:800; cursor:pointer; }
.ppp-mr-calc:disabled{ opacity:0.45; cursor:not-allowed; }
.ppp-mr-undo,.ppp-mr-clear{ border:1px solid rgba(154,176,191,0.34); border-radius:8px; padding:9px 14px; color:#D6DDE2; background:rgba(255,255,255,0.04); font-size:13px; font-weight:700; cursor:pointer; }
.ppp-mr-undo:hover,.ppp-mr-clear:hover{ background:rgba(255,255,255,0.09); }
.ppp-mr-loading{ margin:12px 0 0; padding:8px 12px; border:1px solid rgba(38,220,235,0.42); border-radius:8px; color:#7FE9F2; background:rgba(38,220,235,0.08); font-size:13px; font-weight:650; }
.ppp-mr-warn{ margin:8px 0 0; padding:8px 12px; border:1px solid rgba(240,178,48,0.42); border-radius:8px; color:#F8C16B; background:rgba(240,178,48,0.08); font-size:13px; font-weight:640; line-height:1.35; }
.ppp-mr-result{ margin-top:6px; }
.ppp-mr-blockers,.ppp-mr-warns{ margin:12px 0 0; padding-left:18px; font-size:14px; line-height:1.5; }
.ppp-mr-blockers{ color:#F3A0A0; }
.ppp-mr-warns{ color:#F8C16B; }
.ppp-mr-fallback{ margin:12px 0 0; color:#9CA6AD; font-size:14px; font-weight:560; }
.ppp-mr-safe{ display:inline-block; margin-top:10px; color:#86C9D2; font-size:12px; font-weight:700; }
.ppp-top-grid{ display:grid; grid-template-columns:0.96fr 1.16fr; gap:20px; align-items:stretch; }
.ppp-best-card,.ppp-map-card,.ppp-timeline-card,.ppp-notes{ border:1px solid rgba(83,112,131,0.48); border-radius:10px; background:linear-gradient(155deg,rgba(10,28,36,0.96),rgba(5,14,20,0.92)); box-shadow:inset 0 1px 0 rgba(255,255,255,0.03),0 18px 52px rgba(0,0,0,0.20); }
.ppp-best-card{ min-height:410px; display:flex; flex-direction:column; padding:28px; border-color:rgba(57,207,94,0.38); }
.ppp-best-label{ display:flex; align-items:center; gap:12px; color:#58EF75; font-size:23px; font-weight:700; }
.ppp-best-label span{ font-size:28px; text-shadow:0 0 16px rgba(88,239,117,0.55); }
/* FIX_36: proposta in cima insicura (no_recomendado / conflitto rider) → avviso ambra, NON verde "consigliata" */
.ppp-best-card.is-unsafe{ border-color:rgba(245,158,11,0.55); }
.ppp-best-card.is-unsafe .ppp-best-label{ color:#F59E0B; }
.ppp-best-card.is-unsafe .ppp-best-label span{ text-shadow:0 0 16px rgba(245,158,11,0.5); }
.ppp-warn-note{ margin:8px 0 0; color:#F59E0B; font-size:16px; font-weight:600; }
/* giro compatible: card en verde (no rojo) — solo necesita confirmación de hora */
.ppp-best-card.is-opportunity{ border-color:rgba(57,207,94,0.42); }
.ppp-best-card.is-opportunity .ppp-best-label{ color:#58EF75; }
.ppp-best-card.is-opportunity .ppp-best-label span{ text-shadow:0 0 16px rgba(88,239,117,0.55); }
/* aviso pequeño y humano (Q5 +6 / confirmar) — no alarma grande */
.ppp-warn-note.ppp-warn-soft{ font-size:13px; font-weight:560; color:#F0C45C; }
.ppp-best-card h3{ margin:24px 0 12px; color:#F1F3F4; font-size:40px; line-height:1.05; font-weight:850; letter-spacing:0; text-shadow:0 3px 16px rgba(0,0,0,0.32); }
.ppp-horno{ margin:0 0 14px; color:#AEB8C0; font-size:20px; font-weight:450; }
.ppp-driver{ display:flex; align-items:center; gap:12px; margin:0 0 12px; color:#58EF75; font-size:20px; font-weight:650; }
.ppp-driver span{ color:#58EF75; font-size:19px; }
.ppp-type{ margin:0 0 6px; color:#B7BCC2; font-size:18px; font-weight:450; }
.ppp-rider-saving{ display:inline-block; margin:2px 0 6px; padding:3px 10px; border-radius:999px; background:rgba(34,197,94,0.14); border:1px solid rgba(34,197,94,0.4); color:#58EF75; font-size:13px; font-weight:700; }
/* PLANNER_COCINA_FREEZE_15_MIN: chip de estado cocina RETIRADO de la UI operador
   (sus estilos .ppp-cocina-chip se eliminaron con él). El contract backend queda
   intacto; si vuelve a mostrarse, restaurar aquí. */
.ppp-apply{ width:100%; min-height:62px; margin-top:auto; border:1px solid rgba(88,239,117,0.35); border-radius:7px; color:#FFFFFF; background:linear-gradient(100deg,#18A84E,#22C45E); box-shadow:0 16px 32px rgba(19,167,79,0.28), inset 0 1px 0 rgba(255,255,255,0.10); font-size:22px; font-weight:700; cursor:pointer; }
.ppp-apply:hover{ filter:brightness(1.05); }
/* FIX_38: botón aplicar inseguro (sin propuesta recomendable) → ámbar, NO verde success */
.ppp-apply.is-warning{ border-color:rgba(245,158,11,0.55); background:linear-gradient(100deg,#B45309,#D97706); box-shadow:0 16px 32px rgba(217,119,6,0.28), inset 0 1px 0 rgba(255,255,255,0.10); }
.ppp-preview{ margin:16px 0 18px; padding:14px 16px; border:1px solid var(--toneBorder); border-radius:9px; background:linear-gradient(150deg,var(--toneBg),rgba(6,16,22,0.55)); }
.ppp-preview-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
.ppp-preview-head strong{ color:var(--tone); font-size:16px; font-weight:780; letter-spacing:0.3px; text-transform:uppercase; }
.ppp-preview-chip{ border:1px solid var(--toneBorder); border-radius:6px; padding:4px 9px; color:var(--tone); background:rgba(0,0,0,0.18); font-size:13px; font-weight:700; }
.ppp-preview-rows{ margin:0; display:flex; flex-direction:column; gap:7px; }
.ppp-preview-rows > div{ display:grid; grid-template-columns:84px minmax(0,1fr); gap:10px; align-items:baseline; }
.ppp-preview-rows dt{ color:#9CA6AD; font-size:13px; font-weight:600; text-transform:uppercase; letter-spacing:0.4px; }
.ppp-preview-rows dd{ margin:0; color:#EEF3F4; font-size:16px; font-weight:600; font-variant-numeric:tabular-nums; }
.ppp-preview-warn{ margin:10px 0 0; color:#F8C16B; font-size:14px; font-weight:650; line-height:1.3; }
.ppp-map-card{ min-height:410px; padding:16px 18px 14px; }
.ppp-map-card.is-blocked{ border-color:rgba(248,113,113,0.45); }
.ppp-map-card h3{ margin:0 0 8px; color:#DEE4E7; font-size:17px; font-weight:600; }
.ppp-map{ position:relative; height:300px; overflow:hidden; border-radius:8px; background:linear-gradient(145deg,#0B1820,#08131A 70%); }
.ppp-road{ position:absolute; width:2px; height:430px; background:rgba(155,168,176,0.58); transform-origin:center; }
.road-a{ left:26%; top:-66px; transform:rotate(-15deg); }
.road-b{ left:52%; top:-88px; transform:rotate(-18deg); }
.road-c{ left:78%; top:-20px; transform:rotate(-6deg); }
.ppp-zone{ position:absolute; display:flex; align-items:center; justify-content:center; flex-direction:column; color:#F8FAFA; border:2px solid rgba(255,255,255,0.42); filter:drop-shadow(0 12px 16px rgba(0,0,0,0.24)); text-align:center; line-height:1.02; opacity:0.62; transition:opacity 0.15s ease; }
.ppp-zone.is-active{ opacity:1; border-color:var(--mapTone); box-shadow:0 0 0 3px color-mix(in srgb,var(--mapTone),transparent 45%),0 0 22px color-mix(in srgb,var(--mapTone),transparent 30%); z-index:5; }
.ppp-zone b{ font-size:26px; font-weight:850; }
.ppp-zone small{ margin-top:5px; font-size:12px; font-weight:780; }
.ppp-zone em{ margin-top:9px; font-style:normal; font-size:12px; font-weight:650; }
.ppp-route-svg{ position:absolute; inset:0; width:100%; height:100%; z-index:6; pointer-events:none; }
.ppp-route-path{ stroke-width:3; stroke-linejoin:round; stroke-linecap:round; opacity:0.95; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.55)); }
.ppp-route-path.is-blocked{ stroke:#F87171 !important; stroke-dasharray:5 4; }
.ppp-route-return{ stroke:rgba(160,173,181,0.65); stroke-width:2; stroke-dasharray:3 4; stroke-linecap:round; }
.ppp-route-hub,.ppp-route-node{ position:absolute; transform:translate(-50%,-50%); z-index:8; display:flex; flex-direction:column; align-items:center; gap:3px; pointer-events:none; white-space:nowrap; }
.ppp-route-hub-pin{ width:30px; height:30px; display:grid; place-items:center; border-radius:999px; background:rgba(4,12,17,0.92); border:2px solid #58EF75; font-size:16px; font-style:normal; box-shadow:0 0 0 3px rgba(88,239,117,0.25),0 6px 14px rgba(0,0,0,0.55); }
.ppp-route-hub em{ font-style:normal; font-size:11px; font-weight:800; color:#9DF5B0; text-shadow:0 1px 3px rgba(0,0,0,0.85); }
.ppp-route-dot{ width:14px; height:14px; border-radius:999px; background:#58E86B; border:2px solid rgba(4,12,17,0.85); box-shadow:0 0 0 3px rgba(0,0,0,0.3),0 4px 10px rgba(0,0,0,0.5); }
.ppp-route-eta{ display:inline-flex; align-items:center; gap:5px; padding:2px 9px 2px 3px; border-radius:999px; border:1.5px solid #58E86B; color:#FFFFFF; background:rgba(4,12,17,0.9); font-style:normal; font-size:14px; font-weight:850; line-height:1; font-variant-numeric:tabular-nums; box-shadow:0 5px 12px rgba(0,0,0,0.5); }
.ppp-route-n{ display:inline-grid; place-items:center; width:16px; height:16px; border-radius:999px; background:#58E86B; color:#06140f; font-style:normal; font-size:10px; font-weight:900; }
.ppp-route-node.st-ok .ppp-route-dot,.ppp-route-node.st-ok .ppp-route-n{ background:#58E86B; }
.ppp-route-node.st-ok .ppp-route-eta{ border-color:#58E86B; }
.ppp-route-node.st-ajuste .ppp-route-dot,.ppp-route-node.st-tight .ppp-route-dot,.ppp-route-node.st-warning .ppp-route-dot,.ppp-route-node.st-ajuste .ppp-route-n,.ppp-route-node.st-tight .ppp-route-n,.ppp-route-node.st-warning .ppp-route-n{ background:#F0C45C; color:#1a1305; }
.ppp-route-node.st-ajuste .ppp-route-eta,.ppp-route-node.st-tight .ppp-route-eta,.ppp-route-node.st-warning .ppp-route-eta{ border-color:#F0C45C; }
.ppp-route-node.st-blocked .ppp-route-dot,.ppp-route-node.st-no_recomendado .ppp-route-dot,.ppp-route-node.st-lleno .ppp-route-dot,.ppp-route-node.st-full .ppp-route-dot,.ppp-route-node.st-blocked .ppp-route-n,.ppp-route-node.st-no_recomendado .ppp-route-n,.ppp-route-node.st-lleno .ppp-route-n,.ppp-route-node.st-full .ppp-route-n{ background:#F87171; color:#fff; }
.ppp-route-node.st-blocked .ppp-route-eta,.ppp-route-node.st-no_recomendado .ppp-route-eta,.ppp-route-node.st-lleno .ppp-route-eta,.ppp-route-node.st-full .ppp-route-eta{ border-color:#F87171; }
.zone-q4{ left:3%; top:62px; width:30%; height:84px; background:${zoneColors.Q4}; clip-path:polygon(0 24%,8% 8%,45% 13%,100% 11%,90% 100%,9% 88%); }
.zone-q3{ left:30%; top:54px; width:33%; height:110px; background:${zoneColors.Q3}; clip-path:polygon(0 18%,76% 0,100% 0,86% 42%,100% 70%,42% 100%,14% 73%); }
.zone-q1{ right:12%; top:24px; width:31%; height:166px; background:${zoneColors.Q1}; clip-path:polygon(22% 10%,100% 0,92% 100%,40% 72%,0 46%); }
.zone-q2{ right:15%; top:138px; width:39%; height:138px; background:${zoneColors.Q2}; clip-path:polygon(0 17%,45% 0,100% 34%,79% 86%,36% 100%,13% 78%); }
.zone-q5{ left:10%; top:204px; width:40%; height:78px; background:${zoneColors.Q5}; clip-path:polygon(13% 13%,47% 0,86% 8%,100% 70%,22% 100%,0 72%); }
.ppp-shop-dot{ position:absolute; right:35%; top:132px; z-index:6; width:14px; height:14px; border-radius:999px; background:#58EF75; box-shadow:0 0 0 3px rgba(88,239,117,0.35),0 0 18px rgba(88,239,117,0.78); }
.ppp-sea{ position:absolute; right:0; top:0; bottom:0; width:76px; display:flex; align-items:center; justify-content:space-around; flex-direction:column; padding:18px 8px; color:#2BA6D2; background:rgba(10,35,49,0.96); border-left:1px solid rgba(135,179,199,0.36); }
.ppp-sea span{ color:#1E7498; font-size:24px; line-height:1; }
.ppp-sea strong{ color:#9BB9C7; font-size:11px; line-height:1.2; text-align:center; font-weight:700; }
.ppp-map-foot{ margin-top:8px; }
.ppp-map-path{ margin:0 0 8px; color:#AEB8C0; text-align:center; font-size:16px; font-weight:500; }
.ppp-map-path b{ color:#F1F6F7; font-weight:750; }
.ppp-map-path .ppp-path-arrow{ color:var(--mapTone); font-style:normal; font-weight:700; }
.ppp-map-path.is-blocked b{ color:#F3C0C0; }
.ppp-map-flag{ color:#F87171; font-style:normal; font-weight:800; }
.ppp-map-etas{ display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
.ppp-eta-chip{ border:1px solid rgba(120,140,152,0.42); border-radius:6px; padding:5px 10px; color:#D8DEE2; background:rgba(8,18,24,0.6); font-size:14px; font-weight:650; font-variant-numeric:tabular-nums; }
.ppp-eta-chip.is-new{ border-color:var(--mapTone); color:#F4FAF5; background:color-mix(in srgb,var(--mapTone),transparent 82%); }
.ppp-eta-chip.is-slip{ border-color:rgba(248,178,107,0.6); color:#F8C16B; }
.ppp-map-channel{ display:block; margin-top:8px; text-align:center; color:#8C97A0; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
.ppp-quick-section{ margin-top:26px; }
.ppp-quick-section h3{ margin:0 0 18px 8px; color:#F1F5F5; font-size:20px; font-weight:700; }
.ppp-options{ display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:14px; }
.ppp-option-card{ min-height:150px; display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-start; gap:10px; padding:18px 18px; border:1px solid var(--toneBorder); border-radius:10px; color:#F4F6F6; background:linear-gradient(145deg,var(--toneBg),rgba(6,16,22,0.92)); text-align:left; cursor:pointer; transition:transform 0.12s ease, box-shadow 0.12s ease; }
.ppp-option-card:hover{ transform:translateY(-1px); }
.ppp-option-card.is-active{ box-shadow:0 0 0 2px var(--tone),0 12px 30px rgba(0,0,0,0.32); }
.ppp-option-top{ width:100%; display:flex; align-items:flex-start; justify-content:space-between; gap:10px; color:var(--tone); }
.ppp-option-top strong{ color:#F7FAFA; font-size:26px; line-height:1; font-weight:760; }
.ppp-option-top i{ width:29px; height:29px; display:grid; place-items:center; border:1px solid var(--tone); border-radius:999px; color:var(--tone); font-style:normal; font-size:18px; font-weight:700; }
.ppp-option-card b{ color:var(--tone); font-size:16px; line-height:1.15; font-weight:680; }
.ppp-option-card small{ color:#B9C0C4; font-size:14px; line-height:1.25; font-weight:450; }
.ppp-timeline-card{ margin-top:24px; padding:18px 20px 20px; }
.ppp-card-title{ display:flex; align-items:center; justify-content:space-between; gap:14px; margin-bottom:12px; }
.ppp-card-title h3,.ppp-card-title p{ display:flex; align-items:center; gap:10px; margin:0; color:#F3F7F8; font-size:22px; font-weight:750; }
.ppp-card-title p{ color:#AEB8C0; font-size:17px; font-weight:450; }
.ppp-timeline{ position:relative; overflow:hidden; border:1px solid rgba(83,112,131,0.55); border-radius:9px; background:rgba(5,14,20,0.46); }
.ppp-timeline::before{ content:""; position:absolute; left:128px; top:36px; bottom:32px; width:3px; border-radius:999px; background:linear-gradient(#58E86B 0 22%,#F0C45C 22% 44%,#B77CFF 44% 62%,#F87171 62% 100%); }
.ppp-timeline-row{ position:relative; width:100%; min-height:82px; display:grid; grid-template-columns:90px 38px minmax(0,1fr) 132px; gap:14px; align-items:center; padding:13px 22px; border:0; border-bottom:1px solid rgba(83,112,131,0.32); color:#F8FAFA; background:transparent; text-align:left; cursor:pointer; }
.ppp-timeline-row:last-child{ border-bottom:0; }
.ppp-timeline-row.is-active{ background:var(--toneBg); }
.ppp-row-time{ color:#B9C0C4; font-size:20px; font-weight:420; font-variant-numeric:tabular-nums; }
.ppp-row-dot{ z-index:1; width:17px; height:17px; border-radius:999px; background:var(--tone); box-shadow:0 0 0 3px rgba(0,0,0,0.22),0 0 16px color-mix(in srgb,var(--tone),transparent 40%); }
.ppp-row-copy strong{ display:block; color:var(--tone); font-size:19px; line-height:1.25; font-weight:670; }
.ppp-row-copy small{ display:block; margin-top:5px; color:#B9C0C4; font-size:17px; line-height:1.2; font-weight:420; }
.ppp-row-chip{ justify-self:end; min-width:100px; border:1px solid var(--toneBorder); border-radius:7px; padding:8px 13px; color:var(--tone); background:var(--toneBg); font-size:15px; font-weight:650; text-align:center; }
.ppp-notes{ position:relative; margin-top:20px; padding:22px 24px 22px 64px; }
.ppp-notes h3{ display:flex; align-items:center; gap:13px; margin:0 0 14px -44px; color:#F2F6F7; font-size:21px; font-weight:740; }
.ppp-notes h3 span{ width:30px; display:inline-grid; place-items:center; color:#EFF5F6; font-size:26px; }
.ppp-notes ul{ margin:0; padding-left:18px; color:#B9C0C4; font-size:16px; line-height:1.65; }
.ppp-selected{ display:block; margin-top:8px; color:rgba(88,239,117,0.62); font-size:12px; font-weight:700; }
@media (max-width:900px){
  .ppp-overlay{ padding:12px; align-items:stretch; }
  .ppp-shell{ max-height:calc(100vh - 24px); padding:20px; }
  .ppp-header{ grid-template-columns:44px minmax(0,1fr) 44px; }
  .ppp-lab-pill{ grid-column:2 / 3; width:fit-content; }
  .ppp-top-grid{ grid-template-columns:1fr; }
  .ppp-options{ grid-template-columns:1fr 1fr; }
  .ppp-timeline-row{ grid-template-columns:70px 28px minmax(0,1fr); }
  .ppp-row-chip{ display:none; }
  .ppp-timeline::before{ left:104px; }
}
@media (max-width:560px){
  .ppp-shell{ padding:16px; }
  .ppp-header h2{ font-size:23px; }
  .ppp-best-card{ min-height:0; padding:22px; }
  .ppp-best-card h3{ font-size:32px; }
  .ppp-options{ grid-template-columns:1fr; }
  .ppp-map{ height:260px; }
  .ppp-timeline-row{ grid-template-columns:58px 24px minmax(0,1fr); padding:12px; }
  .ppp-timeline::before{ left:82px; }
  .ppp-row-time{ font-size:16px; }
  .ppp-row-copy strong{ font-size:16px; }
  .ppp-row-copy small{ font-size:14px; }
  .ppp-notes{ padding:18px; }
  .ppp-notes h3{ margin-left:0; }
}
/* ── Adaptativo "computer/tablet" (≥768px): compacta la tipografía y las alturas
   pensadas para touch para que el popup quepa en pantalla sin efecto "zoom".
   Va al final → gana en los solapes con (max-width:900px). Debajo de 768px (móvil)
   no aplica: la vista móvil queda intacta. Solo presentacional, sin lógica. */
@media (min-width:768px){
  .ppp-overlay{ padding:20px; }
  .ppp-shell{ width:min(900px,100%); max-height:90vh; padding:22px; }
  .ppp-header{ grid-template-columns:42px minmax(0,1fr) auto 40px; margin-bottom:16px; }
  .ppp-header h2{ font-size:21px; }
  .ppp-brand-mark{ width:38px; height:38px; }
  .ppp-brand-mark span:nth-child(1){ font-size:26px; }
  .ppp-brand-mark span:nth-child(2){ font-size:13px; }
  .ppp-brand-mark span:nth-child(3){ font-size:12px; }
  .ppp-close{ width:38px; height:38px; font-size:24px; }
  .ppp-lab-warn,.ppp-lab-loading{ font-size:13px; padding:8px 12px; margin-bottom:12px; }

  .ppp-top-grid{ grid-template-columns:0.95fr 1.15fr; gap:16px; }
  .ppp-best-card{ min-height:0; padding:18px; }
  .ppp-best-label{ font-size:15px; gap:9px; }
  .ppp-best-label span{ font-size:19px; }
  .ppp-best-card h3{ margin:10px 0 8px; font-size:26px; }
  .ppp-horno,.ppp-type{ font-size:14px; margin-bottom:8px; }
  .ppp-driver{ font-size:14px; margin-bottom:8px; gap:8px; }
  .ppp-driver span{ font-size:14px; }
  .ppp-apply{ min-height:46px; font-size:15px; }
  .ppp-preview{ margin:12px 0; padding:12px 14px; }
  .ppp-preview-head strong{ font-size:14px; }
  .ppp-preview-rows dd{ font-size:14px; }

  .ppp-map-card{ min-height:0; padding:14px 16px 12px; }
  .ppp-map-card h3{ font-size:15px; }
  /* La mappa NON si rimpicciolisce: le zone hanno coordinate a pixel fissi tarate
     su 300px d'altezza (Q5 arriva a ~282px). Ridurla taglierebbe Q5/Q2 in basso. */
  .ppp-map-path{ font-size:14px; }

  .ppp-quick-section{ margin-top:18px; }
  .ppp-quick-section h3{ font-size:16px; margin:0 0 12px 4px; }
  .ppp-options{ grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; }
  .ppp-option-card{ min-height:0; padding:12px; gap:7px; }
  .ppp-option-top strong{ font-size:18px; }
  .ppp-option-top i{ width:24px; height:24px; font-size:15px; }
  .ppp-option-card b{ font-size:13.5px; }
  .ppp-option-card small{ font-size:12px; }

  .ppp-timeline-card{ margin-top:16px; padding:14px 16px 16px; }
  .ppp-card-title h3{ font-size:16px; }
  .ppp-card-title p{ font-size:13px; }
  .ppp-timeline-row{ min-height:0; grid-template-columns:74px 30px minmax(0,1fr) 110px; gap:12px; padding:10px 16px; }
  .ppp-timeline::before{ left:104px; top:28px; bottom:24px; }
  .ppp-row-time{ font-size:15px; }
  .ppp-row-copy strong{ font-size:14.5px; }
  .ppp-row-copy small{ font-size:12.5px; margin-top:3px; }
  .ppp-row-chip{ min-width:84px; padding:6px 10px; font-size:12.5px; }

  .ppp-notes{ margin-top:16px; padding:16px 18px 16px 52px; }
  .ppp-notes h3{ font-size:15px; margin:0 0 10px -36px; }
  .ppp-notes h3 span{ width:26px; font-size:20px; }
  .ppp-notes ul{ font-size:13px; line-height:1.55; }

  .ppp-rt,.ppp-mr,.ppp-backend-summary{ margin-top:14px; padding:14px 16px; }
  .ppp-rt-head h3,.ppp-mr-head h3{ font-size:15px; }
  .ppp-rt-msg{ font-size:13.5px; }
  .ppp-rt-summary dd{ font-size:14px; }
  .ppp-rt-label{ font-size:14px; }
  .ppp-rt-eta{ font-size:15px; }
}

/* ── UX-2: dettaglio opzione + línea de servicio ── */
.ppp-detail{ margin-bottom:18px; }
.ppp-serviceline{ margin-top:6px; }
.ppp-sl-list{ margin:8px 0 0; padding-left:18px; font-size:12px; color:#aeb6bf; }

/* ── UX-2: "Giros y huecos" — righe espandibili (salida → entrega → regreso) ── */
.ppp-sl-rows{ display:flex; flex-direction:column; gap:8px; }
.ppp-sl-row{ border:1px solid rgba(83,112,131,0.40); border-radius:9px; background:rgba(5,14,20,0.46); overflow:hidden; }
.ppp-sl-row.is-open{ border-color:rgba(88,239,117,0.42); }
.ppp-sl-row.is-active{ border-color:rgba(38,220,235,0.55); box-shadow:0 0 0 1px rgba(38,220,235,0.30); }
.ppp-sl-head{ width:100%; display:flex; align-items:center; flex-wrap:wrap; gap:8px 14px; padding:12px 16px; border:0; background:transparent; color:#EAF0F2; cursor:pointer; text-align:left; }
.ppp-sl-zone{ min-width:34px; padding:3px 9px; border:1px solid rgba(120,140,152,0.45); border-radius:6px; color:#F1F6F7; font-size:14px; font-weight:820; }
.ppp-sl-leg{ display:flex; flex-direction:column; line-height:1.1; }
.ppp-sl-leg i{ font-style:normal; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; color:#8E99A1; }
.ppp-sl-leg b{ font-size:16px; font-weight:760; font-variant-numeric:tabular-nums; color:#EEF3F4; }
/* "Hora cliente" — la hora que el operador debe proponer al cliente, destacada en
   verde dentro de la fila compacta de la preview "Encajar …". */
.ppp-sl-leg.is-client{ padding:3px 10px; border:1px solid rgba(88,232,104,0.55); border-radius:8px; background:rgba(46,210,88,0.12); }
.ppp-sl-leg.is-client i{ color:#58E86B; }
.ppp-sl-leg.is-client b{ color:#9DF5B0; font-size:17px; }
/* retraso por parada (ancla) en la fila compacta: chip semáforo pequeño y legible.
   Banda = retraso YA calculado por el backend (0–5 verde, 6–10 ámbar, >10 rojo·revisar).
   Rojo NO bloquea: solo marca que el operador debe mirarlo. */
.ppp-sl-slip{ display:inline-block; margin-left:6px; padding:1px 7px; border:1px solid rgba(240,196,92,0.55); border-radius:6px; background:rgba(240,196,92,0.14); font-style:normal; font-size:13px; font-weight:800; color:#F0C45C; vertical-align:1px; }
.ppp-sl-slip.band-verde{ border-color:rgba(66,232,104,0.45); background:rgba(46,210,88,0.12); color:#86F59A; }
.ppp-sl-slip.band-amarillo{ border-color:rgba(240,196,92,0.55); background:rgba(240,196,92,0.14); color:#F0C45C; }
.ppp-sl-slip.band-rojo{ border-color:rgba(248,113,113,0.55); background:rgba(248,113,113,0.16); color:#F8A0A0; }
/* mismo chip semáforo dentro del detalle expandido (RouteTimeline), junto a la zona */
.ppp-rt-delay{ border-radius:6px; padding:2px 8px; font-size:13px; font-weight:800; font-variant-numeric:tabular-nums; }
.ppp-rt-delay.band-verde{ color:#86F59A; border:1px solid rgba(66,232,104,0.45); background:rgba(46,210,88,0.12); }
.ppp-rt-delay.band-amarillo{ color:#F0C45C; border:1px solid rgba(240,196,92,0.55); background:rgba(240,196,92,0.14); }
.ppp-rt-delay.band-rojo{ color:#F8A0A0; border:1px solid rgba(248,113,113,0.55); background:rgba(248,113,113,0.16); }
.ppp-sl-arrow{ color:#58E86B; font-weight:800; }
.ppp-sl-pz{ color:#9CA6AD; font-size:13px; font-weight:650; }
.ppp-sl-caret{ margin-left:auto; color:#9CA6AD; font-size:14px; }
.ppp-sl-detail{ padding:0 16px 14px; }
.ppp-sl-detail .ppp-rt{ margin-top:6px; }
.ppp-sl-empty{ margin:0; padding:14px 16px; border:1px dashed rgba(120,140,152,0.40); border-radius:9px; background:rgba(5,14,20,0.40); color:#9CA6AD; font-size:14px; font-weight:560; }

/* ── UX-2: riga "Otras opciones rápidas" — 3 bottoni compatti (più piccoli) ── */
.ppp-props{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:18px; }
.ppp-prop{ display:flex; flex-direction:column; gap:3px; padding:11px 13px; border-radius:10px;
  background:var(--toneBg,rgba(255,255,255,0.03)); border:1px solid var(--toneBorder,rgba(255,255,255,0.12));
  color:#EAF0F2; cursor:pointer; text-align:left; transition:transform .08s ease, box-shadow .12s ease; }
.ppp-prop:hover:not(:disabled){ transform:translateY(-1px); }
.ppp-prop.is-active{ box-shadow:0 0 0 2px var(--tone,#58E86B) inset; }
.ppp-prop.is-empty{ opacity:0.42; cursor:default; filter:grayscale(0.6); background:rgba(255,255,255,0.02); border-style:dashed; }
.ppp-prop-time{ font-size:18px; font-weight:820; font-variant-numeric:tabular-nums; color:var(--tone,#EAF0F2); }
.ppp-prop-title{ font-size:13px; font-weight:760; color:#F1F5F6; }
.ppp-prop-st{ font-size:11px; font-weight:600; color:#9CA6AD; }
@media (max-width:680px){ .ppp-props{ grid-template-columns:1fr; } }
`;

export default PremiumPlannerPopup;
