import { useState, useEffect } from 'react';
import { C, MENU, CATS, INGREDIENTI, genId } from '../constants';
import PizzaCustomBuilder from './PizzaCustomBuilder';

/**
 * ItemPickerModal — popup unico per aggiungere o modificare un item dell'ordine.
 *
 * Modalità aggiunta (itemEsistente = null):
 *   - Mini-carrello interno: +/− per ogni prodotto, poi "Añadir al pedido"
 *   - Per le pizze: dopo aver aggiunto al carrello interno, si può aprire
 *     il pannello extras per quella pizza
 *
 * Modalità modifica (itemEsistente = item):
 *   - Pre-carica il singolo item, permette di cambiare extras/nota
 *   - Bottone "Actualizar"
 */
const ItemPickerModal = ({ visible, onClose, onAdd, onUpdate, itemEsistente }) => {
  const isModifica = !!itemEsistente;

  const [cat, setCat]               = useState("Pizzas");
  // Mini-carrello interno: { [uid]: { ...item, q, sub, _uid } }
  const [cart, setCart]             = useState({});
  // Quale pizza ha il pannello extras aperto (uid)
  const [extrasOpen, setExtrasOpen] = useState(null);

  // Reset quando si apre/chiude
  useEffect(() => {
    if (!visible) return;
    if (isModifica) {
      // Modalità modifica: carica l'item nel carrello
      const uid = itemEsistente._uid || genId();
      setCart({ [uid]: { ...itemEsistente, _uid: uid } });
      setCat(itemEsistente.cat || "Pizzas");
      setExtrasOpen(null);
      setExtrasOpen(null);
    } else {
      setCart({});
      setCat("Pizzas");
      setExtrasOpen(null);
      setExtrasOpen(null);
    }
  }, [visible]); // eslint-disable-line

  const handleCat = (c) => { setCat(c); setExtrasOpen(null); setExtrasOpen(null); };

  // Ogni tap crea sempre una riga separata — mai merge
  const increment = (p) => {
    const uid = genId();
    setCart(prev => ({ ...prev, [uid]: { ...p, q: 1, sub: "", _uid: uid } }));
  };

  // Decrementa — rimuove se arriva a 0
  const decrement = (uid) => {
    setCart(prev => {
      const item = prev[uid];
      if (!item) return prev;
      if (item.q <= 1) {
        const next = { ...prev };
        delete next[uid];
        if (extrasOpen === uid) setExtrasOpen(null);
        return next;
      }
      return { ...prev, [uid]: { ...item, q: item.q - 1 } };
    });
  };

  // Quantità totale di un prodotto (per badge nella griglia)
  const qtyOf = (productId) =>
    Object.values(cart).filter(i => String(i.id) === String(productId)).reduce((s, i) => s + i.q, 0);

  // Aggiunge extra a una pizza nel carrello
  const addExtra = (uid, ing) => {
    setCart(prev => {
      if (!prev[uid]) return prev;
      return {
        ...prev,
        [uid]: {
          ...prev[uid],
          p: Math.round((prev[uid].p + ing.prezzo) * 100) / 100,
          sub: [prev[uid].sub, `+${ing.n}`].filter(Boolean).join(", ")
        }
      };
    });
    setExtrasOpen(null);
  };

  // Rimuove extra da una pizza nel carrello
  const removeExtra = (uid, ingName) => {
    const ing = INGREDIENTI.find(g => g.n === ingName);
    setCart(prev => {
      if (!prev[uid]) return prev;
      const parts = (prev[uid].sub || "").split(",").map(s => s.trim()).filter(Boolean);
      let rimosso = false;
      const newParts = parts.filter(p => {
        if (!rimosso && p === "+" + ingName) { rimosso = true; return false; }
        return true;
      });
      return {
        ...prev,
        [uid]: {
          ...prev[uid],
          p: ing ? Math.max(0, Math.round((prev[uid].p - ing.prezzo) * 100) / 100) : prev[uid].p,
          sub: newParts.join(", ")
        }
      };
    });
  };

  // Aggiorna nota libera
  const setNota = (uid, val) => {
    setCart(prev => prev[uid] ? { ...prev, [uid]: { ...prev[uid], sub: val } } : prev);
  };

  // Totale items nel carrello
  const cartItems = Object.values(cart);
  const totalCart = cartItems.reduce((s, i) => s + i.p * i.q, 0);
  const totalQty  = cartItems.reduce((s, i) => s + i.q, 0);

  // Conferma
  const handleConfirm = () => {
    if (cartItems.length === 0) return;
    if (isModifica) {
      onUpdate(cartItems[0]);
    } else {
      cartItems.forEach(item => onAdd(item));
    }
    onClose();
  };

  if (!visible) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 600,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)"
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.carbone,
          borderRadius: 20,
          width: "min(700px, 96vw)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
          overflow: "hidden"
        }}
      >
        {/* ── Header ─────────────────────────────── */}
        <div style={{
          padding: "14px 18px 10px",
          borderBottom: `1px solid ${C.fumo}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0
        }}>
          <div style={{ color: C.bianco, fontWeight: 800, fontSize: 17 }}>
            {isModifica ? "✏️ Modificar item" : "➕ Añadir al pedido"}
          </div>
          <button onClick={onClose} style={{
            background: C.fumo, color: C.grigio, border: "none",
            borderRadius: "50%", width: 32, height: 32, fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
          }}>✕</button>
        </div>

        {/* ── Tab categorie (nascoste in modifica: la matita apre l'editor ingredienti) ── */}
        {!isModifica && (
        <div style={{
          display: "flex", gap: 8, padding: "10px 14px",
          borderBottom: `1px solid ${C.fumo}`,
          overflowX: "auto", flexShrink: 0
        }}>
          {[...CATS, "⭐ Custom"].map(c => (
            <button key={c} onClick={() => handleCat(c)} style={{
              background: cat === c
                ? c === "⭐ Custom" ? "linear-gradient(135deg,#C4A87A,#A0854A)" : C.rosso
                : "transparent",
              border: `1.5px solid ${cat === c ? (c === "⭐ Custom" ? "#C4A87A" : C.rosso) : C.fumo}`,
              color: cat === c ? "#fff" : C.grigio,
              borderRadius: 22, padding: "9px 18px",
              fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer"
            }}>{c}</button>
          ))}
        </div>
        )}

        {/* ── Corpo scrollabile ────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: 14 }}>

          {cat !== "⭐ Custom" ? (
            <>
              {/* ── Griglia prodotti (nascosta in modifica) ── */}
              {!isModifica && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 12
              }}>
                {MENU.filter(m => m.cat === cat).map(p => {
                  const qty = qtyOf(p.id);
                  return (
                    <div key={p.id}
                      onClick={() => increment(p)}
                      style={{
                      background: qty > 0 ? C.rosso + "22" : C.carbone2,
                      border: `2px solid ${qty > 0 ? C.rosso : C.fumo}`,
                      borderRadius: 16, padding: "16px 10px", minHeight: 116,
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 7, position: "relative",
                      boxShadow: qty > 0 ? `0 4px 16px ${C.rosso}33` : "none",
                      cursor: "pointer"
                    }}>
                      {/* Badge quantità */}
                      {qty > 0 && (
                        <span style={{
                          position: "absolute", top: -8, right: -8,
                          background: C.rosso, color: "#fff",
                          border: `2px solid ${C.carbone}`,
                          borderRadius: "50%", width: 24, height: 24,
                          fontSize: 12, fontWeight: 900,
                          display: "flex", alignItems: "center", justifyContent: "center"
                        }}>{qty}</span>
                      )}
                      <span style={{ fontSize: 30, pointerEvents: "none" }}>{p.e}</span>
                      <span style={{ color: C.bianco, fontSize: 14, fontWeight: 700, textAlign: "center", lineHeight: 1.25 }}>{p.n}</span>
                      {p.sub && <span style={{ color: "#888", fontSize: 12, textAlign: "center", lineHeight: 1.2 }}>{p.sub}</span>}
                      <span style={{ color: qty > 0 ? C.avana : C.rosso, fontSize: 14, fontWeight: 800, marginTop: 2 }}>
                        {p.p.toFixed(2)}€
                      </span>
                    </div>
                  );
                })}
              </div>
              )}

              {/* ── Riepilogo carrello interno con extras pizza ── */}
              {cartItems.length > 0 && (
                <div style={{ marginTop: isModifica ? 0 : 14 }}>
                  {!isModifica && (
                  <div style={{ color: C.grigio, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
                    En el pedido
                  </div>
                  )}
                  {cartItems.map(item => {
                    const extrasAttuali = (() => {
                      if (!item.sub) return [];
                      const matches = item.sub.match(/\+[^,]+/g) || [];
                      const counts = {};
                      matches.forEach(m => {
                        const name = m.replace(/^\+/, "").trim();
                        counts[name] = (counts[name] || 0) + 1;
                      });
                      return Object.entries(counts).map(([name, qty]) => {
                        const ing = INGREDIENTI.find(g => g.n === name);
                        return { name, qty, prezzo: ing ? Math.round(ing.prezzo * qty * 100) / 100 : 0, e: ing?.e || "➕" };
                      });
                    })();
                    const isOpen = extrasOpen === item._uid;

                    return (
                      <div key={item._uid} style={{
                        marginBottom: 10, padding: "10px 12px",
                        background: C.carbone2, borderRadius: 12,
                        border: `1px solid ${C.fumo}`
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 20 }}>{item.e}</span>
                          <span style={{ color: C.bianco, fontSize: 14, flex: 1, fontWeight: 600, minWidth: 0 }}>{item.n}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            {!isModifica && (
                            <button onClick={() => decrement(item._uid)} style={{
                              background: C.fumo, color: C.bianco, border: "none",
                              borderRadius: 8, width: 34, height: 34, fontSize: 18, fontWeight: 700,
                              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                            }}>−</button>
                            )}
                            <span style={{ color: C.bianco, fontWeight: 800, fontSize: 15, minWidth: 20, textAlign: "center", fontFamily: "'DM Mono',monospace" }}>{isModifica ? `× ${item.q}` : item.q}</span>
                            {!isModifica && (
                            <button onClick={() => increment(item)} style={{
                              background: C.fumo, color: C.bianco, border: "none",
                              borderRadius: 8, width: 34, height: 34, fontSize: 18, fontWeight: 700,
                              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                            }}>+</button>
                            )}
                          </div>
                          <span style={{ color: C.grigio, fontSize: 12, fontWeight: 700, minWidth: 42, textAlign: "right", fontFamily: "'DM Mono',monospace" }}>
                            {(item.p * item.q).toFixed(2)}€
                          </span>
                        </div>

                        {/* Extras già aggiunti */}
                        {extrasAttuali.length > 0 && (
                          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {extrasAttuali.map((ex, i) => (
                              <span key={i} style={{
                                background: "rgba(168,85,247,0.15)",
                                border: "1px solid rgba(168,85,247,0.35)",
                                borderRadius: 20, padding: "3px 4px 3px 10px",
                                fontSize: 12, color: "#a855f7", fontWeight: 600,
                                display: "flex", alignItems: "center", gap: 4
                              }}>
                                {ex.e} {ex.name} +{ex.prezzo.toFixed(2)}€
                                <button onClick={() => removeExtra(item._uid, ex.name)} style={{
                                  background: "none", border: "none", color: "#E8341C",
                                  fontSize: 13, fontWeight: 900, cursor: "pointer",
                                  width: 24, height: 24, lineHeight: 1, borderRadius: "50%",
                                  display: "flex", alignItems: "center", justifyContent: "center"
                                }}>✕</button>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Campo variazioni libero — solo per pizze */}
                        {item.cat === "Pizzas" && (
                          <input
                            value={item.sub || ""}
                            onChange={e => setNota(item._uid, e.target.value)}
                            placeholder="Variaciones (sin cebolla, extra picante...)"
                            style={{
                              width: "100%", marginTop: 6,
                              background: "rgba(232,52,28,0.08)",
                              border: `1px solid ${item.sub ? "#E8341C88" : C.fumo}`,
                              borderRadius: 7,
                              color: item.sub ? "#E8341C" : C.grigio,
                              padding: "5px 9px", fontSize: 12,
                              fontWeight: item.sub ? 700 : 400,
                              boxSizing: "border-box"
                            }}
                          />
                        )}

                        {/* Bottone extras — solo per pizze, griglia appare subito */}
                        {item.cat === "Pizzas" && (
                          <div style={{ marginTop: 6 }}>
                            <button
                              onClick={() => {
                                if (isOpen) setExtrasOpen(null);
                                else setExtrasOpen(item._uid);
                              }}
                              style={{
                                background: "rgba(168,85,247,0.1)",
                                border: `1px solid ${isOpen ? "#a855f7" : "rgba(168,85,247,0.3)"}`,
                                borderRadius: 7, color: "#a855f7", fontSize: 11, fontWeight: 700,
                                padding: "4px 10px", cursor: "pointer", width: "100%"
                              }}>
                              {isOpen ? "✕ Cerrar extras" : "➕ Añadir ingrediente extra"}
                            </button>
                            {isOpen && (
                              <div style={{
                                marginTop: 6, background: "rgba(14,14,14,0.95)",
                                borderRadius: 10, border: "1px solid rgba(168,85,247,0.3)",
                                padding: 10, display: "flex", flexWrap: "wrap", gap: 6
                              }}>
                                {INGREDIENTI.filter(ing => ing.prezzo > 0).map(ing => (
                                  <button key={ing.id} onClick={() => addExtra(item._uid, ing)} style={{
                                    background: "rgba(168,85,247,0.1)",
                                    border: "1px solid rgba(168,85,247,0.35)",
                                    borderRadius: 7, color: "#ccc", fontSize: 11,
                                    padding: "5px 8px", cursor: "pointer",
                                    display: "flex", alignItems: "center", gap: 4
                                  }}>
                                    <span>{ing.e}</span>
                                    <span style={{ fontWeight: 600 }}>{ing.n}</span>
                                    <span style={{ color: "#a855f7", fontWeight: 800 }}>+{ing.prezzo.toFixed(2)}€</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Nota libera (non pizza) */}
                        {item.cat !== "Pizzas" && (
                          <input
                            value={item.sub || ""}
                            onChange={e => setNota(item._uid, e.target.value)}
                            placeholder="Nota (opcional)"
                            style={{
                              width: "100%", marginTop: 6, background: "rgba(255,255,255,0.05)",
                              border: `1px solid ${C.fumo}`, borderRadius: 7,
                              color: C.grigio, padding: "5px 8px", fontSize: 11,
                              boxSizing: "border-box"
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* ── Custom builder ── */
            <PizzaCustomBuilder setItems={(updater) => {
              const fakeArr = [];
              const result = typeof updater === "function" ? updater(fakeArr) : updater;
              if (result && result.length > 0) {
                onAdd(result[result.length - 1]);
                onClose();
              }
            }} />
          )}
        </div>

        {/* ── Footer: bottone Aggiungi/Aggiorna ──── */}
        {cat !== "⭐ Custom" && (
          <div style={{
            padding: "12px 16px",
            borderTop: `1px solid ${C.fumo}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, flexShrink: 0, background: C.carbone2
          }}>
            <div style={{ minWidth: 0 }}>
              {totalQty > 0 ? (
                <>
                  <div style={{ color: C.grigio, fontSize: 11 }}>
                    {totalQty} item{totalQty !== 1 ? "s" : ""} seleccionados
                  </div>
                  <div style={{ color: C.verde, fontWeight: 900, fontSize: 20, fontFamily: "'DM Mono',monospace" }}>
                    {totalCart.toFixed(2)}€
                  </div>
                </>
              ) : (
                <div style={{ color: C.grigio, fontSize: 13 }}>Selecciona productos</div>
              )}
            </div>
            <button
              onClick={handleConfirm}
              disabled={totalQty === 0}
              style={{
                background: totalQty > 0 ? C.rosso : C.fumo,
                color: totalQty > 0 ? "#fff" : C.grigio,
                border: "none", borderRadius: 12,
                padding: "14px 24px", fontWeight: 800, fontSize: 16,
                whiteSpace: "nowrap", flexShrink: 0,
                boxShadow: totalQty > 0 ? `0 4px 16px ${C.rosso}55` : "none",
                cursor: totalQty > 0 ? "pointer" : "default"
              }}>
              {isModifica ? "✏️ Actualizar" : `✅ Añadir${totalQty > 0 ? ` (${totalQty})` : ""}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemPickerModal;
