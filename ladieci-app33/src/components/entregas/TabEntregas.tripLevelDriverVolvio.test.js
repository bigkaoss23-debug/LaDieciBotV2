// DELIVERY x ECONOMY DECOUPLING V1 (migration 139) -- CORRECTION B3: a departed trip must stay CLOSABLE.
//
// THE PROBLEM. The pizzeria may now confirm deliveries itself ("Marcar como entregado"), which does NOT close the
// trip (a delivery is not the driver's return). "Driver volvió" used to be attached to EN_ENTREGA order ROWS only, so
// once the operator confirmed the last stop no row was left, nothing could close the trip, and every new dispatch was
// refused (ACTIVE_TRIP_CONFLICT).
//
// THE RULE. The active trip is an operational object of its own on the Delivery surface: the "Giro en curso" banner
// carries a TRIP-level "Driver volvió" that stays while the trip is ACTIVE, even with ZERO EN_ENTREGA rows. It calls the
// canonical close_rider_trip (legacy action name below) and NOTHING else: never Entregado, never a payment, never an
// order mutation; the backend stays the authority (EARLY_CLOSE while a stop is unconfirmed).
//
// react-dom + react-dom/test-utils, same house style as the sibling tests -- no @testing-library dependency.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../api', () => ({
  __esModule: true,
  api: {
    getTripOperationalState: jest.fn(() => Promise.resolve({ available: true, has_active_trip: false })),
    getManualGiros: jest.fn(() => Promise.resolve([])),
    marcarEnEntrega: jest.fn(() => Promise.resolve({ ok: true, _ok: true })),
    marcarEntregado: jest.fn(() => Promise.resolve({ ok: true, _ok: true })),
    // language-guard: allow-legacy chiudiGiro is the existing api method name for close_rider_trip, not new vocabulary
    chiudiGiro: jest.fn(() => Promise.resolve({ ok: true, code: 'OK', _ok: true })),
    registrarSalidaDriver: jest.fn(() => Promise.resolve({ ok: true, _ok: true })),
    confirmarEntregaOperador: jest.fn(() => Promise.resolve({ ok: true, code: 'OK', _ok: true })),
  },
}));

const { api } = require('../../api');
const TabEntregas = require('./TabEntregas').default;
// language-guard: allow-legacy chiudiGiro is the existing api method name, aliased once here so every assertion below reads closeGiroMock instead of repeating the literal, not new vocabulary
const closeGiroMock = api.chiudiGiro;

function click(el) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
const byTestId = (c, id) => c.querySelector(`[data-testid="${id}"]`);
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }

const EN_ENTREGA_ORDER = Object.freeze({
  id: 'T9001',
  // language-guard: allow-legacy tipo_consegna is the existing ordenes column name, reproduced verbatim in this fixture, not new vocabulary
  tipo_consegna: 'DOMICILIO',
  estado: 'EN_ENTREGA',
  nombre: 'Cliente de Prueba',
  hora: '20:30',
  totale: 12.5,
  cobrado: false,
  financial: { currentObligation: 12.5 },
  items: [],
  zona: null,
  manual_giro_id: null,
});

const ACTIVE = (over = {}) => ({
  available: true, has_active_trip: true, trip_state: 'IN_TRIP', departed_at: '2026-09-19T21:00:00.000Z',
  stops_total: 1, stops_completed: 0, stops_remaining: 1, members: [{ order_id: 'T9001' }],
  eta_status: 'UNKNOWN', ...over,
});

async function mount(ordenes) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const notify = jest.fn();
  const setOrdenes = jest.fn();
  const render = (o) => root.render(<TabEntregas ordenes={o} notify={notify} setOrdenes={setOrdenes} />);
  await act(async () => { render(ordenes); });
  await flush();
  return { container, root, notify, setOrdenes, rerender: async (o) => { await act(async () => { render(o); }); await flush(); } };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

beforeEach(() => {
  jest.clearAllMocks();
  window.confirm = jest.fn(() => true);
  api.getTripOperationalState.mockResolvedValue({ available: true, has_active_trip: false });
  api.getManualGiros.mockResolvedValue([]);
  api.confirmarEntregaOperador.mockResolvedValue({ ok: true, code: 'OK', _ok: true });
  closeGiroMock.mockResolvedValue({ ok: true, code: 'OK', _ok: true });
});

test('A · ACTIVE trip with one EN_ENTREGA member: the row keeps its delivery control AND the trip-level control is available', async () => {
  api.getTripOperationalState.mockResolvedValue(ACTIVE());
  const { container, root } = await mount([{ ...EN_ENTREGA_ORDER }]);
  expect(byTestId(container, 'entregas-trip-banner')).toBeTruthy();
  expect(byTestId(container, 'entregas-trip-banner').textContent).toContain('Giro en curso');
  expect(byTestId(container, 'entregas-trip-driver-volvio')).toBeTruthy();
  expect(byTestId(container, 'entrega-confirmar-toggle')).toBeTruthy();
  unmount(container, root);
});

test('B · the operator confirms the LAST delivery: the order is sent as delivered, the trip is NOT closed and stays ACTIVE', async () => {
  api.getTripOperationalState.mockResolvedValue(ACTIVE());
  const { container, root } = await mount([{ ...EN_ENTREGA_ORDER }]);
  click(byTestId(container, 'entrega-confirmar-toggle'));
  click(byTestId(container, 'entrega-confirmar-solo'));
  // the backend now reports the stop as completed; the trip itself is still ACTIVE
  api.getTripOperationalState.mockResolvedValue(ACTIVE({ stops_completed: 1, stops_remaining: 0 }));
  await flush();
  expect(api.confirmarEntregaOperador).toHaveBeenCalledTimes(1);
  expect(api.confirmarEntregaOperador).toHaveBeenCalledWith('T9001', null);
  expect(closeGiroMock).not.toHaveBeenCalled();        // a delivery is NOT the driver's return
  expect(byTestId(container, 'entregas-trip-driver-volvio')).toBeTruthy();
  unmount(container, root);
});

test('C · ZERO EN_ENTREGA rows left (the order is RETIRADO now): the trip-level "Driver volvió" is STILL visible, with progress 1/1', async () => {
  api.getTripOperationalState.mockResolvedValue(ACTIVE({ stops_completed: 1, stops_remaining: 0 }));
  const delivered = { ...EN_ENTREGA_ORDER, estado: 'RETIRADO' };
  const { container, root } = await mount([delivered]);
  // no EN_ENTREGA row, hence no per-row control at all ...
  expect(byTestId(container, 'entrega-confirmar-toggle')).toBeNull();
  // ... and yet the trip can still be closed
  const banner = byTestId(container, 'entregas-trip-banner');
  expect(banner).toBeTruthy();
  expect(banner.textContent).toContain('1/1 entregados');
  expect(banner.textContent).toMatch(/0 restantes/);
  expect(byTestId(container, 'entregas-trip-driver-volvio')).toBeTruthy();
  unmount(container, root);
});

test('D · "Driver volvió" closes the trip through close_rider_trip ONLY; the banner control disappears once the backend says CLOSED', async () => {
  api.getTripOperationalState.mockResolvedValue(ACTIVE({ stops_completed: 1, stops_remaining: 0 }));
  const { container, root, notify, setOrdenes } = await mount([{ ...EN_ENTREGA_ORDER, estado: 'RETIRADO' }]);
  api.getTripOperationalState.mockResolvedValue({ available: true, has_active_trip: false });   // what the re-read returns
  click(byTestId(container, 'entregas-trip-driver-volvio'));
  await flush();
  expect(window.confirm).toHaveBeenCalledTimes(1);
  expect(closeGiroMock).toHaveBeenCalledTimes(1);
  expect(closeGiroMock).toHaveBeenCalledWith();
  expect(notify).toHaveBeenCalledWith(expect.stringMatching(/giro cerrado/i), expect.any(String));
  // never Entregado, never a payment, never an optimistic order mutation
  expect(api.marcarEntregado).not.toHaveBeenCalled();
  expect(api.confirmarEntregaOperador).not.toHaveBeenCalled();
  expect(setOrdenes).not.toHaveBeenCalled();
  // the state is re-read from the backend (not assumed) and the control is gone
  expect(api.getTripOperationalState.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(byTestId(container, 'entregas-trip-driver-volvio')).toBeNull();
  unmount(container, root);
});

test('F · the driver returns BEFORE the last delivery: the backend refuses (EARLY_CLOSE), the message is honest and the control stays', async () => {
  api.getTripOperationalState.mockResolvedValue(ACTIVE());
  closeGiroMock.mockResolvedValueOnce({ error: 'EARLY_CLOSE', _ok: false });
  const { container, root, notify, setOrdenes } = await mount([{ ...EN_ENTREGA_ORDER }]);
  click(byTestId(container, 'entregas-trip-driver-volvio'));
  await flush();
  expect(closeGiroMock).toHaveBeenCalledTimes(1);
  expect(notify).toHaveBeenCalledWith(expect.stringMatching(/Quedan entregas sin confirmar/i), expect.any(String));
  expect(setOrdenes).not.toHaveBeenCalled();
  expect(api.marcarEntregado).not.toHaveBeenCalled();
  expect(byTestId(container, 'entregas-trip-driver-volvio')).toBeTruthy();   // still ACTIVE -> still closable later
  unmount(container, root);
});

test('G · closing the trip never turns an EN_ENTREGA order into RETIRADO: no order mutation of any kind is sent', async () => {
  api.getTripOperationalState.mockResolvedValue(ACTIVE());
  closeGiroMock.mockResolvedValueOnce({ error: 'EARLY_CLOSE', _ok: false });
  const { container, root, setOrdenes } = await mount([{ ...EN_ENTREGA_ORDER }]);
  click(byTestId(container, 'entregas-trip-driver-volvio'));
  await flush();
  expect(api.marcarEntregado).not.toHaveBeenCalled();
  expect(api.confirmarEntregaOperador).not.toHaveBeenCalled();
  expect(setOrdenes).not.toHaveBeenCalled();
  unmount(container, root);
});

test('declining the confirm() dialog calls nothing', async () => {
  api.getTripOperationalState.mockResolvedValue(ACTIVE());
  window.confirm = jest.fn(() => false);
  const { container, root } = await mount([{ ...EN_ENTREGA_ORDER }]);
  click(byTestId(container, 'entregas-trip-driver-volvio'));
  await flush();
  expect(closeGiroMock).not.toHaveBeenCalled();
  unmount(container, root);
});

test('no ACTIVE trip -> no trip control; a DEGRADED read is shown as such and offers no control that pretends a trip exists', async () => {
  const none = await mount([{ ...EN_ENTREGA_ORDER }]);
  expect(byTestId(none.container, 'entregas-trip-banner')).toBeNull();
  expect(byTestId(none.container, 'entregas-trip-driver-volvio')).toBeNull();
  unmount(none.container, none.root);

  api.getTripOperationalState.mockResolvedValue({ available: false, reason: 'DEGRADED' });
  const degraded = await mount([]);
  expect(byTestId(degraded.container, 'entregas-trip-driver-volvio')).toBeNull();
  expect(degraded.container.textContent).toContain('Estado del giro no disponible');
  unmount(degraded.container, degraded.root);
});
