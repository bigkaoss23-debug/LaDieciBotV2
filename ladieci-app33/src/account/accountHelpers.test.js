// S2-7C2 — account helper unit tests (pure, no DOM/network).
import {
  PASSWORD_MIN,
  PASSWORD_POLICY_MESSAGE,
  RESET_REQUEST_MESSAGE,
  RESET_RATE_LIMIT_MESSAGE,
  validatePassword,
  validateNewPassword,
  describeResetOutcome,
  validateEmail,
  parseAuthCallback,
  isAccountRoute,
  shouldRenderAccount,
  summarizeAccount,
  PIN_LENGTH,
  resolvePinInput,
  pinInputMessage,
  isTrivialPin,
  describePinSaveError,
  PIN_LENGTH_MESSAGE,
  PIN_DUPLICATE_MESSAGE,
  PIN_WEAK_MESSAGE,
  PIN_GUIDANCE,
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
    expect(s).toEqual({
      emailVerified: true, membershipCount: 0, noWorkspace: true, noAccess: true,
      ownerWorkspaceId: null, ownerWorkspaceName: null, adminPinSetupRequired: false,
    });
  });
  test('assigned account reflects membership count and access', () => {
    const s = summarizeAccount({ emailVerified: true, memberships: [{ workspaceId: 'w1' }], workspaces: ['w1'] });
    expect(s.noWorkspace).toBe(false);
    expect(s.noAccess).toBe(false);
    expect(s.membershipCount).toBe(1);
  });
  test('missing/garbage body is treated as unassigned + unverified', () => {
    expect(summarizeAccount(null)).toEqual({
      emailVerified: false, membershipCount: 0, noWorkspace: true, noAccess: true,
      ownerWorkspaceId: null, ownerWorkspaceName: null, adminPinSetupRequired: false,
    });
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

describe('describeResetOutcome (privacy-safe, never claims an email was sent)', () => {
  test('success (no error) → neutral "maybe sent" message, not rate limited', () => {
    const r = describeResetOutcome(null);
    expect(r).toEqual({ rateLimited: false, message: RESET_REQUEST_MESSAGE });
    expect(RESET_REQUEST_MESSAGE).toBe('Si la dirección es válida y el servicio de correo puede procesar la solicitud, recibirás un enlace para restablecer la contraseña.');
    // never asserts an email WAS sent
    expect(RESET_REQUEST_MESSAGE.toLowerCase()).not.toContain('hemos enviado');
  });
  test('HTTP 429 → rate-limited message', () => {
    expect(describeResetOutcome({ status: 429 })).toEqual({ rateLimited: true, message: RESET_RATE_LIMIT_MESSAGE });
  });
  test('over_email_send_rate_limit code → rate-limited', () => {
    expect(describeResetOutcome({ code: 'over_email_send_rate_limit' }).rateLimited).toBe(true);
  });
  test('generic message with "rate limit" → rate-limited', () => {
    expect(describeResetOutcome({ message: 'Email rate limit exceeded' }).rateLimited).toBe(true);
  });
  test('unrelated error still returns the neutral message (no enumeration)', () => {
    const r = describeResetOutcome({ status: 500, message: 'boom' });
    expect(r.rateLimited).toBe(false);
    expect(r.message).toBe(RESET_REQUEST_MESSAGE);
  });
});

describe('S2-7D summarizeAccount owner + admin-PIN signals', () => {
  const ownerMe = {
    emailVerified: true,
    memberships: [{ workspaceId: 'ws1', workspaceName: 'La Dieci', role: 'workspace_owner', status: 'active' }],
    workspaces: ['ws1'],
    adminPinSetupRequired: true,
  };
  test('surfaces owner workspace id/name', () => {
    const s = summarizeAccount(ownerMe);
    expect(s.ownerWorkspaceId).toBe('ws1');
    expect(s.ownerWorkspaceName).toBe('La Dieci');
    expect(s.noWorkspace).toBe(false);
  });
  test('adminPinSetupRequired reflects the server flag ONLY', () => {
    expect(summarizeAccount(ownerMe).adminPinSetupRequired).toBe(true);
    expect(summarizeAccount({ ...ownerMe, adminPinSetupRequired: false }).adminPinSetupRequired).toBe(false);
    // Never inferred when the flag is absent.
    expect(summarizeAccount({ memberships: ownerMe.memberships }).adminPinSetupRequired).toBe(false);
  });
  test('no owner membership → null owner workspace', () => {
    const s = summarizeAccount({ memberships: [{ workspaceId: 'ws2', role: 'workspace_admin', status: 'active' }], workspaces: ['ws2'] });
    expect(s.ownerWorkspaceId).toBe(null);
  });
});

describe('S2-7D2 six-digit operational PIN', () => {
  test('exactly 6 digits accepted', () => {
    const r = resolvePinInput('482915');
    expect(r.ok).toBe(true);
    expect(r.pin).toBe('482915');
    expect(PIN_LENGTH).toBe(6);
  });
  test('5 digits rejected with the length message', () => {
    const r = resolvePinInput('48291');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('length');
    expect(pinInputMessage(r.code)).toBe(PIN_LENGTH_MESSAGE);
    expect(PIN_LENGTH_MESSAGE).toBe('El PIN debe tener exactamente 6 números.');
  });
  test('7+ digits rejected', () => {
    expect(resolvePinInput('4829156').ok).toBe(false);
    expect(resolvePinInput('903421756').code).toBe('length');
  });
  test('letters and separators rejected', () => {
    ['48291a', 'margarita', '482 91', '482-915'].forEach((v) => {
      expect(resolvePinInput(v).ok).toBe(false);
    });
  });
  test('trivial PINs rejected with their own message', () => {
    ['111111', '123456', '654321', '121212', '123123'].forEach((v) => {
      const r = resolvePinInput(v);
      expect(r.ok).toBe(false);
      expect(r.code).toBe('weak');
      expect(isTrivialPin(v)).toBe(true);
    });
    expect(pinInputMessage('weak')).toBe(PIN_WEAK_MESSAGE);
  });
  test('partial input still exposes digits so the dots can fill', () => {
    expect(resolvePinInput('48').pin).toBe('48');
    expect(resolvePinInput('48').ok).toBe(false);
  });
  test('empty input', () => {
    expect(resolvePinInput('').code).toBe('empty');
  });
  test('no 9-12 wording anywhere in the guidance', () => {
    expect(PIN_GUIDANCE).toBe('Elige un PIN de 6 números para el acceso diario. Es distinto de la contraseña de tu cuenta.');
    expect(PIN_GUIDANCE).not.toMatch(/9|12/);
  });
});

describe('S2-7D2 backend error mapping', () => {
  test('409 / admin_pin_duplicate → the neutral Spanish duplicate message', () => {
    expect(describePinSaveError(409, { error: 'admin_pin_duplicate' })).toBe(PIN_DUPLICATE_MESSAGE);
    expect(PIN_DUPLICATE_MESSAGE).toBe('Este PIN no está disponible. Elige otro.');
  });
  test('the duplicate message names no actor', () => {
    expect(PIN_DUPLICATE_MESSAGE).not.toMatch(/operator|rider|owner|repartidor/i);
  });
  test('any other failure stays generic', () => {
    expect(describePinSaveError(400, { error: 'admin_pin_rejected' })).toBe('No se pudo guardar el PIN. Inténtalo de nuevo.');
    expect(describePinSaveError(500, {})).toBe('No se pudo guardar el PIN. Inténtalo de nuevo.');
  });
});
