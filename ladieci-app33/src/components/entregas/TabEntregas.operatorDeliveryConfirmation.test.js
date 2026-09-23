// DELIVERY x ECONOMY DECOUPLING (migration 139, 2026-09-19) -- the operator's "Marcar como entregado".
//
// The pizzeria can confirm, from the operator Delivery surface, that the customer received the order -- with or
// without the payment -- WITHOUT entering /repartidor. It is the SEPARATE action confirmarEntregaOperador, recorded
// as the OPERATOR (never as the rider), and it means "the customer received it", NOT "the driver is back" (that stays
// the operational "Driver volvió", proven untouched in TabEntregas.driverVueltaClosesTripNotDelivery.test.js).
//
// The client never computes an amount (`full` mode: the backend derives it from the canonical obligation), never
// mutates the order's estado (the list refreshes from the backend), and a refused payment says plainly that NOTHING
// was recorded (the delivery + payment are one transaction).
//
// react-dom + react-dom/test-utils, same house style as the sibling test -- no @testing-library dependency.
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
const { describeDeliveryConfirmError } = require('./deliveryConfirmationMessages');
// language-guard: allow-legacy chiudiGiro is the existing api method name, aliased once here so every assertion below reads closeGiroMock instead of repeating the literal, not new vocabulary
const closeGiroMock = api.chiudiGiro;

function click(el) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
const byTestId = (c, id) => c.querySelector(`[data-testid="${id}"]`);
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

const BASE_ORDER = Object.freeze({
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

async function mount(ordenes) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const notify = jest.fn();
  const setOrdenes = jest.fn();
  await act(async () => { root.render(<TabEntregas ordenes={ordenes} notify={notify} setOrdenes={setOrdenes} />); });
  await flush();
  return { container, root, notify, setOrdenes };
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

test('the control exists only for an EN_ENTREGA order, opens a chooser, and nothing is sent until an option is picked', async () => {
  const { container, root } = await mount([{ ...BASE_ORDER }, { ...BASE_ORDER, id: 'T9002', estado: 'LISTO' }]);
  const toggles = container.querySelectorAll('[data-testid="entrega-confirmar-toggle"]');
  expect(toggles).toHaveLength(1);
  expect(toggles[0].textContent).toContain('Marcar como entregado');
  expect(byTestId(container, 'entrega-confirmar-panel')).toBeNull();

  click(toggles[0]);
  expect(byTestId(container, 'entrega-confirmar-panel')).toBeTruthy();
  expect(byTestId(container, 'entrega-confirmar-panel').textContent).toContain('Total 12.50€ · aún sin cobrar');
  expect(api.confirmarEntregaOperador).not.toHaveBeenCalled();

  click(byTestId(container, 'entrega-confirmar-cancelar'));
  expect(byTestId(container, 'entrega-confirmar-panel')).toBeNull();
  expect(api.confirmarEntregaOperador).not.toHaveBeenCalled();
  unmount(container, root);
});

test('"Solo entregado": delivery only -- no payment object, no rider action, no trip close, no client-side state mutation', async () => {
  const { container, root, notify, setOrdenes } = await mount([{ ...BASE_ORDER }]);
  click(byTestId(container, 'entrega-confirmar-toggle'));
  click(byTestId(container, 'entrega-confirmar-solo'));
  await flush();

  expect(api.confirmarEntregaOperador).toHaveBeenCalledTimes(1);
  expect(api.confirmarEntregaOperador).toHaveBeenCalledWith('T9001', null);
  expect(api.marcarEntregado).not.toHaveBeenCalled();
  expect(closeGiroMock).not.toHaveBeenCalled();
  expect(setOrdenes).not.toHaveBeenCalled();
  expect(notify).toHaveBeenCalledWith(expect.stringMatching(/Entrega confirmada/), expect.any(String));
  expect(byTestId(container, 'entrega-confirmar-panel')).toBeNull();
  unmount(container, root);
});

test.each([['efectivo'], ['tarjeta'], ['bizum']])('"Entregado y cobrado · %s": ONE call, full mode, a fresh clientRequestId, and the client sends NO amount', async (method) => {
  const { container, root, notify } = await mount([{ ...BASE_ORDER }]);
  click(byTestId(container, 'entrega-confirmar-toggle'));
  click(byTestId(container, `entrega-confirmar-${method}`));
  await flush();

  expect(api.confirmarEntregaOperador).toHaveBeenCalledTimes(1);
  const [id, payment] = api.confirmarEntregaOperador.mock.calls[0];
  expect(id).toBe('T9001');
  expect(Object.keys(payment).sort()).toEqual(['clientRequestId', 'method', 'mode']);
  expect(payment.method).toBe(method);
  expect(payment.mode).toBe('full');
  expect(payment.clientRequestId).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  expect(notify).toHaveBeenCalledWith(expect.stringContaining(`cobro ${method}`), expect.any(String));
  unmount(container, root);
});

test('an order whose cobro is already registered offers ONLY "Solo entregado" (no second payment can be started from here)', async () => {
  const { container, root } = await mount([{ ...BASE_ORDER, cobrado: true }]);
  click(byTestId(container, 'entrega-confirmar-toggle'));
  expect(byTestId(container, 'entrega-confirmar-panel').textContent).toContain('El cobro ya está registrado');
  expect(byTestId(container, 'entrega-confirmar-solo')).toBeTruthy();
  for (const m of ['efectivo', 'tarjeta', 'bizum']) expect(byTestId(container, `entrega-confirmar-${m}`)).toBeNull();
  unmount(container, root);
});

test('a refusal says what happened in plain Spanish and never optimistically mutates the order', async () => {
  api.confirmarEntregaOperador.mockResolvedValueOnce({ error: 'PAYMENT_REFUSED', payment_code: 'ORDER_PAYMENT_NO_OPEN_SERVICE', _ok: false, _status: 409 });
  const { container, root, notify, setOrdenes } = await mount([{ ...BASE_ORDER }]);
  click(byTestId(container, 'entrega-confirmar-toggle'));
  click(byTestId(container, 'entrega-confirmar-efectivo'));
  await flush();

  expect(notify).toHaveBeenCalledWith(expect.stringMatching(/no tiene un servicio asociado.*No se registró nada/), expect.any(String));
  expect(setOrdenes).not.toHaveBeenCalled();
  unmount(container, root);
});

test('the copy dictionary: typed codes map to Spanish; an unknown code never leaks raw backend text', () => {
  expect(describeDeliveryConfirmError({ error: 'INVALID_STATE' })).toMatch(/ya no está en reparto/);
  expect(describeDeliveryConfirmError({ error: 'DELIVERY_LOST_RACE' })).toMatch(/No se registró nada/);
  expect(describeDeliveryConfirmError({ error: 'AUTH_FORBIDDEN_ROLE' })).toMatch(/Tu rol/);
  expect(describeDeliveryConfirmError({ error: 'PAYMENT_REFUSED', payment_code: 'ORDER_PAYMENT_POSSIBLE_DUPLICATE' })).toMatch(/idéntico/);
  expect(describeDeliveryConfirmError({ error: 'PAYMENT_REFUSED', payment_code: 'SOMETHING_NEW' })).toBe('No se pudo registrar el cobro. No se registró nada.');
  expect(describeDeliveryConfirmError({ error: 'select * from secrets' })).toBe('No se pudo confirmar la entrega. Actualiza e inténtalo de nuevo.');
  expect(describeDeliveryConfirmError(null)).toBe('No se pudo confirmar la entrega. Actualiza e inténtalo de nuevo.');
});

test('api.js: the client method posts exactly the action, the id and (only when given) the payment', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'api.js'), 'utf8');
  expect(src).toMatch(/confirmarEntregaOperador: function\(id, payment\) \{\s*return proxyPost\(payment \? \{ action:'confirmarEntregaOperador', id, payment \} : \{ action:'confirmarEntregaOperador', id \}\);/);
  // the rider's own action is untouched
  expect(src).toMatch(/marcarEntregado: function\(id, _cobradoIgnorato, _ordenData, metodo_pago\)/);
});
