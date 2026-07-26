import { createSharedEnsure, attemptSilentEnsure } from './serviceEnsureFlow';
import { ENSURE_OUTCOME } from './serviceEnsureOutcome';

const defer = () => { let resolve; const p = new Promise((res) => { resolve = res; }); return { p, resolve }; };

describe('createSharedEnsure — one in-flight request no matter how many concurrent callers', () => {
  test('two concurrent calls share exactly ONE underlying request', async () => {
    const gate = defer();
    const ensureFn = jest.fn(() => gate.p.then(() => ({ success: true, session: {} })));
    const shared = createSharedEnsure(ensureFn);

    const p1 = shared();
    const p2 = shared(); // same tick — simulates StrictMode double-invoke / a remount racing the first mount
    gate.resolve();
    await Promise.all([p1, p2]);

    expect(ensureFn).toHaveBeenCalledTimes(1);
  });

  test('three simultaneous mounts (multiple children asking at once) still issue exactly one request', async () => {
    const gate = defer();
    const ensureFn = jest.fn(() => gate.p.then(() => ({ success: true })));
    const shared = createSharedEnsure(ensureFn);
    const calls = [shared(), shared(), shared()];
    gate.resolve();
    await Promise.all(calls);
    expect(ensureFn).toHaveBeenCalledTimes(1);
  });

  test('a call made AFTER the first one settles issues a NEW request — dedup is concurrency-only, not a time cache', async () => {
    const ensureFn = jest.fn(async () => ({ success: true }));
    const shared = createSharedEnsure(ensureFn);
    await shared();
    await shared();
    expect(ensureFn).toHaveBeenCalledTimes(2);
  });

  test('a rejected underlying call still clears the in-flight slot, so a retry is possible', async () => {
    let n = 0;
    const ensureFn = jest.fn(async () => { n += 1; if (n === 1) throw new Error('network'); return { success: true }; });
    const shared = createSharedEnsure(ensureFn);
    await expect(shared()).rejects.toThrow('network');
    const res = await shared();
    expect(res.success).toBe(true);
    expect(ensureFn).toHaveBeenCalledTimes(2);
  });
});

describe('attemptSilentEnsure — the role gate is checked BEFORE the shared request', () => {
  test('rider entry never calls sharedEnsure at all', async () => {
    const sharedEnsure = jest.fn(async () => ({ success: true }));
    const { outcome } = await attemptSilentEnsure({ role: 'rider', sharedEnsure });
    expect(sharedEnsure).not.toHaveBeenCalled();
    expect(outcome.kind).toBe(ENSURE_OUTCOME.DENIED);
    expect(outcome.message).toMatch(/reparto/i);
  });

  test('an unknown/empty/invalid role never calls sharedEnsure', async () => {
    for (const role of [undefined, null, '', 'guest', 'superadmin']) {
      const sharedEnsure = jest.fn(async () => ({ success: true }));
      // eslint-disable-next-line no-await-in-loop
      const { outcome } = await attemptSilentEnsure({ role, sharedEnsure });
      expect(sharedEnsure).not.toHaveBeenCalled();
      expect(outcome.kind).toBe(ENSURE_OUTCOME.DENIED);
    }
  });

  test('admin entry calls sharedEnsure exactly once and classifies its result', async () => {
    const sharedEnsure = jest.fn(async () => ({ success: true, created: true, code: 'CREATED', session: { id: '1', serviceKind: 'PRANZO' } }));
    const { outcome } = await attemptSilentEnsure({ role: 'admin', sharedEnsure });
    expect(sharedEnsure).toHaveBeenCalledTimes(1);
    expect(outcome.kind).toBe(ENSURE_OUTCOME.ALLOWED);
    expect(outcome.session.serviceKind).toBe('PRANZO');
  });

  test('operator entry calls sharedEnsure exactly once', async () => {
    const sharedEnsure = jest.fn(async () => ({ success: true, created: false, code: 'REUSED', session: { id: '2', serviceKind: 'SERA' } }));
    const { outcome } = await attemptSilentEnsure({ role: 'operator', sharedEnsure });
    expect(sharedEnsure).toHaveBeenCalledTimes(1);
    expect(outcome.kind).toBe(ENSURE_OUTCOME.ALLOWED);
    expect(outcome.created).toBe(false);
  });

  test('a typed non-success outcome is passed through, not swallowed', async () => {
    const sharedEnsure = jest.fn(async () => ({ success: false, code: 'LUNCH_SESSION_STILL_ACTIVE', session: { serviceKind: 'PRANZO' }, _status: 409, _ok: false }));
    const { outcome } = await attemptSilentEnsure({ role: 'operator', sharedEnsure });
    expect(outcome.kind).toBe(ENSURE_OUTCOME.LUNCH_SESSION_STILL_ACTIVE);
  });
});

describe('two consumers of the SAME module-level shared function behave as one gate', () => {
  test('admin + operator "mounting" concurrently against the same sharedEnsure share one request', async () => {
    const gate = defer();
    const ensureFn = jest.fn(() => gate.p.then(() => ({ success: true, session: { serviceKind: 'SERA' } })));
    const sharedEnsure = createSharedEnsure(ensureFn);

    const p1 = attemptSilentEnsure({ role: 'admin', sharedEnsure });
    const p2 = attemptSilentEnsure({ role: 'operator', sharedEnsure });
    gate.resolve();
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(ensureFn).toHaveBeenCalledTimes(1);
    expect(r1.outcome.kind).toBe(ENSURE_OUTCOME.ALLOWED);
    expect(r2.outcome.kind).toBe(ENSURE_OUTCOME.ALLOWED);
  });
});
