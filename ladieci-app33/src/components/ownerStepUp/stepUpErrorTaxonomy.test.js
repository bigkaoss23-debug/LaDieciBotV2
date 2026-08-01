import { classifyStepUpFailure } from './stepUpErrorTaxonomy';

test('LOCKED with a retryAfterSec includes it in the message', () => {
  const r = classifyStepUpFailure({ error: 'LOCKED', retryAfterSec: 12 });
  expect(r.kind).toBe('locked');
  expect(r.message).toMatch(/12s/);
});

test('LOCKED without a retryAfterSec falls back to a generic wait message', () => {
  const r = classifyStepUpFailure({ error: 'LOCKED' });
  expect(r.kind).toBe('locked');
  expect(r.message).toMatch(/unos minutos/);
});

test('REAUTH_REQUIRED is its own kind, distinct from wrong_pin', () => {
  const r = classifyStepUpFailure({ error: 'REAUTH_REQUIRED' });
  expect(r.kind).toBe('reauth');
});

test('PIN_INCORRECTO and BAD_REQUEST both classify as wrong_pin with the same message', () => {
  const a = classifyStepUpFailure({ error: 'PIN_INCORRECTO' });
  const b = classifyStepUpFailure({ error: 'BAD_REQUEST' });
  expect(a.kind).toBe('wrong_pin');
  expect(b.kind).toBe('wrong_pin');
  expect(a.message).toBe(b.message);
  expect(a.message).toBe('PIN incorrecto.');
});

test('UNAVAILABLE is a distinct kind from wrong_pin and transport', () => {
  const r = classifyStepUpFailure({ error: 'UNAVAILABLE' });
  expect(r.kind).toBe('unavailable');
  expect(r.message).not.toMatch(/PIN incorrecto/);
});

test('an unrecognized/generic error code (the real staging incident) classifies as transport, not wrong_pin', () => {
  const r = classifyStepUpFailure({ error: 'unauthorized', _ok: false, _status: 401 });
  expect(r.kind).toBe('transport');
  expect(r.message).not.toMatch(/PIN incorrecto/);
});

test('ROLE_FORBIDDEN classifies as transport, not wrong_pin', () => {
  const r = classifyStepUpFailure({ error: 'ROLE_FORBIDDEN', _status: 403 });
  expect(r.kind).toBe('transport');
});

test('a null/undefined response classifies as transport, never throws', () => {
  expect(() => classifyStepUpFailure(null)).not.toThrow();
  expect(() => classifyStepUpFailure(undefined)).not.toThrow();
  expect(classifyStepUpFailure(null).kind).toBe('transport');
});

test('every message is a non-empty string for every kind', () => {
  const cases = [
    { error: 'LOCKED' }, { error: 'REAUTH_REQUIRED' }, { error: 'PIN_INCORRECTO' },
    { error: 'BAD_REQUEST' }, { error: 'UNAVAILABLE' }, { error: 'unauthorized' }, {},
  ];
  for (const c of cases) {
    const r = classifyStepUpFailure(c);
    expect(typeof r.message).toBe('string');
    expect(r.message.length).toBeGreaterThan(0);
  }
});
