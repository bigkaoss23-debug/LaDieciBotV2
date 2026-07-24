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

test('renders the PIN form when the server requires setup (numeric inputs)', async () => {
  fetchAccountMe.mockResolvedValue({ status: 200, ok: true, body: OWNER_ME });
  const { container, root } = await mountAsync(<AdminPinView setView={() => {}} />);
  expect(container.textContent).toContain('Crear PIN de administrador');
  const inputs = container.querySelectorAll('input');
  expect(inputs.length).toBe(2);
  expect(inputs[0].getAttribute('inputmode')).toBe('numeric');
  act(() => { root.unmount(); }); container.remove();
});

test('submits the CURRENT valid PIN to the owner workspace id and shows success', async () => {
  fetchAccountMe.mockResolvedValue({ status: 200, ok: true, body: OWNER_ME });
  setAdminPin.mockResolvedValue({ status: 200, ok: true, body: { ok: true, event: 'pin_set' } });
  const { container, root } = await mountAsync(<AdminPinView setView={() => {}} />);
  const inputs = container.querySelectorAll('input');
  act(() => { typeInto(inputs[0], '903421756'); });
  act(() => { typeInto(inputs[1], '903421756'); });
  const submit = container.querySelector('button[type="submit"]');
  await act(async () => { submit.click(); });

  expect(setAdminPin).toHaveBeenCalledTimes(1);
  expect(setAdminPin).toHaveBeenCalledWith('ws1', '903421756');
  expect(container.textContent).toContain('PIN de administrador listo');
  expect(container.textContent).not.toContain('903421756'); // never echoed
  act(() => { root.unmount(); }); container.remove();
});

test('mismatch shows the mismatch message and never calls the API', async () => {
  fetchAccountMe.mockResolvedValue({ status: 200, ok: true, body: OWNER_ME });
  const { container, root } = await mountAsync(<AdminPinView setView={() => {}} />);
  const inputs = container.querySelectorAll('input');
  act(() => { typeInto(inputs[0], '903421756'); });
  act(() => { typeInto(inputs[1], '903421999'); });
  await act(async () => { container.querySelector('button[type="submit"]').click(); });
  expect(setAdminPin).not.toHaveBeenCalled();
  expect(container.textContent).toContain('no coinciden');
  act(() => { root.unmount(); }); container.remove();
});

test('too-short PIN rejected client-side (no API call)', async () => {
  fetchAccountMe.mockResolvedValue({ status: 200, ok: true, body: OWNER_ME });
  const { container, root } = await mountAsync(<AdminPinView setView={() => {}} />);
  const inputs = container.querySelectorAll('input');
  act(() => { typeInto(inputs[0], '123456'); });
  act(() => { typeInto(inputs[1], '123456'); });
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
  const inputs = container.querySelectorAll('input');
  act(() => { typeInto(inputs[0], '903421756'); });
  act(() => { typeInto(inputs[1], '903421756'); });
  await act(async () => { container.querySelector('button[type="submit"]').click(); });
  expect(container.textContent).toContain('No se pudo guardar el PIN');
  expect(container.textContent).not.toContain('903421756');
  act(() => { root.unmount(); }); container.remove();
});
