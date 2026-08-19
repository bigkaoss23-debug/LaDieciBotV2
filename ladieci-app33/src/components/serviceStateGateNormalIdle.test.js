// POST F-10 UX CORRECTION — end-to-end proof of the 2026-08-19 fix, at the
// component level: ServiceStateGate mounted for real, with
// api.ensureCurrentServiceSession mocked to return the two F-7 read-only
// codes. NO_OPEN_SERVICE (normal idle — no Operational Service has ever
// existed for the current Business Day) must render the real operational
// surface directly, with no status pill (there is no session to summarize)
// and no exception panel. REOPEN_REQUIRED must NOT receive the same
// treatment — it stays a blocking, typed exception, because the current
// read-only contract cannot distinguish a true same-day explicit-reopen
// requirement from a stale, non-today canonical Business Day pointer (see
// the long comment on the classifyEnsureAttempt intercept in
// serviceEnsureOutcome.js). Same react-dom + act pattern as
// serviceStateGateStillOpenOtherKind.test.js (this project has no
// @testing-library).
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/serviceStateGateNormalIdle.test.js

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../api', () => ({
  __esModule: true,
  api: { ensureCurrentServiceSession: jest.fn() },
}));

import ServiceStateGate from './ServiceStateGate';
import { api } from '../api';

async function mount(role) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const onCloseout = jest.fn();
  let root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ServiceStateGate role={role} actor="tester" onCloseout={onCloseout}>
        <div data-testid="operational-surface">Entregas y pedidos</div>
      </ServiceStateGate>,
    );
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return { container, onCloseout };
}

beforeEach(() => { api.ensureCurrentServiceSession.mockReset(); });

describe('ServiceStateGate — normal idle (NO_OPEN_SERVICE) is transparent, not an incident', () => {
  test('NO_OPEN_SERVICE -> the real operational surface renders directly, no exception panel', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue({
      success: false, code: 'NO_OPEN_SERVICE', session: null,
      businessDate: '2026-08-19', _status: 200, _ok: true,
    });

    const { container } = await mount('operator');

    expect(container.querySelector('[data-testid="operational-surface"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="service-exception-landing"]')).toBeNull();
    expect(container.querySelector('[data-testid="service-gate-loading"]')).toBeNull();
  });

  test('NO_OPEN_SERVICE -> no status pill (nothing to summarize — no fake "Abierto")', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue({
      success: false, code: 'NO_OPEN_SERVICE', session: null,
      businessDate: '2026-08-19', _status: 200, _ok: true,
    });

    const { container } = await mount('admin');

    expect(container.querySelector('[data-testid="service-open-status"]')).toBeNull();
  });

  test('NO_OPEN_SERVICE -> never shows the old blocking copy', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue({
      success: false, code: 'NO_OPEN_SERVICE', session: null,
      businessDate: '2026-08-19', _status: 200, _ok: true,
    });

    const { container } = await mount('operator');

    expect(container.textContent).not.toMatch(/no hay ning[uú]n servicio abierto/i);
    expect(container.textContent).not.toMatch(/estado del servicio no disponible/i);
    expect(container.textContent).not.toMatch(/ver cierre del servicio/i);
  });

  test('navigation itself never calls anything but the idempotent ensure read — no service is created merely by mounting the gate', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue({
      success: false, code: 'NO_OPEN_SERVICE', session: null,
      businessDate: '2026-08-19', _status: 200, _ok: true,
    });

    await mount('operator');

    expect(api.ensureCurrentServiceSession).toHaveBeenCalledTimes(1);
  });

  test('a rider never even issues the ensure request for normal idle either', async () => {
    const { container } = await mount('rider');
    expect(api.ensureCurrentServiceSession).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="service-rider-notice"]')).toBeTruthy();
  });
});

describe('ServiceStateGate — REOPEN_REQUIRED is NOT given the same treatment', () => {
  test('REOPEN_REQUIRED still blocks with the typed exception panel, same-day reopen semantics preserved', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue({
      success: false, code: 'REOPEN_REQUIRED', session: null,
      businessDate: '2026-08-16', _status: 200, _ok: true,
    });

    const { container, onCloseout } = await mount('admin');

    expect(container.querySelector('[data-testid="operational-surface"]')).toBeNull();
    const panel = container.querySelector('[data-testid="service-exception-landing"]');
    expect(panel).toBeTruthy();
    expect(container.textContent).toMatch(/no hay ning[uú]n servicio abierto/i);

    const closeoutBtn = container.querySelector('[data-testid="service-exception-closeout-btn"]');
    expect(closeoutBtn).toBeTruthy();
    act(() => { closeoutBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onCloseout).toHaveBeenCalledTimes(1);
  });

  test('REOPEN_REQUIRED still offers Reintentar', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue({
      success: false, code: 'REOPEN_REQUIRED', session: null,
      businessDate: '2026-08-16', _status: 200, _ok: true,
    });

    const { container } = await mount('operator');
    expect(container.querySelector('[data-testid="service-exception-retry-btn"]')).toBeTruthy();
  });
});
