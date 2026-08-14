import { useState } from 'react';
import { C, pizzaLabel } from '../../constants';
import PizzaCustomBuilder from '../PizzaCustomBuilder';

// ===============================================================
// CatalogBrowser.jsx — canonical category/product browsing surface.
//
// Slice 2 of the canonical order-picker migration (see
// CANONICAL_MANUAL_PICKER_SLICE_2_MESA_TELEFONO_REPORT_2026-08-14.md).
//
// Owns: category tabs, the product grid, and the "⭐ Custom" tab's mount
// point. Does NOT own: menu data fetching (MENU/CATS/INGREDIENTI arrive as
// props from whatever useMenuData() call the host shell already makes —
// this component stays testable with a fixture and channel-agnostic),
// quantity/cart state (the shell owns the draft; this component only reads
// `qtyOf` to paint the badge), submission, or channel context (Mesa's
// covers step, Teléfono's customer/timing fields all live outside this
// component, in the shell).
//
// Visual/interaction baseline is MesaOrderBuilder's (real CSS breakpoints,
// no emoji, uppercase primary product name) per the Slice 2 handoff's
// explicit instruction to use Mesa's picker experience as the baseline for
// BOTH channels -- this is what actually eliminates the casing drift the
// original audit found (Mesa uppercased Postres/Bebidas names in its own
// grid card; ItemPickerModal never did; neither propagated it anywhere
// else). One renderer now, one rule.
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

export function CatalogBrowser({ MENU, CATS, qtyOf, onTapProduct, onAddCustom, initialCategory = "Pizzas" }) {
  const [cat, setCat] = useState(initialCategory);

  return (
    <>
      <div className="catalog-browser-tabs" style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.fumo}`, overflowX: "auto", flexShrink: 0 }}>
        {[...CATS, "⭐ Custom"].map((c) => (
          <button key={c} data-testid={`catalog-cat-${c}`} onClick={() => setCat(c)} style={{
            background: cat === c ? (c === "⭐ Custom" ? "linear-gradient(135deg,#C4A87A,#A0854A)" : C.rosso) : "transparent",
            border: `1.5px solid ${cat === c ? (c === "⭐ Custom" ? "#C4A87A" : C.rosso) : C.fumo}`,
            color: cat === c ? "#fff" : C.grigio,
            borderRadius: 22, padding: "9px 18px", fontSize: 14, fontWeight: 700,
            whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer",
          }}>{c}</button>
        ))}
      </div>

      {cat !== "⭐ Custom" ? (
        <>
          <style>{catalogGridCss}</style>
          <div className="catalog-browser-grid">
            {MENU.filter((m) => m.cat === cat && m.disponible !== false && m.visiblePicker !== false).map((p) => {
              const qty = qtyOf(p.id);
              const lbl = pizzaLabel(p);
              // Presentation only, same data -- pizzaLabel already uppercases
              // numbered-pizza names; extend the same hierarchy to every
              // other category here, in the one place both channels share,
              // instead of leaving it as a Mesa-grid-only special case.
              const primaryLabel = String(lbl.primary || "").toUpperCase();
              return (
                <div key={p.id} data-testid="catalog-product-card" className="catalog-browser-card" onClick={() => onTapProduct(p)} style={{
                  background: qty > 0 ? C.rosso + "22" : C.carbone2,
                  border: `2px solid ${qty > 0 ? C.rosso : C.fumo}`,
                }}>
                  {qty > 0 && (
                    <span style={{
                      position: "absolute", top: -7, right: -7, background: C.rosso, color: "#fff",
                      border: `2px solid ${C.carbone}`, borderRadius: "50%", width: 22, height: 22,
                      fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{qty}</span>
                  )}
                  <div style={{ color: C.bianco, fontSize: 14, fontWeight: 800, lineHeight: 1.25 }}>{primaryLabel}</div>
                  {lbl.secondary && <div style={{ color: "#a99f8b", fontSize: 12, fontStyle: "italic", lineHeight: 1.2, marginTop: 1 }}>{lbl.secondary}</div>}
                  <div style={{ color: qty > 0 ? C.avana : C.rosso, fontSize: 13, fontWeight: 800, marginTop: 4 }}>{p.p.toFixed(2)}€</div>
                  {/* Discreet, only when p.num exists -- the menu's own official
                      number, never invented. Same corner-badge placement as the
                      proven Mesa baseline, now the one place either channel
                      renders it. */}
                  {p.num && (
                    <span data-testid="catalog-pizza-number-badge" style={{
                      position: "absolute", top: -7, left: -7, background: C.carbone, color: "#888",
                      border: `2px solid ${C.fumo}`, borderRadius: 5, minWidth: 18, height: 18, padding: "0 4px",
                      fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{p.num}</span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <PizzaCustomBuilder setItems={adaptCustomBuilderSetItems(onAddCustom)} />
      )}
    </>
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
    border-radius: 14px; padding: 10px 12px; min-height: 64px;
    display: flex; flex-direction: column; justify-content: center;
    position: relative; cursor: pointer;
  }
`;

export default CatalogBrowser;
