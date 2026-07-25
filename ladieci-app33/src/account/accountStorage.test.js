// S2-7D — the account session must be TAB-SCOPED, never localStorage.
// Project rule (CLAUDE.md): "MAI localStorage — app usata da più operatori sullo stesso
// browser". Reload keeps the session (same tab); closing the tab ends it.
import { accountSessionStorage } from './supabaseAccountClient';

describe('account session storage', () => {
  test('resolves to sessionStorage in the browser', () => {
    expect(accountSessionStorage()).toBe(window.sessionStorage);
  });

  test('is NOT localStorage', () => {
    expect(accountSessionStorage()).not.toBe(window.localStorage);
  });

  test('read/write/remove round-trips through sessionStorage only', () => {
    const store = accountSessionStorage();
    store.setItem('ld-test-key', 'v1');
    expect(window.sessionStorage.getItem('ld-test-key')).toBe('v1');
    expect(window.localStorage.getItem('ld-test-key')).toBe(null);
    store.removeItem('ld-test-key');
    expect(window.sessionStorage.getItem('ld-test-key')).toBe(null);
  });

  test('falls back to an in-memory store when sessionStorage throws (private mode)', () => {
    const spy = jest.spyOn(window.sessionStorage.__proto__, 'setItem')
      .mockImplementation(() => { throw new Error('QuotaExceeded'); });
    const store = accountSessionStorage();
    expect(store).not.toBe(window.sessionStorage);
    spy.mockRestore();
    // the fallback is a working, non-persistent store
    store.setItem('k', 'v');
    expect(store.getItem('k')).toBe('v');
    store.removeItem('k');
    expect(store.getItem('k')).toBe(null);
    expect(window.localStorage.getItem('k')).toBe(null);
  });
});
