// CABLING (interaction) — valida il cablaggio UX di PremiumPlannerPopup:
//   - clic box proposta → selezione + apertura riga giro collegata
//   - clic riga "Giros y huecos" → sincronizza la selezione
//   - "Aplicar propuesta" applica la proposta SELEZIONATA (non sempre la best)
//   - fallback sicuro alla best quando la selezione non è applicabile
//   - not_recommended fuori dai bottoni primari
// Render reale in jsdom (react-dom/client + act), nessun backend/DB/browser.
//   CI=true npx react-scripts test --watchAll=false --testPathPattern=PremiumPlannerPopup.cabling
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as TestUtils from 'react-dom/test-utils';
import PremiumPlannerPopup from './PremiumPlannerPopup';

// React 18.3 espone React.act; fallback al deprecato test-utils per sicurezza.
const act = React.act || TestUtils.act;

global.IS_REACT_ACT_ENVIRONMENT = true;

const CONTRACT = 'premium-planner-strategic-preview-v1';

const oppFix = (over = {}) => ({
  id: 'o', kind: 'agregar', status: 'compatible', severity: 'ok',
  routeEtas: [{ zone: 'Q5', eta: '16:10', isNew: true }],
  routeZones: ['Q1', 'Q5'], mapPath: ['Q1', 'Q5'], channel: 'sur',
  title: 'Q1+Q5', blocked: false, ...over,
});
const propFix = (over = {}) => ({
  id: 'o', kind: 'insertion', label: 'Q1+Q5 compatible', timeLabel: '16:10',
  zoneLabel: 'Q1 → Q5 (sur)', status: 'compatible', rank: 2, ...over,
});
const contract = (over = {}) => ({
  contract: CONTRACT, mode: 'read_only',
  firstAvailable: { zone: 'Q1', eta: '15:55', status: 'compatible' },
  bestProposal: oppFix({ id: 'best', kind: 'crear', routeZones: ['Q1'], mapPath: ['Q1'], routeEtas: [{ zone: 'Q1', eta: '15:55', isNew: true }] }),
  opportunities: [], proposals: [], serviceLine: [],
  warnings: [], blockers: [], safety: { readOnly: true, writes: false },
  ...over,
});

// Scenario base: 3 proposte; 'ins' è collegata (giroId) alla riga serviceLine 'a2'.
const baseData = (over = {}) => contract({
  opportunities: [
    oppFix({ id: 'ins', giroId: 'a2' }),
    oppFix({ id: 'alt', title: 'Q2', routeZones: ['Q2'], mapPath: ['Q1', 'Q2'], status: 'ajuste', severity: 'warning' }),
  ],
  proposals: [
    propFix({ id: 'best', kind: 'direct', label: 'Directa', timeLabel: '15:55', status: 'compatible', rank: 1 }),
    propFix({ id: 'ins', kind: 'insertion', label: 'Q1+Q5 compatible', timeLabel: '16:10', status: 'compatible', rank: 2, giroId: 'a2' }),
    propFix({ id: 'alt', kind: 'alternative', label: 'Q2 alternativa', timeLabel: '16:20', status: 'ajuste', rank: 3 }),
  ],
  serviceLine: [
    { id: 'a1', zone: 'Q1', salida: '15:33', entrega: '15:45', regreso: '15:57', pizzas: 2 },
    { id: 'a2', zone: 'Q5', salida: '15:58', entrega: '16:10', regreso: '16:22', pizzas: 1 },
  ],
  ...over,
});

let container, root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const mount = (data, extra = {}) =>
  act(() => { root.render(React.createElement(PremiumPlannerPopup, { data, onClose() {}, ...extra })); });
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

const propBtns = () => [...container.querySelectorAll('.ppp-prop')];
const activeTitle = () => container.querySelector('.ppp-prop.is-active .ppp-prop-title')?.textContent || null;
const rowHeads = () => [...container.querySelectorAll('.ppp-sl-head')];
const applyBtn = () => container.querySelector('.ppp-apply');

test('Cablaggio 1 — clic box proposta cambia la selezione attiva', () => {
  mount(baseData());
  expect(activeTitle()).toBe('Directa'); // default = prima primaria
  click(propBtns()[1]); // "Q1+Q5 compatible"
  expect(activeTitle()).toBe('Q1+Q5 compatible');
});

test('Cablaggio 2 — clic box proposta apre la riga giro collegata (giroId)', () => {
  mount(baseData());
  // di default nessuna riga aperta
  expect(container.querySelector('.ppp-sl-row.is-open')).toBeNull();
  click(propBtns()[1]); // 'ins' → giroId a2
  const openRow = container.querySelector('.ppp-sl-row.is-open');
  expect(openRow).not.toBeNull();
  expect(openRow.id).toBe('ppp-sl-a2');
  // la linea verticale del giro è ora montata
  expect(container.querySelector('.ppp-sl-row.is-open .ppp-rt')).not.toBeNull();
});

test('Cablaggio 3 — clic riga giro sincronizza la selezione della proposta', () => {
  mount(baseData());
  // riga 'a2' (indice 1) è collegata alla proposta 'ins'
  click(rowHeads()[1]);
  expect(container.querySelector('#ppp-sl-a2.is-open')).not.toBeNull();
  expect(activeTitle()).toBe('Q1+Q5 compatible'); // selezione seguita la riga
  expect(container.querySelector('#ppp-sl-a2.is-active')).not.toBeNull();
});

test('Cablaggio 4 — Aplicar usa la proposta SELEZIONATA, non sempre la best', () => {
  const applied = [];
  mount(baseData(), { onApplyHora: (t) => applied.push(t) });
  // default = best 15:55
  click(applyBtn());
  expect(applied[applied.length - 1]).toBe('15:55');
  // seleziona 'ins' (16:10) e applica
  click(propBtns()[1]);
  click(applyBtn());
  expect(applied[applied.length - 1]).toBe('16:10');
});

test('Cablaggio 5 — fallback: selezione non applicabile (no_recomendado) → Aplicar usa la best', () => {
  const applied = [];
  const data = contract({
    opportunities: [oppFix({ id: 'nr', giroId: 'a9', status: 'no_recomendado', severity: 'blocked', blocked: true })],
    proposals: [
      propFix({ id: 'best', kind: 'direct', label: 'Directa', timeLabel: '15:55', status: 'compatible', rank: 1 }),
      propFix({ id: 'nr', kind: 'not_recommended', label: 'Cruzado', timeLabel: '16:40', status: 'no_recomendado', rank: 2, giroId: 'a9' }),
    ],
    serviceLine: [{ id: 'a9', zone: 'Q4', salida: '16:20', entrega: '16:40', regreso: '17:05', pizzas: 1 }],
  });
  mount(data, { onApplyHora: (t) => applied.push(t) });
  // clic sulla riga del giro no_recomendado: la mappa può ispezionarlo,
  // ma "Aplicar" NON deve applicare la sua hora.
  click(rowHeads()[0]);
  click(applyBtn());
  expect(applied[applied.length - 1]).toBe('15:55'); // fallback sicuro alla best
});

test('Cablaggio 6 — not_recommended non entra nei bottoni primari', () => {
  const data = contract({
    proposals: [
      propFix({ id: 'best', kind: 'direct', label: 'Directa', timeLabel: '15:55', status: 'compatible', rank: 1 }),
      propFix({ id: 'nr', kind: 'not_recommended', label: 'Cruzado', timeLabel: '16:40', status: 'no_recomendado', rank: 2 }),
    ],
  });
  mount(data);
  const titles = propBtns().map((b) => b.querySelector('.ppp-prop-title')?.textContent);
  expect(titles).not.toContain('Cruzado');
  // default selezione mai una not_recommended
  expect(activeTitle()).toBe('Directa');
});
