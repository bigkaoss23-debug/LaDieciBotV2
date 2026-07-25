// S2-7D2 transition — the SHARED operational PIN login must stay legacy-compatible.
//
// Backend contract (src/auth/pinPolicy.js in the backend repo):
//   * validateUniversalPinFormat (LOGIN)    → /^\d{6,12}$/
//   * validateNewPinFormat (CREATE/ROTATE)  → exactly 6 digits
//
// Only creation/rotation is six digits. Until owner, operator_primary, operator_backup and
// rider have each been rotated, unrotated actors still hold 7-12 digit PINs, so capping this
// shared input at 6 would lock them out — and would stop an old longer PIN from ever reaching
// the backend to be rejected. These are source-contract assertions: App.jsx pulls in Supabase
// and the API client, so mounting it here would test the mocks, not the rule.
const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, 'App.jsx'), 'utf8');

// the operational login modal only — bounded so account-form code can never satisfy these
const LOGIN_BLOCK = (() => {
  const start = APP.indexOf('const handlePinKey');
  const end = APP.indexOf('useEffect', start);
  expect(start).toBeGreaterThan(-1);
  return APP.slice(start, end);
})();

describe('operational PIN login — legacy-compatible range', () => {
  test('declares the backend universal range 6..12', () => {
    expect(APP).toMatch(/const PIN_LOGIN_MIN = 6;/);
    expect(APP).toMatch(/const PIN_LOGIN_MAX = 12;/);
  });

  test('input is capped at the universal maximum, not at six', () => {
    expect(LOGIN_BLOCK).toMatch(/pinInput\.length < PIN_LOGIN_MAX/);
    // the old hard cap must be gone: a 7th digit has to be enterable
    expect(LOGIN_BLOCK).not.toMatch(/pinInput\.length < 6/);
  });

  test('does NOT auto-submit at six digits', () => {
    // a 6-digit prefix of a longer legacy PIN must never be sent on its own
    expect(LOGIN_BLOCK).not.toMatch(/next\.length === 6/);
    expect(LOGIN_BLOCK).not.toMatch(/checkPin\(next\)/);
  });

  test('submission accepts the whole 6..12 range', () => {
    expect(LOGIN_BLOCK).toMatch(/value\.length < PIN_LOGIN_MIN \|\| value\.length > PIN_LOGIN_MAX/);
    expect(LOGIN_BLOCK).not.toMatch(/value\.length < 6/);
  });

  test('an explicit Entrar button exists, enabled from six digits onward', () => {
    expect(APP).toMatch(/Entrar/);
    expect(APP).toMatch(/disabled=\{pinLoading \|\| pinInput\.length < PIN_LOGIN_MIN\}/);
  });

  test('the dot indicator grows past six instead of being fixed at six', () => {
    expect(APP).toMatch(/Math\.max\(PIN_LOGIN_MIN, pinInput\.length\)/);
    expect(APP).not.toMatch(/\{\[0,1,2,3,4,5\]\.map/);
  });

  test('error copy stays neutral — never names an actor or a length', () => {
    expect(APP).toMatch(/PIN incorrecto/);
    expect(APP).not.toMatch(/PIN de 6 (n[uú]meros|d[ií]gitos)[^<]*operador/i);
  });
});

describe('scope guard — creation/rotation stays exactly six digits', () => {
  test('the account admin-PIN form keeps its six-digit rule', () => {
    const helpers = fs.readFileSync(path.join(__dirname, 'account/accountHelpers.js'), 'utf8');
    expect(helpers).toMatch(/PIN_LENGTH\s*=\s*6/);
  });

  test('the operational login does not import the creation-side six-digit constant', () => {
    expect(LOGIN_BLOCK).not.toMatch(/PIN_LENGTH/);
  });
});
