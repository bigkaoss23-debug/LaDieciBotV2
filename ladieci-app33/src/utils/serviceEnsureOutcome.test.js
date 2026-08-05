import {
  ENSURE_OUTCOME, classifyEnsureAttempt, exceptionAllowsRetry, exceptionShowsCloseoutLink, ensuredStatusLabel,
} from './serviceEnsureOutcome';

// No trailing "Z": these are parsed as LOCAL time by `new Date(...)`, so
// ensuredStatusLabel's d.getHours()/getMinutes() — deliberately local time,
// same as the operator's own browser clock — match these digits exactly
// regardless of the machine/timezone this test happens to run on.
const PRANZO_CREATED = {
  success: true, created: true, code: 'CREATED',
  session: { id: 'uuid-1', serviceKind: 'PRANZO', businessDate: '2026-07-26', status: 'open', openedAt: '2026-07-26T08:05:00.000' },
  scheduleState: 'PRANZO_WINDOW', businessDate: '2026-07-26',
  _status: 200, _ok: true,
};
const SERA_REUSED = {
  success: true, created: false, code: 'REUSED',
  session: { id: 'uuid-2', serviceKind: 'SERA', businessDate: '2026-07-26', status: 'open', openedAt: '2026-07-26T20:00:00.000' },
  scheduleState: 'SERA_WINDOW', businessDate: '2026-07-26',
  _status: 200, _ok: true,
};

describe('classifyEnsureAttempt — success is identical whether created or reused', () => {
  test('created:true renders ALLOWED', () => {
    const o = classifyEnsureAttempt(PRANZO_CREATED);
    expect(o.kind).toBe(ENSURE_OUTCOME.ALLOWED);
    expect(o.created).toBe(true);
    expect(o.session.serviceKind).toBe('PRANZO');
  });

  test('created:false (reused) renders the SAME ALLOWED kind — no distinct UI branch', () => {
    const o = classifyEnsureAttempt(SERA_REUSED);
    expect(o.kind).toBe(ENSURE_OUTCOME.ALLOWED);
    expect(o.created).toBe(false);
    expect(o.session.serviceKind).toBe('SERA');
  });
});

describe('classifyEnsureAttempt — every documented typed non-success code', () => {
  const cases = [
    'BETWEEN_SERVICES', 'AFTER_ORDER_CUTOFF', 'OUTSIDE_WINDOWS',
    'SERVICE_ALREADY_COMPLETED_TODAY', 'LUNCH_SESSION_STILL_ACTIVE',
    'OTHER_SERVICE_STILL_ACTIVE', 'SERVICE_SESSION_CLOSING', 'INVALID_ACTOR',
    'STALE_SERVICE_SESSION',
  ];
  test.each(cases)('%s maps to itself, with a title and a Spanish message, never invented locally', (code) => {
    const res = { success: false, code, session: null, scheduleState: 'X', businessDate: '2026-07-26', _status: code === 'LUNCH_SESSION_STILL_ACTIVE' || code === 'OTHER_SERVICE_STILL_ACTIVE' || code === 'SERVICE_SESSION_CLOSING' ? 409 : 200, _ok: false };
    const o = classifyEnsureAttempt(res);
    expect(o.kind).toBe(code);
    expect(o.code).toBe(code);
    expect(typeof o.title).toBe('string');
    expect(o.title.length).toBeGreaterThan(0);
    expect(typeof o.message).toBe('string');
    expect(o.message.length).toBeGreaterThan(0);
    // No raw backend code ever leaks into the human message.
    expect(o.message).not.toMatch(new RegExp(code));
    // Never the internal PRANZO/SERA/service_kind vocabulary, in any code path.
    expect(o.title).not.toMatch(/PRANZO|SERA/);
    expect(o.message).not.toMatch(/PRANZO|SERA/);
  });
});

describe('classifyEnsureAttempt — STALE_SERVICE_SESSION (an open session belongs to an earlier businessDate)', () => {
  const res = {
    success: false, created: false, code: 'STALE_SERVICE_SESSION',
    session: { id: 'uuid-6', serviceKind: 'PRANZO', businessDate: '2026-08-02', status: 'open', openedAt: '2026-08-02T09:36:55.359195+00:00' },
    scheduleState: 'PRANZO_WINDOW', businessDate: '2026-08-05', _status: 200, _ok: true,
  };

  test('classifies as its own kind, not UNKNOWN', () => {
    const o = classifyEnsureAttempt(res);
    expect(o.kind).toBe(ENSURE_OUTCOME.STALE_SERVICE_SESSION);
    expect(o.kind).not.toBe(ENSURE_OUTCOME.UNKNOWN);
  });

  test('exact title', () => {
    expect(classifyEnsureAttempt(res).title).toBe('Servicio anterior pendiente');
  });

  test('exact message', () => {
    expect(classifyEnsureAttempt(res).message).toBe(
      'El servicio activo pertenece a otra fecha operativa. Ciérralo antes de recibir nuevos pedidos.'
    );
  });

  test('offers both Reintentar and Ver cierre del servicio', () => {
    expect(exceptionAllowsRetry(ENSURE_OUTCOME.STALE_SERVICE_SESSION)).toBe(true);
    expect(exceptionShowsCloseoutLink(ENSURE_OUTCOME.STALE_SERVICE_SESSION)).toBe(true);
  });
});

describe('classifyEnsureAttempt — a still-open OTHER-kind session grants operational access (S2-7D6E)', () => {
  test('LUNCH_SESSION_STILL_ACTIVE with an open session -> ALLOWED, not an exception', () => {
    const res = {
      success: false, code: 'LUNCH_SESSION_STILL_ACTIVE',
      session: { id: 'uuid-3', serviceKind: 'PRANZO', businessDate: '2026-07-27', status: 'open', openedAt: '2026-07-27T12:00:00.000' },
      scheduleState: 'SERA_WINDOW', businessDate: '2026-07-27', _status: 409, _ok: false,
    };
    const o = classifyEnsureAttempt(res);
    expect(o.kind).toBe(ENSURE_OUTCOME.ALLOWED);
    expect(o.created).toBe(false);
    expect(o.code).toBe('LUNCH_SESSION_STILL_ACTIVE');
    expect(o.session.status).toBe('open');
  });

  test('OTHER_SERVICE_STILL_ACTIVE with an open session -> ALLOWED, not an exception', () => {
    const res = {
      success: false, code: 'OTHER_SERVICE_STILL_ACTIVE',
      session: { id: 'uuid-4', serviceKind: 'SERA', businessDate: '2026-07-27', status: 'open', openedAt: '2026-07-27T20:00:00.000' },
      scheduleState: 'PRANZO_WINDOW', businessDate: '2026-07-27', _status: 409, _ok: false,
    };
    const o = classifyEnsureAttempt(res);
    expect(o.kind).toBe(ENSURE_OUTCOME.ALLOWED);
    expect(o.session.status).toBe('open');
  });

  test('LUNCH_SESSION_STILL_ACTIVE with a CLOSING session stays an exception (nothing to operate on yet)', () => {
    const res = {
      success: false, code: 'LUNCH_SESSION_STILL_ACTIVE',
      session: { id: 'uuid-5', serviceKind: 'PRANZO', businessDate: '2026-07-27', status: 'closing', openedAt: '2026-07-27T12:00:00.000' },
      scheduleState: 'SERA_WINDOW', businessDate: '2026-07-27', _status: 409, _ok: false,
    };
    const o = classifyEnsureAttempt(res);
    expect(o.kind).toBe('LUNCH_SESSION_STILL_ACTIVE');
    expect(o.title).not.toMatch(/PRANZO|SERA/);
  });

  test('LUNCH_SESSION_STILL_ACTIVE with no session at all stays an exception (defensive: nothing to hand the operator)', () => {
    const res = { success: false, code: 'LUNCH_SESSION_STILL_ACTIVE', session: null, scheduleState: 'SERA_WINDOW', businessDate: '2026-07-27', _status: 409, _ok: false };
    const o = classifyEnsureAttempt(res);
    expect(o.kind).toBe('LUNCH_SESSION_STILL_ACTIVE');
  });
});

describe('classifyEnsureAttempt — transport/auth, never conflated with a domain decision', () => {
  test('401 is DENIED', () => {
    expect(classifyEnsureAttempt({ _status: 401, _ok: false, error: 'sesión expirada' }).kind).toBe(ENSURE_OUTCOME.DENIED);
  });
  test('403 is DENIED', () => {
    expect(classifyEnsureAttempt({ _status: 403, _ok: false }).kind).toBe(ENSURE_OUTCOME.DENIED);
  });
  test('a no-persist draft block is NETWORK, not a fake success or a fake domain code', () => {
    const o = classifyEnsureAttempt({ draftBlocked: true, error: 'Borrador de prueba', _status: 0, _ok: false });
    expect(o.kind).toBe(ENSURE_OUTCOME.NETWORK);
  });
  test('a genuine transport failure (_status 0) is NETWORK', () => {
    expect(classifyEnsureAttempt({ error: 'TypeError: Failed to fetch', _status: 0, _ok: false }).kind).toBe(ENSURE_OUTCOME.NETWORK);
  });
  test('an unrecognized code is UNKNOWN, never guessed into a known one', () => {
    expect(classifyEnsureAttempt({ success: false, code: 'SOMETHING_NEW', _status: 500, _ok: false }).kind).toBe(ENSURE_OUTCOME.UNKNOWN);
  });
  test('a non-object / empty response is UNKNOWN', () => {
    expect(classifyEnsureAttempt(null).kind).toBe(ENSURE_OUTCOME.UNKNOWN);
    expect(classifyEnsureAttempt(undefined).kind).toBe(ENSURE_OUTCOME.UNKNOWN);
  });
});

describe('exceptionAllowsRetry', () => {
  test('DENIED and INVALID_ACTOR cannot be helped by retrying the same identity', () => {
    expect(exceptionAllowsRetry(ENSURE_OUTCOME.DENIED)).toBe(false);
    expect(exceptionAllowsRetry(ENSURE_OUTCOME.INVALID_ACTOR)).toBe(false);
  });
  test('every schedule/session/network reason is retryable', () => {
    for (const k of ['BETWEEN_SERVICES', 'AFTER_ORDER_CUTOFF', 'OUTSIDE_WINDOWS', 'SERVICE_ALREADY_COMPLETED_TODAY', 'LUNCH_SESSION_STILL_ACTIVE', 'OTHER_SERVICE_STILL_ACTIVE', 'SERVICE_SESSION_CLOSING', 'NETWORK', 'UNKNOWN']) {
      expect(exceptionAllowsRetry(k)).toBe(true);
    }
  });
});

describe('exceptionShowsCloseoutLink — only where a human action there could resolve it', () => {
  test('a pure clock-window wait never offers the closeout link', () => {
    for (const k of ['BETWEEN_SERVICES', 'AFTER_ORDER_CUTOFF', 'OUTSIDE_WINDOWS', 'SERVICE_ALREADY_COMPLETED_TODAY', 'SERVICE_SESSION_CLOSING', 'DENIED', 'INVALID_ACTOR']) {
      expect(exceptionShowsCloseoutLink(k)).toBe(false);
    }
  });
  test('a real session conflict, or an unclear failure, offers it', () => {
    expect(exceptionShowsCloseoutLink('LUNCH_SESSION_STILL_ACTIVE')).toBe(true);
    expect(exceptionShowsCloseoutLink('OTHER_SERVICE_STILL_ACTIVE')).toBe(true);
    expect(exceptionShowsCloseoutLink('NETWORK')).toBe(true);
    expect(exceptionShowsCloseoutLink('UNKNOWN')).toBe(true);
  });
});

describe('ensuredStatusLabel — sourced ONLY from the backend session, never the browser clock, never PRANZO/SERA to the operator', () => {
  test('PRANZO renders as "Servicio de mediodía"', () => {
    expect(ensuredStatusLabel(PRANZO_CREATED.session)).toBe('Servicio de mediodía · Abierto · 2026-07-26 · 08:05');
  });
  test('SERA renders as "Servicio de noche"', () => {
    expect(ensuredStatusLabel(SERA_REUSED.session)).toBe('Servicio de noche · Abierto · 2026-07-26 · 20:00');
  });
  test('no session at all renders empty, never a guessed label', () => {
    expect(ensuredStatusLabel(null)).toBe('');
  });
  test('a legacy/kindless session still renders a generic label, not "serata"', () => {
    const label = ensuredStatusLabel({ serviceKind: null, businessDate: '2026-07-26', openedAt: null });
    expect(label).toBe('Servicio · Abierto · 2026-07-26');
    expect(label).not.toMatch(/serata/i);
  });
  test('never leaks the raw PRANZO/SERA token, whatever the session', () => {
    expect(ensuredStatusLabel(PRANZO_CREATED.session)).not.toMatch(/PRANZO/);
    expect(ensuredStatusLabel(SERA_REUSED.session)).not.toMatch(/SERA/);
  });
});
