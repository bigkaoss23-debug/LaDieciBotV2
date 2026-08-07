import { useState, useRef, useEffect } from 'react';
import { C, EXTRAS_DULCES, pizzaLabel, esDulce, useWidth } from '../../constants';
import { useMenuData } from '../../menu/useMenuData';
import { canEditExtras } from '../../menu/extrasPolicy';
import { extrasForProduct } from '../../menu/menuAdapter';
import { useOrderCart, isCustomRawItem } from '../../order/useOrderCart';
import { createMesaRequestId } from '../../mesa/mesaApi';
import PizzaCustomBuilder from '../PizzaCustomBuilder';

const COVER_QUICK_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * MesaOrderBuilder — Option C from the audit (V1_STAGING_MESA_ORDER_FLOW_
 * PICKER_ARCHITECTURE_AUDIT.md): a dedicated Mesa builder replacing the
 * NuevoPedidoModal pass-through. No customer/phone/direccion/planner screen:
 * just covers (only if missing) -> persistent-cart picker workspace ->
 * "Confirmar comanda".
 *
 * S2-mesa-final-ux (pre-command flow): this component never talks to the
 * backend. "Confirmar comanda" hands a local draft to the caller (via
 * onConfirm) and closes -- the caller is MesaWorkspace's owner, which shows
 * the draft expanded and is the ONLY place "Enviar a cocina" (the real
 * mesaApi.addCommand call) happens. `draft`, when passed in, is a
 * previously-confirmed-but-not-yet-sent draft for this same table
 * ("Modificar") -- the cart, covers and client_req_id are all reseeded from
 * it so editing never starts from a blank slate or mints a new idempotency
 * id for what is still the same not-yet-sent comanda.
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

  const { MENU, CATS, INGREDIENTI } = useMenuData();
  const {
    cart, cartItems, totalCart, totalQty,
    increment, decrement, removeLine, setQty, qtyOf,
    addExtra, removeExtra, toggleRemoved, isRemoved, baseIngredientsOf,
    setNota, setNotaLibera, splitSub,
    buildEmittedItem, addRaw, replaceCartFromEmitted,
  } = useOrderCart({ MENU, INGREDIENTI });

  const [cat, setCat] = useState("Pizzas");
  const [extrasOpen, setExtrasOpen] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notaGeneral, setNotaGeneral] = useState(() => draft?.nota || "");

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

  // Escape chiude il layer più in alto: pannello extra > drawer > builder
  // intero. Coerente con CerrarMesaDialog (stesso pattern in questo file).
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (extrasOpen) { setExtrasOpen(null); return; }
      if (drawerOpen) { setDrawerOpen(false); return; }
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [extrasOpen, drawerOpen, onClose]);

  const confirmCovers = (rawValue) => {
    const count = Number(rawValue);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setCoversError("Indica un número de comensales válido.");
      return;
    }
    setCoversValue(count);
    setCoversError("");
    setStep("picker");
  };

  const handleCat = (c) => { setCat(c); setExtrasOpen(null); };

  const decrementLine = (uid) => {
    if (extrasOpen === uid && cart[uid]?.q <= 1) setExtrasOpen(null);
    decrement(uid);
  };
  const removeAndCloseExtras = (uid) => {
    if (extrasOpen === uid) setExtrasOpen(null);
    removeLine(uid);
  };

  const extrasTarget = extrasOpen ? cart[extrasOpen] : null;
  const extrasEsDulce = esDulce(extrasTarget);
  const dynamicAllowed = extrasTarget && Array.isArray(extrasTarget.extrasPermitidos)
    && extrasTarget.extrasPermitidos.length > 0;
  const extrasList = dynamicAllowed
    ? extrasForProduct(extrasTarget, INGREDIENTI)
    : (extrasEsDulce ? EXTRAS_DULCES : INGREDIENTI);

  // Local-only: validates the cart, builds the same emitted-item shape the
  // backend contract expects, and hands it to the caller as a draft. No
  // network call, no loading/error state -- those belong to Enviar a cocina
  // now (MesaWorkspace), the only place this draft is ever actually sent.
  const handleConfirm = () => {
    if (cartItems.length === 0) return;
    const items = cartItems.map(item => isCustomRawItem(item) ? item : buildEmittedItem(item));
    onConfirm({
      items,
      nota: notaGeneral,
      coversTotal: coversValue,
      client_req_id: reqIdRef.current,
    });
  };

  // ── Step 1: covers (only if missing) ──────────────────────────────────
  if (step === "covers") {
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
              {COVER_QUICK_OPTIONS.map(n => (
                <button key={n} data-testid={`covers-quick-${n}`} onClick={() => confirmCovers(n)} style={{
                  background: C.carbone2, border: `2px solid ${C.fumo}`, borderRadius: 12,
                  padding: "16px 0", color: C.bianco, fontSize: 20, fontWeight: 800, cursor: "pointer",
                }}>{n}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number" min="1" max="99" value={coversInput} autoFocus
                data-testid="covers-custom-input"
                onChange={e => { setCoversInput(e.target.value); setCoversError(""); }}
                onKeyDown={e => { if (e.key === "Enter" && coversInput) confirmCovers(coversInput); }}
                placeholder="Otro número (9-99)"
                style={{
                  flex: 1, background: C.carbone2, border: `1px solid ${C.fumo}`, borderRadius: 10,
                  color: C.bianco, padding: "12px 12px", fontSize: 15, boxSizing: "border-box",
                }}
              />
              <button
                data-testid="covers-custom-confirm"
                disabled={!coversInput}
                onClick={() => confirmCovers(coversInput)}
                style={{
                  background: coversInput ? C.rosso : C.fumo, color: "#fff", border: "none",
                  borderRadius: 10, padding: "12px 18px", fontWeight: 800, fontSize: 14,
                  cursor: coversInput ? "pointer" : "default",
                }}>Continuar</button>
            </div>
            {coversError && <div style={{ color: "#F87171", fontSize: 12, marginTop: 10 }}>{coversError}</div>}
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
    <div onClick={onClose} style={overlayStyle}>
      <div role="dialog" aria-modal="true" aria-label={`Nueva comanda Mesa ${target.tableNumber}`} onClick={e => e.stopPropagation()} style={{ ...panelStyle, width: "min(760px, 97vw)", height: isPhone ? "100dvh" : "92vh", maxHeight: isPhone ? "100dvh" : "92vh", borderRadius: isPhone ? 0 : 20 }}>
        <div style={headerStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.bianco, fontWeight: 900, fontSize: 17 }}>Nueva comanda — Mesa {target.tableNumber}</div>
            <div style={{ color: C.grigio, fontSize: 12 }}>{coversValue} comensal{coversValue !== 1 ? "es" : ""}</div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.fumo}`, overflowX: "auto", flexShrink: 0 }}>
          {[...CATS, "⭐ Custom"].map(c => (
            <button key={c} onClick={() => handleCat(c)} style={{
              background: cat === c ? (c === "⭐ Custom" ? "linear-gradient(135deg,#C4A87A,#A0854A)" : C.rosso) : "transparent",
              border: `1.5px solid ${cat === c ? (c === "⭐ Custom" ? "#C4A87A" : C.rosso) : C.fumo}`,
              color: cat === c ? "#fff" : C.grigio,
              borderRadius: 22, padding: "9px 18px", fontSize: 14, fontWeight: 700,
              whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer",
            }}>{c}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: 14 }}>
          {cat !== "⭐ Custom" ? (
            <>
              <style>{pickerGridCss}</style>
              <div className="mesa-picker-grid">
                {MENU.filter(m => m.cat === cat && m.disponible !== false && m.visiblePicker !== false).map(p => {
                  const qty = qtyOf(p.id);
                  const lbl = pizzaLabel(p);
                  return (
                    <div key={p.id} data-testid="mesa-product-card" className="mesa-picker-card" onClick={() => increment(p)} style={{
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
                      <div style={{ color: C.bianco, fontSize: 14, fontWeight: 800, lineHeight: 1.25 }}>{lbl.primary}</div>
                      {lbl.secondary && <div style={{ color: "#a99f8b", fontSize: 12, fontStyle: "italic", lineHeight: 1.2, marginTop: 1 }}>{lbl.secondary}</div>}
                      <div style={{ color: qty > 0 ? C.avana : C.rosso, fontSize: 13, fontWeight: 800, marginTop: 4 }}>{p.p.toFixed(2)}€</div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <PizzaCustomBuilder setItems={(updater) => {
              const result = typeof updater === "function" ? updater([]) : updater;
              if (result && result.length > 0) addRaw(result[result.length - 1]);
            }} />
          )}
        </div>

        {/* ── Barra sticky: conteggio/totale + Ver comanda ── */}
        <div style={{
          padding: "12px 16px calc(12px + env(safe-area-inset-bottom, 0px))",
          borderTop: `1px solid ${C.fumo}`, display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 12, flexShrink: 0, background: C.carbone2,
        }}>
          <div style={{ minWidth: 0 }}>
            {totalQty > 0 ? (
              <>
                <div style={{ color: C.grigio, fontSize: 11 }}>{totalQty} artículo{totalQty !== 1 ? "s" : ""}</div>
                <div style={{ color: C.verde, fontWeight: 900, fontSize: 20, fontFamily: "'DM Mono',monospace" }}>{totalCart.toFixed(2)}€</div>
              </>
            ) : (
              <div style={{ color: C.grigio, fontSize: 13 }}>Selecciona productos</div>
            )}
          </div>
          <button
            data-testid="mesa-ver-comanda"
            onClick={() => setDrawerOpen(true)}
            disabled={totalQty === 0}
            style={{
              background: totalQty > 0 ? C.rosso : C.fumo, color: totalQty > 0 ? "#fff" : C.grigio,
              border: "none", borderRadius: 12, padding: "14px 24px", fontWeight: 800, fontSize: 15,
              whiteSpace: "nowrap", cursor: totalQty > 0 ? "pointer" : "default",
            }}>Ver comanda</button>
        </div>

        {/* ── Popup extra (matita) — stessa UI/logica di ItemPickerModal ── */}
        {extrasTarget && canEditExtras(extrasTarget) && (
          <ExtrasPanel
            extrasTarget={extrasTarget} extrasEsDulce={extrasEsDulce} extrasList={extrasList}
            splitSub={splitSub} addExtra={addExtra} removeExtra={removeExtra}
            baseIngredientsOf={baseIngredientsOf} isRemoved={isRemoved} toggleRemoved={toggleRemoved}
            setNotaLibera={setNotaLibera} onClose={() => setExtrasOpen(null)}
          />
        )}

        {/* ── Riepilogo compatto interno (drawer) ── */}
        {drawerOpen && (
          <div role="dialog" aria-modal="true" aria-label="Comanda" onClick={() => setDrawerOpen(false)} style={{
            position: "absolute", inset: 0, zIndex: 30, display: "flex", alignItems: "flex-end",
            justifyContent: "center", background: "rgba(0,0,0,0.6)",
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: C.carbone, width: "100%", maxHeight: "82%", borderRadius: "18px 18px 0 0",
              display: "flex", flexDirection: "column", border: `1px solid ${C.fumo}`, overflow: "hidden",
            }}>
              <div style={headerStyle}>
                <div style={{ color: C.bianco, fontWeight: 800, fontSize: 16 }}>Mesa {target.tableNumber} · comanda</div>
                <button onClick={() => setDrawerOpen(false)} style={closeBtnStyle}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
                {cartItems.map(item => {
                  const custom = isCustomRawItem(item);
                  const { extras: extraTokens, note } = custom ? { extras: [], note: "" } : splitSub(item.sub);
                  return (
                    <div key={item._uid} data-testid="mesa-line" style={{
                      marginBottom: 10, padding: "10px 12px", background: C.carbone2,
                      borderRadius: 12, border: `1px solid ${C.fumo}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: C.bianco, fontSize: 15, fontWeight: 700 }}>{item.n}</div>
                          {custom ? (
                            <div style={{ color: "#a99f8b", fontSize: 12 }}>{item.sub}</div>
                          ) : (
                            <>
                              {extraTokens.length > 0 && (
                                <div style={{ color: "#fff5e4", fontSize: 12 }}>{extraTokens.join(", ")}</div>
                              )}
                              {note && <div style={{ color: "#E8341C", fontSize: 12, fontWeight: 700 }}>{note}</div>}
                            </>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          {!custom && (item.cat === "Pizzas" || esDulce(item)) && (
                            <button data-testid="mesa-line-edit" onClick={() => { setExtrasOpen(item._uid); setDrawerOpen(false); }} style={pencilBtnStyle}>✎</button>
                          )}
                          <button data-testid="mesa-line-minus" onClick={() => decrementLine(item._uid)} style={qtyBtnStyle}>−</button>
                          <span style={{ color: C.bianco, fontWeight: 800, fontSize: 14, minWidth: 18, textAlign: "center", fontFamily: "'DM Mono',monospace" }}>{item.q}</span>
                          <button data-testid="mesa-line-plus" onClick={() => setQty(item._uid, item.q + 1)} style={qtyBtnStyle}>+</button>
                          <button data-testid="mesa-line-remove" onClick={() => removeAndCloseExtras(item._uid)} style={{ ...qtyBtnStyle, color: "#F87171" }}>🗑</button>
                        </div>
                      </div>
                      {!custom && item.cat !== "Pizzas" && !esDulce(item) && (
                        <input
                          data-testid="mesa-line-note"
                          value={item.sub || ""}
                          onChange={e => setNota(item._uid, e.target.value)}
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
                <div style={{ marginTop: 10 }}>
                  <label style={{ color: C.grigio, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>Nota general</label>
                  <textarea
                    data-testid="mesa-nota-general"
                    value={notaGeneral}
                    onChange={e => setNotaGeneral(e.target.value)}
                    placeholder="Nota para toda la comanda (opcional)"
                    rows={2}
                    style={{
                      width: "100%", marginTop: 6, background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${C.fumo}`, borderRadius: 8, color: C.bianco,
                      padding: "8px 10px", fontSize: 13, boxSizing: "border-box", resize: "vertical",
                    }}
                  />
                </div>
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
                  data-testid="mesa-confirmar-comanda"
                  onClick={handleConfirm}
                  disabled={totalQty === 0}
                  style={{
                    background: totalQty > 0 ? C.rosso : C.fumo, color: "#fff", border: "none",
                    borderRadius: 12, padding: "14px 26px", fontWeight: 800, fontSize: 15,
                    cursor: totalQty > 0 ? "pointer" : "default",
                  }}>✅ Confirmar comanda</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ExtrasPanel = ({ extrasTarget, extrasEsDulce, extrasList, splitSub, addExtra, removeExtra, baseIngredientsOf, isRemoved, toggleRemoved, setNotaLibera, onClose }) => {
  const notaLibera = splitSub(extrasTarget.sub).note;
  const base = baseIngredientsOf(extrasTarget);
  return (
    <div onClick={onClose} style={{
      position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center",
      justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)", padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.carbone, borderRadius: 16, width: "min(560px, 100%)", maxHeight: "92%",
        display: "flex", flexDirection: "column", border: `1px solid ${C.fumo}`, overflow: "hidden",
      }}>
        <div style={headerStyle}>
          <div style={{ color: C.bianco, fontWeight: 800, fontSize: 18 }}>{extrasEsDulce ? "🍫 Extras dulces" : "🧀 Ingredientes extra"}</div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(116px, 1fr))", gap: 8 }}>
          {extrasList.filter(ing => ing.prezzo > 0).map(ing => {
            const veces = splitSub(extrasTarget.sub).extras.filter(t => t === `+${ing.n}`).length;
            return (
              <button key={ing.id} data-testid="mesa-extra-chip" onClick={() => addExtra(extrasTarget._uid, ing)} style={{
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
                    onClick={(e) => { e.stopPropagation(); removeExtra(extrasTarget._uid, ing.n); }}
                    style={{
                      position: "absolute", top: -8, left: -8, background: C.carbone, color: "#fff",
                      border: `2px solid ${C.rosso}`, borderRadius: "50%", width: 22, height: 22,
                      fontSize: 16, fontWeight: 900, lineHeight: 1, display: "flex", alignItems: "center",
                      justifyContent: "center", cursor: "pointer", zIndex: 2,
                    }}>−</span>
                )}
                <span style={{ fontSize: 20, pointerEvents: "none" }}>{ing.e}</span>
                <span style={{ color: C.bianco, fontSize: 13, fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>{ing.n}</span>
              </button>
            );
          })}
        </div>
        {base.length > 0 && (
          <div style={{ padding: "9px 14px", borderTop: `1px solid ${C.fumo}`, background: "rgba(255,255,255,0.02)", maxHeight: 132, overflowY: "auto" }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.grigio, textTransform: "uppercase", marginBottom: 7 }}>Quitar ingredientes</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {base.map(ingName => {
                const off = isRemoved(extrasTarget, ingName);
                return (
                  <button key={ingName} data-testid="remove-ingredient-chip" aria-pressed={off}
                    onClick={() => toggleRemoved(extrasTarget._uid, ingName)} style={{
                      background: off ? "rgba(220,38,38,0.16)" : C.carbone2, border: `1.5px solid ${off ? "#DC2626" : C.fumo}`,
                      borderRadius: 999, padding: "5px 11px", cursor: "pointer", color: off ? "#F87171" : C.bianco,
                      fontSize: 12, fontWeight: 700, textDecoration: off ? "line-through" : "none", opacity: off ? 0.95 : 0.8,
                    }}>{off ? "✕ " : ""}{ingName}</button>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.fumo}`, background: C.carbone2, display: "flex", alignItems: "center", gap: 10 }}>
          <input value={notaLibera} onChange={e => setNotaLibera(extrasTarget._uid, e.target.value)}
            placeholder="Nota cocina (cortar en 4, poco hecha...)"
            style={{
              flex: 1, minWidth: 0, background: "rgba(232,52,28,0.08)",
              border: `1px solid ${notaLibera ? "#E8341C88" : C.fumo}`, borderRadius: 8,
              color: notaLibera ? "#E8341C" : C.grigio, padding: "9px 11px", fontSize: 13,
              fontWeight: notaLibera ? 700 : 400, boxSizing: "border-box",
            }} />
          <button onClick={onClose} style={{ background: C.rosso, color: "#fff", border: "none", borderRadius: 10, padding: "10px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer", flexShrink: 0 }}>Listo</button>
        </div>
      </div>
    </div>
  );
};

// Real CSS breakpoints, not JS width-branching -- smoother across resize/
// rotation, and the column counts asked for map directly to media queries:
// phone portrait 2 (1 only if genuinely too narrow to stay legible), tablet
// portrait ~3, tablet landscape/desktop ~4. No UA sniffing anywhere.
const pickerGridCss = `
  .mesa-picker-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  @media (max-width: 359px) { .mesa-picker-grid { grid-template-columns: 1fr; } }
  @media (min-width: 768px) { .mesa-picker-grid { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 1024px) { .mesa-picker-grid { grid-template-columns: repeat(4, 1fr); } }
  .mesa-picker-card {
    border-radius: 14px; padding: 10px 12px; min-height: 64px;
    display: flex; flex-direction: column; justify-content: center;
    position: relative; cursor: pointer;
  }
`;

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
const qtyBtnStyle = {
  background: C.fumo, color: C.bianco, border: "none", borderRadius: 8, width: 30, height: 30,
  fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};
const pencilBtnStyle = {
  background: "rgba(255,255,255,0.035)", border: `1px solid rgba(208,184,145,0.20)`, borderRadius: 8,
  width: 30, height: 30, fontSize: 14, color: "#fff5e4", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};

export default MesaOrderBuilder;
