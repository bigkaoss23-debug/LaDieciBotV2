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
//
// S2-7D6E5 — the actual pad behavior (dot growth, no auto-submit, submit gating) now lives in
// the shared PinPad component (see src/components/ui/PinPad.test.js for its behavioral tests).
// This file's job narrowed to: App.jsx wires the canonical 6..12 range INTO PinPad rather than
// re-implementing it, and never re-declares a second, possibly-diverging range locally.
const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, 'App.jsx'), 'utf8');
const POLICY = fs.readFileSync(path.join(__dirname, 'utils/pinLoginPolicy.js'), 'utf8');

describe('operational PIN login — legacy-compatible range, wired through the shared PinPad', () => {
  test('the canonical range (6..12) is declared in ONE shared module', () => {
    expect(POLICY).toMatch(/export const PIN_LOGIN_MIN = 6;/);
    expect(POLICY).toMatch(/export const PIN_LOGIN_MAX = 12;/);
  });

  test('App.jsx imports the shared range instead of re-declaring it', () => {
    expect(APP).toMatch(/import\s*\{\s*PIN_LOGIN_MIN,\s*PIN_LOGIN_MAX\s*\}\s*from\s*['"]\.\/utils\/pinLoginPolicy['"]/);
    expect(APP).not.toMatch(/const PIN_LOGIN_MIN = 6;/);
    expect(APP).not.toMatch(/const PIN_LOGIN_MAX = 12;/);
  });

  test('the login modal renders through the shared PinPad, not a bespoke grid', () => {
    expect(APP).toMatch(/import PinPad from ['"]\.\/components\/ui\/PinPad['"]/);
    expect(APP).toMatch(/<PinPad[\s\S]{0,400}minLength=\{PIN_LOGIN_MIN\}[\s\S]{0,400}maxLength=\{PIN_LOGIN_MAX\}/);
    // the old bespoke grid/handler must be gone — it would be a second, near-identical pad
    expect(APP).not.toMatch(/const handlePinKey/);
    expect(APP).not.toMatch(/gridTemplateColumns:"repeat\(3,1fr\)"/);
  });

  test('submission still accepts the whole 6..12 range (checkPin unchanged)', () => {
    expect(APP).toMatch(/value\.length < PIN_LOGIN_MIN \|\| value\.length > PIN_LOGIN_MAX/);
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

  test('the shared login-range module does not import the creation-side six-digit constant', () => {
    expect(POLICY).not.toMatch(/PIN_LENGTH/);
  });
});
