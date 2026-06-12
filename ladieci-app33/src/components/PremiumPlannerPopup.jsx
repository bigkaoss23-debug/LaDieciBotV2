import { useState } from 'react';

/*
 * PremiumPlannerPopup — LAB renderer ONLY (no engine).
 *
 * Todo PREMIUM_PLANNER_LAB_DATA es OUTPUT YA CALCULADO por el futuro
 * planner/backend. El frontend NO calcula nada de esto: solo renderiza,
 * selecciona localmente una opportunity y hace console.debug/no-op.
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
// UNICA fonte di questa geografia: la usa sia il percorso reale (adapter
// strategic) sia il fallback LAB. Non duplicare i valori altrove.
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

const PREMIUM_PLANNER_LAB_DATA = {
  contract: 'premium-planner-popup-lab-v2',
  mode: 'static_lab',
  source: 'mock',
  bestProposal: {
    id: 'best-direct-q1-1555',
    type: 'directa',
    label: 'Mejor propuesta',
    entrega: '15:55',
    salidaHorno: '15:48',
    driverStatus: 'Driver disponible',
    routeLabel: 'Directa · recomendada',
    severity: 'ok',
    ctaLabel: 'Seleccionar en vista previa',
    // routeTimeline LAB (mock): mismo shape que el campo additivo del backend
    // (route-timeline-v2). Solo datos de ejemplo ya "calculados"; el renderer no
    // deriva nada. Permite ver la línea Pizzería → entrega → Regreso sin backend.
    routeTimeline: {
      version: 'route-timeline-v2',
      proposalId: 'best-direct-q1-1555',
      summary: { directEta: '15:55', giroEta: '15:55', returnEta: '16:03', tradeoffLabel: 'directa · sin desvío' },
      risk: 'ok',
      operatorMessage: 'Directa recomendada: sale del horno y entrega sin giro.',
      timeline: [
        { seq: 0, type: 'departure', zone: null, label: 'Pizzería', eta: '15:48', promised: null, slipLabel: null, status: 'ok', marginLabel: null, isNewOrder: false, isAnchor: false, warning: null },
        { seq: 1, type: 'delivery', zone: 'Q1', label: 'Pedido actual', eta: '15:55', promised: '15:55', slipLabel: null, status: 'ok', marginLabel: '+0 margen', isNewOrder: true, isAnchor: false, warning: null },
        { seq: 2, type: 'return', zone: null, label: 'Regreso pizzería', eta: '16:03', promised: null, slipLabel: null, status: 'ok', marginLabel: null, isNewOrder: false, isAnchor: false, warning: null },
      ],
    },
  },
  zoneMap: LOCAL_ZONE_MAP, // geografía real → única fuente LOCAL_ZONE_MAP (no duplicar)
  // Cada fila de "Giros y huecos" es una OPORTUNIDAD sugerida por el planner,
  // no un pedido real. Click = preview local (mapa + impacto), nunca confirma.
  opportunities: [
    {
      id: 'opp-q2-q5-2100',
      blocked: false,
      kind: 'agregar',
      giroId: 'giro-q5-2100',
      channel: 'sur',
      currentOrderZone: 'Q2',
      currentOrderLabel: 'Pedido actual · Q2',
      routeZones: ['Q2', 'Q5'],
      mapPath: ['Pizzería', 'Q2', 'Q5'],
      routeEtas: [
        { zone: 'Q2', label: 'Pedido actual', eta: '20:50', isNew: true },
        { zone: 'Q5', label: 'Las Marinas', eta: '21:00', promised: '21:00', slips: false },
      ],
      baseline: { directEta: '20:40', label: 'Directa sin giro' },
      capacity: { pizzas: '3/6', routeMin: 22, limitMin: 30, state: 'ok' },
      status: 'compatible',
      severity: 'ok',
      time: '21:00',
      zoneLabel: 'Q5',
      title: 'Agregar a giro Q5 21:00',
      subtitle: 'Q2 entra a las 20:50 antes de Las Marinas',
      chip: 'agregar',
      actionLabel: '✓',
      explanation: 'Inserta Q2 antes del Q5 sin volver a pizzería.',
      warning: null,
      routeTimeline: {
        version: 'route-timeline-v2',
        proposalId: 'opp-q2-q5-2100',
        summary: { directEta: '20:40', giroEta: '21:00', returnEta: '21:10', tradeoffLabel: '+20 vs directa · 1 viaje ahorrado' },
        risk: 'ok',
        operatorMessage: 'Compatible: Q2 entra antes de Q5, sin retrasos.',
        timeline: [
          { seq: 0, type: 'departure', zone: null, label: 'Pizzería', eta: '20:42', promised: null, slipLabel: null, status: 'ok', marginLabel: null, isNewOrder: false, isAnchor: false, warning: null },
          { seq: 1, type: 'delivery', zone: 'Q2', label: 'Pedido actual', eta: '20:50', promised: null, slipLabel: null, status: 'ok', marginLabel: null, isNewOrder: true, isAnchor: false, warning: null },
          { seq: 2, type: 'delivery', zone: 'Q5', label: 'Las Marinas', eta: '21:00', promised: '21:00', slipLabel: null, status: 'ok', marginLabel: '+0 margen', isNewOrder: false, isAnchor: true, warning: null },
          { seq: 3, type: 'return', zone: null, label: 'Regreso pizzería', eta: '21:10', promised: null, slipLabel: null, status: 'ok', marginLabel: null, isNewOrder: false, isAnchor: false, warning: null },
        ],
      },
    },
    {
      id: 'opp-q1-q5-2105',
      blocked: false,
      kind: 'agregar',
      giroId: 'giro-q5-2100',
      channel: 'sur',
      currentOrderZone: 'Q1',
      currentOrderLabel: 'Pedido actual · Q1',
      routeZones: ['Q1', 'Q5'],
      mapPath: ['Pizzería', 'Q1', 'Q5'],
      routeEtas: [
        { zone: 'Q1', label: 'Pedido actual', eta: '20:48', isNew: true },
        { zone: 'Q5', label: 'Las Marinas', eta: '21:05', promised: '21:00', slips: true, slipLabel: '+5' },
      ],
      baseline: { directEta: '20:42', label: 'Directa sin giro' },
      capacity: { pizzas: '4/6', routeMin: 26, limitMin: 30, state: 'tight' },
      status: 'ajuste',
      severity: 'warning',
      time: '21:00',
      zoneLabel: 'Q5',
      title: 'Ajuste +5 · giro Q5',
      subtitle: 'Insertar Q1 mueve Las Marinas a 21:05',
      chip: 'ajuste +5',
      actionLabel: '◷',
      explanation: 'Q1 cabe en el giro, pero retrasa Q5 sobre lo prometido.',
      warning: 'Q5 se mueve +5 min (prometido 21:00)',
      routeTimeline: {
        version: 'route-timeline-v2',
        proposalId: 'opp-q1-q5-2105',
        summary: { directEta: '20:42', giroEta: '21:05', returnEta: '21:15', tradeoffLabel: '+23 vs directa · 1 viaje ahorrado' },
        risk: 'warning',
        operatorMessage: 'Se puede, pero Q5 cede +5 min sobre lo prometido (prometido 21:00).',
        timeline: [
          { seq: 0, type: 'departure', zone: null, label: 'Pizzería', eta: '20:40', promised: null, slipLabel: null, status: 'ok', marginLabel: null, isNewOrder: false, isAnchor: false, warning: null },
          { seq: 1, type: 'delivery', zone: 'Q1', label: 'Pedido actual', eta: '20:48', promised: null, slipLabel: null, status: 'ok', marginLabel: null, isNewOrder: true, isAnchor: false, warning: null },
          { seq: 2, type: 'delivery', zone: 'Q5', label: 'Las Marinas', eta: '21:05', promised: '21:00', slipLabel: '+5', status: 'ajuste', marginLabel: '−5 vs prometido', isNewOrder: false, isAnchor: true, warning: 'Q5 se mueve +5 min' },
          { seq: 3, type: 'return', zone: null, label: 'Regreso pizzería', eta: '21:15', promised: null, slipLabel: null, status: 'ok', marginLabel: null, isNewOrder: false, isAnchor: false, warning: null },
        ],
      },
    },
    {
      id: 'opp-crear-q2-q5-2055',
      blocked: false,
      kind: 'crear',
      giroId: null,
      channel: 'sur',
      currentOrderZone: 'Q2',
      currentOrderLabel: 'Pedido actual · Q2',
      routeZones: ['Q2', 'Q5'],
      mapPath: ['Pizzería', 'Q2', 'Q5'],
      routeEtas: [
        { zone: 'Q2', label: 'Pedido actual', eta: '20:55', isNew: true },
        { zone: 'Q5', label: 'Las Marinas', eta: '21:08', promised: null, slips: false },
      ],
      baseline: { directEta: '20:50', label: 'Directa sin giro' },
      capacity: { pizzas: '2/6', routeMin: 20, limitMin: 30, state: 'ok' },
      status: 'compatible',
      severity: 'manual',
      time: '20:55',
      zoneLabel: 'Q2+Q5',
      title: 'Crear giro Q2+Q5',
      subtitle: 'No hay giro previo · nuevo giro manual sur',
      chip: 'crear giro',
      actionLabel: '↗',
      explanation: 'Agrupa Q2 y Q5 en un giro nuevo por el canal sur.',
      warning: null,
    },
    {
      id: 'opp-q3-q5-2110',
      blocked: true,
      kind: 'agregar',
      giroId: 'giro-q5-2100',
      channel: 'cross',
      currentOrderZone: 'Q3',
      currentOrderLabel: 'Pedido actual · Q3',
      routeZones: ['Q3', 'Q5'],
      mapPath: ['Pizzería', 'Q3', 'Q5'],
      routeEtas: [
        { zone: 'Q3', label: 'Pedido actual', eta: '21:02', isNew: true },
        { zone: 'Q5', label: 'Las Marinas', eta: '21:18', promised: '21:00', slips: true, slipLabel: '+18' },
      ],
      baseline: { directEta: '20:55', label: 'Directa sin giro' },
      capacity: { pizzas: '4/6', routeMin: 31, limitMin: 30, state: 'tight' },
      status: 'no_recomendado',
      severity: 'blocked',
      time: '21:10',
      zoneLabel: 'Q3+Q5',
      title: 'Q3+Q5 no recomendado',
      subtitle: 'Zonas en direcciones distintas (oeste vs sur)',
      chip: 'no recomendado',
      actionLabel: '⚠',
      explanation: 'Q3 va al oeste y Q5 al sur: alarga la ruta y enfría las pizzas.',
      warning: 'Direcciones distintas · solo forzable con aviso',
    },
    {
      id: 'opp-lleno-sur-2115',
      blocked: true,
      kind: 'agregar',
      giroId: 'giro-sur-2115',
      channel: 'sur',
      currentOrderZone: 'Q1',
      currentOrderLabel: 'Pedido actual · Q1',
      routeZones: ['Q1', 'Q2', 'Q5'],
      mapPath: ['Pizzería', 'Q1', 'Q2', 'Q5'],
      routeEtas: [
        { zone: 'Q1', label: 'Pedido actual', eta: '21:00', isNew: true },
        { zone: 'Q2', label: 'Buenavista', eta: '21:08', promised: '21:05', slips: true, slipLabel: '+3' },
        { zone: 'Q5', label: 'Las Marinas', eta: '21:20', promised: '21:15', slips: true, slipLabel: '+5' },
      ],
      baseline: { directEta: '20:58', label: 'Directa sin giro' },
      capacity: { pizzas: '6/6', routeMin: 28, limitMin: 30, state: 'full' },
      status: 'lleno',
      severity: 'blocked',
      time: '21:15',
      zoneLabel: 'Q1+Q2+Q5',
      title: 'Capacidad llena 6/6',
      subtitle: 'El giro sur 21:15 ya va completo',
      chip: 'capacidad llena',
      actionLabel: '✕',
      explanation: 'El giro sur ya lleva 6 pizzas: no admite el pedido Q1.',
      warning: 'Capacidad llena 6/6 · no entra más',
    },
  ],
  plannerNotes: [
    'Las filas son oportunidades del planner, no pedidos confirmados.',
    'Tocar una fila previsualiza el impacto en el mapa, no aplica nada.',
    'Canal sur: Q1→Q2→Q5. Canal oeste: Q1→Q3→Q4. Cruzar canales no es recomendado.',
  ],
};

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

const kindLabels = { agregar: 'Agregar a giro', crear: 'Crear giro' };
const statusLabels = {
  compatible: 'compatible',
  ajuste: 'ajuste',
  no_recomendado: 'no recomendado',
  lleno: 'capacidad llena',
};
const channelLabels = { sur: 'canal sur', oeste: 'canal oeste', cross: 'cruzado' };

// Render-only: muestra el badge YA CALCULADO por el planner (eta.slipLabel).
// El frontend NO calcula el retraso ni compara eta/promised.
const etaSlipBadge = (eta) => (eta.slips && eta.slipLabel ? ` (${eta.slipLabel})` : '');

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

// Contract strategic → oggetto con la stessa shape di PREMIUM_PLANNER_LAB_DATA
// (+ extra read-only). bestProposal SOLO da firstAvailable/bestProposal reali:
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
    ...((contract.warnings || []).map((w) => w && w.message).filter(Boolean)),
    ...((contract.blockers || []).map((b) => b && b.message).filter(Boolean)),
  ];
  return {
    contract: contract.contract,
    mode: contract.mode || 'read_only',
    source: 'backend-readonly',
    bestProposal,
    zoneMap: LOCAL_ZONE_MAP, // geografía estática real del local (no backend, no mock)
    opportunities,
    plannerNotes: notesFromContract.length ? notesFromContract : PREMIUM_PLANNER_LAB_DATA.plannerNotes,
    firstAvailable: fa,
    serviceLine: Array.isArray(contract.serviceLine) ? contract.serviceLine : [],
    warnings: Array.isArray(contract.warnings) ? contract.warnings : [],
    blockers: Array.isArray(contract.blockers) ? contract.blockers : [],
    safety: contract.safety || null,
  };
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
}) => {
  // Fuente de datos: contract backend read-only si válido, si no fixture mock LAB.
  const isStrategic = !!(data && data.contract === STRATEGIC_CONTRACT);
  const view = isStrategic ? adaptStrategicContract(data) : PREMIUM_PLANNER_LAB_DATA;
  const opportunities = Array.isArray(view.opportunities) ? view.opportunities : [];
  const best = view.bestProposal || {};
  const [selectedOppId, setSelectedOppId] = useState(opportunities[0]?.id || null);
  // Sección avanzada (ruta sugerida manual + resumen): cerrada por defecto.
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selectedOpp =
    opportunities.find(item => item.id === selectedOppId) || opportunities[0] || null;

  const selectOpportunity = (opp) => {
    setSelectedOppId(opp.id);
    labLog('preview-only', { id: opp.id, kind: opp.kind, status: opp.status });
  };

  const applyBest = () => {
    // LAB: no API, no save, no confirm — solo log local (no-op).
    labLog('apply-best-local', { id: best.id, source: view.source });
  };

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

        <div className="ppp-top-grid">
          <section className="ppp-best-card" aria-label="Mejor propuesta">
            <div className="ppp-best-label">
              <span>✦</span>
              <strong>{best.label || 'Mejor propuesta'}</strong>
            </div>
            <h3>Entrega {best.entrega || '—'}</h3>
            {/* salidaHorno/driverStatus solo si la fuente los provee (mock).
                El contract strategic NO los tiene → no se inventan. */}
            {best.salidaHorno && <p className="ppp-horno">Salida horno {best.salidaHorno}</p>}
            {best.driverStatus && <p className="ppp-driver"><span>▣</span> {best.driverStatus}</p>}
            {best.status && <p className="ppp-type">Estado: {statusLabels[best.status] || best.status}</p>}
            {best.routeLabel && <p className="ppp-type">{best.routeLabel}</p>}

            {selectedOpp && <OpportunityPreview opp={selectedOpp} />}

            {/* no-op: applyBest no escribe / no llama API / no confirma. Por eso
                la etiqueta deja claro que es solo vista previa, no una acción. */}
            <button type="button" className="ppp-apply" onClick={applyBest}>
              Seleccionar en vista previa
            </button>
          </section>

          <MiniZoneMap zoneMap={view.zoneMap} opp={selectedOpp} />
        </div>

        {/* Línea del giro (Pizzería → entregas → Regreso) — render-only del campo
            additivo routeTimeline. Prioridad: la proposal seleccionada; si no, la
            bestProposal. Si ninguna lo trae (mock o backend sin routeTimeline) el
            componente devuelve null → fallback a la UI actual sin romper nada. */}
        <RouteTimeline routeTimeline={(selectedOpp && selectedOpp.routeTimeline) || best.routeTimeline || null} />

        {/* Sección "Avanzado": colapsable y CERRADA por defecto. Contiene la ruta
            sugerida manual (interactiva, read-only: previewManualGiroRoute, NUNCA
            createManualGiro) y el resumen. Fuera de la vista principal del operador. */}
        {(onCalcManualRoute || view.source === 'backend-readonly') && (
          <section className="ppp-advanced" aria-label="Avanzado">
            <button
              type="button"
              className="ppp-adv-toggle"
              onClick={() => setShowAdvanced(v => !v)}
              aria-expanded={showAdvanced}
              style={{
                width: '100%', textAlign: 'left', cursor: 'pointer', marginTop: 10,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10, color: '#cfcfd4', fontWeight: 800, fontSize: 13,
                padding: '10px 14px',
              }}
            >
              {showAdvanced ? '▾' : '▸'} Avanzado
            </button>

            {showAdvanced && (
              <>
                {/* Ruta sugerida manual: modo interactivo (operador propone Q2→Q5…).
                    Solo se renderiza si el contenedor pasa onCalcManualRoute. Recolector
                    de clics + renderer de la routeTimeline read-only del backend. */}
                {onCalcManualRoute && (
                  <ManualRouteSection
                    currentZone={manualCurrentZone}
                    startTime={manualStartTime}
                    preview={manualRoutePreview}
                    loading={manualRouteLoading}
                    warning={manualRouteWarning}
                    onCalc={onCalcManualRoute}
                    onClear={onClearManualRoute}
                  />
                )}

                {view.source === 'backend-readonly' && (
                  <BackendSummary view={view} />
                )}
              </>
            )}
          </section>
        )}

        <section className="ppp-quick-section">
          <h3>Otras opciones rápidas</h3>
          <div className="ppp-options">
            {opportunities.map(opp => {
              const tone = toneStyles[opp.severity] || toneStyles.info;
              const isActive = selectedOpp && selectedOpp.id === opp.id;
              return (
                <button
                  type="button"
                  key={opp.id}
                  className={`ppp-option-card${isActive ? ' is-active' : ''}`}
                  style={{ '--tone': tone.accent, '--toneBg': tone.bg, '--toneBorder': tone.border }}
                  onClick={() => selectOpportunity(opp)}
                  aria-pressed={isActive}
                >
                  <span className="ppp-option-top">
                    <strong>{opp.time}</strong>
                    <i>{opp.actionLabel}</i>
                  </span>
                  <b>{opp.title}</b>
                  <small>{opp.subtitle}</small>
                </button>
              );
            })}
          </div>
        </section>

        <section className="ppp-timeline-card">
          <div className="ppp-card-title">
            <h3><span>↻</span> Giros y huecos</h3>
            <p><span>↻</span> Oportunidades sugeridas</p>
          </div>
          <div className="ppp-timeline" aria-label="Giros y huecos">
            {opportunities.map(opp => {
              const tone = toneStyles[opp.severity] || toneStyles.info;
              const isActive = selectedOpp && selectedOpp.id === opp.id;
              return (
                <button
                  type="button"
                  key={opp.id}
                  className={`ppp-timeline-row${isActive ? ' is-active' : ''}`}
                  style={{ '--tone': tone.accent, '--toneBg': tone.bg, '--toneBorder': tone.border }}
                  onClick={() => selectOpportunity(opp)}
                  aria-pressed={isActive}
                >
                  <span className="ppp-row-time">{opp.time}</span>
                  <span className="ppp-row-dot" />
                  <span className="ppp-row-copy">
                    <strong>{opp.title}</strong>
                    <small>{opp.subtitle}</small>
                  </span>
                  <span className="ppp-row-chip">{opp.chip}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="ppp-notes" aria-label="Notas del planner">
          <h3><span>♧</span> Notas del planner</h3>
          <ul>
            {view.plannerNotes.map(note => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          {selectedOpp && (
            <span className="ppp-selected">
              Preview local: {kindLabels[selectedOpp.kind]} · {selectedOpp.zoneLabel} · {statusLabels[selectedOpp.status]}
            </span>
          )}
        </section>
      </section>
    </div>
  );
};

const OpportunityPreview = ({ opp }) => {
  const tone = toneStyles[opp.severity] || toneStyles.info;
  const propuesta = opp.routeEtas
    .map(eta => `${eta.zone} ${eta.eta}${etaSlipBadge(eta)}`)
    .join(' → ');

  return (
    <section
      className="ppp-preview"
      style={{ '--tone': tone.accent, '--toneBg': tone.bg, '--toneBorder': tone.border }}
      aria-label="Preview de la oportunidad seleccionada"
    >
      <div className="ppp-preview-head">
        <strong>{opp.kind === 'crear' ? 'Crear' : 'Agregar'}</strong>
        <span className="ppp-preview-chip">{statusLabels[opp.status]}</span>
      </div>
      <dl className="ppp-preview-rows">
        <div>
          <dt>Directa</dt>
          <dd>{opp.baseline.directEta}</dd>
        </div>
        <div>
          <dt>En giro</dt>
          <dd>{propuesta}</dd>
        </div>
        <div>
          <dt>Capacidad</dt>
          <dd>{opp.capacity.pizzas} · {opp.capacity.routeMin}/{opp.capacity.limitMin} min</dd>
        </div>
      </dl>
      {opp.warning && (
        <p className="ppp-preview-warn">⚠ {opp.warning}</p>
      )}
    </section>
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

const RouteTimeline = ({ routeTimeline, compact = false }) => {
  // Fallback seguro: sin routeTimeline o sin timeline[] → no render (UI actual intacta).
  if (!routeTimeline || !Array.isArray(routeTimeline.timeline) || routeTimeline.timeline.length === 0) {
    return null;
  }
  // Copia + sort por el `seq` numérico YA dado por el backend (rendering, no lógica).
  const nodes = [...routeTimeline.timeline].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const summary = routeTimeline.summary || null;
  const risk = routeTimeline.risk || null;
  const riskLabel = risk ? (RT_RISK_LABELS[risk] || risk) : null;

  return (
    <section className={`ppp-rt${compact ? ' is-compact' : ''}`} aria-label="Línea del giro">
      <header className="ppp-rt-head">
        <h3><span>🛵</span> Línea del giro</h3>
        {riskLabel && <span className={`ppp-rt-risk rt-${risk}`}>{riskLabel}</span>}
      </header>

      {routeTimeline.operatorMessage && (
        <p className="ppp-rt-msg">{routeTimeline.operatorMessage}</p>
      )}

      {summary && (summary.directEta || summary.giroEta || summary.returnEta || summary.tradeoffLabel) && (
        <dl className="ppp-rt-summary">
          {summary.directEta && (<div><dt>Directa</dt><dd>{summary.directEta}</dd></div>)}
          {summary.giroEta && (<div><dt>En giro</dt><dd>{summary.giroEta}</dd></div>)}
          {summary.returnEta && (<div><dt>Regreso</dt><dd>{summary.returnEta}</dd></div>)}
          {summary.tradeoffLabel && (<div><dt>Balance</dt><dd>{summary.tradeoffLabel}</dd></div>)}
        </dl>
      )}

      <ol className="ppp-rt-line">
        {nodes.map((node, i) => {
          const typeLabel = RT_NODE_TYPE_LABELS[node.type] || node.type || '';
          const status = node.status || null;
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
                <div className="ppp-rt-meta">
                  <span className="ppp-rt-kind">{typeLabel}</span>
                  {node.zone && <span className="ppp-rt-zone">{node.zone}</span>}
                  {node.isNewOrder && <span className="ppp-rt-badge bd-new">nuevo</span>}
                  {node.isAnchor && <span className="ppp-rt-badge bd-anchor">en giro</span>}
                  {node.promised && <span className="ppp-rt-prom">prometido {node.promised}</span>}
                  {node.slipLabel && <span className="ppp-rt-slip">{node.slipLabel}</span>}
                  {node.marginLabel && <span className="ppp-rt-margin">{node.marginLabel}</span>}
                </div>
                {node.warning && <p className="ppp-rt-warn">⚠ {node.warning}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

// ── ManualRouteSection — recolector de clics + renderer (NO motor) ────────────
// El operador construye una SECUENCIA de paradas (pedido actual + anclas Q1–Q5
// que añade clicando) y pulsa "Calcular ruta LAB". La sección SOLO arma
// `selectedStops` (zone + label genérica, SIN PII, SIN promised inventado) y los
// pasa al contenedor (onCalc), que valida (hora + zona) y llama al backend. La
// respuesta `routeTimeline` (route-timeline-v2) se dibuja con el MISMO renderer
// puro <RouteTimeline/>. REGLA renderer-only: aquí NO se calcula ETA/slip/risk/
// capacity/status, NO hay Date.now, NI parsing HH:MM, NI aritmética de horas.
const MANUAL_ROUTE_ZONES = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];

const ManualRouteSection = ({ currentZone, startTime, preview, loading, warning, onCalc, onClear }) => {
  const [anchorZones, setAnchorZones] = useState([]);
  // Zona actual en modo LAB: si el draft NO trae zona resuelta (evitamos forzar
  // geo_cache), el operador puede ELEGIRLA a mano aquí solo para la preview LAB.
  // Presentacional: es solo el `zone` del stop current_order, sin PII, sin geo.
  const [labCurrentZone, setLabCurrentZone] = useState(null);
  const effectiveCurrentZone = currentZone || labCurrentZone;

  // Construye selectedStops: primero el pedido actual (si hay zona), luego las
  // anclas en el ORDEN en que el operador las clicó (no se reordena nada).
  const buildStops = () => {
    const stops = [];
    if (effectiveCurrentZone) stops.push({ type: 'current_order', zone: effectiveCurrentZone, label: 'Pedido actual' });
    anchorZones.forEach((z) => stops.push({ type: 'anchor', zone: z, label: `${z} · ancla manual` }));
    return stops;
  };

  const addZone = (z) => setAnchorZones((prev) => [...prev, z]);
  const removeLast = () => setAnchorZones((prev) => prev.slice(0, -1));
  const clearAll = () => {
    setAnchorZones([]);
    setLabCurrentZone(null);
    if (onClear) onClear();
  };
  const calc = () => { if (onCalc) onCalc(buildStops()); };

  const canCalc = !!effectiveCurrentZone && !!startTime && !loading;
  const rt = preview && preview.routeTimeline ? preview.routeTimeline : null;
  const blockers = preview && Array.isArray(preview.blockers) ? preview.blockers : [];
  const pwarnings = preview && Array.isArray(preview.warnings) ? preview.warnings : [];

  return (
    <section className="ppp-mr" aria-label="Ruta sugerida">
      <header className="ppp-mr-head">
        <h3><span>🧭</span> Ruta sugerida</h3>
        <span className="ppp-mr-pill">Vista previa</span>
      </header>

      {!effectiveCurrentZone && (
        <p className="ppp-mr-warn">⚠ Zona del pedido actual sin resolver — añade dirección/zona, o elige una zona abajo.</p>
      )}
      {!startTime && (
        <p className="ppp-mr-warn">⚠ Falta la hora (startTime) — elige hora antes de calcular.</p>
      )}

      <div className="ppp-mr-current">
        <span className="ppp-mr-k">Pedido actual</span>
        <strong>{effectiveCurrentZone || '—'}</strong>
      </div>

      {/* Selector LAB de zona actual: solo si el draft no trae zona resuelta. NO
          escribe geo_cache; es presentacional para poder probar la ruta en LAB. */}
      {!currentZone && (
        <div className="ppp-mr-picker">
          <span className="ppp-mr-k">Zona actual</span>
          {MANUAL_ROUTE_ZONES.map((z) => (
            <button
              type="button"
              key={`lab-${z}`}
              className={`ppp-mr-chip${labCurrentZone === z ? ' is-on' : ''}`}
              onClick={() => setLabCurrentZone(z)}
              aria-pressed={labCurrentZone === z}
              aria-label={`Zona actual ${z}`}
            >
              {z}
            </button>
          ))}
        </div>
      )}

      <div className="ppp-mr-picker">
        <span className="ppp-mr-k">Añadir parada</span>
        {MANUAL_ROUTE_ZONES.map((z) => (
          <button type="button" key={z} className="ppp-mr-chip" onClick={() => addZone(z)} aria-label={`Añadir parada ${z}`}>
            {z}
          </button>
        ))}
      </div>

      <div className="ppp-mr-seq" aria-label="Secuencia de paradas">
        <span className="ppp-mr-k">Secuencia</span>
        <span className="ppp-mr-stop is-current">{effectiveCurrentZone || '—'} · actual</span>
        {anchorZones.map((z, i) => (
          <span key={`${z}-${i}`} className="ppp-mr-stop is-anchor">→ {z}</span>
        ))}
        {anchorZones.length === 0 && <em className="ppp-mr-empty">solo pedido actual</em>}
      </div>

      <div className="ppp-mr-actions">
        <button type="button" className="ppp-mr-calc" onClick={calc} disabled={!canCalc}>
          {loading ? 'Calculando…' : 'Calcular ruta'}
        </button>
        {anchorZones.length > 0 && (
          <button type="button" className="ppp-mr-undo" onClick={removeLast}>Quitar última</button>
        )}
        <button type="button" className="ppp-mr-clear" onClick={clearAll}>Limpiar ruta</button>
      </div>

      {loading && (
        <p className="ppp-mr-loading" role="status" aria-live="polite">⟳ Calculando…</p>
      )}
      {!loading && warning && (
        <p className="ppp-mr-warn" role="status">⚠ {warning}</p>
      )}

      {preview && !loading && (
        <div className="ppp-mr-result">
          {blockers.length > 0 && (
            <ul className="ppp-mr-blockers">
              {blockers.map((b, i) => (<li key={`mb-${i}`}>✕ {msgOf(b)}</li>))}
            </ul>
          )}
          {pwarnings.length > 0 && (
            <ul className="ppp-mr-warns">
              {pwarnings.map((w, i) => (<li key={`mw-${i}`}>⚠ {msgOf(w)}</li>))}
            </ul>
          )}
          {/* Renderer puro de la línea backend; si no hay timeline → fallback safe. */}
          {rt ? <RouteTimeline routeTimeline={rt} /> : (
            <p className="ppp-mr-fallback">Sin línea de ruta calculable (revisa paradas/zonas).</p>
          )}
          {/* safety read-only/writes: dato interno, NO visible al operador. */}
        </div>
      )}
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

      {opp && (
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

// BackendSummary — render-only del contract strategic. SOLO pass-through di campi
// già calcolati dal backend (firstAvailable / serviceLine / warnings / blockers /
// safety). Niente aritmetica, niente Date.now, niente derivazioni: solo lookup di
// label presentazionale e lettura difensiva.
const msgOf = (x) => (typeof x === 'string' ? x : (x && (x.message || x.label || x.text)) || '');
const serviceLineLabelOf = (e) => {
  if (typeof e === 'string') return e;
  if (!e) return '';
  const when = e.hora || e.eta || e.time || '';
  const zone = e.zone || e.zoneLabel || '';
  const label = e.label || e.title || '';
  return [when, zone, label].filter(Boolean).join(' · ');
};

const BackendSummary = ({ view }) => {
  const fa = view.firstAvailable || null;
  const serviceLine = Array.isArray(view.serviceLine) ? view.serviceLine : [];
  const warnings = Array.isArray(view.warnings) ? view.warnings : [];
  const blockers = Array.isArray(view.blockers) ? view.blockers : [];
  const faStatus = fa && fa.status ? (statusLabels[fa.status] || fa.status) : null;

  return (
    <section className="ppp-backend-summary" aria-label="Resumen">
      <header className="ppp-bs-head">
        <span className="ppp-bs-badge">Vista previa</span>
        {/* safety read-only/writes: dato interno, NO visible al operador. */}
      </header>
      {fa && (fa.eta || faStatus) && (
        <p className="ppp-bs-first">
          <strong>Primera disponible:</strong> {fa.eta || '—'}{faStatus ? ` · ${faStatus}` : ''}
        </p>
      )}
      {serviceLine.length > 0 && (
        <div className="ppp-bs-block">
          <h4>Línea de servicio</h4>
          <ul>
            {serviceLine.map((e, i) => (
              <li key={`sl-${i}`}>{serviceLineLabelOf(e)}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="ppp-bs-block ppp-bs-warn">
          <h4>Avisos</h4>
          <ul>
            {warnings.map((w, i) => (
              <li key={`w-${i}`}>⚠ {msgOf(w)}</li>
            ))}
          </ul>
        </div>
      )}
      {blockers.length > 0 && (
        <div className="ppp-bs-block ppp-bs-err">
          <h4>Bloqueos</h4>
          <ul>
            {blockers.map((b, i) => (
              <li key={`b-${i}`}>✕ {msgOf(b)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
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
.ppp-best-card h3{ margin:24px 0 12px; color:#F1F3F4; font-size:40px; line-height:1.05; font-weight:850; letter-spacing:0; text-shadow:0 3px 16px rgba(0,0,0,0.32); }
.ppp-horno{ margin:0 0 14px; color:#AEB8C0; font-size:20px; font-weight:450; }
.ppp-driver{ display:flex; align-items:center; gap:12px; margin:0 0 12px; color:#58EF75; font-size:20px; font-weight:650; }
.ppp-driver span{ color:#58EF75; font-size:19px; }
.ppp-type{ margin:0 0 6px; color:#B7BCC2; font-size:18px; font-weight:450; }
.ppp-apply{ width:100%; min-height:62px; margin-top:auto; border:1px solid rgba(88,239,117,0.35); border-radius:7px; color:#FFFFFF; background:linear-gradient(100deg,#18A84E,#22C45E); box-shadow:0 16px 32px rgba(19,167,79,0.28), inset 0 1px 0 rgba(255,255,255,0.10); font-size:22px; font-weight:700; cursor:pointer; }
.ppp-apply:hover{ filter:brightness(1.05); }
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
`;

export default PremiumPlannerPopup;
