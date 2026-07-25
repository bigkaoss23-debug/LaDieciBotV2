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
      alg: Array.isArray(p.alergenos) ? p.alergenos.join(", ") : "",
      activo: p.activo !== false,
      disponible: p.disponible !== false,
      visiblePicker: p.visiblePicker !== false,
      visibleCocina: p.visibleCocina !== false,
      extrasPermitidos: Array.isArray(p.extrasPermitidos) ? p.extrasPermitidos.slice() : [],
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
