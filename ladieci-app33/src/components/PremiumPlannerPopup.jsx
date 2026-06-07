import { useState } from 'react';

const zoneColors = {
  Q1: '#0097A7',
  Q2: '#CE93D8',
  Q3: '#E65100',
  Q4: '#C2185B',
  Q5: '#7CB342',
};

const quickOptions = [
  { tone: 'ok', time: '15:55', title: 'Q1 compatible', note: 'Hueco disponible' },
  { tone: 'warn', time: '16:00', title: 'Ajuste +5 min', note: 'Ventana extendida' },
  { tone: 'manual', time: '16:10', title: 'Q1+Q5 compatible', note: 'Giro manual estimado' },
  { tone: 'new', time: '16:25', title: 'Nuevo giro', note: 'Pedido asignado' },
];

const timelineRows = [
  { time: '15:45', zone: 'Q1', status: 'en curso', note: 'Ruta actual', tone: 'current', chip: 'Actual' },
  { time: '15:55', zone: 'Q1', status: 'libre', note: 'Hueco disponible', tone: 'ok', chip: 'Libre' },
  { time: '16:10', zone: 'Q1+Q5', status: 'compatible', note: 'Giro manual estimado', tone: 'manual', chip: 'Preview' },
  { time: '16:25', zone: 'Q5', status: 'nuevo giro', note: 'Pedido asignado', tone: 'new', chip: 'Nuevo' },
  { time: '16:40', zone: 'Driver', status: 'vuelve libre', note: 'Fin de ruta Q1+Q5', tone: 'neutral', chip: 'Fin' },
];

const toneStyles = {
  ok: { accent: '#26C281', bg: 'rgba(38,194,129,0.12)', border: 'rgba(38,194,129,0.42)' },
  warn: { accent: '#F4C542', bg: 'rgba(244,197,66,0.13)', border: 'rgba(244,197,66,0.44)' },
  manual: { accent: '#7C8CFF', bg: 'rgba(124,140,255,0.15)', border: 'rgba(124,140,255,0.46)' },
  new: { accent: '#F97316', bg: 'rgba(249,115,22,0.13)', border: 'rgba(249,115,22,0.42)' },
  current: { accent: '#0097A7', bg: 'rgba(0,151,167,0.12)', border: 'rgba(0,151,167,0.38)' },
  neutral: { accent: '#C7B99E', bg: 'rgba(255,255,255,0.055)', border: 'rgba(255,255,255,0.16)' },
};

const labLog = (eventName, payload) => {
  console.debug('[PremiumPlannerPopup LAB]', eventName, payload);
};

const PremiumPlannerPopup = ({ onClose }) => {
  const [selectedPreview, setSelectedPreview] = useState('15:55 · Q1 libre');

  const selectPreview = (label, payload) => {
    setSelectedPreview(label);
    labLog('preview-only', payload);
  };

  return (
    <div className="ppp-overlay" onClick={onClose}>
      <style>{PREMIUM_PLANNER_POPUP_CSS}</style>
      <section className="ppp-shell" aria-label="Propuestas de entrega LAB" onClick={e => e.stopPropagation()}>
        <header className="ppp-header">
          <div>
            <p>LAB statico</p>
            <h2>Propuestas de entrega</h2>
          </div>
          <span className="ppp-sync">Preview local · no guarda</span>
          <button type="button" className="ppp-close" onClick={onClose} aria-label="Cerrar propuestas">X</button>
        </header>

        <div className="ppp-body">
          <section className="ppp-best">
            <div className="ppp-best-main">
              <span className="ppp-section-label">Mejor propuesta</span>
              <div className="ppp-best-grid">
                <div>
                  <small>Entrega</small>
                  <strong>15:55</strong>
                </div>
                <div>
                  <small>Salida horno</small>
                  <strong>15:48</strong>
                </div>
              </div>
              <div className="ppp-status-line">
                <span>Driver disponible</span>
                <b>Directa · recomendada</b>
              </div>
              <button
                type="button"
                className="ppp-apply"
                onClick={() => selectPreview('Aplicar propuesta · LAB no-op', { action: 'apply_proposal' })}
              >
                Aplicar propuesta
              </button>
            </div>

            <MiniZoneMap />
          </section>

          <section className="ppp-section">
            <div className="ppp-title-row">
              <h3>Otras opciones rapidas</h3>
              <span>{selectedPreview}</span>
            </div>
            <div className="ppp-options">
              {quickOptions.map(option => {
                const tone = toneStyles[option.tone];
                return (
                  <button
                    type="button"
                    key={`${option.time}-${option.title}`}
                    className="ppp-option"
                    style={{ '--tone': tone.accent, '--toneBg': tone.bg, '--toneBorder': tone.border }}
                    onClick={() => selectPreview(`${option.time} · ${option.title}`, option)}
                  >
                    <small>{option.time}</small>
                    <strong>{option.title}</strong>
                    <span>{option.note}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="ppp-section">
            <div className="ppp-title-row">
              <h3>Giros y huecos</h3>
              <span>Click = preview, no save</span>
            </div>
            <div className="ppp-timeline">
              {timelineRows.map(row => {
                const tone = toneStyles[row.tone];
                return (
                  <button
                    type="button"
                    key={`${row.time}-${row.zone}-${row.status}`}
                    className="ppp-row"
                    style={{ '--tone': tone.accent, '--toneBg': tone.bg, '--toneBorder': tone.border }}
                    onClick={() => selectPreview(`${row.time} · ${row.zone} · ${row.status}`, row)}
                  >
                    <span className="ppp-row-time">{row.time}</span>
                    <span className="ppp-row-badge">{row.zone}</span>
                    <span className="ppp-row-copy">
                      <strong>{row.status}</strong>
                      <small>{row.note}</small>
                    </span>
                    <span className="ppp-row-chip">{row.chip}</span>
                    <span className="ppp-row-plus">+</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="ppp-notes" aria-label="Notas del planner">
            <h3>Notas del planner</h3>
            <p>Agrupar Q1+Q5 anade ~13 min de ruta pero evita retorno.</p>
            <p>Proximo hueco natural: 16:10.</p>
            <p>Toca una linea para previsualizar, no se aplica automaticamente.</p>
          </section>
        </div>
      </section>
    </div>
  );
};

const MiniZoneMap = () => (
  <div className="ppp-map-card">
    <div className="ppp-map">
      <div className="ppp-sea">Mar</div>
      <div className="ppp-zone ppp-q4">Q4<br />Cortijos</div>
      <div className="ppp-zone ppp-q3">Q3<br />IES</div>
      <div className="ppp-zone ppp-q1">Q1<br />Centro<span className="ppp-shop">P</span></div>
      <div className="ppp-zone ppp-q2">Q2<br />Buenavista</div>
      <div className="ppp-zone ppp-q5">Q5<br />Las Marinas</div>
      <div className="ppp-route ppp-route-a" />
      <div className="ppp-route ppp-route-b" />
      <span className="ppp-route-dot ppp-dot-a" />
      <span className="ppp-route-dot ppp-dot-b" />
      <span className="ppp-route-label">Pizzeria - Q1 - Q5</span>
    </div>
    <div className="ppp-map-caption">
      <strong>Esquema operativo por zonas</strong>
      <span>Ruta estimada · no es ruta exacta</span>
    </div>
  </div>
);

const PREMIUM_PLANNER_POPUP_CSS = `
.ppp-overlay{ position:fixed; inset:0; z-index:12000; display:flex; align-items:center; justify-content:center; padding:22px; background:rgba(8,7,5,0.72); backdrop-filter:blur(10px); }
.ppp-shell{ width:min(1080px,100%); max-height:88vh; overflow:auto; border:1px solid rgba(216,191,144,0.26); border-radius:14px; background:#15130f; color:#fbf3e4; box-shadow:0 28px 90px rgba(0,0,0,0.72); font-family:'Satoshi',Inter,-apple-system,system-ui,sans-serif; }
.ppp-shell *{ box-sizing:border-box; }
.ppp-header{ position:sticky; top:0; z-index:2; display:grid; grid-template-columns:minmax(0,1fr) auto 38px; gap:12px; align-items:center; padding:18px 20px; border-bottom:1px solid rgba(216,191,144,0.18); background:rgba(21,19,15,0.96); }
.ppp-header p{ margin:0 0 3px; color:#f4c542; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; }
.ppp-header h2{ margin:0; color:#fff8ed; font-size:24px; line-height:1.05; font-weight:950; letter-spacing:0; }
.ppp-sync{ border:1px solid rgba(255,255,255,0.13); border-radius:999px; padding:7px 11px; color:#cfc2a9; background:rgba(255,255,255,0.04); font-size:12px; font-weight:850; white-space:nowrap; }
.ppp-close{ width:38px; height:38px; border:1px solid rgba(255,255,255,0.14); border-radius:9px; background:rgba(255,255,255,0.055); color:#fff8ed; font-size:15px; font-weight:900; cursor:pointer; }
.ppp-close:hover{ background:rgba(255,255,255,0.1); }
.ppp-body{ display:flex; flex-direction:column; gap:16px; padding:18px; }
.ppp-best{ display:grid; grid-template-columns:minmax(280px,0.82fr) minmax(340px,1.18fr); gap:16px; }
.ppp-best-main,.ppp-map-card,.ppp-section,.ppp-notes{ border:1px solid rgba(216,191,144,0.20); border-radius:10px; background:linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.014)); }
.ppp-best-main{ display:flex; flex-direction:column; gap:14px; padding:18px; }
.ppp-section-label{ width:fit-content; border:1px solid rgba(38,194,129,0.36); border-radius:999px; padding:5px 10px; color:#8ef0b3; background:rgba(38,194,129,0.11); font-size:12px; font-weight:900; }
.ppp-best-grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.ppp-best-grid div{ border:1px solid rgba(255,255,255,0.12); border-radius:9px; padding:12px; background:rgba(255,255,255,0.035); }
.ppp-best-grid small{ display:block; margin-bottom:4px; color:#c9b99c; font-size:12px; font-weight:850; text-transform:uppercase; }
.ppp-best-grid strong{ color:#fff9ed; font-size:34px; line-height:1; font-weight:950; font-family:'DM Mono',ui-monospace,monospace; }
.ppp-status-line{ display:flex; flex-wrap:wrap; gap:8px; }
.ppp-status-line span,.ppp-status-line b{ border-radius:999px; padding:7px 11px; font-size:13px; font-weight:900; }
.ppp-status-line span{ color:#91f0b6; background:rgba(38,194,129,0.12); border:1px solid rgba(38,194,129,0.35); }
.ppp-status-line b{ color:#fff1bf; background:rgba(244,197,66,0.10); border:1px solid rgba(244,197,66,0.35); }
.ppp-apply{ margin-top:auto; min-height:46px; border:1px solid rgba(244,197,66,0.48); border-radius:9px; color:#201609; background:linear-gradient(180deg,#ffe08a,#f0b83a); font-size:15px; font-weight:950; cursor:pointer; }
.ppp-map-card{ padding:14px; }
.ppp-map{ position:relative; height:255px; overflow:hidden; border:1px solid rgba(255,255,255,0.10); border-radius:9px; background:linear-gradient(135deg,#262015,#171510); }
.ppp-sea{ position:absolute; top:0; right:0; bottom:0; width:54px; display:flex; align-items:center; justify-content:center; color:#d7f3ff; background:linear-gradient(180deg,#0E7490,#0284C7); font-size:12px; font-weight:950; writing-mode:vertical-rl; text-transform:uppercase; letter-spacing:.12em; }
.ppp-zone{ position:absolute; display:flex; align-items:center; justify-content:center; flex-direction:column; border:2px solid rgba(255,255,255,0.40); border-radius:8px; color:#fff; font-size:12px; font-weight:950; line-height:1.15; text-align:center; box-shadow:0 12px 28px rgba(0,0,0,0.25); }
.ppp-q1{ left:62%; top:24%; width:25%; height:34%; background:${zoneColors.Q1}; }
.ppp-q2{ left:58%; top:60%; width:24%; height:25%; background:${zoneColors.Q2}; color:#24192b; }
.ppp-q3{ left:34%; top:26%; width:25%; height:30%; background:${zoneColors.Q3}; }
.ppp-q4{ left:8%; top:23%; width:28%; height:32%; background:${zoneColors.Q4}; }
.ppp-q5{ left:18%; top:62%; width:34%; height:26%; background:${zoneColors.Q5}; color:#13240d; }
.ppp-shop{ position:absolute; right:10px; top:10px; width:24px; height:24px; display:grid; place-items:center; border-radius:999px; color:#14100b; background:#fff4d6; border:2px solid rgba(0,0,0,0.18); font-size:13px; font-weight:950; }
.ppp-route{ position:absolute; height:4px; border-radius:999px; background:#fff3c4; box-shadow:0 0 0 2px rgba(0,0,0,0.15); transform-origin:left center; }
.ppp-route-a{ left:70%; top:42%; width:64px; transform:rotate(154deg); }
.ppp-route-b{ left:49%; top:62%; width:78px; transform:rotate(160deg); }
.ppp-route-dot{ position:absolute; width:11px; height:11px; border-radius:999px; background:#fff3c4; box-shadow:0 0 0 3px rgba(0,0,0,0.20); }
.ppp-dot-a{ left:70%; top:40%; }
.ppp-dot-b{ left:31%; top:72%; }
.ppp-route-label{ position:absolute; left:16px; bottom:12px; border-radius:999px; padding:7px 10px; color:#fff5d6; background:rgba(0,0,0,0.36); border:1px solid rgba(255,255,255,0.16); font-size:12px; font-weight:900; }
.ppp-map-caption{ display:flex; justify-content:space-between; gap:12px; margin-top:10px; color:#d9c8aa; font-size:12px; font-weight:850; }
.ppp-map-caption span{ color:#a99d8a; text-align:right; }
.ppp-section,.ppp-notes{ padding:16px; }
.ppp-title-row{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
.ppp-title-row h3,.ppp-notes h3{ margin:0; color:#fff5e3; font-size:16px; line-height:1.15; font-weight:950; }
.ppp-title-row span{ color:#c7b79a; font-size:12px; font-weight:850; }
.ppp-options{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
.ppp-option{ min-height:104px; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:5px; border:1px solid var(--toneBorder); border-radius:9px; padding:12px; color:#fff8eb; background:var(--toneBg); text-align:left; cursor:pointer; }
.ppp-option small{ color:var(--tone); font-size:12px; font-weight:950; font-family:'DM Mono',ui-monospace,monospace; }
.ppp-option strong{ font-size:14px; line-height:1.15; font-weight:950; }
.ppp-option span{ color:#d9cab0; font-size:12px; font-weight:800; }
.ppp-timeline{ display:flex; flex-direction:column; gap:8px; }
.ppp-row{ min-height:58px; display:grid; grid-template-columns:62px 74px minmax(0,1fr) auto 30px; gap:10px; align-items:center; width:100%; border:1px solid var(--toneBorder); border-radius:9px; padding:9px 10px; color:#fff8eb; background:var(--toneBg); text-align:left; cursor:pointer; }
.ppp-row-time{ color:#fff3d1; font-size:14px; font-weight:950; font-family:'DM Mono',ui-monospace,monospace; }
.ppp-row-badge,.ppp-row-chip{ border:1px solid var(--toneBorder); border-radius:999px; padding:6px 8px; color:var(--tone); background:rgba(0,0,0,0.14); font-size:12px; font-weight:950; text-align:center; white-space:nowrap; }
.ppp-row-copy{ min-width:0; display:flex; flex-direction:column; gap:2px; }
.ppp-row-copy strong{ font-size:14px; font-weight:950; }
.ppp-row-copy small{ color:#d0c0a4; font-size:12px; font-weight:800; }
.ppp-row-plus{ width:28px; height:28px; display:grid; place-items:center; border-radius:8px; color:#16120c; background:var(--tone); font-size:18px; font-weight:950; }
.ppp-notes{ color:#d9cab0; }
.ppp-notes p{ margin:8px 0 0; font-size:13px; font-weight:800; line-height:1.35; }
@media (max-width:900px){
  .ppp-overlay{ padding:10px; align-items:stretch; }
  .ppp-shell{ max-height:calc(100vh - 20px); }
  .ppp-header{ grid-template-columns:minmax(0,1fr) 38px; }
  .ppp-sync{ grid-column:1 / -1; width:fit-content; }
  .ppp-best{ grid-template-columns:1fr; }
  .ppp-options{ grid-template-columns:1fr 1fr; }
  .ppp-row{ grid-template-columns:56px 66px minmax(0,1fr) 28px; }
  .ppp-row-chip{ display:none; }
}
@media (max-width:560px){
  .ppp-body{ padding:12px; gap:12px; }
  .ppp-options{ grid-template-columns:1fr; }
  .ppp-best-grid{ grid-template-columns:1fr; }
  .ppp-map{ height:230px; }
  .ppp-map-caption{ flex-direction:column; gap:3px; }
  .ppp-map-caption span{ text-align:left; }
}
`;

export default PremiumPlannerPopup;
