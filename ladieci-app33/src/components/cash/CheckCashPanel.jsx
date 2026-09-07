import { useState, useEffect, useCallback, useRef } from 'react';
import * as MS from '../ui/mesaSurface';
import { cashApi, createCashRequestId, describeCashError, CASH_DUPLICATE_PAYMENT_CODE } from '../../cash/cashApi';
import MesaAccountBalance from '../mesa/MesaAccountBalance';
import MesaPaymentsList from '../mesa/MesaPaymentsList';
import MesaCommercialAdjustments from '../mesa/MesaCommercialAdjustments';

// CHECK-CENTRIC UNIVERSAL CASH V1 — the shared cash surface for a single
// Servicio/Banco/Retiro check (no covers, no table lines: full/custom_amount
// only, per the frozen brief §10). Reuses MesaAccountBalance/MesaPaymentsList/
// MesaCommercialAdjustments UNCHANGED in substance (they already took a
// generic `sessionId`/`account`; this file is the Servicio-specific adapter
// the contract report called for — §O: "the smallest reusable shared cash/
// financial action surface", never covers/table-line economics).
//
// PAYMENT AND DELIVERY ARE SEPARATE FACTS (§20/§21). This component NEVER
// calls the lifecycle transition itself — `onDelivered` (when provided) is
// the only bridge to RETIRADO, invoked ONLY by an explicit operator tap on
// "Confirmar entrega" / "Entregar sin cobrar", never automatically after a
// payment. Closing this panel (× or backdrop is not wired — only the ×
// button) sends no request at all.
//
// TERMINAL RE-ENTRY (§24): pass `allowDelivery={false}` for "Abrir en caja"
// on an already-RETIRADO order — the same surface, same payment/refund/
// adjustment authority, minus the delivery footer. Opening it never mutates
// `estado`.

const METHODS = [
  { id: 'efectivo', label: 'Efectivo', icon: '💵' },
  { id: 'tarjeta', label: 'Tarjeta', icon: '💳' },
  { id: 'bizum', label: 'Bizum', icon: '📱' },
];

const eur = (value) => `${(Number(value) || 0).toFixed(2).replace('.', ',')} €`;

export default function CheckCashPanel({
  orderUid, displayOrderId, canRefund = false, canAdjust = false,
  allowDelivery = true, onClose, onDelivered,
}) {
  const [account, setAccount] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [method, setMethod] = useState('efectivo');
  const [payMode, setPayMode] = useState('full');
  const [customAmount, setCustomAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState('');
  const [duplicate, setDuplicate] = useState(null);
  const [deliverBusy, setDeliverBusy] = useState(false);
  const [deliverError, setDeliverError] = useState('');
  const requestIdRef = useRef(createCashRequestId('cashpay'));

  const load = useCallback(async () => {
    setLoadError('');
    try { setAccount(await cashApi.checkAccount(orderUid)); }
    catch (e) { setLoadError(describeCashError(e)); }
  }, [orderUid]);
  useEffect(() => { load(); }, [load]);

  const outstanding = account ? Number(account.outstanding) || 0 : 0;
  const isSettled = !!account && outstanding <= 0;

  const charge = async (body, { confirmed = false } = {}) => {
    setBusy(true); setPayError('');
    try {
      await cashApi.pay(orderUid, {
        ...body,
        clientRequestId: requestIdRef.current,
        ...(confirmed ? { confirmDuplicate: true } : {}),
      });
      // A completed logical payment attempt is over; the NEXT charge (full,
      // custom, or a retry after a genuinely different amount) is a new one.
      requestIdRef.current = createCashRequestId('cashpay');
      setBusy(false);
      setDuplicate(null);
      setCustomAmount('');
      await load();
    } catch (err) {
      if (!confirmed && err?.code === CASH_DUPLICATE_PAYMENT_CODE) {
        setDuplicate({ body, amount: body.mode === 'full' ? outstanding : Number(body.amount) || 0 });
        setBusy(false);
        return;
      }
      setBusy(false);
      setDuplicate(null);
      setPayError(describeCashError(err));
    }
  };

  const payFull = () => charge({ paymentMethod: method, mode: 'full' });
  const payCustom = () => {
    const value = Number(String(customAmount).replace(',', '.'));
    if (!(value > 0) || value > outstanding + 0.001) {
      setPayError('El importe no es válido.');
      return;
    }
    charge({ paymentMethod: method, mode: 'custom_amount', amount: value });
  };
  const cancelDuplicate = () => setDuplicate(null);
  const confirmDuplicatePayment = () => { if (duplicate) charge(duplicate.body, { confirmed: true }); };

  // §20 cases A-C/G: the ONLY caller of onDelivered. §20 case D (this panel
  // closed instead) never reaches here. §20 case E/F: a failed transition
  // leaves the payment (already committed, independent fact) untouched and
  // lets the operator retry the transition alone.
  const deliver = async () => {
    if (!onDelivered) return;
    setDeliverBusy(true); setDeliverError('');
    try { await onDelivered(); }
    catch (_) { setDeliverError('No se pudo confirmar la entrega. Vuelve a intentarlo.'); }
    finally { setDeliverBusy(false); }
  };

  return (
    <div data-testid="check-cash-panel" style={MS.overlay}>
      <div style={MS.sheet(460)}>
        <div style={MS.sheetHead}>
          <span style={MS.sheetTitle}>
            <MS.MesaIcon d={MS.ICON_CASH_DRAWER} size={19} style={{ color: MS.ACCENT.gold }} />
            Caja · {displayOrderId || orderUid}
          </span>
          <button type="button" data-testid="check-cash-close" onClick={onClose}
            aria-label="Cerrar" style={MS.closeButton}>×</button>
        </div>

        <div style={MS.sheetBody}>
          {loadError && (
            <div data-testid="check-cash-load-error" style={{ color: MS.ACCENT.warn }}>{loadError}</div>
          )}

          {account && (
            <>
              <MesaAccountBalance account={account} />

              {account.legacyPayments && account.legacyPayments.length > 0 && (
                <div data-testid="check-cash-legacy-payments" style={{ display: 'grid', gap: 6 }}>
                  {account.legacyPayments.map((p) => (
                    <div key={p.id} style={MS.rowStyle}>
                      <span style={{ color: MS.TEXT.muted }}>
                        {eur(p.amount)} · {p.method || '—'} · pago registrado antes de la caja canónica
                      </span>
                      <span data-testid="check-cash-legacy-not-refundable" style={{ color: MS.ACCENT.warn, fontSize: 12 }}>
                        no reembolsable aquí
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {!isSettled && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {METHODS.map((m) => (
                      <button key={m.id} type="button" data-testid={`check-cash-method-${m.id}`}
                        style={MS.button({ tone: method === m.id ? 'primary' : 'neutral' })}
                        onClick={() => setMethod(m.id)}>
                        {m.icon} {m.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" data-testid="check-cash-mode-full"
                      style={MS.button({ tone: payMode === 'full' ? 'primary' : 'neutral' })}
                      onClick={() => setPayMode('full')}>
                      Cobrar todo ({eur(outstanding)})
                    </button>
                    <button type="button" data-testid="check-cash-mode-custom"
                      style={MS.button({ tone: payMode === 'custom' ? 'primary' : 'neutral' })}
                      onClick={() => setPayMode('custom')}>
                      Importe libre
                    </button>
                  </div>
                  {payMode === 'custom' && (
                    <input data-testid="check-cash-custom-amount" inputMode="decimal"
                      value={customAmount} onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder={`Máx. ${eur(outstanding)}`}
                      style={{ padding: '10px 12px', borderRadius: MS.RADIUS.control }} />
                  )}
                  {payError && <div data-testid="check-cash-pay-error" style={{ color: MS.ACCENT.warn }}>{payError}</div>}
                  {duplicate && (
                    <div data-testid="check-cash-duplicate" role="alertdialog"
                      style={{ border: `1px solid ${MS.ACCENT.warn}`, borderRadius: MS.RADIUS.card, padding: 10 }}>
                      <strong>Posible pago duplicado</strong>
                      <div>Ya se registró un pago idéntico hace poco. ¿Es realmente un segundo pago?</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button type="button" data-testid="check-cash-duplicate-cancel" onClick={cancelDuplicate}
                          style={MS.button({ tone: 'neutral' })}>Cancelar</button>
                        <button type="button" data-testid="check-cash-duplicate-confirm" onClick={confirmDuplicatePayment}
                          style={MS.button({ tone: 'primary' })}>Registrar igualmente</button>
                      </div>
                    </div>
                  )}
                  <button type="button" data-testid="check-cash-pay-submit" disabled={busy}
                    style={MS.button({ tone: 'primary', disabled: busy })}
                    onClick={payMode === 'full' ? payFull : payCustom}>
                    {busy ? 'Cobrando…' : 'Cobrar'}
                  </button>
                </div>
              )}

              <MesaPaymentsList sessionId={orderUid} payments={account.payments}
                canRefund={canRefund} onRefunded={load} api={cashApi} describeError={describeCashError} />
              <MesaCommercialAdjustments sessionId={orderUid} account={account}
                canAdjust={canAdjust} onAdjusted={load} api={cashApi} describeError={describeCashError} />

              {allowDelivery && onDelivered && (
                <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                  {deliverError && <div data-testid="check-cash-deliver-error" style={{ color: MS.ACCENT.warn }}>{deliverError}</div>}
                  {isSettled ? (
                    <button type="button" data-testid="check-cash-confirm-delivery" disabled={deliverBusy}
                      style={MS.button({ tone: 'primary', disabled: deliverBusy })} onClick={deliver}>
                      {deliverBusy ? 'Confirmando…' : 'Confirmar entrega'}
                    </button>
                  ) : (
                    <button type="button" data-testid="check-cash-deliver-unpaid" disabled={deliverBusy}
                      style={MS.button({ tone: 'neutral', disabled: deliverBusy })} onClick={deliver}>
                      {deliverBusy ? 'Confirmando…' : 'Entregar sin cobrar'}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
