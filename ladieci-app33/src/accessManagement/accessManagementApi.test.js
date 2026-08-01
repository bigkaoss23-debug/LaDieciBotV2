// Access Management V3 client — read (V3-I.1) + write (V3-I). Mocks ../api (auth) and
// global.fetch — same house style as src/account/accountApi.test.js and
// src/api/shadowPreview.js's usage.
jest.mock('../api', () => ({
  __esModule: true,
  auth: {
    getToken: jest.fn(() => 'FAKE_TOKEN'),
    clear: jest.fn(),
  },
}));

const { auth } = require('../api');
const { BACKEND_BASE_URL } = require('../utils/backendBase');
const {
  listAccessUsers, getAccessUser, ACCESS_USERS_PATH,
  createAccessUser, renameAccessUser, changeAccessUserRole,
  setAccessUserPin, clearAccessUserPin, deactivateAccessUser, reactivateAccessUser,
} = require('./accessManagementApi');

function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

const OWNER_WIRE = {
  actor: 'owner', displayName: 'Ana', dbRole: 'admin', canonicalRole: 'owner',
  active: true, hasPin: true, sessionVersion: 15,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
const SAFE_OWNER = {
  actor: 'owner', displayName: 'Ana', dbRole: 'admin', canonicalRole: 'owner',
  active: true, hasPin: true, sessionVersion: 15,
};

beforeEach(() => {
  jest.clearAllMocks();
  auth.getToken.mockReturnValue('FAKE_TOKEN');
});
afterEach(() => { delete global.fetch; });

describe('listAccessUsers', () => {
  test('calls the exact V3 list URL with GET and the operational bearer token', async () => {
    global.fetch = jest.fn(async (url, opts) => {
      expect(url).toBe(BACKEND_BASE_URL + ACCESS_USERS_PATH);
      expect(opts.method).toBe('GET');
      expect(opts.headers.Authorization).toBe('Bearer FAKE_TOKEN');
      return jsonResponse(200, { ok: true, users: [OWNER_WIRE] });
    });
    const res = await listAccessUsers();
    expect(res.kind).toBe('ok');
    expect(res.users).toEqual([SAFE_OWNER]);
  });

  test('projects only the safe fields — extra/unknown fields from the wire are dropped', async () => {
    global.fetch = jest.fn(async () => jsonResponse(200, {
      ok: true,
      users: [{ ...OWNER_WIRE, pinHash: 'should-never-appear', sid: 'secret-session-id' }],
    }));
    const res = await listAccessUsers();
    expect(res.kind).toBe('ok');
    expect(Object.keys(res.users[0]).sort()).toEqual(
      ['actor', 'active', 'dbRole', 'canonicalRole', 'displayName', 'hasPin', 'sessionVersion'].sort()
    );
  });

  test('no token at all -> unauthenticated without ever calling the network', async () => {
    auth.getToken.mockReturnValue('');
    global.fetch = jest.fn();
    const res = await listAccessUsers();
    expect(res.kind).toBe('unauthenticated');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('401 AUTH_UNAUTHENTICATED triggers the canonical operational-logout signal', async () => {
    const listener = jest.fn();
    window.addEventListener('ld-operational-unauthorized', listener);
    global.fetch = jest.fn(async () => jsonResponse(401, { ok: false, code: 'AUTH_UNAUTHENTICATED' }));
    const res = await listAccessUsers();
    expect(res.kind).toBe('unauthenticated');
    expect(auth.clear).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('ld-operational-unauthorized', listener);
  });

  test('403 forbidden is a distinct, non-logout outcome', async () => {
    const listener = jest.fn();
    window.addEventListener('ld-operational-unauthorized', listener);
    global.fetch = jest.fn(async () => jsonResponse(403, { ok: false, code: 'AUTH_FORBIDDEN_ROLE' }));
    const res = await listAccessUsers();
    expect(res.kind).toBe('forbidden');
    expect(auth.clear).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('ld-operational-unauthorized', listener);
  });

  test('network failure never throws and is reported as kind:network', async () => {
    global.fetch = jest.fn(async () => { throw new Error('offline'); });
    await expect(listAccessUsers()).resolves.toEqual(expect.objectContaining({ kind: 'network' }));
  });

  test('malformed JSON body is handled as a safe server error, never throws', async () => {
    global.fetch = jest.fn(async () => ({ status: 200, ok: true, json: async () => { throw new Error('bad json'); } }));
    const res = await listAccessUsers();
    expect(res.kind).toBe('server');
  });

  test('a users field that is not an array is rejected, not rendered', async () => {
    global.fetch = jest.fn(async () => jsonResponse(200, { ok: true, users: 'not-an-array' }));
    const res = await listAccessUsers();
    expect(res.kind).toBe('malformed');
  });

  test('a record missing a required safe field fails the whole response closed', async () => {
    global.fetch = jest.fn(async () => jsonResponse(200, { ok: true, users: [{ actor: 'owner' }] }));
    const res = await listAccessUsers();
    expect(res.kind).toBe('malformed');
  });

  test('the bearer token is never logged to the console', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn(async () => jsonResponse(200, { ok: true, users: [] }));
    await listAccessUsers();
    const seen = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().map(String).join(' ');
    expect(seen).not.toMatch(/FAKE_TOKEN/);
    logSpy.mockRestore(); errSpy.mockRestore();
  });
});

describe('getAccessUser', () => {
  test('calls the exact V3 detail URL with the encoded actor id', async () => {
    global.fetch = jest.fn(async (url) => {
      expect(url).toBe(`${BACKEND_BASE_URL}${ACCESS_USERS_PATH}/owner`);
      return jsonResponse(200, { ok: true, user: OWNER_WIRE });
    });
    const res = await getAccessUser('owner');
    expect(res.kind).toBe('ok');
    expect(res.user).toEqual(SAFE_OWNER);
  });

  test('URL-encodes the actor id', async () => {
    global.fetch = jest.fn(async (url) => {
      expect(url).toBe(`${BACKEND_BASE_URL}${ACCESS_USERS_PATH}/weird%20actor`);
      return jsonResponse(404, { ok: false, code: 'AUTH_TARGET_NOT_FOUND' });
    });
    const res = await getAccessUser('weird actor');
    expect(res.kind).toBe('not_found');
  });
});

// ═══ WRITE METHODS ══════════════════════════════════════════════════════════
// Exact contracts mirrored from the backend handlers (accessManagementHttpHandlersV3.js).

describe('createAccessUser', () => {
  test('POST to the exact path with stepUpProof/clientRequestId/role/displayName in the body', async () => {
    global.fetch = jest.fn(async (url, opts) => {
      expect(url).toBe(BACKEND_BASE_URL + ACCESS_USERS_PATH);
      expect(opts.method).toBe('POST');
      expect(opts.headers.Authorization).toBe('Bearer FAKE_TOKEN');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(opts.body)).toEqual({
        stepUpProof: 'PROOF', clientRequestId: 'REQ-1', role: 'waiter', displayName: 'Carlos',
      });
      return jsonResponse(200, { ok: true, user: { actor: 'new_actor_1', displayName: 'Carlos', dbRole: 'waiter', canonicalRole: 'waiter', active: true, sessionVersion: 1, createdAt: 't', updatedAt: 't' } });
    });
    const res = await createAccessUser({ displayName: 'Carlos', role: 'waiter', stepUpProof: 'PROOF', clientRequestId: 'REQ-1' });
    expect(res.kind).toBe('ok');
    expect(res.user).toEqual({ actor: 'new_actor_1', displayName: 'Carlos', canonicalRole: 'waiter', active: true });
    expect(res.user).not.toHaveProperty('hasPin'); // create/rename never carry hasPin
  });

  test('never sends an actor id — the server generates it', async () => {
    global.fetch = jest.fn(async (url, opts) => {
      expect(JSON.parse(opts.body)).not.toHaveProperty('actor');
      return jsonResponse(200, { ok: true, user: { actor: 'x', displayName: 'X', canonicalRole: 'cashier', active: true } });
    });
    await createAccessUser({ displayName: 'X', role: 'cashier', stepUpProof: 'p', clientRequestId: 'r' });
  });

  test('AUTH_STEP_UP_REQUIRED (403) maps to kind:step_up_required, not kind:forbidden', async () => {
    global.fetch = jest.fn(async () => jsonResponse(403, { ok: false, code: 'AUTH_STEP_UP_REQUIRED' }));
    const res = await createAccessUser({ displayName: 'X', role: 'cashier', stepUpProof: 'bad', clientRequestId: 'r' });
    expect(res.kind).toBe('step_up_required');
  });

  test('AUTH_ROLE_INVALID (400) maps to kind:role_invalid', async () => {
    global.fetch = jest.fn(async () => jsonResponse(400, { ok: false, code: 'AUTH_ROLE_INVALID' }));
    const res = await createAccessUser({ displayName: 'X', role: 'owner', stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('role_invalid');
  });

  test('AUTH_DISPLAY_NAME_INVALID (400) maps to kind:display_name_invalid', async () => {
    global.fetch = jest.fn(async () => jsonResponse(400, { ok: false, code: 'AUTH_DISPLAY_NAME_INVALID' }));
    const res = await createAccessUser({ displayName: '', role: 'cashier', stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('display_name_invalid');
  });

  test('AUTH_IDEMPOTENCY_CONFLICT (409) maps to kind:idempotency_conflict', async () => {
    global.fetch = jest.fn(async () => jsonResponse(409, { ok: false, code: 'AUTH_IDEMPOTENCY_CONFLICT' }));
    const res = await createAccessUser({ displayName: 'X', role: 'cashier', stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('idempotency_conflict');
  });

  test('AUTH_INVALID_REQUEST (400) maps to kind:stale (no distinct wire code exists for a stale snapshot)', async () => {
    global.fetch = jest.fn(async () => jsonResponse(400, { ok: false, code: 'AUTH_INVALID_REQUEST' }));
    const res = await createAccessUser({ displayName: 'X', role: 'cashier', stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('stale');
  });
});

describe('renameAccessUser', () => {
  test('PATCH to /access-users/:actor/display-name with stepUpProof/clientRequestId/displayName', async () => {
    global.fetch = jest.fn(async (url, opts) => {
      expect(url).toBe(`${BACKEND_BASE_URL}${ACCESS_USERS_PATH}/operator_primary/display-name`);
      expect(opts.method).toBe('PATCH');
      expect(JSON.parse(opts.body)).toEqual({ stepUpProof: 'p', clientRequestId: 'r', displayName: 'Nuevo Nombre' });
      return jsonResponse(200, { ok: true, user: { actor: 'operator_primary', displayName: 'Nuevo Nombre', canonicalRole: 'legacy_operator', active: true } });
    });
    const res = await renameAccessUser({ actor: 'operator_primary', displayName: 'Nuevo Nombre', stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('ok');
    expect(res.user.displayName).toBe('Nuevo Nombre');
  });

  test('URL-encodes the target actor id', async () => {
    global.fetch = jest.fn(async (url) => {
      expect(url).toBe(`${BACKEND_BASE_URL}${ACCESS_USERS_PATH}/weird%20actor/display-name`);
      return jsonResponse(404, { ok: false, code: 'AUTH_TARGET_NOT_FOUND' });
    });
    const res = await renameAccessUser({ actor: 'weird actor', displayName: 'X', stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('not_found');
  });
});

describe('changeAccessUserRole', () => {
  test('PATCH to /access-users/:actor/role with expectedRole (raw dbRole) and requestedRole as distinct fields', async () => {
    global.fetch = jest.fn(async (url, opts) => {
      expect(url).toBe(`${BACKEND_BASE_URL}${ACCESS_USERS_PATH}/operator_primary/role`);
      expect(opts.method).toBe('PATCH');
      expect(JSON.parse(opts.body)).toEqual({
        stepUpProof: 'p', clientRequestId: 'r', expectedRole: 'operator', requestedRole: 'waiter',
      });
      return jsonResponse(200, { ok: true, user: { actor: 'operator_primary', oldRole: 'operator', role: 'waiter', sessionVersion: 11, changed: true } });
    });
    const res = await changeAccessUserRole({
      actor: 'operator_primary', expectedRole: 'operator', requestedRole: 'waiter', stepUpProof: 'p', clientRequestId: 'r',
    });
    expect(res.kind).toBe('ok');
    expect(res.user).toEqual({ actor: 'operator_primary', oldRole: 'operator', role: 'waiter', changed: true });
  });

  test('AUTH_WAITER_HAS_OPEN_TABLES (409) maps to kind:waiter_open_tables', async () => {
    global.fetch = jest.fn(async () => jsonResponse(409, { ok: false, code: 'AUTH_WAITER_HAS_OPEN_TABLES' }));
    const res = await changeAccessUserRole({ actor: 'w1', expectedRole: 'waiter', requestedRole: 'cashier', stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('waiter_open_tables');
  });

  test('AUTH_ROLE_INVALID (400) rejects a non-assignable requestedRole (e.g. owner)', async () => {
    global.fetch = jest.fn(async () => jsonResponse(400, { ok: false, code: 'AUTH_ROLE_INVALID' }));
    const res = await changeAccessUserRole({ actor: 'w1', expectedRole: 'waiter', requestedRole: 'owner', stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('role_invalid');
  });
});

describe('setAccessUserPin', () => {
  test('PUT to /access-users/:actor/pin with stepUpProof/clientRequestId/pin', async () => {
    global.fetch = jest.fn(async (url, opts) => {
      expect(url).toBe(`${BACKEND_BASE_URL}${ACCESS_USERS_PATH}/rider/pin`);
      expect(opts.method).toBe('PUT');
      expect(JSON.parse(opts.body)).toEqual({ stepUpProof: 'p', clientRequestId: 'r', pin: '284739' });
      return jsonResponse(200, { ok: true, user: { actor: 'rider', active: true, sessionVersion: 3, hasPin: true } });
    });
    const res = await setAccessUserPin({ actor: 'rider', pin: '284739', stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('ok');
    expect(res.user).toEqual({ actor: 'rider', active: true, hasPin: true });
  });

  test('never logs the PIN value', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn(async () => jsonResponse(200, { ok: true, user: { actor: 'rider', active: true, hasPin: true } }));
    await setAccessUserPin({ actor: 'rider', pin: '284739', stepUpProof: 'p', clientRequestId: 'r' });
    const seen = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().map(String).join(' ');
    expect(seen).not.toMatch(/284739/);
    logSpy.mockRestore(); errSpy.mockRestore();
  });

  test('AUTH_PIN_FORMAT_INVALID (400) maps to kind:pin_format_invalid', async () => {
    global.fetch = jest.fn(async () => jsonResponse(400, { ok: false, code: 'AUTH_PIN_FORMAT_INVALID' }));
    const res = await setAccessUserPin({ actor: 'rider', pin: '111111', stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('pin_format_invalid');
  });

  test('AUTH_PIN_DUPLICATE (409) maps to kind:pin_duplicate, never reveals which actor collides', async () => {
    global.fetch = jest.fn(async () => jsonResponse(409, { ok: false, code: 'AUTH_PIN_DUPLICATE' }));
    const res = await setAccessUserPin({ actor: 'rider', pin: '284739', stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('pin_duplicate');
    expect(JSON.stringify(res)).not.toMatch(/operator|owner|actor.*:.*'(?!rider)/);
  });

  test('AUTH_PIN_RESERVED (409) maps to kind:pin_reserved', async () => {
    global.fetch = jest.fn(async () => jsonResponse(409, { ok: false, code: 'AUTH_PIN_RESERVED' }));
    const res = await setAccessUserPin({ actor: 'rider', pin: '284739', stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('pin_reserved');
  });

  test('replaying the same clientRequestId is a safe retry (no special client handling needed)', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => { calls += 1; return jsonResponse(200, { ok: true, user: { actor: 'rider', active: true, hasPin: true } }); });
    await setAccessUserPin({ actor: 'rider', pin: '284739', stepUpProof: 'p', clientRequestId: 'same' });
    await setAccessUserPin({ actor: 'rider', pin: '284739', stepUpProof: 'p', clientRequestId: 'same' });
    expect(calls).toBe(2); // the client just sends both; the BACKEND is what replays safely
  });
});

describe('clearAccessUserPin', () => {
  test('DELETE to /access-users/:actor/pin with expectedSessionVersion, no pin field', async () => {
    global.fetch = jest.fn(async (url, opts) => {
      expect(url).toBe(`${BACKEND_BASE_URL}${ACCESS_USERS_PATH}/rider/pin`);
      expect(opts.method).toBe('DELETE');
      const body = JSON.parse(opts.body);
      expect(body).toEqual({ stepUpProof: 'p', clientRequestId: 'r', expectedSessionVersion: 3 });
      expect(body).not.toHaveProperty('pin');
      return jsonResponse(200, { ok: true, user: { actor: 'rider', dbRole: 'rider', active: true, sessionVersion: 4, updatedAt: 't' } });
    });
    const res = await clearAccessUserPin({ actor: 'rider', expectedSessionVersion: 3, stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('ok');
    expect(res.user).toEqual({ actor: 'rider', active: true });
  });
});

describe('deactivateAccessUser', () => {
  test('POST to /access-users/:actor/deactivate with expectedActive', async () => {
    global.fetch = jest.fn(async (url, opts) => {
      expect(url).toBe(`${BACKEND_BASE_URL}${ACCESS_USERS_PATH}/rider/deactivate`);
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual({ stepUpProof: 'p', clientRequestId: 'r', expectedActive: true });
      return jsonResponse(200, { ok: true, user: { actor: 'rider', dbRole: 'rider', active: false, sessionVersion: 4, updatedAt: 't' } });
    });
    const res = await deactivateAccessUser({ actor: 'rider', expectedActive: true, stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('ok');
    expect(res.user.active).toBe(false);
  });

  test('AUTH_WAITER_HAS_OPEN_TABLES (409) maps to kind:waiter_open_tables', async () => {
    global.fetch = jest.fn(async () => jsonResponse(409, { ok: false, code: 'AUTH_WAITER_HAS_OPEN_TABLES' }));
    const res = await deactivateAccessUser({ actor: 'w1', expectedActive: true, stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('waiter_open_tables');
  });
});

describe('reactivateAccessUser', () => {
  test('POST to /access-users/:actor/reactivate with expectedActive', async () => {
    global.fetch = jest.fn(async (url, opts) => {
      expect(url).toBe(`${BACKEND_BASE_URL}${ACCESS_USERS_PATH}/rider/reactivate`);
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual({ stepUpProof: 'p', clientRequestId: 'r', expectedActive: false });
      return jsonResponse(200, { ok: true, user: { actor: 'rider', dbRole: 'rider', active: true, sessionVersion: 5, updatedAt: 't' } });
    });
    const res = await reactivateAccessUser({ actor: 'rider', expectedActive: false, stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('ok');
    expect(res.user.active).toBe(true);
  });
});

describe('write transport safety (shared across all 7 methods)', () => {
  test('a missing token short-circuits to unauthenticated without any network call', async () => {
    auth.getToken.mockReturnValue('');
    global.fetch = jest.fn();
    const res = await deactivateAccessUser({ actor: 'rider', expectedActive: true, stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('unauthenticated');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('401 on a write triggers the canonical operational-logout signal, same as reads', async () => {
    const listener = jest.fn();
    window.addEventListener('ld-operational-unauthorized', listener);
    global.fetch = jest.fn(async () => jsonResponse(401, { ok: false, code: 'AUTH_UNAUTHENTICATED' }));
    const res = await deactivateAccessUser({ actor: 'rider', expectedActive: true, stepUpProof: 'p', clientRequestId: 'r' });
    expect(res.kind).toBe('unauthenticated');
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('ld-operational-unauthorized', listener);
  });

  test('network failure on a write never throws', async () => {
    global.fetch = jest.fn(async () => { throw new Error('offline'); });
    await expect(deactivateAccessUser({ actor: 'rider', expectedActive: true, stepUpProof: 'p', clientRequestId: 'r' }))
      .resolves.toEqual(expect.objectContaining({ kind: 'network' }));
  });

  test('the stepUpProof value is never logged to the console across any write', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn(async () => jsonResponse(200, { ok: true, user: { actor: 'rider', dbRole: 'rider', active: false, sessionVersion: 4, updatedAt: 't' } }));
    await deactivateAccessUser({ actor: 'rider', expectedActive: true, stepUpProof: 'SECRET-PROOF-VALUE', clientRequestId: 'r' });
    const seen = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().map(String).join(' ');
    expect(seen).not.toMatch(/SECRET-PROOF-VALUE/);
    logSpy.mockRestore(); errSpy.mockRestore();
  });
});

describe('module surface', () => {
  test('exports exactly the path constant, the two read calls, and the seven write calls', () => {
    const mod = require('./accessManagementApi');
    expect(Object.keys(mod).sort()).toEqual([
      'ACCESS_USERS_PATH', 'listAccessUsers', 'getAccessUser',
      'createAccessUser', 'renameAccessUser', 'changeAccessUserRole',
      'setAccessUserPin', 'clearAccessUserPin', 'deactivateAccessUser', 'reactivateAccessUser',
    ].sort());
  });
});
