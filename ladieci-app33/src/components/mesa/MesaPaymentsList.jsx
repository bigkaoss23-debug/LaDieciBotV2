// MesaPaymentsList — Refund V1 Slice B. The ONE shared payment-history +
// refund component, used identically by the OPEN-table Payment Hub
// (VerCuentaBody) and the CLOSED-session detail (UltimasCuentasModal), so
// there is exactly one refund UI in Mesa, never two that could drift apart.
//
// REFUND V1 IS TRANSACTION-CENTRIC, NEVER AGGREGATE-BASED (contract §11/§31,
// frozen). Eligibility and the refundable-remaining bound come ONLY from
// grouping this session's own payments by reversesTransactionId
// (mesaRefund.js's groupPaymentsWithRefunds) -- never from table outstanding,
// order total or session paid. Only kind:'payment' rows can ever show
// "Reembolsar"; a refund row is never itself refundable. Closed tables are
// first-class: this component never looks at table/session status and never
// disables the action because of it (§12, frozen) -- the caller decides
// whether to render it at all, this component only renders what the account
// data says.
//
// ONE INTERACTION SURFACE, INLINE (Payment Hub V1.1 / DUP-01 lesson): tapping
// "Reembolsar" opens a compact form under that exact row, not a modal stack.
import { useRef, useState } from "react";
import { createMesaRequestId, describeMesaError, mesaApi } from "../../mesa/mesaApi";
import { euro, formatClockTime } from "./mesaFormat";
import {
  REFUND_REASONS, resolveRefundReason, groupPaymentsWithRefunds,
  externalSettlementCopy, REFUND_ECONOMIC_WARNING, parseRefundAmountInput,
  isRefundAmountValid, formatAmountForInput,
} from "./mesaRefund";

// Read-only display labels only -- Refund V1 never offers a tender picker
// (contract §9/§17), so this is deliberately smaller than TabMesa.jsx's own
// METHODS (which also carries icons/colors for the payment method picker).
const METHOD_LABELS = { efectivo: "Efectivo", tarjeta: "Tarjeta", bizum: "Bizum" };
const methodLabel = (method) => METHOD_LABELS[method] || method;

function RefundForm({
  original, amount, onAmountChange, reasonId, onReasonChange, reasonDetail, onDetailChange,
  busy, error, onCancel, onSubmit,
}) {
  const externalCopy = externalSettlementCopy(original.method);
  return (
    <div className="mesa-payhist-form" data-testid="mesa-refund-form">
      <div className="mesa-payhist-form-row">
        <span>Pago original</span><strong>{euro(original.amount)}</strong>
      </div>
      <div className="mesa-payhist-form-row">
        <span>Método</span><strong data-testid="mesa-refund-method">{methodLabel(original.method)}</strong>
      </div>
      <div className="mesa-payhist-form-row">
        <span>Ya reembolsado</span><strong>{euro(original.refundedTotal)}</strong>
      </div>
      <div className="mesa-payhist-form-row">
        <span>Disponible</span><strong data-testid="mesa-refund-available">{euro(original.refundableRemaining)}</strong>
      </div>

      <div className="mesa-hub-field">
        <div className="mesa-hub-field-label">Importe a reembolsar</div>
        <input className="mesa-input" data-testid="mesa-refund-amount" inputMode="decimal"
          value={amount} onChange={(event) => onAmountChange(event.target.value)} />
      </div>

      <div className="mesa-hub-field">
        <div className="mesa-hub-field-label">Motivo</div>
        <div className="mesa-payhist-reasons" data-testid="mesa-refund-reasons">
          {REFUND_REASONS.map((r) => (
            <button key={r.id} type="button" data-testid={`mesa-refund-reason-${r.id}`}
              className={`mesa-hub-mode ${reasonId === r.id ? "active" : ""}`}
              aria-pressed={reasonId === r.id}
              onClick={() => onReasonChange(r.id)}>{r.label}</button>
          ))}
        </div>
        {reasonId === "otro" && (
          <input className="mesa-input" data-testid="mesa-refund-reason-detail"
            placeholder="Describe el motivo" style={{ marginTop: 8 }}
            value={reasonDetail} onChange={(event) => onDetailChange(event.target.value)} />
        )}
      </div>

      {/* §16 -- load-bearing product copy: the operator must see, before
          confirming, that this returns money without touching the sale. */}
      <div className="mesa-payhist-warning" data-testid="mesa-refund-warning">{REFUND_ECONOMIC_WARNING}</div>
      {/* §17 -- method is read-only above; this is the ONLY tender-specific
          copy, and only for tarjeta/bizum (external settlement). */}
      {externalCopy && <div className="mesa-payhist-external" data-testid="mesa-refund-external">{externalCopy}</div>}

      {error && <div className="mesa-banner mesa-error" data-testid="mesa-refund-error">{error}</div>}

      <div className="mesa-payhist-form-actions">
        <button type="button" className="mesa-btn" disabled={busy}
          data-testid="mesa-refund-cancel" onClick={onCancel}>Cancelar</button>
        <button type="button" className="mesa-btn green" disabled={busy}
          data-testid="mesa-refund-confirm" onClick={onSubmit}>
          {busy ? "Registrando…" : "Reembolsar"}
        </button>
      </div>
    </div>
  );
}

export default function MesaPaymentsList({ sessionId, payments, canRefund, onRefunded }) {
  const grouped = groupPaymentsWithRefunds(payments);
  const [openId, setOpenId] = useState(null);
  const [amount, setAmount] = useState("");
  const [reasonId, setReasonId] = useState(null);
  const [reasonDetail, setReasonDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  // One id per opened refund attempt -- stable across a failed retry so the
  // backend replays instead of double-refunding, fresh only when the
  // operator genuinely opens a NEW logical attempt (a different transaction,
  // or the same one reopened after Cancelar). Never regenerated merely
  // because this component re-rendered, the form is mid-fill, or a request
  // temporarily failed -- same discipline DUP-01 already proved for payments.
  const requestIdRef = useRef(createMesaRequestId("refund"));

  if (grouped.length === 0) return null;

  const openRefund = (original) => {
    setError(""); setSuccess(null);
    if (openId !== original.id) {
      requestIdRef.current = createMesaRequestId("refund");
      setAmount(formatAmountForInput(original.refundableRemaining));
      setReasonId(null);
      setReasonDetail("");
    }
    setOpenId((current) => (current === original.id ? null : original.id));
  };

  // §20 -- Cancelar sends no request, creates no refund, does not mutate
  // payment history, does not touch the selected transaction. Reopening
  // later is a new logical attempt (openRefund above regenerates the id
  // because openId will no longer match).
  const cancelRefund = () => {
    setOpenId(null); setError("");
  };

  const submitRefund = async (original) => {
    const amountValue = parseRefundAmountInput(amount);
    if (!isRefundAmountValid(amountValue, original.refundableRemaining)) {
      setError("El importe no es válido."); return;
    }
    const reason = resolveRefundReason(reasonId, reasonDetail);
    if (!reason) {
      setError(reasonId === "otro" ? "Describe brevemente el motivo." : "Indica el motivo del reembolso.");
      return;
    }
    setBusy(true); setError("");
    try {
      const result = await mesaApi.refund(sessionId, {
        originalTransactionId: original.id,
        amount: amountValue,
        reason,
        clientRequestId: requestIdRef.current,
      });
      setOpenId(null);
      setBusy(false);
      setSuccess({ amount: result?.amount ?? amountValue, method: original.method });
      // §19/§23 -- never fabricate the new state locally; the canonical
      // account is only what the server says after this refund.
      await onRefunded();
    } catch (err) {
      setBusy(false);
      setError(describeMesaError(err));
      // §23 -- another device may have refunded this same transaction
      // concurrently. The FE's displayed availability is not authoritative;
      // refresh from the server rather than keep showing what went stale.
      if (err?.code === "MESA_REFUND_EXCEEDS_REMAINING" || err?.code === "MESA_REFUND_ALREADY_FULL") {
        await onRefunded();
      }
    }
  };

  return (
    <section className="mesa-payhist" data-testid="mesa-payments-list">
      <h3 className="mesa-payhist-title">Pagos</h3>
      {success && (
        <div className="mesa-payhist-success" data-testid="mesa-refund-success">
          Reembolso registrado · {euro(success.amount)}
          {success.method ? ` · ${methodLabel(success.method)}` : ""}
        </div>
      )}
      {grouped.map((original) => {
        const isOpen = openId === original.id;
        const hasRefunds = original.refunds.length > 0;
        const fullyRefunded = hasRefunds && original.refundableRemaining <= 0;
        return (
          <div className="mesa-payhist-item" key={original.id} data-testid="mesa-payhist-item">
            <div className="mesa-payhist-row" data-testid="mesa-payhist-original">
              <span className="mesa-payhist-meta">
                {formatClockTime(original.createdAt)} · {methodLabel(original.method)}
              </span>
              <strong className="mesa-payhist-amount">{euro(original.amount)}</strong>
            </div>
            {original.refunds.map((refund) => (
              <div className="mesa-payhist-row mesa-payhist-child" key={refund.id} data-testid="mesa-payhist-refund">
                <span className="mesa-payhist-meta">↳ Reembolso · {formatClockTime(refund.createdAt)}</span>
                <strong className="mesa-payhist-amount refund">-{euro(refund.amount)}</strong>
              </div>
            ))}
            {fullyRefunded && (
              <div className="mesa-payhist-full" data-testid="mesa-payhist-full-badge">Reembolsado por completo</div>
            )}
            {!fullyRefunded && hasRefunds && (
              <div className="mesa-payhist-remaining" data-testid="mesa-payhist-remaining">
                Disponible para reembolsar: {euro(original.refundableRemaining)}
              </div>
            )}
            {canRefund && original.refundableRemaining > 0 && (
              <button type="button" className={`mesa-btn small mesa-payhist-refund-btn${isOpen ? " active" : ""}`}
                data-testid="mesa-payhist-refund-btn" onClick={() => openRefund(original)}>
                Reembolsar
              </button>
            )}
            {isOpen && (
              <RefundForm
                original={original}
                amount={amount} onAmountChange={(value) => { setError(""); setAmount(value); }}
                reasonId={reasonId} onReasonChange={(value) => { setError(""); setReasonId(value); }}
                reasonDetail={reasonDetail} onDetailChange={(value) => { setError(""); setReasonDetail(value); }}
                busy={busy} error={error}
                onCancel={cancelRefund}
                onSubmit={() => submitRefund(original)}
              />
            )}
          </div>
        );
      })}
    </section>
  );
}
