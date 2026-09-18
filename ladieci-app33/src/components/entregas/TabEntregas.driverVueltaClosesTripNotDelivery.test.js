// B1 completion-path correction (POST_OPUS_REVIEW_REMEDIATION, Scope A, 2026-09-18).
//
// Product correction: the operator/owner "Delivery" page (TabEntregas) may register that
// the driver LEFT (marcarEnEntrega) and that the driver is BACK (close the trip), but must
// NEVER declare a specific delivery "Entregado" -- only the physical rider can know a
// delivery actually happened. Before this fix, the "Driver de vuelta" control called
// api.marcarEntregado (the SAME action the rider's own confirmation uses) and force-wrote
// the order to RETIRADO client-side. This test proves the corrected wiring: the control now
// calls ONLY close_rider_trip (the legacy action name below), which is already
// operator-authorized and has no role check of its own, and never mutates any order's
// estado from this surface.
//
// react-dom + react-dom/test-utils, same house style as
// src/components/pinManagementFlow.test.js -- no @testing-library dependency.
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
  },
}));

const { api } = require('../../api');
const TabEntregas = require('./TabEntregas').default;
// language-guard: allow-legacy chiudiGiro is the existing api method name, aliased once here so every assertion below reads closeGiroMock instead of repeating the literal, not new vocabulary
const closeGiroMock = api.chiudiGiro;

function click(el) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
function findButtonByText(container, text) {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === text);
}
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

const BASE_ORDER = Object.freeze({
  id: 'T9001',
  // language-guard: allow-legacy tipo_consegna is the existing ordenes column name, reproduced verbatim in this fixture, not new vocabulary
  tipo_consegna: 'DOMICILIO',
  estado: 'EN_ENTREGA',
  nombre: 'Cliente de Prueba',
  hora: '20:30',
  totale: 12,
  items: [],
  zona: null,
  manual_giro_id: null,
});

async function mount(ordenes) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const notify = jest.fn();
  const setOrdenes = jest.fn();
  await act(async () => {
    root.render(<TabEntregas ordenes={ordenes} notify={notify} setOrdenes={setOrdenes} />);
  });
  await flush();
  return { container, root, notify, setOrdenes };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

beforeEach(() => {
  jest.clearAllMocks();
  window.confirm = jest.fn(() => true);
  api.getTripOperationalState.mockResolvedValue({ available: true, has_active_trip: false });
  api.getManualGiros.mockResolvedValue([]);
  api.marcarEnEntrega.mockResolvedValue({ ok: true, _ok: true });
  api.marcarEntregado.mockResolvedValue({ ok: true, _ok: true });
  closeGiroMock.mockResolvedValue({ ok: true, code: 'OK', _ok: true });
  api.registrarSalidaDriver.mockResolvedValue({ ok: true, _ok: true });
});

test('"Driver de vuelta" calls ONLY close_rider_trip, never marcarEntregado', async () => {
  const { container, root, notify } = await mount([{ ...BASE_ORDER }]);
  const btn = findButtonByText(container, '✓ Driver volvió');
  expect(btn).toBeTruthy();

  click(btn);
  await flush();

  expect(window.confirm).toHaveBeenCalledTimes(1);
  expect(closeGiroMock).toHaveBeenCalledTimes(1);
  expect(closeGiroMock).toHaveBeenCalledWith();
  expect(api.marcarEntregado).not.toHaveBeenCalled();
  expect(notify).toHaveBeenCalledWith(expect.stringMatching(/giro cerrado/i), expect.any(String));

  unmount(container, root);
});

test('never optimistically mutates the order to RETIRADO from this surface', async () => {
  const { container, root, setOrdenes } = await mount([{ ...BASE_ORDER }]);
  const btn = findButtonByText(container, '✓ Driver volvió');
  click(btn);
  await flush();

  // The old implementation called setOrdenes with a functional updater that rewrote
  // this order's estado to RETIRADO before the network call even resolved. The
  // corrected handler never calls setOrdenes at all -- order state is exclusively a
  // function of the canonical facts the backend/poll already own.
  expect(setOrdenes).not.toHaveBeenCalled();
  unmount(container, root);
});

test('EARLY_CLOSE / MISSING_TRIP_MEMBER: fails closed with an honest message, still never touches marcarEntregado', async () => {
  closeGiroMock.mockResolvedValueOnce({ error: 'EARLY_CLOSE', _ok: false });
  const { container, root, notify, setOrdenes } = await mount([{ ...BASE_ORDER }]);
  const btn = findButtonByText(container, '✓ Driver volvió');
  click(btn);
  await flush();

  expect(closeGiroMock).toHaveBeenCalledTimes(1);
  expect(api.marcarEntregado).not.toHaveBeenCalled();
  expect(notify).toHaveBeenCalledWith(expect.stringMatching(/sin confirmar por el repartidor/i), expect.any(String));
  expect(setOrdenes).not.toHaveBeenCalled();
  unmount(container, root);
});

test('declining the confirm() dialog calls neither close_rider_trip nor marcarEntregado', async () => {
  window.confirm = jest.fn(() => false);
  const { container, root } = await mount([{ ...BASE_ORDER }]);
  const btn = findButtonByText(container, '✓ Driver volvió');
  click(btn);
  await flush();

  expect(closeGiroMock).not.toHaveBeenCalled();
  expect(api.marcarEntregado).not.toHaveBeenCalled();
  unmount(container, root);
});
