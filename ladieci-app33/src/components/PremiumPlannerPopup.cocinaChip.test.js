// PLANNER_COCINA_FREEZE_15_MIN — el chip de estado cocina fue RETIRADO de la UI del
//   operador. El backend sigue enviando cocinaFrozen/cocinaState/minutesToSalida +
//   warning cocina_frozen_under_15 (contract intacto), pero la card NO debe pintar
//   ni "Cocina estable" ni "Cocina congelada · salida no cambia" ni los minutos, y
//   el warning de cocina NO debe aparecer en "Notas del planner". El resto del popup
//   (chips de propuesta, una sola timeline) queda intacto.
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
// El backend los SIGUE enviando; la UI ya no los pinta.
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
  // el backend agrega el warning cocina_frozen_under_15 cuando un giro está congelado.
  warnings: cocina && cocina.cocinaFrozen
    ? [{ code: 'cocina_frozen_under_15', message: 'Cocina congelada en un giro (<15 min a salida): la salida no se modifica' }]
    : [],
  blockers: [], safety: { readOnly: true, writes: false },
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
const popupText = () => container.textContent || '';

const FROZEN = { cocinaFrozen: true, cocinaState: 'congelada', minutesToSalida: 12 };
const STABLE = { cocinaFrozen: false, cocinaState: 'estable', minutesToSalida: 27 };

// 1: cocina congelada → NO se renderiza el chip ni texto "Cocina congelada".
test('frozen: no se renderiza el chip cocina (.ppp-cocina-chip ausente)', () => {
  mount(FROZEN);
  expect(container.querySelector('.ppp-cocina-chip')).toBeNull();
  expect(popupText()).not.toMatch(/Cocina congelada/);
  expect(popupText()).not.toMatch(/salida no cambia/);
});

// 2: cocina estable → NO aparece "Cocina estable" ni los minutos del chip.
test('stable: no aparece "Cocina estable" ni "27 min" del chip', () => {
  mount(STABLE);
  expect(container.querySelector('.ppp-cocina-chip')).toBeNull();
  expect(popupText()).not.toMatch(/Cocina estable/);
});

// 3: el warning de cocina NO entra en "Notas del planner".
test('warning cocina_frozen_under_15 no aparece en notas del planner', () => {
  mount(FROZEN);
  const notes = container.querySelector('.ppp-notes');
  const notesText = notes ? notes.textContent : '';
  expect(notesText).not.toMatch(/Cocina congelada/);
  expect(notesText).not.toMatch(/la salida no se modifica/);
});

// 4: campos cucina ausentes → sigue sin chip, sin crash.
test('sin campos cocina: no se renderiza chip ni se inventa estado', () => {
  mount(undefined);
  expect(container.querySelector('.ppp-cocina-chip')).toBeNull();
  expect(popupText()).not.toMatch(/Cocina (congelada|estable)/);
});

// 5: el resto del popup sigue intacto — chips de propuesta presentes, una sola timeline.
test('resto intacto: chips de propuesta presentes y una sola .ppp-timeline-card', () => {
  mount(FROZEN);
  expect(container.querySelector('.ppp-props')).toBeTruthy();
  expect(container.querySelectorAll('.ppp-timeline-card').length).toBeLessThanOrEqual(1);
});

// 6: no reintroduce labels de debug en la card.
test('no reintroduce debug labels (nuevo/prometido/No recomendado/se mueve/oportunidad)', () => {
  mount(FROZEN);
  const t = container.querySelector('.ppp-best-card')?.textContent || '';
  expect(t).not.toMatch(/\bnuevo\b/i);
  expect(t).not.toMatch(/prometido/i);
  expect(t).not.toMatch(/No recomendado/i);
  expect(t).not.toMatch(/se mueve/i);
  expect(t).not.toMatch(/oportunidad/i);
});
