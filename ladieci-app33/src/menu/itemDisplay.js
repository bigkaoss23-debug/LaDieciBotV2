// ===============================================================
// itemDisplay.js — shared display model for cart / order item rows.
//
// SINGLE source of truth for HOW an item's configuration is shown, so the
// ItemPickerModal internal cart and the NuevoPedido item list can never
// diverge again.
//
// NON-NEGOTIABLE DOMAIN RULE:
//   INGREDIENTS = pizza configuration (structured: customBase + extras[]/_ingredienti)
//   NOTES       = a manual human message typed by the operator (`notes`)
// These two concepts must never be mixed. In particular, the generated
// `sub` summary of a Custom pizza ("Base Pelusa + Tomate, Rúcula, ...") is
// legacy-compatibility text — it is NEVER an operator note for a canonical item.
//
// Field-ownership contract for a NEW canonical Custom item:
//   custom:            true
//   customBase:        { id, name, price }
//   _ingredienti:      [ full selected ingredient records ]
//   extras:            [ { key, name, price, emoji, quantity } ]   (one per ingredient)
//   notes:             manual operator text only (default "")
//   removedIngredients:only ingredients explicitly removed
//   sub:               legacy compatibility string only (NOT the note, NOT the source)
//
// Pure functions, no React. Shared by ItemPickerModal + NuevoPedidoModal.
// ===============================================================

// A Custom item whose ingredient configuration is available in STRUCTURED
// form (canonical Phase-A snapshot). Legacy-only customs (id "custom_…" but
// no structured fields) are handled by the caller's legacy `sub` path.
export function isCanonicalCustomItem(item) {
  if (!item || item.custom !== true) return false;
  return (Array.isArray(item.extras) && item.extras.length > 0)
      || item.customBase != null
      || (Array.isArray(item._ingredienti) && item._ingredienti.length > 0);
}

// The base label/price for a canonical Custom item (e.g. "Base Pelusa").
// Returns null for anything that is not a canonical Custom item.
export function getItemBaseDisplay(item) {
  if (!isCanonicalCustomItem(item)) return null;
  const b = item.customBase || {};
  const name = b.name || b.id;
  if (!name) return null;
  const price = b.price != null ? b.price : item.baseUnitPrice;
  return { name: String(name), price: price != null ? Number(price) : null };
}

// The selected ingredient chips for a canonical Custom item.
// Source precedence: structured extras[] → structured _ingredienti[].
// The same ingredient present in BOTH is never duplicated: chips are
// deduplicated by stable key (fallback: normalized name + accepted price),
// summing per-unit quantities so a repeated ingredient shows compactly (×2).
// Returns [] for anything that is not a canonical Custom item.
export function getItemIngredientDisplays(item) {
  if (!isCanonicalCustomItem(item)) return [];
  const seen = new Map();
  const push = (key, name, price, emoji, qty) => {
    const cleanName = String(name ?? "").trim();
    if (!cleanName) return;
    const p = price != null ? Number(price) : null;
    const k = key != null && String(key).trim() !== ""
      ? `k:${String(key).toLowerCase()}`
      : `n:${cleanName.toLowerCase()}@${p != null ? p : ""}`;
    const add = Math.max(1, Math.trunc(Number(qty) || 1));
    if (seen.has(k)) { seen.get(k).qty += add; return; }
    seen.set(k, { key: k, name: cleanName, price: p, emoji: emoji || "➕", qty: add });
  };
  if (Array.isArray(item.extras) && item.extras.length) {
    item.extras.forEach(e => push(e.key ?? e.legacyKey, e.name ?? e.n, e.price ?? e.prezzo, e.emoji ?? e.e, e.quantity ?? e.q ?? 1));
  } else if (Array.isArray(item._ingredienti) && item._ingredienti.length) {
    item._ingredienti.forEach(i => push(i.id ?? i.key, i.n ?? i.name, i.prezzo ?? i.price, i.e ?? i.emoji, i.quantity ?? 1));
  }
  return [...seen.values()];
}

// The MANUAL operator note only. Never derives a note from a Custom item's
// generated `sub` configuration text.
//   - explicit `notes` (any item) wins when non-empty
//   - canonical Custom items: no note unless `notes` is set  → returns ""
//   - non-custom / legacy items: caller keeps its existing `sub` note parsing
//     (this helper returns "" so callers can decide the legacy path)
export function getItemManualNote(item) {
  if (item && item.notes != null && String(item.notes).trim() !== "") {
    return String(item.notes).trim();
  }
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL MANUAL-NOTE CONTRACT (Phase-B note fix)
//
// A NEW canonical item (dynamic picker emission or backend snapshot) carries
// STRUCTURED configuration: an `extras` array and/or `snapshotVersion`, and/or
// is a canonical Custom. For these, the manual operator note lives EXCLUSIVELY
// in `notes`; `sub` is compatibility/configuration text only and must NEVER
// receive the note. Historical legacy items carry only the free-text `sub`.
// ─────────────────────────────────────────────────────────────────────────────

// True when the item is a canonical (structured) snapshot, not a legacy sub-only
// item. Canonical items own their note in `notes` and their config in structured
// fields; legacy items may still keep a note embedded in `sub`.
export function isCanonicalItem(item) {
  if (!item || typeof item !== "object") return false;
  if (item.snapshotVersion != null) return true;
  if (Array.isArray(item.extras)) return true;
  return isCanonicalCustomItem(item);
}

// The free-text (non-"+") portion of a legacy `sub` string.
//   "+Kinder, cortar en 4" → "cortar en 4"
export function getLegacyNoteFromSub(sub) {
  return String(sub ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => !p.startsWith("+"))
    .join(", ");
}

// The manual note to DISPLAY. Canonical `notes` always takes precedence and is
// shown exactly once. When `notes` is empty:
//   - Custom items show no note (their `sub` is generated config, never a note);
//   - normal/legacy items fall back to any free text still living in `sub`
//     (keeps historical sub-only items readable; a correctly-configured
//      canonical item has a config-only `sub`, so this yields "").
export function resolveItemNote(item) {
  const explicit = getItemManualNote(item);
  if (explicit) return explicit;
  if (isCanonicalCustomItem(item)) return "";
  return getLegacyNoteFromSub(item?.sub);
}

// Write a manual operator note WITHOUT touching structured configuration. ONLY
// `notes` changes; `extras[]`, `removedIngredients`, `customBase`,
// `_ingredienti`, accepted names/prices, `q`/`quantity`/`lineTotal` and the
// compatibility `sub` are all preserved. Never appends the note to `sub`.
export function setItemManualNote(item, note) {
  return { ...item, notes: String(note ?? "") };
}

// Clear the manual note (sets `notes` = ""). Configuration is untouched.
export function clearItemManualNote(item) {
  return setItemManualNote(item, "");
}

// The structured EXTRAS/supplements of a NORMAL (non-Custom) item, for the
// operational extras chip in Cocina / order rows. Source precedence:
//   1. structured `extras[]` (canonical) — accepted saved name + per-unit qty
//   2. legacy `sub` "+" tokens (historical items without structured extras)
// Custom items return [] here (their base/ingredients are shown as chips via
// getItemBaseDisplay / getItemIngredientDisplays). Never mixes in the manual
// note (that lives in `notes` and is resolved by resolveItemNote).
// Returns [{ name, quantity }], deduplicated with summed per-unit quantities.
export function getItemExtraDisplays(item) {
  if (!item || typeof item !== "object") return [];
  if (isCanonicalCustomItem(item)) return [];
  const seen = new Map();
  const order = [];
  const push = (rawName, qty) => {
    const name = String(rawName ?? "").trim();
    if (!name) return;
    const k = name.toLowerCase();
    const add = Math.max(1, Math.trunc(Number(qty) || 1));
    if (seen.has(k)) { seen.get(k).quantity += add; return; }
    const rec = { name, quantity: add };
    seen.set(k, rec); order.push(rec);
  };
  if (Array.isArray(item.extras) && item.extras.length) {
    item.extras.forEach((e) => push(e.name ?? e.nombre ?? e.n, e.quantity ?? e.q ?? 1));
  } else {
    // legacy fallback: parse "+Name ×2" tokens from the compatibility `sub`.
    String(item.sub ?? "").split(",").map((s) => s.trim()).filter(Boolean).forEach((p) => {
      if (!p.startsWith("+")) return;
      const name = p.replace(/^\+/, "").replace(/\s*[×x]\s*\d+\s*$/i, "").trim();
      const mult = (p.match(/[×x]\s*(\d+)\s*$/i) || [])[1];
      push(name, mult ? Number(mult) : 1);
    });
  }
  return order;
}

// The REMOVED base ingredients of an item, for their own Cocina row.
//
// Reads the structured `removedIngredients` field ONLY. It deliberately does not
// look at `sub` or `notes`: a historical order whose operator typed "sin cebolla"
// as free text keeps that as a note. Inferring a removal from note text would
// silently change what an existing order means, and would also mis-fire on
// perfectly ordinary notes. Returns [] for anything without explicit removals.
export function getItemRemovedDisplays(item) {
  if (!item || typeof item !== "object") return [];
  if (!Array.isArray(item.removedIngredients)) return [];
  const seen = new Set();
  const out = [];
  for (const r of item.removedIngredients) {
    const name = String(r ?? "").trim();
    if (!name) continue;
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(name);
  }
  return out;
}

// Single "SIN: A, B" label for the Cocina removals row. Empty string when there
// are none, so the caller hides the row entirely.
export function formatItemRemovedLabel(item) {
  const r = getItemRemovedDisplays(item);
  return r.length ? `SIN: ${r.join(", ")}` : "";
}

// A single extras label "A, B ×2" from getItemExtraDisplays. Empty string when
// the item has no extras (caller hides the extras row). NO "+" prefix: the
// orange styling + position under the product already signal "extra", so the
// "+" was pure visual noise on the kitchen screen. Quantity keeps its "×N" form.
// Legacy leading "+" tokens are already stripped in getItemExtraDisplays, so
// this label never begins with "+". Used ONLY by the Cocina renderers
// (TabCocina, PanelCocina); no other screen consumes it.
export function formatItemExtrasLabel(item) {
  return getItemExtraDisplays(item)
    .map((e) => (e.quantity > 1 ? `${e.name} ×${e.quantity}` : e.name))
    .join(", ");
}
