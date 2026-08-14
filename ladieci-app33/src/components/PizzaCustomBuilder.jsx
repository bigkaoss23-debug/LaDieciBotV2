import { useState } from 'react';
import { C, PIZZA_BASE, INGREDIENTI as STATIC_INGREDIENTI } from '../constants';
import IngredientGrid from './order/IngredientGrid';

const ALL_GROUPS = "Todos";

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

// Legacy-compatibility description text ONLY -- never read as an operator
// note (see menu/itemDisplay.js's field-ownership contract). Kept for any
// surface that still displays raw `sub`/`ing` verbatim.
function buildLegacyDescr(entries) {
  if (entries.length === 0) return `${PIZZA_BASE.sub} (${PIZZA_BASE.ing})`;
  const parts = entries.map((i) => (i.quantity > 1 ? `${i.n} ×${i.quantity}` : i.n));
  return `${PIZZA_BASE.sub} + ${parts.join(", ")}`;
}

// ===============================================================
// PizzaCustomBuilder.jsx — "⭐ Custom" tab: build a Pizza a tu gusto.
//
// CANONICAL_MANUAL_PICKER_FINAL_CORRECTION (2026-08-14), full rebuild after
// human phone UAT. Four goals landed here together because they all touch
// the same selection model:
//
//   Goal 11 (ingredient QUANTITY) -- selection used to be a plain 0/1 toggle
//     (`ingSelezionati` array of ingredient records). It is now a qty map,
//     rendered through the SAME shared IngredientGrid the normal extras
//     configurator uses (tap = +1, explicit "−" once qty>0, price scales
//     with quantity) -- one canonical ingredient-picking grammar, not two.
//   Goal 12 (redundant chips) -- the old build showed the SAME selection
//     twice (a full-weight pill row above the grid, AND highlighted cards in
//     the grid). IngredientGrid's own quantity badges already show the
//     selection; the pill row is gone, replaced by one small, non-dominant
//     text summary (still useful once the operator switches ingredient
//     GROUPS and the previously-picked ones scroll out of the visible grid).
//   Goal 13 (sticky CTA) -- "Añadir esta pizza" used to sit ABOVE the
//     ingredient grid, so scrolling the grid could scroll the CTA out of
//     view entirely (human UAT missed it despite it being gold). It is now
//     a flexShrink:0 footer BELOW a flex:1 scrolling grid -- the exact same
//     header/scroll-body/pinned-footer layering already proven in
//     ItemConfigurator's own "adjust zone". Genuinely always visible, not a
//     `position:sticky` approximation (sticky-bottom on an element ABOVE
//     scrolling content does not keep it in view while scrolling down
//     through that content -- it only "catches" the viewport edge once
//     scrolled past, which is the opposite of what's needed here).
//   Goal 16 (custom line truth) -- emits a genuinely canonical custom item
//     now: `custom:true`, `customBase`, structured `extras[]` (mirrors the
//     normal-item shape, one entry per ingredient with its own quantity),
//     `notes:""`, `removedIngredients:[]`. `sub`/`ing` keep the legacy
//     description text for any surface still reading it verbatim, but every
//     canonical reader (normalizeOrderLine, itemDisplay.js, itemSignature.js)
//     now finds real structured truth instead of falling through to it. The
//     OTHER half of the "Base Pelusa" bug -- ItemPickerModal.handleConfirm
//     running ALL cart items (customs included) through buildEmittedItem,
//     which unconditionally re-derives `extras`/`notes` by mis-parsing this
//     very `sub` string as if it were "+Extra, note" -- is fixed at its own
//     call site (ItemPickerModal.jsx), not here: even a perfectly clean
//     canonical shape gets silently overwritten if something downstream
//     re-parses its own legacy compatibility text as authoritative.
//
// Ingredient universe: `INGREDIENTI` arrives as a prop from the shell's own
// useMenuData() (threaded through CatalogBrowser), the same source normal
// extras already use -- falls back to the static catalogue constant only
// when no prop is given (e.g. a caller that hasn't wired it), so this never
// silently shows an empty grid. Custom pizza base (name/price/description)
// stays the fixed "Pelusa" product -- that identity is out of this pass's
// scope, only the TOPPINGS list needed to stop being a second, hardcoded
// ingredient source.
// ===============================================================
const PizzaCustomBuilder = ({ INGREDIENTI, setItems }) => {
  const ingredientUniverse = (Array.isArray(INGREDIENTI) && INGREDIENTI.length > 0) ? INGREDIENTI : STATIC_INGREDIENTI;
  const [group, setGroup] = useState(ALL_GROUPS);
  const [qtyMap, setQtyMap] = useState({});

  const quantityOf = (ing) => qtyMap[ing.id] || 0;
  const increment = (ing) => setQtyMap((prev) => ({ ...prev, [ing.id]: (prev[ing.id] || 0) + 1 }));
  const decrement = (ing) => setQtyMap((prev) => {
    const q = (prev[ing.id] || 0) - 1;
    if (q <= 0) { const next = { ...prev }; delete next[ing.id]; return next; }
    return { ...prev, [ing.id]: q };
  });

  const selected = ingredientUniverse
    .filter((ing) => (qtyMap[ing.id] || 0) > 0)
    .map((ing) => ({ ...ing, quantity: qtyMap[ing.id] }));
  const extraPriceTotal = round2(selected.reduce((s, i) => s + i.prezzo * i.quantity, 0));
  const totalPrice = round2(PIZZA_BASE.p + extraPriceTotal);

  const handleAdd = () => {
    if (selected.length === 0) return;
    const descr = buildLegacyDescr(selected);
    const newItem = {
      id: "custom_" + Date.now(),
      custom: true,
      n: "Pizza a tu gusto",
      e: "⭐",
      cat: "Pizzas",
      q: 1,
      customBase: { id: "base_pelusa", name: PIZZA_BASE.sub, price: PIZZA_BASE.p },
      baseUnitPrice: PIZZA_BASE.p,
      p: totalPrice,
      finalUnitPrice: totalPrice,
      _ingredienti: selected.map((i) => ({ id: i.id, n: i.n, e: i.e, prezzo: i.prezzo, quantity: i.quantity })),
      extras: selected.map((i) => ({ key: i.id, name: i.n, price: i.prezzo, emoji: i.e, quantity: i.quantity })),
      notes: "",
      removedIngredients: [],
      sub: descr,
      ing: descr,
    };
    setItems((prev) => [...prev, newItem]);
    setQtyMap({});
  };

  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* Header info -- GOAL 15: base price/description contrast raised off
          the near-invisible C.grigio, and clearly labelled as THIS pizza's
          own price (distinct from the global cart total, shown elsewhere in
          the CartBar). */}
      <div data-testid="custom-header" style={{
        flexShrink: 0,
        background: `linear-gradient(135deg,rgba(196,168,122,0.15),rgba(160,130,80,0.1))`,
        border: `1px solid rgba(196,168,122,0.3)`,
        borderRadius: 12, margin: "12px 14px 0", padding: "10px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.avana, fontWeight: 800, fontSize: 14 }}>⭐ Pizza a tu gusto</div>
          <div data-testid="custom-base-desc" style={{ color: "#C9BCA0", fontSize: 11.5, fontWeight: 600, marginTop: 2 }}>
            Base: {PIZZA_BASE.ing} — {PIZZA_BASE.p.toFixed(2)}€
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ color: "#8C8069", fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase" }}>Esta pizza</div>
          <div data-testid="custom-current-price" style={{ color: C.verde, fontWeight: 900, fontSize: 18, fontFamily: "'DM Mono',monospace" }}>
            {totalPrice.toFixed(2)}€
          </div>
          {selected.length > 0 && (
            <div style={{ color: C.grigio, fontSize: 10 }}>+{extraPriceTotal.toFixed(2)}€ extras</div>
          )}
        </div>
      </div>

      {/* GOAL 12 -- one compact, non-dominant summary (not a second full-
          weight chip row duplicating what the grid's own quantity badges
          already show). Still earns its place: switching ingredient groups
          scrolls previously-picked items in OTHER groups out of view. */}
      {selected.length > 0 && (
        <div data-testid="custom-selection-summary" style={{ flexShrink: 0, padding: "8px 14px 0", color: "#9C8F76", fontSize: 11.5, lineHeight: 1.4 }}>
          Seleccionado: {selected.map((i) => (i.quantity > 1 ? `${i.n} ×${i.quantity}` : i.n)).join(", ")}
        </div>
      )}

      {/* GOAL 11 -- same canonical ingredient grid + quantity/minus grammar
          as normal extras, reused via IngredientGrid, not a second toggle-
          only implementation. */}
      <IngredientGrid
        items={ingredientUniverse}
        quantityOf={quantityOf}
        onIncrement={increment}
        onDecrement={decrement}
        group={group}
        onGroupChange={setGroup}
        chipTestId="custom-ingredient-chip"
        groupFilterTestId="custom-group-filter"
        groupTestId={(g) => `custom-group-${g}`}
        gridTestId="custom-ingredient-grid"
      />

      {/* GOAL 13 -- a real pinned footer below the scrolling grid (flex
          layout, not position:sticky), so it is visible for as long as
          there is something to add, regardless of scroll position. */}
      {selected.length > 0 && (
        <div data-testid="custom-add-cta-bar" style={{
          flexShrink: 0, background: "#191510", borderTop: "2px solid rgba(196,168,122,0.42)",
          boxShadow: "0 -12px 28px rgba(0,0,0,0.55)",
          padding: "12px 14px calc(12px + env(safe-area-inset-bottom, 0px))",
        }}>
          <button data-testid="custom-add-cta" onClick={handleAdd} style={{
            width: "100%",
            background: `linear-gradient(135deg,#C4A87A,#A0854A)`,
            border: "none", color: "#fff", borderRadius: 12,
            padding: "13px 0", fontWeight: 900, fontSize: 15,
            letterSpacing: .3, cursor: "pointer",
            boxShadow: "0 4px 14px rgba(196,168,122,0.35)",
            fontFamily: "'Satoshi',-apple-system,sans-serif",
          }}>
            ⭐ Añadir esta pizza al pedido · {totalPrice.toFixed(2)}€
          </button>
        </div>
      )}
    </div>
  );
};

export default PizzaCustomBuilder;
