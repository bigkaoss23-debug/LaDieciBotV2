// NEXT_GIRO — chip "Usar giro X" desde nextGiroOpportunity.
//   ALIGN_NEXT_GIRO_WITH_STRATEGIC (regla nueva): el chip SOLO aparece si una
//   proposal/opportunity REAL del estratégico lo respalda (routeTimeline + ruta +
//   giroId). Sin respaldo real → NO se muestra chip confirmable (antes, task 47, se
//   mostraba un chip ligero sin ruta → incoherente "chip Q2 / mapa Pizzería→Q1").
//   - con respaldo real (dataReal, not_recommended #001) → chip "Usar giro Q5" con
//     entrega/ruta/timeline reales; click → card real, sin aplicar nada;
//   - sin respaldo real (data, opportunities:[]) → sin chip; card queda en la best.
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

// ALIGN_NEXT_GIRO_WITH_STRATEGIC: el hint nextGiroOpportunity (#001) NO tiene una
// proposal/opportunity REAL de inserción que lo respalde en data() (opportunities:[]),
// así que ya NO se promueve a un chip confirmable "Usar giro Q5". Antes (task 47) se
// mostraba un chip ligero sin ruta → incoherente. Regla nueva: solo propuestas reales.
test('con nextGiroOpportunity SIN respaldo real → NO aparece chip "Usar giro" (regla align)', () => {
  mount({ nextGiroOpportunity: NEXT_GIRO });
  expect(titleAt(0)).toBe('Crear giro Q2');     // el directo real sigue siendo el 1º
  const titles = propBtns().map((_, i) => titleAt(i));
  expect(titles.some((t) => /Usar giro/.test(t || ''))).toBe(false);
  expect(titles.some((t) => /Encajar/.test(t || ''))).toBe(false);
});

test('sin respaldo real: la card queda en la best/direct, sin "Giro compatible" confirmable', () => {
  const applied = [];
  mount({ nextGiroOpportunity: NEXT_GIRO, onApplyHora: (t) => applied.push(t) });
  // sin chip oportunidad → la card grande queda en la best/direct
  expect(cardEntrega()).toBe('Entrega 20:25');
  expect(cardLabel()).toBe('Mejor propuesta');
  // no se ofrece "Confirmar giro compatible" sin una propuesta real
  expect(applyBtn().textContent).not.toMatch(/Confirmar giro compatible/);
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
  expect(titleAt(1)).toBe('Usar giro Q5');
  expect(timeAt(1)).toBe('21:52');        // entrega del nuevo pedido en el giro (real), no 23:50
  expect(stAt(1)).toBe('Q2 → Q5 (sur)');  // ruta en vez del status técnico `oportunidad`
  // la propuesta not_recommended NO se duplica como 3er chip primario
  const titles = propBtns().map((_, i) => titleAt(i));
  expect(titles.filter((t) => t === 'Usar giro Q5').length).toBe(1);
});

test('task54: click chip → card real (21:52, ruta Q2→Q5), warning real, timeline combinada', () => {
  const applied = [];
  mountReal({ nextGiroOpportunity: { ...NEXT_GIRO, hora: '23:50' }, onApplyHora: (t) => applied.push(t) });
  click(propBtns()[1]);
  expect(cardEntrega()).toBe('Entrega cliente 21:52');
  expect(cardLabel()).toBe('Giro compatible Q5');
  // route label = ruta real del backend
  const types = [...container.querySelectorAll('.ppp-best-card .ppp-type')].map((e) => e.textContent);
  expect(types.some((t) => /Q2\s*→\s*Q5/.test(t || ''))).toBe(true);
  // card SECA: sin warning de slip/aceptación en la card superior (el impacto vive
  // en "Giros y huecos"). No reaparecen minutos crudos.
  expect(container.querySelector('.ppp-best-card .ppp-warn-note')).toBeNull();
  // single-timeline: NO hay bloque "Línea del giro" separado; el detalle combinado
  // (Q5 22:04) vive DENTRO de "Giros y huecos" (.ppp-sl-detail de la fila activa).
  expect(container.querySelector('.ppp-opp-timeline')).toBeNull();
  const detail = container.querySelector('.ppp-timeline-card .ppp-sl-detail');
  expect(detail).toBeTruthy();
  expect(detail.textContent).toMatch(/22:04/);
  expect(detail.textContent).toMatch(/Q5/);
  // botón "Confirmar giro compatible"; sin aplicar nada al click del chip
  expect(applyBtn().textContent).toBe('Confirmar giro compatible');
  expect(applied.length).toBe(0);
});

// ── FIX 1: selección inicial = oportunidad cuando se abre desde "Próximo giro" ──
test('fix1: initialFocusOpportunity=true → popup arranca en Encajar Q5 (no en best)', () => {
  mountReal({ nextGiroOpportunity: { ...NEXT_GIRO, hora: '23:50' }, initialFocusOpportunity: true });
  // sin ningún click: la card grande ya muestra la oportunidad
  expect(cardLabel()).toBe('Giro compatible Q5');
  expect(cardEntrega()).toBe('Entrega cliente 21:52');
  // chip oportunidad marcado como activo
  expect(propBtns()[1].getAttribute('aria-pressed')).toBe('true');
  // detalle combinado YA visible dentro de "Giros y huecos", sin bloque separado
  expect(container.querySelector('.ppp-opp-timeline')).toBeNull();
  const detail = container.querySelector('.ppp-timeline-card .ppp-sl-detail');
  expect(detail).toBeTruthy();
  expect(detail.textContent).toMatch(/22:04/);
});

test('fix1: sin focus (Ver propuestas normal) → popup arranca en la best/direct', () => {
  mountReal({ nextGiroOpportunity: { ...NEXT_GIRO, hora: '23:50' } }); // initialFocusOpportunity por defecto false
  expect(cardLabel()).toBe('Mejor propuesta');
  expect(cardEntrega()).toBe('Entrega 21:45');
  // sin foco: ninguna fila expandida (sin detalle) hasta seleccionar
  expect(container.querySelector('.ppp-opp-timeline')).toBeNull();
  expect(container.querySelector('.ppp-timeline-card .ppp-sl-detail')).toBeNull();
});

test('fix1: focus pero sin oportunidad real → fallback a best (sin crash)', () => {
  mount({ initialFocusOpportunity: true }); // data() sin opportunities ni nextGiro
  expect(cardLabel()).toBe('Mejor propuesta');
});

// ── single-timeline UI fix: una sola línea (Giros y huecos), chips estables ─────
test('single-timeline: sin "Línea del giro" separada; 3 chips ANTES de Giros y huecos', () => {
  mountReal({ nextGiroOpportunity: { ...NEXT_GIRO, hora: '23:50' }, initialFocusOpportunity: true });
  // no hay segunda timeline encima de los chips
  expect(container.querySelector('.ppp-opp-timeline')).toBeNull();
  const props = container.querySelector('.ppp-props');
  const gyh = container.querySelector('.ppp-timeline-card');
  expect(props).toBeTruthy();
  expect(gyh).toBeTruthy();
  // los chips van ANTES de "Giros y huecos" en el DOM
  expect(props.compareDocumentPosition(gyh) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(propBtns().length).toBe(3);
});

test('single-timeline: cambio chip actualiza el detalle dentro de Giros y huecos', () => {
  mountReal({ nextGiroOpportunity: { ...NEXT_GIRO, hora: '23:50' }, initialFocusOpportunity: true });
  // arranca en Encajar Q5 → detalle Q2→Q5 (22:04) dentro de Giros y huecos
  expect(container.querySelector('.ppp-timeline-card .ppp-sl-detail').textContent).toMatch(/22:04/);
  // selecciono el directo → sin giro ligado → fila colapsa (sin detalle), card=best
  click(propBtns()[0]);
  expect(cardLabel()).toBe('Mejor propuesta');
  expect(container.querySelector('.ppp-timeline-card .ppp-sl-detail')).toBeNull();
  // vuelvo a Encajar Q5 → detalle Q2→Q5 reaparece dentro de Giros y huecos
  click(propBtns()[1]);
  expect(container.querySelector('.ppp-timeline-card .ppp-sl-detail').textContent).toMatch(/22:04/);
});

// ── clarity: copy operacional + etiquetas claras ───────────────────────────────
test('clarity: card SECA — hora cliente grande, sin ningún warning en la card', () => {
  mountReal({ nextGiroOpportunity: { ...NEXT_GIRO, hora: '23:50' }, initialFocusOpportunity: true });
  // la hora del cliente vive grande en la card
  expect(cardEntrega()).toMatch(/21:52/);
  // card seca: ni "Atención: Q5 llegaría…" ni "Solo si el cliente acepta" en la card
  expect(container.querySelector('.ppp-best-card .ppp-warn-note')).toBeNull();
  expect(container.querySelector('.ppp-best-card').textContent).not.toMatch(/Atención/);
});

test('clarity: detalle preview SIN summary ni "Confirmar antes de aplicar"; badge "Confirmar con cliente"', () => {
  mountReal({ nextGiroOpportunity: { ...NEXT_GIRO, hora: '23:50' }, initialFocusOpportunity: true });
  const detail = container.querySelector('.ppp-timeline-card .ppp-sl-detail');
  expect(detail.textContent).toMatch(/Vista previa con el nuevo pedido/);
  // badge prudente presente (aquí risk='warning' → "Con ajuste"); nunca "No recomendado"
  expect(detail.querySelector('.ppp-rt-risk')).toBeTruthy();
  expect(detail.textContent).not.toMatch(/No recomendado/);
  // frase redundante "Confirmar antes de aplicar" eliminada del detalle
  expect(detail.textContent).not.toMatch(/Confirmar antes de aplicar/);
  // summary (Entrega giro / Regreso) suprimido en preview → no duplica la fila compacta
  expect(detail.querySelector('.ppp-rt-summary')).toBeNull();
  // operatorMessage crudo del backend NO se muestra en preview
  expect(detail.textContent).not.toMatch(/se mueve/);
  // subtítulos humanos de las paradas
  expect(detail.textContent).toMatch(/Entrega cliente/);
  expect(detail.textContent).toMatch(/Entrega giro/);
});
