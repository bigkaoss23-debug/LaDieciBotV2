// W5 Packet 01 — SMOKE READ-ONLY: proves the popup's own apply action is
// disabled while a signal-triggered silent refresh is in flight (loading=true),
// and enabled otherwise. No backend, no DB, no browser.
//   CI=true npx react-scripts test --watchAll=false --testPathPattern=giroFactsSignalRefresh
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PremiumPlannerPopup from './PremiumPlannerPopup';

const CONTRACT = 'premium-planner-strategic-preview-v1';

const RT = (tag) => ({
  timeline: [
    { seq: 1, type: 'departure', zone: 'Q1', eta: '15:48', label: 'Salida pizzería' },
    { seq: 2, type: 'delivery', zone: 'Q5', eta: '16:10', status: 'ok', isNewOrder: true, promised: '16:10' },
    { seq: 3, type: 'return', zone: 'Q1', eta: '16:25', label: 'Regreso' },
  ],
  summary: { directEta: '15:55', giroEta: '16:10', returnEta: '16:25' },
  risk: 'ok',
  operatorMessage: tag,
});

const propFix = (over = {}) => ({
  id: 'best', kind: 'direct', label: 'Directa', timeLabel: '15:55', rank: 1,
  routeTimeline: RT('giro'), warnings: [], blockers: [],
  ...over,
});

const contract = (over = {}) => ({
  contract: CONTRACT,
  mode: 'read_only',
  currentOrder: { zone: 'Q1', promised: '16:00', pizzas: 2 },
  firstAvailable: { zone: 'Q1', eta: '15:55', status: 'compatible' },
  bestProposal: { id: 'best', kind: 'crear', routeZones: ['Q1'], mapPath: ['Q1'], routeEtas: [{ zone: 'Q1', eta: '15:55', isNew: true }], routeTimeline: RT('directa') },
  opportunities: [],
  proposals: [propFix()],
  serviceLine: [],
  warnings: [],
  blockers: [],
  safety: { readOnly: true, writes: false },
  ...over,
});

const stripStyle = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, '');
const render = (data, extra = {}) =>
  stripStyle(renderToStaticMarkup(React.createElement(PremiumPlannerPopup, { data, onClose: () => {}, onApplyHora: () => {}, ...extra })));

test('W5-X05/X08: apply action ENABLED when not refreshing (loading=false)', () => {
  const html = render(contract(), { loading: false });
  expect(/class="ppp-apply[^"]*"[^>]*(?!disabled)>/.test(html)).toBe(true);
  expect(/class="ppp-apply[^"]*"[^>]*\sdisabled\b/.test(html)).toBe(false);
});

test('W5-X05: apply action DISABLED while a signal-triggered refresh is in flight (loading=true)', () => {
  const html = render(contract(), { loading: true });
  expect(/class="ppp-apply[^"]*"[^>]*\sdisabled\b/.test(html)).toBe(true);
});

test('W5-X06: no loading prop at all (default) behaves the same as loading=false — no unnecessary disable', () => {
  const html = render(contract());
  expect(/class="ppp-apply[^"]*"[^>]*\sdisabled\b/.test(html)).toBe(false);
});
