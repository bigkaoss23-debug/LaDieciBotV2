// UNIFIED_CASH_UI_SURFACE_V1 — the ONE amount an already-persisted order card
// should show, so a list card and the cash panel never disagree after a
// commercial adjustment.
//
// CANONICAL-FIRST / LEGACY-FALLBACK / FAIL-CLOSED. The frontend derives nothing
// here — it reads a field, or it reads nothing.
//
//   1. order.financial.currentObligation
//        The canonical current obligation, projected by the backend
//        (projectOrderFinancial, exposed on getOrdenes /
//        getOrdenesArchivadosSesion by BLOCCO 1). Tracks a commercial
//        adjustment. Authoritative even when it is 0 (a fully-comped order
//        legitimately owes nothing).
//
//   2. order.totale
//        DECLARED LEGACY FALLBACK — only when a response carries no `financial`
//        block at all (a stale client cache, a non-projected read). The stored
//        pre-N-2 gross; it does NOT reflect adjustments and is never preferred
//        over a present `financial`. A genuinely stored number is honoured even
//        at 0; an absent / null / non-numeric `totale` is not a value.
//
//   3. null
//        No canonical figure and no stored legacy total. The caller renders
//        "no amount" (fail closed). It MUST NOT reconstruct the price from the
//        order's items: for a persisted sale, immutable lines / obligation
//        revisions / a commercial adjustment / cancellation semantics / a
//        future fiscal state can all make an items sum diverge from what is
//        owed. `calcTotale` is for a NOT-yet-persisted order only (composition,
//        modification-before-save, WhatsApp draft, quote preview).
//
// DOMAIN NOTE: every order returned by getOrdenes / getOrdenesArchivadosSesion
// carries `financial` (attachOrderFinancial always adds it, projectOrderFinancial
// always yields a numeric currentObligation), so branch 1 is effectively always
// taken for a current persisted order. Branch 2 is the stale-cache path; branch
// 3 is a defensive edge.

export function canonicalOrderAmount(order) {
  if (!order || typeof order !== 'object') return null;

  const fin = order.financial;
  if (fin && typeof fin === 'object') {
    const current = Number(fin.currentObligation);
    if (Number.isFinite(current) && current >= 0) return current;
  }

  const raw = order.totale;
  if (raw !== null && raw !== undefined && raw !== '') {
    const legacy = Number(raw);
    if (Number.isFinite(legacy) && legacy >= 0) return legacy;
  }

  return null;
}

// True when the shown amount comes from the canonical backend projection
// (i.e. `financial` is present). Lets a card decide whether to surface an
// "adjusted" hint without re-deriving anything.
export function hasCanonicalObligation(order) {
  const fin = order && order.financial;
  return !!(fin && typeof fin === 'object' && Number.isFinite(Number(fin.currentObligation)));
}
