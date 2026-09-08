// UNIFIED_CASH_UI_SURFACE_V1 — BLOCCO 2 + correction. Canonical-first /
// legacy-fallback / fail-closed. Never reconstructs the price from items for a
// persisted sale.
import { canonicalOrderAmount, hasCanonicalObligation } from './canonicalOrderAmount';

describe('canonicalOrderAmount — canonical-first, legacy-fallback, fail-closed', () => {
  test('1: financial.currentObligation = 22 -> 22', () => {
    expect(canonicalOrderAmount({ totale: 30, financial: { currentObligation: 22 } })).toBe(22);
  });

  test('2: financial.currentObligation = 0 -> 0 (authoritative; does NOT fall to legacy, does NOT touch items)', () => {
    expect(canonicalOrderAmount({ totale: 30, items: [{ n: 'x', q: 3, p: 8 }], financial: { currentObligation: 0 } })).toBe(0);
  });

  test('3: no financial, totale = 30 -> 30 (declared legacy fallback)', () => {
    expect(canonicalOrderAmount({ totale: 30 })).toBe(30);
    expect(canonicalOrderAmount({ totale: 30, financial: null })).toBe(30);
    expect(canonicalOrderAmount({ totale: '18.50' })).toBe(18.5); // stored as a string still counts
  });

  test('4: no financial, totale = 0 -> 0 (a genuinely stored zero is a value, coherent fail-closed; NEVER calcTotale)', () => {
    expect(canonicalOrderAmount({ totale: 0, items: [{ n: 'x', q: 3, p: 8 }] })).toBe(0);
    expect(canonicalOrderAmount({ totale: '0' })).toBe(0);
  });

  test('5: no financial and no valid totale -> null (caller fails closed; calcTotale is NOT its concern)', () => {
    expect(canonicalOrderAmount({})).toBeNull();
    expect(canonicalOrderAmount({ totale: null })).toBeNull();
    expect(canonicalOrderAmount({ totale: undefined })).toBeNull();
    expect(canonicalOrderAmount({ totale: '' })).toBeNull();
    expect(canonicalOrderAmount({ totale: 'nope' })).toBeNull();
    expect(canonicalOrderAmount({ totale: -5 })).toBeNull();
    expect(canonicalOrderAmount(null)).toBeNull();
    expect(canonicalOrderAmount('x')).toBeNull();
  });

  test('6: items sum to 30 but financial.currentObligation = 10 -> 10 (items are irrelevant)', () => {
    const order = { items: [{ n: 'Margherita', q: 3, p: 10 }], totale: 30, financial: { currentObligation: 10 } };
    expect(canonicalOrderAmount(order)).toBe(10);
  });

  test('malformed financial.currentObligation is not trusted; falls to legacy totale', () => {
    expect(canonicalOrderAmount({ totale: 12, financial: { currentObligation: 'nope' } })).toBe(12);
    expect(canonicalOrderAmount({ totale: 12, financial: { currentObligation: NaN } })).toBe(12);
    expect(canonicalOrderAmount({ totale: 12, financial: { currentObligation: -5 } })).toBe(12);
  });

  test('the helper itself never runs an item/price computation', () => {
    // no financial, no totale, only items -> null (NOT a computed 24)
    expect(canonicalOrderAmount({ items: [{ n: 'x', q: 3, p: 8 }] })).toBeNull();
  });

  test('hasCanonicalObligation flags whether the number came from the backend projection', () => {
    expect(hasCanonicalObligation({ financial: { currentObligation: 10 } })).toBe(true);
    expect(hasCanonicalObligation({ financial: { currentObligation: 0 } })).toBe(true);
    expect(hasCanonicalObligation({ totale: 10 })).toBe(false);
    expect(hasCanonicalObligation({})).toBe(false);
  });
});
