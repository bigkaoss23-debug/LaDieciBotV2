// MULTI_ORDER_PER_STOP_DELAY_CHIPS — chips de retraso por parada (semáforo).
//   Dentro de un giro con varias paradas, cada ancla que se mueve muestra un chip
//   semáforo legible a partir del slip YA calculado por el backend (slipLabel "+N"):
//     0–5 verde · 6–10 amarillo · >10 rojo ("revisar"). Rojo NO bloquea.
//   El nuevo pedido muestra su hora propuesta ("Cliente HH:MM"), sin chip de retraso.
//   Copy humano "+N min" / "revisar +N min"; NUNCA debug (prometido/margin/se mueve/
//   No recomendado/delayBand/slipLabel). En fila compacta y en detalle expandido.
//   CI=true npx react-scripts test --watchAll=false --testPathPattern=PremiumPlannerPopup.perStopDelayChips
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as TestUtils from 'react-dom/test-utils';
import PremiumPlannerPopup from './PremiumPlannerPopup';

const act = React.act || TestUtils.act;
global.IS_REACT_ACT_ENVIRONMENT = true;

const CONTRACT = 'premium-planner-strategic-preview-v1';

// Giro multi-parada: nuevo Q1 (sin retraso) + 3 anclas con retrasos en cada banda.
const RT_MULTI = {
  version: 'route-timeline-v2', proposalId: 'cand-agregar-multi-#007',
  summary: { directEta: null, giroEta: '22:20', returnEta: '22:28', tradeoffLabel: '' },
  risk: 'warning', operatorMessage: 'Q2 se mueve +4 min · Q5 se mueve +9 min',
  timeline: [
    { seq: 0, type: 'departure', zone: null, label: 'Pizzería', eta: '21:45' },
    { seq: 1, type: 'delivery', zone: 'Q1', label: 'Pedido actual', eta: '21:50', promised: '21:50', status: 'ok', isNewOrder: true },
    { seq: 2, type: 'delivery', zone: 'Q2', label: 'Pedido Q2', eta: '22:04', promised: '22:00', slipLabel: '+4', status: 'ajuste', isAnchor: true, warning: 'Q2 se mueve +4 min', marginLabel: '-4 vs prometido' },
    { seq: 3, type: 'delivery', zone: 'Q5', label: 'Pedido Q5', eta: '22:11', promised: '22:02', slipLabel: '+9', status: 'ajuste', isAnchor: true, warning: 'Q5 se mueve +9 min', marginLabel: '-9 vs prometido' },
    { seq: 4, type: 'delivery', zone: 'Q3', label: 'Pedido Q3', eta: '22:20', promised: '22:08', slipLabel: '+12', status: 'ajuste', isAnchor: true, warning: 'Q3 se mueve +12 min', marginLabel: '-12 vs prometido' },
    { seq: 5, type: 'return', zone: null, label: 'Regreso pizzería', eta: '22:28' },
  ],
};

const data = () => ({
  contract: CONTRACT, mode: 'read_only',
  firstAvailable: { zone: 'Q1', eta: '21:50', status: 'compatible' },
  bestProposal: { id: 'cand-crear-q1', kind: 'crear', status: 'compatible', severity: 'ok', routeZones: ['Q1'], mapPath: ['Pizzería', 'Q1'], title: 'Q1', blocked: false },
  opportunities: [
    { id: 'cand-agregar-multi-#007', kind: 'agregar', giroId: '#007', status: 'no_recomendado', blocked: false, routeZones: ['Q1', 'Q2', 'Q5', 'Q3'], mapPath: ['Pizzería', 'Q1', 'Q2', 'Q5', 'Q3'], routeTimeline: RT_MULTI },
  ],
  proposals: [
    { id: 'cand-crear-q1', kind: 'direct', label: 'Crear giro Q1', timeLabel: '21:50', zoneLabel: 'Q1 (sur)', status: 'compatible', rank: 1, recommended: true },
    { id: 'cand-agregar-multi-#007', kind: 'not_recommended', label: '', timeLabel: '21:50', zoneLabel: 'Q1 → Q2 → Q5 → Q3 (sur)', status: 'no_recomendado', rank: 2, routeTimeline: RT_MULTI, recommended: false },
  ],
  serviceLine: [{ id: '#007', zone: 'Q2', salida: '21:45', entrega: '22:04', regreso: '22:28', pizzas: 3 }],
  warnings: [], blockers: [], safety: { readOnly: true, writes: false },
});
const NEXT_GIRO = { kind: 'future_giro', zone: 'Q2', hora: '22:04', anchorOrderId: '#007', label: 'Próximo giro Q2 22:04', status: 'info', source: 'operational_anchor' };

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const mount = (d = data(), extra = {}) => act(() => {
  root.render(React.createElement(PremiumPlannerPopup, { data: d, onClose() {}, nextGiroOpportunity: NEXT_GIRO, initialFocusOpportunity: true, ...extra }));
});
const compactRow = () => container.querySelector('.ppp-timeline-card .ppp-sl-head');
const detail = () => container.querySelector('.ppp-timeline-card .ppp-sl-detail');
// texto VISIBLE renderizado (card + chips + Giros y huecos), excluyendo el <style>
// inline (cuyas props CSS `margin:` no son debug del operador).
const renderedText = () => ['.ppp-best-card', '.ppp-props', '.ppp-timeline-card']
  .map((s) => container.querySelector(s)?.textContent || '').join(' ');

// 1: fila compacta — chips semáforo por banda + nuevo pedido sin retraso.
test('fila compacta: +4 verde, +9 amarillo, +12 rojo (revisar); cliente nuevo sin chip', () => {
  mount();
  const row = compactRow();
  expect(row).toBeTruthy();
  const chips = [...row.querySelectorAll('.ppp-sl-slip')];
  const byBand = (b) => chips.find((c) => c.className.includes(`band-${b}`));
  expect(byBand('verde')?.textContent).toBe('+4 min');
  expect(byBand('amarillo')?.textContent).toBe('+9 min');
  expect(byBand('rojo')?.textContent).toBe('revisar +12 min');
  // el nuevo pedido Q1 aparece como "Cliente 21:50" sin chip de retraso
  expect(row.textContent).toMatch(/Cliente/);
  expect(row.textContent).toMatch(/21:50/);
});

// 2: detalle expandido — mismos chips semáforo por parada.
test('detalle expandido: chip .ppp-rt-delay por ancla, banda correcta, copy humano', () => {
  mount();
  const d = detail();
  expect(d).toBeTruthy();
  const chips = [...d.querySelectorAll('.ppp-rt-delay')];
  expect(chips.length).toBe(3); // Q2, Q5, Q3 (el nuevo Q1 no lleva chip)
  expect(chips.some((c) => c.className.includes('band-verde') && c.textContent === '+4 min')).toBe(true);
  expect(chips.some((c) => c.className.includes('band-amarillo') && c.textContent === '+9 min')).toBe(true);
  expect(chips.some((c) => c.className.includes('band-rojo') && c.textContent === 'revisar +12 min')).toBe(true);
});

// 3: sin slip → sin chip, sin crash; delay 0 → sin chip.
test('sin retraso / retraso 0: no se renderiza ningún chip de retraso', () => {
  const d = data();
  d.opportunities[0].routeTimeline = {
    version: 'route-timeline-v2', proposalId: 'x', summary: {}, risk: 'ok', operatorMessage: '',
    timeline: [
      { seq: 0, type: 'departure', zone: null, eta: '21:45', label: 'Pizzería' },
      { seq: 1, type: 'delivery', zone: 'Q1', eta: '21:50', isNewOrder: true, label: 'Pedido actual' },
      { seq: 2, type: 'delivery', zone: 'Q2', eta: '21:58', slipLabel: '+0', status: 'ok', isAnchor: true, label: 'Pedido Q2' },
      { seq: 3, type: 'return', zone: null, eta: '22:05', label: 'Regreso' },
    ],
  };
  d.proposals[1].routeTimeline = d.opportunities[0].routeTimeline;
  mount(d);
  expect(container.querySelectorAll('.ppp-sl-slip').length).toBe(0);
  expect(container.querySelectorAll('.ppp-rt-delay').length).toBe(0);
});

// 4: nunca debug labels.
test('no muestra debug (prometido / margin / se mueve / No recomendado / delayBand / slipLabel)', () => {
  mount();
  const t = renderedText();
  expect(t).not.toMatch(/prometido/i);
  expect(t).not.toMatch(/margin/i);
  expect(t).not.toMatch(/se mueve/i);
  expect(t).not.toMatch(/No recomendado/i);
  expect(t).not.toMatch(/delayBand/i);
  expect(t).not.toMatch(/slipLabel/i);
  expect(t).not.toMatch(/vs prometido/i);
});

// 5: chips de propuesta siguen ANTES de Giros y huecos; una sola timeline.
test('chips de propuesta antes de Giros y huecos; una sola .ppp-timeline-card', () => {
  mount();
  const props = container.querySelector('.ppp-props');
  const gyh = container.querySelector('.ppp-timeline-card');
  expect(props).toBeTruthy();
  expect(gyh).toBeTruthy();
  expect(props.compareDocumentPosition(gyh) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.querySelectorAll('.ppp-timeline-card').length).toBe(1);
});
