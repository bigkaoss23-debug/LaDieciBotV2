// MesaAccountBalance — the ONE shared balance summary, used identically by
// the OPEN-table Payment Hub (VerCuentaBody) and the CLOSED-session detail
// (UltimasCuentasModal). Same reasoning as MesaPaymentsList's own header
// comment: two independent copies of "how do we show what a table owes"
// is exactly how they drift apart.
//
// OVER-COLLECTED / AJUSTE COMERCIAL V1 SLICE C — this reads ONLY the fields
// the backend account projection (mesaService.js's projectSessionAccount)
// already computes: total / paid / outstanding / overCollected. It never
// recomputes any of those from lines or payments (contract §15, frozen): the
// backend is authoritative, and unpaid/overCollected must never be netted
// into one number.
//
// "Reembolsado" is the ONE exception, and it is display-only aggregation of
// data the backend already sends in full (account.payments, kind:'refund'
// rows) — the exact same class of derivation mesaRefund.js's own
// groupPaymentsWithRefunds already does for the payment list below this
// component. It is never used to derive outstanding/overCollected.
//
// COMPACT BY DEFAULT (contract §5): the normal case shows exactly three
// rows. A row is added only when it is needed to explain the balance —
// Cobrado de más when the table has collected more than it currently owes,
// Reembolsado only once a real refund exists. Nothing renders as "0,00 €"
// noise.
//
// KNOWN GAP, deliberately not worked around here: the backend account
// projection computes `total` from table_order_lines, never from a
// commercial-adjustment revision (order_obligations is not read anywhere in
// mesaDao.js/mesaService.js). So these figures are exactly right for every
// order that has never been manually adjusted — which, as of this slice, is
// every order, because there is nowhere in the UI yet to create one. See
// this slice's own report for the exact backend prerequisite that would be
// needed before an "Ajustes comerciales" row could be added truthfully.
import { euro } from "./mesaFormat";

export default function MesaAccountBalance({ account }) {
  const total = Number(account?.total) || 0;
  const paid = Number(account?.paid) || 0;
  const outstanding = Number(account?.outstanding) || 0;
  const overCollected = Number(account?.overCollected) || 0;
  const refunded = (Array.isArray(account?.payments) ? account.payments : [])
    .filter((p) => p && p.kind === "refund")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  return (
    <div className="mesa-hub-totals" data-testid="mesa-account-balance">
      <div className="mesa-hub-total-row" data-testid="mesa-hub-total">
        <span>Total</span><strong>{euro(total)}</strong>
      </div>
      <div className="mesa-hub-total-row" data-testid="mesa-hub-paid">
        <span>Ya cobrado</span><strong style={{ color: "#65d995" }}>{euro(paid)}</strong>
      </div>
      {refunded > 0 && (
        <div className="mesa-hub-total-row" data-testid="mesa-hub-refunded">
          <span>Reembolsado</span><strong>{euro(refunded)}</strong>
        </div>
      )}
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
