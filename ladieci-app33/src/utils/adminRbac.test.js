import { canAccessAdminArea, canAccessCurrentCloseout, canOpenService, isRider, fallbackScreenForRole } from './adminRbac';

// Mirrors the backend authorizationContract.js: openServiceSession and
// getCurrentServiceCloseout are NOT in ADMIN_ONLY_ACTIONS and are not
// rider-enabled → admin + operator, never rider.
describe('service-session role rules', () => {
  test('admin may open and inspect', () => {
    expect(canOpenService('admin')).toBe(true);
    expect(canAccessCurrentCloseout('admin')).toBe(true);
  });

  test('operator may open and inspect', () => {
    expect(canOpenService('operator')).toBe(true);
    expect(canAccessCurrentCloseout('operator')).toBe(true);
  });

  test('rider may NOT open and may NOT inspect', () => {
    expect(canOpenService('rider')).toBe(false);
    expect(canAccessCurrentCloseout('rider')).toBe(false);
    expect(isRider('rider')).toBe(true);
  });

  test('an unknown, empty or absent role is refused (fail closed)', () => {
    for (const r of ['', null, undefined, 'service', 'guest']) {
      expect(canOpenService(r)).toBe(false);
      expect(canAccessCurrentCloseout(r)).toBe(false);
      expect(canAccessAdminArea(r)).toBe(false);
    }
  });

  test('role comparison is case/whitespace tolerant but not permissive', () => {
    expect(canOpenService(' Operator ')).toBe(true);
    expect(canOpenService('operatorX')).toBe(false);
  });

  test('the admin area stays admin-only', () => {
    expect(canAccessAdminArea('admin')).toBe(true);
    expect(canAccessAdminArea('operator')).toBe(false);
  });

  test('a rider always falls back to the delivery surface', () => {
    expect(fallbackScreenForRole('rider')).toBe('repartidor');
    expect(fallbackScreenForRole('operator')).toBe('servicio');
  });
});
