// SMOKE READ-ONLY (temporaneo) — valida il mapping dei 3 slot di PremiumPlannerPopup
// rendendolo a HTML statico con contract-fixture. Nessun backend, nessun DB, nessun
// Confirmar, nessun browser. Da eseguire con: CI=true npx react-scripts test --watchAll=false
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PremiumPlannerPopup from './PremiumPlannerPopup';

const CONTRACT = 'premium-planner-strategic-preview-v1';

const RT = (tag) => ({
  timeline: [
    { seq: 1, type: 'departure', zone: 'Q1', eta: '14:55', label: 'Salida pizzería' },
    { seq: 2, type: 'delivery', zone: 'Q2', eta: '15:00', status: 'ok', isNewOrder: true, promised: '15:00' },
    { seq: 3, type: 'return', zone: 'Q1', eta: '15:07', label: 'Regreso' },
  ],
  summary: { directEta: '15:00', giroEta: '15:00', returnEta: '15:07' },
  risk: 'ok',
  operatorMessage: tag,
});

const opp = (over = {}) => ({
  id: 'o',
  kind: 'agregar',
  status: 'compatible',
  severity: 'ok',
  routeEtas: [{ zone: 'Q2', eta: '15:00', slips: false }],
  routeZones: ['Q2'],
  mapPath: ['Q1', 'Q2'],
  channel: 'sur',
  baseline: { directEta: '15:00' },
  capacity: { pizzas: 1, routeMin: 10, limitMin: 30, state: 'ok' },
  title: 'Giro Q2',
  subtitle: 'entrega 15:00',
  routeTimeline: RT('giro'),
  blocked: false,
  ...over,
});

const contract = (over = {}) => ({
  contract: CONTRACT,
  mode: 'read_only',
  opportunities: [],
  firstAvailable: null,
  bestProposal: null,
  serviceLine: [],
  warnings: [],
  blockers: [],
  safety: { readOnly: true, writes: false },
  ...over,
});

// Rimuove il blocco <style> inline (CSS contiene .ppp-detail/.ppp-rt ecc. e
// falserebbe gli scan di stringa) → resta solo il DOM reale.
const stripStyle = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, '');

// ── parser DOM puro sull'HTML statico ───────────────────────────────────────
function parseOptions(rawHtml) {
  const html = stripStyle(rawHtml);
  const out = [];
  const re = /<button\b[^>]*?\bclass="ppp-opt3([^"]*)"([^>]*)>(.*?)<\/button>/gs;
  let m;
  while ((m = re.exec(html)) !== null) {
    const cls = m[1].trim();
    const attrs = m[2];
    const inner = m[3];
    const label = (inner.match(/ppp-opt3-label">([^<]*)</) || [])[1] || '';
    const time = (inner.match(/ppp-opt3-time">([^<]*)</) || [])[1] || null;
    const status = (inner.match(/ppp-opt3-st">([^<]*)</) || [])[1] || null;
    out.push({
      label, time, status,
      empty: /is-empty/.test(cls),
      active: /is-active/.test(cls),
      disabled: /disabled/.test(attrs),
    });
  }
  return out;
}

function detailInfo(rawHtml) {
  const html = stripStyle(rawHtml);
  const i = html.indexOf('ppp-detail');
  const detail = i >= 0 ? html.slice(i) : '';
  return {
    hasDetail: i >= 0,
    // RouteTimeline → section.ppp-rt ; MiniZoneMap → section.ppp-map-card
    rtInDetail: /ppp-rt\b/.test(detail),
    mapInDetail: /ppp-map-card/.test(detail),
    // nessun RouteTimeline/MiniZoneMap PRIMA del dettaglio (non top-level)
    rtBeforeDetail: i >= 0 ? /ppp-rt\b/.test(html.slice(0, i)) : /ppp-rt\b/.test(html),
    mapBeforeDetail: i >= 0 ? /ppp-map-card/.test(html.slice(0, i)) : /ppp-map-card/.test(html),
  };
}

function render(data) {
  return renderToStaticMarkup(React.createElement(PremiumPlannerPopup, { data, onClose: () => {} }));
}

function report(title, opts, det) {
  // eslint-disable-next-line no-console
  console.log(`\n=== ${title} ===`);
  opts.forEach((o) => {
    // eslint-disable-next-line no-console
    console.log(`  [${o.empty ? 'GRIS/disabled' : 'ATTIVO'}${o.active ? ' ·sel' : ''}] "${o.label}"${o.time ? ' · ' + o.time : ''}${o.status ? ' (' + o.status + ')' : ''}${o.disabled ? ' disabled' : ''}`);
  });
  if (det) {
    // eslint-disable-next-line no-console
    console.log(`  detalle: hasDetail=${det.hasDetail} rtInDetail=${det.rtInDetail} mapInDetail=${det.mapInDetail} | rtBeforeDetail=${det.rtBeforeDetail} mapBeforeDetail=${det.mapBeforeDetail}`);
  }
}

test('Caso 1 — direct only: Directa activa, Giro y Alternativa disabled', () => {
  const html = render(contract({
    firstAvailable: { eta: '21:00', status: 'compatible' },
    bestProposal: { id: 'bp', title: 'Directa', severity: 'ok', routeTimeline: RT('directa') },
    opportunities: [],
  }));
  const o = parseOptions(html);
  report('Caso 1 — direct only', o, detailInfo(html));
  const [directa, giro, alt] = o;
  expect(directa.label).toBe('Directa');
  expect(directa.empty).toBe(false);
  expect(directa.active).toBe(true);
  expect(directa.time).toBe('21:00');
  expect(giro.label).toBe('Sin giro compatible');
  expect(giro.empty && giro.disabled).toBe(true);
  expect(alt.label).toBe('Sin alternativa');
  expect(alt.empty && alt.disabled).toBe(true);
});

test('Caso 2 — giro compatible: Giro activo; no_recomendado NO entra en primarios', () => {
  const html = render(contract({
    firstAvailable: { eta: '21:00', status: 'compatible' },
    bestProposal: { id: 'bp', routeTimeline: RT('directa') },
    opportunities: [
      opp({ id: 'g1', kind: 'agregar', status: 'compatible' }),
      opp({ id: 'x1', kind: 'crear', status: 'no_recomendado', severity: 'blocked', blocked: true }),
    ],
  }));
  const o = parseOptions(html);
  report('Caso 2 — giro compatible', o, detailInfo(html));
  const [directa, giro, alt] = o;
  expect(directa.empty).toBe(false);
  expect(giro.label).toBe('Giro compatible');
  expect(giro.empty).toBe(false);
  // la opp no_recomendado/blocked no puede ser ni giro ni alternativa
  expect(alt.label).toBe('Sin alternativa');
  expect(alt.empty && alt.disabled).toBe(true);
  // ninguno de los 3 botones muestra el status no_recomendado
  expect(o.some((b) => (b.status || '').includes('recomendado'))).toBe(false);
});

test('Caso 3 — alternativa: toma la primera opportunity válida no usada como giro', () => {
  const html = render(contract({
    firstAvailable: { eta: '21:00', status: 'compatible' },
    bestProposal: { id: 'bp', routeTimeline: RT('directa') },
    opportunities: [
      opp({ id: 'g1', kind: 'agregar', status: 'compatible' }),
      opp({ id: 'a1', kind: 'crear', status: 'ajuste', severity: 'warning' }),
    ],
  }));
  const o = parseOptions(html);
  report('Caso 3 — alternativa', o, detailInfo(html));
  const [, giro, alt] = o;
  expect(giro.empty).toBe(false);
  expect(alt.label).toBe('Alternativa');
  expect(alt.empty).toBe(false);
  expect(alt.status).toBe('ajuste'); // la a1 ajuste, distinta de la elegida como giro
});

test('Caso 4 — no_recomendado/lleno: nunca como elección primaria', () => {
  const html = render(contract({
    firstAvailable: { eta: '21:00', status: 'compatible' },
    bestProposal: { id: 'bp', routeTimeline: RT('directa') },
    opportunities: [
      opp({ id: 'n1', kind: 'agregar', status: 'no_recomendado', severity: 'blocked', blocked: true }),
      opp({ id: 'l1', kind: 'crear', status: 'lleno', severity: 'blocked', blocked: true }),
    ],
  }));
  const o = parseOptions(html);
  report('Caso 4 — no_recomendado/lleno', o, detailInfo(html));
  const [, giro, alt] = o;
  expect(giro.empty && giro.disabled).toBe(true);
  expect(alt.empty && alt.disabled).toBe(true);
  // ni 'no recomendado' ni 'capacidad llena' aparecen como status de un botón primario
  expect(o.some((b) => /recomendado|llena/.test(b.status || ''))).toBe(false);
});

test('Caso 5 — accordion: RouteTimeline y MiniZoneMap SOLO en el detalle inline', () => {
  // sin firstAvailable → el slot inicial cae en "giro" (que tiene opp) → el detalle
  // renderiza RouteTimeline + MiniZoneMap.
  const html = render(contract({
    firstAvailable: null,
    bestProposal: null,
    opportunities: [opp({ id: 'g1', kind: 'agregar', status: 'compatible' })],
  }));
  const o = parseOptions(html);
  const det = detailInfo(html);
  report('Caso 5 — accordion', o, det);
  expect(det.hasDetail).toBe(true);
  expect(det.rtInDetail).toBe(true);
  expect(det.mapInDetail).toBe(true);
  // no deben existir RouteTimeline ni MiniZoneMap fuera/antes del detalle (no top-level)
  expect(det.rtBeforeDetail).toBe(false);
  expect(det.mapBeforeDetail).toBe(false);
});
