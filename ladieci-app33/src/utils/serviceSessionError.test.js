import { isNoOpenServiceSession, NO_OPEN_SERVICE_SESSION_MESSAGE } from './serviceSessionError';

describe('isNoOpenServiceSession', () => {
  // The exact shape observed on staging: HTTP 200, generic wrapper, real cause
  // only in `detail` because it came from the DB trigger.
  test('recognises the real backend body', () => {
    expect(isNoOpenServiceSession({
      success: false, error: 'errore DB', detail: 'NO_OPEN_SERVICE_SESSION',
    })).toBe(true);
  });

  test('recognises it through a thrown proxyPostStrict error', () => {
    const err = new Error('errore DB');
    err.response = { success: false, error: 'errore DB', detail: 'NO_OPEN_SERVICE_SESSION' };
    expect(isNoOpenServiceSession(err)).toBe(true);
  });

  test('recognises a typed code or message', () => {
    expect(isNoOpenServiceSession({ code: 'NO_OPEN_SERVICE_SESSION' })).toBe(true);
    expect(isNoOpenServiceSession('NO_OPEN_SERVICE_SESSION')).toBe(true);
  });

  test('never fires on an unrelated failure', () => {
    expect(isNoOpenServiceSession({ success: false, error: 'errore DB' })).toBe(false);
    expect(isNoOpenServiceSession(new Error('HTTP 500'))).toBe(false);
    expect(isNoOpenServiceSession({ error: 'SERVICE_SESSION_IMMUTABLE' })).toBe(false);
    expect(isNoOpenServiceSession(null)).toBe(false);
    expect(isNoOpenServiceSession(undefined)).toBe(false);
  });
});

describe('operator guidance', () => {
  test('says what is wrong and what to do — never "errore DB"', () => {
    expect(NO_OPEN_SERVICE_SESSION_MESSAGE).toMatch(/No hay un servicio abierto/);
    expect(NO_OPEN_SERVICE_SESSION_MESSAGE).toMatch(/Abre el servicio antes de confirmar pedidos/);
    expect(NO_OPEN_SERVICE_SESSION_MESSAGE).not.toMatch(/errore DB/i);
    expect(NO_OPEN_SERVICE_SESSION_MESSAGE).not.toMatch(/NO_OPEN_SERVICE_SESSION/);
  });

  test('tells the operator their order is kept', () => {
    expect(NO_OPEN_SERVICE_SESSION_MESSAGE).toMatch(/se conserva/i);
  });
});
