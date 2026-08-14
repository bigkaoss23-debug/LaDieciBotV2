import { useRef, useState } from 'react';
import { C } from '../../constants';
import { canEditExtras } from '../../menu/extrasPolicy';
import { normalizeOrderLine } from '../../menu/normalizeOrderLine';
import OrderLineView from './OrderLineView';

// ===============================================================
// DraftSummary.jsx — canonical "Ver comanda" drawer / bottom sheet.
//
// CANONICAL_MANUAL_PICKER_FINAL_CORRECTION (2026-08-14) rebuilt the sheet
// itself on top of Slice 2's original (normalizeOrderLine()/OrderLineView
// reading contract untouched -- see that file's own header) after human
// phone UAT:
//
//   Goal 8 -- the sheet read as "functional but flat". Kept every human-
//     approved colour (green extras / red removed / gold note) and control,
//     added real depth (shadow, taller max-height so it uses more of the
//     dimmed space above), a drag handle, and stronger row/price contrast.
//   Goal 9 -- swipe-down-to-dismiss, with a correct bottom-sheet gesture
//     contract: dragging from the handle/header always starts a drag;
//     dragging from within the scrollable line list only starts one when
//     that list is already scrolled to its own top (so an ordinary scroll
//     through a long comanda never gets mistaken for a dismiss gesture).
//     Closes ONLY the sheet -- never the draft (same as the ✕ always did).
//   Goal 7 -- explicit safe-area-inset-bottom + a small deliberate margin,
//     so the sheet's own footer doesn't read as glued to the device edge.
//
// Owns no cart-mutation logic itself -- purely callbacks out to whatever the
// shell's useOrderCart() instance already is.
// ===============================================================
const DRAG_DISMISS_PX = 70;

export function DraftSummary({
  title, cartItems, totalCart, totalQty,
  onSetQty, onRemoveLine, onEditLine, onSetPlainNote,
  generalNote, onSetGeneralNote, showGeneralNote = true,
  showLineControls = true,
  onClose, primaryAction,
}) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const scrollRef = useRef(null);

  const beginDrag = (e) => {
    draggingRef.current = true;
    startYRef.current = e.clientY;
    setDragging(true);
  };
  const onHandlePointerDown = (e) => beginDrag(e);
  const onContentPointerDown = (e) => {
    // Only a candidate dismiss gesture when the line list has nothing left
    // to scroll upward through -- otherwise this is an ordinary scroll.
    if (!scrollRef.current || scrollRef.current.scrollTop <= 0) beginDrag(e);
  };
  const onPanelPointerMove = (e) => {
    if (!draggingRef.current) return;
    const delta = e.clientY - startYRef.current;
    if (delta > 0) setDragY(delta);
  };
  const endDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    if (dragY > DRAG_DISMISS_PX) {
      onClose();
    }
    setDragY(0);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose} data-testid="draft-summary" style={{
      position: "absolute", inset: 0, zIndex: 30, display: "flex", alignItems: "flex-end",
      justifyContent: "center", background: "rgba(0,0,0,0.62)",
    }}>
      <div
        data-testid="draft-summary-panel"
        onClick={(e) => e.stopPropagation()}
        onPointerMove={onPanelPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          background: C.carbone, width: "100%", maxHeight: "88%", borderRadius: "20px 20px 0 0",
          display: "flex", flexDirection: "column", border: `1px solid ${C.fumo}`, overflow: "hidden",
          boxShadow: "0 -18px 48px rgba(0,0,0,0.6)",
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 0.22s ease",
        }}
      >
        <div data-testid="draft-summary-drag-zone" onPointerDown={onHandlePointerDown} style={{ flexShrink: 0, paddingTop: 8, display: "flex", justifyContent: "center", cursor: "grab" }}>
          <span data-testid="draft-summary-handle" aria-hidden="true" style={{ width: 40, height: 4.5, borderRadius: 3, background: "rgba(208,184,145,0.35)" }} />
        </div>
        <div onPointerDown={onHandlePointerDown} style={{ padding: "8px 18px 10px", borderBottom: `1px solid ${C.fumo}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ color: C.bianco, fontWeight: 800, fontSize: 16 }}>{title}</div>
          <button data-testid="draft-summary-close" onClick={onClose} style={{
            background: "rgba(255,255,255,0.07)", color: C.bianco, border: `1px solid ${C.fumo}`, borderRadius: "50%", width: 34, height: 34,
            fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>✕</button>
        </div>
        <div ref={scrollRef} data-testid="draft-summary-content" onPointerDown={onContentPointerDown} style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {cartItems.map((item) => {
            const configurable = canEditExtras(item);
            return (
              <div key={item._uid} data-testid="draft-summary-line" style={{
                marginBottom: 10, padding: "11px 13px", background: C.carbone2,
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
                <div style={{ marginTop: 5, textAlign: "right", color: "#CFC3AE", fontSize: 12.5, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>
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
          paddingTop: 12, paddingLeft: 16, paddingRight: 16,
          paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
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
  background: "rgba(255,255,255,0.09)", color: C.bianco, border: `1px solid ${C.fumo}`, borderRadius: 8, width: 30, height: 30,
  fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};
const pencilBtnStyle = {
  background: "rgba(255,255,255,0.035)", border: `1px solid rgba(208,184,145,0.20)`, borderRadius: 8,
  width: 30, height: 30, fontSize: 14, color: "#fff5e4", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};

export default DraftSummary;
