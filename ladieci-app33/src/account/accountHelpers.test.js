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
  validateWordPin,
  wordPinMessage,
  WORD_PIN_LENGTH_MESSAGE,
  WORD_PIN_UNSUPPORTED_MESSAGE,
  ADMIN_PIN_POLICY_MESSAGE,
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


describe('S2-7D T9 word → PIN mapping (local memory aid only)', () => {
  test('canonical telephone mapping, one letter → exactly one digit', () => {
    expect(wordToPin('ABC').pin).toBe('222');
    expect(wordToPin('DEF').pin).toBe('333');
    expect(wordToPin('GHI').pin).toBe('444');
    expect(wordToPin('JKL').pin).toBe('555');
    expect(wordToPin('MNO').pin).toBe('666');
    expect(wordToPin('PQRS').pin).toBe('7777');
    expect(wordToPin('TUV').pin).toBe('888');
    expect(wordToPin('WXYZ').pin).toBe('9999');
  });
  test('every mapped letter yields exactly one digit (length preserved)', () => {
    Object.keys(T9_MAP).forEach((d) => {
      const letters = T9_MAP[d];
      const r = wordToPin(letters);
      expect(r.ok).toBe(true);
      expect(r.pin.length).toBe(letters.length);
      expect(r.pin).toBe(String(d).repeat(letters.length));
    });
  });
  test('lowercase and uppercase are equivalent', () => {
    expect(wordToPin('margarita').pin).toBe(wordToPin('MARGARITA').pin);
    expect(wordToPin('MaRgArItA').pin).toBe(wordToPin('margarita').pin);
  });
  test('separators (space, hyphen, underscore, dot, apostrophe, comma) are ignored', () => {
    const base = wordToPin('pizzanapoli').pin;
    expect(wordToPin('pizza napoli').pin).toBe(base);
    expect(wordToPin('pizza-napoli').pin).toBe(base);
    expect(wordToPin('pizza_napoli').pin).toBe(base);
    expect(wordToPin('pizza.napoli').pin).toBe(base);
    expect(wordToPin("pizza'napoli").pin).toBe(base);
    expect(wordToPin('pizza, napoli').pin).toBe(base);
  });
  test('Spanish diacritics normalise (á→a→2, ñ→n→6)', () => {
    expect(wordToPin('á').pin).toBe('2');
    expect(wordToPin('ñ').pin).toBe('6');
    expect(wordToPin('almería').pin).toBe(wordToPin('almeria').pin);
  });
  test('unsupported characters are rejected', () => {
    expect(wordToPin('pizza!').code).toBe('unsupported');
    expect(wordToPin('piz@za').code).toBe('unsupported');
    expect(wordToPin('piz/za').ok).toBe(false);
  });
  test('empty / separators-only input is not a PIN', () => {
    expect(wordToPin('').code).toBe('empty');
    expect(wordToPin('   ').code).toBe('empty');
  });
});

describe('S2-7D validateWordPin enforces the SAME 9–12 admin policy', () => {
  test('accepts a word generating 9–12 non-trivial digits', () => {
    const r = validateWordPin('margarita'); // 9 letters
    expect(r.ok).toBe(true);
    expect(r.pin).toBe('627427482');
    expect(r.pin.length).toBe(9);
  });
  test('rejects a generated PIN shorter than 9', () => {
    const r = validateWordPin('pizza'); // 5 digits
    expect(r.ok).toBe(false);
    expect(r.code).toBe('length');
    expect(wordPinMessage(r.code)).toBe(WORD_PIN_LENGTH_MESSAGE);
  });
  test('rejects a generated PIN longer than 12', () => {
    const r = validateWordPin('extraordinario'); // 14 letters
    expect(r.ok).toBe(false);
    expect(r.code).toBe('length');
  });
  test('accepts exactly 12 and rejects exactly 13', () => {
    expect(validateWordPin('abcdefghijkl').pin.length).toBe(12);
    expect(validateWordPin('abcdefghijklm').code).toBe('length');
  });
  test('unsupported characters keep their own message', () => {
    const r = validateWordPin('margarita!');
    expect(r.code).toBe('unsupported');
    expect(wordPinMessage(r.code)).toBe(WORD_PIN_UNSUPPORTED_MESSAGE);
  });
  test('a word generating a trivial PIN is rejected by the policy', () => {
    const r = validateWordPin('aaaaaaaaa'); // 222222222 → all same
    expect(r.ok).toBe(false);
    expect(r.code).toBe('policy');
    expect(wordPinMessage(r.code)).toBe(ADMIN_PIN_POLICY_MESSAGE);
  });
  test('failed validation never leaks a partial pin', () => {
    expect(validateWordPin('pizza').pin).toBe('');
    expect(validateWordPin('margarita!').pin).toBe('');
  });
});
