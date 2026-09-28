// STALE PAYMENT MIRROR (H2) -- the REAL TabEntregas decides whether "Entregado y cobrado" exists from the backend's
// canonical settlement (financial.outstanding), not from the cobrado mirror, and its toast never claims a collection
// the backend did not record.
//
// react-dom + react-dom/test-utils, same house style as TabEntregas.operatorDeliveryConfirmation.test.js.
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

function click(el) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
const byTestId = (c, id) => c.querySelector(`[data-testid="${id}"]`);
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

const order = (financial, o = {}) => ({
  id: 'T7001',
  // language-guard: allow-legacy tipo_consegna is the existing ordenes column name, reproduced verbatim in this fixture, not new vocabulary
  tipo_consegna: 'DOMICILIO', estado: 'EN_ENTREGA', nombre: 'Cliente', hora: '20:30', totale: 100,
  cobrado: false, ya_pagado: false, items: [], zona: null, manual_giro_id: null, financial, ...o,
});
const fin = (o) => ({ orderUid: 'u', originalObligation: 100, currentObligation: 60, commercialAdjustment: -40, obligationRevision: 2, adjustable: true,
  netCollected: 60, outstanding: 0, overCollected: 0, payState: 'paid', legacyPaymentConflict: false, ...o });

async function openPanel(o) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const notify = jest.fn();
  await act(async () => { root.render(<TabEntregas ordenes={[o]} notify={notify} setOrdenes={jest.fn()} />); });
  await flush();
  click(byTestId(container, 'entrega-confirmar-toggle'));
  const done = () => { act(() => { root.unmount(); }); container.remove(); };
  return { container, notify, done, panel: byTestId(container, 'entrega-confirmar-panel') };
}
const paymentButtons = (c) => ['efectivo', 'tarjeta', 'bizum'].map((m) => byTestId(c, `entrega-confirmar-${m}`)).filter(Boolean);

beforeEach(() => {
  jest.clearAllMocks();
  api.getTripOperationalState.mockResolvedValue({ available: true, has_active_trip: false });
  api.getManualGiros.mockResolvedValue([]);
});

test('A: settled after an adjustment (cobrado=false, outstanding 0) -> no "Entregado y cobrado", no "aún sin cobrar"', async () => {
  const { container, panel, done } = await openPanel(order(fin()));
  expect(panel.textContent).toContain('El cobro ya está registrado.');
  expect(panel.textContent).not.toContain('aún sin cobrar');
  expect(paymentButtons(container)).toHaveLength(0);
  expect(byTestId(container, 'entrega-confirmar-solo')).toBeTruthy();
  done();
});

test('B: over-collected -> no new collection offered', async () => {
  const { container, panel, done } = await openPanel(order(fin({ currentObligation: 40, overCollected: 20 })));
  expect(panel.textContent).toContain('Cobrado de más: 20.00€');
  expect(paymentButtons(container)).toHaveLength(0);
  done();
});

test('C: partial after an adjustment -> the three buttons, and the OUTSTANDING 20 is what the panel asks for', async () => {
  const { container, panel, done } = await openPanel(order(fin({ netCollected: 40, outstanding: 20, payState: 'partially_paid' })));
  expect(panel.textContent).toContain('Pendiente 20.00€ · aún sin cobrar');
  expect(panel.textContent).not.toContain('100.00€');
  expect(paymentButtons(container)).toHaveLength(3);
  done();
});

test('H: legacy paid mirror contradicting the ledger -> never offered; a refused press is shown as a refusal', async () => {
  const o = order(fin({ currentObligation: 25, netCollected: 0, outstanding: 25, payState: 'unpaid', legacyPaymentConflict: true }), { cobrado: true, ya_pagado: true });
  const { container, panel, done } = await openPanel(o);
  expect(panel.textContent).toContain('sistema antiguo');
  expect(paymentButtons(container)).toHaveLength(0);
  done();
});

test('ALREADY_SETTLED race: the button was shown, the backend collected nothing -> warning toast, never "cobro efectivo"', async () => {
  api.confirmarEntregaOperador.mockResolvedValueOnce({ ok: true, code: 'OK', order_id: 'T7001', payment: null, payment_note: 'ORDER_PAYMENT_ALREADY_SETTLED', _ok: true, _status: 200 });
  const { container, notify, done } = await openPanel(order(fin({ netCollected: 0, outstanding: 60, payState: 'unpaid' })));
  click(byTestId(container, 'entrega-confirmar-efectivo'));
  await flush();
  expect(notify).toHaveBeenCalledTimes(1);
  const [message, color] = notify.mock.calls[0];
  expect(message).not.toMatch(/cobro efectivo/);
  expect(message).toContain('NO se registró ningún cobro');
  expect(color).toBe('#F59E0B');
  done();
});

test('ORDER_PAYMENT_LEGACY_IMPORT_REQUIRED from the writer -> red refusal, no success toast', async () => {
  api.confirmarEntregaOperador.mockResolvedValueOnce({ error: 'PAYMENT_REFUSED', payment_code: 'ORDER_PAYMENT_LEGACY_IMPORT_REQUIRED', _ok: false, _status: 409 });
  const { container, notify, done } = await openPanel(order(fin({ netCollected: 0, outstanding: 60, payState: 'unpaid' })));
  click(byTestId(container, 'entrega-confirmar-efectivo'));
  await flush();
  const [message, color] = notify.mock.calls[0];
  expect(message.startsWith('❌')).toBe(true);
  expect(message).toContain('No se registró nada');
  expect(message).not.toMatch(/Entrega confirmada/);
  expect(color).toBe('#EF4444');
  done();
});

test('a real receipt: the toast names the method and the amount the backend charged', async () => {
  api.confirmarEntregaOperador.mockResolvedValueOnce({ ok: true, code: 'OK', payment: { ok: true, idempotent: false, amount: 20 }, payment_note: null, _ok: true, _status: 200 });
  const { container, notify, done } = await openPanel(order(fin({ netCollected: 40, outstanding: 20, payState: 'partially_paid' })));
  click(byTestId(container, 'entrega-confirmar-tarjeta'));
  await flush();
  expect(notify).toHaveBeenCalledWith('✓ Entrega confirmada · cobro tarjeta 20.00€', '#22C55E');
  done();
});
