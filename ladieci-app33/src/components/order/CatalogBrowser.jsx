import { useState } from 'react';
import { C, pizzaLabel } from '../../constants';
import PizzaCustomBuilder from '../PizzaCustomBuilder';

// ===============================================================
// CatalogBrowser.jsx — canonical category/product browsing surface.
//
// CANONICAL_MANUAL_PICKER_FINAL_CORRECTION (2026-08-14) rebuilt this on top
// of Slice 2's original (see CANONICAL_MANUAL_PICKER_SLICE_2_MESA_TELEFONO_
// REPORT_2026-08-14.md) after a full human phone UAT pass. Two structural
// changes on top of the original contract:
//
//   - Owns its OWN internal scroll + a definite flex height now, instead of
//     letting the shell's outer wrapper scroll tabs+grid together. This is
//     what lets the ⭐ Custom tab give its "Añadir esta pizza" CTA a genuine
//     sticky footer (Goal 13) below the ingredient grid's own scroll -- a
//     CSS `position:sticky` button placed early in a long scrolling list
//     does NOT stay visible while scrolling down through it (it only
//     "catches" the viewport edge once scrolled past), so the fix is
//     structural, not a sticky-position tweak. Callers must give this
//     component a definite height (flex:1 inside a flex column, itself not
//     independently scrolling) -- see MesaOrderBuilder.jsx / ItemPickerModal
//     .jsx's own wrapper div.
//   - Card semantics + the 4 macro tabs were redesigned; see the two blocks
//     below for the specific per-goal rationale.
//
// Owns: category tabs, the product grid, and the "⭐ Custom" tab's mount
// point. Does NOT own: menu data fetching (MENU/CATS/INGREDIENTI arrive as
// props from whatever useMenuData() call the host shell already makes),
// quantity/cart state (the shell owns the draft; this component only reads
// `qtyOf` to paint the badge and calls back out to mutate it), submission,
// or channel context (Mesa's covers step, Teléfono's customer/timing fields
// all live outside this component, in the shell).
// ===============================================================

// PizzaCustomBuilder's own prop contract is a bare `setItems` React-setState
// updater, duck-typed as an event channel by every existing caller (each
// hand-rolls the same "invoke it against a throwaway array, take the last
// result" trick -- see the Opus report §4.3). Centralizing that adapter
// HERE, once, correctly, is what lets CatalogBrowser expose a normal
// `onAddCustom(item)` callback to its own caller -- PizzaCustomBuilder.jsx
// itself is untouched; this is the one place the duck-typing is absorbed
// instead of re-hand-rolled a third time.
function adaptCustomBuilderSetItems(onAddCustom) {
  return (updater) => {
    const result = typeof updater === "function" ? updater([]) : updater;
    if (result && result.length > 0) onAddCustom(result[result.length - 1]);
  };
}

// One constant instead of four string literals that all had to stay in sync
// (the tab list, two style branches and the render branch) -- a rename or a
// stray space in any one of them silently unmounted the builder.
// MESA V2.1.1 -- plain text, matching the other three tabs (Pizzas/Postres/
// Bebidas carry no icon either); a decorative star made this the only tab
// with emoji-style iconography in an otherwise plain tab bar.
const CUSTOM_TAB = "Custom";

export function CatalogBrowser({ MENU, CATS, INGREDIENTI, qtyOf, onTapProduct, onDecrementProduct, onAddCustom, initialCategory = "Pizzas" }) {
  const [cat, setCat] = useState(initialCategory);
  const allCats = [...CATS, CUSTOM_TAB];
  // GOAL 2 — the 4 real-world top-level categories (Pizzas/Postres/Bebidas/
  // Custom) must all be visible on a supported iPhone width with NO
  // horizontal scroll. A CSS grid of equal-width columns fits any small,
  // fixed tab count by construction (no scroll possible -- there is no
  // overflow to scroll). If the catalogue ever grows past a handful of
  // top-level categories, that grid degrades badly (columns too narrow), so
  // this only applies up to 4 tabs; a larger set falls back to the previous
  // scrollable row (with its own proven end-of-scroll spacer fix) rather
  // than silently mis-rendering.
  const useGridTabs = allCats.length <= 4;

  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div
        className="catalog-browser-tabs"
        data-testid="catalog-browser-tabs"
        style={useGridTabs ? {
          display: "grid", gridTemplateColumns: `repeat(${allCats.length}, 1fr)`, gap: 6,
          padding: "8px 10px", borderBottom: `1px solid ${C.fumo}`, flexShrink: 0,
        } : {
          display: "flex", gap: 8, padding: "10px 0 10px 14px", borderBottom: `1px solid ${C.fumo}`,
          overflowX: "auto", flexShrink: 0,
        }}
      >
        {allCats.map((c) => (
          <button key={c} data-testid={`catalog-cat-${c}`} onClick={() => setCat(c)} style={{
            background: cat === c ? (c === CUSTOM_TAB ? "linear-gradient(135deg,#C4A87A,#A0854A)" : C.rosso) : "transparent",
            border: `1.5px solid ${cat === c ? (c === CUSTOM_TAB ? "#C4A87A" : C.rosso) : C.fumo}`,
            color: cat === c ? "#fff" : C.grigio,
            borderRadius: useGridTabs ? 14 : 22, padding: useGridTabs ? "9px 4px" : "9px 18px",
            fontSize: useGridTabs ? 12.5 : 14, fontWeight: 700, lineHeight: 1.25,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            minWidth: 0, textAlign: "center", flexShrink: useGridTabs ? undefined : 0, cursor: "pointer",
          }}>{c}</button>
        ))}
        {/* THE TRAILING SPACER IS THE FIX, not decoration -- only needed for
            the scrollable fallback. A flex row that scrolls horizontally
            does not honour its own padding-right at the scroll end in
            WebKit/Blink; padding-right moved off the container and
            re-expressed as a real, unshrinkable child, which every engine
            does honour. The grid layout above has no scroll to clip. */}
        {!useGridTabs && (
          <span aria-hidden="true" data-testid="catalog-tabs-end-spacer"
            style={{ flex: "0 0 14px", width: 14 }} />
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {cat !== CUSTOM_TAB ? (
          <>
            <style>{catalogGridCss}</style>
            <div className="catalog-browser-grid-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
              <div className="catalog-browser-grid">
                {MENU.filter((m) => m.cat === cat && m.disponible !== false && m.visiblePicker !== false).map((p) => {
                  const qty = qtyOf(p.id);
                  const lbl = pizzaLabel(p);
                  // Presentation only, same data -- pizzaLabel already
                  // uppercases numbered-pizza names; extend the same
                  // hierarchy to every other category here, in the one
                  // place both channels share.
                  const primaryLabel = String(lbl.primary || "").toUpperCase();
                  return (
                    <div key={p.id} data-testid="catalog-product-card" className="catalog-browser-card" onClick={() => onTapProduct(p)} style={{
                      background: qty > 0 ? C.rosso + "22" : C.carbone2,
                      border: `2px solid ${qty > 0 ? C.rosso : C.fumo}`,
                    }}>
                      {/* GOAL 3 — number/quantity/price no longer compete for
                          the same corner. Selected quantity = TOP LEFT (the
                          thing the operator is actively changing), catalogue
                          number = BOTTOM RIGHT (identity, glanced at less
                          often), price = BOTTOM LEFT. */}
                      {qty > 0 && (
                        <span data-testid="catalog-qty-badge" style={{
                          position: "absolute", top: -8, left: -8, background: C.rosso, color: "#fff",
                          border: `2.5px solid ${C.carbone}`, borderRadius: "50%", width: 25, height: 25,
                          fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center",
                          boxShadow: "0 2px 8px rgba(232,52,28,0.55)", zIndex: 2,
                        }}>{qty}</span>
                      )}
                      {/* GOAL 4 — quick decrement straight from the card, no
                          cart trip needed to correct an accidental extra tap.
                          Opposite corner from the qty badge on purpose: two
                          different actions never share a tap target. */}
                      {qty > 0 && onDecrementProduct && (
                        <button
                          type="button" data-testid="catalog-decrement"
                          aria-label={`Quitar una unidad de ${p.n}`}
                          onClick={(e) => { e.stopPropagation(); onDecrementProduct(p); }}
                          style={{
                            position: "absolute", top: -8, right: -8, background: C.carbone, color: "#fff",
                            border: `2px solid ${C.rosso}`, borderRadius: "50%", width: 24, height: 24,
                            fontSize: 17, fontWeight: 900, lineHeight: 1, display: "flex", alignItems: "center",
                            justifyContent: "center", cursor: "pointer", zIndex: 2,
                          }}>−</button>
                      )}
                      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        <div style={{ color: C.bianco, fontSize: 14, fontWeight: 800, lineHeight: 1.25 }}>{primaryLabel}</div>
                        {lbl.secondary && <div style={{ color: "#a99f8b", fontSize: 12, fontStyle: "italic", lineHeight: 1.2, marginTop: 1 }}>{lbl.secondary}</div>}
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 6 }}>
                        <span data-testid="catalog-product-price" style={{ color: qty > 0 ? C.avana : C.rosso, fontSize: 13, fontWeight: 800 }}>{p.p.toFixed(2)}€</span>
                        {/* Discreet, only when p.num exists -- the menu's own
                            official number, never invented. */}
                        {p.num && (
                          <span data-testid="catalog-pizza-number-badge" style={{
                            background: "#3A2E1C", color: "#F0D9A8",
                            border: "2px solid #8A6F3F", borderRadius: 5, minWidth: 18, height: 18, padding: "0 4px",
                            fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center",
                          }}>{p.num}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <PizzaCustomBuilder INGREDIENTI={INGREDIENTI} setItems={adaptCustomBuilderSetItems(onAddCustom)} />
        )}
      </div>
    </div>
  );
}

// Real CSS breakpoints, not JS width-branching -- carried verbatim from the
// proven Mesa baseline (MesaOrderBuilder.jsx's own pickerGridCss): phone
// portrait 2 columns (1 only if genuinely too narrow), tablet portrait ~3,
// tablet landscape/desktop ~4. No UA sniffing.
const catalogGridCss = `
  .catalog-browser-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 14px; }
  @media (max-width: 359px) { .catalog-browser-grid { grid-template-columns: 1fr; } }
  @media (min-width: 768px) { .catalog-browser-grid { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 1024px) { .catalog-browser-grid { grid-template-columns: repeat(4, 1fr); } }
  .catalog-browser-card {
    border-radius: 14px; padding: 12px 12px 10px; min-height: 76px;
    display: flex; flex-direction: column;
    position: relative; cursor: pointer;
  }
`;

export default CatalogBrowser;
