// S2-7D6E — end-to-end proof of the reported Servicio -> Economía -> back -> Servicio
// loop fix, at the component level: ServiceStateGate mounted for real, with
// api.ensureCurrentServiceSession mocked to return EXACTLY the shape the live staging
// QA scenario produces (a still-open PRANZO session while the wall clock says SERA,
// i.e. LUNCH_SESSION_STILL_ACTIVE with an attached open session). Before S2-7D6E this
// rendered ServiceExceptionPanel with only a "Ver cierre del servicio" escape hatch;
// after it, the normal operational children render directly — no trap, no report page,
// no PRANZO/SERA leak. Same react-dom + act pattern as economiaLedgerGate.test.js and
// currentNightCloseoutBackNav.test.js (this project has no @testing-library).
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/serviceStateGateStillOpenOtherKind.test.js

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

describe('ServiceStateGate — a still-open OTHER-kind session (the live QA scenario) is not a trap', () => {
  test('LUNCH_SESSION_STILL_ACTIVE with an open PRANZO session -> the real operational surface renders, no exception panel', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue({
      success: false, code: 'LUNCH_SESSION_STILL_ACTIVE',
      session: { id: 'qa-session', serviceKind: 'PRANZO', businessDate: '2026-07-27', status: 'open', openedAt: '2026-07-27T12:00:00.000' },
      scheduleState: 'SERA_WINDOW', businessDate: '2026-07-27', _status: 409, _ok: false,
    });

    const { container } = await mount('operator');

    expect(container.querySelector('[data-testid="operational-surface"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="service-exception-landing"]')).toBeNull();
    // The status pill is the one place the session is summarized — must use the
    // Spanish label, never the raw backend token.
    expect(container.textContent).toContain('Servicio de mediodía');
    expect(container.textContent).not.toMatch(/\bPRANZO\b/);
    expect(container.textContent).not.toMatch(/\bSERA\b/);
  });

  test('OTHER_SERVICE_STILL_ACTIVE with an open SERA session -> the real operational surface renders too', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue({
      success: false, code: 'OTHER_SERVICE_STILL_ACTIVE',
      session: { id: 'qa-session-2', serviceKind: 'SERA', businessDate: '2026-07-27', status: 'open', openedAt: '2026-07-27T20:00:00.000' },
      scheduleState: 'PRANZO_WINDOW', businessDate: '2026-07-27', _status: 409, _ok: false,
    });

    const { container } = await mount('admin');

    expect(container.querySelector('[data-testid="operational-surface"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="service-exception-landing"]')).toBeNull();
    expect(container.textContent).toContain('Servicio de noche');
  });

  test('LUNCH_SESSION_STILL_ACTIVE while the conflicting session is itself CLOSING -> still the exception panel (nothing to operate on), never a raw PRANZO/SERA string', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue({
      success: false, code: 'LUNCH_SESSION_STILL_ACTIVE',
      session: { id: 'qa-session-3', serviceKind: 'PRANZO', businessDate: '2026-07-27', status: 'closing', openedAt: '2026-07-27T12:00:00.000' },
      scheduleState: 'SERA_WINDOW', businessDate: '2026-07-27', _status: 409, _ok: false,
    });

    const { container, onCloseout } = await mount('operator');

    expect(container.querySelector('[data-testid="operational-surface"]')).toBeNull();
    expect(container.querySelector('[data-testid="service-exception-landing"]')).toBeTruthy();
    expect(container.textContent).not.toMatch(/\bPRANZO\b/);
    expect(container.textContent).not.toMatch(/\bSERA\b/);
    // The escape hatch to the closeout report is still offered from here.
    const closeoutBtn = container.querySelector('[data-testid="service-exception-closeout-btn"]');
    expect(closeoutBtn).toBeTruthy();
    act(() => { closeoutBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onCloseout).toHaveBeenCalledTimes(1);
  });

  test('a rider never even issues the ensure request, and sees no closeout escape hatch', async () => {
    const { container } = await mount('rider');
    expect(api.ensureCurrentServiceSession).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="service-exception-closeout-btn"]')).toBeNull();
    expect(container.querySelector('[data-testid="service-rider-notice"]')).toBeTruthy();
  });
});
