// MULTI_ORDER_GIRO_RECALC — coherencia de la propuesta seleccionada (mapa).
//   Cuando el operador selecciona el chip "Usar giro Q2", el mapa NUNCA debe mostrar
//   el directo "Pizzería → Q1" como si fuese el giro. Dos casos:
//     A) el backend SÍ trae la route combinada del giro (Pizzería→Q1→Q2) → el mapa
//        la usa (el caption incluye la zona del ancla, Q2).
//     B) el chip es el fallback ligero (sin propuesta real de inserción ni fila de
//        giro de respaldo) → el mapa queda NEUTRO, sin caption de ruta directa Q1
//        (evita la incoherencia "chip Q2 / mapa Pizzería→Q1" vista en la foto).
//   CI=true npx react-scripts test --watchAll=false --testPathPattern=PremiumPlannerPopup.selectedRouteCoherence
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as TestUtils from 'react-dom/test-utils';
import PremiumPlannerPopup from './PremiumPlannerPopup';

const act = React.act || TestUtils.act;
global.IS_REACT_ACT_ENVIRONMENT = true;

const CONTRACT = 'premium-planner-strategic-preview-v1';

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const mount = (data, nextGiro) => act(() => {
  root.render(React.createElement(PremiumPlannerPopup, {
    data, onClose() {}, nextGiroOpportunity: nextGiro, initialFocusOpportunity: true,
  }));
});
const mapPathEl = () => container.querySelector('.ppp-map-path');
const cardText = () => container.querySelector('.ppp-best-card')?.textContent || '';

// ── Caso A: route combinada real del giro (Pizzería → Q1 → Q2). ──
const RT_COMBINED = {
  version: 'route-timeline-v2', proposalId: 'cand-agregar-q1-q2-#007',
  summary: { directEta: null, giroEta: '23:24', returnEta: '23:31', tradeoffLabel: '' },
  risk: 'ajuste', operatorMessage: '',
  timeline: [
    { seq: 0, type: 'departure', zone: null, label: 'Pizzería', eta: '23:10' },
    { seq: 1, type: 'delivery', zone: 'Q1', label: 'Pedido actual', eta: '23:17', isNewOrder: true },
    { seq: 2, type: 'delivery', zone: 'Q2', label: 'Pedido Q2', eta: '23:24', isAnchor: true },
    { seq: 3, type: 'return', zone: null, label: 'Regreso pizzería', eta: '23:31' },
  ],
};
const DATA_REAL = {
  contract: CONTRACT, mode: 'read_only',
  firstAvailable: { zone: 'Q1', eta: '21:50', status: 'compatible' },
  bestProposal: { id: 'cand-crear-q1', kind: 'crear', status: 'compatible', severity: 'ok', routeZones: ['Q1'], mapPath: ['Pizzería', 'Q1'], title: 'Q1', blocked: false,
    routeTimeline: { version: 'route-timeline-v2', timeline: [{ seq: 0, type: 'departure', zone: null, eta: '21:43' }, { seq: 1, type: 'delivery', zone: 'Q1', eta: '21:50', isNewOrder: true }, { seq: 2, type: 'return', zone: null, eta: '21:57' }], summary: {}, risk: 'ok' } },
  opportunities: [
    { id: 'cand-agregar-q1-q2-#007', kind: 'agregar', giroId: '#007', status: 'compatible', severity: 'ok', blocked: false, routeZones: ['Q1', 'Q2'], mapPath: ['Pizzería', 'Q1', 'Q2'], channel: 'sur', routeTimeline: RT_COMBINED },
  ],
  // La inserción Q1→Q2 sale clasificada como not_recommended (caso real foto: gap de
  // horarios entre pedidos), por eso NO es un chip primario: la chip "Usar giro Q2"
  // (sintética, del hint) se engancha a ESTA propuesta real por su ancla #007 y hereda
  // su routeTimeline combinada. El frontend debe mostrar esa ruta, no el directo Q1.
  proposals: [
    { id: 'cand-crear-q1', kind: 'direct', label: 'Crear giro Q1', timeLabel: '21:50', zoneLabel: 'Q1 (sur)', status: 'compatible', rank: 1, recommended: true },
    { id: 'cand-agregar-q1-q2-#007', kind: 'not_recommended', label: 'Encajar Q2', timeLabel: '23:24', zoneLabel: 'Q1 → Q2 (sur)', status: 'no_recomendado', rank: 2, recommended: false, routeTimeline: RT_COMBINED },
  ],
  serviceLine: [{ id: '#007', zone: 'Q2', salida: '23:10', entrega: '23:24', regreso: '23:31', pizzas: 1 }],
  warnings: [], blockers: [], safety: { readOnly: true, writes: false },
};

test('A — chip "Usar giro Q2" con route real: el mapa muestra el giro (caption incluye Q2)', () => {
  mount(DATA_REAL, { kind: 'future_giro', zone: 'Q2', hora: '23:24', anchorOrderId: '#007', status: 'info' });
  // card refleja la oportunidad seleccionada (giro compatible Q2).
  expect(cardText()).toMatch(/Giro compatible Q2/);
  // el mapa NO se queda en el directo Pizzería→Q1: el caption incluye el ancla Q2.
  const foot = mapPathEl();
  expect(foot).toBeTruthy();
  expect(foot.textContent).toMatch(/Q2/);
});

// ── Caso B: chip ligero sin route real ni fila de giro de respaldo (caso foto). ──
const DATA_LITE = {
  contract: CONTRACT, mode: 'read_only',
  firstAvailable: { zone: 'Q1', eta: '21:50', status: 'compatible' },
  bestProposal: { id: 'cand-crear-q1', kind: 'crear', status: 'compatible', severity: 'ok', routeZones: ['Q1'], mapPath: ['Pizzería', 'Q1'], title: 'Q1', blocked: false },
  opportunities: [],
  proposals: [
    { id: 'cand-crear-q1', kind: 'direct', label: 'Crear giro Q1', timeLabel: '21:50', zoneLabel: 'Q1 (sur)', status: 'compatible', rank: 1, recommended: true },
  ],
  // ningún giro Q2 en serviceLine: el ancla '#099' del hint no tiene respaldo.
  serviceLine: [{ id: '#005', zone: 'Q5', salida: '20:00', entrega: '20:14', regreso: '20:28', pizzas: 1 }],
  warnings: [], blockers: [], safety: { readOnly: true, writes: false },
};

test('B — hint "Usar giro Q2" SIN respaldo real (#099): el chip NO aparece (regla align)', () => {
  mount(DATA_LITE, { kind: 'future_giro', zone: 'Q2', hora: '23:24', anchorOrderId: '#099', status: 'info' });
  // ningún proposal/opportunity real para #099 → no se promueve chip confirmable.
  const titles = [...container.querySelectorAll('.ppp-prop-title')].map((e) => e.textContent);
  expect(titles.some((t) => /Usar giro/.test(t || ''))).toBe(false);
  // la card NO ofrece un "Giro compatible Q2" sin respaldo; queda en la propuesta real.
  expect(cardText()).not.toMatch(/Giro compatible Q2/);
});
