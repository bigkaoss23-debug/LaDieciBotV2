// ECON-CUSTOM-01 — a custom range must survive the round trip unchanged.
//
// The operator types a Madrid wall clock. The reader wants an instant. The bug
// was that nobody converted: the raw "2026-08-25T19:02" went on the wire, and
// the server's own `new Date(value)` reads an offset-less datetime as
// SERVER-local — which on Railway is UTC. 19:02 became 19:02Z = 21:02 Madrid,
// so a range that really contained 3 orders / 101,00 € came back empty.
//
// TZ is pinned to Europe/Madrid BEFORE anything imports Date-using code, so
// summer (+02:00) and winter (+01:00) are both real assertions rather than
// whatever the build machine happens to be set to. That is also what stops the
// fix degenerating into a hard-coded two-hour correction.
process.env.TZ = 'Europe/Madrid';

const { localWallClockToInstant, scopeToParams } = require('./useEconomySnapshot');

// What the operator would read back off the screen for a given instant.
// jsdom's bundled ICU does not zero-pad day/month the way a real browser does
// ("25/8" vs "25/08"), so the day part is normalised here. The hour is what
// this file is actually about and is compared verbatim.
const madridWallClock = (iso) => new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(iso))
  .replace(/\b(\d)\//, '0$1/')
  .replace(/\/(\d),/, '/0$1,');

describe('the operator sees back exactly the wall clock they chose', () => {
  test('the environment really is Madrid, or the rest of this file proves nothing', () => {
    // Summer offset +02:00, winter +01:00. If this fails the suite is running
    // in another zone and the two cases below would be vacuous.
    expect(new Date('2026-08-25T00:00').toISOString()).toBe('2026-08-24T22:00:00.000Z');
    expect(new Date('2026-01-15T00:00').toISOString()).toBe('2026-01-14T23:00:00.000Z');
  });

  test('SUMMER (+02:00) — the reproduced case, 19:02 → 21:10 stays 19:02 → 21:10', () => {
    const from = '2026-08-25T19:02';
    const to = '2026-08-25T21:10';
    const sent = scopeToParams({ preset: 'personalizado', from, to });

    // Resolved once, to a real instant.
    expect(sent.from).toBe('2026-08-25T17:02:00.000Z');
    expect(sent.to).toBe('2026-08-25T19:10:00.000Z');
    // And read back it is the same wall clock the operator typed.
    expect(madridWallClock(sent.from)).toBe('25/08, 19:02');
    expect(madridWallClock(sent.to)).toBe('25/08, 21:10');
    // The defect: 19:02 arriving as 21:02.
    expect(madridWallClock(sent.from)).not.toContain('21:02');
  });

  test('WINTER (+01:00) — the same range shifts by ONE hour, not a hard-coded two', () => {
    const sent = scopeToParams({ preset: 'personalizado', from: '2026-01-15T19:02', to: '2026-01-15T21:10' });
    expect(sent.from).toBe('2026-01-15T18:02:00.000Z');
    expect(sent.to).toBe('2026-01-15T20:10:00.000Z');
    expect(madridWallClock(sent.from)).toBe('15/01, 19:02');
    expect(madridWallClock(sent.to)).toBe('15/01, 21:10');
  });

  test('the conversion is applied exactly once — it is not idempotent-by-accident', () => {
    // Converting an already-resolved instant must not move it again. This is
    // the guard against the same offset being applied twice somewhere.
    const once = localWallClockToInstant('2026-08-25T19:02');
    expect(localWallClockToInstant(once)).toBe(once);
  });

  test('a business-day boundary keeps its 04:00 wall clock', () => {
    // 04:00 Madrid is the rollover the whole product is anchored on. It must
    // not drift, in either season.
    expect(madridWallClock(localWallClockToInstant('2026-08-25T04:00'))).toBe('25/08, 04:00');
    expect(madridWallClock(localWallClockToInstant('2026-01-15T04:00'))).toBe('15/01, 04:00');
  });

  test('empty and malformed values are passed through untouched, never turned into "now"', () => {
    expect(localWallClockToInstant('')).toBe('');
    expect(localWallClockToInstant(null)).toBe(null);
    expect(localWallClockToInstant('not-a-date')).toBe('not-a-date');
  });

  test('the day and service scopes are untouched by the conversion', () => {
    expect(scopeToParams({ preset: 'hoy' })).toEqual({ preset: 'hoy' });
    expect(scopeToParams({ preset: 'ayer' })).toEqual({ preset: 'ayer' });
    expect(scopeToParams({ preset: 'servicio', serviceSessionId: 'abc' }))
      .toEqual({ preset: 'servicio', serviceSessionId: 'abc' });
  });
});
