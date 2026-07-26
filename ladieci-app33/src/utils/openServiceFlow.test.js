import { ATTEMPT, createAttemptLock, runOpenServiceAttempt } from './openServiceFlow';
import { SERVICE_PHASE } from './serviceSessionState';
import { OPEN_OUTCOME, classifyOpenAttempt } from './openServiceOutcome';

const OPEN_STATE = { ok: true, available: true, status: 'open', businessDate: '2026-07-26', openedAt: '2026-07-26T19:14:44.537Z' };
const NO_STATE = { ok: true, available: false, status: 'none' };
const accepted = { ok: true, _ok: true, _status: 200 };

const defer = () => { let r; const p = new Promise((res) => { r = res; }); return { p, resolve: r }; };

describe('classifyOpenAttempt', () => {
  test('a draft-blocked write never claims to have opened anything', () => {
    const o = classifyOpenAttempt({ draftBlocked: true, error: 'bloqueado', _status: 0 });
    expect(o.kind).toBe(OPEN_OUTCOME.BLOCKED);
  });

  test('401/403 is denied, with no raw backend text', () => {
    expect(classifyOpenAttempt({ _ok: false, _status: 403 }).kind).toBe(OPEN_OUTCOME.DENIED);
    expect(classifyOpenAttempt({ _ok: false, _status: 401 }).message).toMatch(/permiso/i);
  });

  test('a transport failure is network, not a domain failure', () => {
    expect(classifyOpenAttempt({ _ok: false, _status: 0, error: 'TypeError' }).kind).toBe(OPEN_OUTCOME.NETWORK);
  });

  // The single-active-session unique index turns a race into a 409 while the
  // service IS open. Re-reading resolves it; declaring failure would not.
  test('409 means verify, never failure', () => {
    expect(classifyOpenAttempt({ _ok: false, _status: 409, error: 'SERVICE_SESSION_ALREADY_OPEN' }).kind)
      .toBe(OPEN_OUTCOME.VERIFY);
  });

  test('an unknown backend code maps to clean Spanish, never leaked raw', () => {
    const o = classifyOpenAttempt({ _ok: false, _status: 500, error: 'some_internal_token' });
    expect(o.kind).toBe(OPEN_OUTCOME.FAILED);
    expect(o.message).not.toMatch(/some_internal_token/);
  });
});

describe('runOpenServiceAttempt', () => {
  test('success requires a VERIFIED read, not the open response', async () => {
    const openService = jest.fn(async () => accepted);
    const readState = jest.fn(async () => OPEN_STATE);
    const res = await runOpenServiceAttempt({ lock: createAttemptLock(), openService, readState });
    expect(res.kind).toBe(ATTEMPT.OPENED);
    expect(res.state.phase).toBe(SERVICE_PHASE.OPEN);
    expect(readState).toHaveBeenCalledTimes(1);
  });

  test('an accepted call whose read does NOT report open is a failure, not a success', async () => {
    const res = await runOpenServiceAttempt({
      lock: createAttemptLock(),
      openService: async () => accepted,
      readState: async () => NO_STATE,
    });
    expect(res.kind).toBe(ATTEMPT.FAILURE);
    expect(res.reason).toBe('unverified');
    expect(res.message).toMatch(/no consta como abierto/i);
  });

  test('double click produces exactly ONE request', async () => {
    const gate = defer();
    const openService = jest.fn(() => gate.p.then(() => accepted));
    const readState = jest.fn(async () => OPEN_STATE);
    const lock = createAttemptLock();

    const first = runOpenServiceAttempt({ lock, openService, readState });
    const second = runOpenServiceAttempt({ lock, openService, readState });   // same tick
    gate.resolve();

    expect((await second).kind).toBe(ATTEMPT.IGNORED);
    expect((await first).kind).toBe(ATTEMPT.OPENED);
    expect(openService).toHaveBeenCalledTimes(1);
    expect(readState).toHaveBeenCalledTimes(1);
  });

  test('the lock always releases, so a failed attempt can be retried', async () => {
    const lock = createAttemptLock();
    const fail = { _ok: false, _status: 500, error: 'nope' };
    const r1 = await runOpenServiceAttempt({ lock, openService: async () => fail, readState: async () => NO_STATE });
    expect(r1.kind).toBe(ATTEMPT.FAILURE);
    expect(lock.busy).toBe(false);
    const r2 = await runOpenServiceAttempt({ lock, openService: async () => accepted, readState: async () => OPEN_STATE });
    expect(r2.kind).toBe(ATTEMPT.OPENED);
  });

  test('a thrown transport error is a visible failure, never a silent stop', async () => {
    const res = await runOpenServiceAttempt({
      lock: createAttemptLock(),
      openService: async () => { throw new Error('offline'); },
      readState: async () => NO_STATE,
    });
    expect(res.kind).toBe(ATTEMPT.FAILURE);
    expect(res.reason).toBe('network');
    expect(res.message).toMatch(/No se abrió nada/);
  });

  test('a denied attempt never reads the state and never opens', async () => {
    const readState = jest.fn(async () => OPEN_STATE);
    const res = await runOpenServiceAttempt({
      lock: createAttemptLock(),
      openService: async () => ({ _ok: false, _status: 403 }),
      readState,
    });
    expect(res.kind).toBe(ATTEMPT.FAILURE);
    expect(res.message).toMatch(/permiso/i);
    expect(readState).not.toHaveBeenCalled();
  });

  test('a draft-locked build sends nothing to the backend and says so', async () => {
    const readState = jest.fn(async () => NO_STATE);
    const res = await runOpenServiceAttempt({
      lock: createAttemptLock(),
      openService: async () => ({ draftBlocked: true, error: 'Borrador de prueba', _ok: false, _status: 0 }),
      readState,
    });
    expect(res.kind).toBe(ATTEMPT.FAILURE);
    expect(res.reason).toBe(OPEN_OUTCOME.BLOCKED);
    expect(readState).not.toHaveBeenCalled();
  });
});
