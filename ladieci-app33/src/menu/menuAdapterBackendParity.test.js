// S2-7D4D — the ported frontend adapter must normalise BOTH backend lineages.
//
// The FE adapter was written against the historical adapter backend
// (ladieci-menu-staging / 157ced0), which emits per-product
//   extrasPermitidos: ["ing_coppa", ...]
// The CURRENT staging backend (fearless-reverence / 72c5f69) is an independent
// implementation and emits instead
//   extras: [{ id, legacyKey, nombre, grupo, precioDelta, emoji, orden }, ...]
//
// Reading only the first shape against the live backend returns [] for every product,
// which makes canEditExtras() false everywhere — the "dead pencil" bug, reintroduced
// through the payload rather than the policy. Everything else in the two payloads
// (top-level keys, product fields, top-level extras fields) is identical.
import { toLegacyMenu, normalizeAllowedExtraKeys } from './menuAdapter';
import { canEditExtras } from './extrasPolicy';

const categorias = [{ id: 'c1', slug: 'pizzas', label: 'Pizzas', orden: 1, activo: true }];
const extras = [
  { id: 'e1', legacyKey: 'ing_coppa', nombre: 'Coppa', grupo: 'savory', precioDelta: 1.5, emoji: '🥓', orden: 1, activo: true },
  { id: 'e2', legacyKey: 'ing_nutella', nombre: 'Nutella', grupo: 'sweet', precioDelta: 2, emoji: '🍫', orden: 2, activo: true },
];

const baseProduct = {
  id: 'p-uuid', legacyId: 7, clave: 'diavola', categoria: 'pizzas',
  numOficial: 7, nombreFantasia: 'La Diavola', nombreClasico: 'Diavola',
  precio: 9.5, emoji: '🌶️', ingredientesBase: ['tomate', 'mozzarella'],
  alergenos: ['gluten'], orden: 1, activo: true, disponible: true,
  visiblePicker: true, visibleCocina: true,
};

// what the CURRENT staging backend actually returns
const currentBackendPayload = {
  version: 1, generatedAt: 'now', categorias,
  productos: [{ ...baseProduct, extras: [extras[0], extras[1]] }],
  extras, aliases: [],
};

// what the historical adapter backend returns
const historicalPayload = {
  version: 1, generatedAt: 'now', categorias,
  productos: [{ ...baseProduct, extrasPermitidos: ['ing_coppa', 'ing_nutella'] }],
  extras, aliases: [],
};

describe('normalizeAllowedExtraKeys — both lineages', () => {
  test('current backend shape (extras objects) -> stable keys', () => {
    expect(normalizeAllowedExtraKeys({ extras: [extras[0], extras[1]] }))
      .toEqual(['ing_coppa', 'ing_nutella']);
  });

  test('historical shape (extrasPermitidos strings) -> unchanged', () => {
    expect(normalizeAllowedExtraKeys({ extrasPermitidos: ['ing_coppa'] })).toEqual(['ing_coppa']);
  });

  test('extrasPermitidos wins when both are present', () => {
    expect(normalizeAllowedExtraKeys({ extrasPermitidos: ['ing_coppa'], extras: [extras[1]] }))
      .toEqual(['ing_coppa']);
  });

  test('de-duplicates and ignores malformed entries; never throws', () => {
    expect(normalizeAllowedExtraKeys({ extras: [extras[0], extras[0], null, {}, 42] }))
      .toEqual(['ing_coppa']);
    expect(normalizeAllowedExtraKeys(null)).toEqual([]);
    expect(normalizeAllowedExtraKeys({})).toEqual([]);
  });
});

describe('toLegacyMenu — parity across lineages', () => {
  test('CURRENT backend payload yields a non-empty allowlist (regression guard)', () => {
    const { MENU } = toLegacyMenu(currentBackendPayload);
    expect(MENU[0].extrasPermitidos).toEqual(['ing_coppa', 'ing_nutella']);
  });

  test('the two lineages produce an identical legacy product', () => {
    const a = toLegacyMenu(currentBackendPayload).MENU[0];
    const b = toLegacyMenu(historicalPayload).MENU[0];
    expect(a).toEqual(b);
  });

  test('the pencil is NOT dead against the current backend', () => {
    const { MENU } = toLegacyMenu(currentBackendPayload);
    expect(canEditExtras(MENU[0])).toBe(true);
  });

  test('a product with no permitted extras stays non-editable', () => {
    const payload = { ...currentBackendPayload, productos: [{ ...baseProduct, extras: [] }] };
    const { MENU } = toLegacyMenu(payload);
    expect(MENU[0].extrasPermitidos).toEqual([]);
    expect(canEditExtras(MENU[0])).toBe(false);
  });
});
