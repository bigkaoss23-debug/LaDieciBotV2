// Access Management V3 read-only client (V3-I.1). Mocks ../api (auth) and global.fetch —
// same house style as src/account/accountApi.test.js and src/api/shadowPreview.js's usage.
jest.mock('../api', () => ({
  __esModule: true,
  auth: {
    getToken: jest.fn(() => 'FAKE_TOKEN'),
    clear: jest.fn(),
  },
}));

const { auth } = require('../api');
const { BACKEND_BASE_URL } = require('../utils/backendBase');
const { listAccessUsers, getAccessUser, ACCESS_USERS_PATH } = require('./accessManagementApi');

function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

const OWNER_WIRE = {
  actor: 'owner', displayName: 'Ana', dbRole: 'admin', canonicalRole: 'owner',
  active: true, hasPin: true, sessionVersion: 15,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
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
    expect(res.users).toEqual([{ actor: 'owner', displayName: 'Ana', canonicalRole: 'owner', active: true, hasPin: true }]);
  });

  test('projects only the safe fields — extra/unknown fields from the wire are dropped', async () => {
    global.fetch = jest.fn(async () => jsonResponse(200, {
      ok: true,
      users: [{ ...OWNER_WIRE, pinHash: 'should-never-appear', sid: 'secret-session-id' }],
    }));
    const res = await listAccessUsers();
    expect(res.kind).toBe('ok');
    expect(Object.keys(res.users[0]).sort()).toEqual(['actor', 'active', 'canonicalRole', 'displayName', 'hasPin'].sort());
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
    expect(res.user).toEqual({ actor: 'owner', displayName: 'Ana', canonicalRole: 'owner', active: true, hasPin: true });
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

describe('read-only surface', () => {
  test('this module exports exactly the two read calls and the path constant — no write method', () => {
    const mod = require('./accessManagementApi');
    expect(Object.keys(mod).sort()).toEqual(['ACCESS_USERS_PATH', 'getAccessUser', 'listAccessUsers'].sort());
  });
});
