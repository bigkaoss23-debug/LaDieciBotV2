import { useState, useEffect } from 'react';
import { C } from '../constants';
import { useMenuData } from '../menu/useMenuData';
import { canEditExtras } from '../menu/extrasPolicy';
import { DRAFT_NO_PERSIST } from '../draftGuard';
import { useOrderCart, isCustomRawItem } from '../order/useOrderCart';
import CatalogBrowser from './order/CatalogBrowser';
import ItemConfigurator from './order/ItemConfigurator';
import DraftSummary from './order/DraftSummary';
import CartBar from './order/CartBar';
import ConfirmDiscardDialog from './order/ConfirmDiscardDialog';

/**
 * ItemPickerModal — Teléfono/Banco/Recogida/Domicilio/WA-escalated's
 * workflow shell for manual product selection, plus the single-line "edit
 * an already-placed item" mode (opened from NuevoPedidoModal's pencil).
 *
 * CANONICAL_MANUAL_PICKER_SLICE_2 -- the interior now composes the SAME
 * shared order/CatalogBrowser + order/ItemConfigurator + order/DraftSummary
 * primitives as Mesa's MesaOrderBuilder.jsx (see that file's own header
 * comment). This is the concrete result the slice exists to produce: Mesa
 * → Nueva comanda and Teléfono → Nuevo pedido now render the same grid, the
 * same casing, the same extras/removal/note UI, and the same "Ver
 * comanda"-style draft review step, instead of two independently hand-
 * rolled pickers that drifted from each other (uppercase Postres/Bebidas
 * names in one, emoji-forward cards in the other, a footer numbering row
 * vs. a corner badge, etc. -- see STAGING_FRONTEND_PICKER_DRIFT_AUDIT_
 * 2026-08-13.md for the original catalogue of that drift).
 *
 * Kept genuinely Teléfono/WhatsApp-escalated-specific: the DIAG_ON dynamic-
 * catalogue-source marker, the modifica-mode single-item edit shell
 * (unified onto DraftSummary + an auto-opened ItemConfigurator, replacing
 * the old "isModifica" branching sprinkled through one giant render), and
 * the create/update/close handoff to the caller (NuevoPedidoModal AND
 * WADettaglio.jsx both still call this exact same external contract
 * unchanged -- {visible, onClose, onAdd, onUpdate, itemEsistente}).
 *
 * One deliberate, documented behavior change: a custom pizza added via the
 * ⭐ Custom tab used to close the whole modal immediately (its own
 * `setItems={updater => {...; onAdd(...); onClose();}}` special case --
 * see the Opus challenge report §4.3, which flagged this as fragile duck-
 * typing and a real, if minor, UX inconsistency: adding a custom pizza
 * behaved differently from adding any other product). CatalogBrowser's
 * `onAddCustom` is now a plain callback with no built-in closing behavior,
 * and this shell wires it to `addRaw` alone -- a custom pizza now
 * accumulates in the cart exactly like any other tap, reviewed via the same
 * "Ver comanda"-style drawer as everything else, only actually committed
 * (onAdd + onClose) when the operator taps "Añadir". This is the natural
 * consequence of adopting the same accumulate-then-review pattern Mesa
 * already used, not an unrelated behavior change layered on top.
 */
const ItemPickerModal = ({ visible, onClose, onAdd, onUpdate, itemEsistente }) => {
  const isModifica = !!itemEsistente;

  // S2-7D4D — catalogue SOURCE. useMenuData is a drop-in returning the same
  // { MENU, CATS, INGREDIENTI } shape this component already used: with
  // REACT_APP_DYNAMIC_MENU_FRONTEND_ENABLED absent/false it returns the static
  // constants unchanged, so existing behaviour is preserved exactly.
  const { MENU, CATS, INGREDIENTI, source: menuSource, emergency: menuEmergency } = useMenuData();

  const cartApi = useOrderCart({ MENU, INGREDIENTI });
  const { cart, cartItems, totalCart, totalQty, qtyOf, increment, decrementBare, addRaw, buildEmittedItem, loadItem, clear, splitForEdit, consolidate } = cartApi;

  // Phase 3 diagnostic marker. Rendered ONLY when the dynamic flag is explicitly on,
  // i.e. in the draft build — a normal published (flag-absent) build never shows it.
  const DIAG_ON = process.env.REACT_APP_DYNAMIC_MENU_FRONTEND_ENABLED === "true";
  const menuMode = menuEmergency ? "fallback" : menuSource;
  const draftLabel = String(menuMode).toUpperCase() + (DRAFT_NO_PERSIST ? " · SIN GUARDAR" : "");

  // uid of the cart line currently open in ItemConfigurator, or null.
  const [extrasOpen, setExtrasOpen] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // GOAL 10 -- same non-empty-draft confirmation gate as Mesa's picker (see
  // MesaOrderBuilder.jsx's own requestClose). Only meaningful in create
  // mode: modifica mode edits a single already-placed line, not an
  // accumulating multi-item draft, so its own ✕ is unchanged.
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const requestClose = () => { if (totalQty > 0) setConfirmDiscardOpen(true); else onClose(); };

  // Reset quando si apre/chiude
  useEffect(() => {
    if (!visible) return;
    if (isModifica) {
      // Modalità modifica: carica l'item nel carrello. Per le pizze/dulce
      // (canEditExtras) saltiamo subito al configuratore -- la matita in
      // Nuevo Pedido porta diretto agli extra, senza passare per un editor
      // intermedio, esattamente come prima.
      const uid = loadItem(itemEsistente);
      setExtrasOpen(canEditExtras(itemEsistente) ? uid : null);
    } else {
      clear();
      setExtrasOpen(null);
      setDrawerOpen(false);
      setConfirmDiscardOpen(false);
    }
  }, [visible]); // eslint-disable-line

  // CANONICAL_MANUAL_PICKER_FINAL_CORRECTION -- Goal 16 root fix. A custom
  // pizza is a raw item, never a working "+Extra, nota" shape -- running it
  // through buildEmittedItem here unconditionally used to re-derive
  // extras/notes by mis-parsing its own legacy `sub` description text
  // ("Base Pelusa + Albahaca fresca, Orégano") as if it were "+Extra, note"
  // tokens, silently overwriting the item's real extras[]/notes with
  // garbage (the exact "⚠ Base Pelusa..." line human UAT found in the outer
  // Teléfono summary). MesaOrderBuilder's handleConfirm already skips
  // buildEmittedItem for custom raw items; this brings Teléfono's own
  // confirm path to the same rule, in both its create and modifica forms.
  const handleConfirm = () => {
    if (cartItems.length === 0) return;
    if (isModifica) {
      const item = cartItems[0];
      onUpdate(isCustomRawItem(item) ? item : buildEmittedItem(item));
    } else {
      cartItems.forEach((item) => onAdd(isCustomRawItem(item) ? item : buildEmittedItem(item)));
    }
    onClose();
  };

  if (!visible) return null;

  // ── Modifica mode: edit ONE already-placed line. No catalogue browsing --
  // configuring an existing selection, not making a new one. ──────────────
  if (isModifica) {
    const item = cartItems[0];
    if (!item) return null;
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 600 }}>
        <DraftSummary
          title="✏️ Modificar item"
          cartItems={[item]} totalCart={totalCart} totalQty={totalQty}
          onSetQty={() => {}} onRemoveLine={() => {}}
          onEditLine={(it) => setExtrasOpen(it._uid)}
          onSetPlainNote={cartApi.setNota}
          showGeneralNote={false} showLineControls={false}
          onClose={onClose}
          primaryAction={{ label: "✏️ Actualizar", onClick: handleConfirm, disabled: false }}
        />
        {/* En modifica, cualquier forma de cerrar el configurador (✕/Listo/
            backdrop) guarda y cierra todo -- el popup ES la pantalla, como
            antes ("closeExtras" original). */}
        {extrasOpen && cart[extrasOpen] && (
          <ItemConfigurator item={cart[extrasOpen]} INGREDIENTI={INGREDIENTI} cartApi={cartApi} onClose={handleConfirm} />
        )}
      </div>
    );
  }

  // ── Create mode ──────────────────────────────────────────────────────────
  return (
    <div onClick={requestClose} style={{
      position: "fixed", inset: 0, zIndex: 600,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.carbone, borderRadius: 20, width: "min(700px, 96vw)", height: "90vh", maxHeight: "90vh",
        display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.7)", overflow: "hidden", position: "relative",
      }}>
        <div style={{
          padding: "14px 18px 10px", borderBottom: `1px solid ${C.fumo}`,
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ color: C.bianco, fontWeight: 800, fontSize: 17 }}>➕ Añadir al pedido</div>
          <button data-testid="ip-picker-close" onClick={requestClose} style={{
            background: C.fumo, color: C.grigio, border: "none", borderRadius: "50%", width: 32, height: 32,
            fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>✕</button>
        </div>

        {/* CANONICAL_MANUAL_PICKER_FINAL_CORRECTION (Goal 13) -- CatalogBrowser
            now owns its own internal scroll + sticky Custom CTA, mirroring
            MesaOrderBuilder's own wrapper (see that file for the full note on
            why position:sticky alone doesn't achieve this). */}
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
          {DIAG_ON && (
            <span
              data-testid="menu-source-marker"
              title={"Catálogo: " + menuMode + (DRAFT_NO_PERSIST ? " · draft sin persistencia" : "")}
              style={{
                position: "absolute", top: 6, left: 8, zIndex: 5,
                fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                padding: "2px 7px", borderRadius: 7,
                background: DRAFT_NO_PERSIST ? "rgba(220,38,38,0.18)"
                  : menuMode === "dynamic" ? "rgba(34,197,94,0.18)" : "rgba(251,191,36,0.18)",
                color: DRAFT_NO_PERSIST ? "#F87171"
                  : menuMode === "dynamic" ? "#22C55E" : "#fbbf24",
                border: "1px solid currentColor", pointerEvents: "none",
              }}
            >
              {draftLabel}
            </span>
          )}
          <CatalogBrowser
            MENU={MENU} CATS={CATS} INGREDIENTI={INGREDIENTI} qtyOf={qtyOf}
            onTapProduct={(p) => increment(p)}
            onDecrementProduct={(p) => decrementBare(p)}
            onAddCustom={(item) => { addRaw(item); setDrawerOpen(true); }}
          />
        </div>

        <CartBar
          totalQty={totalQty} totalCart={totalCart} actionLabel="Ver pedido"
          onOpen={() => setDrawerOpen(true)} testId="ip-ver-pedido"
          emptyHint="Selecciona productos"
        />

        {extrasOpen && cart[extrasOpen] && (
          <ItemConfigurator
            item={cart[extrasOpen]} INGREDIENTI={INGREDIENTI} cartApi={cartApi}
            onClose={() => { consolidate(); setExtrasOpen(null); }}
          />
        )}

        {drawerOpen && (
          <DraftSummary
            title="Tu pedido"
            cartItems={cartItems} totalCart={totalCart} totalQty={totalQty}
            onSetQty={(uid, q) => { if (extrasOpen === uid && q <= 0) setExtrasOpen(null); cartApi.setQty(uid, q); }}
            onRemoveLine={(uid) => { if (extrasOpen === uid) setExtrasOpen(null); cartApi.removeLine(uid); }}
            // Stays open underneath -- see the same call in MesaOrderBuilder.
            // Both channels share this flow by construction, so they have to
            // share its correction too.
            // GOAL 5 -- splitForEdit peels one unit off a qty>1 line before
            // opening the configurator (see useOrderCart.js).
            onEditLine={(item) => setExtrasOpen(splitForEdit(item._uid))}
            onSetPlainNote={cartApi.setNota}
            generalNote="" onSetGeneralNote={() => {}} showGeneralNote={false}
            onClose={() => setDrawerOpen(false)}
            primaryAction={{ label: `✅ Añadir (${totalQty})`, onClick: handleConfirm, disabled: totalQty === 0 }}
          />
        )}

        {confirmDiscardOpen && (
          <ConfirmDiscardDialog
            onCancel={() => setConfirmDiscardOpen(false)}
            onDiscard={onClose}
          />
        )}
      </div>
    </div>
  );
};

export default ItemPickerModal;
