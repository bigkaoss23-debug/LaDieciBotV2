// S2-7D — session resume + idle auto-logout + tab-scoped storage.
// The account token is already in the tab's storage, so forcing a fresh login on every
// reload protected nothing; the real shared-device protections are (a) sessionStorage, so
// closing the tab ends the session, and (b) a 15-minute idle sign-out.
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
    ...helpers,
    accountSignUp: jest.fn(), accountSignIn: jest.fn(), accountRequestReset: jest.fn(),
    accountUpdatePassword: jest.fn(),
    accountSignOut: jest.fn(async () => {}),
    accountGetSession: jest.fn(async () => null),
    claimWorkspace: jest.fn(async () => ({ ok: true, body: { ok: true } })),
    fetchAccountMe: jest.fn(async () => ({ status: 200, ok: true, body: { emailVerified: true, memberships: [], workspaces: [] } })),
    setAdminPin: jest.fn(),
  };
});

import AccountApp from './AccountApp';
import { accountGetSession, accountSignOut, fetchAccountMe } from '../../account/accountApi';
import { IDLE_TIMEOUT_MS, shouldResumeSession } from '../../account/accountHelpers';

async function mountApp() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root;
  await act(async () => { root = createRoot(container); root.render(<AccountApp />); });
  return { container, root };
}

beforeEach(() => {
  // CRA sets resetMocks: true, so every implementation must be re-declared here.
  accountSignOut.mockResolvedValue(undefined);
  fetchAccountMe.mockResolvedValue({
    status: 200, ok: true,
    body: { emailVerified: true, memberships: [], workspaces: [] },
  });
  window.history.replaceState({}, '', '/cuenta');
});

describe('shouldResumeSession (pure)', () => {
  test('resumes only on the plain entry point with a session', () => {
    expect(shouldResumeSession('home', true)).toBe(true);
    expect(shouldResumeSession('home', false)).toBe(false);
  });
  test('never overrides an auth-callback landing', () => {
    ['recovery', 'confirmed', 'link_error'].forEach((v) => {
      expect(shouldResumeSession(v, true)).toBe(false);
    });
  });
});

describe('session resume on load', () => {
  test('with a valid session the account view is shown — no login form', async () => {
    accountGetSession.mockResolvedValue({ access_token: 'tok' });
    const { container, root } = await mountApp();
    expect(container.textContent).toContain('Mi cuenta');
    expect(container.textContent).not.toContain('Inicia sesión o crea una cuenta nueva.');
    expect(fetchAccountMe).toHaveBeenCalled();
    act(() => { root.unmount(); }); container.remove();
  });

  test('without a session the home view is kept', async () => {
    accountGetSession.mockResolvedValue(null);
    const { container, root } = await mountApp();
    expect(container.textContent).toContain('Inicia sesión o crea una cuenta nueva.');
    expect(container.textContent).not.toContain('Mi cuenta');
    act(() => { root.unmount(); }); container.remove();
  });

  test('a failing session lookup degrades to the home view (fail closed)', async () => {
    accountGetSession.mockRejectedValue(new Error('boom'));
    const { container, root } = await mountApp();
    expect(container.textContent).toContain('Inicia sesión o crea una cuenta nueva.');
    act(() => { root.unmount(); }); container.remove();
  });

  test('a recovery callback is NOT overridden by the resume', async () => {
    accountGetSession.mockResolvedValue({ access_token: 'tok' });
    window.history.replaceState({}, '', '/#type=recovery&access_token=x');
    const { container, root } = await mountApp();
    expect(container.textContent).toContain('Nueva contraseña');
    expect(container.textContent).not.toContain('Mi cuenta');
    act(() => { root.unmount(); }); container.remove();
  });
});

describe('idle auto-logout', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

  test('signs out after 15 minutes without interaction', async () => {
    accountGetSession.mockResolvedValue({ access_token: 'tok' });
    const { container, root } = await mountApp();
    expect(container.textContent).toContain('Mi cuenta');

    await act(async () => { jest.advanceTimersByTime(IDLE_TIMEOUT_MS + 1000); });
    expect(accountSignOut).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Sesión cerrada');
    expect(container.textContent).toContain('15 minutos sin actividad');
    act(() => { root.unmount(); }); container.remove();
  });

  test('interaction resets the countdown', async () => {
    accountGetSession.mockResolvedValue({ access_token: 'tok' });
    const { container, root } = await mountApp();

    await act(async () => { jest.advanceTimersByTime(IDLE_TIMEOUT_MS - 5000); });
    await act(async () => { window.dispatchEvent(new Event('pointerdown')); });
    await act(async () => { jest.advanceTimersByTime(IDLE_TIMEOUT_MS - 5000); });
    expect(accountSignOut).not.toHaveBeenCalled();   // timer restarted

    await act(async () => { jest.advanceTimersByTime(10000); });
    expect(accountSignOut).toHaveBeenCalledTimes(1);
    act(() => { root.unmount(); }); container.remove();
  });

  test('no idle timer runs while signed out', async () => {
    accountGetSession.mockResolvedValue(null);
    const { container, root } = await mountApp();
    await act(async () => { jest.advanceTimersByTime(IDLE_TIMEOUT_MS * 3); });
    expect(accountSignOut).not.toHaveBeenCalled();
    act(() => { root.unmount(); }); container.remove();
  });

  test('the timeout is 15 minutes', () => {
    expect(IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000);
  });
});
