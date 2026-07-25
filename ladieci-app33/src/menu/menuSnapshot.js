// ===============================================================
// menuSnapshot.js (frontend) — Phase 3A
// Builds an immutable order-item snapshot from a legacy MENU product +
// selected extras. Historical order display prefers these stored fields
// and never needs the live catalogue.
// ===============================================================

// product = a legacy MENU item (from useMenuData / toLegacyMenu)
// opts = { q, extras: [{key,n,prezzo}] , nota }
export function buildOrderItemSnapshot(product, opts = {}) {
  if (!product) throw new Error("buildOrderItemSnapshot: product required");
  const q = Number(opts.q) > 0 ? Number(opts.q) : 1;
  const extras = (opts.extras || []).map((e) => ({
    key: e.key || e.id,
    n: e.n,
    prezzo: Number(e.prezzo) || 0,
  }));
  const extrasTotal = extras.reduce((s, e) => s + e.prezzo, 0);
  const basePrice = Number(product.p) || 0;

  const snap = {
    // identity
    id: product.id,               // legacy id (compat with existing order code)
    legacyId: product.id,
    databaseId: product.databaseId || null,
    clave: product.clave || null,
    // display snapshots
    n: product.n,                 // fantasy name
    sub: product.sub,             // classic name
    num: product.num ?? null,     // official number
    cat: product.cat,
    e: product.e,
    ing: product.ing || "",
    alg: product.alg || "",
    // pricing snapshots
    basePrice,
    p: Math.round((basePrice + extrasTotal) * 100) / 100, // unit price incl. extras
    q,
    extras,
    nota: opts.nota || "",
  };
  return deepFreeze(snap);
}

// Lightweight (non-frozen) base item for the working cart; the final frozen
// snapshot is produced at add-time via buildOrderItemSnapshot.
export function buildCartBase(product) {
  return {
    id: product.id, databaseId: product.databaseId || null, clave: product.clave || null,
    num: product.num ?? null, n: product.n, sub: product.sub, p: Number(product.p) || 0,
    cat: product.cat, e: product.e, ing: product.ing || "", alg: product.alg || "",
    q: 1, sub_extras: "",
  };
}

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}
