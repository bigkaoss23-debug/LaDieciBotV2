// S2-7D — component tests for the admin-PIN onboarding view: it renders only when the
// server says setup is required, validates the PIN pair, submits the CURRENT value,
// guards double-submit, and never surfaces the entered PIN after success.
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
    ADMIN_PIN_MISMATCH_MESSAGE: helpers.ADMIN_PIN_MISMATCH_MESSAGE,
    validateAdminPin: helpers.validateAdminPin,
    validateWordPin: helpers.validateWordPin,
    wordPinMessage: helpers.wordPinMessage,
    wordToPin: helpers.wordToPin,
    T9_MAP: helpers.T9_MAP,
    WORD_PIN_LENGTH_MESSAGE: helpers.WORD_PIN_LENGTH_MESSAGE,
    WORD_PIN_UNSUPPORTED_MESSAGE: helpers.WORD_PIN_UNSUPPORTED_MESSAGE,
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

beforeEach(() => {
  fetchAccountMe.mockReset();
  setAdminPin.mockReset();
});

test('renders the PIN form when the server requires setup (numeric input + keypad)', async () => {
  fetchAccountMe.mockResolvedValue({ status: 200, ok: true, body: OWNER_ME });
  const { container, root } = await mountAsync(<AdminPinView setView={() => {}} />);
  expect(container.textContent).toContain('Crear PIN de administrador');
  const input = container.querySelector('#ap-pin');
  expect(input.getAttribute('inputmode')).toBe('numeric');
  expect(container.querySelector('.ld-acc-keypad')).toBeTruthy(); // not keyboard-only
  act(() => { root.unmount(); }); container.remove();
});

test('submits the CURRENT valid PIN to the owner workspace id and shows success', async () => {
  fetchAccountMe.mockResolvedValue({ status: 200, ok: true, body: OWNER_ME });
  setAdminPin.mockResolvedValue({ status: 200, ok: true, body: { ok: true, event: 'pin_set' } });
  const { container, root } = await mountAsync(<AdminPinView setView={() => {}} />);
  act(() => { typeInto(container.querySelector('#ap-pin'), '903421756'); });
  await act(async () => { container.querySelector('button[type="submit"]').click(); }); // Continuar
  act(() => { typeInto(container.querySelector('#ap-pin'), '903421756'); });            // confirm step
  await act(async () => { container.querySelector('button[type="submit"]').click(); });

  expect(setAdminPin).toHaveBeenCalledTimes(1);
  expect(setAdminPin).toHaveBeenCalledWith('ws1', '903421756');
  expect(container.textContent).toContain('PIN de administrador listo');
  expect(container.textContent).not.toContain('903421756'); // never echoed
  act(() => { root.unmount(); }); container.remove();
});

test('mismatch shows the mismatch message and never calls the API', async () => {
  fetchAccountMe.mockResolvedValue({ status: 200, ok: true, body: OWNER_ME });
  const { container, root } = await mountAsync(<AdminPinView setView={() => {}} />);
  act(() => { typeInto(container.querySelector('#ap-pin'), '903421756'); });
  await act(async () => { container.querySelector('button[type="submit"]').click(); });
  act(() => { typeInto(container.querySelector('#ap-pin'), '903421999'); });
  await act(async () => { container.querySelector('button[type="submit"]').click(); });
  expect(setAdminPin).not.toHaveBeenCalled();
  expect(container.textContent).toContain('no coinciden');
  act(() => { root.unmount(); }); container.remove();
});

test('too-short PIN rejected client-side (no API call)', async () => {
  fetchAccountMe.mockResolvedValue({ status: 200, ok: true, body: OWNER_ME });
  const { container, root } = await mountAsync(<AdminPinView setView={() => {}} />);
  act(() => { typeInto(container.querySelector('#ap-pin'), '123456'); });
  await act(async () => { container.querySelector('button[type="submit"]').click(); });
  expect(setAdminPin).not.toHaveBeenCalled();
  act(() => { root.unmount(); }); container.remove();
});

test('when server says setup NOT required, shows the ready state (no form)', async () => {
  fetchAccountMe.mockResolvedValue({ status: 200, ok: true, body: { ...OWNER_ME, adminPinSetupRequired: false } });
  const { container, root } = await mountAsync(<AdminPinView setView={() => {}} />);
  expect(container.textContent).toContain('PIN de administrador listo');
  expect(container.querySelector('button[type="submit"]')).toBe(null);
  act(() => { root.unmount(); }); container.remove();
});

test('server rejection shows a neutral error (no oracle)', async () => {
  fetchAccountMe.mockResolvedValue({ status: 200, ok: true, body: OWNER_ME });
  setAdminPin.mockResolvedValue({ status: 400, ok: false, body: { error: 'admin_pin_rejected' } });
  const { container, root } = await mountAsync(<AdminPinView setView={() => {}} />);
  act(() => { typeInto(container.querySelector('#ap-pin'), '903421756'); });
  await act(async () => { container.querySelector('button[type="submit"]').click(); });
  act(() => { typeInto(container.querySelector('#ap-pin'), '903421756'); });
  await act(async () => { container.querySelector('button[type="submit"]').click(); });
  expect(container.textContent).toContain('No se pudo guardar el PIN');
  act(() => { root.unmount(); }); container.remove();
});


// ── S2-7D T9 / keypad UI ────────────────────────────────────────────────────
const btnByLabel = (c, label) =>
  Array.from(c.querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') || '') === label);
const btnByText = (c, text) =>
  Array.from(c.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === text);

async function mountForm() {
  fetchAccountMe.mockResolvedValue({ status: 200, ok: true, body: OWNER_ME });
  return mountAsync(<AdminPinView setView={() => {}} />);
}

describe('S2-7D on-screen numeric keypad', () => {
  test('renders all digits plus Borrar and Limpiar', async () => {
    const { container, root } = await mountForm();
    for (let d = 0; d <= 9; d++) expect(btnByLabel(container, String(d))).toBeTruthy();
    expect(btnByLabel(container, 'Borrar')).toBeTruthy();
    expect(btnByLabel(container, 'Limpiar')).toBeTruthy();
    act(() => { root.unmount(); }); container.remove();
  });

  test('digits append, Borrar removes the last, Limpiar empties; length indicator tracks', async () => {
    const { container, root } = await mountForm();
    const input = container.querySelector('#ap-pin');
    act(() => { btnByLabel(container, '9').click(); });
    act(() => { btnByLabel(container, '0').click(); });
    act(() => { btnByLabel(container, '3').click(); });
    expect(input.value).toBe('903');
    expect(container.querySelector('[data-testid="pin-length"]').textContent).toContain('3 dígitos');
    act(() => { btnByLabel(container, 'Borrar').click(); });
    expect(input.value).toBe('90');
    act(() => { btnByLabel(container, 'Limpiar').click(); });
    expect(input.value).toBe('');
    expect(container.querySelector('[data-testid="pin-length"]').textContent).toContain('0 dígitos');
    act(() => { root.unmount(); }); container.remove();
  });

  test('physical keyboard still works and non-digits are filtered', async () => {
    const { container, root } = await mountForm();
    const input = container.querySelector('#ap-pin');
    act(() => { typeInto(input, '903421756'); });
    expect(input.value).toBe('903421756');
    act(() => { typeInto(input, '90ab34-21x756'); });
    expect(input.value).toBe('903421756');
    act(() => { root.unmount(); }); container.remove();
  });

  test('two-step confirmation: mismatch shows the Spanish message, no API call', async () => {
    const { container, root } = await mountForm();
    act(() => { typeInto(container.querySelector('#ap-pin'), '903421756'); });
    await act(async () => { container.querySelector('button[type="submit"]').click(); }); // Continuar
    expect(container.textContent).toContain('Confirmar PIN');
    act(() => { typeInto(container.querySelector('#ap-pin'), '903421999'); });
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).not.toHaveBeenCalled();
    expect(container.textContent).toContain('no coinciden');
    act(() => { root.unmount(); }); container.remove();
  });

  test('matching two-step entry submits the numeric PIN once', async () => {
    setAdminPin.mockResolvedValue({ status: 200, ok: true, body: { ok: true, event: 'pin_set' } });
    const { container, root } = await mountForm();
    act(() => { typeInto(container.querySelector('#ap-pin'), '903421756'); });
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    act(() => { btnByLabel(container, '9').click(); });
    act(() => { typeInto(container.querySelector('#ap-pin'), '903421756'); });
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).toHaveBeenCalledTimes(1);
    expect(setAdminPin).toHaveBeenCalledWith('ws1', '903421756');
    expect(container.textContent).toContain('PIN de administrador listo');
    act(() => { root.unmount(); }); container.remove();
  });

  test('weak PIN blocked at step 1 (never reaches confirmation)', async () => {
    const { container, root } = await mountForm();
    act(() => { typeInto(container.querySelector('#ap-pin'), '123456789') });
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(container.textContent).not.toContain('Confirmar PIN');
    expect(setAdminPin).not.toHaveBeenCalled();
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('S2-7D generate PIN from a memorable word', () => {
  const toWordMode = (c) => act(() => { btnByText(c, 'Generar PIN a partir de una palabra').click(); });

  test('word converts locally and the generated PIN is masked by default', async () => {
    const { container, root } = await mountForm();
    toWordMode(container);
    act(() => { typeInto(container.querySelector('#ap-word'), 'margarita'); });
    const preview = container.querySelector('[data-testid="word-pin-preview"]');
    expect(preview.textContent).toContain('9 dígitos');
    expect(preview.textContent).not.toContain('627427482');   // masked
    expect(container.querySelector('#ap-word').type).toBe('password');
    act(() => { root.unmount(); }); container.remove();
  });

  test('Mostrar reveals the generated PIN temporarily, Ocultar hides it again', async () => {
    const { container, root } = await mountForm();
    toWordMode(container);
    act(() => { typeInto(container.querySelector('#ap-word'), 'margarita'); });
    act(() => { btnByText(container, 'Mostrar').click(); });
    expect(container.querySelector('[data-testid="word-pin-preview"]').textContent).toContain('627427482');
    act(() => { btnByText(container, 'Ocultar').click(); });
    expect(container.querySelector('[data-testid="word-pin-preview"]').textContent).not.toContain('627427482');
    act(() => { root.unmount(); }); container.remove();
  });

  test('submits ONLY the numeric PIN — the word is absent from the API payload', async () => {
    setAdminPin.mockResolvedValue({ status: 200, ok: true, body: { ok: true, event: 'pin_set' } });
    const { container, root } = await mountForm();
    toWordMode(container);
    act(() => { typeInto(container.querySelector('#ap-word'), 'margarita'); });
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).toHaveBeenCalledTimes(1);
    expect(setAdminPin).toHaveBeenCalledWith('ws1', '627427482');
    const payload = JSON.stringify(setAdminPin.mock.calls[0]);
    expect(payload).not.toContain('margarita');
    expect(payload).not.toContain('MARGARITA');
    act(() => { root.unmount(); }); container.remove();
  });

  test('the word is cleared after a successful submission (not shown anywhere)', async () => {
    setAdminPin.mockResolvedValue({ status: 200, ok: true, body: { ok: true, event: 'pin_set' } });
    const { container, root } = await mountForm();
    toWordMode(container);
    act(() => { typeInto(container.querySelector('#ap-word'), 'margarita'); });
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(container.textContent).toContain('PIN de administrador listo');
    expect(container.textContent).not.toContain('margarita');
    expect(container.querySelector('#ap-word')).toBe(null);
    expect(container.innerHTML).not.toContain('627427482');
    act(() => { root.unmount(); }); container.remove();
  });

  test('switching modes clears the word', async () => {
    const { container, root } = await mountForm();
    toWordMode(container);
    act(() => { typeInto(container.querySelector('#ap-word'), 'margarita'); });
    act(() => { btnByText(container, 'Teclado numérico').click(); });
    toWordMode(container);
    expect(container.querySelector('#ap-word').value).toBe('');
    act(() => { root.unmount(); }); container.remove();
  });

  test('too-short generated PIN rejected with the length message, no API call', async () => {
    const { container, root } = await mountForm();
    toWordMode(container);
    act(() => { typeInto(container.querySelector('#ap-word'), 'pizza'); });
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).not.toHaveBeenCalled();
    expect(container.textContent).toContain('entre 9 y 12 dígitos');
    act(() => { root.unmount(); }); container.remove();
  });

  test('too-long generated PIN rejected with the length message', async () => {
    const { container, root } = await mountForm();
    toWordMode(container);
    act(() => { typeInto(container.querySelector('#ap-word'), 'extraordinario'); });
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).not.toHaveBeenCalled();
    expect(container.textContent).toContain('entre 9 y 12 dígitos');
    act(() => { root.unmount(); }); container.remove();
  });

  test('unsupported characters rejected with their own message', async () => {
    const { container, root } = await mountForm();
    toWordMode(container);
    act(() => { typeInto(container.querySelector('#ap-word'), 'margarita!'); });
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(setAdminPin).not.toHaveBeenCalled();
    expect(container.textContent).toContain('caracteres no compatibles');
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('S2-7D storage safety', () => {
  test('neither mode writes to localStorage or sessionStorage', async () => {
    const ls = jest.spyOn(Storage.prototype, 'setItem');
    setAdminPin.mockResolvedValue({ status: 200, ok: true, body: { ok: true, event: 'pin_set' } });
    const { container, root } = await mountForm();
    act(() => { typeInto(container.querySelector('#ap-pin'), '903421756'); });
    act(() => { btnByLabel(container, '9').click(); });
    act(() => { btnByText(container, 'Generar PIN a partir de una palabra').click(); });
    act(() => { typeInto(container.querySelector('#ap-word'), 'margarita'); });
    await act(async () => { container.querySelector('button[type="submit"]').click(); });
    expect(ls).not.toHaveBeenCalled();
    act(() => { root.unmount(); }); container.remove();
    ls.mockRestore();
  });
});
