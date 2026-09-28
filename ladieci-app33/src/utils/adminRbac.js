// ===============================================================
// adminRbac.js — S2-7D5 (recovered from S2-6A f841255 / 163458c)
//
// Frontend role gating for the service-session surfaces. DEFENSE IN DEPTH ONLY:
// Railway decides authorization from the verified Auth V2 token, and it is the
// authority. These helpers exist so a rider never SEES a control they cannot
// use, and so a deep link cannot render an admin/operator surface.
//
// The role comes from auth.getRole(), which is a presentation cache of the
// verified login response — never an assertion the client makes to the backend.
//
// Contract mirrored from the backend authorizationContract.js:
//   openServiceSession / getCurrentServiceCloseout are NOT admin-only,
//   so admin AND operator may open and inspect the service. Rider may not.
// ===============================================================

export const ROLE = Object.freeze({
  ADMIN: 'admin',
  OPERATOR: 'operator',
  RIDER: 'rider',
});

const normalize = (role) => String(role || '').trim().toLowerCase();

export function canAccessAdminArea(role) {
  return normalize(role) === ROLE.ADMIN;
}

// Recovered verbatim from f841255: the current-night closeout is an operational
// surface, not an admin-only report.
export function canAccessCurrentCloseout(role) {
  const r = normalize(role);
  return r === ROLE.ADMIN || r === ROLE.OPERATOR;
}

// Registering a customer's payment for a check (Economía → Pendientes → "Registrar cobro"). Mirrors the backend's
// ORDER_PAYMENT_ROLES (cashService.js) and the DB gate of order_post_payment_v1 EXACTLY: admin and operator. It is
// deliberately NOT the wider Economía READ audience (owner/cashier/legacy_operator can read the list but cannot take
// the money -- Cash V1 brief §25: no authorization widening). A control they could not use is never shown.
export function canCollectOrderPayment(role) {
  const r = normalize(role);
  return r === ROLE.ADMIN || r === ROLE.OPERATOR;
}

// POST-ASTRA F1 -- cancelling a never-handed-over order of a closed service from Economía → Pendientes. UX only: the
// backend (order_cancel_v1 / order_post_close_obligation_resolution_v1 role gates) decides. Admin and operator: the
// same audience that takes the money on that surface.
export function canCancelPendingOrder(role) {
  const r = normalize(role);
  return r === ROLE.ADMIN || r === ROLE.OPERATOR;
}

// Opening the service is the same audience as inspecting the closeout: the
// person who opens the pizzeria is the operator on shift.
export function canOpenService(role) {
  return canAccessCurrentCloseout(role);
}

export function isRider(role) {
  return normalize(role) === ROLE.RIDER;
}

export function fallbackScreenForRole(role) {
  return isRider(role) ? 'repartidor' : 'servicio';
}
