// S2-7C2 — account helper unit tests (pure, no DOM/network).
import {
  PASSWORD_MIN,
  PASSWORD_POLICY_MESSAGE,
  validatePassword,
  validateNewPassword,
  validateEmail,
  parseAuthCallback,
  isAccountRoute,
  shouldRenderAccount,
  summarizeAccount,
} from './accountHelpers';

describe('password policy (signup + reset validation)', () => {
  test('rejects passwords shorter than the minimum', () => {
    expect(validatePassword('Ab1')).toEqual({ ok: false, code: 'too_short' });
    expect(validatePassword('Abcdefg12').ok).toBe(false); // 9 chars < 12
  });
  test('requires at least one letter', () => {
    expect(validatePassword('123456789012')).toEqual({ ok: false, code: 'need_letter' });
  });
  test('requires at least one digit', () => {
    expect(validatePassword('abcdefghijkl')).toEqual({ ok: false, code: 'need_digit' });
  });
  test('accepts EXACTLY 12 chars with letters and digits', () => {
    expect('abcdefgh1234'.length).toBe(12);
    expect(validatePassword('abcdefgh1234')).toEqual({ ok: true, code: 'ok' });
    expect(PASSWORD_MIN).toBe(12);
  });
  test('accepts MORE than 12 chars with letters and digits', () => {
    const pw = 'abcdefghijk12345'; // 16 chars, letters + digits
    expect(pw.length).toBeGreaterThan(12);
    expect(validatePassword(pw)).toEqual({ ok: true, code: 'ok' });
  });
  test('a long password with a digit but NO letter still fails (need_letter)', () => {
    // >12 chars, has digits, but no letter → must NOT pass, message must not imply "only a number"
    expect(validatePassword('1234567890123!@#')).toEqual({ ok: false, code: 'need_letter' });
  });
  test('handles null/undefined safely', () => {
    expect(validatePassword(null).ok).toBe(false);
    expect(validatePassword(undefined).ok).toBe(false);
  });
});

describe('email validation', () => {
  test('accepts valid addresses', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('  user@example.com  ')).toBe(true);
  });
  test('rejects invalid addresses', () => {
    expect(validateEmail('nope')).toBe(false);
    expect(validateEmail('a@b')).toBe(false);
    expect(validateEmail('')).toBe(false);
  });
});

describe('auth callback parsing (confirm / recovery / invalid link)', () => {
  test('detects a signup confirmation landing', () => {
    const cb = parseAuthCallback('#access_token=REDACTED&type=signup&expires_in=3600', '');
    expect(cb.present).toBe(true);
    expect(cb.type).toBe('signup');
    expect(cb.error).toBe(null);
  });
  test('detects a password-recovery landing', () => {
    const cb = parseAuthCallback('#access_token=REDACTED&type=recovery', '');
    expect(cb.present).toBe(true);
    expect(cb.type).toBe('recovery');
  });
  test('detects an invalid/expired link', () => {
    const cb = parseAuthCallback('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid', '');
    expect(cb.present).toBe(true);
    expect(cb.error).toBeTruthy();
  });
  test('never leaks the token value in the parsed result', () => {
    const cb = parseAuthCallback('#access_token=SECRETTOKEN&refresh_token=SECRET2&type=recovery', '');
    expect(JSON.stringify(cb)).not.toContain('SECRETTOKEN');
    expect(JSON.stringify(cb)).not.toContain('SECRET2');
  });
  test('plain page (no callback) is not a callback', () => {
    expect(parseAuthCallback('', '').present).toBe(false);
    expect(parseAuthCallback('#', '?').present).toBe(false);
  });
});

describe('account routing', () => {
  test('/cuenta and /account are account routes', () => {
    expect(isAccountRoute('/cuenta')).toBe(true);
    expect(isAccountRoute('/account')).toBe(true);
    expect(isAccountRoute('/cuenta/')).toBe(true);
  });
  test('operator paths are NOT account routes', () => {
    ['/', '/repartidor', '/servizio', '/econbot', '/shadow-preview'].forEach((p) => {
      expect(isAccountRoute(p)).toBe(false);
    });
  });
});

describe('PIN-app regression: operator entries still render the operator app', () => {
  test('shouldRenderAccount is false for every operator entry path', () => {
    ['/', '/repartidor', '/servizio', '/econbot'].forEach((pathname) => {
      expect(shouldRenderAccount({ pathname, hash: '', search: '' })).toBe(false);
    });
  });
  test('shouldRenderAccount is true only for /cuenta or an auth callback at root', () => {
    expect(shouldRenderAccount({ pathname: '/cuenta', hash: '', search: '' })).toBe(true);
    expect(shouldRenderAccount({ pathname: '/', hash: '#type=recovery&access_token=x', search: '' })).toBe(true);
    expect(shouldRenderAccount({ pathname: '/', hash: '#type=signup&access_token=x', search: '' })).toBe(true);
  });
});

describe('account summary (/api/account/me → neutral flags)', () => {
  test('unassigned account: no workspace, no La Dieci access', () => {
    const s = summarizeAccount({ emailVerified: true, memberships: [], workspaces: [] });
    expect(s).toEqual({ emailVerified: true, membershipCount: 0, noWorkspace: true, noAccess: true });
  });
  test('assigned account reflects membership count and access', () => {
    const s = summarizeAccount({ emailVerified: true, memberships: [{ workspaceId: 'w1' }], workspaces: ['w1'] });
    expect(s.noWorkspace).toBe(false);
    expect(s.noAccess).toBe(false);
    expect(s.membershipCount).toBe(1);
  });
  test('missing/garbage body is treated as unassigned + unverified', () => {
    expect(summarizeAccount(null)).toEqual({ emailVerified: false, membershipCount: 0, noWorkspace: true, noAccess: true });
    expect(summarizeAccount({}).noWorkspace).toBe(true);
  });
});

describe('validateNewPassword (recovery / signup pair)', () => {
  test('exactly 12 chars, letters + digits, matching → ok', () => {
    expect(validateNewPassword('abcdefgh1234', 'abcdefgh1234')).toEqual({ ok: true, code: 'ok' });
  });
  test('more than 12 chars, letters + digits, matching → ok', () => {
    expect(validateNewPassword('abcdefghijk12345', 'abcdefghijk12345')).toEqual({ ok: true, code: 'ok' });
  });
  test('missing digit → need_digit (blocked before mismatch check)', () => {
    expect(validateNewPassword('abcdefghijklm', 'abcdefghijklm')).toEqual({ ok: false, code: 'need_digit' });
  });
  test('missing letter → need_letter', () => {
    expect(validateNewPassword('1234567890123', '1234567890123')).toEqual({ ok: false, code: 'need_letter' });
  });
  test('valid password but confirmation mismatch → mismatch', () => {
    expect(validateNewPassword('abcdefgh1234', 'abcdefgh1235')).toEqual({ ok: false, code: 'mismatch' });
  });
});

describe('password policy message is accurate (never "only a number")', () => {
  test('states the full rule: length + letters + numbers', () => {
    expect(PASSWORD_POLICY_MESSAGE).toBe('La contraseña debe tener al menos 12 caracteres e incluir letras y números.');
    expect(PASSWORD_POLICY_MESSAGE).toContain('12');
    expect(PASSWORD_POLICY_MESSAGE).toContain('letras');
    expect(PASSWORD_POLICY_MESSAGE).toContain('números');
  });
});
