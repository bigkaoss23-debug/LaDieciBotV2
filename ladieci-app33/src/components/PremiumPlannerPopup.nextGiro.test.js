// NEXT_GIRO (task 47) — il chip sintetico "Encajar Q5" da nextGiroOpportunity.
//   - con prop → 2º chip ámbar "Encajar Q5" 22:00 oportunidad (direct resta 1º)
//   - senza prop → comportamento invariato
//   - click chip opportunity → card mostra Entrega 22:00 + bottone prudente
//   - non applica automaticamente; nessuna scrittura
//   CI=true npx react-scripts test --watchAll=false --testPathPattern=PremiumPlannerPopup.nextGiro
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as TestUtils from 'react-dom/test-utils';
import PremiumPlannerPopup from './PremiumPlannerPopup';

const act = React.act || TestUtils.act;
global.IS_REACT_ACT_ENVIRONMENT = true;

const CONTRACT = 'premium-planner-strategic-preview-v1';

// Scenario reale del test manuale: solo il diretto Q2 compatible; Q5 22:00 in serviceLine.
const data = () => ({
  contract: CONTRACT, mode: 'read_only',
  firstAvailable: { zone: 'Q2', eta: '20:25', status: 'compatible' },
  bestProposal: { id: 'best', kind: 'crear', status: 'compatible', severity: 'ok', routeZones: ['Q2'], mapPath: ['Q2'], routeEtas: [{ zone: 'Q2', eta: '20:25', isNew: true }], title: 'Q2', blocked: false },
  opportunities: [],
  proposals: [
    { id: 'best', kind: 'direct', label: 'Crear giro Q2', timeLabel: '20:25', zoneLabel: 'Q2', status: 'compatible', rank: 1, recommended: true },
  ],
  serviceLine: [
    { id: '#001', zone: 'Q5', salida: '21:47', entrega: '22:00', regreso: '22:13', pizzas: 1 },
  ],
  warnings: [], blockers: [], safety: { readOnly: true, writes: false },
});

const NEXT_GIRO = { kind: 'future_giro', zone: 'Q5', hora: '22:00', anchorOrderId: '#001', label: 'Próximo giro Q5 22:00', cta: 'Ver propuestas', status: 'info', source: 'operational_anchor' };

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const mount = (extra = {}) => act(() => { root.render(React.createElement(PremiumPlannerPopup, { data: data(), onClose() {}, ...extra })); });
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const propBtns = () => [...container.querySelectorAll('.ppp-prop')];
const titleAt = (i) => propBtns()[i]?.querySelector('.ppp-prop-title')?.textContent || null;
const timeAt = (i) => propBtns()[i]?.querySelector('.ppp-prop-time')?.textContent || null;
const stAt = (i) => propBtns()[i]?.querySelector('.ppp-prop-st')?.textContent || null;
const applyBtn = () => container.querySelector('.ppp-apply');
const cardEntrega = () => container.querySelector('.ppp-best-card h3')?.textContent || null;
const cardLabel = () => container.querySelector('.ppp-best-card .ppp-best-label strong')?.textContent || null;

test('senza nextGiroOpportunity → solo il diretto, nessun chip Encajar', () => {
  mount();
  expect(titleAt(0)).toBe('Crear giro Q2');
  const titles = propBtns().map((b, i) => titleAt(i));
  expect(titles.some((t) => /Encajar/.test(t || ''))).toBe(false);
});

test('con nextGiroOpportunity → chip 2 = Encajar Q5 22:00 oportunidad, direct resta 1º', () => {
  mount({ nextGiroOpportunity: NEXT_GIRO });
  expect(titleAt(0)).toBe('Crear giro Q2');     // diretto primo, invariato
  expect(titleAt(1)).toBe('Encajar Q5');        // opportunity secondo
  expect(timeAt(1)).toBe('22:00');
  expect(stAt(1)).toBe('oportunidad');
});

test('click chip opportunity → card Entrega 22:00 + bottone prudente (no verde)', () => {
  const applied = [];
  mount({ nextGiroOpportunity: NEXT_GIRO, onApplyHora: (t) => applied.push(t) });
  // stato iniziale: card = diretto 20:25
  expect(cardEntrega()).toBe('Entrega 20:25');
  expect(cardLabel()).toBe('Mejor propuesta');
  // selezione chip opportunity → card cambia
  click(propBtns()[1]);
  expect(cardEntrega()).toBe('Entrega 22:00');
  expect(cardLabel()).toBe('Encajar Q5');
  // bottone prudente (review), NON "Aplicar propuesta" verde
  expect(applyBtn().textContent).toBe('Revisar antes de aplicar');
  // il click sul chip NON ha applicato nulla
  expect(applied.length).toBe(0);
});

// ── task 54: chip OPPORTUNITY enganchada a la propuesta REAL del backend ──────
// Escenario del test manual real: el backend YA expone la inserción Q2→Q5 en
// proposals[] (kind not_recommended, mismo ancla #001) CON routeTimeline/mapPath.
// La chip "Encajar Q5" debe usar esa propuesta real → mapa Q2+Q5, timeline
// combinada, entrega/warning calculados; NO un sintético sin ruta.
const RT_INSERTION = {
  version: 'route-timeline-v2', proposalId: 'cand-agregar-q2-q5-#001',
  summary: { directEta: null, giroEta: '22:04', returnEta: '22:21', tradeoffLabel: '' },
  risk: 'warning', operatorMessage: 'Se puede, pero Q2 cede +7 min sobre lo prometido (prometido 21:45).',
  timeline: [
    { seq: 0, type: 'departure', zone: null, label: 'Pizzería', eta: '21:45' },
    { seq: 1, type: 'delivery', zone: 'Q2', label: 'Pedido actual', eta: '21:52', promised: '21:45', slipLabel: '+7', status: 'ajuste', isNewOrder: true, warning: 'Q2 se mueve +7 min' },
    { seq: 2, type: 'delivery', zone: 'Q5', label: 'Pedido Q5', eta: '22:04', promised: '23:50', status: 'ok', marginLabel: '+106 margen', isAnchor: true },
    { seq: 3, type: 'return', zone: null, label: 'Regreso pizzería', eta: '22:21' },
  ],
};
const dataReal = () => ({
  contract: CONTRACT, mode: 'read_only',
  firstAvailable: { zone: 'Q2', eta: '21:45', status: 'compatible' },
  bestProposal: { id: 'cand-crear-q2', kind: 'crear', status: 'compatible', severity: 'ok', routeZones: ['Q2'], mapPath: ['Pizzería', 'Q2'], routeEtas: [{ zone: 'Q2', eta: '21:45', isNew: true }], title: 'Q2', blocked: false },
  opportunities: [
    { id: 'cand-agregar-q2-q5-#001', kind: 'agregar', giroId: '#001', status: 'no_recomendado', blocked: false, routeZones: ['Q2', 'Q5'], mapPath: ['Pizzería', 'Q2', 'Q5'], warning: 'Q2 se mueve +7 min', routeTimeline: RT_INSERTION },
  ],
  proposals: [
    { id: 'cand-crear-q2', kind: 'direct', label: 'Crear giro Q2', timeLabel: '21:45', zoneLabel: 'Q2 (sur)', status: 'compatible', rank: 1, recommended: true },
    { id: 'cand-agregar-q2-q5-#001', kind: 'not_recommended', label: '', timeLabel: '21:52', zoneLabel: 'Q2 → Q5 (sur)', status: 'no_recomendado', rank: 2, reason: 'Inserción posible con ajuste: Q2 21:52 → Q5 22:04', routeTimeline: RT_INSERTION, warnings: ['Q2 se mueve +7 min'], recommended: false },
  ],
  serviceLine: [{ id: '#001', zone: 'Q5', salida: '23:37', entrega: '23:50', regreso: '00:03', pizzas: 1 }],
  warnings: [], blockers: [], safety: { readOnly: true, writes: false },
});
const mountReal = (extra = {}) => act(() => { root.render(React.createElement(PremiumPlannerPopup, { data: dataReal(), onClose() {}, ...extra })); });

test('task54: chip Encajar usa la propuesta REAL (entrega 21:52, no 23:50 del ancla)', () => {
  mountReal({ nextGiroOpportunity: { ...NEXT_GIRO, hora: '23:50' } });
  expect(titleAt(0)).toBe('Crear giro Q2');
  expect(titleAt(1)).toBe('Encajar Q5');
  expect(timeAt(1)).toBe('21:52');        // entrega del nuevo pedido en el giro (real), no 23:50
  expect(stAt(1)).toBe('oportunidad');
  // la propuesta not_recommended NO se duplica como 3er chip primario
  const titles = propBtns().map((_, i) => titleAt(i));
  expect(titles.filter((t) => t === 'Encajar Q5').length).toBe(1);
});

test('task54: click chip → card real (21:52, ruta Q2→Q5), warning real, timeline combinada', () => {
  const applied = [];
  mountReal({ nextGiroOpportunity: { ...NEXT_GIRO, hora: '23:50' }, onApplyHora: (t) => applied.push(t) });
  click(propBtns()[1]);
  expect(cardEntrega()).toBe('Entrega 21:52');
  expect(cardLabel()).toBe('Encajar Q5');
  // route label = ruta real del backend
  const types = [...container.querySelectorAll('.ppp-best-card .ppp-type')].map((e) => e.textContent);
  expect(types.some((t) => /Q2\s*→\s*Q5/.test(t || ''))).toBe(true);
  // warning real calculado (no copy genérico)
  expect(container.querySelector('.ppp-warn-note')?.textContent || '').toMatch(/\+7 min/);
  // timeline combinada presente con la parada Q5 22:04
  const oppTl = container.querySelector('.ppp-opp-timeline');
  expect(oppTl).toBeTruthy();
  expect(oppTl.textContent).toMatch(/22:04/);
  expect(oppTl.textContent).toMatch(/Q5/);
  // botón prudente, sin aplicar nada al click del chip
  expect(applyBtn().textContent).toBe('Revisar antes de aplicar');
  expect(applied.length).toBe(0);
});

// ── FIX 1: selección inicial = oportunidad cuando se abre desde "Próximo giro" ──
test('fix1: initialFocusOpportunity=true → popup arranca en Encajar Q5 (no en best)', () => {
  mountReal({ nextGiroOpportunity: { ...NEXT_GIRO, hora: '23:50' }, initialFocusOpportunity: true });
  // sin ningún click: la card grande ya muestra la oportunidad
  expect(cardLabel()).toBe('Encajar Q5');
  expect(cardEntrega()).toBe('Entrega 21:52');
  // chip oportunidad marcado como activo
  expect(propBtns()[1].getAttribute('aria-pressed')).toBe('true');
  // timeline combinada visible de entrada
  expect(container.querySelector('.ppp-opp-timeline')).toBeTruthy();
});

test('fix1: sin focus (Ver propuestas normal) → popup arranca en la best/direct', () => {
  mountReal({ nextGiroOpportunity: { ...NEXT_GIRO, hora: '23:50' } }); // initialFocusOpportunity por defecto false
  expect(cardLabel()).toBe('Mejor propuesta');
  expect(cardEntrega()).toBe('Entrega 21:45');
  // sin timeline de oportunidad hasta que se seleccione el chip
  expect(container.querySelector('.ppp-opp-timeline')).toBeNull();
});

test('fix1: focus pero sin oportunidad real → fallback a best (sin crash)', () => {
  mount({ initialFocusOpportunity: true }); // data() sin opportunities ni nextGiro
  expect(cardLabel()).toBe('Mejor propuesta');
});
