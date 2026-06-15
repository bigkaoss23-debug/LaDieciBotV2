// SMOKE READ-ONLY (regression) — valida il layout UX-2 di PremiumPlannerPopup
// rendendolo a HTML statico con contract-fixture. Nessun backend, nessun DB,
// nessun Confirmar, nessun browser. Esegui con:
//   CI=true npx react-scripts test --watchAll=false --testPathPattern=PremiumPlannerPopup.smoke
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

// opportunity sorgente (mapPath/routeEtas/severity) linkata alla proposal per id.
const oppFix = (over = {}) => ({
  id: 'o', kind: 'agregar', status: 'compatible', severity: 'ok',
  routeEtas: [{ zone: 'Q5', eta: '16:10', isNew: true }],
  routeZones: ['Q1', 'Q5'], mapPath: ['Q1', 'Q5'], channel: 'sur',
  title: 'Q1+Q5', subtitle: '', routeTimeline: RT('giro'), blocked: false,
  ...over,
});

// proposal ranked del backend (premium-planner-proposal-selection-v1).
const propFix = (over = {}) => ({
  id: 'o', kind: 'insertion', label: 'Q1+Q5 compatible', timeLabel: '16:10',
  zoneLabel: 'Q1 → Q5 (sur)', status: 'compatible', rank: 2,
  routeTimeline: RT('giro'), warnings: [], blockers: [],
  ...over,
});

const contract = (over = {}) => ({
  contract: CONTRACT,
  mode: 'read_only',
  currentOrder: { zone: 'Q1', promised: '16:00', pizzas: 2 },
  firstAvailable: { zone: 'Q1', eta: '15:55', status: 'compatible' },
  bestProposal: oppFix({ id: 'best', kind: 'crear', routeZones: ['Q1'], mapPath: ['Q1'], routeEtas: [{ zone: 'Q1', eta: '15:55', isNew: true }], routeTimeline: RT('directa') }),
  opportunities: [],
  proposals: [],
  serviceLine: [],
  warnings: [],
  blockers: [],
  safety: { readOnly: true, writes: false },
  ...over,
});

const stripStyle = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, '');

function parseProps(rawHtml) {
  const html = stripStyle(rawHtml);
  const out = [];
  const re = /<button\b[^>]*?\bclass="ppp-prop([^"]*)"([^>]*)>(.*?)<\/button>/gs;
  let m;
  while ((m = re.exec(html)) !== null) {
    const cls = m[1].trim();
    const attrs = m[2];
    const inner = m[3];
    out.push({
      time: (inner.match(/ppp-prop-time">([^<]*)</) || [])[1] || null,
      title: (inner.match(/ppp-prop-title">([^<]*)</) || [])[1] || null,
      status: (inner.match(/ppp-prop-st">([^<]*)</) || [])[1] || null,
      empty: /is-empty/.test(cls),
      active: /is-active/.test(cls),
      disabled: /disabled/.test(attrs),
    });
  }
  return out;
}

function audit(rawHtml) {
  const html = stripStyle(rawHtml);
  const idxProps = html.indexOf('ppp-props');
  const idxMap = html.indexOf('ppp-map-card');
  return {
    hasBestCard: html.includes('ppp-best-card'),
    bestEta: (html.match(/ppp-best-card[\s\S]*?<h3>([^<]*)<\/h3>/) || [])[1] || null,
    hasMap: idxMap >= 0,
    // la mappa sta nel top-grid PRIMA dei 3 bottoni
    mapBeforeProps: idxMap >= 0 && idxProps >= 0 ? idxMap < idxProps : false,
    hasServiceLine: html.includes('ppp-sl-rows'),
    serviceRows: (html.match(/class="ppp-sl-head"/g) || []).length,
    hasNotes: html.includes('ppp-notes'),
    hasApply: /ppp-apply/.test(html),
  };
}

const render = (data, extra = {}) =>
  renderToStaticMarkup(React.createElement(PremiumPlannerPopup, { data, onClose: () => {}, ...extra }));

test('Caso 1 — 3 proposals (direct/insertion/alternative): 3 bottoni, mappa nel top-grid', () => {
  const html = render(contract({
    opportunities: [oppFix({ id: 'ins' }), oppFix({ id: 'alt', title: 'Q2', routeZones: ['Q2'], mapPath: ['Q1', 'Q2'], status: 'ajuste', severity: 'warning' })],
    proposals: [
      propFix({ id: 'best', kind: 'direct', label: 'Directa', timeLabel: '15:55', status: 'compatible', rank: 1 }),
      propFix({ id: 'ins', kind: 'insertion', label: 'Q1+Q5 compatible', timeLabel: '16:10', status: 'compatible', rank: 2 }),
      propFix({ id: 'alt', kind: 'alternative', label: 'Q2 alternativa', timeLabel: '16:20', status: 'ajuste', rank: 3 }),
    ],
    serviceLine: [{ id: 'a1', zone: 'Q1', promised: '15:45', pizzas: 2 }],
  }));
  const props = parseProps(html);
  const a = audit(html);
  expect(props).toHaveLength(3);
  expect(props.map((p) => p.title)).toEqual(['Directa', 'Q1+Q5 compatible', 'Q2 alternativa']);
  expect(props.every((p) => !p.empty && !p.disabled)).toBe(true);
  expect(props[0].active).toBe(true); // default selezione = prima proposal
  expect(a.hasMap && a.mapBeforeProps).toBe(true);
  expect(a.hasBestCard).toBe(true);
  expect(a.bestEta).toBe('Entrega 15:55');
  expect(a.hasServiceLine).toBe(true);
});

test('Caso 2 — solo direct: 1 bottone attivo + 2 slot grigi/disabled', () => {
  const html = render(contract({
    opportunities: [],
    proposals: [propFix({ id: 'best', kind: 'direct', label: 'Directa', timeLabel: '15:55', status: 'compatible', rank: 1 })],
  }));
  const props = parseProps(html);
  expect(props).toHaveLength(3);
  expect(props[0].title).toBe('Directa');
  expect(props[0].empty).toBe(false);
  expect(props[1].empty && props[1].disabled).toBe(true);
  expect(props[2].empty && props[2].disabled).toBe(true);
});

test('Caso 3 — not_recommended NON entra nei bottoni primari', () => {
  const html = render(contract({
    opportunities: [oppFix({ id: 'ins' }), oppFix({ id: 'nr', status: 'no_recomendado', severity: 'blocked' })],
    proposals: [
      propFix({ id: 'best', kind: 'direct', label: 'Directa', timeLabel: '15:55', status: 'compatible', rank: 1 }),
      propFix({ id: 'ins', kind: 'insertion', label: 'Q1+Q5 compatible', timeLabel: '16:10', status: 'compatible', rank: 2 }),
      propFix({ id: 'nr', kind: 'not_recommended', label: 'Cruzado', timeLabel: '16:40', status: 'no_recomendado', rank: 3 }),
    ],
  }));
  const props = parseProps(html);
  // 2 primari (direct+insertion) + 1 slot vuoto; not_recommended escluso
  expect(props.filter((p) => !p.empty)).toHaveLength(2);
  expect(props.some((p) => /recomendado/.test(p.status || ''))).toBe(false);
  expect(props.some((p) => p.title === 'Cruzado')).toBe(false);
});

test('Caso 4 — Giros y huecos: righe espandibili con salida→entrega→regreso + Notas', () => {
  const html = render(contract({
    proposals: [propFix({ id: 'best', kind: 'direct', label: 'Directa', timeLabel: '15:55', rank: 1 })],
    serviceLine: [
      { id: 'a1', zone: 'Q1', promised: '15:45', pizzas: 2, salida: '15:33', entrega: '15:45', regreso: '15:57' },
      { id: 'a2', zone: 'Q5', promised: '16:10', pizzas: 1, salida: '15:58', entrega: '16:10', regreso: '16:22' },
    ],
    warnings: [{ message: 'Agrupar Q1+Q5 añade ~13 min pero evita retorno.' }],
  }));
  const a = audit(html);
  const clean = stripStyle(html);
  expect(a.hasServiceLine).toBe(true);
  expect(a.serviceRows).toBe(2); // una fila per giro
  // ogni fila mostra salida/entrega/regreso reali del backend
  expect(clean).toContain('15:33');
  expect(clean).toContain('16:22');
  expect(clean).toContain('Salida');
  expect(clean).toContain('Regreso');
  // collapsed di default → nessuna línea verticale (ppp-rt) finché non si espande
  expect(clean.includes('ppp-rt')).toBe(false);
  expect(a.hasNotes).toBe(true);
  expect(clean).toContain('Agrupar Q1+Q5');
});

test('Caso 5b — sin otros giros: sección presente con empty-state (no desaparece)', () => {
  const html = render(contract({
    proposals: [propFix({ id: 'best', kind: 'direct', label: 'Directa', timeLabel: '15:55', rank: 1 })],
    serviceLine: [],
  }));
  const clean = stripStyle(html);
  expect(clean).toContain('Giros y huecos'); // la sección sigue ahí
  expect(clean).toContain('ppp-sl-empty');
  expect(clean).toContain('No hay otros giros');
  expect(clean.includes('ppp-sl-rows')).toBe(false);
});

test('Caso 5 — Aplicar propuesta: solo se onApplyHora è fornito', () => {
  const data = contract({ proposals: [propFix({ id: 'best', kind: 'direct', label: 'Directa', timeLabel: '15:55', rank: 1 })] });
  const without = audit(render(data));
  const withApply = audit(render(data, { onApplyHora: () => {} }));
  expect(without.hasApply).toBe(false); // niente no-op fantasma
  expect(withApply.hasApply).toBe(true);
});
