// STALE PAYMENT MIRROR (H2) -- what the "Marcar como entregado" panel may offer to COLLECT for one delivery order.
//
// The backend publishes the canonical settlement in `order.financial` (currentObligation, netCollected, outstanding,
// overCollected, payState, legacyPaymentConflict): the order's current obligation minus what the ledger already
// collected, the same arithmetic the payment writer uses. This module only READS it -- it never recomputes an amount.
//
// `o.cobrado` is a mirror the payment writers set; a commercial adjustment moves the obligation without touching it, so
// a partially paid order adjusted down to what was already collected still says cobrado=false while it owes nothing.
// Gating the payment buttons on that mirror told the operator to charge the customer again. With the canonical
// settlement present the mirror is ignored; it is read only for a backend response that predates the settlement
// (deploy-order tolerance), exactly as before.

const hasAmount = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const eur = (value) => Number(value).toFixed(2);

export const LEGACY_PAYMENT_CONFLICT_TEXT =
  'Figura como pagado en el sistema antiguo, pero ese cobro no está registrado en caja. '
  + 'No cobres ni lo marques cobrado: hay que regularizarlo desde administración.';

// order        : a row of getOrdenes (raw ordenes fields + `financial`).
// legacyTotal  : the total the card already shows, used only by the legacy (pre-settlement) branch.
// Returns { canonical, canCollect, amount, text, tone }.
export function deliveryCollectionView(order, legacyTotal) {
  const financial = order && order.financial;
  if (financial && hasAmount(financial.outstanding)) {
    const outstanding = Number(financial.outstanding);
    const obligation = Number(financial.currentObligation) || 0;
    const collected = Number(financial.netCollected) || 0;
    const overCollected = Number(financial.overCollected) || 0;
    if (financial.legacyPaymentConflict === true) {
      return { canonical: true, canCollect: false, amount: 0, text: LEGACY_PAYMENT_CONFLICT_TEXT, tone: 'warning' };
    }
    if (outstanding > 0) {
      const text = collected > 0
        ? `Pendiente ${eur(outstanding)}€ · aún sin cobrar (total ${eur(obligation)}€, ya cobrado ${eur(collected)}€).`
        : `Total ${eur(outstanding)}€ · aún sin cobrar.`;
      return { canonical: true, canCollect: true, amount: outstanding, text, tone: 'info' };
    }
    if (overCollected > 0) {
      return {
        canonical: true, canCollect: false, amount: 0, tone: 'warning',
        text: `El cobro ya está registrado. Cobrado de más: ${eur(overCollected)}€ (se devuelve desde Caja). No cobres nada.`,
      };
    }
    return { canonical: true, canCollect: false, amount: 0, text: 'El cobro ya está registrado.', tone: 'info' };
  }
  // Legacy backend response (no settlement): the previous mirror-based behaviour, unchanged.
  if (order && order.cobrado) {
    return { canonical: false, canCollect: false, amount: 0, text: 'El cobro ya está registrado.', tone: 'info' };
  }
  const obligation = financial && Number(financial.currentObligation) > 0 ? Number(financial.currentObligation) : Number(legacyTotal) || 0;
  return { canonical: false, canCollect: true, amount: obligation, text: `Total ${eur(obligation)}€ · aún sin cobrar.`, tone: 'info' };
}
