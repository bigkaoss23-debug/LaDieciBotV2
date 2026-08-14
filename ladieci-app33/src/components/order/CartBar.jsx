import { C } from '../../constants';

// ===============================================================
// CartBar.jsx — canonical "this is the cart" bottom bar.
//
// CANONICAL_MANUAL_PICKER_FINAL_CORRECTION (2026-08-14), Goals 6+7. Human
// phone UAT: the old sticky footer (a count/total block on the left, a flat
// red "Ver comanda" button on the right) read as just another confirmation
// CTA, not as a cart. This gives it its own grammar -- a cart glyph, an item
// count, a total, and the action -- inside a raised, floating pill instead
// of a flat edge-to-edge strip, plus deliberate safe-area + breathing-room
// padding (Goal 7: UAT found the old bar glued to the physical bottom edge).
//
// Mesa and Teléfono use the SAME component with only their own label text
// ("Ver comanda" vs "Ver pedido") -- one canonical visual grammar, not two
// independently styled footers that could drift apart again.
// ===============================================================
export function CartBar({ totalQty, totalCart, actionLabel, onOpen, emptyHint = "Selecciona productos", testId = "cart-bar-open" }) {
  const hasItems = totalQty > 0;
  return (
    <div
      data-testid="cart-bar-safe-area"
      style={{
        flexShrink: 0, background: C.carbone,
        paddingTop: 10, paddingLeft: 12, paddingRight: 12,
        paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <button
        type="button"
        data-testid={testId}
        onClick={onOpen}
        disabled={!hasItems}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          background: hasItems ? `linear-gradient(135deg, ${C.rosso}, #C22A15)` : C.carbone2,
          border: `1px solid ${hasItems ? "rgba(255,255,255,0.14)" : C.fumo}`,
          borderRadius: 16, padding: "12px 14px",
          boxShadow: hasItems ? "0 8px 22px rgba(232,52,28,0.38), 0 2px 6px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.3)",
          cursor: hasItems ? "pointer" : "default",
        }}
      >
        <span data-testid="cart-bar-icon" aria-hidden="true" style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          background: hasItems ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
        }}>🛒</span>
        <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          {hasItems ? (
            <>
              <span data-testid="cart-bar-count" style={{ display: "block", color: "rgba(255,255,255,0.82)", fontSize: 11, fontWeight: 700 }}>
                {totalQty} artículo{totalQty !== 1 ? "s" : ""}
              </span>
              <span data-testid="cart-bar-total" style={{ display: "block", color: "#fff", fontWeight: 900, fontSize: 18, fontFamily: "'DM Mono',monospace" }}>
                {totalCart.toFixed(2)}€
              </span>
            </>
          ) : (
            <span style={{ color: C.grigio, fontSize: 13, fontWeight: 600 }}>{emptyHint}</span>
          )}
        </span>
        {hasItems && (
          <span data-testid="cart-bar-action" style={{ color: "#fff", fontWeight: 800, fontSize: 14.5, whiteSpace: "nowrap", flexShrink: 0 }}>
            {actionLabel} ›
          </span>
        )}
      </button>
    </div>
  );
}

export default CartBar;
