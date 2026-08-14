import { useState } from 'react';
import { C, EXTRAS_DULCES, esDulce } from '../../constants';
import { extrasForProduct } from '../../menu/menuAdapter';
import IngredientGrid from './IngredientGrid';

const ALL_GROUPS = "Todos";

// ===============================================================
// ItemConfigurator.jsx — canonical single-item configuration popup.
//
// Slice 2 of the canonical order-picker migration (see
// CANONICAL_MANUAL_PICKER_SLICE_2_MESA_TELEFONO_REPORT_2026-08-14.md).
//
// Configures ONE working-shape cart item: extras add/remove, removed-
// ingredient toggles, manual note. No catalogue browsing, no draft-list
// knowledge, no Mesa/Teléfono/submission knowledge -- it operates entirely
// against `cartApi` (the return value of order/useOrderCart.js's
// useOrderCart(), already the one shared cart-logic hook both channels use
// today) and the single `item` it was opened for.
//
// Self-contained overlay (owns its own backdrop/positioning), matching how
// both of its predecessors (MesaOrderBuilder's ExtrasPanel, ItemPickerModal's
// inline extras popup) already behaved -- callers just conditionally render
// it, no positioning boilerplate needed at the call site.
//
// Extras-availability gate is `canEditExtras()` (menu/extrasPolicy.js) --
// the file's own header explains it exists specifically so the "show a
// pencil" question and the "does the panel behave" question can never
// diverge again. This component IS that panel; the caller decides whether
// to offer the pencil using the same predicate (see DraftSummary.jsx).
// ===============================================================
export function ItemConfigurator({ item, INGREDIENTI, cartApi, onClose }) {
  const { splitSub, addExtra, removeExtra, baseIngredientsOf, isRemoved, toggleRemoved, setNotaLibera } = cartApi;
  const [group, setGroup] = useState(ALL_GROUPS);

  if (!item) return null;

  const dulce = esDulce(item);
  const dynamicAllowed = Array.isArray(item.extrasPermitidos) && item.extrasPermitidos.length > 0;
  const extrasList = dynamicAllowed
    ? extrasForProduct(item, INGREDIENTI)
    : (dulce ? EXTRAS_DULCES : INGREDIENTI);
  const notaLibera = splitSub(item.sub).note;
  const base = baseIngredientsOf(item);

  return (
    <div onClick={onClose} data-testid="item-configurator" style={{
      position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center",
      justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.carbone, borderRadius: 16, width: "min(560px, 100%)", maxHeight: "92%",
        display: "flex", flexDirection: "column", border: `1px solid ${C.fumo}`, overflow: "hidden",
      }}>
        <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${C.fumo}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ color: C.bianco, fontWeight: 800, fontSize: 18 }}>{dulce ? "🍫 Extras dulces" : "🧀 Ingredientes extra"}</div>
          <button onClick={onClose} style={{
            background: C.fumo, color: C.grigio, border: "none", borderRadius: "50%", width: 32, height: 32,
            fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>✕</button>
        </div>
        {/* CANONICAL_MANUAL_PICKER_FINAL_CORRECTION -- extras browsing is now
            the shared IngredientGrid (also used by PizzaCustomBuilder's
            Custom ingredient picker), same grouping rule, same card/
            quantity/minus grammar. `quantityOf` still reads the extras count
            straight off item.sub, exactly as before -- only where that
            counting logic lives moved, not what it does. */}
        <IngredientGrid
          items={extrasList}
          quantityOf={(ing) => splitSub(item.sub).extras.filter((t) => t === `+${ing.n}`).length}
          onIncrement={(ing) => addExtra(item._uid, ing)}
          onDecrement={(ing) => removeExtra(item._uid, ing.n)}
          group={group}
          onGroupChange={setGroup}
          chipTestId="configurator-extra-chip"
          groupFilterTestId="configurator-group-filter"
          groupTestId={(g) => `configurator-group-${g}`}
          gridTestId="configurator-extras-grid"
        />
        {/* ── AJUSTES ZONE ──────────────────────────────────────────────────
            Everything below this point is a DIFFERENT job from the grid above:
            up there you browse and add, down here you take things off, write a
            note and finish. They used to be three stacked strips separated by
            1px hairlines on near-identical near-black, so the whole sheet read
            as one undifferentiated slab and the operator had no landmark.
            This is one raised panel instead: its own lighter ground, a warm
            top rule, a cast shadow that lifts it off the grid, and rounded top
            corners so it visibly sits IN FRONT of the browser rather than
            continuing it. */}
        <div data-testid="configurator-adjust-zone" style={{
          flexShrink: 0, background: "#191510", borderTop: "2px solid rgba(196,168,122,0.42)",
          borderRadius: "16px 16px 0 0", boxShadow: "0 -16px 34px rgba(0,0,0,0.62)",
          position: "relative", zIndex: 1,
        }}>
          {base.length > 0 && (
            <div style={{ padding: "11px 14px 9px", maxHeight: 132, overflowY: "auto" }}>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, color: "#C4A87A", textTransform: "uppercase", marginBottom: 8 }}>Quitar ingredientes</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {base.map((ingName) => {
                  const off = isRemoved(item, ingName);
                  return (
                    <button key={ingName} data-testid="remove-ingredient-chip" aria-pressed={off}
                      onClick={() => toggleRemoved(item._uid, ingName)} style={{
                        background: off ? "rgba(220,38,38,0.18)" : "rgba(255,255,255,0.05)",
                        border: `1.5px solid ${off ? "#DC2626" : "rgba(208,184,145,0.28)"}`,
                        borderRadius: 999, padding: "6px 12px", cursor: "pointer",
                        color: off ? "#FF8A7A" : "#EFE4D2",
                        fontSize: 12, fontWeight: 700, textDecoration: off ? "line-through" : "none",
                      }}>{off ? "✕ " : ""}{ingName}</button>
                  );
                })}
              </div>
            </div>
          )}
          <div style={{
            padding: "10px 16px calc(10px + env(safe-area-inset-bottom, 0px))",
            borderTop: base.length > 0 ? "1px solid rgba(208,184,145,0.14)" : "none",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <input data-testid="configurator-note-input" value={notaLibera} onChange={(e) => setNotaLibera(item._uid, e.target.value)}
              placeholder="Nota cocina (cortar en 4, poco hecha...)"
              style={{
                flex: 1, minWidth: 0, background: "rgba(232,52,28,0.10)",
                border: `1px solid ${notaLibera ? "#E8341C88" : "rgba(208,184,145,0.22)"}`, borderRadius: 8,
                color: notaLibera ? "#FF7A63" : "#CFC3AE", padding: "9px 11px", fontSize: 13,
                fontWeight: notaLibera ? 700 : 400, boxSizing: "border-box",
              }} />
            <button data-testid="configurator-done" onClick={onClose} style={{ background: C.rosso, color: "#fff", border: "none", borderRadius: 10, padding: "10px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer", flexShrink: 0 }}>Listo</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ItemConfigurator;
