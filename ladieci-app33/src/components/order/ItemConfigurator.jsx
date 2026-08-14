import { useState } from 'react';
import { C, EXTRAS_DULCES, esDulce } from '../../constants';
import { extrasForProduct } from '../../menu/menuAdapter';
import { ingredientGroupOf, groupsPresent } from '../../menu/ingredientGroups';

const ALL_GROUPS = "Todos";

// Only ever consulted when an ingredient carries no emoji of its own.
const GROUP_FALLBACK_EMOJI = {
  Base: "🍕", Verduras: "🥬", Quesos: "🧀", Carnes: "🥓",
  Pescados: "🐟", Especias: "🌿", Dulces: "🍫", Otros: "✨",
};

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

  // Only the purchasable extras are ever browsable, exactly as before —
  // grouping is applied to that same list, never to a different one.
  const buyable = extrasList.filter((ing) => ing.prezzo > 0);
  const groups = groupsPresent(buyable);
  const activeGroup = groups.includes(group) ? group : ALL_GROUPS;
  const visible = activeGroup === ALL_GROUPS
    ? buyable
    : buyable.filter((ing) => ingredientGroupOf(ing) === activeGroup);

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
        {/* ── GROUP FILTER ──────────────────────────────────────────────────
            Rendered only when the data actually supports more than one family
            (groupsPresent returns [] below two), so a short allowlist — a
            product with four permitted extras — never grows a chip row that
            filters nothing. Same trailing-spacer fix as the category tabs:
            padding-right is not honoured at a horizontal scroll end. */}
        {groups.length > 0 && (
          <div data-testid="configurator-group-filter" style={{
            display: "flex", gap: 6, padding: "9px 0 9px 12px", overflowX: "auto",
            flexShrink: 0, borderBottom: `1px solid ${C.fumo}`, background: "rgba(255,255,255,0.018)",
          }}>
            {[ALL_GROUPS, ...groups].map((g) => (
              <button key={g} data-testid={`configurator-group-${g}`} onClick={() => setGroup(g)} style={{
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

        <div data-testid="configurator-extras-grid" style={{ flex: 1, overflowY: "auto", padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(116px, 1fr))", gap: 8, alignContent: "start" }}>
          {visible.map((ing) => {
            const veces = splitSub(item.sub).extras.filter((t) => t === `+${ing.n}`).length;
            return (
              <button key={ing.id} data-testid="configurator-extra-chip" onClick={() => addExtra(item._uid, ing)} style={{
                background: veces > 0 ? C.rosso + "22" : C.carbone2, border: `2px solid ${veces > 0 ? C.rosso : C.fumo}`,
                borderRadius: 12, padding: "10px 4px", minHeight: 76, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 4, position: "relative", cursor: "pointer",
              }}>
                {veces > 0 && <span style={{
                  position: "absolute", top: -8, right: -8, background: C.rosso, color: "#fff",
                  border: `2px solid ${C.carbone}`, borderRadius: "50%", width: 22, height: 22,
                  fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center",
                }}>{veces}</span>}
                {veces > 0 && (
                  <span role="button" aria-label={`Quitar ${ing.n}`}
                    onClick={(e) => { e.stopPropagation(); removeExtra(item._uid, ing.n); }}
                    style={{
                      position: "absolute", top: -8, left: -8, background: C.carbone, color: "#fff",
                      border: `2px solid ${C.rosso}`, borderRadius: "50%", width: 22, height: 22,
                      fontSize: 16, fontWeight: 900, lineHeight: 1, display: "flex", alignItems: "center",
                      justifyContent: "center", cursor: "pointer", zIndex: 2,
                    }}>−</span>
                )}
                {/* La Dieci's extras are recognised by their emoji as much as
                    by their name, so the emoji stays — explicitly kept, not
                    incidental. The per-family fallback covers dynamic-catalogue
                    rows that carry no emoji of their own: without it that span
                    renders empty and the card's height collapses, which is
                    what makes a grid of otherwise-identical chips hard to scan. */}
                <span style={{ fontSize: 20, lineHeight: 1.1, pointerEvents: "none" }}>
                  {ing.e || GROUP_FALLBACK_EMOJI[ingredientGroupOf(ing)] || "•"}
                </span>
                <span style={{ color: C.bianco, fontSize: 13, fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>{ing.n}</span>
              </button>
            );
          })}
        </div>
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
