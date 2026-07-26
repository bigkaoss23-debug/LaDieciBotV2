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
