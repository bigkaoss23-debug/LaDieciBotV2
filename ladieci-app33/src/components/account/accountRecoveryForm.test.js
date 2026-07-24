// S2-7C2 — component tests for the recovery form: the show/hide toggle must
// preserve the entered value, and submit must use the CURRENT field value.
// Uses react-dom + react-dom/test-utils (no @testing-library dependency).
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

// React 18 requires this flag for manual act() with createRoot to flush updates.
global.IS_REACT_ACT_ENVIRONMENT = true;

// Avoid loading @supabase/supabase-js in tests.
jest.mock('../../account/supabaseAccountClient', () => ({
  ACCOUNT_REDIRECT_URL: 'https://ladieci-v1-staging.netlify.app',
  getAccountClient: () => ({
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  }),
}));

// Real pure helpers (from accountHelpers, no supabase); network fns are mocks.
jest.mock('../../account/accountApi', () => {
  const helpers = jest.requireActual('../../account/accountHelpers');
  return {
    __esModule: true,
    PASSWORD_MIN: helpers.PASSWORD_MIN,
    PASSWORD_POLICY_MESSAGE: helpers.PASSWORD_POLICY_MESSAGE,
    validateNewPassword: helpers.validateNewPassword,
    validatePassword: helpers.validatePassword,
    validateEmail: helpers.validateEmail,
    parseAuthCallback: helpers.parseAuthCallback,
    summarizeAccount: helpers.summarizeAccount,
    accountUpdatePassword: jest.fn(async () => ({ data: {}, error: null })),
    accountSignOut: jest.fn(async () => {}),
    accountSignUp: jest.fn(async () => ({ data: {}, error: null })),
    accountSignIn: jest.fn(async () => ({ data: {}, error: null })),
    accountRequestReset: jest.fn(async () => ({ data: {}, error: null })),
    fetchAccountMe: jest.fn(async () => ({ status: 200, ok: true, body: {} })),
    accountGetSession: jest.fn(async () => null),
  };
});

import { PasswordField, RecoveryView } from './AccountApp';
import { accountUpdatePassword, accountSignOut } from '../../account/accountApi';

// Set a controlled input's value the way a real user would (native setter +
// input event), so React's onChange updates state.
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function mount(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root;
  act(() => { root = createRoot(container); root.render(element); });
  return { container, root };
}

describe('PasswordField show/hide toggle', () => {
  test('preserves the entered value and flips only this field', () => {
    function Harness() {
      const [v, setV] = useState('');
      return <PasswordField id="t" label="Contraseña" value={v} autoComplete="new-password" onChange={(e) => setV(e.target.value)} />;
    }
    const { container, root } = mount(<Harness />);
    const input = container.querySelector('input');
    const toggle = container.querySelector('button');

    expect(input.type).toBe('password'); // default hidden
    act(() => { typeInto(input, 'Abcdefgh1234'); });
    expect(input.value).toBe('Abcdefgh1234');

    act(() => { toggle.click(); });
    expect(input.type).toBe('text');
    expect(input.value).toBe('Abcdefgh1234'); // value NOT reset/altered by toggle

    act(() => { toggle.click(); });
    expect(input.type).toBe('password');
    expect(input.value).toBe('Abcdefgh1234');

    act(() => { root.unmount(); });
    container.remove();
  });
});

describe('RecoveryView submit', () => {
  beforeEach(() => {
    accountUpdatePassword.mockReset();
    accountUpdatePassword.mockResolvedValue({ data: {}, error: null });
    accountSignOut.mockReset();
    accountSignOut.mockResolvedValue(undefined);
  });

  test('calls updateUser with the CURRENT field value when both match', async () => {
    const { container, root } = mount(<RecoveryView setView={() => {}} />);
    const inputs = container.querySelectorAll('input'); // [new password, confirm]
    act(() => { typeInto(inputs[0], 'Abcdefgh1234'); });
    act(() => { typeInto(inputs[1], 'Abcdefgh1234'); });

    const submit = container.querySelector('button[type="submit"]');
    await act(async () => { submit.click(); });

    expect(accountUpdatePassword).toHaveBeenCalledTimes(1);
    expect(accountUpdatePassword).toHaveBeenCalledWith('Abcdefgh1234');

    act(() => { root.unmount(); });
    container.remove();
  });

  test('confirmation mismatch: shows the mismatch message and never calls updateUser', async () => {
    const { container, root } = mount(<RecoveryView setView={() => {}} />);
    const inputs = container.querySelectorAll('input');
    act(() => { typeInto(inputs[0], 'Abcdefgh1234'); });
    act(() => { typeInto(inputs[1], 'Abcdefgh9999'); });

    const submit = container.querySelector('button[type="submit"]');
    await act(async () => { submit.click(); });

    expect(accountUpdatePassword).not.toHaveBeenCalled();
    expect(container.textContent).toContain('no coinciden');

    act(() => { root.unmount(); });
    container.remove();
  });
});
