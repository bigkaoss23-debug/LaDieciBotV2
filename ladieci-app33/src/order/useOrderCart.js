import { useState } from 'react';
import { genId, findExtra } from '../constants';

/**
 * useOrderCart — cart logic extracted from ItemPickerModal (S2-7D4C/D era), so
 * it can be shared by any consumer that needs the same uid-keyed working cart
 * and the same emission boundary (buildEmittedItem), without re-deriving
 * product identity/price/extras handling in a second place.
 *
 * Behavior-preserving for ItemPickerModal: every function here is a straight
 * lift of what used to be local useState/handlers in that component. Nothing
 * about the working cart shape (`sub` = "+Extra, nota", `p` = unit price incl.
 * extras) changes meaning.
 *
 * Additive surface for other consumers (e.g. MesaOrderBuilder): removeLine,
 * setQty, loadItem, clear, replaceCart — none of these existed before, and
 * ItemPickerModal itself doesn't call them.
 */
export function useOrderCart({ MENU, INGREDIENTI }) {
  const [cart, setCart] = useState({});

  const resolveExtra = (name) =>
    (INGREDIENTI || []).find(g => g.n === name) || findExtra(name);

  const descrizioneDi = (item) => (MENU.find(m => String(m.id) === String(item.id)) || {}).sub || "";

  // Ogni tap crea sempre una riga separata — mai merge
  const increment = (p) => {
    const uid = genId();
    setCart(prev => ({
      ...prev,
      [uid]: {
        ...p, q: 1, sub: "", _uid: uid,
        classicName: p.sub || "",
        fantasyName: p.n || "",
        baseUnitPrice: Number(p.p) || 0,
      },
    }));
    return uid;
  };

  const decrement = (uid) => {
    setCart(prev => {
      const item = prev[uid];
      if (!item) return prev;
      if (item.q <= 1) {
        const next = { ...prev };
        delete next[uid];
        return next;
      }
      return { ...prev, [uid]: { ...item, q: item.q - 1 } };
    });
  };

  // Rimozione esplicita della riga, indipendente dalla quantità.
  const removeLine = (uid) => {
    setCart(prev => {
      if (!prev[uid]) return prev;
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  };

  // Imposta la quantità direttamente (usato dal riepilogo compatto: +/- su una
  // riga già in carrello, senza passare per singoli increment/decrement).
  const setQty = (uid, qty) => {
    setCart(prev => {
      const item = prev[uid];
      if (!item) return prev;
      const q = Math.max(0, Math.floor(Number(qty) || 0));
      if (q <= 0) {
        const next = { ...prev };
        delete next[uid];
        return next;
      }
      return { ...prev, [uid]: { ...item, q } };
    });
  };

  const qtyOf = (productId) =>
    Object.values(cart).filter(i => String(i.id) === String(productId)).reduce((s, i) => s + i.q, 0);

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
  };

  const removeExtra = (uid, ingName) => {
    const ing = resolveExtra(ingName);
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

  const baseIngredientsOf = (item) => {
    if (!item) return [];
    if (Array.isArray(item.ingredientesBase) && item.ingredientesBase.length) {
      return item.ingredientesBase.map(s => String(s).trim()).filter(Boolean);
    }
    return String(item.ing || "").split(",").map(s => s.trim()).filter(Boolean);
  };

  const isRemoved = (item, ingName) =>
    Array.isArray(item?.removedIngredients) && item.removedIngredients.includes(ingName);

  // Toggle puro: non tocca né il prezzo né `sub`. Una rimozione non è uno sconto.
  const toggleRemoved = (uid, ingName) => {
    setCart(prev => {
      const it = prev[uid];
      if (!it) return prev;
      const cur = Array.isArray(it.removedIngredients) ? it.removedIngredients : [];
      const next = cur.includes(ingName)
        ? cur.filter(x => x !== ingName)
        : [...cur, ingName];
      return { ...prev, [uid]: { ...it, removedIngredients: next } };
    });
  };

  const setNota = (uid, val) => {
    setCart(prev => prev[uid] ? { ...prev, [uid]: { ...prev[uid], sub: val } } : prev);
  };

  const splitSub = (sub) => {
    const parts = (sub || "").split(",").map(s => s.trim()).filter(Boolean);
    return {
      extras: parts.filter(p => p.startsWith("+")),
      note: parts.filter(p => !p.startsWith("+")).join(", ")
    };
  };

  const setNotaLibera = (uid, noteVal) => {
    setCart(prev => {
      if (!prev[uid]) return prev;
      const { extras } = splitSub(prev[uid].sub);
      return { ...prev, [uid]: { ...prev[uid], sub: [noteVal, ...extras].filter(Boolean).join(", ") } };
    });
  };

  const cartItems = Object.values(cart);
  const totalCart = cartItems.reduce((s, i) => s + i.p * i.q, 0);
  const totalQty = cartItems.reduce((s, i) => s + i.q, 0);

  // S2-7D4D — EMISSION BOUNDARY. Vedi ItemPickerModal (origine di questa
  // funzione) per la nota completa: emesso additivamente, `removedIngredients`
  // copiato verbatim, mai derivato dal testo della nota.
  const buildEmittedItem = (item) => {
    const { extras: extraTokens, note } = splitSub(item.sub);
    const counts = new Map();
    extraTokens.forEach(t => {
      const name = t.replace(/^\+/, "").trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    const extras = [...counts.entries()].map(([name, quantity]) => {
      const ing = resolveExtra(name);
      return {
        key: ing?.id ?? null,
        name,
        price: ing ? Number(ing.prezzo) || 0 : 0,
        emoji: ing?.e ?? null,
        quantity,
      };
    });
    const extrasUnit = Math.round(extras.reduce((s, e) => s + e.price * e.quantity, 0) * 100) / 100;
    return {
      ...item,
      classicName: item.classicName || descrizioneDi(item) || "",
      fantasyName: item.fantasyName || item.n || "",
      baseUnitPrice: item.baseUnitPrice != null
        ? item.baseUnitPrice
        : Math.max(0, Math.round((Number(item.p) - extrasUnit) * 100) / 100),
      extras,
      notes: note || "",
      removedIngredients: Array.isArray(item.removedIngredients)
        ? item.removedIngredients.slice()
        : [],
    };
  };

  // Precarica una singola riga (modalità modifica). Ritorna lo uid usato.
  const loadItem = (item) => {
    const uid = item._uid || genId();
    setCart({ [uid]: { ...item, _uid: uid } });
    return uid;
  };

  // Inserisce una riga già pronta (es. pizza custom da PizzaCustomBuilder) SENZA
  // farla passare dalla working shape "+Extra, nota" — esattamente come
  // ItemPickerModal la passa oggi direttamente a onAdd, bypassando il carrello
  // interno. Aggiunta alla stessa mappa così qty/remove restano generici.
  const addRaw = (item) => {
    const uid = item._uid || genId();
    setCart(prev => ({ ...prev, [uid]: { ...item, _uid: uid, q: item.q || 1 } }));
    return uid;
  };

  const clear = () => setCart({});
  const replaceCart = (nextCartObj) => setCart(nextCartObj || {});

  return {
    cart, setCart, cartItems, totalCart, totalQty,
    increment, decrement, removeLine, setQty, qtyOf,
    addExtra, removeExtra, toggleRemoved, isRemoved, baseIngredientsOf,
    setNota, setNotaLibera, splitSub,
    descrizioneDi, resolveExtra,
    buildEmittedItem,
    loadItem, addRaw, clear, replaceCart,
  };
}

export default useOrderCart;
