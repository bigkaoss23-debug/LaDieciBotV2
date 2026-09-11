import { useState } from 'react';
import { genId, findExtra } from '../constants';
import { itemSignature, consolidateCart } from '../menu/itemSignature';

// Custom pizzas (PizzaCustomBuilder) are inserted raw and never pass through
// buildEmittedItem -- shared here so any consumer that needs to tell a custom
// line apart from a catalogue line (e.g. re-seeding a cart from a previously
// emitted draft) uses the exact same rule addRaw's own callers rely on.
export const isCustomRawItem = (item) => typeof item?.id === "string" && item.id.startsWith("custom_");

// The unconfigured (no extras/removals/note) working-shape item a bare
// catalogue tap produces -- shared by increment/decrementBare so both sides
// of the catalogue card's +/- always target the exact same line via its
// itemSignature, never a hand-rolled "no sub" heuristic that could drift
// from the one true signature rule (menu/itemSignature.js). Module-level so the
// order editor (ModificaOrdenModal) targets a catalogue tap by the same rule.
export const bareItemOf = (p) => ({
  ...p, q: 1, sub: "",
  classicName: p.sub || "",
  fantasyName: p.n || "",
  baseUnitPrice: Number(p.p) || 0,
});

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

  // CANONICAL_MANUAL_PICKER_FINAL_CORRECTION — Goal 5: a tap merges into the
  // existing line with the SAME complete signature (same product, same
  // config) instead of always minting a new line. A configured line (extras/
  // removed/note/custom) never matches a bare tap's signature, so it stays
  // untouched -- only two truly equivalent lines ever combine.
  const increment = (p) => {
    // Which line this tap targets is decided synchronously against the
    // current `cart` snapshot (same convention qtyOf already relies on)
    // rather than inside the setCart updater -- React does not guarantee an
    // updater's own side effects are observable the instant setCart()
    // returns, and increment's uid return value is a real part of its
    // contract (MesaOrderBuilder/ItemPickerModal both use it).
    const candidate = bareItemOf(p);
    const sig = itemSignature(candidate);
    const existing = Object.values(cart).find((i) => itemSignature(i) === sig);
    if (existing) {
      const existingUid = existing._uid;
      setCart(prev => {
        const cur = prev[existingUid];
        return cur ? { ...prev, [existingUid]: { ...cur, q: cur.q + 1 } } : prev;
      });
      return existingUid;
    }
    const uid = genId();
    setCart(prev => ({ ...prev, [uid]: { ...candidate, _uid: uid } }));
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

  // The catalogue card's own quick "−" (Goal 4): mirrors increment's target
  // selection exactly (same bare signature) so tap +1 / tap −1 always act on
  // the same line. A product whose only cart presence is a CONFIGURED line
  // (extras/removed/custom) has no bare line to decrement -- the card's own
  // qty badge still reflects the true total, but the quick "−" only ever
  // removes unconfigured units, matching what the quick "+" itself can add.
  const decrementBare = (p) => {
    setCart(prev => {
      const sig = itemSignature(bareItemOf(p));
      const existing = Object.values(prev).find((i) => itemSignature(i) === sig);
      if (!existing) return prev;
      if (existing.q <= 1) {
        const next = { ...prev };
        delete next[existing._uid];
        return next;
      }
      return { ...prev, [existing._uid]: { ...existing, q: existing.q - 1 } };
    });
  };

  // IMPORTANT — EDITING A QUANTITY > 1 LINE (Goal 5 split-on-edit): opening
  // the configurator on a line with q>1 must never silently apply the edit to
  // every unit. Called once, at the moment ItemConfigurator is about to open
  // for a line: peels ONE unit off into its own new line (same config, q=1)
  // and returns that new uid to configure -- the original keeps the other
  // q-1 units untouched. A q===1 line has nothing to split; returns its own
  // uid unchanged. If the operator closes without changing anything, the two
  // lines are byte-identical again and `consolidate()` (called on configurator
  // close) merges them straight back into one q line -- the split is only
  // ever visible if the edit actually diverges the configuration.
  const splitForEdit = (uid) => {
    const item = cart[uid];
    if (!item || item.q <= 1) return uid;
    const newUid = genId();
    setCart(prev => {
      const cur = prev[uid];
      if (!cur) return prev;
      return {
        ...prev,
        [uid]: { ...cur, q: cur.q - 1 },
        [newUid]: { ...cur, q: 1, _uid: newUid },
      };
    });
    return newUid;
  };

  // Signature-based aggregation commit point (Goal 5): merges any lines that
  // are now byte-identical by menu/itemSignature.js's own rule, summing their
  // quantities via the same canonical consolidateCart already proven for the
  // post-confirm draft. Deliberately NOT run on every keystroke (e.g. inside
  // addExtra/setNotaLibera) -- merging the line an operator is actively
  // typing into out from under the open ItemConfigurator would orphan its
  // uid mid-edit. Callers run it at discrete commit points instead: a
  // configurator close, a custom-pizza add, a draft reseed.
  const consolidate = () => {
    setCart(prev => {
      const merged = consolidateCart(Object.values(prev));
      const next = {};
      merged.forEach((it) => { next[it._uid] = it; });
      return next;
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

  // Inserts an already-built line (e.g. a custom pizza from PizzaCustomBuilder)
  // WITHOUT passing it through the working "+Extra, nota" shape — exactly how
  // ItemPickerModal passes it directly to onAdd today, bypassing its internal
  // cart. Added to the same map so qty/remove stay generic.
  const addRaw = (item) => {
    const uid = item._uid || genId();
    setCart(prev => ({ ...prev, [uid]: { ...item, _uid: uid, q: item.q || 1 } }));
    return uid;
  };

  const clear = () => setCart({});
  const replaceCart = (nextCartObj) => setCart(nextCartObj || {});

  // Inverse of buildEmittedItem -- reconstructs the working "+Extra, nota"
  // shape (sub/p) from a structured emitted item's extras[]/notes, so a
  // previously-confirmed pre-comanda (MesaOrderBuilder's draft) can be
  // reopened for editing with its exact extras/removed/notes/quantities,
  // not a blank cart. Custom-raw lines are put back completely unchanged --
  // they never had a working shape to reconstruct in the first place (see
  // isCustomRawItem / addRaw).
  const workingShapeFromEmitted = (item) => {
    if (isCustomRawItem(item)) return item;
    const extraTokens = (item.extras || []).flatMap((extra) =>
      Array.from({ length: Math.max(1, Number(extra.quantity) || 1) }, () => `+${extra.name}`));
    const sub = [item.notes, ...extraTokens].filter(Boolean).join(", ");
    const extrasUnit = (item.extras || []).reduce((s, e) => s + (Number(e.price) || 0) * (Number(e.quantity) || 1), 0);
    const p = Math.round(((Number(item.baseUnitPrice) || 0) + extrasUnit) * 100) / 100;
    return { ...item, sub, p };
  };
  const replaceCartFromEmitted = (items) => {
    const next = {};
    (items || []).forEach((item) => {
      const uid = item._uid || genId();
      next[uid] = { ...workingShapeFromEmitted(item), _uid: uid };
    });
    setCart(next);
  };

  return {
    cart, setCart, cartItems, totalCart, totalQty,
    increment, decrement, decrementBare, removeLine, setQty, qtyOf,
    addExtra, removeExtra, toggleRemoved, isRemoved, baseIngredientsOf,
    setNota, setNotaLibera, splitSub,
    descrizioneDi, resolveExtra,
    buildEmittedItem,
    splitForEdit, consolidate,
    loadItem, addRaw, clear, replaceCart, replaceCartFromEmitted,
  };
}

export default useOrderCart;
