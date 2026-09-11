// ===============================================================
// canonicalLineEdit.js — NF-1 / NF-2: editing a line that may already carry the
// canonical snapshot the backend saved (quantity, baseUnitPrice, extras[],
// extrasUnitTotal, finalUnitPrice, lineTotal).
//
// The Modificar pedido editor used to change only the working mirrors (q, p,
// sub). The stale canonical copy travelled back unchanged and the backend kept
// it: a quantity change was dropped, and an extra was saved as text without
// being charged. Every edit here updates the canonical fields and their mirrors
// together, so a line is never sent half-edited:
//   - quantity goes through applyLineQuantity (menu/itemSignature.js), the single
//     canonical quantity updater;
//   - extras are the structured extras[]; the unit price is baseUnitPrice plus
//     those extras, and the "+Name" tags in `sub` keep listing exactly them.
// Pure functions, no React, unit-testable.
// ===============================================================
import { applyLineQuantity, itemSignature } from "./itemSignature";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const TAG_MULTIPLIER = /\s*[×x]\s*(\d+)\s*$/i;
const tagName = (tag) => tag.replace(/^\+/, "").replace(TAG_MULTIPLIER, "").trim();
const tagCount = (tag) => {
  const m = tag.match(TAG_MULTIPLIER);
  return m ? Number(m[1]) : 1;
};
const subParts = (sub) => String(sub || "").split(",").map((s) => s.trim()).filter(Boolean);
const extrasTotal = (extras) => round2(extras.reduce((s, e) => s + e.price * e.quantity, 0));

// The quantity a line is edited and charged with (canonical first, legacy mirror
// for a line that never had one).
export function lineQuantity(line) {
  const n = num(line?.quantity ?? line?.q);
  return n == null ? 1 : Math.max(0, Math.trunc(n));
}

// "+Name" tags → structured extras. A tag matching an extra the line already has
// keeps that extra's accepted key/price/emoji; a new tag is priced from the
// catalogue the editor offers, 0 when unknown (the same rule the order creation
// emitter applies in order/useOrderCart.js).
function extrasFromTags(sub, known, resolveExtra) {
  const counts = new Map();
  subParts(sub)
    .filter((part) => part.startsWith("+"))
    .forEach((tag) => {
      const name = tagName(tag);
      if (name) counts.set(name, (counts.get(name) || 0) + tagCount(tag));
    });
  return [...counts.entries()].map(([name, quantity]) => {
    const saved = known.find((e) => e.name === name);
    if (saved) return { ...saved, quantity };
    const ing = resolveExtra ? resolveExtra(name) : null;
    return {
      key: ing?.id ?? null,
      name,
      price: round2(num(ing?.prezzo) ?? 0),
      emoji: ing?.e ?? null,
      quantity,
    };
  });
}

// The structured extras a line is charged for: its canonical extras[] when it has
// one, otherwise the "+Name" tags of a working line.
export function lineExtras(line, resolveExtra) {
  if (Array.isArray(line?.extras)) {
    return line.extras.map((e) => ({
      key: e.key ?? e.legacyKey ?? null,
      name: String(e.name ?? e.nombre ?? e.n ?? "").trim(),
      price: round2(num(e.price ?? e.precio ?? e.precioDelta ?? e.prezzo) ?? 0),
      emoji: e.emoji ?? e.e ?? null,
      quantity: Math.max(1, Math.trunc(num(e.quantity ?? e.q) ?? 1)),
    }));
  }
  return extrasFromTags(line?.sub, [], resolveExtra);
}

// The accepted base unit price, before the line's CURRENT extras change.
function basePriceOf(line, currentExtras) {
  const base = num(line.baseUnitPrice);
  if (base != null) return round2(base);
  const final = num(line.finalUnitPrice ?? line.p) ?? 0;
  return Math.max(0, round2(final - extrasTotal(currentExtras)));
}

function withExtras(line, base, extras, sub) {
  const extrasUnitTotal = extrasTotal(extras);
  const finalUnitPrice = round2(base + extrasUnitTotal);
  return applyLineQuantity(
    { ...line, sub, extras, baseUnitPrice: base, extrasUnitTotal, finalUnitPrice, p: finalUnitPrice },
    lineQuantity(line),
  );
}

// One more unit of an extra (per product unit), from the editor's extras panel.
export function addLineExtra(line, ing, resolveExtra) {
  const name = String(ing?.n ?? ing?.name ?? "").trim();
  if (!name) return line;
  const current = lineExtras(line, resolveExtra);
  const at = current.findIndex((e) => e.name === name);
  const extras = at >= 0
    ? current.map((e, i) => (i === at ? { ...e, quantity: e.quantity + 1 } : e))
    : [...current, {
      key: ing.id ?? ing.key ?? null,
      name,
      price: round2(num(ing.prezzo ?? ing.price) ?? 0),
      emoji: ing.e ?? ing.emoji ?? null,
      quantity: 1,
    }];
  return withExtras(line, basePriceOf(line, current), extras, [line.sub, `+${name}`].filter(Boolean).join(", "));
}

// One unit less of an extra; its "+Name" tag goes with it.
export function removeLineExtra(line, name, resolveExtra) {
  const current = lineExtras(line, resolveExtra);
  const at = current.findIndex((e) => e.name === name);
  if (at < 0) return line;
  const extras = current[at].quantity > 1
    ? current.map((e, i) => (i === at ? { ...e, quantity: e.quantity - 1 } : e))
    : current.filter((_, i) => i !== at);
  const parts = subParts(line.sub);
  const tagAt = parts.findIndex((part) => part.startsWith("+") && tagName(part) === name);
  if (tagAt >= 0) {
    const count = tagCount(parts[tagAt]);
    if (count > 2) parts[tagAt] = `+${name} ×${count - 1}`;
    else if (count === 2) parts[tagAt] = `+${name}`;
    else parts.splice(tagAt, 1);
  }
  return withExtras(line, basePriceOf(line, current), extras, parts.join(", "));
}

// The free-text "Variaciones" field keeps editing `sub`. When its "+Name" tags
// change, the structured extras and the price follow them, so an extra typed by
// hand is never left behind as uncharged text.
export function setLineSub(line, sub, resolveExtra) {
  const current = lineExtras(line, resolveExtra);
  const next = extrasFromTags(sub, current, resolveExtra);
  const sameTags = next.length === current.length
    && next.every((e) => current.some((c) => c.name === e.name && c.quantity === e.quantity));
  if (sameTags && (Array.isArray(line.extras) || next.length === 0)) return { ...line, sub };
  return withExtras(line, basePriceOf(line, current), next, sub);
}

function configurationOf(line) {
  if (!line || typeof line !== "object") return { plain: false, final: "" };
  const sig = JSON.parse(itemSignature(line));
  return {
    plain: sig.extras.length === 0 && sig.removed.length === 0 && !sig.notes && !sig.customBase && !sig.customIng,
    final: sig.final,
  };
}

// WhatsApp addition: one more unit of a product bumps an existing row only when both
// rows are the same plain product (no extras, removals, note or Custom configuration)
// at the same accepted unit price; anything else is appended as its own row. The bump
// goes through applyLineQuantity, never an in-place `q` mutation of the saved row.
export function mergeAddedLines(existing, additions) {
  const lines = [...(existing || [])];
  for (const add of additions || []) {
    const incoming = configurationOf(add);
    const at = !incoming.plain || !incoming.final ? -1 : lines.findIndex((row) => {
      if (row.n !== add.n) return false;
      const current = configurationOf(row);
      return current.plain && current.final === incoming.final;
    });
    if (at >= 0) lines[at] = applyLineQuantity(lines[at], lineQuantity(lines[at]) + (Number(add.q) || 1));
    else lines.push(add);
  }
  return lines;
}
