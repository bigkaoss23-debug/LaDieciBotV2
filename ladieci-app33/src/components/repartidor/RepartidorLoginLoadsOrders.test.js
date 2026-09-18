// F-RIDER-1 (2026-09-18 targeted re-UAT) — after a SUCCESSFUL rider PIN login on
// /repartidor, the delivery list must load immediately, not only after a page reload.
//
// Root cause: RepartidorPage authenticates on its own (auth.login -> local
// `repUnlocked`), but the order list it renders is App's `ordenes`, and App only
// fetches orders behind ITS OWN `pinUnlocked` (initialised once from
// auth.isAuthenticated() at mount, otherwise set only by App's own PIN gate). A rider
// who logs in on the cold /repartidor page therefore never triggered getOrdenes and saw
// "Sin entregas" while the backend already had an active trip, until a reload re-ran
// App's initial state with the token already in sessionStorage.
//
// App.jsx had no render harness before this file (see appOrdersAuthBootstrap.static.
// test.js). This one mounts the REAL App + RepartidorPage + real `auth`/`api` code; only
// the network edge (fetch), the realtime socket and the audio are faked, and the fetch
// fake behaves like the backend: 401 on the proxy without a Bearer token.
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/repartidor/RepartidorLoginLoadsOrders.test.js

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

global.IS_REACT_ACT_ENVIRONMENT = true;
jest.setTimeout(20000);

jest.mock('../../sounds', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => () => {} }),
}));

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64')
  .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const makeToken = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
  sub: role, role, sv: 1, exp: Math.floor(Date.now() / 1000) + 3600,
})}.sig`;

const RIDER_ORDER = {
  id: '#010',
  order_uid: '4160605b-6cfe-40d0-8f0b-cb1a3fc8e594',
  nombre: 'TEST-STAGING-REUAT-RIDER',
  // language-guard: allow-legacy existing backend order field/enum (tipo_consegna/DOMICILIO), not new vocabulary
  tipo_consegna: 'DOMICILIO',
  estado: 'EN_ENTREGA',
  totale: 14.5,
  zona: 'Q3',
  direccion: 'Calle Rioja 5, Roquetas de Mar',
  hora: '15:31',
  ts: Date.now(),
  items: [{ n: 'Margherita Classica', q: 1, p: 12, cat: 'Pizzas' }],
};

// The active-trip read the rider page polls (same shape the backend returned live).
const ACTIVE_TRIP = {
  available: true, degraded: false, reason: null, has_active_trip: true,
  trip_id: '8465fa54-8df9-4cf9-9971-d1ce9948692f', trip_state: 'IN_TRIP', giro_id: null,
  members: [{ order_uid: RIDER_ORDER.order_uid, stop_seq: 1, order_id: '#010', estado: 'EN_ENTREGA', zona: 'Q3', andata_min: 8, known: true, completed: false }],
  completed_members: [], outstanding_members: ['#010'],
  stops_total: 1, stops_completed: 0, stops_remaining: 1,
  departed_at: '2026-09-18T13:36:48.395359+00:00', elapsed_min: 5,
  salida: null, salida_source: null, eta_status: 'UNKNOWN', eta_reason: 'NO_ARRIVAL_ESTIMATE_PROVIDER',
  rider_actor: null, rider_known: false, canonical_departed_order_ids: [],
};

let calls;
let loginRole;

function installNetwork() {
  calls = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    const u = String(url);
    const headers = opts.headers || {};
    const bearer = String(headers.Authorization || headers.authorization || '');
    const hasToken = bearer.startsWith('Bearer ') && bearer.length > 'Bearer '.length;
    const action = new URL(u, 'http://localhost').searchParams.get('action');
    calls.push({ url: u, method: opts.method || 'GET', hasToken, action });
    const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

    if (u.includes('/api/auth/v2/login')) {
      return reply(200, { token: makeToken(loginRole), role: loginRole, actor: loginRole });
    }
    if (u.includes('/rest/v1/')) return reply(200, []);
    if (u.includes('/api/proxy')) {
      if (!hasToken) return reply(401, { error: 'INVALID_TOKEN' });
      if (action === 'getOrdenes') return reply(200, [RIDER_ORDER]);
      if (action === 'getManualGiros') return reply(200, []);
      if (action === 'getTripOperationalState') return reply(200, ACTIVE_TRIP);
      return reply(200, {});
    }
    return reply(200, {});
  });
}

class FakeWebSocket {
  constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen(); }, 0); }
  send() {}
  close() { this.readyState = 3; }
}

const App = require('../../App').default;

let root; let container;

async function settle(turns = 8) {
  for (let i = 0; i < turns; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
}

async function mountRiderPath() {
  window.history.pushState({}, '', '/repartidor');
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<App skipSplash />);
  });
  await settle();
}

const buttonByText = (text) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === text);
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

async function typeRiderPinAndEnter() {
  for (const digit of ['2', '4', '6', '8', '1', '3']) {
    // eslint-disable-next-line no-await-in-loop
    await click(buttonByText(digit));
  }
  await click(buttonByText('Entrar'));
  await settle();
}

// The rider page puts its own "Activa las notificaciones" audio gate in front of the
// list once unlocked (same step the rider takes after a reload). Unrelated to the bug:
// the orders must already be in App's state by the time the rider taps it.
async function passAudioGate() {
  const gate = buttonByText('Activar y continuar');
  expect(gate).toBeTruthy();
  await click(gate);
  await settle();
}

const ordersFetchedWithToken = () => calls.filter((c) => c.action === 'getOrdenes' && c.hasToken).length;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  loginRole = 'rider';
  global.WebSocket = FakeWebSocket;
  installNetwork();
});

afterEach(async () => {
  if (root) { await act(async () => { root.unmount(); }); }
  root = null;
  if (container && container.parentNode) container.parentNode.removeChild(container);
  container = null;
  window.history.pushState({}, '', '/');
});

describe('F-RIDER-1 — rider login on /repartidor loads the delivery list without a reload', () => {
  test('cold login as rider with an active giro shows the order immediately', async () => {
    await mountRiderPath();
    // Cold page: no token, the rider PIN gate is what the operator sees.
    expect(container.textContent).toContain('PIN Repartidor');
    expect(ordersFetchedWithToken()).toBe(0);

    await typeRiderPinAndEnter();

    // Login succeeded (the PIN gate is gone)…
    expect(container.textContent).not.toContain('PIN Repartidor');
    await passAudioGate();
    // …the delivery order is on screen right away, no reload in between…
    expect(container.textContent).toContain('TEST-STAGING-REUAT-RIDER');
    expect(container.textContent).not.toContain('Sin entregas');
    // …because the order read really ran, authenticated.
    expect(ordersFetchedWithToken()).toBeGreaterThanOrEqual(1);
  });

  test('control: the reload path (token already in sessionStorage) shows the same order', async () => {
    sessionStorage.setItem('ld_token', makeToken('rider'));
    sessionStorage.setItem('ld_role', 'rider');
    sessionStorage.setItem('ld_actor', 'rider');
    await mountRiderPath();

    expect(container.textContent).not.toContain('PIN Repartidor');
    await passAudioGate();
    expect(container.textContent).toContain('TEST-STAGING-REUAT-RIDER');
    expect(ordersFetchedWithToken()).toBeGreaterThanOrEqual(1);
  });

  test('a non-rider PIN on /repartidor is refused: no session, no order read, gate stays', async () => {
    loginRole = 'admin';
    await mountRiderPath();
    await typeRiderPinAndEnter();

    expect(container.textContent).toContain('PIN Repartidor');
    expect(container.textContent).toContain('PIN incorrecto');
    expect(container.textContent).not.toContain('TEST-STAGING-REUAT-RIDER');
    expect(sessionStorage.getItem('ld_token')).toBeNull();
    expect(ordersFetchedWithToken()).toBe(0);
  });
});
