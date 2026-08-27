// MesaAccountBalance — the ONE shared balance summary, used identically by
// the OPEN-table Payment Hub (VerCuentaBody) and the CLOSED-session detail
// (UltimasCuentasModal). Same reasoning as MesaPaymentsList's own header
// comment: two independent copies of "how do we show what a table owes"
// is exactly how they drift apart.
//
// OVER-COLLECTED / AJUSTE COMERCIAL V1 SLICE C — this reads ONLY fields the
// backend account projection (mesaService.js's projectSessionAccount /
// projectOrderFinancial, ledger 119) already computes. It never recomputes any
// of them from lines or payments (contract §15, frozen): the backend is
// authoritative, and unpaid / overCollected are never netted into one number.
//
// TWO LAYOUTS, from the SAME backend data:
//
//  * NO commercial adjustment anywhere on the account (Σ commands[].financial
//    .commercialAdjustment === 0 — the state of every table until an admin
//    makes the first one): the compact three-row layout, reading
//    account.total / paid / outstanding / overCollected VERBATIM. Byte-for-byte
//    the pre-adjustment behaviour.
//
//  * At least one order adjusted: the itemised layout (contract §20) —
//    Venta original / Ajuste comercial / Obligación actual / Cobrado /
//    Cobrado de más — with the obligation figures taken from Σ commands[]
//    .financial.currentObligation (the canonical per-order obligation the
//    backend sends) and Cobrado/Cobrado de más derived against account.paid
//    (money truth, never recomputed). This is display-only aggregation of data
//    the backend already sends in full — the exact same class of derivation as
//    "Reembolsado" below, and as mesaRefund.js's groupPaymentsWithRefunds.
//
// "Reembolsado" is display-only aggregation of account.payments (kind:'refund'
// rows) and is never used to derive outstanding / overCollected.
//
// COMPACT BY DEFAULT (contract §5): a row is added only when it is needed to
// explain the balance. Nothing renders as "0,00 €" noise.
import { euro } from "./mesaFormat";
import {
  accountAdjustmentTotal, accountObligationTotal, accountOriginalObligationTotal,
} from "./mesaAdjustment";

export default function MesaAccountBalance({ account }) {
  const total = Number(account?.total) || 0;
  const paid = Number(account?.paid) || 0;
  const outstanding = Number(account?.outstanding) || 0;
  const overCollected = Number(account?.overCollected) || 0;
  const refunded = (Array.isArray(account?.payments) ? account.payments : [])
    .filter((p) => p && p.kind === "refund")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const adjustmentTotal = accountAdjustmentTotal(account?.commands);
  const adjusted = adjustmentTotal < 0;

  const refundedRow = refunded > 0 && (
    <div className="mesa-hub-total-row" data-testid="mesa-hub-refunded">
      <span>Reembolsado</span><strong>{euro(refunded)}</strong>
    </div>
  );

  if (adjusted) {
    // §20 — the itemised layout. Obligation figures come from the canonical
    // per-order `financial` block; Cobrado / Cobrado de más / Resta por pagar
    // are derived against account.paid, never recomputed from lines.
    const original = accountOriginalObligationTotal(account?.commands);
    const currentObligation = accountObligationTotal(account?.commands);
    const derivedOver = Math.max(0, Math.round((paid - currentObligation) * 100) / 100);
    const derivedOutstanding = Math.max(0, Math.round((currentObligation - paid) * 100) / 100);
    return (
      <div className="mesa-hub-totals" data-testid="mesa-account-balance" data-adjusted="true">
        <div className="mesa-hub-total-row" data-testid="mesa-hub-original-sale">
          <span>Venta original</span><strong>{euro(original)}</strong>
        </div>
        <div className="mesa-hub-total-row overcollected" data-testid="mesa-hub-commercial-adjustment">
          <span>Ajuste comercial</span><strong>{euro(adjustmentTotal)}</strong>
        </div>
        <div className="mesa-hub-total-row" data-testid="mesa-hub-current-obligation">
          <span>Obligación actual</span><strong>{euro(currentObligation)}</strong>
        </div>
        <div className="mesa-hub-total-row" data-testid="mesa-hub-paid">
          <span>Ya cobrado</span><strong style={{ color: "#65d995" }}>{euro(paid)}</strong>
        </div>
        {refundedRow}
        <div className="mesa-hub-total-row outstanding" data-testid="mesa-hub-outstanding">
          <span>Resta por pagar</span><strong>{euro(derivedOutstanding)}</strong>
        </div>
        {derivedOver > 0 && (
          <div className="mesa-hub-total-row overcollected" data-testid="mesa-hub-overcollected">
            <span>Cobrado de más</span><strong>{euro(derivedOver)}</strong>
          </div>
        )}
      </div>
    );
  }

  // Unadjusted — byte-for-byte the pre-slice compact layout.
  return (
    <div className="mesa-hub-totals" data-testid="mesa-account-balance">
      <div className="mesa-hub-total-row" data-testid="mesa-hub-total">
        <span>Total</span><strong>{euro(total)}</strong>
      </div>
      <div className="mesa-hub-total-row" data-testid="mesa-hub-paid">
        <span>Ya cobrado</span><strong style={{ color: "#65d995" }}>{euro(paid)}</strong>
      </div>
      {refundedRow}
      <div className="mesa-hub-total-row outstanding" data-testid="mesa-hub-outstanding">
        <span>Resta por pagar</span><strong>{euro(outstanding)}</strong>
      </div>
      {/* §4 (frozen) — no noise when settled: this row exists only once the
          table has genuinely collected more than it currently owes. */}
      {overCollected > 0 && (
        <div className="mesa-hub-total-row overcollected" data-testid="mesa-hub-overcollected">
          <span>Cobrado de más</span><strong>{euro(overCollected)}</strong>
        </div>
      )}
    </div>
  );
}
