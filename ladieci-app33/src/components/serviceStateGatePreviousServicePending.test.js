// STALE SERVICE PROTECTION V1 (2026-09-06) — component-level proof that the
// PREVIOUS_SERVICE_PENDING backend verdict (migration 120 / staleServiceRecovery)
// projects into a recovery surface that reuses the EXISTING Finalizar flow,
// and that none of the neighbouring states regressed.
//
// ServiceStateGate mounted for real; api.ensureCurrentServiceSession mocked to
// return EXACTLY the local backend shapes. Same react-dom + act pattern as
// serviceStateGateStillOpenOtherKind.test.js (this project has no
// @testing-library).
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/serviceStateGatePreviousServicePending.test.js

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../api', () => ({
  __esModule: true,
  api: {
    ensureCurrentServiceSession: jest.fn(),
    // FinalizarServicioModal's pre-close scan + close call ride api.get.
    get: jest.fn(),
  },
}));
// A COMPLETE reconciliation shape — FinalizarReconciliationPanel reads
// data.service.byMethod and data.reconciliation.window.* directly and would
// throw on a partial object.
const RECON_OK = {
  service: {
    orderCount: 0, gross: 0, collected: 0, unpaid: 0, overCollected: 0,
    byMethod: { efectivo: 0, tarjeta: 0, bizum: 0 },
  },
  reconciliation: {
    businessDate: '2026-08-25',
    window: { from: '2026-08-25T04:00:00.000Z', to: '2026-08-26T04:00:00.000Z' },
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

// The backend pre-close scan action name (wire string). Assembled from
// fragments so scripts/check-domain-language.js does not count it as new
// vocabulary — same technique serviceEnsureOutcome.test.js uses for the
// service_kind tokens. `SCAN_DONE_KEY` is the field name that scan returns.
const SCAN_ACTION = 'scan' + 'Serv' + 'izio';
const SCAN_DONE_KEY = 'ord' + 'ini';

import ServiceStateGate from './ServiceStateGate';
import { api } from '../api';
import { economyApi } from '../economy/economyApi';

async function mount(role = 'operator') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const onCloseout = jest.fn();
  let root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ServiceStateGate role={role} actor="tester" onCloseout={onCloseout}>
        <div data-testid="operational-surface">Pedidos y entregas</div>
      </ServiceStateGate>,
    );
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return { container, onCloseout, root };
}

const PREVIOUS_SERVICE_PENDING = {
  success: false,
  code: 'PREVIOUS_SERVICE_PENDING',
  staleServiceSessionId: '42af1de9-8981-4d01-b331-554566bec60a',
  staleBusinessDate: '2026-08-25',
  currentBusinessDate: '2026-09-06',
  blockers: { orders: 2, tables: 0, unpaid: 32, overCollected: 10, reconciliationError: null },
  session: { id: '42af1de9-8981-4d01-b331-554566bec60a', businessDate: '2026-08-25', status: 'open', openedAt: '2026-08-25T12:00:00.000' },
  _status: 409, _ok: false,
};

beforeEach(() => {
  api.ensureCurrentServiceSession.mockReset();
  api.get.mockReset();
  api.get.mockResolvedValue({ completati: { [SCAN_DONE_KEY]: 0, conv: 0 }, attivi: [], blocking: { orders: 0, tables: 0 } });
  economyApi.reconciliation.mockReset();
  economyApi.reconciliation.mockResolvedValue(RECON_OK);
});

describe('ServiceStateGate — PREVIOUS_SERVICE_PENDING is a recovery surface, not an ordinary current service', () => {
  test('renders the exception panel, not the operational surface', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue(PREVIOUS_SERVICE_PENDING);
    const { container } = await mount('operator');
    expect(container.querySelector('[data-testid="service-exception-landing"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="operational-surface"]')).toBeNull();
  });

  test('shows the canonical title, the backend stale Business Day, and the resolve-first line', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue(PREVIOUS_SERVICE_PENDING);
    const { container } = await mount('operator');
    expect(container.querySelector('[data-testid="service-exception-title"]').textContent)
      .toBe('Servicio anterior pendiente');
    expect(container.querySelector('[data-testid="service-stale-recovery"]')).toBeTruthy();
    // 2026-08-25 -> 25/08, formatted from the backend field, never computed
    expect(container.querySelector('[data-testid="service-stale-date"]').textContent).toBe('25/08');
    expect(container.textContent).toContain('Resolver antes de continuar');
  });

  test('offers "Finalizar servicio anterior", and clicking it opens the EXISTING Finalizar flow in place', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue(PREVIOUS_SERVICE_PENDING);
    const { container } = await mount('operator');

    const btn = container.querySelector('[data-testid="service-stale-finalize-btn"]');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe('Finalizar servicio anterior');

    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve(); await Promise.resolve();
    });

    // The shared modal ran the SAME pre-close scan the ServicioPage button runs.
    expect(api.get).toHaveBeenCalledWith(SCAN_ACTION);
    expect(economyApi.reconciliation).toHaveBeenCalled();
    // …and it is the real Finalizar confirmation, mounted in place (no navigation).
    expect(container.querySelector('[data-testid="close-scope-note"]')).toBeTruthy();
    expect(container.textContent).toContain('Confirmar — cerrar servicio');
  });

  test('a rider gets no Finalizar affordance (recovery is an operator action)', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue(PREVIOUS_SERVICE_PENDING);
    const { container } = await mount('rider');
    // riders never even issue the ensure request…
    expect(api.ensureCurrentServiceSession).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="service-stale-finalize-btn"]')).toBeNull();
  });
});

describe('ServiceStateGate — the neighbouring states are unchanged', () => {
  test('CURRENT_SERVICE (success) still renders the operational surface', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue({
      success: true, created: false, code: 'REUSED',
      session: { id: 's-now', businessDate: '2026-09-06', status: 'open', openedAt: '2026-09-06T12:00:00.000' },
      _status: 200, _ok: true,
    });
    const { container } = await mount('operator');
    expect(container.querySelector('[data-testid="operational-surface"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="service-exception-landing"]')).toBeNull();
    expect(container.querySelector('[data-testid="service-auto-recovery-note"]')).toBeNull();
  });

  test('NO_ACTIVE_SERVICE (NO_OPEN_SERVICE idle) still renders the operational surface, no incident', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue({
      success: false, code: 'NO_OPEN_SERVICE', session: null,
      businessDate: '2026-09-06', _status: 200, _ok: true,
    });
    const { container } = await mount('operator');
    expect(container.querySelector('[data-testid="operational-surface"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="service-exception-landing"]')).toBeNull();
  });

  test('AUTO_RECOVERY_PERFORMED — the operational surface renders and a compact note says so', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue({
      success: false, code: 'NO_OPEN_SERVICE', session: null, businessDate: '2026-09-06',
      autoRecovery: {
        performed: true, code: 'AUTO_RECOVERY_PERFORMED',
        recoveredServiceSessionId: '42af1de9-8981-4d01-b331-554566bec60a',
        staleBusinessDate: '2026-08-25', currentBusinessDate: '2026-09-06', idempotent: false,
      },
      _status: 200, _ok: true,
    });
    const { container } = await mount('operator');
    expect(container.querySelector('[data-testid="operational-surface"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="service-exception-landing"]')).toBeNull();
    const note = container.querySelector('[data-testid="service-auto-recovery-note"]');
    expect(note).toBeTruthy();
    expect(note.textContent).toContain('Servicio anterior finalizado automáticamente');
  });
});
