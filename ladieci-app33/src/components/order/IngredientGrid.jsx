import { C } from '../../constants';
import { ingredientGroupOf, groupsPresent } from '../../menu/ingredientGroups';

const ALL_GROUPS = "Todos";

// Only ever consulted when an ingredient carries no emoji of its own.
const GROUP_FALLBACK_EMOJI = {
  Base: "🍕", Verduras: "🥬", Quesos: "🧀", Carnes: "🥓",
  Pescados: "🐟", Especias: "🌿", Dulces: "🍫", Otros: "✨",
};

// ===============================================================
// IngredientGrid.jsx — the ONE canonical ingredient browsing/category grid.
//
// CANONICAL_MANUAL_PICKER_FINAL_CORRECTION (2026-08-14) -- extracted out of
// ItemConfigurator.jsx (extras add/remove) so PizzaCustomBuilder.jsx (Custom
// pizza ingredient selection) can reuse the exact same grouping rule, group
// filter, card layout and quantity/minus grammar instead of maintaining a
// second, independent ingredient browser (the architecture mandate this
// pass is explicit about). Only the "buyable" universe (prezzo > 0 --
// base-included ingredients carry prezzo:0 in both the static and dynamic
// catalogue and are never browsable here), the grouping (menu/
// ingredientGroups.js), and the card/quantity/minus visuals are shared.
// What COUNTS as +1 (an extra add vs a custom-ingredient pick) and what the
// resulting quantity MEANS stay entirely with the caller via quantityOf/
// onIncrement/onDecrement -- this component holds no cart or draft state of
// its own.
//
// Visuals are a verbatim carry-over of ItemConfigurator's own proven extras
// grid (human-UAT-approved: emoji, group filter, quantity badge, explicit
// minus) -- Goal 19 requires preserving that direction, not reinventing it.
// ===============================================================
export function IngredientGrid({
  items, quantityOf, onIncrement, onDecrement,
  group, onGroupChange,
  chipTestId = "ingredient-chip",
  groupFilterTestId = "ingredient-group-filter",
  groupTestId = (g) => `ingredient-group-${g}`,
  gridTestId = "ingredient-grid",
}) {
  // Only the purchasable ingredients are ever browsable -- base-included
  // ones (prezzo:0) never appear here, in either context.
  const buyable = (items || []).filter((ing) => ing.prezzo > 0);
  const groups = groupsPresent(buyable);
  const activeGroup = groups.includes(group) ? group : ALL_GROUPS;
  const visible = activeGroup === ALL_GROUPS
    ? buyable
    : buyable.filter((ing) => ingredientGroupOf(ing) === activeGroup);

  return (
    <>
      {/* Rendered only when the data actually supports more than one family
          (groupsPresent returns [] below two), so a short allowlist never
          grows a chip row that filters nothing. */}
      {groups.length > 0 && (
        <div data-testid={groupFilterTestId} style={{
          display: "flex", gap: 6, padding: "9px 0 9px 12px", overflowX: "auto",
          flexShrink: 0, borderBottom: `1px solid ${C.fumo}`, background: "rgba(255,255,255,0.018)",
        }}>
          {[ALL_GROUPS, ...groups].map((g) => (
            <button key={g} data-testid={groupTestId(g)} onClick={() => onGroupChange(g)} style={{
              background: activeGroup === g ? "rgba(196,168,122,0.20)" : "transparent",
              border: `1.5px solid ${activeGroup === g ? "#C4A87A" : C.fumo}`,
              color: activeGroup === g ? "#F0D9A8" : C.grigio,
              borderRadius: 999, padding: "6px 13px", fontSize: 12.5, fontWeight: 800,
              whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer",
            }}>{g}</button>
          ))}
          <span aria-hidden="true" style={{ flex: "0 0 12px", width: 12 }} />
        </div>
      )}

      <div data-testid={gridTestId} style={{ flex: 1, overflowY: "auto", padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(116px, 1fr))", gap: 8, alignContent: "start" }}>
        {visible.map((ing) => {
          const qty = quantityOf(ing);
          return (
            <button key={ing.id} data-testid={chipTestId} onClick={() => onIncrement(ing)} style={{
              background: qty > 0 ? C.rosso + "22" : C.carbone2, border: `2px solid ${qty > 0 ? C.rosso : C.fumo}`,
              borderRadius: 12, padding: "10px 4px", minHeight: 76, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 4, position: "relative", cursor: "pointer",
            }}>
              {qty > 0 && <span style={{
                position: "absolute", top: -8, right: -8, background: C.rosso, color: "#fff",
                border: `2px solid ${C.carbone}`, borderRadius: "50%", width: 22, height: 22,
                fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center",
              }}>{qty}</span>}
              {qty > 0 && (
                <span role="button" aria-label={`Quitar ${ing.n}`}
                  onClick={(e) => { e.stopPropagation(); onDecrement(ing); }}
                  style={{
                    position: "absolute", top: -8, left: -8, background: C.carbone, color: "#fff",
                    border: `2px solid ${C.rosso}`, borderRadius: "50%", width: 22, height: 22,
                    fontSize: 16, fontWeight: 900, lineHeight: 1, display: "flex", alignItems: "center",
                    justifyContent: "center", cursor: "pointer", zIndex: 2,
                  }}>−</span>
              )}
              {/* La Dieci's extras are recognised by their emoji as much as
                  by their name, so the emoji stays. The per-family fallback
                  covers dynamic-catalogue rows that carry no emoji of their
                  own: without it that span renders empty and the card's
                  height collapses. */}
              <span style={{ fontSize: 20, lineHeight: 1.1, pointerEvents: "none" }}>
                {ing.e || GROUP_FALLBACK_EMOJI[ingredientGroupOf(ing)] || "•"}
              </span>
              <span style={{ color: C.bianco, fontSize: 13, fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>{ing.n}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export default IngredientGrid;
