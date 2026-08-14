// DEPLOY_GUARD_ABS_BACKEND_01 — the guard that would have stopped the
// 2026-08-14 staging incident.
//
// WHAT HAPPENED
// -------------
// A local build of this branch inherited REACT_APP_BACKEND_API_URL="." from
// .env.local (a dev-only override that routes Mesa at a same-origin mock).
// Both build guards accepted it: the value was non-empty and did not mention
// the production backend, which were the only two things either one checked.
// generate-functions-public-env.js then derived "./api" and wrote it into
// netlify/functions/_publicEnvGenerated.js — the target the Netlify Functions
// use SERVER-SIDE, where "same-origin" means nothing. Every proxied request
// 502'd until the site was rebuilt.
//
// A relative URL is perfectly valid in a browser and meaningless in the
// functions runtime, so the property worth asserting is absoluteness, not
// shape. Both guards run in `prebuild`, so the build now fails before it can
// produce a poisoned artifact.
const { execFileSync } = require('child_process');
const path = require('path');

const SCRIPTS = path.join(__dirname, '..', 'scripts');
const STAGING_BACKEND = 'https://fearless-reverence-production-80bc.up.railway.app';
const STAGING_SUPABASE = 'https://tdikhfeinufaahagmpjz.supabase.co';

function runGuard(script, backend, extra = {}) {
  try {
    execFileSync(process.execPath, [path.join(SCRIPTS, script)], {
      env: {
        ...process.env,
        REACT_APP_SUPABASE_URL: STAGING_SUPABASE,
        REACT_APP_SUPABASE_ANON_KEY: 'sb_publishable_test_only',
        REACT_APP_BACKEND_API_URL: backend,
        BACKEND_API_URL: '',
        SUPABASE_URL: '',
        SUPABASE_ANON_KEY: '',
        SITE_ID: '',
        CONTEXT: 'local',
        ...extra,
      },
      stdio: 'pipe',
    });
    return { ok: true, stderr: '' };
  } catch (error) {
    return { ok: false, stderr: String(error.stderr || '') };
  }
}

// The exact incident value first, then the other relative forms the brief
// requires be rejected.
const RELATIVE_FORMS = ['.', './api', './', '/api', '/'];
// "/" and "./" normalise to the empty string before the absoluteness check is
// reached (deriveBackend strips trailing slashes), so they are rejected by the
// pre-existing non-empty rule instead. Both outcomes are a blocked build —
// which is the requirement — but only these forms carry the new message.
const REJECTED_AS_RELATIVE = ['.', './api', '/api'];

describe.each([
  ['guard-env-fail-closed.js'],
  ['generate-functions-public-env.js'],
])('%s rejects a relative backend target', (script) => {
  test.each(RELATIVE_FORMS)('refuses to build with REACT_APP_BACKEND_API_URL=%p', (value) => {
    expect(runGuard(script, value).ok).toBe(false);
  });

  test.each(REJECTED_AS_RELATIVE)('names absoluteness as the reason for %p', (value) => {
    expect(runGuard(script, value).stderr).toMatch(/assolut/i);
  });

  test('still accepts the real absolute STAGING backend', () => {
    expect(runGuard(script, STAGING_BACKEND).ok).toBe(true);
  });

  test('an empty value keeps failing for its original reason, not the new one', () => {
    // The pre-existing fail-closed behaviour must survive this addition.
    expect(runGuard(script, '').ok).toBe(false);
  });
});

describe('generate-functions-public-env only ever writes an absolute upstream', () => {
  test('a host-relative Supabase URL is refused too — same server-side runtime', () => {
    const result = runGuard('generate-functions-public-env.js', STAGING_BACKEND, {
      REACT_APP_SUPABASE_URL: '/supabase',
    });
    expect(result.ok).toBe(false);
    expect(result.stderr).toMatch(/SUPABASE_URL/);
  });

  test('a production backend is still refused on a non-production build', () => {
    const result = runGuard('generate-functions-public-env.js',
      'https://ladiecibot-production.up.railway.app');
    expect(result.ok).toBe(false);
    expect(result.stderr).toMatch(/PROD/);
  });
});
