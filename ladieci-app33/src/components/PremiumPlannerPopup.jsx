import { useState } from 'react';

const PREMIUM_PLANNER_LAB_DATA = {
  contract: 'premium-planner-popup-lab-v1',
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
    route: ['Pizzería', 'Q1', 'Q5'],
    seaLabel: 'MAR MEDITERRÁNEO',
    zones: [
      { id: 'Q1', name: 'Centro', color: '#0097A7', hasPizzeria: true },
      { id: 'Q2', name: 'Buenavista', color: '#CE93D8' },
      { id: 'Q3', name: 'IES', color: '#E65100' },
      { id: 'Q4', name: 'Cortijos', color: '#C2185B' },
      { id: 'Q5', name: 'Las Marinas', color: '#7CB342' },
    ],
  },
  quickOptions: [
    {
      id: 'quick-q1-1555',
      time: '15:55',
      title: 'Q1 compatible',
      subtitle: 'Hueco disponible',
      severity: 'ok',
      zoneIds: ['Q1'],
      sourceServiceLineId: 'line-q1-1555',
      actionLabel: '✓',
    },
    {
      id: 'quick-adjust-1600',
      time: '16:00',
      title: 'Ajuste +5 min',
      subtitle: 'Ventana extendida',
      severity: 'warning',
      zoneIds: ['Q1'],
      sourceServiceLineId: 'line-q1-1555',
      actionLabel: '◷',
    },
    {
      id: 'quick-manual-q1-q5-1610',
      time: '16:10',
      title: 'Q1+Q5 compatible',
      subtitle: 'Forzado por operador',
      severity: 'manual',
      zoneIds: ['Q1', 'Q5'],
      sourceServiceLineId: 'line-q1-q5-1610',
      actionLabel: '↗',
    },
    {
      id: 'quick-new-q5-1625',
      time: '16:25',
      title: 'Nuevo giro',
      subtitle: 'Pedido asignado',
      severity: 'new',
      zoneIds: ['Q5'],
      sourceServiceLineId: 'line-q5-1625',
      actionLabel: '↻',
    },
  ],
  serviceLine: [
    {
      id: 'line-q1-1545',
      time: '15:45',
      zoneLabel: 'Q1',
      title: 'Q1 en curso',
      subtitle: 'Ruta actual',
      severity: 'info',
      chip: 'en curso',
      action: 'preview_only',
    },
    {
      id: 'line-q1-1555',
      time: '15:55',
      zoneLabel: 'Q1',
      title: 'Q1 compatible',
      subtitle: 'Hueco disponible',
      severity: 'ok',
      chip: 'libre',
      action: 'preview_only',
    },
    {
      id: 'line-q1-q5-1610',
      time: '16:10',
      zoneLabel: 'Q1+Q5',
      title: 'Q1+Q5 compatible',
      subtitle: 'Forzado por operador',
      severity: 'manual',
      chip: 'compatible',
      action: 'preview_only',
    },
    {
      id: 'line-q5-1625',
      time: '16:25',
      zoneLabel: 'Q5',
      title: 'Q5 nuevo giro',
      subtitle: 'Pedido asignado',
      severity: 'new',
      chip: 'nuevo giro',
      action: 'preview_only',
    },
    {
      id: 'line-driver-1640',
      time: '16:40',
      zoneLabel: 'Driver',
      title: 'Driver vuelve libre',
      subtitle: 'Fin de ruta Q1+Q5',
      severity: 'ok',
      chip: 'libre',
      action: 'preview_only',
    },
  ],
  plannerNotes: [
    'Agrupar Q1+Q5 añade ~13 min de ruta pero evita retorno.',
    'Próximo hueco natural: 16:10.',
    'Toca una línea para previsualizar, no se aplica automáticamente.',
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

const labLog = (eventName, payload) => {
  console.debug('[PremiumPlannerPopup LAB]', eventName, payload);
};

const PremiumPlannerPopup = ({ onClose }) => {
  const data = PREMIUM_PLANNER_LAB_DATA;
  const [selectedPreviewId, setSelectedPreviewId] = useState(data.quickOptions[0]?.id || data.bestProposal.id);

  const selectedPreview =
    data.quickOptions.find(item => item.id === selectedPreviewId) ||
    data.serviceLine.find(item => item.id === selectedPreviewId) ||
    data.bestProposal;

  const previewLabel = selectedPreview.time
    ? `${selectedPreview.time} · ${selectedPreview.title}`
    : `${selectedPreview.entrega} · ${selectedPreview.label}`;

  const selectPreview = (item) => {
    setSelectedPreviewId(item.id);
    labLog('preview-only', item);
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
            <button
              type="button"
              className="ppp-apply"
              onClick={() => selectPreview(data.bestProposal)}
            >
              {data.bestProposal.ctaLabel}
            </button>
          </section>

          <MiniZoneMap zoneMap={data.zoneMap} />
        </div>

        <section className="ppp-quick-section">
          <h3>Otras opciones rápidas</h3>
          <div className="ppp-options">
            {data.quickOptions.map(option => {
              const tone = toneStyles[option.severity] || toneStyles.info;
              return (
                <button
                  type="button"
                  key={option.id}
                  className="ppp-option-card"
                  style={{ '--tone': tone.accent, '--toneBg': tone.bg, '--toneBorder': tone.border }}
                  onClick={() => selectPreview(option)}
                >
                  <span className="ppp-option-top">
                    <strong>{option.time}</strong>
                    <i>{option.actionLabel}</i>
                  </span>
                  <b>{option.title}</b>
                  <small>{option.subtitle}</small>
                </button>
              );
            })}
          </div>
        </section>

        <section className="ppp-timeline-card">
          <div className="ppp-card-title">
            <h3><span>↻</span> Giros y huecos</h3>
            <p><span>↻</span> Actualizado ahora</p>
          </div>
          <div className="ppp-timeline" aria-label="Giros y huecos">
            {data.serviceLine.map((row, index) => {
              const tone = toneStyles[row.severity] || toneStyles.info;
              return (
                <button
                  type="button"
                  key={row.id}
                  className="ppp-timeline-row"
                  style={{ '--tone': tone.accent, '--toneBg': tone.bg, '--toneBorder': tone.border }}
                  onClick={() => selectPreview(row)}
                >
                  <span className="ppp-row-time">{row.time}</span>
                  <span className={`ppp-row-dot${row.severity === 'new' || index === 3 ? ' is-new' : ''}`} />
                  <span className="ppp-row-copy">
                    <strong>{row.title}</strong>
                    <small>{row.subtitle}</small>
                  </span>
                  <span className="ppp-row-chip">{row.chip}</span>
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
          <span className="ppp-selected">Preview local: {previewLabel}</span>
        </section>
      </section>
    </div>
  );
};

const MiniZoneMap = ({ zoneMap }) => {
  const zonesById = zoneMap.zones.reduce((acc, zone) => {
    acc[zone.id] = zone;
    return acc;
  }, {});

  return (
  <section className="ppp-map-card" aria-label="Esquema operativo por zonas">
    <h3>{zoneMap.title}</h3>
    <div className="ppp-map">
      <span className="ppp-road road-a" />
      <span className="ppp-road road-b" />
      <span className="ppp-road road-c" />
      <span className="ppp-zone zone-q4"><b>{zonesById.Q4.id}</b><small>{zonesById.Q4.name.toUpperCase()}</small></span>
      <span className="ppp-zone zone-q3"><b>{zonesById.Q3.id}</b><small>{zonesById.Q3.name.toUpperCase()}</small></span>
      <span className="ppp-zone zone-q1"><b>{zonesById.Q1.id}</b><small>{zonesById.Q1.name.toUpperCase()}</small>{zonesById.Q1.hasPizzeria && <em>🍕 Pizzería</em>}</span>
      <span className="ppp-zone zone-q2"><b>{zonesById.Q2.id}</b><small>{zonesById.Q2.name.toUpperCase()}</small></span>
      <span className="ppp-zone zone-q5"><b>{zonesById.Q5.id}</b><small>{zonesById.Q5.name.toUpperCase()}</small></span>
      <span className="ppp-shop-dot" />
      <span className="ppp-route route-a" />
      <span className="ppp-route route-b" />
      <span className="ppp-route route-c" />
      <span className="ppp-arrow">➜</span>
      <div className="ppp-sea">
        <span>⌁⌁</span>
        <span>⌁⌁</span>
        <span>⌁⌁</span>
        <strong>{zoneMap.seaLabel.split(' ').slice(0, 1).join(' ')}<br />{zoneMap.seaLabel.split(' ').slice(1).join(' ')}</strong>
        <span>⌁⌁</span>
        <span>⌁⌁</span>
      </div>
    </div>
    <p>{zoneMap.caption} <strong>{zoneMap.route[0]}</strong> → <b>{zoneMap.route[1]}</b> → <em>{zoneMap.route[2]}</em></p>
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
.ppp-best-card h3{ margin:30px 0 14px; color:#F1F3F4; font-size:44px; line-height:1.05; font-weight:850; letter-spacing:0; text-shadow:0 3px 16px rgba(0,0,0,0.32); }
.ppp-horno{ margin:0 0 26px; color:#AEB8C0; font-size:22px; font-weight:450; }
.ppp-driver{ display:flex; align-items:center; gap:12px; margin:0 0 18px; color:#58EF75; font-size:22px; font-weight:650; }
.ppp-driver span{ color:#58EF75; font-size:21px; }
.ppp-type{ margin:0; color:#B7BCC2; font-size:20px; font-weight:450; }
.ppp-apply{ width:100%; min-height:68px; margin-top:auto; border:1px solid rgba(88,239,117,0.35); border-radius:7px; color:#FFFFFF; background:linear-gradient(100deg,#18A84E,#22C45E); box-shadow:0 16px 32px rgba(19,167,79,0.28), inset 0 1px 0 rgba(255,255,255,0.10); font-size:22px; font-weight:700; cursor:pointer; }
.ppp-apply:hover{ filter:brightness(1.05); }
.ppp-map-card{ min-height:410px; padding:16px 18px 12px; }
.ppp-map-card h3{ margin:0 0 8px; color:#DEE4E7; font-size:17px; font-weight:600; }
.ppp-map{ position:relative; height:320px; overflow:hidden; border-radius:8px; background:linear-gradient(145deg,#0B1820,#08131A 70%); }
.ppp-road{ position:absolute; width:2px; height:430px; background:rgba(155,168,176,0.58); transform-origin:center; }
.road-a{ left:26%; top:-66px; transform:rotate(-15deg); }
.road-b{ left:52%; top:-88px; transform:rotate(-18deg); }
.road-c{ left:78%; top:-20px; transform:rotate(-6deg); }
.ppp-zone{ position:absolute; display:flex; align-items:center; justify-content:center; flex-direction:column; color:#F8FAFA; border:2px solid rgba(255,255,255,0.42); filter:drop-shadow(0 12px 16px rgba(0,0,0,0.24)); text-align:center; line-height:1.02; }
.ppp-zone b{ font-size:28px; font-weight:850; }
.ppp-zone small{ margin-top:5px; font-size:13px; font-weight:780; }
.ppp-zone em{ margin-top:10px; font-style:normal; font-size:13px; font-weight:650; }
.zone-q4{ left:3%; top:70px; width:30%; height:88px; background:${zoneColors.Q4}; clip-path:polygon(0 24%,8% 8%,45% 13%,100% 11%,90% 100%,9% 88%); }
.zone-q3{ left:30%; top:60px; width:33%; height:116px; background:${zoneColors.Q3}; clip-path:polygon(0 18%,76% 0,100% 0,86% 42%,100% 70%,42% 100%,14% 73%); }
.zone-q1{ right:12%; top:26px; width:31%; height:176px; background:${zoneColors.Q1}; clip-path:polygon(22% 10%,100% 0,92% 100%,40% 72%,0 46%); }
.zone-q2{ right:15%; top:145px; width:39%; height:145px; background:${zoneColors.Q2}; clip-path:polygon(0 17%,45% 0,100% 34%,79% 86%,36% 100%,13% 78%); }
.zone-q5{ left:10%; top:215px; width:40%; height:82px; background:${zoneColors.Q5}; clip-path:polygon(13% 13%,47% 0,86% 8%,100% 70%,22% 100%,0 72%); }
.ppp-shop-dot{ position:absolute; right:35%; top:139px; z-index:4; width:14px; height:14px; border-radius:999px; background:#58EF75; box-shadow:0 0 0 3px rgba(88,239,117,0.35),0 0 18px rgba(88,239,117,0.78); }
.ppp-route{ position:absolute; z-index:3; height:0; border-top:4px dashed #6EF070; border-radius:999px; filter:drop-shadow(0 0 4px rgba(110,240,112,0.55)); transform-origin:left center; }
.route-a{ right:35%; top:151px; width:82px; transform:rotate(96deg); }
.route-b{ left:42%; top:213px; width:96px; transform:rotate(139deg); }
.route-c{ left:30%; top:246px; width:72px; transform:rotate(156deg); }
.ppp-arrow{ position:absolute; left:27%; top:230px; z-index:4; color:#6EF070; font-size:30px; transform:rotate(150deg); text-shadow:0 0 12px rgba(110,240,112,0.8); }
.ppp-sea{ position:absolute; right:0; top:0; bottom:0; width:76px; display:flex; align-items:center; justify-content:space-around; flex-direction:column; padding:18px 8px; color:#2BA6D2; background:rgba(10,35,49,0.96); border-left:1px solid rgba(135,179,199,0.36); }
.ppp-sea span{ color:#1E7498; font-size:24px; line-height:1; }
.ppp-sea strong{ color:#9BB9C7; font-size:11px; line-height:1.2; text-align:center; font-weight:700; }
.ppp-map-card p{ margin:7px 0 0; color:#AEB8C0; text-align:center; font-size:17px; font-weight:500; }
.ppp-map-card p strong{ color:#F8FAFA; }
.ppp-map-card p b{ color:#26DCEB; }
.ppp-map-card p em{ color:#58EF75; font-style:normal; font-weight:800; }
.ppp-quick-section{ margin-top:26px; }
.ppp-quick-section h3{ margin:0 0 18px 8px; color:#F1F5F5; font-size:20px; font-weight:700; }
.ppp-options{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:18px; }
.ppp-option-card{ min-height:150px; display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-start; gap:12px; padding:20px 22px; border:1px solid var(--toneBorder); border-radius:10px; color:#F4F6F6; background:linear-gradient(145deg,var(--toneBg),rgba(6,16,22,0.92)); text-align:left; cursor:pointer; }
.ppp-option-card:hover{ transform:translateY(-1px); }
.ppp-option-top{ width:100%; display:flex; align-items:flex-start; justify-content:space-between; gap:10px; color:var(--tone); }
.ppp-option-top strong{ color:#F7FAFA; font-size:28px; line-height:1; font-weight:760; }
.ppp-option-top i{ width:29px; height:29px; display:grid; place-items:center; border:1px solid var(--tone); border-radius:999px; color:var(--tone); font-style:normal; font-size:19px; font-weight:700; }
.ppp-option-card b{ color:var(--tone); font-size:18px; line-height:1.15; font-weight:680; }
.ppp-option-card small{ color:#B9C0C4; font-size:16px; line-height:1.25; font-weight:450; }
.ppp-timeline-card{ margin-top:24px; padding:18px 20px 20px; }
.ppp-card-title{ display:flex; align-items:center; justify-content:space-between; gap:14px; margin-bottom:12px; }
.ppp-card-title h3,.ppp-card-title p{ display:flex; align-items:center; gap:10px; margin:0; color:#F3F7F8; font-size:22px; font-weight:750; }
.ppp-card-title p{ color:#AEB8C0; font-size:17px; font-weight:450; }
.ppp-timeline{ position:relative; overflow:hidden; border:1px solid rgba(83,112,131,0.55); border-radius:9px; background:rgba(5,14,20,0.46); }
.ppp-timeline::before{ content:""; position:absolute; left:128px; top:36px; bottom:32px; width:3px; border-radius:999px; background:linear-gradient(#26DCEB 0 18%,#58E86B 18% 43%,#B77CFF 43% 62%,#FFB11A 62% 78%,#58E86B 78% 100%); }
.ppp-timeline-row{ position:relative; width:100%; min-height:82px; display:grid; grid-template-columns:90px 38px minmax(0,1fr) 132px; gap:14px; align-items:center; padding:13px 22px; border:0; border-bottom:1px solid rgba(83,112,131,0.32); color:#F8FAFA; background:transparent; text-align:left; cursor:pointer; }
.ppp-timeline-row:last-child{ border-bottom:0; }
.ppp-row-time{ color:#B9C0C4; font-size:20px; font-weight:420; font-variant-numeric:tabular-nums; }
.ppp-row-dot{ z-index:1; width:17px; height:17px; border-radius:999px; background:var(--tone); box-shadow:0 0 0 3px rgba(0,0,0,0.22),0 0 16px color-mix(in srgb,var(--tone),transparent 40%); }
.ppp-row-dot.is-new{ background:#FFB11A; }
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
  .ppp-best-card h3{ font-size:34px; }
  .ppp-options{ grid-template-columns:1fr; }
  .ppp-map{ height:280px; }
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
