// S2-7D5B — the draft write lock must cover openServiceSession.
//
// A Netlify draft points at the SAME staging proxy and the SAME staging Supabase
// project as the published site. Opening a service session is not a harmless
// read: it mints a permanent UUID, becomes a ledger unit, and binds every order
// created afterwards. So on a no-persist draft the call must die BEFORE the
// network, exactly like an order write — otherwise "please don't press it" is
// the only protection, which is what went wrong on draft 6a65f7ce.
//
// The whole point is that no request is constructed, so the test asserts on a
// fetch spy, not on a mocked response.

const OPEN = 'openServiceSession';

const loadWith = (draftFlag) => {
  jest.resetModules();
  const prev = process.env.REACT_APP_DRAFT_NO_PERSIST;
  if (draftFlag === undefined) delete process.env.REACT_APP_DRAFT_NO_PERSIST;
  else process.env.REACT_APP_DRAFT_NO_PERSIST = draftFlag;
  // eslint-disable-next-line global-require
  const mod = { api: require('./api').api, draftGuard: require('./draftGuard') };
  if (prev === undefined) delete process.env.REACT_APP_DRAFT_NO_PERSIST;
  else process.env.REACT_APP_DRAFT_NO_PERSIST = prev;
  return mod;
};

describe('draft no-persist: openServiceSession is a MUTATION', () => {
  let fetchSpy;
  beforeEach(() => { fetchSpy = jest.fn(); global.fetch = fetchSpy; });
  afterEach(() => { delete global.fetch; });

  test('it is classified as a blocked mutation, not an allowlisted read', () => {
    const { draftGuard } = loadWith('true');
    expect(draftGuard.DRAFT_NO_PERSIST).toBe(true);
    expect(draftGuard.isBlockedMutation(OPEN)).toBe(true);
    // the read-only allowlist must stay exactly the four planner previews
    expect(draftGuard.READ_ONLY_POST_ACTIONS.has(OPEN)).toBe(false);
    expect([...draftGuard.READ_ONLY_POST_ACTIONS].sort()).toEqual([
      'previewManualGiroRoute', 'previewOrderPlanner', 'previewOrderTiming', 'previewStrategicOpportunities',
    ]);
  });

  test('no network request is EVER constructed', async () => {
    const { api } = loadWith('true');
    await api.openServiceSession();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('it returns typed blocked feedback, never a generic success', async () => {
    const { api } = loadWith('true');
    const res = await api.openServiceSession();
    expect(res.draftBlocked).toBe(true);
    expect(res._ok).toBe(false);
    expect(res.success).toBeUndefined();
    expect(String(res.error)).toMatch(/no persiste datos/i);
  });

  test('the attempt is a visible failure, and the lock releases so retry works', async () => {
    const { api } = loadWith('true');
    // eslint-disable-next-line global-require
    const { ATTEMPT, createAttemptLock, runOpenServiceAttempt } = require('./utils/openServiceFlow');
    const lock = createAttemptLock();
    const readState = jest.fn(async () => ({ status: 'open', available: true }));

    const first = await runOpenServiceAttempt({
      lock, openService: () => api.openServiceSession(), readState,
    });
    expect(first.kind).toBe(ATTEMPT.FAILURE);
    expect(first.reason).toBe('blocked');
    // a blocked open must never be "verified" into a success
    expect(readState).not.toHaveBeenCalled();
    expect(lock.busy).toBe(false);

    const second = await runOpenServiceAttempt({
      lock, openService: () => api.openServiceSession(), readState,
    });
    expect(second.kind).toBe(ATTEMPT.FAILURE);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('the state READ stays available, so the draft is still explorable', async () => {
    const { api } = loadWith('true');
    fetchSpy.mockResolvedValue({ status: 200, ok: true, json: async () => ({ available: false, status: 'none' }) });
    const res = await api.getCurrentServiceCloseout();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.draftBlocked).toBeUndefined();
  });
});

describe('the normal (non-draft) path is NOT weakened', () => {
  let fetchSpy;
  beforeEach(() => { fetchSpy = jest.fn(); global.fetch = fetchSpy; });
  afterEach(() => { delete global.fetch; });

  test('with the flag absent, openServiceSession reaches the proxy normally', async () => {
    const { api, draftGuard } = loadWith(undefined);
    expect(draftGuard.DRAFT_NO_PERSIST).toBe(false);
    expect(draftGuard.isBlockedMutation(OPEN)).toBe(false);
    fetchSpy.mockResolvedValue({ status: 200, ok: true, json: async () => ({ ok: true }) });
    const res = await api.openServiceSession();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/proxy');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ action: OPEN });
    expect(res.draftBlocked).toBeUndefined();
    expect(res._ok).toBe(true);
  });

  test('any value other than the exact string "true" leaves the lock off', () => {
    expect(loadWith('false').draftGuard.DRAFT_NO_PERSIST).toBe(false);
    expect(loadWith('1').draftGuard.DRAFT_NO_PERSIST).toBe(false);
    expect(loadWith('TRUE').draftGuard.DRAFT_NO_PERSIST).toBe(false);
  });
});
