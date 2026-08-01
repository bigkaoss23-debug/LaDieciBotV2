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

export { ROLE_LABEL, BETA_ROLES };
