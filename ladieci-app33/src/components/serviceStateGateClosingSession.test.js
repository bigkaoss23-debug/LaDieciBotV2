// P0-C1 — RUNTIME LIFECYCLE AUTHORITY + AVAILABILITY CONTAINMENT.
//
// Component-level proof of the availability fix, mirroring
// serviceStateGateStillOpenOtherKind.test.js's exact pattern: ServiceStateGate
// mounted for real, api.ensureCurrentServiceSession mocked to return the exact
// shape the live 2026-08-10 incident produced (SERVICE_SESSION_CLOSING with a
// real, attached session — see SERVICE_LIFECYCLE_ECONOMIC_BOUNDARY_AUDIT_
// REPORT.md §7 / P0_C1_RUNTIME_LIFECYCLE_AUTHORITY_REPORT.md). Before P0-C1
// this rendered ServiceExceptionPanel — "El servicio se está cerrando" — with
// a "Reintentar" that always looped back to the identical exception, taking
// Mesa/Cocina/Listos/Teléfono/Banco/Entregas ALL offline for as long as the
// close attempt stayed stuck. After it, the real operational children (which
// contain every one of those tabs — see App.jsx, ServicioPage wraps them all)
// render directly, with lifecycle truth preserved on the status pill.
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/serviceStateGateClosingSession.test.js

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
        <div data-testid="operational-surface">
          <div data-testid="tab-mesa">Mesa</div>
          <div data-testid="tab-cocina">Cocina</div>
          <div data-testid="tab-listos">Listos</div>
          <div data-testid="tab-telefono">Teléfono</div>
          <div data-testid="tab-banco">Banco</div>
          <div data-testid="tab-entregas">Entregas</div>
        </div>
      </ServiceStateGate>,
    );
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return { container, onCloseout };
}

beforeEach(() => { api.ensureCurrentServiceSession.mockReset(); });

describe('ServiceStateGate — a session mid-close does not take the whole Servicio app offline (P0-C1, the 2026-08-10 incident shape)', () => {
  test('SERVICE_SESSION_CLOSING with a real session -> the full operational surface renders, no blocking exception', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue({
      success: false, code: 'SERVICE_SESSION_CLOSING',
      session: { id: '9746dfdd-closing', serviceKind: 'PRANZO', businessDate: '2026-08-10', status: 'closing', openedAt: '2026-08-10T08:07:41.000' },
      scheduleState: 'SERA_WINDOW', businessDate: '2026-08-10', _status: 409, _ok: false,
    });

    const { container } = await mount('operator');

    // The whole shell — every tab, not just one board — is reachable.
    expect(container.querySelector('[data-testid="operational-surface"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tab-mesa"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tab-cocina"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tab-listos"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tab-telefono"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tab-banco"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tab-entregas"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="service-exception-landing"]')).toBeNull();

    // Lifecycle truth: the pill says the service is closing, not "Abierto".
    // S-E — the pill's own label is unconditionally neutral now (S-D).
    expect(container.textContent).toContain('Servicio');
    expect(container.textContent).toContain('Cerrando');
    expect(container.textContent).not.toContain('Abierto');
    expect(container.textContent).not.toMatch(/\bPRANZO\b/);
    expect(container.textContent).not.toMatch(/\bSERA\b/);
  });

  test('SERVICE_SESSION_CLOSING with no session at all still shows the exception panel, with a working Reintentar (true integrity gap, correctly not hidden)', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue({
      success: false, code: 'SERVICE_SESSION_CLOSING',
      session: null,
      scheduleState: 'SERA_WINDOW', businessDate: '2026-08-10', _status: 409, _ok: false,
    });

    const { container } = await mount('operator');

    expect(container.querySelector('[data-testid="operational-surface"]')).toBeNull();
    expect(container.querySelector('[data-testid="service-exception-landing"]')).toBeTruthy();
    const retryBtn = container.querySelector('[data-testid="service-exception-retry-btn"]');
    expect(retryBtn).toBeTruthy();
  });

  test('a rider never even issues the ensure request for a closing session, same as any other outcome', async () => {
    const { container } = await mount('rider');
    expect(api.ensureCurrentServiceSession).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="service-rider-notice"]')).toBeTruthy();
  });
});
