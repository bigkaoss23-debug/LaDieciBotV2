// S2-7D6E — CurrentNightCloseoutPage's back control must never re-enter Servicio once
// the session it is reporting on is CLOSED: that remounts ServiceStateGate, which
// re-runs the silent ensure, which (for a still-conflicting session) used to land right
// back here — the reported Servicio -> Economía -> back -> Servicio loop. Component-level
// coverage (react-dom + test-utils, same pattern as economiaLedgerGate.test.js), mocking
// api.js so no real network call happens.
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/currentNightCloseoutBackNav.test.js

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../api', () => ({
  __esModule: true,
  api: {
    getCurrentServiceCloseout: jest.fn(),
    openServiceSession: jest.fn(),
  },
}));

import CurrentNightCloseoutPage from './CurrentNightCloseoutPage';
import { api } from '../api';

const BASE = {
  available: true, businessDate: '2026-07-27', openedAt: '2026-07-27T12:00:00.000', closedAt: null,
  counts: { tickets: 3 }, totals: { gross: 30, collected: 30, unpaid: 0, refunded: 0, difference: 0 },
  paymentTotals: {}, tickets: [], serviceKind: 'PRANZO',
};

async function mount(data) {
  api.getCurrentServiceCloseout.mockReset().mockResolvedValue(data);
  api.openServiceSession.mockReset();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const onBack = jest.fn();
  const onReturnHome = jest.fn();
  let root;
  await act(async () => {
    root = createRoot(container);
    root.render(<CurrentNightCloseoutPage onBack={onBack} onReturnHome={onReturnHome} role="admin" actor="tester" />);
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return { container, onBack, onReturnHome };
}

function clickButton(container, testId) {
  const btn = container.querySelector(`[data-testid="${testId}"]`);
  expect(btn).toBeTruthy();
  act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('CurrentNightCloseoutPage — back control depends on whether the session is closed', () => {
  test('CLOSED session -> "Volver al menú principal", never re-enters Servicio', async () => {
    const { container, onBack, onReturnHome } = await mount({ ...BASE, status: 'closed', closedAt: '2026-07-27T18:05:00.000' });

    expect(container.textContent).toContain('Volver al menú principal');
    expect(container.querySelector('[data-testid="closeout-back-btn"]')).toBeNull();

    clickButton(container, 'closeout-home-btn');
    expect(onReturnHome).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
  });

  test('OPEN session (e.g. reached via the escape hatch) -> "← Servicio", not the home button', async () => {
    const { container, onBack, onReturnHome } = await mount({ ...BASE, status: 'open' });

    expect(container.textContent).toContain('← Servicio');
    expect(container.querySelector('[data-testid="closeout-home-btn"]')).toBeNull();

    clickButton(container, 'closeout-back-btn');
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onReturnHome).not.toHaveBeenCalled();
  });

  test('CLOSING session -> still "← Servicio" (not yet a final report)', async () => {
    const { container } = await mount({ ...BASE, status: 'closing' });
    expect(container.textContent).toContain('← Servicio');
    expect(container.querySelector('[data-testid="closeout-home-btn"]')).toBeNull();
  });

  test('no session at all (available:false) -> "← Servicio" fallback, not stranded', async () => {
    const { container } = await mount({ available: false });
    expect(container.textContent).toContain('← Servicio');
    expect(container.querySelector('[data-testid="closeout-home-btn"]')).toBeNull();
  });

  test('never renders the internal PRANZO/SERA token on this page either', async () => {
    const { container } = await mount({ ...BASE, status: 'closed', serviceKind: 'PRANZO' });
    expect(container.textContent).not.toMatch(/\bPRANZO\b/);
    expect(container.textContent).not.toMatch(/\bSERA\b/);
  });
});
