import { toAccessUserViewModel, buildAccessDirectoryViewModel } from './accessUserViewModel';

// Real staging shape (V3-I.1 UX pass) — displayName values already observed live:
// legacy operators carry a migration-generated "... heredado" name, and the rider's
// displayName is literally just the role word. None of the three is a real person's
// name, so the frozen UX feedback expects all three to fall back to "Operador N".
const OWNER = { actor: 'owner', displayName: 'Propietario', dbRole: 'admin', canonicalRole: 'owner', active: true, hasPin: true, sessionVersion: 15 };
const OP_BACKUP = { actor: 'operator_backup', displayName: 'Operador de apoyo heredado', dbRole: 'operator', canonicalRole: 'legacy_operator', active: true, hasPin: true, sessionVersion: 4 };
const OP_PRIMARY = { actor: 'operator_primary', displayName: 'Operador principal heredado', dbRole: 'operator', canonicalRole: 'legacy_operator', active: true, hasPin: true, sessionVersion: 10 };
const RIDER = { actor: 'rider', displayName: 'Repartidor', dbRole: 'rider', canonicalRole: 'rider', active: true, hasPin: true, sessionVersion: 2 };

describe('toAccessUserViewModel — owner', () => {
  test('owner with a role-only displayName collapses to Propietario, no duplicate role line', () => {
    const vm = toAccessUserViewModel(OWNER, { isOwner: true, staffIndex: null });
    expect(vm.primaryLabel).toBe('Propietario');
    expect(vm.roleLabel).toBe('Propietario');
    expect(vm.showRoleLabel).toBe(false);
  });

  test('owner never shows Activo/Inactivo — a logged-in owner carries no such information', () => {
    const vm = toAccessUserViewModel(OWNER, { isOwner: true, staffIndex: null });
    expect(vm.statusLabel).not.toMatch(/Activo|Inactivo/);
    const vmEvenIfFlaggedInactive = toAccessUserViewModel({ ...OWNER, active: false }, { isOwner: true, staffIndex: null });
    expect(vmEvenIfFlaggedInactive.statusLabel).not.toMatch(/Inactivo/);
  });

  test('owner PIN status is shown and toned', () => {
    const vm = toAccessUserViewModel(OWNER, { isOwner: true, staffIndex: null });
    expect(vm.statusLabel).toBe('PIN configurado');
    expect(vm.statusTone).toBe('positive');
    expect(toAccessUserViewModel({ ...OWNER, hasPin: false }, { isOwner: true, staffIndex: null }).statusLabel).toBe('PIN no configurado');
  });

  test('a genuine human owner name is preferred over the Propietario fallback, role line then shown', () => {
    const vm = toAccessUserViewModel({ ...OWNER, displayName: 'Marta Gómez' }, { isOwner: true, staffIndex: null });
    expect(vm.primaryLabel).toBe('Marta Gómez');
    expect(vm.roleLabel).toBe('Propietario');
    expect(vm.showRoleLabel).toBe(true);
  });
});

describe('toAccessUserViewModel — staff fallback naming', () => {
  test('a migration "... heredado" name falls back to Operador N, role line shown', () => {
    const vm = toAccessUserViewModel(OP_PRIMARY, { isOwner: false, staffIndex: 2 });
    expect(vm.primaryLabel).toBe('Operador 2');
    expect(vm.roleLabel).toBe('Operador actual');
    expect(vm.showRoleLabel).toBe(true);
  });

  test('a displayName that is just the role word (rider -> "Repartidor") falls back too', () => {
    const vm = toAccessUserViewModel(RIDER, { isOwner: false, staffIndex: 3 });
    expect(vm.primaryLabel).toBe('Operador 3');
    expect(vm.roleLabel).toBe('Repartidor');
  });

  test('an empty or actor-id-equal displayName falls back', () => {
    expect(toAccessUserViewModel({ ...RIDER, displayName: '' }, { isOwner: false, staffIndex: 1 }).primaryLabel).toBe('Operador 1');
    expect(toAccessUserViewModel({ ...RIDER, displayName: 'rider' }, { isOwner: false, staffIndex: 1 }).primaryLabel).toBe('Operador 1');
  });

  test('a genuine human name wins over the fallback and is shown verbatim', () => {
    const vm = toAccessUserViewModel({ ...OP_BACKUP, displayName: 'Carlos Pérez' }, { isOwner: false, staffIndex: 1 });
    expect(vm.primaryLabel).toBe('Carlos Pérez');
    expect(vm.roleLabel).toBe('Operador actual');
    expect(vm.showRoleLabel).toBe(true);
  });

  test('the internal actor id and canonicalRole are retained but only under explicitly-named non-primary fields', () => {
    const vm = toAccessUserViewModel(OP_BACKUP, { isOwner: false, staffIndex: 1 });
    expect(vm.actorId).toBe('operator_backup');
    expect(vm.secondaryTechnicalId).toBe('operator_backup');
    expect(vm.primaryLabel).not.toBe('operator_backup');
    expect(vm.roleLabel).not.toMatch(/Legacy/i);
  });
});

describe('toAccessUserViewModel — status', () => {
  test('inactive staff shows Inactivo and takes priority over PIN wording', () => {
    const vm = toAccessUserViewModel({ ...OP_BACKUP, active: false, hasPin: true }, { isOwner: false, staffIndex: 1 });
    expect(vm.statusLabel).toBe('Inactivo');
    expect(vm.statusTone).toBe('danger');
  });

  test('active staff shows PIN configurado/no configurado, never a separate Activo label', () => {
    const configured = toAccessUserViewModel({ ...OP_BACKUP, active: true, hasPin: true }, { isOwner: false, staffIndex: 1 });
    expect(configured.statusLabel).toBe('PIN configurado');
    expect(configured.statusTone).toBe('positive');
    const notConfigured = toAccessUserViewModel({ ...OP_BACKUP, active: true, hasPin: false }, { isOwner: false, staffIndex: 1 });
    expect(notConfigured.statusLabel).toBe('PIN no configurado');
    expect(notConfigured.statusTone).toBe('warning');
  });

  test('at most one status concept is ever produced (never "Inactivo · PIN configurado")', () => {
    const vm = toAccessUserViewModel({ ...OP_BACKUP, active: false, hasPin: true }, { isOwner: false, staffIndex: 1 });
    expect(vm.statusLabel).not.toMatch(/·/);
  });
});

describe('buildAccessDirectoryViewModel — deterministic ordering', () => {
  const REAL_USERS = [OWNER, OP_BACKUP, OP_PRIMARY, RIDER];

  test('splits owner from staff by the current session actor', () => {
    const dir = buildAccessDirectoryViewModel(REAL_USERS, { currentActorId: 'owner' });
    expect(dir.owner.actorId).toBe('owner');
    expect(dir.staff.map((s) => s.actorId).sort()).toEqual(['operator_backup', 'operator_primary', 'rider']);
  });

  test('the real current dataset maps operator_backup/operator_primary/rider to Operador 1/2/3 in that order', () => {
    const dir = buildAccessDirectoryViewModel(REAL_USERS, { currentActorId: 'owner' });
    const byActor = Object.fromEntries(dir.staff.map((s) => [s.actorId, s.primaryLabel]));
    expect(byActor.operator_backup).toBe('Operador 1');
    expect(byActor.operator_primary).toBe('Operador 2');
    expect(byActor.rider).toBe('Operador 3');
  });

  test('ordering is stable regardless of the input array order (not dependent on caller/backend order)', () => {
    const shuffled = [RIDER, OWNER, OP_PRIMARY, OP_BACKUP];
    const dir = buildAccessDirectoryViewModel(shuffled, { currentActorId: 'owner' });
    const byActor = Object.fromEntries(dir.staff.map((s) => [s.actorId, s.primaryLabel]));
    expect(byActor.operator_backup).toBe('Operador 1');
    expect(byActor.operator_primary).toBe('Operador 2');
    expect(byActor.rider).toBe('Operador 3');
  });

  test('a real fourth staff account becomes Operador 4, dynamically — no hardcoded count', () => {
    // 'waiter_new' sorts after 'rider' alphabetically, so it lands last (index 4).
    const withFourth = [...REAL_USERS, { actor: 'waiter_new', displayName: 'Camarero nuevo', canonicalRole: 'waiter', active: true, hasPin: false }];
    const dir = buildAccessDirectoryViewModel(withFourth, { currentActorId: 'owner' });
    expect(dir.staff).toHaveLength(4);
    const fourth = dir.staff.find((s) => s.actorId === 'waiter_new');
    expect(fourth).toBeTruthy();
    expect(fourth.primaryLabel).toBe('Camarero nuevo'); // a real human-friendly name wins over "Operador 4"
  });

  test('no fake Operador 4 is ever produced when only three real staff accounts exist', () => {
    const dir = buildAccessDirectoryViewModel(REAL_USERS, { currentActorId: 'owner' });
    expect(dir.staff).toHaveLength(3);
    expect(dir.staff.some((s) => s.primaryLabel === 'Operador 4')).toBe(false);
  });

  test('when the current actor is missing from the list, owner is null and nothing crashes', () => {
    const dir = buildAccessDirectoryViewModel([OP_BACKUP, RIDER], { currentActorId: 'owner' });
    expect(dir.owner).toBeNull();
    expect(dir.staff).toHaveLength(2);
  });

  test('an empty/non-array input never throws', () => {
    expect(buildAccessDirectoryViewModel(null, { currentActorId: 'owner' })).toEqual({ owner: null, staff: [] });
    expect(buildAccessDirectoryViewModel([], { currentActorId: 'owner' })).toEqual({ owner: null, staff: [] });
  });
});

describe('buildAccessDirectoryViewModel — fallback-numbering stability (V3-I UX)', () => {
  const REAL_USERS = [OWNER, OP_BACKUP, OP_PRIMARY, RIDER]; // all three staff are generic-named -> Operador 1/2/3
  const NAMED_EARLY = { actor: 'aaron_named', displayName: 'Aarón Named', canonicalRole: 'waiter', active: true, hasPin: false };
  const NAMED_LATE = { actor: 'zzz_named', displayName: 'Zoe Named', canonicalRole: 'waiter', active: true, hasPin: false };

  test('inserting a friendly-named account that sorts BEFORE the generic ones does not shift their fallback numbers', () => {
    const dir = buildAccessDirectoryViewModel([...REAL_USERS, NAMED_EARLY], { currentActorId: 'owner' });
    const byActor = Object.fromEntries(dir.staff.map((s) => [s.actorId, s.primaryLabel]));
    expect(byActor.operator_backup).toBe('Operador 1');
    expect(byActor.operator_primary).toBe('Operador 2');
    expect(byActor.rider).toBe('Operador 3');
    expect(byActor.aaron_named).toBe('Aarón Named'); // consumes no numbering slot
  });

  test('removing a friendly-named account leaves the remaining generic fallback numbers unchanged', () => {
    const withNamed = buildAccessDirectoryViewModel([...REAL_USERS, NAMED_EARLY], { currentActorId: 'owner' });
    const withoutNamed = buildAccessDirectoryViewModel(REAL_USERS, { currentActorId: 'owner' });
    const before = Object.fromEntries(withNamed.staff.map((s) => [s.actorId, s.primaryLabel]));
    const after = Object.fromEntries(withoutNamed.staff.map((s) => [s.actorId, s.primaryLabel]));
    expect(before.operator_backup).toBe(after.operator_backup);
    expect(before.operator_primary).toBe(after.operator_primary);
    expect(before.rider).toBe(after.rider);
  });

  test('two friendly-named accounts interleaved on both sides of the generic ones still leave Operador N sequential and unshifted', () => {
    const dir = buildAccessDirectoryViewModel([...REAL_USERS, NAMED_EARLY, NAMED_LATE], { currentActorId: 'owner' });
    const byActor = Object.fromEntries(dir.staff.map((s) => [s.actorId, s.primaryLabel]));
    expect(byActor.operator_backup).toBe('Operador 1');
    expect(byActor.operator_primary).toBe('Operador 2');
    expect(byActor.rider).toBe('Operador 3');
  });

  test('a later rename of a fallback-numbered account frees its slot but never renumbers a sibling still awaiting a name', () => {
    const renamed = { ...OP_BACKUP, displayName: 'Carlos Pérez' }; // operator_backup gets a real name
    const dir = buildAccessDirectoryViewModel([OWNER, renamed, OP_PRIMARY, RIDER], { currentActorId: 'owner' });
    const byActor = Object.fromEntries(dir.staff.map((s) => [s.actorId, s.primaryLabel]));
    expect(byActor.operator_backup).toBe('Carlos Pérez');
    expect(byActor.operator_primary).toBe('Operador 1'); // still first in the fallback-only sequence
    expect(byActor.rider).toBe('Operador 2');
  });
});

describe('writeSnapshot — internal-only stale-snapshot fields (V3-I)', () => {
  test('carries the RAW dbRole (not canonicalRole) for the role-change stale-snapshot guard', () => {
    const vm = toAccessUserViewModel(OP_PRIMARY, { isOwner: false, staffIndex: 2 });
    expect(vm.writeSnapshot.dbRole).toBe('operator'); // raw DB value, NOT 'legacy_operator'
  });

  test('carries active and sessionVersion for the deactivate/reactivate/clear-PIN guards', () => {
    const vm = toAccessUserViewModel(RIDER, { isOwner: false, staffIndex: 3 });
    expect(vm.writeSnapshot.active).toBe(true);
    expect(vm.writeSnapshot.sessionVersion).toBe(2);
  });

  test('writeSnapshot is never used for primary/role display — primaryLabel and roleLabel are unaffected by it', () => {
    const vm = toAccessUserViewModel(OP_PRIMARY, { isOwner: false, staffIndex: 2 });
    expect(vm.primaryLabel).toBe('Operador 2');
    expect(vm.roleLabel).toBe('Operador actual');
    expect(vm.roleLabel).not.toBe(vm.writeSnapshot.dbRole);
  });
});
