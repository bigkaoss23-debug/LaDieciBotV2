// PRE_UAT_LIFECYCLE_HYGIENE (Part A) — source-contract tests for ServicioPage.jsx's
// LiveTime clock. ServicioPage.jsx has no mount harness in this project (huge,
// heavily-stateful top-level screen) -- same reasoning and same pattern as
// mesaPhoneShellChromeSuppression.static.test.js and its siblings.
//
// Finding: LiveTime was audited and is PURE_PRESENTATION -- local `new Date()` +
// `setInterval`, no props, no hooks beyond useState/useEffect, no api/RPC calls,
// no session reads or writes. Its output was previously rendered directly under a
// bare "SERVICIO" label, which reads as "this service opened/is dated at HH:MM:SS"
// rather than "current wall-clock time". The fix relabels it "HORA ACTUAL" and adds
// nothing else -- no new lifecycle logic, no backend semantics change.
const fs = require('fs');
const path = require('path');

const SERVICIO_PAGE = fs.readFileSync(path.join(__dirname, 'components/ServicioPage.jsx'), 'utf8');

function extractLiveTimeBody(source) {
  const start = source.indexOf('const LiveTime = () => {');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n};', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('LiveTime is proven PURE_PRESENTATION (no side effects, no lifecycle interaction)', () => {
  const body = extractLiveTimeBody(SERVICIO_PAGE);

  test('only reads the local clock -- new Date() and a 1s setInterval', () => {
    expect(body).toMatch(/useState\(new Date\(\)\)/);
    expect(body).toMatch(/setInterval\(\(\)=>setT\(new Date\(\)\),1000\)/);
    expect(body).toMatch(/clearInterval\(i\)/);
  });

  test('takes no props', () => {
    expect(body).toMatch(/const LiveTime = \(\) => \{/);
  });

  test('never calls the api module, any RPC, fetch, or a proxy post', () => {
    expect(body).not.toMatch(/\bapi\./);
    expect(body).not.toMatch(/\.rpc\(/);
    expect(body).not.toMatch(/fetch\(/);
    expect(body).not.toMatch(/proxyPost/);
  });

  test('never references service/session/business-day lifecycle identifiers', () => {
    expect(body).not.toMatch(/ensureCurrentServiceSession|service_session|business_day|chiudiServizio|closeout/i);
  });

  test('uses no hooks beyond useState/useEffect (no context, no reducer, no custom lifecycle hook)', () => {
    const hookNames = body.match(/\buse[A-Z]\w*/g) || [];
    const allowed = new Set(['useState', 'useEffect']);
    for (const hook of hookNames) {
      expect(allowed.has(hook)).toBe(true);
    }
  });
});

describe('the clock is visually disambiguated from the servicio\'s own identity/state', () => {
  test('LiveTime is labeled as the current time, not as "SERVICIO"', () => {
    const idx = SERVICIO_PAGE.indexOf('<LiveTime/>');
    expect(idx).toBeGreaterThan(-1);
    const before = SERVICIO_PAGE.slice(Math.max(0, idx - 400), idx);
    expect(before).toMatch(/HORA ACTUAL/);
  });

  test('the ambiguous bare "SERVICIO" label immediately above the clock is gone', () => {
    const idx = SERVICIO_PAGE.indexOf('<LiveTime/>');
    const before = SERVICIO_PAGE.slice(Math.max(0, idx - 200), idx);
    expect(before).not.toMatch(/>SERVICIO<\/div>/);
  });
});
