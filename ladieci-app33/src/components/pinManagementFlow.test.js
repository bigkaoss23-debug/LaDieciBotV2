// S2-7D6E4/S2-7D6E5 — in-app PIN management step-up flow.
//
// Contract under test (approved by the owner):
//  1. clicking "Gestionar PIN" never navigates away and never logs the operator out;
//  2. an inline step-up modal appears first ("Confirma tu identidad para gestionar los PIN"),
//     rendered through the canonical PinPad — never a plain text input;
//  3. the step-up proof returned by verifyOwnPin is held ONLY in memory (never any Storage);
//  4. after a valid step-up, rider/operator/owner PIN changes go through setActorPin, entered
//     as TWO SEPARATE PinPad screens (new PIN, then confirm) — never both on one screen;
//  5. changing the OWNER'S OWN PIN shows a distinct "log in again" screen and DOES call
//     onLogout; changing another actor's PIN does NOT;
//  6. errors (wrong PIN, locked, weak new PIN, mismatched confirm, save failure) are shown
//     inline on the pad, never a false success, and never leave a device keyboard exposed;
//  7. the save button is double-click-protected.
//
// react-dom + react-dom/test-utils, same house style as
// src/components/account/adminPinForm.test.js — no @testing-library dependency.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../api', () => {
  const auth = {
    isAuthenticated: jest.fn(() => true),
    getActor: jest.fn(() => 'owner'),
    getRole: jest.fn(() => 'admin'),
    getToken: jest.fn(() => 'fake-token'),
  };
  const api = {
    verifyOwnPin: jest.fn(),
    setActorPin: jest.fn(),
    getAuthActors: jest.fn(),
  };
  return { __esModule: true, auth, api };
});

const { auth, api } = require('../api');
const { getPinStepUp, clearPinStepUp } = require('../operationalSession');
const OperationalMenu = require('./OperationalMenu').default;

function pressDigits(container, digits) {
  const btns = Array.from(container.querySelectorAll('button')).filter((b) => /^[0-9]$/.test(b.textContent));
  for (const d of String(digits)) {
    const btn = btns.find((b) => b.textContent === d);
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  }
}
function selectValue(select, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => {
    setter.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
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
  const onLogout = props.onLogout || jest.fn();
  await act(async () => { root.render(<OperationalMenu onLogout={onLogout} />); });
  return { container, root, onLogout };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

const ACTORS_OK = [
  { actor: 'owner', role: 'admin', active: true },
  { actor: 'operator_primary', role: 'operator', active: true },
  { actor: 'rider', role: 'rider', active: true },
];

beforeEach(() => {
  clearPinStepUp();
  jest.clearAllMocks();
  auth.isAuthenticated.mockReturnValue(true);
  auth.getActor.mockReturnValue('owner');
  auth.getRole.mockReturnValue('admin');
  delete window.location;
  window.location = { assign: jest.fn(), pathname: '/', href: 'http://localhost/' };
});

test('clicking Gestionar PIN never navigates and never logs out', async () => {
  const { container, root, onLogout } = await mount();
  click(container.querySelector('button[aria-haspopup="menu"]'));
  const menuBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Gestionar PIN de administrador');
  expect(menuBtn).toBeTruthy();
  click(menuBtn);
  await flush();
  expect(window.location.assign).not.toHaveBeenCalled();
  expect(onLogout).not.toHaveBeenCalled();
  expect(container.textContent).toMatch(/Confirma tu identidad para gestionar los PIN/);
  expect(container.textContent).not.toMatch(/Introduce el PIN del operador/);
  unmount(container, root);
});

test('the step-up confirmation renders through the canonical PinPad, never a plain text input', async () => {
  const { container, root } = await mount();
  click(container.querySelector('button[aria-haspopup="menu"]'));
  click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Gestionar PIN de administrador'));
  await flush();
  expect(container.querySelector('input')).toBeNull();
  expect(container.querySelectorAll('[data-testid="pinpad-dots"]').length).toBe(1);
  expect(container.querySelector('select')).toBeNull();
  unmount(container, root);
});

async function openStepUp(container) {
  click(container.querySelector('button[aria-haspopup="menu"]'));
  click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Gestionar PIN de administrador'));
  await flush();
}

test('wrong PIN shows an inline error on the pad and stays in the modal — real staging defect, now fixed', async () => {
  // S2-7D6E6 — this is the exact shape the real backend returned during the rider smoke
  // (HTTP 401, body {ok:false, error:"PIN_INCORRECTO"}) that used to force a full logout
  // before this component ever saw the response. api.js itself no longer does that (see
  // apiAuthLogoutScope.test.js); this test pins the component-level contract: same modal
  // instance, empty pad, owner still authenticated (onLogout never called).
  api.verifyOwnPin.mockResolvedValue({ ok: false, error: 'PIN_INCORRECTO', _ok: true, _status: 401 });
  const { container, root, onLogout } = await mount();
  await openStepUp(container);
  pressDigits(container, '284917563');
  click(findByText(container, 'Confirmar'));
  await flush();
  expect(container.textContent).toMatch(/PIN incorrecto/);
  expect(container.querySelector('select')).toBeNull(); // still on step-up, not actor-list
  // The pad pads its dot count up to the 6..12 login range even when empty (see
  // PinPad.test.js "dot count grows past minLength"), so "emptied" means exactly 6 dots —
  // not 9, the length of the PIN just rejected.
  expect(container.querySelectorAll('[data-testid="pinpad-dots"] > div').length).toBe(6);
  expect(getPinStepUp()).toBeNull();
  expect(onLogout).not.toHaveBeenCalled(); // owner stays authenticated — the "Impostazioni" menu stays reachable
  // The step-up modal (and thus the pad) is still mounted — a real logout would have
  // unmounted the whole OperationalMenu tree (it returns null when !authed).
  expect(container.querySelectorAll('[data-testid="pinpad-dots"]').length).toBe(1);
  unmount(container, root);
});

test('a locked owner shows a lockout-specific message, not the generic one', async () => {
  api.verifyOwnPin.mockResolvedValue({ ok: false, error: 'LOCKED', retryAfterSec: 37, _ok: true, _status: 429 });
  const { container, root } = await mount();
  await openStepUp(container);
  pressDigits(container, '284917563');
  click(findByText(container, 'Confirmar'));
  await flush();
  expect(container.textContent).toMatch(/37s/);
  expect(container.textContent).not.toMatch(/^PIN incorrecto\.$/m);
  unmount(container, root);
});

test('a session with no per-login sid shows a clear message THEN logs out — never silently', async () => {
  // Backend contract: a token signed before the sid fix has no way to ever obtain or use a
  // step-up proof. The distinct REAUTH_REQUIRED code (never the generic "PIN incorrecto")
  // must be surfaced clearly — the operator must SEE why before the forced logout, same
  // 1.4s explain-then-act pattern as the save-failure re-ask below — never an instant,
  // unexplained kick-out.
  jest.useFakeTimers();
  api.verifyOwnPin.mockResolvedValue({ ok: false, error: 'REAUTH_REQUIRED', _ok: true, _status: 401 });
  const { container, root, onLogout } = await mount();
  await openStepUp(container);
  pressDigits(container, '284917563');
  click(findByText(container, 'Confirmar'));
  await flush();

  expect(container.textContent).toMatch(/Por seguridad, vuelve a iniciar sesión para gestionar los PIN\./);
  expect(onLogout).not.toHaveBeenCalled(); // not yet — the message must be readable first

  act(() => { jest.advanceTimersByTime(1500); });
  await flush();
  expect(onLogout).toHaveBeenCalledTimes(1);
  expect(getPinStepUp()).toBeNull();
  jest.useRealTimers();
  unmount(container, root);
});

test('correct PIN reveals actor selection and stores the proof only in memory', async () => {
  const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
  api.verifyOwnPin.mockResolvedValue({ ok: true, stepUpProof: 'PROOF-XYZ', expiresInSec: 600, _ok: true, _status: 200 });
  api.getAuthActors.mockResolvedValue(ACTORS_OK);
  const { container, root } = await mount();
  await openStepUp(container);
  pressDigits(container, '284917563');
  click(findByText(container, 'Confirmar'));
  await flush();

  expect(container.textContent).toMatch(/Gestión de PIN/);
  expect(container.querySelector('select')).toBeTruthy();
  expect(getPinStepUp()).toBe('PROOF-XYZ');
  expect(setItemSpy).not.toHaveBeenCalled();
  setItemSpy.mockRestore();
  unmount(container, root);
});

async function reachManage(container, { proof = 'PROOF-XYZ' } = {}) {
  api.verifyOwnPin.mockResolvedValue({ ok: true, stepUpProof: proof, expiresInSec: 600, _ok: true, _status: 200 });
  api.getAuthActors.mockResolvedValue(ACTORS_OK);
  await openStepUp(container);
  pressDigits(container, '284917563');
  click(findByText(container, 'Confirmar'));
  await flush();
}

// Selects the target actor (and ticks the owner-ack checkbox if needed), then advances
// past the select screen onto the "Nuevo PIN" pad.
async function selectTargetAndContinue(container, target, { ack = false } = {}) {
  selectValue(container.querySelector('select'), target);
  if (ack) click(container.querySelector('input[type="checkbox"]'));
  await flush();
  click(findByText(container, 'Continuar'));
  await flush();
}

test('rider PIN change: two matching new PINs across two separate pad screens, save, success', async () => {
  api.setActorPin.mockResolvedValue({ ok: true, actor: 'rider', selfChanged: false, _ok: true, _status: 200 });
  const { container, root, onLogout } = await mount();
  await reachManage(container);

  await selectTargetAndContinue(container, 'rider');
  expect(container.textContent).toMatch(/Nuevo PIN del repartidor/);
  expect(container.querySelector('select')).toBeNull(); // one pad screen at a time

  pressDigits(container, '284739');
  click(findByText(container, 'Continuar'));
  await flush();

  expect(container.textContent).toMatch(/Confirma el nuevo PIN/);
  pressDigits(container, '284739');
  const saveBtn = findByText(container, 'Guardar');
  expect(saveBtn.disabled).toBe(false);
  click(saveBtn);
  await flush();

  expect(api.setActorPin).toHaveBeenCalledWith(expect.objectContaining({
    targetActor: 'rider', newPin: '284739', stepUpProof: 'PROOF-XYZ',
  }));
  expect(container.textContent).toMatch(/PIN de .* actualizado/);
  expect(onLogout).not.toHaveBeenCalled();
  unmount(container, root);
});

test('a weak/trivial new PIN is rejected on the FIRST pad screen, before reaching confirm', async () => {
  const { container, root } = await mount();
  await reachManage(container);
  await selectTargetAndContinue(container, 'rider');
  pressDigits(container, '123456'); // sequential — trivial
  click(findByText(container, 'Continuar'));
  await flush();
  expect(container.textContent).toMatch(/Nuevo PIN del repartidor/); // still on screen 1
  expect(container.textContent).not.toMatch(/Confirma el nuevo PIN/);
  expect(container.textContent).toMatch(/previsibles/i);
  unmount(container, root);
});

test('mismatched confirmation shows an error and repeats the confirm step (not a restart)', async () => {
  const { container, root } = await mount();
  await reachManage(container);
  await selectTargetAndContinue(container, 'rider');
  pressDigits(container, '284739');
  click(findByText(container, 'Continuar'));
  await flush();

  expect(container.textContent).toMatch(/Confirma el nuevo PIN/);
  pressDigits(container, '111739'); // different from the first PIN
  click(findByText(container, 'Guardar'));
  await flush();

  // Still on the confirm screen ("repeat confirmation"), not bounced back to actor select.
  expect(container.textContent).toMatch(/Confirma el nuevo PIN/);
  expect(container.textContent).toMatch(/no coinciden/i);
  expect(api.setActorPin).not.toHaveBeenCalled();

  // Retry with the matching confirmation now succeeds.
  api.setActorPin.mockResolvedValue({ ok: true, actor: 'rider', selfChanged: false, _ok: true, _status: 200 });
  pressDigits(container, '284739');
  click(findByText(container, 'Guardar'));
  await flush();
  expect(api.setActorPin).toHaveBeenCalledWith(expect.objectContaining({ newPin: '284739' }));
  unmount(container, root);
});

test('owner self PIN change: Continuar is blocked until the explicit checkbox is ticked', async () => {
  const { container, root } = await mount();
  await reachManage(container);
  selectValue(container.querySelector('select'), 'owner');
  await flush();
  expect(findByText(container, 'Continuar').disabled).toBe(true); // checkbox not ticked yet
  click(container.querySelector('input[type="checkbox"]'));
  await flush();
  expect(findByText(container, 'Continuar').disabled).toBe(false);
  unmount(container, root);
});

test('owner self PIN change succeeds -> shows re-login screen and calls onLogout only then', async () => {
  api.setActorPin.mockResolvedValue({ ok: true, actor: 'owner', selfChanged: true, _ok: true, _status: 200 });
  const { container, root, onLogout } = await mount();
  await reachManage(container);
  await selectTargetAndContinue(container, 'owner', { ack: true });
  expect(container.textContent).toMatch(/Nuevo PIN del propietario/);

  pressDigits(container, '284739');
  click(findByText(container, 'Continuar'));
  await flush();
  pressDigits(container, '284739');
  click(findByText(container, 'Guardar'));
  await flush();

  expect(api.setActorPin).toHaveBeenCalledWith(expect.objectContaining({
    targetActor: 'owner', confirmation: 'CHANGE_OWNER_PIN',
  }));
  expect(container.textContent).toMatch(/PIN modificado/);
  expect(container.textContent).toMatch(/Accede nuevamente con el nuevo PIN/);
  expect(onLogout).not.toHaveBeenCalled(); // not yet — only after "Entendido"
  click(findByText(container, 'Entendido'));
  await flush();
  expect(onLogout).toHaveBeenCalledTimes(1);
  expect(getPinStepUp()).toBeNull(); // the proof must not survive the forced re-login
  unmount(container, root);
});

test('a save failure clears the step-up and routes back to re-confirmation, no false success', async () => {
  jest.useFakeTimers();
  api.setActorPin.mockResolvedValue({ ok: false, error: 'admin_action_failed', _ok: true, _status: 400 });
  const { container, root } = await mount();
  await reachManage(container);
  await selectTargetAndContinue(container, 'rider');
  pressDigits(container, '284739');
  click(findByText(container, 'Continuar'));
  await flush();
  pressDigits(container, '284739');
  click(findByText(container, 'Guardar'));
  await flush();

  expect(container.textContent).toMatch(/No se pudo guardar el PIN/);
  expect(getPinStepUp()).toBeNull();
  act(() => { jest.advanceTimersByTime(1500); });
  await flush();
  expect(container.textContent).toMatch(/Confirma tu identidad para gestionar los PIN/);
  jest.useRealTimers();
  unmount(container, root);
});

test('an expired step-up (client-side) re-asks for confirmation instead of attempting to save', async () => {
  const { container, root } = await mount();
  await reachManage(container, { proof: 'SHORT-LIVED' });
  await selectTargetAndContinue(container, 'rider');
  pressDigits(container, '284739');
  click(findByText(container, 'Continuar'));
  await flush();
  clearPinStepUp(); // simulate the 10-minute client-side expiry firing, right before save
  pressDigits(container, '284739');
  click(findByText(container, 'Guardar'));
  await flush();
  expect(api.setActorPin).not.toHaveBeenCalled();
  expect(container.textContent).toMatch(/Confirma tu identidad para gestionar los PIN/);
  unmount(container, root);
});

test('the save button is double-click protected — exactly one setActorPin call', async () => {
  let resolveCall;
  api.setActorPin.mockReturnValue(new Promise((res) => { resolveCall = res; }));
  const { container, root } = await mount();
  await reachManage(container);
  await selectTargetAndContinue(container, 'rider');
  pressDigits(container, '284739');
  click(findByText(container, 'Continuar'));
  await flush();
  pressDigits(container, '284739');
  const saveBtn = findByText(container, 'Guardar');
  click(saveBtn);
  click(saveBtn);
  click(saveBtn);
  await flush();
  expect(api.setActorPin).toHaveBeenCalledTimes(1);
  await act(async () => { resolveCall({ ok: true, actor: 'rider', selfChanged: false, _ok: true, _status: 200 }); });
  unmount(container, root);
});

test('the step-up PIN and the new/confirm PIN are never written to any Storage across the whole flow', async () => {
  const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
  api.setActorPin.mockResolvedValue({ ok: true, actor: 'rider', selfChanged: false, _ok: true, _status: 200 });
  const { container, root } = await mount();
  await reachManage(container);
  await selectTargetAndContinue(container, 'rider');
  pressDigits(container, '284739');
  click(findByText(container, 'Continuar'));
  await flush();
  pressDigits(container, '284739');
  click(findByText(container, 'Guardar'));
  await flush();
  expect(setItemSpy).not.toHaveBeenCalled();
  setItemSpy.mockRestore();
  unmount(container, root);
});

test('no <input> ever appears anywhere in the new/confirm PIN screens either', async () => {
  const { container, root } = await mount();
  await reachManage(container);
  await selectTargetAndContinue(container, 'rider');
  expect(container.querySelector('input')).toBeNull(); // newPin screen
  pressDigits(container, '284739');
  click(findByText(container, 'Continuar'));
  await flush();
  expect(container.querySelector('input')).toBeNull(); // confirmPin screen
  unmount(container, root);
});

test('closing the flow and reopening asks for step-up again once the proof is gone', async () => {
  const { container, root } = await mount();
  await reachManage(container);
  click(findByText(container, 'Cerrar'));
  await flush();
  clearPinStepUp();
  await openStepUp(container);
  expect(container.textContent).toMatch(/Confirma tu identidad para gestionar los PIN/);
  unmount(container, root);
});

describe('operationalSession step-up primitives', () => {
  const { setPinStepUp, operationalLogout } = require('../operationalSession');

  test('setPinStepUp/getPinStepUp round-trip', () => {
    setPinStepUp('P1', 600);
    expect(getPinStepUp()).toBe('P1');
    clearPinStepUp();
  });

  test('an empty/invalid proof clears state instead of storing garbage', () => {
    setPinStepUp('', 600);
    expect(getPinStepUp()).toBeNull();
  });

  test('expiry is enforced client-side after the given TTL', () => {
    const realNow = Date.now;
    Date.now = () => 1000000;
    setPinStepUp('P2', 10); // 10s TTL
    expect(getPinStepUp()).toBe('P2');
    Date.now = () => 1000000 + 11000;
    expect(getPinStepUp()).toBeNull();
    Date.now = realNow;
  });

  test('operationalLogout clears the step-up proof', () => {
    setPinStepUp('P3', 600);
    expect(getPinStepUp()).toBe('P3');
    operationalLogout();
    expect(getPinStepUp()).toBeNull();
  });
});
