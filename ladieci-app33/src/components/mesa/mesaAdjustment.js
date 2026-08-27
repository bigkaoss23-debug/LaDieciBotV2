// mesaAdjustment — pure projection + validation for the MANUAL "Ajuste
// comercial" on a single Mesa order/comanda.
//
// AJUSTE COMERCIAL V1 (backend contract, FROZEN):
//   * It moves ONE order's OBLIGATION (order_obligations), never physical cash.
//   * The wire value is the ABSOLUTE new gross (newGross), never a delta.
//   * V1 is REDUCTION ONLY: newGross must be >= 0 and <= the current obligation.
//   * newGross === current obligation is a no-op the backend rejects
//     (MESA_ADJUSTMENT_NO_CHANGE) — the form disables submit for it too.
//   * The reason is a MANDATORY free-text string. The backend has NO preset /
//     cause enum on the wire (the `cause` column is set server-side to
//     'manual'); Refund V1's reason presets are a SEPARATE contract and are
//     deliberately not reused here.
//
// This module never mutates or fabricates any financial figure. The per-order
// `financial` shape it reads comes straight from the canonical account
// projection (backend mesaService.js projectSessionAccount / projectOrderFinancial,
// ledger 119): { orderUid, originalObligation, currentObligation,
// commercialAdjustment, obligationRevision, adjustable }.

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Same Spanish decimal-comma convention every other Mesa amount input uses
// (payment hub "Importe libre", Refund V1's amount field). A BLANK field is NaN,
// not 0 — "0" is a legitimate obligation (a full comp) and must be typed
// deliberately, never inferred from an empty input.
export function parseAdjustmentAmountInput(raw) {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") return NaN;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : NaN;
}

export function formatAmountForInput(value) {
  return round2(value).toFixed(2).replace(".", ",");
}

// Frontend guardrails (§13). The backend stays the final authority; these never
// invent bounds wider than it. Epsilon-guarded upper bound, matching the payment
// hub's own free-amount check, so a rounding artefact never rejects a value the
// server would take.
export function isAdjustmentValid(newGross, currentObligation) {
  const current = Number(currentObligation) || 0;
  return (
    Number.isFinite(newGross) &&
    newGross >= 0 &&
    newGross <= current + 0.001 &&
    round2(newGross) !== round2(current)
  );
}

// The signed adjustment shown to the operator: newGross − currentObligation,
// always <= 0 for a valid reduction. Display only.
export function adjustmentDelta(currentObligation, newGross) {
  return round2((Number(newGross) || 0) - (Number(currentObligation) || 0));
}

// §14 — projected over-collection AFTER this one order's obligation drops to
// newGross, derived from backend figures only:
//   projected total obligation = accountObligationTotal − (currentObligation − newGross)
//   projected overCollected     = max(0, accountPaid − projected total obligation)
// `accountObligationTotal` is Σ of every command's financial.currentObligation
// (see accountObligationTotal below). Never nets unpaid against overCollected.
export function projectedOverCollected({ accountObligationTotal, accountPaid, currentObligation, newGross }) {
  const reduction = round2((Number(currentObligation) || 0) - (Number(newGross) || 0));
  const projectedObligation = round2((Number(accountObligationTotal) || 0) - reduction);
  return Math.max(0, round2((Number(accountPaid) || 0) - projectedObligation));
}

// Σ of every command's canonical current obligation. Falls back to the
// command's own `total` only when a command carries no `financial` block at
// all (older payload / never-adjusted-and-not-anchored) — never to the display
// id, never recomputed from lines.
export function accountObligationTotal(commands) {
  const list = Array.isArray(commands) ? commands : [];
  return round2(list.reduce((sum, c) => {
    const fin = c && c.financial;
    const value = fin && Number.isFinite(Number(fin.currentObligation))
      ? Number(fin.currentObligation)
      : Number(c && c.total) || 0;
    return sum + value;
  }, 0));
}

// Σ of every command's ORIGINAL sale obligation (revision-1 / legacy basis).
export function accountOriginalObligationTotal(commands) {
  const list = Array.isArray(commands) ? commands : [];
  return round2(list.reduce((sum, c) => {
    const fin = c && c.financial;
    const value = fin && Number.isFinite(Number(fin.originalObligation))
      ? Number(fin.originalObligation)
      : Number(c && c.total) || 0;
    return sum + value;
  }, 0));
}

// Σ of every command's commercialAdjustment (each <= 0). 0 when nothing has
// ever been adjusted — which is the signal MesaAccountBalance uses to stay in
// its compact, unchanged three-row layout.
export function accountAdjustmentTotal(commands) {
  const list = Array.isArray(commands) ? commands : [];
  return round2(list.reduce((sum, c) => {
    const value = c && c.financial && Number.isFinite(Number(c.financial.commercialAdjustment))
      ? Number(c.financial.commercialAdjustment) : 0;
    return sum + value;
  }, 0));
}

// The commands an admin may actually adjust: a canonical `financial` block, a
// real permanent orderUid, and the backend's own `adjustable === true` verdict.
// A command failing any of these is never given a CTA (§10) — no fallback to
// the display id, ever.
export function adjustableCommands(commands) {
  const list = Array.isArray(commands) ? commands : [];
  return list.filter((c) =>
    c && c.financial &&
    typeof c.financial.orderUid === "string" && c.financial.orderUid.length > 0 &&
    c.financial.adjustable === true &&
    Number.isFinite(Number(c.financial.currentObligation)));
}

// §14 (load-bearing product copy). The operator must not be able to infer that
// reducing the obligation returns money.
export const ADJUSTMENT_NO_REFUND_WARNING =
  "Este ajuste cambia lo que debe el cliente. No devuelve dinero.";

// §14/§23 — shown only when the reduction would leave the table over-collected.
export const ADJUSTMENT_REFUND_SEPARATE_NOTE = "El reembolso se registra por separado.";
