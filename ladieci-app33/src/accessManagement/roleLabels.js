// ─── Access Management V3 — Spanish role labels (V3-I.1, spec Section 8) ─────
// Maps the SAFE `canonicalRole` field (never the raw legacy `dbRole`) to the
// label the owner sees. legacy_operator stays "Operador actual" — it must
// never be auto-relabelled to cashier/waiter; only an explicit role change in
// a later slice may change it.
const ROLE_LABEL = Object.freeze({
  owner: 'Propietario',
  cashier: 'Caja',
  waiter: 'Camarero',
  kitchen: 'Cocina',
  rider: 'Repartidor',
  shift_manager: 'Responsable de turno',
  legacy_operator: 'Operador actual',
});

// shift_manager has no finalized operational permissions yet — mark it, never imply
// otherwise.
const BETA_ROLES = Object.freeze(new Set(['shift_manager']));

export function describeRole(canonicalRole) {
  const label = ROLE_LABEL[canonicalRole] || canonicalRole || 'Sin rol';
  return {
    label,
    beta: BETA_ROLES.has(canonicalRole),
    legacy: canonicalRole === 'legacy_operator',
  };
}

// The role selector's option list (V3-I write flow). Exact allowlist mirrored
// from the backend's ASSIGNABLE_ROLES (src/auth/roleTransition.js) — owner,
// legacy_operator, admin and operator are deliberately excluded: none of them is
// ever a valid role-change/create TARGET (confirmed against the backend source
// and its own tests, which reject all four with AUTH_ROLE_INVALID/400).
const ASSIGNABLE_ROLES = Object.freeze(['cashier', 'waiter', 'kitchen', 'rider', 'shift_manager']);

const ROLE_OPTIONS = Object.freeze(
  ASSIGNABLE_ROLES.map((value) => Object.freeze({ value, ...describeRole(value) }))
);

export { ROLE_LABEL, BETA_ROLES, ASSIGNABLE_ROLES, ROLE_OPTIONS };
