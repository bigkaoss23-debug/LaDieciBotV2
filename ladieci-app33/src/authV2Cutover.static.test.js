// S2-7D2 — operational Auth V2 cutover contract.
//
// The operational keypad used to POST /api/auth, a Netlify function that compared the
// PLAINTEXT config.APP_PIN and minted a role-only JWT with no actor and no session_version.
// That credential was disconnected from auth_actors, so rotating a PIN did not change it.
//
// Canonical chain now:
//   keypad -> POST /api/auth/v2/login (Railway, verifies auth_actors.pin_hash)
//          -> {token, role, actor} where token carries {sub, role, sv, exp}
//          -> proxy forwards the bearer verbatim + X-Api-Key
//          -> Railway legacyAuthGuard: signature + actor active + sv freshness + role/action
//
// Source-contract assertions: these modules pull in Supabase/CRA env, so mounting them here
// would test the mocks rather than the rule.
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const API      = read('api.js');
const APP      = read('App.jsx');
const REP      = read('components/repartidor/RepartidorPage.jsx');
const SERVICIO = read('components/ServicioPage.jsx');
const FN_AUTH  = read('../netlify/functions/auth.js');
const FN_PROXY = read('../netlify/functions/api.js');
const TOML     = read('../netlify.toml');

// Executable source only. A prohibition test must never be satisfied (or broken) by prose:
// strip /* ... */ and JSX {/* ... */} blocks first, then line comments.
const code = (src) => src
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
  .split('\n')
  .filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('#');
  })
  .join('\n');

describe('1-3. login calls Auth V2 with the complete PIN and maps the response', () => {
  test('the canonical endpoint is declared and the legacy one is gone', () => {
    expect(API).toMatch(/AUTH_V2_LOGIN_URL = "\/api\/auth\/v2\/login"/);
    expect(code(API)).not.toMatch(/AUTH_URL\s*=\s*"\/api\/auth"/);
  });

  test('no executable frontend code posts to the retired /api/auth', () => {
    for (const [name, src] of [['api.js', API], ['App.jsx', APP], ['RepartidorPage', REP], ['ServicioPage', SERVICIO]]) {
      expect(code(src)).not.toMatch(/["'`]\/api\/auth["'`]/);
    }
  });

  test('payload carries ONLY the complete pin — no role/actor asserted by the client', () => {
    expect(API).toMatch(/body: JSON\.stringify\(\{ pin \}\)/);
    expect(code(API)).not.toMatch(/role: role \|\| "operador"/);
  });

  test('token, role and actor are mapped from the verified response', () => {
    expect(API).toMatch(/this\.setToken\(data\.token\)/);
    expect(API).toMatch(/this\.setRole\(data\.role\)/);
    expect(API).toMatch(/sessionStorage\.setItem\("ld_actor", data\.actor/);
    expect(API).toMatch(/actor: data\.actor/);
  });

  test('callers pass only the pin', () => {
    expect(APP).toMatch(/auth\.login\(value\)/);
    expect(REP).toMatch(/auth\.login\(value\)/);
    expect(code(APP)).not.toMatch(/auth\.login\([^)]*,\s*["']/);
    expect(code(REP)).not.toMatch(/auth\.login\([^)]*,\s*["']/);
  });
});

describe('4-5. session storage and no presentation-only bypass', () => {
  test('the operational token is never written to localStorage', () => {
    expect(code(API)).not.toMatch(/localStorage\.setItem\(\s*["']ld_token/);
    expect(API).toMatch(/sessionStorage\.setItem\("ld_token"|sessionStorage\.setItem\(["']ld_token/);
  });

  test('a pre-cutover localStorage credential is purged on clear()', () => {
    expect(API).toMatch(/localStorage\.removeItem\("ld_token"\)/);
  });

  test('isAuthenticated requires canonical Auth V2 claims, not a flag', () => {
    expect(API).toMatch(/payload\.sub/);
    expect(API).toMatch(/payload\.role/);
    expect(API).toMatch(/Number\.isInteger\(payload\.sv\)/);
  });

  test('no surface admits on ld_pin_ok / ld_role alone', () => {
    // every gate must conjoin auth.isAuthenticated()
    expect(APP).toMatch(/pinUnlocked && auth\.isAuthenticated\(\)/);
    expect(REP).toMatch(/auth\.isAuthenticated\(\) && auth\.getRole\(\) === REP_ROLE/);
    expect(code(REP)).not.toMatch(/ld_role["']\s*\)\s*;\s*\n\s*return role === /);
  });
});

describe('6-8. proxy forwards, never authorizes', () => {
  test('forwards BOTH X-Api-Key and the incoming Authorization bearer', () => {
    const bearers = FN_PROXY.match(/"Authorization": "Bearer " \+ token/g) || [];
    expect(bearers.length).toBe(3);              // shadowPreview + GET + POST
    expect(FN_PROXY).toMatch(/"X-Api-Key": RAILWAY_API_KEY/);
  });

  test('performs NO local token verification', () => {
    expect(code(FN_PROXY)).not.toMatch(/function verifyToken/);
    expect(code(FN_PROXY)).not.toMatch(/createHmac/);
    expect(code(FN_PROXY)).not.toMatch(/JWT_SECRET/);
  });

  test('performs NO local role authorization', () => {
    expect(code(FN_PROXY)).not.toMatch(/role === ["']repartidor["']/);
    expect(code(FN_PROXY)).not.toMatch(/REPARTIDOR_ALLOWED/);
    expect(code(FN_PROXY)).not.toMatch(/const role = payload\.role/);
  });

  test('a request without a bearer is still rejected before proxying', () => {
    expect(FN_PROXY).toMatch(/token mancante/);
  });
});

describe('9-10. stale/inactive responses clear only operational state', () => {
  test('a 401 clears operational state and never the account session', () => {
    // S2-7D3: 401/403 now routes through THE canonical operational logout (which clears the
    // token AND tears down realtime/polling) instead of only dropping the token inline.
    expect(API).toMatch(/res\.status === 401 \|\| res\.status === 403.*onOperationalUnauthorized\(\)/s);
    expect(API).toMatch(/function onOperationalUnauthorized[\s\S]*auth\.clear\(\)/);
    // clear() touches only ld_* operational keys
    const clearBody = API.slice(API.indexOf('clear() {'), API.indexOf('async login('));
    expect(clearBody).toMatch(/ld_token/);
    expect(clearBody).not.toMatch(/ld-account-auth|supabase|sb-/i);
  });
});

describe('11-12. legacy login is dead', () => {
  test('/api/auth cannot mint a token', () => {
    expect(FN_AUTH).toMatch(/statusCode: 410/);
    expect(code(FN_AUTH)).not.toMatch(/createToken|jwt|sign/i);
    expect(code(FN_AUTH)).not.toMatch(/token/);
  });

  test('no executable Netlify code compares APP_PIN or REPARTIDOR_PIN', () => {
    for (const src of [FN_AUTH, FN_PROXY]) {
      expect(code(src)).not.toMatch(/APP_PIN|REPARTIDOR_PIN/);
    }
  });

  test('no executable frontend code writes the plaintext PIN config', () => {
    expect(code(API)).not.toMatch(/chiave:\s*['"]APP_PIN['"]/);
    expect(code(SERVICIO)).not.toMatch(/chiave,\s*valore: pinChange\.nuevo/);
    expect(code(SERVICIO)).not.toMatch(/REPARTIDOR_PIN/);
  });

  test('the canonical login route is proxied ahead of the retired one', () => {
    const v2 = TOML.indexOf('from = "/api/auth/v2/login"');
    const old = TOML.indexOf('from = "/api/auth"');
    expect(v2).toBeGreaterThan(-1);
    expect(v2).toBeLessThan(old);
    expect(TOML).toMatch(/\/api\/auth\/v2\/login"\n\s+to = "https:\/\/fearless-reverence/);
  });
});

describe('13-14. digit ranges', () => {
  test('operational login accepts 6-12 with no auto-submit', () => {
    // S2-7D6E5 — the range moved to a shared module (utils/pinLoginPolicy.js) so the
    // admin step-up re-confirmation can reuse the exact same bound; App.jsx imports it.
    expect(APP).toMatch(/import\s*\{\s*PIN_LOGIN_MIN,\s*PIN_LOGIN_MAX\s*\}\s*from\s*['"]\.\/utils\/pinLoginPolicy['"]/);
    expect(code(APP)).not.toMatch(/next\.length === 6/);
    expect(REP).toMatch(/const REP_PIN_MIN = 6;/);
    expect(REP).toMatch(/const REP_PIN_MAX = 12;/);
    expect(code(REP)).not.toMatch(/next\.length === 6/);
  });

  test('owner PIN CREATION stays exactly six digits', () => {
    expect(read('account/accountHelpers.js')).toMatch(/PIN_LENGTH\s*=\s*6/);
  });
});

describe('15. the two sessions stay separate', () => {
  test('operational login never touches the Supabase account session', () => {
    const loginBody = API.slice(API.indexOf('async login('), API.indexOf('};', API.indexOf('async login(')));
    expect(loginBody).not.toMatch(/supabase|ld-account-auth|getAccountClient/i);
  });

  test('the account client documents the separation', () => {
    expect(read('account/supabaseAccountClient.js')).toMatch(/ld_token|operator PIN login/i);
  });
});
