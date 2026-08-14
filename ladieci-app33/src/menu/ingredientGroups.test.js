import {
  ingredientGroupOf, groupsPresent, GROUP_ORDER,
  GROUP_VERDURAS, GROUP_CARNES, GROUP_QUESOS, GROUP_PESCADOS,
  GROUP_ESPECIAS, GROUP_DULCES, GROUP_BASE, GROUP_OTROS,
} from "./ingredientGroups";

// The two shapes the picker actually receives. Fixture names are the REAL
// vocabulary (the classifier is a language table, so testing it against
// invented words would prove nothing) but the products are irrelevant here.
const staticShape = (n, gruppo) => ({ id: n, n, gruppo });
// What menuAdapter.js produces from the live catalogue: every savoury extra
// collapsed into one bucket.
const dynamicShape = (n) => ({ id: n, n, gruppo: "Salados" });

describe("a declared group wins whenever it says something specific", () => {
  test("the static catalogue's own groups are honoured", () => {
    expect(ingredientGroupOf(staticShape("Ajo", "Verduras y hierbas"))).toBe(GROUP_VERDURAS);
    expect(ingredientGroupOf(staticShape("Coppa", "Carnes"))).toBe(GROUP_CARNES);
    expect(ingredientGroupOf(staticShape("Provola", "Quesos"))).toBe(GROUP_QUESOS);
    expect(ingredientGroupOf(staticShape("Atún", "Pescados"))).toBe(GROUP_PESCADOS);
    expect(ingredientGroupOf(staticShape("Fior di latte", "Base"))).toBe(GROUP_BASE);
    expect(ingredientGroupOf(staticShape("Nutella", "Dulces"))).toBe(GROUP_DULCES);
  });

  // The data is the authority. A group the code has never heard of must pass
  // through, not be silently reclassified by the fallback keyword table.
  test("an unknown declared group passes through untouched", () => {
    expect(ingredientGroupOf(staticShape("Kimchi", "Fermentados"))).toBe("Fermentados");
  });

  // ...but a declared group that is really just "not sweet" is NOT specific,
  // and must fall through to the classifier. This is the whole reason the
  // module exists: grouping off `gruppo` alone does nothing on live staging.
  test("the dynamic catalogue's catch-all bucket does not win", () => {
    expect(ingredientGroupOf(dynamicShape("Gorgonzola DOP"))).toBe(GROUP_QUESOS);
    expect(ingredientGroupOf(dynamicShape("Pancetta"))).toBe(GROUP_CARNES);
  });
});

describe("classifying by name, for the catalogue that carries no real group", () => {
  test.each([
    ["Mozzarella di Bufala DOP", GROUP_QUESOS],
    ["Parmigiano Reggiano", GROUP_QUESOS],
    ["Jamón cocido", GROUP_CARNES],
    ["Salami picante Napoli", GROUP_CARNES],
    ["Huevo carbonara", GROUP_CARNES],
    ["Atún", GROUP_PESCADOS],
    ["Anchoas del Cantábrico", GROUP_PESCADOS],
    ["Berenjena", GROUP_VERDURAS],
    ["Champiñones frescos", GROUP_VERDURAS],
    ["Aceitunas negras", GROUP_VERDURAS],
    ["Orégano", GROUP_ESPECIAS],
    ["Albahaca fresca", GROUP_ESPECIAS],
    ["Nutella", GROUP_DULCES],
  ])("%s → %s", (name, expected) => {
    expect(ingredientGroupOf(dynamicShape(name))).toBe(expected);
  });

  // The two catalogues legitimately disagree about herbs: the static one files
  // basil under "Verduras y hierbas" (one combined family), the classifier
  // calls it an aromatic. Both are defensible, and the rule that settles it is
  // the same one everywhere else -- declared data wins when it exists.
  test("a declared herb group still beats the classifier's own opinion", () => {
    expect(ingredientGroupOf(staticShape("Albahaca fresca", "Verduras y hierbas"))).toBe(GROUP_VERDURAS);
    expect(ingredientGroupOf(dynamicShape("Albahaca fresca"))).toBe(GROUP_ESPECIAS);
  });

  // Accents are how these words are actually spelled; a classifier that only
  // matched unaccented forms would quietly send half the catalogue to "Otros".
  test("accents do not defeat the classifier", () => {
    expect(ingredientGroupOf(dynamicShape("ATÚN"))).toBe(GROUP_PESCADOS);
    expect(ingredientGroupOf(dynamicShape("Jamón"))).toBe(GROUP_CARNES);
    expect(ingredientGroupOf(dynamicShape("Champiñón"))).toBe(GROUP_VERDURAS);
  });

  // An ingredient nobody anticipated must stay fully usable. Landing in
  // "Otros" is fine; disappearing from the picker is not.
  test("an unrecognised ingredient lands in Otros rather than vanishing", () => {
    expect(ingredientGroupOf(dynamicShape("Ingrediente Inventado"))).toBe(GROUP_OTROS);
    expect(GROUP_ORDER).toContain(GROUP_OTROS);
  });

  test("junk input never throws", () => {
    expect(ingredientGroupOf(null)).toBe(GROUP_OTROS);
    expect(ingredientGroupOf(undefined)).toBe(GROUP_OTROS);
    expect(ingredientGroupOf({})).toBe(GROUP_OTROS);
    expect(ingredientGroupOf({ n: "" })).toBe(GROUP_OTROS);
  });
});

describe("the filter row only appears when it would actually filter", () => {
  // A product whose allowlist is four cheeses gets no chip row: every chip
  // would show the same set, which is noise dressed as a control.
  test("a single-family list reports no groups", () => {
    expect(groupsPresent([dynamicShape("Provolone"), dynamicShape("Gorgonzola DOP")])).toEqual([]);
  });

  test("an empty or missing list reports no groups", () => {
    expect(groupsPresent([])).toEqual([]);
    expect(groupsPresent(null)).toEqual([]);
  });

  test("a mixed list reports its families in display order", () => {
    const groups = groupsPresent([
      dynamicShape("Pancetta"), dynamicShape("Provolone"),
      dynamicShape("Berenjena"), dynamicShape("Atún"),
    ]);
    expect(groups).toEqual([GROUP_VERDURAS, GROUP_QUESOS, GROUP_CARNES, GROUP_PESCADOS]);
  });

  test("an unknown declared group sorts after the known ones, never dropped", () => {
    const groups = groupsPresent([
      dynamicShape("Berenjena"), staticShape("Kimchi", "Fermentados"),
    ]);
    expect(groups).toContain("Fermentados");
    expect(groups.indexOf("Fermentados")).toBeGreaterThan(groups.indexOf(GROUP_VERDURAS));
  });
});
