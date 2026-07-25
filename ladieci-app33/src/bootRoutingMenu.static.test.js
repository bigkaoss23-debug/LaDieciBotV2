// S2-7D3 — boot routing, operational menu and canonical logout.
//
// Reproduced defect: index.js chose the surface synchronously from raw URL params, once.
// A Supabase callback hash beat a valid operational session, and because AccountApp captured
// its view into useState the confirmation page survived the URL being cleaned. There was no
// "processed" marker either, so the callback replayed on every reload of that history entry.
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const INDEX = read('index.js');
const APP   = read('App.jsx');
const API   = read('api.js');
const SESS  = read('operationalSession.js');
const MENU  = read('components/OperationalMenu.jsx');

const code = (src) => src
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
  .split('\n')
  .filter((l) => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*'); })
  .join('\n');

// pure resolver under test
const {
  resolveSurface, SURFACE, describeIdentity, callbackFingerprint,
} = require('./operationalSession');

describe('boot gate: splash is the only surface while boot is unresolved', () => {
  test('index renders Splash until BOTH init and the animation finish', () => {
    expect(INDEX).toMatch(/if \(!\(ready && splashDone\)\) return <Splash/);
  });

  test('the old synchronous one-shot decision is gone', () => {
    expect(code(INDEX)).not.toMatch(/shouldRenderAccount\(window\.location\) \? <AccountApp \/> : <App \/>/);
    expect(code(INDEX)).not.toMatch(/root\.render\(shouldRenderAccount/);
  });

  test('App starts past the splash when the boot gate already showed it', () => {
    expect(INDEX).toMatch(/<App skipSplash \/>/);
    expect(APP).toMatch(/skipSplash \? 'booting' : 'splash'/);
    // and it must not render a second Splash while booting
    expect(APP).toMatch(/screen==="splash"\s+&& <Splash/);
  });
});

describe('routing rules', () => {
  const loc = (o) => Object.assign({ pathname: '/', hash: '', search: '' }, o);

  test('A. genuine unprocessed callback -> account surface', () => {
    expect(resolveSurface(loc({ hash: '#access_token=x&type=signup' }), { callbackProcessed: false }))
      .toBe(SURFACE.ACCOUNT_CALLBACK);
  });

  test('A. the SAME callback is not processed twice', () => {
    expect(resolveSurface(loc({ hash: '#access_token=x&type=signup' }), { callbackProcessed: true }))
      .toBe(SURFACE.OPERATIONAL);
  });

  test('B/C. plain reload is operational, even with an active personal account', () => {
    expect(resolveSurface(loc({}), {})).toBe(SURFACE.OPERATIONAL);
    expect(resolveSurface(loc({}), { hasAccountSession: true })).toBe(SURFACE.OPERATIONAL);
  });

  test('D. /cuenta is an explicit secondary entry', () => {
    expect(resolveSurface(loc({ pathname: '/cuenta' }), {})).toBe(SURFACE.ACCOUNT);
  });

  test('a recovery link still routes to the account surface', () => {
    expect(resolveSurface(loc({ hash: '#type=recovery&access_token=y' }), { callbackProcessed: false }))
      .toBe(SURFACE.ACCOUNT_CALLBACK);
  });

  test('a bare ?code= callback is covered too (never left un-stripped)', () => {
    expect(resolveSurface(loc({ search: '?code=abc' }), { callbackProcessed: false }))
      .toBe(SURFACE.ACCOUNT_CALLBACK);
    expect(resolveSurface(loc({ search: '?code=abc' }), { callbackProcessed: true }))
      .toBe(SURFACE.OPERATIONAL);
  });

  test('the fingerprint distinguishes different callbacks', () => {
    expect(callbackFingerprint(loc({ hash: '#type=signup' })))
      .not.toBe(callbackFingerprint(loc({ hash: '#type=recovery' })));
  });
});

describe('callback hygiene', () => {
  test('boot marks the callback consumed and sanitizes a stale URL', () => {
    expect(INDEX).toMatch(/markCallbackProcessed\(loc\)/);
    expect(INDEX).toMatch(/if \(isCallbackProcessed\(loc\)\) sanitizeCallbackUrl\(\)/);
  });

  test('sanitize strips BOTH query and hash via replaceState', () => {
    expect(SESS).toMatch(/history\.replaceState\(\{\}, document\.title, window\.location\.pathname\)/);
  });
});

describe('operational session restore', () => {
  test('boot server-validates the restored token and logs out if rejected', () => {
    expect(INDEX).toMatch(/await validateOperationalSession\(\)/);
    expect(INDEX).toMatch(/if \(!ok\) operationalLogout\(\)/);
  });

  test('validation treats 401/403 as invalid', () => {
    expect(SESS).toMatch(/res\.status === 401 \|\| res\.status === 403/);
  });

  test('ld_pin_ok / ld_role are never authentication', () => {
    expect(SESS).not.toMatch(/ld_pin_ok['"]\s*\)\s*===/);
    expect(API).toMatch(/Number\.isInteger\(payload\.sv\)/);
  });
});

describe('rule C: no operational session lands on the PIN, not Home or the account', () => {
  test('the post-splash default opens the PIN when unauthenticated', () => {
    const app = fs.readFileSync(path.join(__dirname, 'App.jsx'), 'utf8');
    const block = app.slice(app.indexOf('const postSplashAction'), app.indexOf('useEffect', app.indexOf('const postSplashAction')));
    expect(block).toMatch(/if \(!auth\.isAuthenticated\(\)\)/);
    expect(block).toMatch(/setShowPin\(true\)/);
  });
});

describe('operational menu', () => {
  test('rendered on authenticated operational screens, not on splash/booting', () => {
    expect(APP).toMatch(/screen !== "splash" && screen !== "booting" && <OperationalMenu/);
  });

  test('hidden without a canonical token', () => {
    expect(MENU).toMatch(/if \(!authed\) return null/);
    expect(MENU).toMatch(/auth\.isAuthenticated\(\)/);
  });

  test('identity comes from the verified session, not request bodies', () => {
    expect(MENU).toMatch(/auth\.getActor\(\)/);
    expect(MENU).toMatch(/auth\.getRole\(\)/);
    expect(MENU).toMatch(/describeIdentity\(actor, role\)/);
  });

  test('translated identity labels', () => {
    expect(describeIdentity('owner', 'admin')).toBe('Propietario · Administrador');
    expect(describeIdentity('operator_primary', 'operator')).toBe('Operador principal · Operador');
    expect(describeIdentity('operator_backup', 'operator')).toBe('Operador de apoyo · Operador');
    expect(describeIdentity('rider', 'rider')).toBe('Repartidor');
  });

  test('every role gets logout; only admin gets account actions', () => {
    expect(MENU).toMatch(/Cerrar sesión operativa/);
    expect(MENU).toMatch(/const isAdmin = role === 'admin'/);
    expect(MENU).toMatch(/\{isAdmin && \(/);
    expect(MENU).toMatch(/Mi cuenta/);
    expect(MENU).toMatch(/Gestionar PIN de administrador/);
  });

  test('no fake settings entries', () => {
    expect(MENU).not.toMatch(/Ajustes|Configuración|Preferencias/);
  });
});

describe('canonical logout', () => {
  test('ONE logout path shared by menu, idle timeout and 401/403', () => {
    expect(APP).toMatch(/const doOperationalLogout = useCallback/);
    expect(APP).toMatch(/<OperationalMenu onLogout=\{doOperationalLogout\}/);
    expect(APP).toMatch(/setTimeout\(doOperationalLogout, 15 \* 60 \* 1000\)/);
    expect(APP).toMatch(/ld-operational-unauthorized["'], onUnauthorized/);
    expect(API).toMatch(/dispatchEvent\(new Event\("ld-operational-unauthorized"\)\)/);
  });

  test('401 AND 403 both funnel into it', () => {
    const hits = API.match(/res\.status === 401 \|\| res\.status === 403/g) || [];
    expect(hits.length).toBe(2);
  });

  test('realtime + polling are torn down before the token is dropped', () => {
    expect(SESS).toMatch(/teardownHooks\.forEach/);
    const body = SESS.slice(SESS.indexOf('export function operationalLogout'));
    expect(body.indexOf('teardownHooks.forEach')).toBeLessThan(body.indexOf('auth.clear()'));
    expect(APP).toMatch(/registerOperationalTeardown\(\(\) => \{/);
    expect(APP).toMatch(/ws\.close\(\)/);
  });

  test('clears ONLY operational state — account session preserved', () => {
    // executable body only: a comment naming the account key must not fail (or pass) this
    const exec = code(SESS);
    const body = exec.slice(exec.indexOf('export function operationalLogout'));
    expect(body).not.toMatch(/ld-account-auth/);
    expect(body).not.toMatch(/signOut|supabase/i);
    expect(exec).not.toMatch(/removeItem\(['"]ld-account-auth['"]\)/);
  });

  test('operational data is dropped from memory', () => {
    expect(APP).toMatch(/setOrdenes\(\[\]\); setWaMsgs\(\[\]\)/);
  });
});

describe('storage discipline', () => {
  test('no operational credential in localStorage; legacy copies purged', () => {
    expect(code(API)).not.toMatch(/localStorage\.setItem\(\s*["']ld_token/);
    expect(API).toMatch(/localStorage\.removeItem\("ld_token"\)/);
  });
});
