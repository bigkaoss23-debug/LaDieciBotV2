// mesaRefund — pure projection + policy for Refund V1's Mesa payment history.
//
// account.payments is a flat list of payment_transactions rows
// (kind: 'payment' | 'refund'). A refund names the EXACT original it
// reverses via reversesTransactionId (Refund V1 Slice B0's reader addition:
// mesaService.js's projectSessionAccount). This module is the ONE place that
// groups refunds under their original and derives refundable-remaining --
// never from a session/table/order aggregate, only from the original
// transaction's own linked refunds, exactly as mesa_post_refund_v1 computes
// it server-side. Getting this basis wrong is the exact class of bug the
// Refund V1 contract audit found in the legacy order_refund path.

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Refund V1 §15 (frozen product decision) -- five presets, deliberately no
// "Devolución de producto": a refund never reduces the sale (that belongs to
// a future Ajuste Comercial). Only "otro" requires operator-entered detail;
// every standard preset sends its own label verbatim as the reason string --
// no DB enum, no reason codes.
export const REFUND_REASONS = Object.freeze([
  { id: "importe", label: "Error de importe" },
  { id: "duplicado", label: "Cobro duplicado" },
  { id: "mesa", label: "Mesa equivocada" },
  { id: "cobro", label: "Error de cobro" },
  { id: "otro", label: "Otro" },
]);

// Resolves the operator's preset + optional free-text detail into the exact
// string the backend receives as `reason` (mandatory, non-empty). Returns
// null when the selection is incomplete (no preset chosen, or "otro" with no
// detail yet) -- the caller uses that to keep the confirm action disabled.
export function resolveRefundReason(reasonId, detail) {
  const preset = REFUND_REASONS.find((r) => r.id === reasonId);
  if (!preset) return null;
  if (preset.id === "otro") {
    const text = String(detail || "").trim();
    return text || null;
  }
  return preset.label;
}

// Groups every kind:'refund' row under the kind:'payment' row it names via
// reversesTransactionId, and derives refundedTotal/refundableRemaining per
// original. A refund row is NEVER itself refundable and never appears as a
// top-level entry here -- only as a child of its own original. Grouping is
// by EXACT id, never by amount/order/table, so this can never merge two
// originals or misattribute a refund to the wrong one.
export function groupPaymentsWithRefunds(payments) {
  const list = Array.isArray(payments) ? payments : [];
  const refundsByOriginal = new Map();
  for (const p of list) {
    if (p && p.kind === "refund" && p.reversesTransactionId) {
      const key = String(p.reversesTransactionId);
      if (!refundsByOriginal.has(key)) refundsByOriginal.set(key, []);
      refundsByOriginal.get(key).push(p);
    }
  }
  return list
    .filter((p) => p && p.kind === "payment")
    .map((original) => {
      const refunds = (refundsByOriginal.get(String(original.id)) || [])
        .slice()
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      const refundedTotal = round2(refunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0));
      const refundableRemaining = Math.max(0, round2(Number(original.amount) - refundedTotal));
      return { ...original, refunds, refundedTotal, refundableRemaining };
    });
}

// §17 (frozen) -- method is never selectable in Refund V1; this is read-only
// contextual copy about the rail the money physically left through. For
// tarjeta/bizum, La Dieci is RECORDING an externally executed return, never
// claiming to have executed a bank/POS operation itself. efectivo needs no
// warning: it truthfully records money leaving the drawer.
export function externalSettlementCopy(method) {
  if (method === "tarjeta") return "Registra aquí una devolución realizada en el datáfono.";
  if (method === "bizum") return "Registra aquí una devolución realizada en Bizum.";
  return null;
}

// §16 (frozen, load-bearing product copy). The operator must never be able
// to reasonably infer that refunding money also removes products or lowers
// the sale -- that is a separate, future Ajuste Comercial concept.
export const REFUND_ECONOMIC_WARNING =
  "El importe vuelve a quedar pendiente. Este reembolso no modifica el valor de la venta.";

// Accepts the Spanish decimal-comma convention the rest of Mesa's amount
// inputs already use (see TabMesa.jsx's "Importe libre").
export function parseRefundAmountInput(raw) {
  const value = Number(String(raw ?? "").replace(",", "."));
  return Number.isFinite(value) ? value : NaN;
}

// Same epsilon-guarded bound the payment hub's own free-amount validation
// uses, so a rounding artifact never rejects an amount the server would
// accept (or vice versa).
export function isRefundAmountValid(amount, refundableRemaining) {
  return Number.isFinite(amount) && amount > 0 && amount <= Number(refundableRemaining) + 0.001;
}

export function formatAmountForInput(value) {
  return round2(value).toFixed(2).replace(".", ",");
}
