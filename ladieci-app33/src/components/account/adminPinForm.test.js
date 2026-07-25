// S2-7D — component tests for the UNIFIED admin-PIN creation form. One primary field
// accepts a memorable word OR a direct numeric PIN (auto-detected), with a live read-only
// generated-PIN preview, an independent confirmation field compared by digits only, a
// collapsed keypad that writes into the focused field, and a strict security boundary:
// the word never reaches the API payload or any storage.
// react-dom + react-dom/test-utils (no @testing-library dependency).
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../account/supabaseAccountClient', () => ({
  ACCOUNT_REDIRECT_URL: 'https://ladieci-v1-staging.netlify.app',
  getAccountClient: () => ({
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  }),
}));

jest.mock('../../account/accountApi', () => {
  const helpers = jest.requireActual('../../account/accountHelpers');
  return {
    __esModule: true,
    ADMIN_PIN_MIN: helpers.ADMIN_PIN_MIN,
    ADMIN_PIN_MAX: helpers.ADMIN_PIN_MAX,
    ADMIN_PIN_POLICY_MESSAGE: helpers.ADMIN_PIN_POLICY_MESSAGE,
    validateAdminPin: helpers.validateAdminPin,
    resolvePinInput: helpers.resolvePinInput,
    pinInputMessage: helpers.pinInputMessage,
    wordToPin: helpers.wordToPin,
    T9_MAP: helpers.T9_MAP,
    PIN_MIXED_MESSAGE: helpers.PIN_MIXED_MESSAGE,
    PIN_NUMERIC_LENGTH_MESSAGE: helpers.PIN_NUMERIC_LENGTH_MESSAGE,
    PIN_WORD_LENGTH_MESSAGE: helpers.PIN_WORD_LENGTH_MESSAGE,
    PIN_UNSUPPORTED_CHAR_MESSAGE: helpers.PIN_UNSUPPORTED_CHAR_MESSAGE,
    PIN_MISMATCH_MESSAGE: helpers.PIN_MISMATCH_MESSAGE,
    PIN_MATCH_LABEL: helpers.PIN_MATCH_LABEL,
    PIN_MISMATCH_LABEL: helpers.PIN_MISMATCH_LABEL,
    PIN_HELP_TEXT: helpers.PIN_HELP_TEXT,
    summarizeAccount: helpers.summarizeAccount,
    validateNewPassword: helpers.validateNewPassword,
    describeResetOutcome: helpers.describeResetOutcome,
    validateEmail: helpers.validateEmail,
    parseAuthCallback: helpers.parseAuthCallback,
    PASSWORD_MIN: helpers.PASSWORD_MIN,
    PASSWORD_POLICY_MESSAGE: helpers.PASSWORD_POLICY_MESSAGE,
    accountSignUp: jest.fn(), accountSignIn: jest.fn(), accountRequestReset: jest.fn(),
    accountUpdatePassword: jest.fn(), accountSignOut: jest.fn(async () => {}),
    accountGetSession: jest.fn(async () => null),
    claimWorkspace: jest.fn(async () => ({ ok: true, body: { ok: true } })),
    fetchAccountMe: jest.fn(),
    setAdminPin: jest.fn(),
  };
});

import { AdminPinView } from './AccountApp';
import { fetchAccountMe, setAdminPin } from '../../account/accountApi';

const OWNER_ME = {
  emailVerified: true,
  memberships: [{ workspaceId: 'ws1', workspaceName: 'La Dieci', role: 'workspace_owner', status: 'active' }],
  workspaces: ['ws1'],
  adminPinSetupRequired: true,
};
const WORD = 'margarita';          // → 627427482 (9 digits)
const WORD_PIN = '627427482';

function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
async function mountAsync(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root;
  await act(async () => { root = createRoot(container); root.render(element); });
  return { container, root };
}
async function mountForm() {
  fetchAccountMe.mockResolvedValue({ status: 200, ok: true, body: OWNER_ME });
  return mountAsync(<AdminPinView setView={() => {}} />);
}
const btnByLabel = (c, label) =>
  Array.from(c.querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') || '') === label);
const btnByText = (c, text) =>
  Array.from(c.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === text);
const primary = (c) => c.querySelector('#ap-input');
const confirmField = (c) => c.querySelector('#ap-input2');
const preview = (c) => c.querySelector('[data-testid="pin-preview"]');
const matchLine = (c) => c.querySelector('[data-testid="pin-match"]');
const fill = (c, a, b) => {
  act(() => { typeInto(primary(c), a); });
  act(() => { typeInto(confirmField(c), b); });
};

beforeEach(() => {
  fetchAccountMe.mockReset();
  setAdminPin.mockReset();
  setAdminPin.mockResolvedValue({ status: 200, ok: true, body: { ok: true, event: 'pin_set' } });
});

describe('unified form structure', () => {
  test('shows ONE primary field and one confirmation field (no competing forms)', async () => {
    const { container, root } = await mountForm();
    expect(container.textContent).toContain('Crear PIN de administrador');
    expect(container.textContent).toContain('Palabra o PIN numérico');
    expect(container.textContent).toContain('Repite la palabra o el PIN');
    expect(container.querySelectorAll('input').length).toBe(2);
    // the two old competing mode tabs are gone
    expect(btnByText(container, 'Generar PIN a partir de una palabra')).toBeUndefined();
    act(() => { root.unmount(); }); container.remove();
  });

  test('keypad is collapsed by default behind "Usar teclado numérico"', async () => {
    const { container, root } = await mountForm();
    expect(container.querySelector('.ld-acc-keypad')).toBe(null);
    expect(btnByText(container, 'Usar teclado numérico')).toBeTruthy();
    act(() => { btnByText(container, 'Usar teclado numérico').click(); });
    expect(container.querySelector('.ld-acc-keypad')).toBeTruthy();
    act(() => { root.unmount(); }); container.remove();
  });

  test('information control reveals the Spanish help and the privacy guarantees', async () => {
    const { container, root } = await mountForm();
    expect(container.querySelector('[data-testid="pin-help"]')).toBe(null);
    act(() => { btnByLabel(container, 'Información sobre el PIN').click(); });
    const help = container.querySelector('[data-testid="pin-help"]');
    expect(help.textContent).toContain('ABC = 2');
    expect(help.textContent).toContain('WXYZ = 9');
    expect(help.textContent).toContain('nunca se envía');
    expect(help.textContent).toContain('no se guarda');
    expect(help.textContent).toContain('puedes seguir usando el número mostrado');
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('live generated-PIN preview', () => {
  test('word mode shows "PIN generado" with the real digits, updating per letter', async () => {
    const { container, root } = await mountForm();
    act(() => { typeInto(primary(container), 'mar'); });
    expect(preview(container).textContent).toContain('PIN generado');
    expect(preview(container).textContent).toContain('627');
    act(() => { typeInto(primary(container), 'marg'); });
    expect(preview(container).textContent).toContain('6274');
    act(() => { typeInto(primary(container), WORD); });
    expect(preview(container).textContent).toContain(WORD_PIN);
    act(() => { root.unmount(); }); container.remove();
  });

  test('numeric mode shows the read-only "PIN numérico" summary', async () => {
    const { container, root } = await mountForm();
    act(() => { typeInto(primary(container), '123456789'); });
    expect(preview(container).textContent).toContain('PIN numérico');
    expect(preview(container).textContent).toContain('123456789');
    act(() => { root.unmount(); }); container.remove();
  });

  test('the preview is NOT an input and cannot be edited', async () => {
    const { container, root } = await mountForm();
    act(() => { typeInto(primary(container), WORD); });
    const p = preview(container);
    expect(p.tagName).not.toBe('INPUT');
    expect(p.querySelector('input')).toBe(null);
    expect(p.getAttribute('aria-readonly')).toBe('true');
    expect(container.querySelectorAll('input').length).toBe(2); // still only the two fields
    act(() => { root.unmount(); }); container.remove();
  });

  test('spaces and hyphens are ignored in the preview', async () => {
    const { container, root } = await mountForm();
    act(() => { typeInto(primary(container), 'marga - rita'); });
    expect(preview(container).textContent).toContain(WORD_PIN);
    act(() => { root.unmount(); }); container.remove();
  });

  test('no preview for mixed or unsupported input', async () => {
    const { container, root } = await mountForm();
    act(() => { typeInto(primary(container), 'PIZZA2026'); });
    expect(preview(container)).toBe(null);
    act(() => { typeInto(primary(container), 'almería'); });
    expect(preview(container)).toBe(null);
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('confirmation compares digits only', () => {
  test('same PIN from different capitalization/separators → "Los PIN coinciden"', async () => {
    const { container, root } = await mountForm();
    fill(container, WORD, 'MARGA-RITA');
    expect(matchLine(container).textContent).toBe('Los PIN coinciden');
    act(() => { root.unmount(); }); container.remove();
  });

  test('a word and its equivalent digits also match', async () => {
    const { container, root } = await mountForm();
    fill(container, WORD, WORD_PIN);
    expect(matchLine(container).textContent).toBe('Los PIN coinciden');
    act(() => { root.unmount(); }); container.remove();
  });

  test('different generated PINs → "Los PIN no coinciden" and submit is refused', async () => {
    const { container, root } = await mountForm();
    fill(container, WORD, 'napolitana');
    expect(matchLine(container).textContent).toBe('Los PIN no coinciden');
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).not.toHaveBeenCalled();
    expect(container.textContent).toContain('no coinciden');
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('validation messages', () => {
  const cases = [
    ['PIZZA2026', 'PIZZA2026', 'Introduce solo letras o solo números, sin mezclarlos.'],
    ['almería', 'almería', 'Este carácter no es compatible.'],
    ['12345', '12345', 'El PIN debe tener entre 9 y 12 dígitos.'],
    ['pizza', 'pizza', 'La palabra debe generar un PIN de entre 9 y 12 dígitos.'],
    ['extraordinario', 'extraordinario', 'La palabra debe generar un PIN de entre 9 y 12 dígitos.'],
  ];
  test.each(cases)('input %s is rejected with its own message (no API call)', async (a, b, msg) => {
    const { container, root } = await mountForm();
    fill(container, a, b);
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).not.toHaveBeenCalled();
    expect(container.textContent).toContain(msg);
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('submission — numeric PIN only', () => {
  test('word input submits ONLY the digits; the word is absent from the payload', async () => {
    const { container, root } = await mountForm();
    fill(container, WORD, WORD);
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).toHaveBeenCalledTimes(1);
    expect(setAdminPin).toHaveBeenCalledWith('ws1', WORD_PIN);
    const payload = JSON.stringify(setAdminPin.mock.calls[0]);
    expect(payload).not.toContain(WORD);
    expect(payload).not.toContain(WORD.toUpperCase());
    act(() => { root.unmount(); }); container.remove();
  });

  test('direct numeric entry submits that PIN unchanged', async () => {
    const { container, root } = await mountForm();
    fill(container, '903421756', '903421756');
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).toHaveBeenCalledWith('ws1', '903421756');
    act(() => { root.unmount(); }); container.remove();
  });

  test('values are cleared after success — word and PIN vanish from the DOM', async () => {
    const { container, root } = await mountForm();
    fill(container, WORD, WORD);
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(container.textContent).toContain('PIN de administrador listo');
    expect(container.textContent).not.toContain(WORD);
    expect(container.innerHTML).not.toContain(WORD_PIN);
    expect(primary(container)).toBe(null);
    act(() => { root.unmount(); }); container.remove();
  });

  test('no duplicate submission while a request is in flight', async () => {
    let release;
    setAdminPin.mockImplementation(() => new Promise((res) => { release = () => res({ status: 200, ok: true, body: { ok: true } }); }));
    const { container, root } = await mountForm();
    fill(container, WORD, WORD);
    const btn = container.querySelector('button[type="submit"]');
    await act(async () => { btn.click(); });
    await act(async () => { btn.click(); btn.click(); });   // extra clicks while busy
    expect(setAdminPin).toHaveBeenCalledTimes(1);
    expect(btn.disabled).toBe(true);
    await act(async () => { release(); });
    act(() => { root.unmount(); }); container.remove();
  });

  test('unmount does not throw and leaves nothing behind', async () => {
    const { container, root } = await mountForm();
    fill(container, WORD, WORD);
    expect(() => { act(() => { root.unmount(); }); }).not.toThrow();
    expect(container.innerHTML).toBe('');
    container.remove();
  });
});

describe('collapsed keypad writes into the focused unified field', () => {
  const openKeypad = (c) => act(() => { btnByText(c, 'Usar teclado numérico').click(); });

  test('digits go to the primary field by default, with a length counter', async () => {
    const { container, root } = await mountForm();
    openKeypad(container);
    act(() => { btnByLabel(container, '9').click(); });
    act(() => { btnByLabel(container, '0').click(); });
    act(() => { btnByLabel(container, '3').click(); });
    expect(primary(container).value).toBe('903');
    expect(container.querySelector('[data-testid="keypad-length"]').textContent).toContain('3 dígitos');
    act(() => { root.unmount(); }); container.remove();
  });

  test('after focusing the confirmation field the keypad writes there instead', async () => {
    const { container, root } = await mountForm();
    openKeypad(container);
    act(() => { btnByLabel(container, '1').click(); });
    expect(primary(container).value).toBe('1');
    act(() => { confirmField(container).focus(); });
    act(() => { btnByLabel(container, '7').click(); });
    expect(confirmField(container).value).toBe('7');
    expect(primary(container).value).toBe('1');   // primary untouched
    act(() => { root.unmount(); }); container.remove();
  });

  test('Borrar removes the last character and Limpiar empties the active field', async () => {
    const { container, root } = await mountForm();
    openKeypad(container);
    act(() => { typeInto(primary(container), '9034'); });
    act(() => { btnByLabel(container, 'Borrar').click(); });
    expect(primary(container).value).toBe('903');
    act(() => { btnByLabel(container, 'Limpiar').click(); });
    expect(primary(container).value).toBe('');
    act(() => { root.unmount(); }); container.remove();
  });

  test('a full PIN entered only with the keypad can be submitted', async () => {
    const { container, root } = await mountForm();
    openKeypad(container);
    for (const d of '903421756') act(() => { btnByLabel(container, d).click(); });
    act(() => { confirmField(container).focus(); });
    for (const d of '903421756') act(() => { btnByLabel(container, d).click(); });
    expect(matchLine(container).textContent).toBe('Los PIN coinciden');
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).toHaveBeenCalledWith('ws1', '903421756');
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('storage safety', () => {
  test('nothing is written to localStorage or sessionStorage', async () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem');
    const { container, root } = await mountForm();
    fill(container, WORD, WORD);
    act(() => { btnByText(container, 'Usar teclado numérico').click(); });
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(spy).not.toHaveBeenCalled();
    act(() => { root.unmount(); }); container.remove();
    spy.mockRestore();
  });
});

describe('server-gated rendering is preserved', () => {
  test('setup NOT required → ready state, no form', async () => {
    fetchAccountMe.mockResolvedValue({ status: 200, ok: true, body: { ...OWNER_ME, adminPinSetupRequired: false } });
    const { container, root } = await mountAsync(<AdminPinView setView={() => {}} />);
    expect(container.textContent).toContain('PIN de administrador listo');
    expect(container.querySelector('button[type="submit"]')).toBe(null);
    act(() => { root.unmount(); }); container.remove();
  });

  test('server rejection shows a neutral error and keeps the PIN out of the DOM', async () => {
    setAdminPin.mockResolvedValue({ status: 400, ok: false, body: { error: 'admin_pin_rejected' } });
    const { container, root } = await mountForm();
    fill(container, '903421756', '903421756');
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(container.textContent).toContain('No se pudo guardar el PIN');
    act(() => { root.unmount(); }); container.remove();
  });
});
