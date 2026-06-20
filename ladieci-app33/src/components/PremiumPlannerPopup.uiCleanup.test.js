// UI cleanup operatore (task V1_STAGING_LOCK_ANCHOR_ROUTE_DEPARTURE_AND_PREVIEW_CLARITY)
//   El popup planner debe hablar en lenguaje operativo, no de debug:
//   - large slip Q2 NO muestra `No recomendado` como badge principal si el motivo
//     es solo que el cliente debe aceptar la nueva hora → "Confirmar con cliente"
//   - NO se muestran labels técnicos en el detalle: `nuevo`, `+0 margen`,
//     `-118 vs prometido`, `prometido …`, ni el warning crudo en minutos
//   - la fila compacta "Giros y huecos" se actualiza con el nuevo pedido (Q2)
//     incluido cuando "Encajar Q5" está seleccionado
//   - la hora propuesta al cliente es visible como chip verde "Hora cliente"
//   CI=true npx react-scripts test --watchAll=false --testPathPattern=PremiumPlannerPopup.uiCleanup
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as TestUtils from 'react-dom/test-utils';
import PremiumPlannerPopup from './PremiumPlannerPopup';

const act = React.act || TestUtils.act;
global.IS_REACT_ACT_ENVIRONMENT = true;

const CONTRACT = 'premium-planner-strategic-preview-v1';

// Large slip: el cliente pidió 16:50, la única forma de encajarlo en el giro Q5
// empuja su entrega a 18:48 (+118 min). El backend lo marca no_recomendado, pero
// para el operador es solo "hay que confirmar la nueva hora con el cliente".
// Numeri della "foto" del task: anchor Q5 promesso 19:00 → con il nuovo Q2 davanti
// scala a 19:06 (+6); il nuovo Q2 (cliente pidió 16:50) entra alle 18:54 (+99, NON
// mostrato come numero). Il backend manda ancora slip/margin/promised crudi; il FE
// li traduce in linguaggio operativo.
const RT_BIG = {
  version: 'route-timeline-v2', proposalId: 'cand-agregar-q2-q5-#005',
  summary: { directEta: null, giroEta: '19:06', returnEta: '19:23', tradeoffLabel: '' },
  risk: 'no_recomendado',
  operatorMessage: 'Q2 se mueve +99 min · Q5 se mueve +6 min',
  timeline: [
    { seq: 0, type: 'departure', zone: null, label: 'Pizzería', eta: '18:47' },
    { seq: 1, type: 'delivery', zone: 'Q2', label: 'Pedido actual', eta: '18:54', promised: '16:50', slipLabel: '+99', status: 'no_recomendado', isNewOrder: true, warning: 'Q2 se mueve +99 min' },
    { seq: 2, type: 'delivery', zone: 'Q5', label: 'Pedido Q5', eta: '19:06', promised: '19:00', slipLabel: '+6', status: 'ajuste', marginLabel: '+0 margen', isAnchor: true, warning: 'Q5 se mueve +6 min' },
    { seq: 3, type: 'return', zone: null, label: 'Regreso pizzería', eta: '19:23' },
  ],
};
const dataBig = () => ({
  contract: CONTRACT, mode: 'read_only',
  firstAvailable: { zone: 'Q2', eta: '16:50', status: 'compatible' },
  bestProposal: { id: 'cand-crear-q2', kind: 'crear', status: 'compatible', severity: 'ok', routeZones: ['Q2'], mapPath: ['Pizzería', 'Q2'], routeEtas: [{ zone: 'Q2', eta: '16:50', isNew: true }], title: 'Q2', blocked: false },
  opportunities: [
    { id: 'cand-agregar-q2-q5-#005', kind: 'agregar', giroId: '#005', status: 'no_recomendado', blocked: false, routeZones: ['Q2', 'Q5'], mapPath: ['Pizzería', 'Q2', 'Q5'], routeTimeline: RT_BIG },
  ],
  proposals: [
    { id: 'cand-crear-q2', kind: 'direct', label: 'Crear giro Q2', timeLabel: '17:15', zoneLabel: 'Q2 (sur)', status: 'compatible', rank: 1, recommended: true },
    { id: 'cand-agregar-q2-q5-#005', kind: 'not_recommended', label: '', timeLabel: '18:54', zoneLabel: 'Q2 → Q5 (sur)', status: 'no_recomendado', rank: 2, reason: 'Encaje con ajuste', routeTimeline: RT_BIG, warnings: ['Q2 se mueve +99 min'], recommended: false },
  ],
  serviceLine: [{ id: '#005', zone: 'Q5', salida: '18:47', entrega: '19:00', regreso: '19:13', pizzas: 1 }],
  warnings: [], blockers: [], safety: { readOnly: true, writes: false },
});
const NEXT_GIRO = { kind: 'future_giro', zone: 'Q5', hora: '19:00', anchorOrderId: '#005', label: 'Próximo giro Q5 19:00', cta: 'Ver propuestas', status: 'info', source: 'operational_anchor' };
const cardEntrega = () => container.querySelector('.ppp-best-card h3')?.textContent || '';
const cardLabel = () => container.querySelector('.ppp-best-card .ppp-best-label strong')?.textContent || '';
const cardWarn = () => container.querySelector('.ppp-best-card .ppp-warn-note')?.textContent || '';
const chipTitle = (i) => container.querySelectorAll('.ppp-prop')[i]?.querySelector('.ppp-prop-title')?.textContent || '';
const chipStatus = (i) => container.querySelectorAll('.ppp-prop')[i]?.querySelector('.ppp-prop-st')?.textContent || '';

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const mountBig = (extra = {}) => act(() => {
  root.render(React.createElement(PremiumPlannerPopup, {
    data: dataBig(), onClose() {},
    nextGiroOpportunity: { ...NEXT_GIRO }, initialFocusOpportunity: true, ...extra,
  }));
});
const detail = () => container.querySelector('.ppp-timeline-card .ppp-sl-detail');
const headText = () => container.querySelector('.ppp-timeline-card .ppp-sl-head')?.textContent || '';

// 1 + 7: el badge de la timeline NO dice "No recomendado" cuando el motivo es solo
// la aceptación del cliente; lo traduce a "Confirmar con cliente".
test('large slip: detalle NO muestra badge "No recomendado", sino "Confirmar con cliente"', () => {
  mountBig();
  const d = detail();
  expect(d).toBeTruthy();
  const risk = d.querySelector('.ppp-rt-risk');
  expect(risk).toBeTruthy();
  expect(risk.textContent).toBe('Confirmar con cliente');
  expect(d.textContent).not.toMatch(/No recomendado/);
});

// 2: no headline crudo "Q2 se mueve +99 min" en el detalle ni en la card.
test('large slip: ni detalle ni card muestran el warning crudo "se mueve +N min"', () => {
  mountBig();
  expect(detail().textContent).not.toMatch(/se mueve \+?\d+ min/);
  expect(cardWarn()).not.toMatch(/se mueve/);
  expect(cardWarn()).not.toMatch(/\+99/);
});

// 5: detalle expandido sin labels técnicos `nuevo`, `+0 margen`, slip badge, `prometido`.
test('large slip: detalle sin `nuevo`, `margen`, slip badge, `prometido`', () => {
  mountBig();
  const d = detail();
  // badges/labels técnicos eliminados de la timeline
  expect(d.querySelector('.ppp-rt-badge')).toBeNull();
  expect(d.querySelector('.ppp-rt-slip')).toBeNull();
  expect(d.querySelector('.ppp-rt-margin')).toBeNull();
  expect(d.querySelector('.ppp-rt-prom')).toBeNull();
  expect(d.querySelector('.ppp-rt-summary')).toBeNull();  // summary duplicado suprimido
  const t = d.textContent;
  expect(t).not.toMatch(/margen/);
  expect(t).not.toMatch(/prometido/i);
});

// ── card: "Giro compatible Q5", hora cliente grande, SECA (sin warning) ──
test('card: titulo "Giro compatible Q5", hora "Entrega cliente 18:54", sin `oportunidad`', () => {
  mountBig();
  expect(cardLabel()).toBe('Giro compatible Q5');
  expect(cardEntrega()).toBe('Entrega cliente 18:54');
  // status técnico `oportunidad` NO aparece en la card
  expect(container.querySelector('.ppp-best-card').textContent).not.toMatch(/oportunidad/i);
  // ruta presente como subtítulo
  expect([...container.querySelectorAll('.ppp-best-card .ppp-type')].map((e) => e.textContent).join(' ')).toMatch(/Q2\s*→\s*Q5/);
});

// BLOCCO A #2: la card NO repite "Atención: Q5 llegaría…" (vive en Giros y huecos).
test('card: SECA — sin warning "Atención: Q5 llegaría" (el impacto vive en Giros y huecos)', () => {
  mountBig();
  expect(container.querySelector('.ppp-best-card .ppp-warn-note')).toBeNull();
  expect(cardWarn()).not.toMatch(/Atención/);
  expect(cardWarn()).not.toMatch(/llegaría/);
});

// BLOCCO A #1: botón "Confirmar giro compatible" ámbar (no "Revisar antes de aplicar").
test('card: botón "Confirmar giro compatible" ámbar', () => {
  const applied = [];
  mountBig({ onApplyHora: (t) => applied.push(t) });
  const btn = container.querySelector('.ppp-apply');
  expect(btn.textContent).toBe('Confirmar giro compatible');
  expect(btn.className).toMatch(/is-warning/);  // ámbar, no verde pleno
});

// 4: chip "Usar giro Q5" sin `oportunidad`.
test('chip: "Usar giro Q5" sin status `oportunidad`', () => {
  mountBig();
  // chip[1] = la oportunidad (chip[0] = directo "Crear giro Q2")
  expect(chipTitle(1)).toBe('Usar giro Q5');
  expect(chipStatus(1)).not.toMatch(/oportunidad/i);
});

// 3: la fila compacta se actualiza con el nuevo pedido Q2 incluido (no el giro viejo).
test('compacta: con Usar giro seleccionado, la fila muestra la preview con Q2 incluido', () => {
  mountBig();
  const h = headText();
  expect(h).toMatch(/18:47/);   // salida del giro (preview)
  expect(h).toMatch(/18:54/);   // entrega del nuevo pedido Q2 (hora cliente)
  expect(h).toMatch(/19:06/);   // entrega anchor Q5 (movida)
  expect(h).toMatch(/19:23/);   // regreso
  // NO el baseline viejo del giro (19:00 / 19:13)
  expect(h).not.toMatch(/19:13/);
});

// 6: la hora del cliente es visible como chip verde "Cliente 18:54".
test('compacta: chip verde "Cliente 18:54" con la hora propuesta', () => {
  mountBig();
  const chip = container.querySelector('.ppp-timeline-card .ppp-sl-head .ppp-sl-leg.is-client');
  expect(chip).toBeTruthy();
  expect(chip.textContent).toMatch(/Cliente/);
  expect(chip.textContent).toMatch(/18:54/);
});

// 8 (compacta): el slip del ancla aparece pequeño "(+6)", no rojo grande.
test('compacta: slip del ancla Q5 como "(+6)" pequeño junto a 19:06', () => {
  mountBig();
  const slip = container.querySelector('.ppp-timeline-card .ppp-sl-head .ppp-sl-slip');
  expect(slip).toBeTruthy();
  expect(slip.textContent).toMatch(/\+6/);
});

// 7 (sin duplicados): el slip/margen/prometido no reaparecen como labels técnicos.
test('compacta: la fila no repite labels técnicos (margen / prometido / vs prometido)', () => {
  mountBig();
  const h = headText();
  expect(h).not.toMatch(/margen/);
  expect(h).not.toMatch(/prometido/i);
  expect(h).not.toMatch(/se mueve/);
});
