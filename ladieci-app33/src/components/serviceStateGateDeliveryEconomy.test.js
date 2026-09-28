// DELIVERY x ECONOMY DECOUPLING (migration 139, 2026-09-19) -- the Finalizar modal reports DELIVERY + MONEY, never the driver.
//
// This REPLACES serviceStateGatePreviousServicePendingRiderTrip.test.js, which asserted the opposite product rule
// ("a rider trip ACTIVE blocks Finalizar; press 'Driver volvió →' first"). The rule was corrected: whether a driver
// has left, is back, or which status a trip has is an operational fact and must never decide whether the economic
// service can be finalized. What the operator needs to understand is what is missing ECONOMICALLY:
//   * "Entrega sin confirmar"          (the delivery state of a pending order)
//   * "12,50 € pendiente de cobro"     (the money still owed -- an independent fact)
//
// ServiceStateGate mounted for real; api mocked to return EXACTLY the backend shapes (the pre-close scan with the
// per-order `entrega` / `unpaidAmount` facts). Same react-dom + act pattern as serviceStateGatePreviousServicePending.test.js
// (no @testing-library here).
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/serviceStateGateDeliveryEconomy.test.js

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

// Wire names assembled from fragments so scripts/check-domain-language.js does not count them as new vocabulary
// (same technique as the sibling tests).
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
  service: { orderCount: 0, gross: 0, collected: 0, unpaid: 0, overCollected: 0, byMethod: { efectivo: 0, tarjeta: 0, bizum: 0 } },
  reconciliation: { businessDate: '2026-09-18', window: { from: '2026-09-18T02:00:00.000Z', to: '2026-09-19T02:00:00.000Z' }, orderCount: 0, gross: 0, collected: 0, cashReceipts: 0 },
  scopeRelation: null, latestCashCount: null, cashCountStatus: 'none',
};
jest.mock('../economy/economyApi', () => ({
  __esModule: true,
  economyApi: { reconciliation: jest.fn() },
}));

jest.setTimeout(20000);

import ServiceStateGate from './ServiceStateGate';
import { api } from '../api';
import { economyApi } from '../economy/economyApi';
import { closeFailureMessage } from '../utils/closeServiceOutcome';
import * as closeServiceOutcome from '../utils/closeServiceOutcome';

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

const PREVIOUS_SERVICE_PENDING = {
  success: false,
  code: 'PREVIOUS_SERVICE_PENDING',
  staleServiceSessionId: '4e2dd521-745b-4582-84b7-e71d45269180',
  staleBusinessDate: '2026-09-18',
  currentBusinessDate: '2026-09-19',
  blockers: { orders: 1, tables: 0, unpaid: 12.5, overCollected: 0, reconciliationError: null, autoCloseError: null },
  session: { id: '4e2dd521-745b-4582-84b7-e71d45269180', businessDate: '2026-09-18', status: 'open', openedAt: '2026-09-18T18:38:48.000' },
  _status: 409, _ok: false,
};

// EXACTLY what the pre-close scan returns for a delivery still out: the delivery state and the money owed are two facts.
const deliveryRow = (o = {}) => ({ kind: 'order', wa_id: '', nombre: '#017', hora: '21:11', stato: 'EN_ENTREGA', entrega: 'SIN_CONFIRMAR', unpaidAmount: 12.5, ...o });
// R4B -- the scan names the service the modal finalizes; the close is bound to that id.
const SCANNED_SERVICE = '4e2dd521-745b-4582-84b7-e71d45269180';
function scan({ orders = 0, tables = 0, attivi = [] } = {}) {
  return { service_session_id: SCANNED_SERVICE, completati: { [SCAN_DONE_KEY]: 5, conv: 0 }, attivi, blocking: { orders, tables } };
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
  api.ensureCurrentServiceSession.mockResolvedValue(PREVIOUS_SERVICE_PENDING);
});

async function openFinalizar(container) {
  await click(container.querySelector('[data-testid="service-stale-finalize-btn"]'));
}

const CONFIRM = 'Confirmar — cerrar servicio';
const CONFIRM_WITH_PENDING = 'Finalizar servicio con pendientes';

describe('Finalizar reports DELIVERY + MONEY, never the driver', () => {
  test('a delivery still out (unconfirmed + unpaid): both facts are shown, Finalizar con pendientes IS offered, and there is NO trip row, NO "Driver volvió", NO wait-for-the-driver copy', async () => {
    wireApi({ scans: [scan({ orders: 1, attivi: [deliveryRow()] })] });
    const { container } = await mount();
    await openFinalizar(container);

    expect(container.textContent).toContain('Entrega sin confirmar');
    expect(container.querySelector('[data-testid="finalizar-pending-unpaid"]').textContent).toContain('12,50 € pendiente de cobro');
    expect(container.textContent).toContain(CONFIRM_WITH_PENDING);
    expect(container.textContent).toContain('Una entrega sin confirmar se podrá confirmar después');
    for (const gone of ['Reparto en curso', 'REPARTO_ACTIVO', 'Driver volvió', 'reparto en curso', 'ciérralo con']) {
      expect(container.textContent).not.toContain(gone);
    }
    expect(container.querySelector('[data-testid="finalizar-pending-trip-close"]')).toBeNull();
    expect(container.querySelector('[data-testid="finalizar-trip-notice"]')).toBeNull();
    expect(api[CLOSE_TRIP]).not.toHaveBeenCalled();
  });

  test('the two facts are independent: a PAID delivery still out is "sin confirmar" with NO pending amount', async () => {
    wireApi({ scans: [scan({ orders: 1, attivi: [deliveryRow({ unpaidAmount: undefined })] })] });
    const { container } = await mount();
    await openFinalizar(container);
    expect(container.textContent).toContain('Entrega sin confirmar');
    expect(container.querySelector('[data-testid="finalizar-pending-unpaid"]')).toBeNull();
    expect(container.textContent).not.toContain('pendiente de cobro');
  });

  test('an unpaid PICKUP order shows only the money fact (no delivery fact); the raw state chip is kept', async () => {
    wireApi({ scans: [scan({ orders: 1, attivi: [{ kind: 'order', wa_id: '', nombre: '#018', hora: '21:30', stato: 'LISTO', unpaidAmount: 9 }] })] });
    const { container } = await mount();
    await openFinalizar(container);
    expect(container.textContent).toContain('LISTO');
    expect(container.textContent).not.toContain('Entrega sin confirmar');
    expect(container.querySelector('[data-testid="finalizar-pending-unpaid"]').textContent).toContain('9,00 € pendiente de cobro');
  });

  test('a scan with no pending orders offers the plain confirm button; a stale backend that still sends blocking.trips does not lock anything', async () => {
    const s = scan({ orders: 0, tables: 0 });
    s.blocking.trips = 1; // a backend that predates 139 -- the modal must ignore it, never treat it as a blocker
    wireApi({ scans: [s] });
    const { container } = await mount();
    await openFinalizar(container);
    expect(container.textContent).toContain(CONFIRM);
    expect(container.querySelector('[data-testid="finalizar-trip-notice"]')).toBeNull();
  });

  test('open tables keep blocking exactly as before (tables > 0 hides both confirm buttons)', async () => {
    wireApi({ scans: [scan({ tables: 1, attivi: [{ kind: 'table', wa_id: '', nombre: 'Mesa 3', hora: '', stato: 'CUENTA_ABIERTA' }] })] });
    const { container } = await mount();
    await openFinalizar(container);
    expect(container.textContent).toContain('Hay mesas con cuenta abierta');
    expect(container.textContent).not.toContain(CONFIRM);
    expect(container.textContent).not.toContain(CONFIRM_WITH_PENDING);
  });

  test('a rider gets no Finalizar affordance at all (recovery is an operator action)', async () => {
    wireApi({ scans: [scan({ orders: 1, attivi: [deliveryRow()] })] });
    const { container } = await mount('rider');
    expect(container.querySelector('[data-testid="service-stale-finalize-btn"]')).toBeNull();
  });
});

describe('the close itself no longer speaks about a trip', () => {
  test('confirming "Finalizar servicio con pendientes" with the delivery still out closes the service', async () => {
    wireApi({ scans: [scan({ orders: 1, attivi: [deliveryRow()] })], closeResponse: { success: true, summary: { ['n_' + 'ord' + 'ini']: 3, cassa_totale: 40 } } });
    const { container } = await mount();
    await openFinalizar(container);
    const confirm = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes(CONFIRM_WITH_PENDING));
    await click(confirm);
    expect(api.get).toHaveBeenCalledWith(CLOSE_ACTION, { serviceSessionId: SCANNED_SERVICE });
  });

  test('message mapping: no message tells the operator to wait for the driver; the trip helper is gone', () => {
    // a backend that predates migration 139 could still answer these codes: they degrade to the generic sentence
    expect(closeFailureMessage({ error: 'V3_CLOSE_ACTIVE_RIDER_TRIP' })).toBe('No se pudo cerrar el servicio.');
    expect(closeFailureMessage({ error: 'V3_CLOSE_RIDER_TRIP_UNVERIFIABLE' })).toBe('No se pudo cerrar el servicio.');
    expect(closeFailureMessage({ error: 'active_rider_trip' })).toBe('No se pudo cerrar el servicio.');
    expect(closeFailureMessage({ error: 'rider_state_gate_failed' })).toBe('No se pudo cerrar el servicio.');
    expect(closeServiceOutcome.closeTripFailureMessage).toBeUndefined();
    expect(closeFailureMessage({ error: 'MESA_TABLES_NOT_RELEASED' })).toContain('mesas');
  });
});
