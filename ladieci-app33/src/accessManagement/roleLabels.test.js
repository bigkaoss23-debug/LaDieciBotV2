import { describeRole } from './roleLabels';

describe('describeRole (V3-I.1 Section 8 Spanish labels)', () => {
  test('exact label for every canonical role', () => {
    expect(describeRole('owner').label).toBe('Propietario');
    expect(describeRole('cashier').label).toBe('Caja');
    expect(describeRole('waiter').label).toBe('Camarero');
    expect(describeRole('kitchen').label).toBe('Cocina');
    expect(describeRole('rider').label).toBe('Repartidor');
    expect(describeRole('shift_manager').label).toBe('Responsable de turno');
    expect(describeRole('legacy_operator').label).toBe('Operador actual');
  });

  test('legacy_operator is flagged legacy and is never auto-relabelled to cashier/waiter', () => {
    const d = describeRole('legacy_operator');
    expect(d.legacy).toBe(true);
    expect(d.label).not.toBe('Caja');
    expect(d.label).not.toBe('Camarero');
  });

  test('shift_manager is flagged beta; nothing else is', () => {
    expect(describeRole('shift_manager').beta).toBe(true);
    for (const r of ['owner', 'cashier', 'waiter', 'kitchen', 'rider', 'legacy_operator']) {
      expect(describeRole(r).beta).toBe(false);
    }
  });

  test('an unknown/empty role fails safe — never crashes, never blank', () => {
    expect(describeRole('').label).toBe('Sin rol');
    expect(describeRole(undefined).label).toBe('Sin rol');
    expect(describeRole(null).label).toBe('Sin rol');
    expect(describeRole('something_new').label).toBe('something_new');
  });
});
