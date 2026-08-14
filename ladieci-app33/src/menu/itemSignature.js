// ===============================================================
// itemSignature.js — cart consolidation signature + canonical quantity updater.
//
// Two cart lines may merge (quantity aggregation) ONLY when their COMPLETE
// accepted commercial + preparation configuration is equivalent — never by
// product id alone, and never across a different ACCEPTED PRICE. The signature
// is order-independent (same extras in a different click order still match) and
// includes:
//   - product identity (databaseId / clave / legacyId, or "custom")
//   - accepted base + final unit price
//   - each extra's stable key, normalized name, accepted price, per-unit qty
//   - operational notes and removed ingredients
//   - Custom base (id + accepted price) and Custom ingredient set
//
// `applyLineQuantity` is the SINGLE place that changes a line's quantity: it
// keeps legacy `q`, canonical `quantity`, and `lineTotal` consistent.
// Pure functions, no React, unit-testable. Shared by ItemPickerModal + NuevoPedido.
// ===============================================================

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
const priceTok = (v) => { const n = num(v); return n == null ? "" : String(round2(n)); };

function isCustomItem(item) {
  return item?.custom === true || String(item?.id ?? "").startsWith("custom_");
}

// Extras → sorted "key|name|price:perUnitQty" tokens (accepted key + name + price).
function extrasTokens(item) {
  if (Array.isArray(item?.extras) && item.extras.length) {
    return item.extras
      .map((e) => {
        const key = String(e.key ?? e.legacyKey ?? "").toLowerCase();
        const name = String(e.name ?? e.nombre ?? e.n ?? "").toLowerCase();
        const price = priceTok(e.price ?? e.precio ?? e.precioDelta ?? e.prezzo);
        const qty = num(e.quantity ?? e.q) > 0 ? Math.trunc(num(e.quantity ?? e.q)) : 1;
        return `${key}|${name}|${price}:${qty}`;
      })
      .sort();
  }
  // Fallback: parse legacy `sub` "+Name ×2, nota..." (no key/price available).
  const parts = String(item?.sub ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const counts = new Map();
  for (const p of parts) {
    if (!p.startsWith("+")) continue;
    const name = p.replace(/^\+/, "").replace(/\s*[×x]\s*\d+\s*$/i, "").trim();
    if (!name) continue;
    const mult = (p.match(/[×x]\s*(\d+)\s*$/i) || [])[1];
    counts.set(name.toLowerCase(), (counts.get(name.toLowerCase()) || 0) + (mult ? Number(mult) : 1));
  }
  return [...counts.entries()].map(([n, q]) => `|${n}|:${q}`).sort();
}

function notesOf(item) {
  if (item?.notes != null && String(item.notes).trim() !== "") return String(item.notes).trim();
  if (Array.isArray(item?.extras)) return "";
  const parts = String(item?.sub ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts.filter((p) => !p.startsWith("+")).join(", ").trim();
}

// Custom base identity + accepted price (never the generated custom_ timestamp).
function customBaseToken(item) {
  if (!isCustomItem(item)) return "";
  const b = item.customBase || {};
  const id = String(b.id ?? b.key ?? b.name ?? "base").toLowerCase();
  return `${id}@${priceTok(b.price ?? item.baseUnitPrice)}`;
}

function customIngredientsToken(item) {
  if (!isCustomItem(item)) return "";
  if (Array.isArray(item._ingredienti) && item._ingredienti.length) {
    return item._ingredienti
      .map((i) => {
        const qty = num(i.quantity ?? i.qty) > 0 ? Math.trunc(num(i.quantity ?? i.qty)) : 1;
        return `${String(i.id ?? i.n ?? "").toLowerCase()}@${priceTok(i.prezzo ?? i.price)}:${qty}`;
      })
      .sort()
      .join("|");
  }
  return String(item?.sub ?? "").toLowerCase();
}

export function itemSignature(item) {
  if (!item || typeof item !== "object") return "invalid";
  const custom = isCustomItem(item);
  const key = custom
    ? "custom"
    : String(item.databaseId ?? item.clave ?? item.legacyKey ?? item.id ?? item.n ?? "?").toLowerCase();
  const removed = Array.isArray(item.removedIngredients)
    ? item.removedIngredients.map((x) => String(x).toLowerCase()).sort()
    : [];
  return JSON.stringify({
    key,
    base: priceTok(item.baseUnitPrice),
    final: priceTok(item.finalUnitPrice ?? item.p),
    extras: extrasTokens(item),
    customBase: customBaseToken(item),
    customIng: customIngredientsToken(item),
    notes: notesOf(item).toLowerCase(),
    removed,
  });
}

// The SINGLE canonical quantity updater. Keeps q === quantity and recomputes
// lineTotal = finalUnitPrice(×) × quantity (legacy `p` used when finalUnitPrice
// is absent). Never touches per-unit price, extrasUnitTotal or extras[].quantity.
export function applyLineQuantity(item, q) {
  const quantity = Math.max(0, Math.trunc(Number(q) || 0));
  const finalUnit = num(item.finalUnitPrice) ?? num(item.p);
  const out = { ...item, q: quantity, quantity };
  if (finalUnit != null) out.lineTotal = round2(finalUnit * quantity);
  return out;
}

// Merge lines by signature, summing quantities via the canonical updater.
// Keeps the first line's identity and per-unit configuration; never multiplies
// per-unit extras when quantity grows.
export function consolidateCart(lines) {
  const entries = Array.isArray(lines) ? lines : Object.values(lines || {});
  const bySig = new Map();
  const out = [];
  for (const it of entries) {
    const sig = itemSignature(it);
    if (bySig.has(sig)) {
      const target = bySig.get(sig);
      const merged = applyLineQuantity(target, (Number(target.q) || 1) + (Number(it.q) || 1));
      Object.assign(target, merged);
    } else {
      const copy = applyLineQuantity({ ...it }, Number(it.q) || 1);
      bySig.set(sig, copy);
      out.push(copy);
    }
  }
  return out;
}
