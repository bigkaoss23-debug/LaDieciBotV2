// ===============================================================
// extrasPolicy.js — single source of truth for "can this item have an
// extras editor?" Used by BOTH the pencil button and the extras panel in
// ItemPickerModal so the two conditions can never diverge again (the
// Phase 3A dead-pencil bug: button used extrasPermitidos, panel used
// cat === "Pizzas", so dynamic dessert pizzas — cat "Pizzas Dulces" —
// showed the pencil but never opened the panel).
//
// Decision is by DIRECT product mapping, never category-name inference:
//   dynamic → item has permitted extras (extrasPermitidos.length > 0)
//   static (flag off, no extrasPermitidos) → legacy behaviour: Pizzas only
// ===============================================================
// S2-7D4C reconciliation: the STATIC fallback below originally returned
// `cat === "Pizzas"` only. Since that branch was written, the Auth V2 line shipped static
// sweet extras (constants.js: EXTRAS_DULCES / esDulce), so dessert pizzas legitimately
// accept extras with the dynamic flag OFF. Keeping the old fallback would have silently
// REGRESSED that behaviour the moment this module was adopted. The dynamic branch is
// unchanged (extrasPermitidos still wins); only the static arm is brought up to parity.
// NB: explicit .js extension — this module is also loaded by the standalone
// `node --test src/menu/__tests__/*.mjs` runner, where ESM does not resolve
// extensionless specifiers the way webpack/Jest do.
import { esDulce } from "../constants.js";

export function canEditExtras(item) {
  if (!item) return false;
  if (Array.isArray(item.extrasPermitidos)) return item.extrasPermitidos.length > 0;
  return item.cat === "Pizzas" || esDulce(item); // static/legacy fallback (incl. sweet)
}
