// STALE PAYMENT MIRROR (H2) -- the customer ticket's PAGADO / PENDIENTE comes from the backend's canonical
// financial.payState when the row carries it; ya_pagado is read only for a row without it (older backend response).
import { createCustomerTicket } from './createCustomerTicket';

const row = (o = {}) => ({
  // language-guard: allow-legacy tipo_consegna is the existing ordenes column name, reproduced verbatim in this fixture, not new vocabulary
  id: '#E1', service_session_id: 'svc-1', canal: 'TEL', tipo_consegna: 'DOMICILIO', ts: 1758800000000, hora: '21:00',
  nombre: 'Cliente', totale: 100, metodo_pago: 'efectivo', items: [{ n: 'Margherita', q: 1, p: 100 }], ...o,
});
const status = (order) => createCustomerTicket(order, { createdAt: '2026-09-25T20:00:00.000Z' }).snapshot.customer.payment.status;
const fin = (payState, o = {}) => ({ currentObligation: 60, netCollected: 60, outstanding: 0, overCollected: 0, payState, legacyPaymentConflict: false, ...o });

test.each([
  ['unpaid', 'PENDIENTE'],
  ['partially_paid', 'PENDIENTE'],
  ['paid', 'PAGADO'],
])('canonical payState %s -> %s, whatever the mirror says', (payState, expected) => {
  expect(status(row({ ya_pagado: true, financial: fin(payState) }))).toBe(expected);
  expect(status(row({ ya_pagado: false, financial: fin(payState) }))).toBe(expected);
});

test('A: 100 -> pay 60 -> adjust 60 with the mirror stale (ya_pagado=false) prints PAGADO', () => {
  expect(status(row({ ya_pagado: false, financial: fin('paid') }))).toBe('PAGADO');
});

test('over-collected is paid: PAGADO', () => {
  expect(status(row({ ya_pagado: false, financial: fin('paid', { currentObligation: 40, overCollected: 20 }) }))).toBe('PAGADO');
});

test('legacy response without the settlement keeps the ya_pagado fallback', () => {
  expect(status(row({ ya_pagado: true }))).toBe('PAGADO');
  expect(status(row({ ya_pagado: false }))).toBe('PENDIENTE');
  expect(status(row({ ya_pagado: true, financial: { currentObligation: 100 } }))).toBe('PAGADO');
});

test('the rendered payment line follows the canonical state', () => {
  const doc = JSON.stringify(createCustomerTicket(row({ ya_pagado: false, financial: fin('paid') }), { createdAt: '2026-09-25T20:00:00.000Z' }).document);
  expect(doc).toContain('PAGADO');
  expect(doc).not.toContain('PAGO: PENDIENTE');
});
