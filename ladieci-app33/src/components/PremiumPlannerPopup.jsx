import { useState } from 'react';

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
    ctaLabel: 'Aplicar propuesta',
  },
  zoneMap: {
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
  },
  // Cada fila de "Giros y huecos" es una OPORTUNIDAD sugerida por el planner,
  // no un pedido real. Click = preview local (mapa + impacto), nunca confirma.
  opportunities: [
    {
      id: 'opp-q2-q5-2100',
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
    },
    {
      id: 'opp-q1-q5-2105',
      kind: 'agregar',
      giroId: 'giro-q5-2100',
      channel: 'sur',
      currentOrderZone: 'Q1',
      currentOrderLabel: 'Pedido actual · Q1',
      routeZones: ['Q1', 'Q5'],
      mapPath: ['Pizzería', 'Q1', 'Q5'],
      routeEtas: [
        { zone: 'Q1', label: 'Pedido actual', eta: '20:48', isNew: true },
        { zone: 'Q5', label: 'Las Marinas', eta: '21:05', promised: '21:00', slips: true },
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
    },
    {
      id: 'opp-crear-q2-q5-2055',
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
      kind: 'agregar',
      giroId: 'giro-q5-2100',
      channel: 'cross',
      currentOrderZone: 'Q3',
      currentOrderLabel: 'Pedido actual · Q3',
      routeZones: ['Q3', 'Q5'],
      mapPath: ['Pizzería', 'Q3', 'Q5'],
      routeEtas: [
        { zone: 'Q3', label: 'Pedido actual', eta: '21:02', isNew: true },
        { zone: 'Q5', label: 'Las Marinas', eta: '21:18', promised: '21:00', slips: true },
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
      kind: 'agregar',
      giroId: 'giro-sur-2115',
      channel: 'sur',
      currentOrderZone: 'Q1',
      currentOrderLabel: 'Pedido actual · Q1',
      routeZones: ['Q1', 'Q2', 'Q5'],
      mapPath: ['Pizzería', 'Q1', 'Q2', 'Q5'],
      routeEtas: [
        { zone: 'Q1', label: 'Pedido actual', eta: '21:00', isNew: true },
        { zone: 'Q2', label: 'Buenavista', eta: '21:08', promised: '21:05', slips: true },
        { zone: 'Q5', label: 'Las Marinas', eta: '21:20', promised: '21:15', slips: true },
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

const zoneColors = PREMIUM_PLANNER_LAB_DATA.zoneMap.zones.reduce((acc, zone) => {
  acc[zone.id] = zone.color;
  return acc;
}, {});

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

const minutesOf = (hhmm) => {
  if (!hhmm || hhmm.indexOf(':') < 0) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const etaSlipBadge = (eta) => {
  if (!eta.slips || !eta.promised) return '';
  const diff = (minutesOf(eta.eta) ?? 0) - (minutesOf(eta.promised) ?? 0);
  return diff > 0 ? ` (+${diff})` : '';
};

const labLog = (eventName, payload) => {
  console.debug('[PremiumPlannerPopup LAB]', eventName, payload);
};

const PremiumPlannerPopup = ({ onClose }) => {
  const data = PREMIUM_PLANNER_LAB_DATA;
  const opportunities = data.opportunities;
  const [selectedOppId, setSelectedOppId] = useState(opportunities[0]?.id || null);

  const selectedOpp =
    opportunities.find(item => item.id === selectedOppId) || opportunities[0] || null;

  const selectOpportunity = (opp) => {
    setSelectedOppId(opp.id);
    labLog('preview-only', { id: opp.id, kind: opp.kind, status: opp.status });
  };

  const applyBest = () => {
    // LAB: no API, no save — solo log local.
    labLog('apply-best-local', { id: data.bestProposal.id });
  };

  return (
    <div className="ppp-overlay" onClick={onClose}>
      <style>{PREMIUM_PLANNER_POPUP_CSS}</style>
      <section className="ppp-shell" aria-label="Propuestas de entrega LAB" onClick={e => e.stopPropagation()}>
        <header className="ppp-header">
          <div className="ppp-brand-mark" aria-hidden="true">
            <span>✦</span>
            <span>✦</span>
            <span>✦</span>
          </div>
          <h2>Propuestas de entrega</h2>
          <span className="ppp-lab-pill">LAB · {data.source}</span>
          <button type="button" className="ppp-close" onClick={onClose} aria-label="Cerrar propuestas">×</button>
        </header>

        <div className="ppp-top-grid">
          <section className="ppp-best-card" aria-label="Mejor propuesta">
            <div className="ppp-best-label">
              <span>✦</span>
              <strong>{data.bestProposal.label}</strong>
            </div>
            <h3>Entrega {data.bestProposal.entrega}</h3>
            <p className="ppp-horno">Salida horno {data.bestProposal.salidaHorno}</p>
            <p className="ppp-driver"><span>▣</span> {data.bestProposal.driverStatus}</p>
            <p className="ppp-type">{data.bestProposal.routeLabel}</p>

            {selectedOpp && <OpportunityPreview opp={selectedOpp} />}

            <button type="button" className="ppp-apply" onClick={applyBest}>
              {data.bestProposal.ctaLabel}
            </button>
          </section>

          <MiniZoneMap zoneMap={data.zoneMap} opp={selectedOpp} />
        </div>

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
            {data.plannerNotes.map(note => (
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
  const hasWarning = Boolean(opp.warning) || opp.status === 'no_recomendado' || opp.status === 'lleno';
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
      {hasWarning && opp.warning && (
        <p className="ppp-preview-warn">⚠ {opp.warning}</p>
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
  const isBlocked = opp?.status === 'no_recomendado' || opp?.status === 'lleno';
  const zoneClass = (id) => `ppp-zone zone-${id.toLowerCase()}${activeZones.has(id) ? ' is-active' : ''}`;

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
        <span className={zoneClass('Q1')}><b>{zonesById.Q1.id}</b><small>{zonesById.Q1.name.toUpperCase()}</small>{zonesById.Q1.hasPizzeria && <em>🍕 Pizzería</em>}</span>
        <span className={zoneClass('Q2')}><b>{zonesById.Q2.id}</b><small>{zonesById.Q2.name.toUpperCase()}</small></span>
        <span className={zoneClass('Q5')}><b>{zonesById.Q5.id}</b><small>{zonesById.Q5.name.toUpperCase()}</small></span>
        <span className="ppp-shop-dot" />
        <div className="ppp-sea">
          <span>⌁⌁</span>
          <span>⌁⌁</span>
          <span>⌁⌁</span>
          <strong>{zoneMap.seaLabel.split(' ').slice(0, 1).join(' ')}<br />{zoneMap.seaLabel.split(' ').slice(1).join(' ')}</strong>
          <span>⌁⌁</span>
          <span>⌁⌁</span>
        </div>
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
          <div className="ppp-map-etas">
            {opp.routeEtas.map(eta => (
              <span
                key={`${opp.id}-${eta.zone}`}
                className={`ppp-eta-chip${eta.isNew ? ' is-new' : ''}${eta.slips ? ' is-slip' : ''}`}
              >
                {eta.zone} {eta.eta}{etaSlipBadge(eta)}
              </span>
            ))}
          </div>
          <span className="ppp-map-channel">{channelLabels[opp.channel] || opp.channel}</span>
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
