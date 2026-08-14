// ===============================================================
// ingredientGroups.js — one grouping rule for the extras picker.
//
// WHY THIS EXISTS
// ---------------
// The extras list reaches the picker from two different lineages that disagree
// about how well they describe an ingredient:
//
//   • constants.js's static INGREDIENTI carries a genuinely useful `gruppo`
//     ("Verduras y hierbas", "Carnes", "Quesos", "Pescados", "Base").
//   • the dynamic Supabase catalogue (menuAdapter.js) only knows sweet vs
//     salty, so every savoury extra arrives as the single group "Salados" —
//     which is not a grouping, it is one bucket with everything in it.
//
// Grouping the picker off `gruppo` alone would therefore work beautifully on
// the static menu and do nothing at all on the live staging catalogue, which
// is the one the operator actually uses. So: TRUST the field when it says
// something specific, and classify by name when it does not. The classifier is
// a fallback, never an override — if the data ever gets better, the data wins
// automatically and this table stops being consulted.
//
// Deliberately NOT a per-product hardcoding: this maps ingredient NAMES to
// kitchen families, so a new ingredient with a familiar word ("queso de
// cabra", "pimiento del piquillo") lands in the right family with no code
// change. Anything genuinely unrecognised lands in "Otros" and is still fully
// usable — an unknown ingredient must never become an invisible one.
// ===============================================================

export const GROUP_VERDURAS = "Verduras";
export const GROUP_CARNES = "Carnes";
export const GROUP_QUESOS = "Quesos";
export const GROUP_PESCADOS = "Pescados";
export const GROUP_ESPECIAS = "Especias";
export const GROUP_DULCES = "Dulces";
export const GROUP_BASE = "Base";
export const GROUP_OTROS = "Otros";

// Display order. Anything not listed sorts last, so a future group added to
// the data appears at the end rather than silently disappearing.
export const GROUP_ORDER = [
  GROUP_BASE, GROUP_VERDURAS, GROUP_QUESOS, GROUP_CARNES,
  GROUP_PESCADOS, GROUP_ESPECIAS, GROUP_DULCES, GROUP_OTROS,
];

// The buckets the dynamic backend produces. These carry no information beyond
// sweet/salty, so they are treated as "unclassified" and fall through to the
// name classifier. "Salados" especially: it is every savoury extra there is.
const UNINFORMATIVE = new Set(["salados", "salado", "savoury", "savory", "standard", "otros", ""]);

// Keyword → family. Matched against a normalized (accent-stripped, lowercased)
// ingredient name, longest-first so "tomate confitado" cannot be stolen by a
// shorter competing key.
const KEYWORDS = [
  [GROUP_QUESOS, ["mozzarella", "bufala", "provolone", "provola", "parmigiano", "parmesano", "gorgonzola", "queso", "fior di latte", "burrata", "ricotta", "stracciatella", "pecorino", "mascarpone", "cabra", "feta", "brie", "emmental", "cheddar"]],
  [GROUP_CARNES, ["jamon", "prosciutto", "pancetta", "bacon", "salami", "spianata", "coppa", "chorizo", "sobrasada", "salchicha", "pollo", "ternera", "carne", "mortadella", "speck", "nduja", "huevo", "guanciale", "lomo", "cecina", "pepperoni"]],
  [GROUP_PESCADOS, ["atun", "anchoa", "anchoas", "salmon", "gamba", "gambas", "marisco", "pulpo", "boqueron", "bonito", "sardina", "pescado", "mejillon", "calamar"]],
  [GROUP_ESPECIAS, ["albahaca", "oregano", "romero", "tomillo", "perejil", "pimienta", "guindilla", "picante", "chile", "curry", "comino", "azafran", "hierba", "aromatic", "aceite", "vinagre", "pesto", "trufa", "miel"]],
  [GROUP_VERDURAS, ["tomate", "cebolla", "pimiento", "berenjena", "calabacin", "champinon", "champinones", "seta", "setas", "rucula", "rucola", "espinaca", "aceituna", "oliva", "alcachofa", "maiz", "patata", "brocoli", "esparrago", "canonigo", "lechuga", "zanahoria", "puerro", "nuez", "nueces", "pina", "verdura", "ajo", "kale"]],
  [GROUP_DULCES, ["nutella", "kinder", "kitkat", "pistacho", "almendra", "chocolate", "dulce", "azucar", "fresa", "platano", "caramelo", "crema"]],
];

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // combining diacritics: "Orégano" → "oregano"
    .trim();
}

/**
 * The family an extra belongs to. `gruppo` wins whenever it says something
 * specific; otherwise the name is classified; otherwise "Otros".
 */
export function ingredientGroupOf(ingredient) {
  if (!ingredient) return GROUP_OTROS;

  const declared = normalize(ingredient.gruppo);
  if (declared && !UNINFORMATIVE.has(declared)) {
    // Normalise the static catalogue's own long label to the short chip label
    // ("Verduras y hierbas" → "Verduras"); every other declared value is
    // passed through as authored, so new backend groups need no code change.
    if (declared.startsWith("verduras")) return GROUP_VERDURAS;
    if (declared === "dulces") return GROUP_DULCES;
    if (declared === "base") return GROUP_BASE;
    if (declared === "carnes") return GROUP_CARNES;
    if (declared === "quesos") return GROUP_QUESOS;
    if (declared === "pescados") return GROUP_PESCADOS;
    return ingredient.gruppo;
  }

  const name = normalize(ingredient.n);
  if (!name) return GROUP_OTROS;
  for (const [group, keys] of KEYWORDS) {
    if (keys.some((key) => name.includes(key))) return group;
  }
  return GROUP_OTROS;
}

/**
 * Groups present in a list, in display order. Returns [] for a list that has
 * fewer than two distinct groups — a filter row with one chip is pure noise,
 * and the caller uses the empty result to skip rendering it entirely.
 */
export function groupsPresent(ingredients) {
  const seen = new Set((ingredients || []).map(ingredientGroupOf));
  if (seen.size < 2) return [];
  const known = GROUP_ORDER.filter((group) => seen.has(group));
  const extra = [...seen].filter((group) => !GROUP_ORDER.includes(group)).sort();
  return [...known, ...extra];
}
