// S2-7D6E6 — real staging defect found during the PIN-pad/rider smoke: proxyGet/proxyPost
// treated ANY HTTP 401/403 from the proxy as "the operational Bearer token is dead" and
// force-logged the operator out — discarding the real response body. verifyOwnPin legitimately
// answers a wrong step-up PIN with HTTP 401 + {error:"PIN_INCORRECTO"}, a normal domain answer
// StepUpView already knows how to render inline; the blanket handler intercepted it BEFORE
// StepUpView's own branching ever ran, so the operator was logged out instead of shown
// "PIN incorrecto", the admin PIN modal closed, and the app fell back to Servicio.
//
// Root-cause fix: status code alone can never distinguish "the Bearer is unusable" from "here
// is a typed answer to what you asked" — only the error CODE inside the (always-parsed) body
// can. shouldInvalidateOperationalSession(status, errorCode) is the single, exported, pure
// decision function, reconstructed from the actual backend guards (src/auth/legacyAuthGuard.js
// + index.js's verifyOwnPin/setActorPin branches in the backend repo) — not guessed. This
// applies globally to every proxyGet/proxyPost caller, not a per-action exception.
//
// This is the layer draftWriteLockOpenService.test.js already tests real fetch behavior at
// (require('./api').api against a mocked global.fetch) — pinManagementFlow.test.js mocks
// '../api' wholesale, so it could never have caught this; only a test at THIS layer can.
const loadApi = () => { jest.resetModules(); return require('./api'); };

const jsonResponse = (status, body) => ({
  status, ok: status >= 200 && status < 300, json: async () => body,
});

describe('shouldInvalidateOperationalSession — the pure decision function', () => {
  test('the reconstructed session-invalid codes (401) DO invalidate', () => {
    const { shouldInvalidateOperationalSession: f } = loadApi();
    for (const code of ['MISSING_TOKEN', 'INVALID_TOKEN', 'SESSION_STALE', 'INACTIVE_OR_UNKNOWN_ACTOR', 'REAUTH_REQUIRED']) {
      expect(f(401, code)).toBe(true);
    }
  });

  test('domain/application codes at 401 do NOT invalidate', () => {
    const { shouldInvalidateOperationalSession: f } = loadApi();
    for (const code of ['PIN_INCORRECTO', 'BAD_REQUEST', undefined, null, 'SOMETHING_UNKNOWN']) {
      expect(f(401, code)).toBe(false);
    }
  });

  test('ROLE_FORBIDDEN at 403 never invalidates — insufficient role is not a dead Bearer', () => {
    const { shouldInvalidateOperationalSession: f } = loadApi();
    expect(f(403, 'ROLE_FORBIDDEN')).toBe(false);
  });

  test('none of the session-invalid codes matter outside 401/403', () => {
    const { shouldInvalidateOperationalSession: f } = loadApi();
    expect(f(429, 'LOCKED')).toBe(false);
    expect(f(400, 'admin_action_failed')).toBe(false);
    expect(f(503, 'UNAVAILABLE')).toBe(false);
    expect(f(200, 'REAUTH_REQUIRED')).toBe(false); // can't happen for real, still must be false
    expect(f(500, 'MISSING_TOKEN')).toBe(false);   // status must ALSO be 401/403, not code alone
  });
});

describe('proxyPost/proxyGet — end-to-end transport behavior', () => {
  let fetchSpy;
  let logoutEventSpy;

  beforeEach(() => {
    fetchSpy = jest.fn();
    global.fetch = fetchSpy;
    logoutEventSpy = jest.fn();
    window.addEventListener('ld-operational-unauthorized', logoutEventSpy);
  });
  afterEach(() => {
    delete global.fetch;
    window.removeEventListener('ld-operational-unauthorized', logoutEventSpy);
  });

  test('401 PIN_INCORRECTO: body preserved, no logout', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(401, { ok: false, error: 'PIN_INCORRECTO' }));
    const { api } = loadApi();
    const res = await api.verifyOwnPin('000000');
    expect(logoutEventSpy).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: false, error: 'PIN_INCORRECTO', _status: 401, _ok: false });
  });

  test('401 REAUTH_REQUIRED: logout IS called', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(401, { ok: false, error: 'REAUTH_REQUIRED' }));
    const { api } = loadApi();
    await api.verifyOwnPin('284739');
    expect(logoutEventSpy).toHaveBeenCalledTimes(1);
  });

  test('token invalid/stale (any legacy action): logout IS called', async () => {
    for (const code of ['MISSING_TOKEN', 'INVALID_TOKEN', 'SESSION_STALE', 'INACTIVE_OR_UNKNOWN_ACTOR']) {
      fetchSpy.mockResolvedValue(jsonResponse(401, { error: code }));
      const { api } = loadApi();
      logoutEventSpy.mockClear();
      window.addEventListener('ld-operational-unauthorized', logoutEventSpy);
      // eslint-disable-next-line no-await-in-loop
      await api.updateNotaCucina(1, 'x');
      expect(logoutEventSpy).toHaveBeenCalledTimes(1);
      window.removeEventListener('ld-operational-unauthorized', logoutEventSpy);
    }
  });

  test('403 ROLE_FORBIDDEN (insufficient role): no logout, on ANY action — not just PIN ones', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(403, { error: 'ROLE_FORBIDDEN' }));
    const { api } = loadApi();
    const res = await api.updateNotaCucina(1, 'x');
    expect(logoutEventSpy).not.toHaveBeenCalled();
    expect(res).toEqual({ error: 'ROLE_FORBIDDEN', _status: 403, _ok: false });
  });

  test('an application error at 401/403 stays available to the caller (setActorPin: stale step-up)', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(400, { ok: false, error: 'admin_action_failed' }));
    const { api } = loadApi();
    const res = await api.setActorPin({ targetActor: 'rider', newPin: '284739', stepUpProof: 'stale' });
    expect(logoutEventSpy).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
    expect(res.error).toBe('admin_action_failed');
  });

  test('LOCKED (429) never logs out — a rate limit is not a dead Bearer', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(429, { ok: false, error: 'LOCKED', retryAfterSec: 37 }));
    const { api } = loadApi();
    const res = await api.verifyOwnPin('000000');
    expect(logoutEventSpy).not.toHaveBeenCalled();
    expect(res.error).toBe('LOCKED');
    expect(res.retryAfterSec).toBe(37);
  });

  test('a non-JSON response body is handled fail-closed — never a false success, never a logout it cannot justify', async () => {
    fetchSpy.mockResolvedValue({ status: 401, ok: false, json: async () => { throw new SyntaxError('not json'); } });
    const { api } = loadApi();
    const res = await api.verifyOwnPin('000000');
    // No error code could be read, so shouldInvalidateOperationalSession sees `undefined` —
    // not in the invalid-session set — so this is NOT treated as a dead Bearer...
    expect(logoutEventSpy).not.toHaveBeenCalled();
    // ...but it is also never a false success.
    expect(res.ok).not.toBe(true);
    expect(res._ok).toBe(false);
  });

  test('genuine success (200) still returns the real body for verifyOwnPin and setActorPin', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, { ok: true, stepUpProof: 'PROOF-1', expiresInSec: 600 }));
    let { api } = loadApi();
    const res1 = await api.verifyOwnPin('284739');
    expect(logoutEventSpy).not.toHaveBeenCalled();
    expect(res1).toEqual({ ok: true, stepUpProof: 'PROOF-1', expiresInSec: 600, _status: 200, _ok: true });

    fetchSpy.mockResolvedValue(jsonResponse(200, { ok: true, actor: 'rider', selfChanged: false }));
    ({ api } = loadApi());
    const res2 = await api.setActorPin({ targetActor: 'rider', newPin: '284739', stepUpProof: 'PROOF-1' });
    expect(logoutEventSpy).not.toHaveBeenCalled();
    expect(res2).toEqual({ ok: true, actor: 'rider', selfChanged: false, _status: 200, _ok: true });
  });

  test('proxyGet: the SAME semantic contract applies to reads (getAuthActors ROLE_FORBIDDEN never logs out)', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(403, { error: 'ROLE_FORBIDDEN' }));
    const { api } = loadApi();
    const res = await api.getAuthActors();
    expect(logoutEventSpy).not.toHaveBeenCalled();
    expect(res.error).toBe('ROLE_FORBIDDEN');
  });

  test('proxyGet: a genuinely dead Bearer still logs out on a normal read', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(401, { error: 'SESSION_STALE' }));
    const { api } = loadApi();
    await api.getAuthActors();
    expect(logoutEventSpy).toHaveBeenCalledTimes(1);
  });
});

describe('verifyOwnPin / setActorPin — in-flight dedupe (the observed 13ms double-POST)', () => {
  let fetchSpy;
  beforeEach(() => { fetchSpy = jest.fn(); global.fetch = fetchSpy; });
  afterEach(() => { delete global.fetch; });

  test('two verifyOwnPin calls before the first resolves -> exactly ONE fetch', async () => {
    let resolveFetch;
    fetchSpy.mockImplementation(() => new Promise((res) => { resolveFetch = res; }));
    const { api } = loadApi();

    const p1 = api.verifyOwnPin('284739');
    const p2 = api.verifyOwnPin('284739'); // a duplicate DOM event / stray double-fire
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    resolveFetch(jsonResponse(401, { ok: false, error: 'PIN_INCORRECTO' }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2); // literally the same shared promise/result
  });

  test('two setActorPin calls before the first resolves -> exactly ONE fetch', async () => {
    let resolveFetch;
    fetchSpy.mockImplementation(() => new Promise((res) => { resolveFetch = res; }));
    const { api } = loadApi();

    const args = { targetActor: 'rider', newPin: '284739', stepUpProof: 'PROOF-1' };
    const p1 = api.setActorPin(args);
    const p2 = api.setActorPin(args);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    resolveFetch(jsonResponse(200, { ok: true, actor: 'rider', selfChanged: false }));
    await Promise.all([p1, p2]);
  });

  test('AFTER the first call resolves, a later call is a genuinely NEW request', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'PIN_INCORRECTO' }));
    const { api } = loadApi();
    await api.verifyOwnPin('000000');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { ok: true, stepUpProof: 'P2', expiresInSec: 600 }));
    const res = await api.verifyOwnPin('284739');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(res.ok).toBe(true);
  });

  test('verifyOwnPin and setActorPin have INDEPENDENT locks — one does not block the other', async () => {
    let resolveVerify;
    fetchSpy.mockImplementation(() => new Promise((res) => { resolveVerify = res; }));
    const { api } = loadApi();
    const pVerify = api.verifyOwnPin('284739'); // in flight, never resolved yet
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { ok: true, actor: 'rider', selfChanged: false }));
    await api.setActorPin({ targetActor: 'rider', newPin: '284739', stepUpProof: 'PROOF-1' });
    expect(fetchSpy).toHaveBeenCalledTimes(2); // setActorPin's own call went through independently

    resolveVerify(jsonResponse(401, { ok: false, error: 'PIN_INCORRECTO' }));
    await pVerify;
  });
});
