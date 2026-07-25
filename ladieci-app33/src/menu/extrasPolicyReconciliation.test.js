// S2-7D4C — extrasPolicy reconciliation between the two lines.
//
// The dynamic-menu branch wrote canEditExtras() with a static fallback of
// `cat === "Pizzas"`. Independently, the Auth V2 line shipped STATIC sweet extras
// (constants.js: EXTRAS_DULCES / esDulce), so dessert pizzas accept extras with the
// dynamic flag OFF. Adopting the branch verbatim would have regressed that.
//
// Contract: dynamic mapping wins when present; otherwise savoury pizzas AND dessert
// pizzas both keep their extras editor.
import { canEditExtras } from './extrasPolicy';

describe('canEditExtras — dynamic arm (unchanged from the source branch)', () => {
  test('permitted extras present and non-empty -> editable', () => {
    expect(canEditExtras({ cat: 'Cualquiera', extrasPermitidos: ['ing_coppa'] })).toBe(true);
  });

  test('permitted extras present but EMPTY -> not editable, regardless of category', () => {
    // direct product mapping must win over category-name inference
    expect(canEditExtras({ cat: 'Pizzas', extrasPermitidos: [] })).toBe(false);
  });
});

describe('canEditExtras — static arm (Auth V2 parity, the reconciliation)', () => {
  test('savoury pizza stays editable', () => {
    expect(canEditExtras({ cat: 'Pizzas' })).toBe(true);
  });

  test('dessert pizza stays editable — would have regressed without the fix', () => {
    // esDulce() keys on the item's `dulce` flag (or a MENU id lookup), NOT the category
    // name — dessert pizzas do not live under cat "Pizzas".
    expect(canEditExtras({ cat: 'Dulces', dulce: true })).toBe(true);
  });

  test('a category named like a dessert but without the flag is NOT editable', () => {
    // guards against category-name inference creeping back in
    expect(canEditExtras({ cat: 'Pizzas Dulces' })).toBe(false);
  });

  test('non-pizza item is not editable', () => {
    expect(canEditExtras({ cat: 'Bebidas' })).toBe(false);
  });

  test('null/undefined is safe', () => {
    expect(canEditExtras(null)).toBe(false);
    expect(canEditExtras(undefined)).toBe(false);
  });
});
