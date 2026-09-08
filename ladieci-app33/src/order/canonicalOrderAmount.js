// UNIFIED_CASH_UI_SURFACE_V1 — the ONE amount an already-persisted order card
// should show, so a list card and the cash panel never disagree after a
// commercial adjustment.
//
// PRECEDENCE (presentation only — the frontend derives nothing here):
//
//   1. order.financial.currentObligation
//        The canonical current obligation, projected by the backend
//        (projectOrderFinancial, exposed on getOrdenes / getOrdenesArchivadosSesion
//        by BLOCCO 1). This is the value that tracks a commercial adjustment.
//        A finite number is authoritative even when it is 0 (a fully-comped
//        order legitimately owes nothing).
//
//   2. Number(order.totale), when > 0
//        DECLARED LEGACY FALLBACK — used only for a response that carries no
//        `financial` block at all (an old client cache, a non-projected read).
//        This is the pre-N-2 legacy gross; it does NOT reflect adjustments and
//        is never preferred over a present `financial`.
//
//   3. null
//        No canonical figure and no stored legacy total. The caller keeps its
//        own last-ditch items-only estimate (calcTotale) for this deep-legacy
//        case, explicitly as legacy compatibility, never as authority — and
//        never chained after a legacy `totale` either.
//
// `calcTotale` stays legitimate for a NON-persisted order (composition,
// modification-before-save, WhatsApp draft, quote preview). It must not be the
// read authority for a sale that already exists.

export function canonicalOrderAmount(order) {
  if (!order || typeof order !== 'object') return null;

  const fin = order.financial;
  if (fin && typeof fin === 'object') {
    const current = Number(fin.currentObligation);
    if (Number.isFinite(current) && current >= 0) return current;
  }

  const legacy = Number(order.totale);
  if (Number.isFinite(legacy) && legacy > 0) return legacy;

  return null;
}

// True when the shown amount comes from the canonical backend projection
// (i.e. `financial` is present). Lets a card decide whether to surface an
// "adjusted" hint without re-deriving anything.
export function hasCanonicalObligation(order) {
  const fin = order && order.financial;
  return !!(fin && typeof fin === 'object' && Number.isFinite(Number(fin.currentObligation)));
}
