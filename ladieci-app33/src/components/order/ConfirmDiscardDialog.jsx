import { C } from '../../constants';

// ===============================================================
// ConfirmDiscardDialog.jsx — canonical destructive draft-exit confirmation.
//
// CANONICAL_MANUAL_PICKER_FINAL_CORRECTION (2026-08-14), Goal 10. Human
// phone UAT hit this directly on both channels: the picker's main ✕ used to
// call the same generic close() that a cart-sheet ✕ or a configurator ✕
// use, so tapping it with items already selected silently threw the whole
// draft away. The fix is an explicit ownership rule, not a shared close():
//
//   - Cart-sheet ✕            -> closes ONLY the sheet.        Never asks.
//   - ItemConfigurator ✕      -> closes ONLY the configurator. Never asks.
//   - Main picker ✕ (+ backdrop tap, + Escape at the top level) -> if the
//     draft is empty, closes directly (unchanged). If the draft has
//     anything in it, shows THIS dialog instead of closing.
//
// This component is the confirmation surface for that last case only --
// Cancelar leaves the draft and the picker exactly as they were (no state
// touched at all); Eliminar is the one explicit path that actually discards.
// Shared by Mesa and Teléfono so the copy/behavior can never drift between
// channels.
// ===============================================================
export function ConfirmDiscardDialog({ onCancel, onDiscard }) {
  return (
    <div
      role="alertdialog" aria-modal="true" aria-label="Eliminar este pedido"
      onClick={onCancel}
      data-testid="confirm-discard-dialog"
      style={{
        position: "absolute", inset: 0, zIndex: 50, display: "flex", alignItems: "center",
        justifyContent: "center", background: "rgba(0,0,0,0.68)", padding: 20,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.carbone, borderRadius: 16, width: "min(360px, 100%)",
        border: `1px solid ${C.fumo}`, padding: "20px 20px 16px", boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
      }}>
        <div style={{ color: C.bianco, fontWeight: 800, fontSize: 16, marginBottom: 8 }}>¿Eliminar este pedido?</div>
        <div style={{ color: C.grigio, fontSize: 13.5, lineHeight: 1.4, marginBottom: 18 }}>
          Se perderán los artículos añadidos.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button data-testid="confirm-discard-cancel" onClick={onCancel} style={{
            flex: 1, background: "transparent", border: `1px solid ${C.fumo}`, borderRadius: 10,
            padding: "11px 0", color: C.bianco, fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>Cancelar</button>
          <button data-testid="confirm-discard-eliminar" onClick={onDiscard} style={{
            flex: 1, background: C.rosso, border: "none", borderRadius: 10,
            padding: "11px 0", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer",
          }}>Eliminar</button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDiscardDialog;
