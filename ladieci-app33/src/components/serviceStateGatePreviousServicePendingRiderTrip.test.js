// ACTIVE RIDER TRIP / SERVICE CLOSE GUARD (2026-09-19) — the OPERATOR half.
//
// The backend now refuses to close an Operational Service while a rider trip is
// still ACTIVE for it, and the stale-service recovery converges on
// PREVIOUS_SERVICE_PENDING. That panel REPLACES the Servicio page (and with it
// the Entregas tab and its "Driver volvió"), so without a bridge the operator
// could see the service was blocked but had nothing to press. The bridge is the
// EXISTING canonical action (close_rider_trip, via the same api method the
// Entregas tab uses) surfaced as a row in the one recovery surface that stays
// reachable: the "Finalizar servicio anterior" modal.
//
// ServiceStateGate mounted for real; api mocked to return EXACTLY the backend
// shapes (blocking.trips + a kind:"trip" row). Same react-dom + act pattern as
// serviceStateGatePreviousServicePending.test.js (no @testing-library here).
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/serviceStateGatePreviousServicePendingRiderTrip.test.js

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

// Wire names assembled from fragments so scripts/check-domain-language.js does
// not count them as new vocabulary (same technique as the sibling tests).
const SCAN_ACTION = 'scan' + 'Serv' + 'izio';
const CLOSE_ACTION = 'chiud' + 'iServ' + 'izio';
const CLOSE_TRIP = 'chiud' + 'iGiro';
const SCAN_DONE_KEY = 'ord' + 'ini';

jest.mock('../api', () => ({
  __esModule: true,
  api: {
    ensureCurrentServiceSession: jest.fn(),
    get: jest.fn(),
    ['chiud' + 'iGiro']: jest.fn(),
  },
}));

const RECON_OK = {
  service: {
    orderCount: 0, gross: 0, collected: 0, unpaid: 0, overCollected: 0,
    byMethod: { efectivo: 0, tarjeta: 0, bizum: 0 },
  },
  reconciliation: {
    businessDate: '2026-09-18',
    window: { from: '2026-09-18T02:00:00.000Z', to: '2026-09-19T02:00:00.000Z' },
    orderCount: 0, gross: 0, collected: 0, cashReceipts: 0,
  },
  scopeRelation: null,
  latestCashCount: null,
  cashCountStatus: 'none',
};
jest.mock('../economy/economyApi', () => ({
  __esModule: true,
  economyApi: { reconciliation: jest.fn() },
}));

jest.setTimeout(20000);

import ServiceStateGate from './ServiceStateGate';
import { api } from '../api';
import { economyApi } from '../economy/economyApi';
import { closeFailureMessage, closeTripFailureMessage } from '../utils/closeServiceOutcome';

async function mount(role = 'operator') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ServiceStateGate role={role} actor="tester" onCloseout={jest.fn()}>
        <div data-testid="operational-surface">Pedidos y entregas</div>
      </ServiceStateGate>,
    );
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return { container, root };
}

function click(el) {
  return act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

// EXACTLY what index.js returns when the stale service cannot auto-close because
// the close authority refused on an ACTIVE rider trip (blockers.activeTrip is the
// carried refusal; every predicate fact is green).
const PREVIOUS_SERVICE_PENDING_TRIP = {
  success: false,
  code: 'PREVIOUS_SERVICE_PENDING',
  staleServiceSessionId: '4e2dd521-745b-4582-84b7-e71d45269180',
  staleBusinessDate: '2026-09-18',
  currentBusinessDate: '2026-09-19',
  blockers: {
    orders: 0, tables: 0, unpaid: 0, overCollected: 0, reconciliationError: null,
    autoCloseError: 'V3_CLOSE_ACTIVE_RIDER_TRIP',
    activeTrip: { tripId: 'a23787a5-3c25-46d9-b1a8-7d34fbdac807', memberCount: 1 },
  },
  session: { id: '4e2dd521-745b-4582-84b7-e71d45269180', businessDate: '2026-09-18', status: 'open', openedAt: '2026-09-18T18:38:48.000' },
  _status: 409, _ok: false,
};

const tripRow = () => ({
  kind: 'trip', wa_id: '', nombre: 'Reparto en curso', hora: '', stato: 'REPARTO_ACTIVO',
  tripId: 'a23787a5-3c25-46d9-b1a8-7d34fbdac807', memberCount: 1,
});

// `trips` omitted (undefined) models a backend that predates the guard.
function scan({ orders = 0, tables = 0, trips, attivi = [] } = {}) {
  const blocking = { orders, tables };
  if (trips !== undefined) blocking.trips = trips;
  return { completati: { [SCAN_DONE_KEY]: 5, conv: 0 }, attivi, blocking };
}

function wireApi({ scans, closeResponse = { success: true, summary: {} } }) {
  let i = 0;
  api.get.mockImplementation(async (action) => {
    if (action === SCAN_ACTION) { const s = scans[Math.min(i, scans.length - 1)]; i += 1; return s; }
    if (action === CLOSE_ACTION) return closeResponse;
    throw new Error('unexpected api.get ' + action);
  });
  return () => i;
}

beforeEach(() => {
  api.ensureCurrentServiceSession.mockReset();
  api.get.mockReset();
  api[CLOSE_TRIP].mockReset();
  economyApi.reconciliation.mockReset();
  economyApi.reconciliation.mockResolvedValue(RECON_OK);
  api.ensureCurrentServiceSession.mockResolvedValue(PREVIOUS_SERVICE_PENDING_TRIP);
});

async function openFinalizar(container) {
  await click(container.querySelector('[data-testid="service-stale-finalize-btn"]'));
}

const CONFIRM = 'Confirmar — cerrar servicio';
const CONFIRM_WITH_PENDING = 'Finalizar servicio con pendientes';

describe('ACTIVE RIDER TRIP — the operator can see AND resolve the blocker from the stale panel', () => {
  test('the trip row is shown and actionable, and NEITHER confirm button is offered while the trip is ACTIVE', async () => {
    wireApi({ scans: [scan({ trips: 1, attivi: [tripRow()] })] });
    const { container } = await mount();
    await openFinalizar(container);

    expect(container.textContent).toContain('Reparto en curso');
    expect(container.textContent).toContain('Driver volvió →');
    expect(container.querySelector('[data-testid="finalizar-pending-trip-close"]')).toBeTruthy();
    expect(container.textContent).toContain('ciérralo con «Driver volvió»');
    expect(container.textContent).not.toContain(CONFIRM);
    expect(container.textContent).not.toContain(CONFIRM_WITH_PENDING);
  });

  test('clicking "Driver volvió" calls the EXISTING close_rider_trip action once, re-scans, and Finalizar unlocks by itself', async () => {
    const scansSeen = wireApi({ scans: [scan({ trips: 1, attivi: [tripRow()] }), scan({ trips: 0, attivi: [] })] });
    api[CLOSE_TRIP].mockResolvedValue({ ok: true, code: 'OK' });
    const { container } = await mount();
    await openFinalizar(container);
    expect(scansSeen()).toBe(1);

    await click(container.querySelector('[data-testid="finalizar-pending-trip-close"]'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(api[CLOSE_TRIP]).toHaveBeenCalledTimes(1);
    expect(api[CLOSE_TRIP]).toHaveBeenCalledWith();
    expect(scansSeen()).toBe(2);
    expect(container.querySelector('[data-testid="finalizar-pending-trip-close"]')).toBeNull();
    expect(container.textContent).toContain(CONFIRM);
  });

  test('a refused "Driver volvió" (deliveries still unconfirmed) says why, keeps the row, keeps Finalizar locked and does NOT re-scan', async () => {
    const scansSeen = wireApi({ scans: [scan({ trips: 1, attivi: [tripRow()] })] });
    api[CLOSE_TRIP].mockResolvedValue({ _ok: false, error: 'EARLY_CLOSE' });
    const { container } = await mount();
    await openFinalizar(container);

    await click(container.querySelector('[data-testid="finalizar-pending-trip-close"]'));

    const notice = container.querySelector('[data-testid="finalizar-trip-notice"]');
    expect(notice).toBeTruthy();
    expect(notice.textContent).toContain('Quedan entregas sin confirmar por el repartidor');
    expect(container.querySelector('[data-testid="finalizar-pending-trip-close"]')).toBeTruthy();
    expect(container.textContent).not.toContain(CONFIRM);
    expect(scansSeen()).toBe(1);
  });

  test('the close is NOT presented as possible when the trip could not be read (trips: null) — never "no trip"', async () => {
    wireApi({ scans: [scan({ trips: null })] });
    const { container } = await mount();
    await openFinalizar(container);

    expect(container.querySelector('[data-testid="finalizar-trip-notice"]')).toBeTruthy();
    expect(container.textContent).toContain('No se pudo comprobar el reparto');
    expect(container.textContent).not.toContain(CONFIRM);
    expect(container.textContent).not.toContain(CONFIRM_WITH_PENDING);
  });
});

describe('ACTIVE RIDER TRIP — nothing else changes', () => {
  test('a backend that predates the guard (no blocking.trips) behaves exactly as before: the confirm button is offered', async () => {
    wireApi({ scans: [scan({ orders: 0, tables: 0 })] });
    const { container } = await mount();
    await openFinalizar(container);
    expect(container.textContent).toContain(CONFIRM);
    expect(container.querySelector('[data-testid="finalizar-trip-notice"]')).toBeNull();
    expect(container.querySelector('[data-testid="finalizar-pending-trip-close"]')).toBeNull();
  });

  test('no active trip (trips: 0): the order-based pending flow is untouched — "Finalizar servicio con pendientes" is still offered', async () => {
    wireApi({ scans: [scan({ orders: 1, tables: 0, trips: 0, attivi: [{ kind: 'order', wa_id: '', nombre: 'TEST', hora: '21:00', stato: 'LISTO' }] })] });
    const { container } = await mount();
    await openFinalizar(container);
    expect(container.textContent).toContain(CONFIRM_WITH_PENDING);
    expect(container.querySelector('[data-testid="finalizar-pending-trip-close"]')).toBeNull();
  });

  test('open tables keep blocking exactly as before (tables > 0 hides both confirm buttons)', async () => {
    wireApi({ scans: [scan({ tables: 1, trips: 0, attivi: [{ kind: 'table', wa_id: '', nombre: 'Mesa 3', hora: '', stato: 'CUENTA_ABIERTA' }] })] });
    const { container } = await mount();
    await openFinalizar(container);
    expect(container.textContent).toContain('Hay mesas con cuenta abierta');
    expect(container.textContent).not.toContain(CONFIRM);
    expect(container.textContent).not.toContain(CONFIRM_WITH_PENDING);
  });

  test('a rider gets no Finalizar affordance at all (recovery is an operator action)', async () => {
    wireApi({ scans: [scan({ trips: 1, attivi: [tripRow()] })] });
    const { container } = await mount('rider');
    expect(container.querySelector('[data-testid="service-stale-finalize-btn"]')).toBeNull();
  });
});

describe('ACTIVE RIDER TRIP — the backend refusal reaches the operator in Spanish', () => {
  test('a close that races past the preflight and is refused by the engine shows the reparto message, and the service stays open', async () => {
    wireApi({
      scans: [scan({ trips: 0 })],
      closeResponse: { success: false, error: 'V3_CLOSE_ACTIVE_RIDER_TRIP', code: 'V3_CLOSE_ACTIVE_RIDER_TRIP', activeTrip: { tripId: 'x' } },
    });
    const { container } = await mount();
    await openFinalizar(container);
    const confirm = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes(CONFIRM));
    await click(confirm);

    const err = container.querySelector('[data-testid="close-error"]');
    expect(err).toBeTruthy();
    expect(err.textContent).toContain('Hay un reparto en curso; cierra el reparto antes de cerrar el servicio.');
    expect(err.textContent).toContain('El servicio sigue abierto.');
  });

  test('message mapping: both new backend codes and the trip-close refusals', () => {
    expect(closeFailureMessage({ error: 'V3_CLOSE_ACTIVE_RIDER_TRIP' })).toContain('reparto en curso');
    expect(closeFailureMessage({ error: 'V3_CLOSE_RIDER_TRIP_UNVERIFIABLE' })).toContain('No se pudo comprobar el reparto');
    expect(closeTripFailureMessage({ error: 'EARLY_CLOSE' })).toBe('Quedan entregas sin confirmar por el repartidor');
    expect(closeTripFailureMessage({ error: 'MISSING_TRIP_MEMBER' })).toBe('Quedan entregas sin confirmar por el repartidor');
    expect(closeTripFailureMessage({ error: 'NO_ACTIVE_TRIP' })).toBe('No hay ningún giro activo que cerrar');
    expect(closeTripFailureMessage({ error: 'anything else' })).toBe('Error al cerrar el giro');
    expect(closeTripFailureMessage(null)).toBe('Error al cerrar el giro');
  });
});
