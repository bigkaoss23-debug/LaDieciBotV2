// S2-7C2 — fetchAccountMe integration test with a mocked Supabase client + fetch.
// Covers: authenticated call sends the Supabase access token as Bearer, returns the
// account body (zero memberships case), and the no-session path never calls the network.

// Mock the Supabase client module so accountApi never loads @supabase/supabase-js.
let mockSession = null;
jest.mock('./supabaseAccountClient', () => ({
  ACCOUNT_REDIRECT_URL: 'https://ladieci-v1-staging.netlify.app',
  getAccountClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
    },
  }),
}));

import { fetchAccountMe } from './accountApi';

describe('fetchAccountMe', () => {
  afterEach(() => { mockSession = null; delete global.fetch; });

  test('sends the Supabase access token as Bearer and returns the account body', async () => {
    mockSession = { access_token: 'ACCESS_TOKEN_XYZ' };
    let capturedAuth = null;
    global.fetch = jest.fn(async (url, opts) => {
      capturedAuth = opts.headers.Authorization;
      expect(url).toBe('/api/account/me');
      return {
        status: 200,
        ok: true,
        json: async () => ({ userId: 'u1', email: 'x@y.z', emailVerified: true, memberships: [], workspaces: [] }),
      };
    });

    const r = await fetchAccountMe();
    expect(capturedAuth).toBe('Bearer ACCESS_TOKEN_XYZ');
    expect(r.status).toBe(200);
    expect(r.ok).toBe(true);
    expect(r.body.memberships).toEqual([]);
    expect(r.body.workspaces).toEqual([]);
  });

  test('no session → 401 without hitting the network', async () => {
    mockSession = null;
    global.fetch = jest.fn();
    const r = await fetchAccountMe();
    expect(r.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('surfaces a backend 401 (expired session)', async () => {
    mockSession = { access_token: 'STALE' };
    global.fetch = jest.fn(async () => ({ status: 401, ok: false, json: async () => ({ error: 'account_auth_invalid' }) }));
    const r = await fetchAccountMe();
    expect(r.status).toBe(401);
    expect(r.ok).toBe(false);
  });
});
