// S2-7D2 — component tests for the SIX-DIGIT admin-PIN form: large keypad, six-dot progress,
// confirmation, physical keyboard, neutral duplicate handling and no storage writes.
// No word/T9 mode, no generator, no 9-12 wording.
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
    PIN_LENGTH: helpers.PIN_LENGTH,
    resolvePinInput: helpers.resolvePinInput,
    pinInputMessage: helpers.pinInputMessage,
    isTrivialPin: helpers.isTrivialPin,
    describePinSaveError: helpers.describePinSaveError,
    PIN_LENGTH_MESSAGE: helpers.PIN_LENGTH_MESSAGE,
    PIN_DUPLICATE_MESSAGE: helpers.PIN_DUPLICATE_MESSAGE,
    PIN_WEAK_MESSAGE: helpers.PIN_WEAK_MESSAGE,
    PIN_MISMATCH_MESSAGE: helpers.PIN_MISMATCH_MESSAGE,
    PIN_MATCH_LABEL: helpers.PIN_MATCH_LABEL,
    PIN_MISMATCH_LABEL: helpers.PIN_MISMATCH_LABEL,
    PIN_GUIDANCE: helpers.PIN_GUIDANCE,
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
const PIN = '482915';   // 6 digits, non-trivial

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
const dots = (c) => c.querySelectorAll('[data-testid="pin-dots"]')[0];
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

describe('six-digit form structure', () => {
  test('shows both PIN fields, the keypad and the six-number guidance', async () => {
    const { container, root } = await mountForm();
    expect(container.textContent).toContain('Crear PIN de administrador');
    expect(container.textContent).toContain('Elige un PIN de 6 números para el acceso diario');
    expect(container.textContent).toContain('Repite el PIN');
    expect(container.querySelector('.ld-acc-keypad')).toBeTruthy();
    expect(container.querySelectorAll('input').length).toBe(2);
    act(() => { root.unmount(); }); container.remove();
  });

  test('no word/T9 UI and no 9-12 wording remains', async () => {
    const { container, root } = await mountForm();
    const t = container.textContent;
    ['Palabra', 'PIN generado', 'ABC', 'Generar PIN seguro', 'Entre 9 y 12', '9 y 12'].forEach((s) => {
      expect(t).not.toContain(s);
    });
    act(() => { root.unmount(); }); container.remove();
  });

  test('fields are numeric, masked, capped at six characters', async () => {
    const { container, root } = await mountForm();
    expect(primary(container).getAttribute('inputmode')).toBe('numeric');
    expect(primary(container).getAttribute('maxlength')).toBe('6');
    expect(primary(container).type).toBe('password');
    act(() => { btnByText(container, 'Mostrar').click(); });
    expect(primary(container).type).toBe('text');
    act(() => { root.unmount(); }); container.remove();
  });

  test('six-position progress indicator fills one dot per digit', async () => {
    const { container, root } = await mountForm();
    expect(dots(container).querySelectorAll('span').length).toBe(6);
    act(() => { typeInto(primary(container), '482'); });
    expect(dots(container).querySelectorAll('span.on').length).toBe(3);
    act(() => { typeInto(primary(container), PIN); });
    expect(dots(container).querySelectorAll('span.on').length).toBe(6);
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('entry: keypad and physical keyboard', () => {
  test('keypad digits go to the focused field and stop at six', async () => {
    const { container, root } = await mountForm();
    for (const d of '4829156789') act(() => { btnByLabel(container, d).click(); });
    expect(primary(container).value).toBe('482915');   // capped
    act(() => { root.unmount(); }); container.remove();
  });

  test('after focusing the confirmation field the keypad writes there', async () => {
    const { container, root } = await mountForm();
    act(() => { btnByLabel(container, '4').click(); });
    act(() => { confirmField(container).focus(); });
    act(() => { btnByLabel(container, '7').click(); });
    expect(primary(container).value).toBe('4');
    expect(confirmField(container).value).toBe('7');
    act(() => { root.unmount(); }); container.remove();
  });

  test('Borrar and Limpiar act on the active field', async () => {
    const { container, root } = await mountForm();
    act(() => { typeInto(primary(container), '4829'); });
    act(() => { btnByLabel(container, 'Borrar').click(); });
    expect(primary(container).value).toBe('482');
    act(() => { btnByLabel(container, 'Limpiar').click(); });
    expect(primary(container).value).toBe('');
    act(() => { root.unmount(); }); container.remove();
  });

  test('physical numeric keyboard works; letters are ignored', async () => {
    const { container, root } = await mountForm();
    act(() => { typeInto(primary(container), PIN); });
    expect(primary(container).value).toBe(PIN);
    act(() => { typeInto(primary(container), '48ab29x15'); });
    expect(primary(container).value).toBe('482915');
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('confirmation gate', () => {
  test('submit is disabled until both six-digit values match', async () => {
    const { container, root } = await mountForm();
    const btn = () => container.querySelector('button[type="submit"]');
    expect(btn().disabled).toBe(true);
    act(() => { typeInto(primary(container), PIN); });
    expect(btn().disabled).toBe(true);
    act(() => { typeInto(confirmField(container), '482916'); });
    expect(btn().disabled).toBe(true);
    expect(matchLine(container).textContent).toBe('Los PIN no coinciden');
    act(() => { typeInto(confirmField(container), PIN); });
    expect(matchLine(container).textContent).toBe('Los PIN coinciden');
    expect(btn().disabled).toBe(false);
    act(() => { root.unmount(); }); container.remove();
  });

  test('a trivial PIN keeps submit disabled', async () => {
    const { container, root } = await mountForm();
    fill(container, '123456', '123456');
    expect(container.querySelector('button[type="submit"]').disabled).toBe(true);
    act(() => { root.unmount(); }); container.remove();
  });

  test('five digits keep submit disabled', async () => {
    const { container, root } = await mountForm();
    fill(container, '48291', '48291');
    expect(container.querySelector('button[type="submit"]').disabled).toBe(true);
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('submission', () => {
  test('sends exactly the six-digit PIN once', async () => {
    const { container, root } = await mountForm();
    fill(container, PIN, PIN);
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).toHaveBeenCalledTimes(1);
    expect(setAdminPin).toHaveBeenCalledWith('ws1', PIN);
    expect(container.textContent).toContain('PIN de administrador listo');
    act(() => { root.unmount(); }); container.remove();
  });

  test('a duplicate (409) shows the neutral Spanish message and names no actor', async () => {
    setAdminPin.mockResolvedValue({ status: 409, ok: false, body: { error: 'admin_pin_duplicate' } });
    const { container, root } = await mountForm();
    fill(container, PIN, PIN);
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(container.textContent).toContain('Este PIN no está disponible. Elige otro.');
    expect(container.textContent).not.toMatch(/operator|rider|repartidor/i);
    act(() => { root.unmount(); }); container.remove();
  });

  test('other failures stay generic', async () => {
    setAdminPin.mockResolvedValue({ status: 400, ok: false, body: { error: 'admin_pin_rejected' } });
    const { container, root } = await mountForm();
    fill(container, PIN, PIN);
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(container.textContent).toContain('No se pudo guardar el PIN');
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

  test('values cleared after success; PIN absent from the DOM', async () => {
    const { container, root } = await mountForm();
    fill(container, PIN, PIN);
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(container.innerHTML).not.toContain(PIN);
    expect(primary(container)).toBe(null);
    act(() => { root.unmount(); }); container.remove();
  });

  test('unmount leaves nothing behind', async () => {
    const { container, root } = await mountForm();
    fill(container, PIN, PIN);
    expect(() => { act(() => { root.unmount(); }); }).not.toThrow();
    expect(container.innerHTML).toBe('');
    container.remove();
  });
});

describe('storage safety', () => {
  test('the PIN is never written to localStorage or sessionStorage', async () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem');
    const { container, root } = await mountForm();
    fill(container, PIN, PIN);
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
});
