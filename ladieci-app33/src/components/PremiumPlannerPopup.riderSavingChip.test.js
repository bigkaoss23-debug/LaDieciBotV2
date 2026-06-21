// RIDER_SAVING_CHIP — chip informativo "🛵 Ahorra N min rider" en la card superior
//   Lee SOLO proposal.riderSavingMin (backend). >0 → muestra; null/undefined/<=0 →
//   nada. NUNCA muestra combinedDurationMin/separateDurationMin ni debug. No bloquea.
//   CI=true npx react-scripts test --watchAll=false --testPathPattern=PremiumPlannerPopup.riderSavingChip
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as TestUtils from 'react-dom/test-utils';
import PremiumPlannerPopup from './PremiumPlannerPopup';

const act = React.act || TestUtils.act;
global.IS_REACT_ACT_ENVIRONMENT = true;
const CONTRACT = 'premium-planner-strategic-preview-v1';

// Card superior guiada por la proposal `recommended` (cardProposal). Le colgamos
// riderSavingMin + las duraciones (que NO deben pintarse).
const data = (extraProp = {}) => ({
  contract: CONTRACT, mode: 'read_only',
  firstAvailable: { zone: 'Q1', eta: '22:11', status: 'compatible' },
  bestProposal: { id: 'p-giro', kind: 'agregar', status: 'compatible', severity: 'ok', routeZones: ['Q1', 'Q2', 'Q5'], mapPath: ['Pizzería', 'Q1', 'Q2', 'Q5'], title: 'Q1 → Q2 → Q5', blocked: false },
  opportunities: [],
  proposals: [
    {
      id: 'p-giro', kind: 'insertion', label: 'Usar giro Q5', timeLabel: '22:11',
      zoneLabel: 'Q1 → Q2 → Q5 (sur)', status: 'compatible', rank: 1, recommended: true,
      combinedDurationMin: 41, separateDurationMin: 60, // NO deben aparecer
      ...extraProp,
    },
  ],
  serviceLine: [], warnings: [], blockers: [], safety: { readOnly: true, writes: false },
});

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const mount = (d) => act(() => { root.render(React.createElement(PremiumPlannerPopup, { data: d, onClose() {} })); });
const cardText = () => container.querySelector('.ppp-best-card')?.textContent || '';
const chip = () => container.querySelector('.ppp-rider-saving');

// 1) riderSavingMin=19 → "Ahorra 19 min rider"
test('riderSavingMin=19 → chip "Ahorra 19 min rider"', () => {
  mount(data({ riderSavingMin: 19 }));
  expect(chip()).toBeTruthy();
  expect(chip().textContent).toBe('🛵 Ahorra 19 min rider');
});

// 2) riderSavingMin=0 → sin chip
test('riderSavingMin=0 → sin chip', () => {
  mount(data({ riderSavingMin: 0 }));
  expect(chip()).toBeNull();
});

// 3) sin riderSavingMin → sin chip, sin crash
test('sin riderSavingMin → sin chip, sin crash', () => {
  mount(data({}));
  expect(chip()).toBeNull();
  // null explícito tampoco rompe
  mount(data({ riderSavingMin: null }));
  expect(chip()).toBeNull();
});

// 4) nunca muestra combinedDurationMin/separateDurationMin ni debug
test('no muestra combined/separate ni etiquetas debug', () => {
  mount(data({ riderSavingMin: 19 }));
  const t = cardText();
  expect(t).toMatch(/Ahorra 19 min rider/);
  expect(t).not.toMatch(/41|60/);            // duraciones raw
  expect(t).not.toMatch(/combinedDurationMin|separateDurationMin|riderSavingMin/);
  expect(t).not.toMatch(/combinad|separad/i);
  // sin debug labels que ya se retiraron del operador
  for (const bad of ['prometido', 'No recomendado', 'se mueve', 'oportunidad']) {
    expect(t.toLowerCase()).not.toContain(bad.toLowerCase());
  }
});

// 5) negativo → sin chip (clamp/seguridad: backend ya manda max(0,...), pero el FE
//    tampoco pinta valores <=0)
test('riderSavingMin negativo → sin chip', () => {
  mount(data({ riderSavingMin: -3 }));
  expect(chip()).toBeNull();
});
