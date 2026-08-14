// ===============================================================
// normalizeOrderLine.js — canonical READ interpretation of an order line.
//
// Slice 1 of the canonical order-picker migration (see
// CANONICAL_ORDER_PICKER_OPUS_ARCHITECTURE_CHALLENGE_2026-08-14.md, §22).
//
// Three incompatible order-line shapes are reachable in production:
//   - "working"     (order/useOrderCart.js): sub = "+Extra, +Extra, nota"
//   - "emitted"     (useOrderCart.buildEmittedItem): extras[], notes,
//                    removedIngredients[], classicName, fantasyName
//   - "custom-raw"  (PizzaCustomBuilder.jsx): n:"Pizza a tu gusto",
//                    sub = generated description, _ingredienti[] — never
//                    passes through buildEmittedItem, never carries
//                    extras/notes/removedIngredients/classicName/fantasyName
//
// normalizeOrderLine(item) reads any of the three and returns ONE canonical
// view model. Structured truth wins; legacy `sub` is parsed only when
// structured truth is unavailable. Pure, no React, no network, does not
// mutate its input.
//
// Composes the existing helpers in ./itemDisplay.js rather than
// reimplementing them — see asCanonicalCustomShim below for why custom
// items need a shim to reach that composition safely.
// ===============================================================

import {
  getItemIngredientDisplays,
  getItemManualNote,
  getItemExtraDisplays,
  getItemRemovedDisplays,
  resolveItemNote,
} from './itemDisplay.js';

// Mirrors order/useOrderCart.js's isCustomRawItem exactly (same one-line
// rule, same real production signal: a custom pizza's id is always
// "custom_" + Date.now(), minted by PizzaCustomBuilder.jsx). Not imported
// from there directly: useOrderCart.js pulls in constants.js (React hooks,
// the full menu/logo asset module), which normalizeOrderLine.js — pure, no
// React — has no reason to depend on.
const isCustomRawItem = (item) => typeof item?.id === "string" && item.id.startsWith("custom_");

const clean = (value) => (value == null ? "" : String(value).trim());

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

// itemDisplay.js's isCanonicalCustomItem (and everything gated behind it —
// getItemBaseDisplay, getItemIngredientDisplays) requires `item.custom ===
// true`. No production code path ever sets that field: PizzaCustomBuilder
// only sets id:"custom_"+Date.now() (grep-confirmed — the only two
// `custom === true` references in the whole frontend are itemSignature.js's
// OWN id-prefix-aware detector and this file's aspirational test fixtures).
// So isCanonicalCustomItem is dead code against every real custom pizza
// today. A shim with `custom` forced true reuses that already-tested
// ingredient-chip logic for the shape it actually receives, without
// widening itemDisplay.js's own contract (Cocina/printing already depend on
// it) and without duplicating the dedup/qty-summing logic here.
function asCanonicalCustomShim(item) {
  return { ...item, custom: true };
}

// Single seam for a future display-casing decision (see the handoff's
// DISPLAY / CASING RULE). Slice 1 changes no casing: neither the Mesa draft
// panel nor the create-order item list uppercases any order-line text
// today, so normalizeOrderLine doesn't introduce it either — only the
// *mechanism* is centralized here, not a new rule. A later slice can flip
// this one function instead of scattering `.toUpperCase()` per consumer.
function applyDisplayCasing(text) {
  return text;
}

const EMPTY_LINE = Object.freeze({
  uid: null, isCustom: false, displayName: "", secondaryName: "",
  number: null, quantity: 0, unitPrice: null, lineTotal: null,
  extras: [], removed: [], note: "",
});

export function normalizeOrderLine(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return EMPTY_LINE;
  }

  const isCustom = isCustomRawItem(item);

  const quantityRaw = Number(item.q ?? item.quantity);
  const quantity = Number.isFinite(quantityRaw) ? quantityRaw : 1;

  const unitPriceRaw = item.p ?? item.finalUnitPrice ?? item.baseUnitPrice;
  const unitPrice = unitPriceRaw != null && Number.isFinite(Number(unitPriceRaw))
    ? Number(unitPriceRaw)
    : null;
  const lineTotal = item.lineTotal != null && Number.isFinite(Number(item.lineTotal))
    ? Number(item.lineTotal)
    : (unitPrice != null ? round2(unitPrice * quantity) : null);

  const displayName = applyDisplayCasing(
    clean(item.fantasyName) || clean(item.n) || clean(item.name)
  );

  let secondaryName = "";
  let extras;
  let note;

  if (isCustom) {
    const shim = asCanonicalCustomShim(item);
    extras = getItemIngredientDisplays(shim).map((chip) => ({
      name: applyDisplayCasing(chip.name),
      quantity: chip.qty,
    }));
    // Never derives a note from the generated `sub` description — the same
    // rule itemDisplay.js documents for canonical custom items.
    note = getItemManualNote(item);
    // Legacy-only custom line (no _ingredienti/extras[] at all) is not
    // reachable via today's PizzaCustomBuilder — it disables "Añadir" until
    // at least one ingredient is selected — but is a real historical
    // possibility. Preserve the raw generated description rather than lose
    // it; this is display text only, never treated as a note or as
    // structured extras.
    if (extras.length === 0) {
      secondaryName = clean(item.sub);
    }
  } else {
    extras = getItemExtraDisplays(item).map((extra) => ({
      name: applyDisplayCasing(extra.name),
      quantity: extra.quantity,
    }));
    note = resolveItemNote(item);
    // Catalog-sourced secondary descriptor: a pizza's classic name, or a
    // beverage's size/variant — same field, same display slot, matching how
    // increment() captures it (classicName: p.sub) regardless of category.
    secondaryName = applyDisplayCasing(clean(item.classicName));
  }

  const removed = getItemRemovedDisplays(item).map((name) => applyDisplayCasing(name));

  return {
    uid: item._uid ?? item.id ?? null,
    isCustom,
    displayName,
    secondaryName,
    number: Number.isFinite(Number(item.num)) ? Number(item.num) : null,
    quantity,
    unitPrice,
    lineTotal,
    extras,
    removed,
    note,
  };
}

export default normalizeOrderLine;
