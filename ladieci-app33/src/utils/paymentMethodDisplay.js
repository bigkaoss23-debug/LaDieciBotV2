// ===============================================================
// paymentMethodDisplay.js — TKT-02 (2026-08-21 forensic audit)
//
// How an ALREADY-RECORDED payment method is shown to the operator.
//
// Distinct on purpose from TabMesa's `METHODS`, which is the list of tenders an
// operator can COLLECT with (efectivo / tarjeta / bizum). `MIXTO` is never
// selectable — the backend DERIVES it in mesa_post_payment_v1 whenever one
// order was settled with more than one distinct method:
//
//   CASE WHEN count(DISTINCT payment_method) > 1 THEN 'MIXTO' ELSE max(...) END
//
// so it is valid, durable data that only ever appears on the OUTPUT side.
//
// WHY THIS EXISTS. Three separate operator surfaces each hand-rolled their own
// branch chain over the literal strings 'tarjeta'/'efectivo'/'bizum', with no
// arm for MIXTO. The audit proved both failure shapes on one real order —
// #999015, settled 51.00 tarjeta + 30.00 efectivo + 20.00 bizum:
//
//   TabListos "Ya pagado" chip  -> "💵 Ya pagado"  (green, reads as CASH)
//   OrdenCard "Ya pagado" chip  -> "💵 Ya pagado"  (green, reads as CASH)
//   TabListos method chip       -> "❓ Sin método" (reads as UNPAID/unknown)
//
// One misreports the tender, the other denies it exists. Centralising the
// mapping here means a fourth surface cannot reintroduce the same defect.
//
// This module is PRESENTATION ONLY. It never recomputes the ledger, never
// rewrites ordenes.metodo_pago, and never infers a dominant method from a mixed
// payment — a mixed payment is reported as mixed, and the real per-method split
// stays where it belongs, in order_financial_events.
// ===============================================================

// The derived projection token, exactly as the backend writes it.
export const MIXED_PAYMENT_METHOD = 'MIXTO';

const UNKNOWN = Object.freeze({
  key: 'unknown', label: 'Sin método', icon: '❓', mixed: false,
  rgb: '255,255,255', borderRgb: '255,255,255', text: 'rgba(255,255,255,0.78)',
});

const DISPLAY = Object.freeze({
  efectivo: Object.freeze({
    key: 'efectivo', label: 'Efectivo', icon: '💵', mixed: false,
    rgb: '22,163,74', borderRgb: '74,222,128', text: '#4ADE80',
  }),
  tarjeta: Object.freeze({
    key: 'tarjeta', label: 'Tarjeta', icon: '💳', mixed: false,
    rgb: '37,99,235', borderRgb: '96,165,250', text: '#93C5FD',
  }),
  bizum: Object.freeze({
    key: 'bizum', label: 'Bizum', icon: '📱', mixed: false,
    rgb: '14,165,233', borderRgb: '56,189,248', text: '#7DD3FC',
  }),
  // Amber, deliberately not the green of cash nor the blue of card: a mixed
  // payment must not be mistakable for either of the tenders inside it.
  mixto: Object.freeze({
    key: 'mixto', label: 'Mixto', icon: '🧾', mixed: true,
    rgb: '217,119,6', borderRgb: '252,211,77', text: '#FCD34D',
  }),
});

// describePaymentMethod(raw) → { key, label, icon, mixed, rgb, borderRgb, text }
// `raw` is ordenes.metodo_pago as stored. Case and surrounding space are
// normalised ('MIXTO', 'mixto', ' Mixto ' all resolve). Anything absent, empty
// or unrecognised resolves to the explicit UNKNOWN entry rather than silently
// falling through to a tender-coloured default.
export function describePaymentMethod(raw) {
  if (typeof raw !== 'string') return UNKNOWN;
  const key = raw.trim().toLowerCase();
  if (!key) return UNKNOWN;
  return DISPLAY[key] || UNKNOWN;
}

// True when the order carries a real, nameable method. Call sites use it to
// decide between "PAGADO · <method>" and a bare "PAGADO".
export function hasKnownPaymentMethod(raw) {
  return describePaymentMethod(raw) !== UNKNOWN;
}
