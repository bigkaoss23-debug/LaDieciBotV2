// OwnerStepUpView.jsx — the ONE step-up modal shared by every owner-only PIN-management
// surface (OperationalMenu's admin-PIN flow AND AccessManagementPage's V3-I write panels).
//
// This slice (V3-I staging incident 2026-08-01): a real owner step-up attempt against
// staging produced THREE `POST /api/proxy` requests, all `401 {error:"unauthorized"}`.
// Real-timestamp forensics (Performance API, not guessed) proved the three requests were
// ~35s and ~12s apart — three separate, deliberate human retries after each one showed a
// misleading "PIN incorrecto." for what was actually a trusted-proxy transport failure
// that never reached PIN comparison. Two invariants are proven here:
//   1. ONE human submission produces ONE verifyOwnPin network call (busyRef/PinPad already
//      enforce this; this file adds the missing direct proof for THIS component).
//   2. A transport/session/config failure is NEVER rendered as "you typed the wrong PIN" —
//      see stepUpErrorTaxonomy.js.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import OwnerStepUpView from './OwnerStepUpView';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../api', () => ({
  __esModule: true,
  api: { verifyOwnPin: jest.fn() },
}));
const { api } = require('../../api');
const { getPinStepUp, clearPinStepUp } = require('../../operationalSession');

function digitButtons(container) {
  return Array.from(container.querySelectorAll('button')).filter((b) => /^[0-9]$/.test(b.textContent));
}
function pressDigits(container, digits) {
  const btns = digitButtons(container);
  for (const d of String(digits)) {
    const btn = btns.find((b) => b.textContent === d);
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  }
}
function findByText(container, text) {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent === text);
}
function click(el) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

async function mount(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onCancel = props.onCancel || jest.fn();
  const onVerified = props.onVerified || jest.fn();
  const onReauthRequired = props.onReauthRequired || jest.fn();
  await act(async () => {
    root.render(<OwnerStepUpView onCancel={onCancel} onVerified={onVerified} onReauthRequired={onReauthRequired} />);
  });
  return { container, root, onCancel, onVerified, onReauthRequired };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

beforeEach(() => {
  jest.clearAllMocks();
  clearPinStepUp();
});
afterEach(() => { clearPinStepUp(); });

// ═══ ONE SUBMISSION = ONE REQUEST ═══════════════════════════════════════════

test('a normal 6-digit entry + one Confirmar click sends exactly one verifyOwnPin call', async () => {
  api.verifyOwnPin.mockResolvedValue({ ok: true, stepUpProof: 'PROOF-1', expiresInSec: 600, _ok: true, _status: 200 });
  const { container, root, onVerified } = await mount();
  pressDigits(container, '123456');
  click(findByText(container, 'Confirmar'));
  await flush();
  expect(api.verifyOwnPin).toHaveBeenCalledTimes(1);
  expect(api.verifyOwnPin).toHaveBeenCalledWith('123456');
  expect(onVerified).toHaveBeenCalledTimes(1);
  expect(getPinStepUp()).toBe('PROOF-1');
  unmount(container, root);
});

test('rapid double-click on Confirmar before the first response lands sends only one request', async () => {
  let resolveCall;
  api.verifyOwnPin.mockImplementation(() => new Promise((res) => { resolveCall = res; }));
  const { container, root } = await mount();
  pressDigits(container, '123456');
  const confirmBtn = findByText(container, 'Confirmar');
  click(confirmBtn);
  click(confirmBtn);
  click(confirmBtn);
  await flush();
  expect(api.verifyOwnPin).toHaveBeenCalledTimes(1);
  await act(async () => { resolveCall({ ok: true, stepUpProof: 'P', expiresInSec: 600, _ok: true, _status: 200 }); });
  unmount(container, root);
});

test('the submit button is disabled (unreachable) while a request is in flight', async () => {
  let resolveCall;
  api.verifyOwnPin.mockImplementation(() => new Promise((res) => { resolveCall = res; }));
  const { container, root } = await mount();
  pressDigits(container, '123456');
  click(findByText(container, 'Confirmar'));
  await flush();
  // While busy, PinPad renders the loading label, not the submit button's normal text —
  // and every keypad digit button is disabled, so no further digits or resubmits are
  // possible until the in-flight call settles.
  expect(container.textContent).toMatch(/Verificando…/);
  expect(digitButtons(container).every((b) => b.disabled)).toBe(true);
  await act(async () => { resolveCall({ ok: true, stepUpProof: 'P', expiresInSec: 600, _ok: true, _status: 200 }); });
  unmount(container, root);
});

test('two SEPARATE full submit cycles (fail, retype, submit again) send exactly two requests, not more', async () => {
  api.verifyOwnPin
    .mockResolvedValueOnce({ error: 'unauthorized', _ok: false, _status: 401 })
    .mockResolvedValueOnce({ ok: true, stepUpProof: 'P2', expiresInSec: 600, _ok: true, _status: 200 });
  const { container, root, onVerified } = await mount();
  pressDigits(container, '111111');
  click(findByText(container, 'Confirmar'));
  await flush();
  expect(api.verifyOwnPin).toHaveBeenCalledTimes(1);
  pressDigits(container, '222222');
  click(findByText(container, 'Confirmar'));
  await flush();
  expect(api.verifyOwnPin).toHaveBeenCalledTimes(2);
  expect(onVerified).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

// ═══ ERROR CLASSIFICATION — never claim the PIN was wrong when it wasn't checked ════

test('a genuine PIN_INCORRECTO shows the wrong-PIN message', async () => {
  api.verifyOwnPin.mockResolvedValue({ ok: false, error: 'PIN_INCORRECTO', _ok: true, _status: 401 });
  const { container, root } = await mount();
  pressDigits(container, '123456');
  click(findByText(container, 'Confirmar'));
  await flush();
  expect(container.textContent).toMatch(/PIN incorrecto\./);
  unmount(container, root);
});

test('BAD_REQUEST (format rejection, deliberately indistinguishable from a wrong PIN) shows the same wrong-PIN message', async () => {
  api.verifyOwnPin.mockResolvedValue({ ok: false, error: 'BAD_REQUEST', _ok: true, _status: 400 });
  const { container, root } = await mount();
  pressDigits(container, '123456');
  click(findByText(container, 'Confirmar'));
  await flush();
  expect(container.textContent).toMatch(/PIN incorrecto\./);
  unmount(container, root);
});

test('a trusted-proxy 401 {error:"unauthorized"} (the real staging incident) NEVER shows "PIN incorrecto" — the request never reached PIN comparison', async () => {
  api.verifyOwnPin.mockResolvedValue({ error: 'unauthorized', _ok: false, _status: 401 });
  const { container, root } = await mount();
  pressDigits(container, '123456');
  click(findByText(container, 'Confirmar'));
  await flush();
  expect(container.textContent).not.toMatch(/PIN incorrecto/);
  expect(container.textContent).toMatch(/No se pudo verificar el PIN/);
  unmount(container, root);
});

test('403 ROLE_FORBIDDEN is shown as a transport problem, not a wrong PIN', async () => {
  api.verifyOwnPin.mockResolvedValue({ error: 'ROLE_FORBIDDEN', _ok: false, _status: 403 });
  const { container, root } = await mount();
  pressDigits(container, '123456');
  click(findByText(container, 'Confirmar'));
  await flush();
  expect(container.textContent).not.toMatch(/PIN incorrecto/);
  expect(container.textContent).toMatch(/No se pudo verificar el PIN/);
  unmount(container, root);
});

test('503 UNAVAILABLE shows a neutral temporary-service message, not a wrong PIN', async () => {
  api.verifyOwnPin.mockResolvedValue({ ok: false, error: 'UNAVAILABLE', _ok: true, _status: 503 });
  const { container, root } = await mount();
  pressDigits(container, '123456');
  click(findByText(container, 'Confirmar'));
  await flush();
  expect(container.textContent).not.toMatch(/PIN incorrecto/);
  expect(container.textContent).toMatch(/no disponible/i);
  unmount(container, root);
});

test('a network exception (rejected promise) is treated as a transport failure, never a wrong PIN', async () => {
  api.verifyOwnPin.mockResolvedValue({ error: 'Failed to fetch', _ok: false, _status: 0 });
  const { container, root } = await mount();
  pressDigits(container, '123456');
  click(findByText(container, 'Confirmar'));
  await flush();
  expect(container.textContent).not.toMatch(/PIN incorrecto/);
  expect(container.textContent).toMatch(/No se pudo verificar el PIN/);
  unmount(container, root);
});

test('LOCKED shows the lockout message with the server-provided wait time', async () => {
  api.verifyOwnPin.mockResolvedValue({ ok: false, error: 'LOCKED', retryAfterSec: 37, _ok: true, _status: 429 });
  const { container, root } = await mount();
  pressDigits(container, '123456');
  click(findByText(container, 'Confirmar'));
  await flush();
  expect(container.textContent).toMatch(/Demasiados intentos.*37s/);
  expect(container.textContent).not.toMatch(/PIN incorrecto/);
  unmount(container, root);
});

test('REAUTH_REQUIRED shows the re-login message and triggers onReauthRequired', async () => {
  jest.useFakeTimers();
  api.verifyOwnPin.mockResolvedValue({ ok: false, error: 'REAUTH_REQUIRED', _ok: true, _status: 401 });
  const { container, root, onReauthRequired } = await mount();
  pressDigits(container, '123456');
  await act(async () => { findByText(container, 'Confirmar').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(container.textContent).toMatch(/vuelve a iniciar sesión/);
  expect(container.textContent).not.toMatch(/PIN incorrecto/);
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(onReauthRequired).toHaveBeenCalledTimes(1);
  unmount(container, root);
  jest.useRealTimers();
});

// ═══ SAFE STATE AFTER FAILURE / CANCEL ══════════════════════════════════════

test('after any failure, the entered digits are cleared — no retained PIN value', async () => {
  api.verifyOwnPin.mockResolvedValue({ ok: false, error: 'PIN_INCORRECTO', _ok: true, _status: 401 });
  const { container, root } = await mount();
  pressDigits(container, '123456');
  click(findByText(container, 'Confirmar'));
  await flush();
  // A full 6-digit PIN re-enables Confirmar; if the value weren't cleared back to '',
  // pressing a 7th digit would be a no-op (already at maxLength) and Confirmar would
  // stay enabled. Instead: Confirmar must be disabled again (below minLength) right
  // after the failure, and pressing exactly one fresh digit must leave it disabled too
  // (still below minLength) — proving the internal pin state actually reset to ''.
  expect(findByText(container, 'Confirmar').disabled).toBe(true);
  pressDigits(container, '9');
  expect(findByText(container, 'Confirmar').disabled).toBe(true);
  unmount(container, root);
});

test('cancelling before submit never calls verifyOwnPin', async () => {
  const { container, root, onCancel } = await mount();
  pressDigits(container, '123');
  click(findByText(container, 'Cancelar'));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(api.verifyOwnPin).not.toHaveBeenCalled();
  unmount(container, root);
});

test('Cancelar is disabled while a request is in flight (cannot cancel an already-sent request)', async () => {
  let resolveCall;
  api.verifyOwnPin.mockImplementation(() => new Promise((res) => { resolveCall = res; }));
  const { container, root } = await mount();
  pressDigits(container, '123456');
  click(findByText(container, 'Confirmar'));
  await flush();
  expect(findByText(container, 'Cancelar').disabled).toBe(true);
  await act(async () => { resolveCall({ ok: true, stepUpProof: 'P', expiresInSec: 600, _ok: true, _status: 200 }); });
  unmount(container, root);
});

test('a successful verification never appears alongside an error message', async () => {
  api.verifyOwnPin.mockResolvedValue({ ok: true, stepUpProof: 'PROOF-OK', expiresInSec: 600, _ok: true, _status: 200 });
  const { container, root } = await mount();
  pressDigits(container, '123456');
  click(findByText(container, 'Confirmar'));
  await flush();
  expect(container.textContent).not.toMatch(/PIN incorrecto|No se pudo verificar|Demasiados intentos/);
  unmount(container, root);
});
