// GIRO_INTENT (Opzione A / DELIVERY-MANUAL-GIRO-01): el botón "Confirmar giro
// compatible" debe pasar a onApplyHora, además de la hora, el intent mínimo del
// giro { giroId, anchorOrderId, salidaRef, entregaRef } de la proposal real. El
// flujo legacy (directo/best, sin giro) pasa intent null/undefined.
//   CI=true npx react-scripts test --watchAll=false --testPathPattern=PremiumPlannerPopup.giroIntent
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as TestUtils from 'react-dom/test-utils';
import PremiumPlannerPopup from './PremiumPlannerPopup';

const act = React.act || TestUtils.act;
global.IS_REACT_ACT_ENVIRONMENT = true;

const CONTRACT = 'premium-planner-strategic-preview-v1';
const NEXT_GIRO = { kind: 'future_giro', zone: 'Q5', hora: '23:50', anchorOrderId: '#001', label: 'Próximo giro Q5', cta: 'Ver propuestas', status: 'info', source: 'operational_anchor' };
const RT_INSERTION = {
  version: 'route-timeline-v2', proposalId: 'cand-agregar-q2-q5-#001',
  summary: { directEta: null, giroEta: '22:04', returnEta: '22:21', tradeoffLabel: '' },
  risk: 'warning', operatorMessage: '',
  timeline: [
    { seq: 0, type: 'departure', zone: null, label: 'Pizzería', eta: '21:45' },
    { seq: 1, type: 'delivery', zone: 'Q2', label: 'Pedido actual', eta: '21:52', promised: '21:45', slipLabel: '+7', status: 'ajuste', isNewOrder: true },
    { seq: 2, type: 'delivery', zone: 'Q5', label: 'Pedido Q5', eta: '22:04', promised: '23:50', status: 'ok', isAnchor: true },
    { seq: 3, type: 'return', zone: null, label: 'Regreso pizzería', eta: '22:21' },
  ],
};
const dataReal = () => ({
  contract: CONTRACT, mode: 'read_only',
  firstAvailable: { zone: 'Q2', eta: '21:45', status: 'compatible' },
  bestProposal: { id: 'cand-crear-q2', kind: 'crear', status: 'compatible', severity: 'ok', routeZones: ['Q2'], mapPath: ['Pizzería', 'Q2'], routeEtas: [{ zone: 'Q2', eta: '21:45', isNew: true }], title: 'Q2', blocked: false },
  opportunities: [
    { id: 'cand-agregar-q2-q5-#001', kind: 'agregar', giroId: '#001', status: 'no_recomendado', blocked: false, routeZones: ['Q2', 'Q5'], mapPath: ['Pizzería', 'Q2', 'Q5'], warning: '', routeTimeline: RT_INSERTION },
  ],
  proposals: [
    { id: 'cand-crear-q2', kind: 'direct', label: 'Crear giro Q2', timeLabel: '21:45', zoneLabel: 'Q2 (sur)', status: 'compatible', rank: 1, recommended: true },
    { id: 'cand-agregar-q2-q5-#001', kind: 'not_recommended', label: '', timeLabel: '21:52', zoneLabel: 'Q2 → Q5 (sur)', status: 'no_recomendado', rank: 2, routeTimeline: RT_INSERTION, recommended: false },
  ],
  serviceLine: [{ id: '#001', zone: 'Q5', salida: '23:37', entrega: '23:50', regreso: '00:03', pizzas: 1 }],
  warnings: [], blockers: [], safety: { readOnly: true, writes: false },
});

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const propBtns = () => [...container.querySelectorAll('.ppp-prop')];
const applyBtn = () => container.querySelector('.ppp-apply');

test('giro compatible: Confirmar → onApplyHora(hora, intent) con giroId/anchorOrderId reales', () => {
  const calls = [];
  act(() => { root.render(React.createElement(PremiumPlannerPopup, {
    data: dataReal(), nextGiroOpportunity: NEXT_GIRO, initialFocusOpportunity: true,
    onClose() {}, onApplyHora: (t, intent) => calls.push({ t, intent }),
  })); });
  expect(applyBtn().textContent).toBe('Confirmar giro compatible');
  click(applyBtn());
  expect(calls.length).toBe(1);
  expect(calls[0].t).toBe('21:52');
  expect(calls[0].intent).toEqual({ giroId: '#001', anchorOrderId: '#001', salidaRef: null, entregaRef: '21:52' });
});

test('legacy directo: Aplicar → onApplyHora sin intent (segundo arg null/undefined)', () => {
  const calls = [];
  act(() => { root.render(React.createElement(PremiumPlannerPopup, {
    data: dataReal(), // sin nextGiroOpportunity → no hay chip giro; card = best/direct
    onClose() {}, onApplyHora: (t, intent) => calls.push({ t, intent }),
  })); });
  // selecciono el directo (best) y aplico
  click(propBtns()[0]);
  expect(applyBtn().textContent).not.toBe('Confirmar giro compatible');
  click(applyBtn());
  expect(calls.length).toBe(1);
  expect(calls[0].intent == null).toBe(true);
});
