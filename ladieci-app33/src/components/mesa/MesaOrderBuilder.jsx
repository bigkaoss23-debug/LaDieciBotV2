import { useState, useRef, useEffect } from 'react';
import { C, useWidth } from '../../constants';
import { useMenuData } from '../../menu/useMenuData';
import { useOrderCart, isCustomRawItem } from '../../order/useOrderCart';
import { createMesaRequestId, mesaApi, describeMesaError } from '../../mesa/mesaApi';
import CatalogBrowser from '../order/CatalogBrowser';
import ItemConfigurator from '../order/ItemConfigurator';
import DraftSummary from '../order/DraftSummary';
import CartBar from '../order/CartBar';
import ConfirmDiscardDialog from '../order/ConfirmDiscardDialog';

const COVER_QUICK_OPTIONS_FALLBACK = [1, 2, 3, 4, 5, 6, 7, 8];
// MESA_PHONE_POLISH_01 -- the table already implies a likely covers range
// (its own capacity, e.g. "máx 4"); proposing exactly that range instead of
// a fixed 1-8 grid is both more relevant AND visually lighter for the
// common case (a 4-top naturally becomes one row of 4, not two rows of 4).
// Capped at 8 even for a larger table so the quick grid itself never grows
// heavy -- anything beyond it (including, deliberately, beyond capacity
// itself: audited against the backend's addCommand, which only bounds
// covers to 1-99 with no capacity cap, since a real party can genuinely
// exceed a table's nominal seating) is still reachable via the existing
// custom-number input right below, unchanged. Missing/invalid capacity
// (not expected on real staging data, but not guaranteed by the type)
// falls back to the exact previous 1-8 grid -- byte-identical old behavior.
function coverQuickOptions(capacity) {
  const validCapacity = Number.isInteger(capacity) && capacity >= 1 ? capacity : null;
  if (!validCapacity) return COVER_QUICK_OPTIONS_FALLBACK;
  return Array.from({ length: Math.min(validCapacity, 8) }, (_, index) => index + 1);
}

/**
 * MesaOrderBuilder — Mesa's workflow shell: covers pre-step (only if
 * missing) -> canonical picker workspace -> "Confirmar comanda".
 *
 * CANONICAL_MANUAL_PICKER_SLICE_2 -- the interior now composes the shared
 * order/CatalogBrowser + order/ItemConfigurator + order/DraftSummary
 * primitives (also used by ItemPickerModal/NuevoPedidoModal's Teléfono
 * flow) instead of hand-rolling its own grid/extras-panel/drawer JSX. This
 * file keeps everything genuinely Mesa-specific: the covers step, the
 * sticky item-count/total bar, the not-yet-sent-draft reseed logic, the
 * stable client_req_id, and the "confirm locally, no network call here"
 * handoff to the caller. See CANONICAL_MANUAL_PICKER_SLICE_2_MESA_
 * TELEFONO_REPORT_2026-08-14.md for the full before/after.
 *
 * The cart and its emission logic (buildEmittedItem, extras, notes, removed
 * ingredients) are the SAME ones ItemPickerModal uses — reused via
 * useOrderCart, not rewritten.
 */
const MesaOrderBuilder = ({ target, draft, onClose, onConfirm }) => {
  const [coversValue, setCoversValue] = useState(() => draft?.coversTotal ?? target?.coversTotal ?? null);
  const [step, setStep] = useState(() => (draft?.coversTotal ?? target?.coversTotal) == null ? "covers" : "picker");
  const [coversInput, setCoversInput] = useState("");
  const [coversError, setCoversError] = useState("");
  // MESA_SEND_TO_KITCHEN_P0_FIX -- guards the covers step's own network call
  // against a double tap while it's in flight (same discipline as
  // sendingDraft in TabMesa.jsx's MesaWorkspace).
  const [coversSaving, setCoversSaving] = useState(false);

  const { MENU, CATS, INGREDIENTI } = useMenuData();
  const cartApi = useOrderCart({ MENU, INGREDIENTI });
  const { cart, cartItems, totalCart, totalQty, increment, decrementBare, addRaw, qtyOf, buildEmittedItem, replaceCartFromEmitted, splitForEdit, consolidate } = cartApi;

  // uid of the cart line currently open in ItemConfigurator, or null.
  const [extrasOpen, setExtrasOpen] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notaGeneral, setNotaGeneral] = useState(() => draft?.nota || "");
  // GOAL 10 -- the main picker ✕ (and backdrop tap, and top-level Escape)
  // must not silently discard a non-empty draft. Cart-sheet ✕ and
  // configurator ✕ are untouched -- they already only ever close themselves.
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const requestClose = () => { if (totalQty > 0) setConfirmDiscardOpen(true); else onClose(); };

  // Stable per not-yet-sent draft: reused verbatim across every "Modificar"
  // round-trip so Enviar a cocina's own idempotency (in MesaWorkspace) never
  // sees two different ids for what is still the same comanda. Only a fresh
  // (no draft) open mints a new one.
  const reqIdRef = useRef(draft?.client_req_id || createMesaRequestId("mesacmd"));
  // This component remounts fresh every time it opens (ServicioPage always
  // clears mesaCommandTarget to null before setting it again), so "seed once
  // on mount" is exactly "seed once per open" -- no key/effect churn needed.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    if (draft?.items?.length) replaceCartFromEmitted(draft.items);
  }, []); // eslint-disable-line

  const width = useWidth();
  const isPhone = width < 640;

  // Escape chiude il layer più in alto: configurator > drawer > builder
  // intero (gated by the same non-empty-draft confirmation as the ✕/backdrop
  // -- see requestClose). Coerente con CerrarMesaDialog (stesso pattern in
  // questo file).
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (confirmDiscardOpen) { setConfirmDiscardOpen(false); return; }
      if (extrasOpen) { setExtrasOpen(null); return; }
      if (drawerOpen) { setDrawerOpen(false); return; }
      requestClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDiscardOpen, extrasOpen, drawerOpen, totalQty]); // eslint-disable-line

  // MESA_SEND_TO_KITCHEN_P0_FIX (2026-08-14) -- covers are now persisted
  // server-authoritatively the MOMENT the operator selects them, not left
  // local-only until a comanda eventually succeeds. Root cause this closes:
  // covers_total stayed NULL for the entire time an operator was actively
  // building a draft, which is the ONLY signal the service-lifecycle close
  // engine's auto-release sweep had to tell "genuinely empty table" apart
  // from "real order in progress" -- a routine service close silently
  // destroyed a real 113,50€ draft on 2026-08-14 because of exactly that gap
  // (see MESA_SEND_TO_KITCHEN_P0_FIX_2026-08-14.md). A failure here leaves
  // the operator on this same step with a visible error and nothing lost --
  // it must NOT silently fall back to the old local-only behavior, or this
  // exact vulnerability comes right back.
  const confirmCovers = async (rawValue) => {
    if (coversSaving) return;
    const count = Number(rawValue);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setCoversError("Indica un número de comensales válido.");
      return;
    }
    setCoversSaving(true); setCoversError("");
    try {
      await mesaApi.setCovers(target.sessionId, count);
      setCoversValue(count);
      setStep("picker");
    } catch (err) {
      // Fallback kept deliberately non-empty: an operator must never see a
      // blank error banner and be left guessing whether anything happened.
      setCoversError(describeMesaError(err) || "No se pudo guardar el número de comensales. Inténtalo de nuevo.");
    } finally {
      setCoversSaving(false);
    }
  };

  // Local-only: validates the cart, builds the same emitted-item shape the
  // backend contract expects, and hands it to the caller as a draft. No
  // network call, no loading/error state -- those belong to Enviar a cocina
  // now (MesaWorkspace), the only place this draft is ever actually sent.
  const handleConfirm = () => {
    if (cartItems.length === 0) return;
    const items = cartItems.map((item) => (isCustomRawItem(item) ? item : buildEmittedItem(item)));
    onConfirm({
      items,
      nota: notaGeneral,
      coversTotal: coversValue,
      client_req_id: reqIdRef.current,
    });
  };

  const extrasTarget = extrasOpen ? cart[extrasOpen] : null;

  // ── Step 1: covers (only if missing) ──────────────────────────────────
  if (step === "covers") {
    const quickOptions = coverQuickOptions(target?.capacity);
    return (
      <div onClick={onClose} style={overlayStyle}>
        <div role="dialog" aria-modal="true" aria-label={`Mesa ${target.tableNumber} comensales`} onClick={e => e.stopPropagation()} style={{ ...panelStyle, width: "min(440px, 92vw)", maxHeight: "auto" }}>
          <div style={headerStyle}>
            <div style={{ color: C.bianco, fontWeight: 800, fontSize: 17 }}>
              Mesa {target.tableNumber} · primera comanda
            </div>
            <button onClick={onClose} style={closeBtnStyle}>✕</button>
          </div>
          <div style={{ padding: 18 }}>
            <div style={{ color: C.grigio, fontSize: 13, marginBottom: 14 }}>¿Cuántos comensales?</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(quickOptions.length, 4)}, 1fr)`, gap: 10, marginBottom: 14 }}>
              {quickOptions.map(n => (
                <button key={n} data-testid={`covers-quick-${n}`} disabled={coversSaving} onClick={() => confirmCovers(n)} style={{
                  background: C.carbone2, border: `2px solid ${C.fumo}`, borderRadius: 12,
                  padding: "16px 0", color: C.bianco, fontSize: 20, fontWeight: 800,
                  cursor: coversSaving ? "default" : "pointer", opacity: coversSaving ? 0.6 : 1,
                }}>{n}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number" min="1" max="99" value={coversInput} autoFocus
                data-testid="covers-custom-input"
                disabled={coversSaving}
                onChange={e => { setCoversInput(e.target.value); setCoversError(""); }}
                onKeyDown={e => { if (e.key === "Enter" && coversInput) confirmCovers(coversInput); }}
                placeholder={`Otro número (${quickOptions.length + 1}-99)`}
                style={{
                  flex: 1, background: C.carbone2, border: `1px solid ${C.fumo}`, borderRadius: 10,
                  color: C.bianco, padding: "12px 12px", fontSize: 15, boxSizing: "border-box",
                }}
              />
              <button
                data-testid="covers-custom-confirm"
                disabled={!coversInput || coversSaving}
                onClick={() => confirmCovers(coversInput)}
                style={{
                  background: coversInput && !coversSaving ? C.rosso : C.fumo, color: "#fff", border: "none",
                  borderRadius: 10, padding: "12px 18px", fontWeight: 800, fontSize: 14,
                  cursor: coversInput && !coversSaving ? "pointer" : "default",
                }}>{coversSaving ? "Guardando…" : "Continuar"}</button>
            </div>
            {coversError && <div data-testid="covers-error" style={{ color: "#F87171", fontSize: 12, marginTop: 10 }}>{coversError}</div>}
            <button onClick={onClose} style={{
              marginTop: 16, width: "100%", background: "transparent", border: `1px solid ${C.fumo}`,
              borderRadius: 10, padding: "10px 0", color: C.grigio, fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: picker workspace (carrello persistente) ─────────────────────
  return (
    <div onClick={requestClose} style={overlayStyle}>
      <div role="dialog" aria-modal="true" aria-label={`Nueva comanda Mesa ${target.tableNumber}`} onClick={e => e.stopPropagation()} style={{ ...panelStyle, width: "min(760px, 97vw)", height: isPhone ? "100dvh" : "92vh", maxHeight: isPhone ? "100dvh" : "92vh", borderRadius: isPhone ? 0 : 20 }}>
        {/* GOAL 1 -- "Mesa N" is now the dominant line; "Nueva comanda" is a
            small subordinate eyebrow above it rather than the loudest text
            in the header, and "N comensales" moved off C.grigio (#666 on
            #0E0E0E was the "too dim" human UAT flagged) onto a lighter warm
            tone -- same header height as before, just reordered weight. */}
        <div style={headerStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#9C8F76", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", lineHeight: 1 }}>Nueva comanda</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginTop: 3 }}>
              <div style={{ color: C.bianco, fontWeight: 900, fontSize: 19 }}>Mesa {target.tableNumber}</div>
              <div style={{ color: "#D8CBB0", fontSize: 13.5, fontWeight: 700 }}>{coversValue} comensal{coversValue !== 1 ? "es" : ""}</div>
            </div>
          </div>
          <button data-testid="mesa-picker-close" onClick={requestClose} style={closeBtnStyle}>✕</button>
        </div>

        {/* CANONICAL_MANUAL_PICKER_FINAL_CORRECTION (Goal 13) -- CatalogBrowser
            now owns its own internal scroll + sticky Custom CTA, so this
            wrapper only constrains height (flex:1 inside the panel's own flex
            column) and no longer scrolls itself. */}
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <CatalogBrowser
            MENU={MENU} CATS={CATS} INGREDIENTI={INGREDIENTI} qtyOf={qtyOf}
            onTapProduct={(p) => increment(p)}
            onDecrementProduct={(p) => decrementBare(p)}
            onAddCustom={(item) => { addRaw(item); setDrawerOpen(true); }}
          />
        </div>

        <CartBar
          totalQty={totalQty} totalCart={totalCart} actionLabel="Ver comanda"
          onOpen={() => setDrawerOpen(true)} testId="mesa-ver-comanda"
        />

        {extrasTarget && (
          <ItemConfigurator
            item={extrasTarget} INGREDIENTI={INGREDIENTI} cartApi={cartApi}
            onClose={() => { consolidate(); setExtrasOpen(null); }}
          />
        )}

        {drawerOpen && (
          <DraftSummary
            title={`Mesa ${target.tableNumber} · comanda`}
            cartItems={cartItems} totalCart={totalCart} totalQty={totalQty}
            onSetQty={(uid, q) => { if (extrasOpen === uid && q <= 0) setExtrasOpen(null); cartApi.setQty(uid, q); }}
            onRemoveLine={(uid) => { if (extrasOpen === uid) setExtrasOpen(null); cartApi.removeLine(uid); }}
            // The drawer deliberately STAYS open underneath. ItemConfigurator
            // is z-index 40 against DraftSummary's 30 and both are siblings in
            // this panel, so it already stacks on top -- closing it reveals the
            // comanda summary the operator opened it from, which is where they
            // expect to land. Closing the drawer here instead (the previous
            // behaviour) dumped them back onto the raw product grid after every
            // single edit, losing the review context mid-proof-read.
            // GOAL 5 -- splitForEdit peels one unit off a qty>1 line before
            // opening the configurator, so an edit never silently applies to
            // every unit in the line (see useOrderCart.js's own header note).
            onEditLine={(item) => setExtrasOpen(splitForEdit(item._uid))}
            onSetPlainNote={cartApi.setNota}
            generalNote={notaGeneral}
            onSetGeneralNote={setNotaGeneral}
            onClose={() => setDrawerOpen(false)}
            primaryAction={{ label: "Confirmar comanda", onClick: handleConfirm, disabled: totalQty === 0 }}
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

const overlayStyle = {
  // Above MesaWorkspace's own overlay (TabMesa.jsx .mesa-overlay, z-index
  // 1200) on purpose: MesaWorkspace is left mounted underneath while this is
  // open (see "＋ Nueva comanda"/"Modificar", which no longer close it
  // first), so closing/confirming this picker reveals it already showing
  // the right table, no re-open step needed.
  position: "fixed", inset: 0, zIndex: 1300, display: "flex", alignItems: "center",
  justifyContent: "center", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
};
const panelStyle = {
  background: C.carbone, borderRadius: 20, maxHeight: "90vh", display: "flex",
  flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.7)", overflow: "hidden", position: "relative",
};
const headerStyle = {
  padding: "14px 18px 10px", borderBottom: `1px solid ${C.fumo}`, display: "flex",
  alignItems: "center", justifyContent: "space-between", flexShrink: 0,
};
const closeBtnStyle = {
  background: C.fumo, color: C.grigio, border: "none", borderRadius: "50%", width: 32, height: 32,
  fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
};

export default MesaOrderBuilder;
