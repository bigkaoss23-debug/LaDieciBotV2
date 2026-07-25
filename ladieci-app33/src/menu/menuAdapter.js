// ===============================================================
// menuAdapter.js (frontend) — Phase 3A
// Pure transform: getMenu response → UI-compatible legacy domain shape.
// Never derives pizza number from array index (uses numOficial).
// No network, no React, no secrets.
// ===============================================================

// Convert a getMenu payload into { categories, CATS, MENU, INGREDIENTI, EXTRAS }.
// MENU items keep the legacy shape consumed by existing components:
//   id (=legacyId, compat), databaseId, clave, num, n (fantasy), sub (classic),
//   p, cat (category LABEL), e, ing (string), alg (string), flags, extrasPermitidos.
// Per-product extras allowlist, tolerant of both backend lineages (see call site).
// Returns stable legacy keys, de-duplicated, order preserved. Never throws.
export function normalizeAllowedExtraKeys(product) {
  if (!product) return [];
  const out = [];
  const push = (k) => {
    const key = typeof k === "string" ? k : (k && typeof k.legacyKey === "string" ? k.legacyKey : null);
    if (key && !out.includes(key)) out.push(key);
  };
  if (Array.isArray(product.extrasPermitidos)) product.extrasPermitidos.forEach(push);
  else if (Array.isArray(product.extras)) product.extras.forEach(push);
  return out;
}

export function toLegacyMenu(payload) {
  if (!payload || !Array.isArray(payload.productos) || !Array.isArray(payload.categorias)) {
    throw new Error("menuAdapter: invalid getMenu payload");
  }
  const catBySlug = new Map(payload.categorias.map((c) => [c.slug, c]));
  const categories = payload.categorias
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((c) => ({ slug: c.slug, label: c.label, orden: c.orden }));
  const CATS = categories.map((c) => c.label); // dynamic category order

  const MENU = payload.productos.map((p) => {
    const cat = catBySlug.get(p.categoria);
    return {
      id: p.legacyId,            // legacy compatibility id
      databaseId: p.id,          // stable UUID retained separately
      clave: p.clave,
      num: p.numOficial,         // official number (never index)
      n: p.nombreFantasia || p.nombreClasico, // fantasy (secondary display)
      sub: p.nombreClasico,      // classic (prominent display)
      p: Number(p.precio),
      cat: cat ? cat.label : p.categoria,
      e: p.emoji,
      ing: Array.isArray(p.ingredientesBase) ? p.ingredientesBase.join(", ") : "",
      // S2-7D4D-FIX1 — the STRUCTURED base ingredients, kept alongside the joined
      // `ing` string every current view renders. The removal picker needs the real
      // list: splitting `ing` back on "," would be guesswork the moment an
      // ingredient name legitimately contains a comma.
      ingredientesBase: Array.isArray(p.ingredientesBase) ? p.ingredientesBase.slice() : [],
      alg: Array.isArray(p.alergenos) ? p.alergenos.join(", ") : "",
      activo: p.activo !== false,
      disponible: p.disponible !== false,
      visiblePicker: p.visiblePicker !== false,
      visibleCocina: p.visibleCocina !== false,
      // S2-7D4D: the two backend lineages express the per-product extras allowlist
      // differently. The historical adapter (ladieci-menu-staging) emits
      // `extrasPermitidos: [legacyKey]`; the CURRENT staging backend emits
      // `extras: [{legacyKey, ...}]`. Reading only the first shape against the live
      // backend yields [] for every product, which makes canEditExtras() false
      // everywhere — the dead-pencil bug, reintroduced through the payload rather than
      // the policy. Accept BOTH shapes and normalise to stable keys.
      extrasPermitidos: normalizeAllowedExtraKeys(p),
    };
  });

  const EXTRAS = (payload.extras || []).map((e) => ({
    key: e.legacyKey,
    n: e.nombre,
    prezzo: Number(e.precioDelta),
    grupo: e.grupo,
    // emoji comes from the dynamic catalogue (menu_extras.emoji). Generic "➕"
    // only as a null-display default (sweet extras have no approved emoji).
    e: e.emoji || "➕",
    activo: e.activo !== false,
  }));

  // legacy INGREDIENTI shape (id = stable extra key, used by ItemPicker extras)
  const INGREDIENTI = EXTRAS.map((x) => ({
    id: x.key, n: x.n, e: x.e, prezzo: x.prezzo, tipo: "standard",
    gruppo: x.grupo === "sweet" ? "Dulces" : "Salados",
  }));

  return { categories, CATS, MENU, INGREDIENTI, EXTRAS };
}

// Extras allowed for a given legacy MENU product (by stable keys).
export function extrasForProduct(product, INGREDIENTI) {
  if (!product || !Array.isArray(product.extrasPermitidos)) return [];
  const allow = new Set(product.extrasPermitidos);
  return INGREDIENTI.filter((g) => allow.has(g.id));
}
