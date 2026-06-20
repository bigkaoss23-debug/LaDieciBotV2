// PLANNER_COCINA_FREEZE_15_MIN — chip stato cucina nella card del popup planner.
//   El backend expone en serviceLine/opportunity: cocinaFrozen, cocinaState,
//   minutesToSalida (+ warning cocina_frozen_under_15). La card muestra un chip
//   compacto: "Cocina congelada · salida no cambia" (ámbar, protección, no error)
//   o "Cocina estable" (verde). minutos en forma humana ("12 min"), nunca field
//   raw. Campos ausentes → sin chip, sin crash, sin estado inventado.
//   CI=true npx react-scripts test --watchAll=false --testPathPattern=PremiumPlannerPopup.cocinaChip
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as TestUtils from 'react-dom/test-utils';
import PremiumPlannerPopup from './PremiumPlannerPopup';

const act = React.act || TestUtils.act;
global.IS_REACT_ACT_ENVIRONMENT = true;

const CONTRACT = 'premium-planner-strategic-preview-v1';

// Giro Q5 compatible: el nuevo Q2 encaja en el giro existente (salida 18:47).
const RT = {
  version: 'route-timeline-v2', proposalId: 'cand-agregar-q2-q5-#005',
  summary: { directEta: null, giroEta: '19:06', returnEta: '19:23', tradeoffLabel: '' },
  risk: 'ajuste', operatorMessage: '',
  timeline: [
    { seq: 0, type: 'departure', zone: null, label: 'Pizzería', eta: '18:47' },
    { seq: 1, type: 'delivery', zone: 'Q2', label: 'Pedido actual', eta: '18:54', isNewOrder: true },
    { seq: 2, type: 'delivery', zone: 'Q5', label: 'Pedido Q5', eta: '19:06', isAnchor: true },
    { seq: 3, type: 'return', zone: null, label: 'Regreso pizzería', eta: '19:23' },
  ],
};

// `cocina` = campos additivos backend sobre la fila serviceLine del giro #005.
const dataWith = (cocina) => ({
  contract: CONTRACT, mode: 'read_only',
  firstAvailable: { zone: 'Q2', eta: '18:54', status: 'compatible' },
  bestProposal: { id: 'cand-crear-q2', kind: 'crear', status: 'compatible', severity: 'ok', routeZones: ['Q2'], mapPath: ['Pizzería', 'Q2'], title: 'Q2', blocked: false },
  opportunities: [
    { id: 'cand-agregar-q2-q5-#005', kind: 'agregar', giroId: '#005', status: 'compatible', blocked: false, routeZones: ['Q2', 'Q5'], mapPath: ['Pizzería', 'Q2', 'Q5'], routeTimeline: RT, ...cocina },
  ],
  proposals: [
    { id: 'cand-crear-q2', kind: 'direct', label: 'Crear giro Q2', timeLabel: '18:30', zoneLabel: 'Q2 (sur)', status: 'compatible', rank: 2, recommended: false },
    { id: 'cand-agregar-q2-q5-#005', kind: 'insertion', label: 'Encajar Q5', timeLabel: '18:54', zoneLabel: 'Q2 → Q5 (sur)', status: 'compatible', rank: 1, recommended: true, routeTimeline: RT },
  ],
  serviceLine: [{ id: '#005', zone: 'Q5', salida: '18:47', entrega: '19:00', regreso: '19:13', pizzas: 1, ...cocina }],
  warnings: [], blockers: [], safety: { readOnly: true, writes: false },
});
const NEXT_GIRO = { kind: 'future_giro', zone: 'Q5', hora: '19:00', anchorOrderId: '#005', label: 'Próximo giro Q5 19:00', cta: 'Ver propuestas', status: 'info', source: 'operational_anchor' };

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const mount = (cocina) => act(() => {
  root.render(React.createElement(PremiumPlannerPopup, {
    data: dataWith(cocina), onClose() {},
    nextGiroOpportunity: { ...NEXT_GIRO }, initialFocusOpportunity: true,
  }));
});
const chip = () => container.querySelector('.ppp-best-card .ppp-cocina-chip');
const cardText = () => container.querySelector('.ppp-best-card')?.textContent || '';

const FROZEN = { cocinaFrozen: true, cocinaState: 'congelada', minutesToSalida: 12 };
const STABLE = { cocinaFrozen: false, cocinaState: 'estable', minutesToSalida: 27 };

// 1: cocinaFrozen=true → chip ámbar "Cocina congelada · salida no cambia".
test('frozen: chip "Cocina congelada · salida no cambia" en ámbar', () => {
  mount(FROZEN);
  const c = chip();
  expect(c).toBeTruthy();
  expect(c.className).toMatch(/is-frozen/);
  expect(c.textContent).toMatch(/Cocina congelada/);
  expect(c.textContent).toMatch(/salida no cambia/);
});

// 2: minutesToSalida=12 → forma humana "12 min", nunca el field raw.
test('frozen: minutos en forma humana "12 min", sin field raw ni JSON', () => {
  mount(FROZEN);
  const c = chip();
  expect(c.textContent).toMatch(/12 min/);
  expect(c.textContent).not.toMatch(/minutesToSalida/);
  expect(c.textContent).not.toMatch(/cocina_frozen_under_15/);
  expect(c.textContent).not.toMatch(/cocinaFrozen/);
});

// 3: cocinaFrozen=false / estable → chip verde "Cocina estable" + "27 min".
test('stable: chip verde "Cocina estable" con "27 min"', () => {
  mount(STABLE);
  const c = chip();
  expect(c).toBeTruthy();
  expect(c.className).toMatch(/is-stable/);
  expect(c.textContent).toMatch(/Cocina estable/);
  expect(c.textContent).toMatch(/27 min/);
  expect(c.textContent).not.toMatch(/congelada/);
});

// 4: campos cucina ausentes → sin chip, sin crash, sin estado inventado.
test('sin campos cocina: no se renderiza chip ni se inventa estado', () => {
  mount(undefined);
  expect(chip()).toBeNull();
  expect(cardText()).not.toMatch(/Cocina (congelada|estable)/);
});

// 5: el chip cocina NO reintroduce labels de debug en la card.
test('no reintroduce debug labels (nuevo/prometido/No recomendado/se mueve/oportunidad)', () => {
  mount(FROZEN);
  const t = cardText();
  expect(t).not.toMatch(/\bnuevo\b/i);
  expect(t).not.toMatch(/prometido/i);
  expect(t).not.toMatch(/No recomendado/i);
  expect(t).not.toMatch(/se mueve/i);
  expect(t).not.toMatch(/oportunidad/i);
});

// 6: el chip vive DENTRO de la card, encima de "Giros y huecos" (props presentes).
test('chip dentro de la card; los chips de propuesta siguen presentes', () => {
  mount(FROZEN);
  expect(container.querySelector('.ppp-best-card .ppp-cocina-chip')).toBeTruthy();
  expect(container.querySelector('.ppp-props')).toBeTruthy();
});

// 7: una sola timeline (el chip no duplica la línea del giro).
test('no duplica timeline: una sola .ppp-timeline-card', () => {
  mount(FROZEN);
  expect(container.querySelectorAll('.ppp-timeline-card').length).toBeLessThanOrEqual(1);
});
