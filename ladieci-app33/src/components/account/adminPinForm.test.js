// S2-7D — component tests for the NUMERIC-ONLY admin-PIN creation form: keypad + physical
// keyboard on the same fields, grouped read-only preview, secure random generator,
// confirmation compared by digits, and no storage writes. The former word→T9 mode is gone.
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
    formatPinGroups: helpers.formatPinGroups,
    generateSecurePin: helpers.generateSecurePin,
    PIN_NUMERIC_ONLY_MESSAGE: helpers.PIN_NUMERIC_ONLY_MESSAGE,
    PIN_LENGTH_MESSAGE: helpers.PIN_LENGTH_MESSAGE,
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
const PIN = '903421756';

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

describe('numeric-only form structure', () => {
  test('shows the PIN field, the confirmation field and the keypad (no word mode)', async () => {
    const { container, root } = await mountForm();
    expect(container.textContent).toContain('Crear PIN de administrador');
    expect(container.textContent).toContain('PIN numérico');
    expect(container.textContent).toContain('Repite el PIN');
    expect(container.querySelector('.ld-acc-keypad')).toBeTruthy();
    expect(container.textContent).not.toContain('Palabra');
    expect(container.textContent).not.toContain('PIN generado');
    act(() => { root.unmount(); }); container.remove();
  });

  test('fields are numeric and masked by default with a Mostrar/Ocultar control', async () => {
    const { container, root } = await mountForm();
    expect(primary(container).getAttribute('inputmode')).toBe('numeric');
    expect(primary(container).type).toBe('password');
    act(() => { btnByText(container, 'Mostrar').click(); });
    expect(primary(container).type).toBe('text');
    act(() => { root.unmount(); }); container.remove();
  });

  test('information control explains the separation and safe storage', async () => {
    const { container, root } = await mountForm();
    act(() => { btnByLabel(container, 'Información sobre el PIN').click(); });
    const help = container.querySelector('[data-testid="pin-help"]');
    expect(help.textContent).toContain('distinto de la contraseña');
    expect(help.textContent).toContain('gestor de contraseñas');
    expect(help.textContent).toContain('se cifra en el servidor');
    expect(help.textContent).not.toContain('ABC = 2');
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('live preview', () => {
  test('shows the length always, and the grouped digits when revealed', async () => {
    const { container, root } = await mountForm();
    act(() => { typeInto(primary(container), PIN); });
    expect(preview(container).textContent).toContain('9 dígitos');
    expect(preview(container).textContent).not.toContain('903 421 756'); // masked
    act(() => { btnByText(container, 'Mostrar').click(); });
    expect(preview(container).textContent).toContain('903 421 756');     // grouped in threes
    act(() => { root.unmount(); }); container.remove();
  });

  test('the preview is read-only and not an input', async () => {
    const { container, root } = await mountForm();
    act(() => { typeInto(primary(container), PIN); });
    const p = preview(container);
    expect(p.tagName).not.toBe('INPUT');
    expect(p.querySelector('input')).toBe(null);
    expect(p.getAttribute('aria-readonly')).toBe('true');
    expect(container.querySelectorAll('input').length).toBe(2);
    act(() => { root.unmount(); }); container.remove();
  });

  test('no preview when a letter is present', async () => {
    const { container, root } = await mountForm();
    act(() => { typeInto(primary(container), 'margarita'); });
    expect(preview(container)).toBe(null);
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('secure PIN generator', () => {
  test('fills the PIN field with a policy-valid PIN, reveals it and asks to confirm', async () => {
    const { container, root } = await mountForm();
    act(() => { btnByText(container, 'Generar PIN seguro').click(); });
    const value = primary(container).value;
    expect(value).toMatch(/^[0-9]{9}$/);
    expect(primary(container).type).toBe('text');            // revealed so it can be noted
    expect(container.querySelector('[data-testid="generated-note"]')).toBeTruthy();
    expect(confirmField(container).value).toBe('');          // confirmation NOT prefilled
    act(() => { root.unmount(); }); container.remove();
  });

  test('a generated PIN can be confirmed and submitted', async () => {
    const { container, root } = await mountForm();
    act(() => { btnByText(container, 'Generar PIN seguro').click(); });
    const value = primary(container).value;
    act(() => { typeInto(confirmField(container), value); });
    expect(matchLine(container).textContent).toBe('Los PIN coinciden');
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).toHaveBeenCalledWith('ws1', value);
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('confirmation', () => {
  test('same digits typed with different separators still match', async () => {
    const { container, root } = await mountForm();
    fill(container, PIN, '903 421-756');
    expect(matchLine(container).textContent).toBe('Los PIN coinciden');
    act(() => { root.unmount(); }); container.remove();
  });

  test('different PINs → mismatch label and refused submit', async () => {
    const { container, root } = await mountForm();
    fill(container, PIN, '903421999');
    expect(matchLine(container).textContent).toBe('Los PIN no coinciden');
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).not.toHaveBeenCalled();
    expect(container.textContent).toContain('no coinciden');
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('validation messages', () => {
  const cases = [
    ['margarita', 'margarita', 'Introduce solo números.'],
    ['PIZZA2026', 'PIZZA2026', 'Introduce solo números.'],
    ['12345', '12345', 'El PIN debe tener entre 9 y 12 dígitos.'],
    ['1234567890123', '1234567890123', 'El PIN debe tener entre 9 y 12 dígitos.'],
  ];
  test.each(cases)('input %s rejected with its own message (no API call)', async (a, b, msg) => {
    const { container, root } = await mountForm();
    fill(container, a, b);
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).not.toHaveBeenCalled();
    expect(container.textContent).toContain(msg);
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('submission', () => {
  test('submits the numeric PIN once, separators stripped', async () => {
    const { container, root } = await mountForm();
    fill(container, '903 421 756', PIN);
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).toHaveBeenCalledTimes(1);
    expect(setAdminPin).toHaveBeenCalledWith('ws1', PIN);
    act(() => { root.unmount(); }); container.remove();
  });

  test('values cleared after success — the PIN vanishes from the DOM', async () => {
    const { container, root } = await mountForm();
    fill(container, PIN, PIN);
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(container.textContent).toContain('PIN de administrador listo');
    expect(container.innerHTML).not.toContain(PIN);
    expect(primary(container)).toBe(null);
    act(() => { root.unmount(); }); container.remove();
  });

  test('no duplicate submission while a request is in flight', async () => {
    let release;
    setAdminPin.mockImplementation(() => new Promise((res) => { release = () => res({ status: 200, ok: true, body: { ok: true } }); }));
    const { container, root } = await mountForm();
    fill(container, PIN, PIN);
    const btn = container.querySelector('button[type="submit"]');
    await act(async () => { btn.click(); });
    await act(async () => { btn.click(); btn.click(); });
    expect(setAdminPin).toHaveBeenCalledTimes(1);
    expect(btn.disabled).toBe(true);
    await act(async () => { release(); });
    act(() => { root.unmount(); }); container.remove();
  });

  test('unmount does not throw and leaves nothing behind', async () => {
    const { container, root } = await mountForm();
    fill(container, PIN, PIN);
    expect(() => { act(() => { root.unmount(); }); }).not.toThrow();
    expect(container.innerHTML).toBe('');
    container.remove();
  });
});

describe('keypad writes into the focused field', () => {
  test('digits go to the PIN field by default, with a length counter', async () => {
    const { container, root } = await mountForm();
    act(() => { btnByLabel(container, '9').click(); });
    act(() => { btnByLabel(container, '0').click(); });
    act(() => { btnByLabel(container, '3').click(); });
    expect(primary(container).value).toBe('903');
    expect(container.querySelector('[data-testid="keypad-length"]').textContent).toContain('3 dígitos');
    act(() => { root.unmount(); }); container.remove();
  });

  test('after focusing the confirmation field the keypad writes there instead', async () => {
    const { container, root } = await mountForm();
    act(() => { btnByLabel(container, '1').click(); });
    expect(primary(container).value).toBe('1');
    act(() => { confirmField(container).focus(); });
    act(() => { btnByLabel(container, '7').click(); });
    expect(confirmField(container).value).toBe('7');
    expect(primary(container).value).toBe('1');
    act(() => { root.unmount(); }); container.remove();
  });

  test('Borrar and Limpiar act on the active field', async () => {
    const { container, root } = await mountForm();
    act(() => { typeInto(primary(container), '9034'); });
    act(() => { btnByLabel(container, 'Borrar').click(); });
    expect(primary(container).value).toBe('903');
    act(() => { btnByLabel(container, 'Limpiar').click(); });
    expect(primary(container).value).toBe('');
    act(() => { root.unmount(); }); container.remove();
  });

  test('a full PIN entered only with the keypad can be submitted', async () => {
    const { container, root } = await mountForm();
    for (const d of PIN) act(() => { btnByLabel(container, d).click(); });
    act(() => { confirmField(container).focus(); });
    for (const d of PIN) act(() => { btnByLabel(container, d).click(); });
    expect(matchLine(container).textContent).toBe('Los PIN coinciden');
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).toHaveBeenCalledWith('ws1', PIN);
    act(() => { root.unmount(); }); container.remove();
  });

  test('the physical keyboard still works on the same fields', async () => {
    const { container, root } = await mountForm();
    act(() => { typeInto(primary(container), PIN); });
    expect(primary(container).value).toBe(PIN);
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('storage safety', () => {
  test('nothing is written to localStorage or sessionStorage', async () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem');
    const { container, root } = await mountForm();
    act(() => { btnByText(container, 'Generar PIN seguro').click(); });
    const value = primary(container).value;
    act(() => { typeInto(confirmField(container), value); });
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

  test('server rejection shows a neutral error', async () => {
    setAdminPin.mockResolvedValue({ status: 400, ok: false, body: { error: 'admin_pin_rejected' } });
    const { container, root } = await mountForm();
    fill(container, PIN, PIN);
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(container.textContent).toContain('No se pudo guardar el PIN');
    act(() => { root.unmount(); }); container.remove();
  });
});
