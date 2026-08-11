// MOBILE_SHELL_POLISH_01 — ServiceStateGate's new hideStatusChrome prop, used
// only by the Mesa phone shell (ServicioPage -> App.jsx) so its own compact
// header isn't crowded by the global service-status pill and pending-incidents
// banner. Same react-dom + act mount pattern as
// serviceStateGateStillOpenOtherKind.test.js (this project has no
// @testing-library) — reuses that file's own known-good READY-phase mock shape.
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/serviceStateGateHideStatusChrome.test.js

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

const READY_RESPONSE = {
  success: false, code: 'LUNCH_SESSION_STILL_ACTIVE',
  session: { id: 'qa-session', serviceKind: 'PRANZO', businessDate: '2026-07-27', status: 'open', openedAt: '2026-07-27T12:00:00.000' },
  scheduleState: 'SERA_WINDOW', businessDate: '2026-07-27', _status: 409, _ok: false,
};

async function mount(hideStatusChrome) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root;
  const props = hideStatusChrome === undefined ? {} : { hideStatusChrome };
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ServiceStateGate role="admin" actor="tester" onCloseout={jest.fn()} {...props}>
        <div data-testid="operational-surface">Mesa phone shell</div>
      </ServiceStateGate>,
    );
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return { container };
}

beforeEach(() => {
  api.ensureCurrentServiceSession.mockReset();
  api.ensureCurrentServiceSession.mockResolvedValue(READY_RESPONSE);
});

describe('ServiceStateGate — hideStatusChrome', () => {
  test('defaults to showing the status pill and children both (no prop passed -- every pre-existing caller)', async () => {
    const { container } = await mount(undefined);
    expect(container.querySelector('[data-testid="service-open-status"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="operational-surface"]')).toBeTruthy();
  });

  test('hideStatusChrome=false is the same as not passing it at all', async () => {
    const { container } = await mount(false);
    expect(container.querySelector('[data-testid="service-open-status"]')).toBeTruthy();
  });

  test('hideStatusChrome=true hides the status pill but still renders children normally', async () => {
    const { container } = await mount(true);
    expect(container.querySelector('[data-testid="service-open-status"]')).toBeNull();
    expect(container.querySelector('[data-testid="operational-surface"]')).toBeTruthy();
  });

  test('hideStatusChrome=true does not stop the underlying ensure/recheck call -- only the chrome is suppressed, not the lifecycle truth', async () => {
    await mount(true);
    expect(api.ensureCurrentServiceSession).toHaveBeenCalledTimes(1);
  });
});
