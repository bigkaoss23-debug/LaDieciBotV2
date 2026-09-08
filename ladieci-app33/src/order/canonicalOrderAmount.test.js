// UNIFIED_CASH_UI_SURFACE_V1 — BLOCCO 2.
import { canonicalOrderAmount, hasCanonicalObligation } from './canonicalOrderAmount';

describe('canonicalOrderAmount — presentation precedence, no derivation', () => {
  test('prefers financial.currentObligation over the stored legacy totale', () => {
    expect(canonicalOrderAmount({ totale: 30, financial: { currentObligation: 22 } })).toBe(22);
  });

  test('after a full comp, currentObligation 0 is authoritative (not overridden by legacy totale)', () => {
    expect(canonicalOrderAmount({ totale: 30, financial: { currentObligation: 0 } })).toBe(0);
  });

  test('un-adjusted order: currentObligation == legacy totale -> same number either way', () => {
    expect(canonicalOrderAmount({ totale: 18, financial: { currentObligation: 18 } })).toBe(18);
  });

  test('no financial block at all -> declared legacy fallback to stored totale', () => {
    expect(canonicalOrderAmount({ totale: 25 })).toBe(25);
    expect(canonicalOrderAmount({ totale: 25, financial: null })).toBe(25);
  });

  test('no financial and no positive totale -> null (caller keeps its own legacy estimate)', () => {
    expect(canonicalOrderAmount({ totale: 0 })).toBeNull();
    expect(canonicalOrderAmount({})).toBeNull();
    expect(canonicalOrderAmount(null)).toBeNull();
  });

  test('never runs an item/price computation itself — ignores items entirely', () => {
    const order = { items: [{ n: 'Margherita', q: 3, p: 8 }], totale: 0, financial: { currentObligation: 24 } };
    expect(canonicalOrderAmount(order)).toBe(24);
    // and with no financial, still no items math — falls to null, not 24
    expect(canonicalOrderAmount({ items: [{ n: 'x', q: 3, p: 8 }], totale: 0 })).toBeNull();
  });

  test('malformed financial.currentObligation is not trusted', () => {
    expect(canonicalOrderAmount({ totale: 12, financial: { currentObligation: 'nope' } })).toBe(12);
    expect(canonicalOrderAmount({ totale: 12, financial: { currentObligation: NaN } })).toBe(12);
    expect(canonicalOrderAmount({ totale: 12, financial: { currentObligation: -5 } })).toBe(12);
  });

  test('hasCanonicalObligation flags whether the number came from the backend projection', () => {
    expect(hasCanonicalObligation({ financial: { currentObligation: 10 } })).toBe(true);
    expect(hasCanonicalObligation({ financial: { currentObligation: 0 } })).toBe(true);
    expect(hasCanonicalObligation({ totale: 10 })).toBe(false);
    expect(hasCanonicalObligation({})).toBe(false);
  });
});
