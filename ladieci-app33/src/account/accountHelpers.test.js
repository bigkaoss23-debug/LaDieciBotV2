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
  validateAdminPin,
  ADMIN_PIN_MIN,
  ADMIN_PIN_MAX,
  T9_MAP,
  wordToPin,
  resolvePinInput,
  pinInputMessage,
  PIN_MIXED_MESSAGE,
  PIN_NUMERIC_LENGTH_MESSAGE,
  PIN_WORD_LENGTH_MESSAGE,
  PIN_UNSUPPORTED_CHAR_MESSAGE,
  PIN_HELP_TEXT,
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

describe('S2-7D validateAdminPin (admin 9–12 digits, mirrors backend policy)', () => {
  test('accepts a valid non-trivial 9-digit PIN', () => {
    expect(validateAdminPin('903421756').ok).toBe(true);
  });
  test('rejects operator-length (6–8) PINs', () => {
    expect(validateAdminPin('123457').ok).toBe(false);
    expect(validateAdminPin('90342175').code).toBe('policy'); // 8 digits
  });
  test('rejects non-digits, sequential, all-same, repeated block', () => {
    expect(validateAdminPin('90342175a').ok).toBe(false);
    expect(validateAdminPin('123456789').ok).toBe(false);
    expect(validateAdminPin('999999999').ok).toBe(false);
    expect(validateAdminPin('123123123').ok).toBe(false);
  });
  test('too long (>12) rejected', () => {
    expect(validateAdminPin('9034217560341').ok).toBe(false);
  });
  test('mismatch code when confirmation differs', () => {
    expect(validateAdminPin('903421756', '903421999')).toEqual({ ok: false, code: 'mismatch' });
  });
  test('policy bounds exported', () => {
    expect([ADMIN_PIN_MIN, ADMIN_PIN_MAX]).toEqual([9, 12]);
  });
});


describe('S2-7D unified PIN input — telephone mapping', () => {
  test('canonical mapping, one letter → exactly one digit', () => {
    expect(wordToPin('ABC').pin).toBe('222');
    expect(wordToPin('DEF').pin).toBe('333');
    expect(wordToPin('GHI').pin).toBe('444');
    expect(wordToPin('JKL').pin).toBe('555');
    expect(wordToPin('MNO').pin).toBe('666');
    expect(wordToPin('PQRS').pin).toBe('7777');
    expect(wordToPin('TUV').pin).toBe('888');
    expect(wordToPin('WXYZ').pin).toBe('9999');
  });
  test('every mapped letter yields exactly one digit', () => {
    Object.keys(T9_MAP).forEach((d) => {
      const letters = T9_MAP[d];
      const r = wordToPin(letters);
      expect(r.pin).toBe(String(d).repeat(letters.length));
    });
  });
});

describe('S2-7D resolvePinInput — automatic mode detection', () => {
  test('digits only → numeric mode, used directly as the PIN', () => {
    const r = resolvePinInput('123456789');
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('numeric');
    expect(r.pin).toBe('123456789');
  });
  test('letters only → word mode, converted locally', () => {
    const r = resolvePinInput('margarita');
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('word');
    expect(r.pin).toBe('627427482');
  });
  test('uppercase and lowercase are equivalent', () => {
    expect(resolvePinInput('MARGARITA').pin).toBe(resolvePinInput('margarita').pin);
    expect(resolvePinInput('MaRgArItA').pin).toBe(resolvePinInput('margarita').pin);
  });
  test('spaces and hyphens are ignored (in both modes)', () => {
    expect(resolvePinInput('marga rita').pin).toBe('627427482');
    expect(resolvePinInput('marga-rita').pin).toBe('627427482');
    expect(resolvePinInput(' MARGA - RITA ').pin).toBe('627427482');
    expect(resolvePinInput('123 456-789').pin).toBe('123456789');
  });
  test('mixed letters and digits are REJECTED (PIZZA2026)', () => {
    const r = resolvePinInput('PIZZA2026');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('mixed');
    expect(r.pin).toBe('');
    expect(pinInputMessage(r.code)).toBe(PIN_MIXED_MESSAGE);
    expect(PIN_MIXED_MESSAGE).toBe('Introduce solo letras o solo números, sin mezclarlos.');
  });
  test('accented letters are REJECTED, not converted', () => {
    ['almería', 'mañana', 'ÁNGEL'].forEach((w) => {
      const r = resolvePinInput(w);
      expect(r.ok).toBe(false);
      expect(r.code).toBe('unsupported');
      expect(r.pin).toBe('');
    });
    expect(pinInputMessage('unsupported')).toBe(PIN_UNSUPPORTED_CHAR_MESSAGE);
  });
  test('other unsupported characters rejected', () => {
    ['margarita!', 'marga@rita', 'marga.rita', 'marga_rita'].forEach((w) => {
      expect(resolvePinInput(w).code).toBe('unsupported');
    });
  });
  test('empty / separators only → not a PIN', () => {
    expect(resolvePinInput('').code).toBe('empty');
    expect(resolvePinInput('  - ').code).toBe('empty');
  });
});

describe('S2-7D length policy (9–12) with mode-specific messages', () => {
  test('numeric shorter than 9 → numeric length message', () => {
    const r = resolvePinInput('12345');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('length_numeric');
    expect(pinInputMessage(r.code)).toBe(PIN_NUMERIC_LENGTH_MESSAGE);
    expect(PIN_NUMERIC_LENGTH_MESSAGE).toBe('El PIN debe tener entre 9 y 12 dígitos.');
  });
  test('word generating fewer than 9 digits → word length message', () => {
    const r = resolvePinInput('pizza');
    expect(r.code).toBe('length_word');
    expect(pinInputMessage(r.code)).toBe(PIN_WORD_LENGTH_MESSAGE);
    expect(PIN_WORD_LENGTH_MESSAGE).toBe('La palabra debe generar un PIN de entre 9 y 12 dígitos.');
  });
  test('longer than 12 rejected in both modes', () => {
    expect(resolvePinInput('extraordinario').code).toBe('length_word');
    expect(resolvePinInput('1234567890123').code).toBe('length_numeric');
  });
  test('exactly 9 and exactly 12 accepted', () => {
    expect(resolvePinInput('903421756').ok).toBe(true);
    expect(resolvePinInput('abcdefghijkl').ok).toBe(true);
    expect(resolvePinInput('abcdefghijkl').pin.length).toBe(12);
  });
  test('pin is still exposed for the live preview while too short', () => {
    const r = resolvePinInput('pizza');
    expect(r.ok).toBe(false);
    expect(r.pin).toBe('74992');   // preview updates per letter
  });
  test('preview grows one digit per compatible letter', () => {
    expect(resolvePinInput('m').pin).toBe('6');
    expect(resolvePinInput('ma').pin).toBe('62');
    expect(resolvePinInput('mar').pin).toBe('627');
    expect(resolvePinInput('marg').pin).toBe('6274');
  });
});

describe('S2-7D two independent inputs compare only their digits', () => {
  test('different capitalization / separators still match', () => {
    const a = resolvePinInput('margarita');
    const b = resolvePinInput('MARGA-RITA');
    expect(a.pin).toBe(b.pin);
  });
  test('a word and the equivalent digits match', () => {
    expect(resolvePinInput('margarita').pin).toBe(resolvePinInput('627427482').pin);
  });
  test('different words produce different PINs', () => {
    expect(resolvePinInput('margarita').pin).not.toBe(resolvePinInput('napolitana').pin);
  });
});

describe('S2-7D help text', () => {
  test('states the mapping and that the operational access uses the numeric PIN', () => {
    expect(PIN_HELP_TEXT).toContain('ABC = 2');
    expect(PIN_HELP_TEXT).toContain('WXYZ = 9');
    expect(PIN_HELP_TEXT).toContain('El acceso operativo siempre se realiza con el PIN numérico generado.');
  });
});
