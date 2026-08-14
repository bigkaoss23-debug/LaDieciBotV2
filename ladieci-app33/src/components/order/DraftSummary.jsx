import { C } from '../../constants';
import { canEditExtras } from '../../menu/extrasPolicy';
import { normalizeOrderLine } from '../../menu/normalizeOrderLine';
import OrderLineView from './OrderLineView';

// ===============================================================
// DraftSummary.jsx — canonical "Ver comanda" drawer.
//
// Slice 2 of the canonical order-picker migration (see
// CANONICAL_MANUAL_PICKER_SLICE_2_MESA_TELEFONO_REPORT_2026-08-14.md).
//
// Renders the picker's own in-progress cart (working-shape items, before
// they're handed to the workflow shell) through Slice 1's canonical
// normalizeOrderLine()/OrderLineView -- the same reading contract already
// proven for the post-confirm draft panel and the create-order list, now
// also covering the picker's own internal review step. A custom pizza's
// ingredients and a removed base ingredient show here exactly as they do
// everywhere else Slice 1 already migrated -- one truth, one renderer,
// wherever an order line is displayed.
//
// Self-contained overlay (own backdrop, slides from the bottom), matching
// the proven Mesa drawer this replaces. Whether a line's pencil opens
// ItemConfigurator is decided by `canEditExtras()` -- the same predicate
// ItemConfigurator itself is gated by (menu/extrasPolicy.js) -- never a
// local `cat === "Pizzas"` re-check that could drift from it again. A line
// that doesn't qualify (no extras policy for it) gets a plain note field
// instead, matching what both predecessors already did for those items.
//
// Owns no cart-mutation logic itself -- purely callbacks out to whatever
// the shell's useOrderCart() instance already is.
// ===============================================================
export function DraftSummary({
  title, cartItems, totalCart, totalQty,
  onSetQty, onRemoveLine, onEditLine, onSetPlainNote,
  generalNote, onSetGeneralNote, showGeneralNote = true,
  showLineControls = true,
  onClose, primaryAction,
}) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose} data-testid="draft-summary" style={{
      position: "absolute", inset: 0, zIndex: 30, display: "flex", alignItems: "flex-end",
      justifyContent: "center", background: "rgba(0,0,0,0.6)",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.carbone, width: "100%", maxHeight: "82%", borderRadius: "18px 18px 0 0",
        display: "flex", flexDirection: "column", border: `1px solid ${C.fumo}`, overflow: "hidden",
      }}>
        <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${C.fumo}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ color: C.bianco, fontWeight: 800, fontSize: 16 }}>{title}</div>
          <button onClick={onClose} style={{
            background: C.fumo, color: C.grigio, border: "none", borderRadius: "50%", width: 32, height: 32,
            fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {cartItems.map((item) => {
            const configurable = canEditExtras(item);
            return (
              <div key={item._uid} data-testid="draft-summary-line" style={{
                marginBottom: 10, padding: "10px 12px", background: C.carbone2,
                borderRadius: 12, border: `1px solid ${C.fumo}`,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <OrderLineView line={normalizeOrderLine(item)} showQuantityPrefix />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {configurable && (
                      <button data-testid="draft-summary-edit" onClick={() => onEditLine(item)} style={pencilBtnStyle}>✎</button>
                    )}
                    {showLineControls ? (
                      <>
                        <button data-testid="draft-summary-minus" onClick={() => onSetQty(item._uid, item.q - 1)} style={qtyBtnStyle}>−</button>
                        <span style={{ color: C.bianco, fontWeight: 800, fontSize: 14, minWidth: 18, textAlign: "center", fontFamily: "'DM Mono',monospace" }}>{item.q}</span>
                        <button data-testid="draft-summary-plus" onClick={() => onSetQty(item._uid, item.q + 1)} style={qtyBtnStyle}>+</button>
                        <button data-testid="draft-summary-remove" onClick={() => onRemoveLine(item._uid)} style={{ ...qtyBtnStyle, color: "#F87171" }}>🗑</button>
                      </>
                    ) : (
                      <span data-testid="draft-summary-qty-readonly" style={{ color: C.bianco, fontWeight: 800, fontSize: 14, fontFamily: "'DM Mono',monospace" }}>× {item.q}</span>
                    )}
                  </div>
                </div>
                {!configurable && onSetPlainNote && (
                  <input
                    data-testid="draft-summary-plain-note"
                    value={item.sub || ""}
                    onChange={(e) => onSetPlainNote(item._uid, e.target.value)}
                    placeholder="Nota (opcional)"
                    style={{
                      width: "100%", marginTop: 6, background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${C.fumo}`, borderRadius: 7, color: C.grigio,
                      padding: "5px 8px", fontSize: 11, boxSizing: "border-box",
                    }}
                  />
                )}
                <div style={{ marginTop: 4, textAlign: "right", color: C.grigio, fontSize: 12, fontFamily: "'DM Mono',monospace" }}>
                  {(item.p * item.q).toFixed(2)}€
                </div>
              </div>
            );
          })}
          {showGeneralNote && (
            <div style={{ marginTop: 10 }}>
              <label style={{ color: C.grigio, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>Nota general</label>
              <textarea
                data-testid="draft-summary-general-note"
                value={generalNote}
                onChange={(e) => onSetGeneralNote(e.target.value)}
                placeholder="Nota para toda la comanda (opcional)"
                rows={2}
                style={{
                  width: "100%", marginTop: 6, background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${C.fumo}`, borderRadius: 8, color: C.bianco,
                  padding: "8px 10px", fontSize: 13, boxSizing: "border-box", resize: "vertical",
                }}
              />
            </div>
          )}
        </div>
        <div style={{
          padding: "12px 16px calc(12px + env(safe-area-inset-bottom, 0px))",
          borderTop: `1px solid ${C.fumo}`, display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 12, background: C.carbone2, flexShrink: 0,
        }}>
          <div>
            <div style={{ color: C.grigio, fontSize: 11 }}>{totalQty} artículo{totalQty !== 1 ? "s" : ""}</div>
            <div style={{ color: C.verde, fontWeight: 900, fontSize: 20, fontFamily: "'DM Mono',monospace" }}>{totalCart.toFixed(2)}€</div>
          </div>
          <button
            data-testid="draft-summary-primary-action"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
            style={{
              background: !primaryAction.disabled ? C.rosso : C.fumo, color: "#fff", border: "none",
              borderRadius: 12, padding: "14px 26px", fontWeight: 800, fontSize: 15,
              cursor: !primaryAction.disabled ? "pointer" : "default",
            }}>{primaryAction.label}</button>
        </div>
      </div>
    </div>
  );
}

const qtyBtnStyle = {
  background: C.fumo, color: C.bianco, border: "none", borderRadius: 8, width: 30, height: 30,
  fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};
const pencilBtnStyle = {
  background: "rgba(255,255,255,0.035)", border: `1px solid rgba(208,184,145,0.20)`, borderRadius: 8,
  width: 30, height: 30, fontSize: 14, color: "#fff5e4", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};

export default DraftSummary;
