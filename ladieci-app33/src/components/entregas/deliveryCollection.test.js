// STALE PAYMENT MIRROR (H2) -- deliveryCollectionView reads the backend's canonical settlement (financial.outstanding)
// and ignores the cobrado mirror whenever that settlement is present; only a response without it keeps the old
// mirror-based behaviour. describeDeliveryConfirmSuccess says what the backend actually recorded.
import { deliveryCollectionView, LEGACY_PAYMENT_CONFLICT_TEXT } from './deliveryCollection';
import { describeDeliveryConfirmError, describeDeliveryConfirmSuccess } from './deliveryConfirmationMessages';

const settled = (o = {}) => ({ currentObligation: 60, netCollected: 60, outstanding: 0, overCollected: 0, payState: 'paid', legacyPaymentConflict: false, ...o });

describe('deliveryCollectionView -- canonical settlement first', () => {
  test('A: 100 -> pay 60 -> adjust 60: outstanding 0 with cobrado=false -> NO collection offered', () => {
    const v = deliveryCollectionView({ cobrado: false, financial: settled() }, 100);
    expect(v).toMatchObject({ canonical: true, canCollect: false, text: 'El cobro ya está registrado.' });
  });

  test('B: 100 -> pay 60 -> adjust 40: over-collected 20 -> NO new collection, the surplus is named', () => {
    const v = deliveryCollectionView({ cobrado: false, financial: settled({ currentObligation: 40, overCollected: 20 }) }, 100);
    expect(v.canCollect).toBe(false);
    expect(v.text).toContain('Cobrado de más: 20.00€');
    expect(v.text).toContain('No cobres nada');
  });

  test('C: 100 -> pay 40 -> adjust 60: offers the OUTSTANDING 20, not the historical 100 nor the obligation 60', () => {
    const v = deliveryCollectionView({ cobrado: false, totale: 100, financial: settled({ netCollected: 40, outstanding: 20, payState: 'partially_paid' }) }, 100);
    expect(v).toMatchObject({ canonical: true, canCollect: true, amount: 20 });
    expect(v.text).toBe('Pendiente 20.00€ · aún sin cobrar (total 60.00€, ya cobrado 40.00€).');
  });

  test('D: ordinary unpaid keeps the established wording', () => {
    const v = deliveryCollectionView({ cobrado: false, financial: { currentObligation: 25, netCollected: 0, outstanding: 25, overCollected: 0, payState: 'unpaid' } }, 25);
    expect(v).toMatchObject({ canCollect: true, amount: 25, text: 'Total 25.00€ · aún sin cobrar.' });
  });

  test('the mirror is ignored when the settlement exists: cobrado=true but outstanding > 0 still offers the outstanding', () => {
    const v = deliveryCollectionView({ cobrado: true, financial: settled({ netCollected: 0, outstanding: 60, payState: 'unpaid' }) }, 60);
    expect(v.canCollect).toBe(true);
  });

  test('H: legacy paid mirror contradicting the ledger (148) -> never offered, regularization notice', () => {
    const v = deliveryCollectionView({ cobrado: true, ya_pagado: true, financial: settled({ netCollected: 0, outstanding: 25, payState: 'unpaid', legacyPaymentConflict: true }) }, 25);
    expect(v).toMatchObject({ canonical: true, canCollect: false, text: LEGACY_PAYMENT_CONFLICT_TEXT, tone: 'warning' });
  });

  test('legacy backend response (no settlement): previous mirror behaviour, unchanged', () => {
    expect(deliveryCollectionView({ cobrado: true, financial: { currentObligation: 12.5 } }, 12.5))
      .toMatchObject({ canonical: false, canCollect: false, text: 'El cobro ya está registrado.' });
    expect(deliveryCollectionView({ cobrado: false, financial: { currentObligation: 12.5 } }, 99))
      .toMatchObject({ canonical: false, canCollect: true, text: 'Total 12.50€ · aún sin cobrar.' });
    expect(deliveryCollectionView({ cobrado: false }, 18))
      .toMatchObject({ canonical: false, canCollect: true, text: 'Total 18.00€ · aún sin cobrar.' });
  });
});

describe('describeDeliveryConfirmSuccess -- the toast says what was recorded', () => {
  test('a new receipt names the method and the amount actually charged', () => {
    expect(describeDeliveryConfirmSuccess({ ok: true, code: 'OK', payment: { amount: 20, idempotent: false }, payment_note: null }, { method: 'efectivo' }))
      .toMatchObject({ message: '✓ Entrega confirmada · cobro efectivo 20.00€', tone: 'ok' });
  });
  test('ALREADY_SETTLED: delivered, nothing collected, never "cobro efectivo"', () => {
    const out = describeDeliveryConfirmSuccess({ ok: true, code: 'OK', payment: null, payment_note: 'ORDER_PAYMENT_ALREADY_SETTLED' }, { method: 'efectivo' });
    expect(out.tone).toBe('warning');
    expect(out.message).not.toMatch(/cobro efectivo/);
    expect(out.message).toContain('NO se registró ningún cobro');
  });
  test('an idempotent replay of the same request is not a second collection', () => {
    expect(describeDeliveryConfirmSuccess({ ok: true, payment: { amount: 20, idempotent: true } }, { method: 'bizum' }).message)
      .toContain('no se cobró de nuevo');
  });
  test('payment:null with no note is still an honest "nothing collected"', () => {
    expect(describeDeliveryConfirmSuccess({ ok: true, payment: null }, { method: 'tarjeta' }))
      .toMatchObject({ message: '✓ Entrega confirmada · NO se registró ningún cobro.', tone: 'warning' });
  });
  test('delivery only / legacy response shape keep the previous wording', () => {
    expect(describeDeliveryConfirmSuccess({ ok: true }, null).message).toBe('✓ Entrega confirmada');
    expect(describeDeliveryConfirmSuccess({ ok: true, code: 'OK', _ok: true }, { method: 'efectivo' }).message).toBe('✓ Entrega confirmada · cobro efectivo');
  });
  test('ORDER_PAYMENT_LEGACY_IMPORT_REQUIRED is a typed refusal: nothing recorded, do not collect', () => {
    const msg = describeDeliveryConfirmError({ error: 'PAYMENT_REFUSED', payment_code: 'ORDER_PAYMENT_LEGACY_IMPORT_REQUIRED', _ok: false, _status: 409 });
    expect(msg).toContain('No se registró nada');
    expect(msg).toContain('no cobres');
  });
});
