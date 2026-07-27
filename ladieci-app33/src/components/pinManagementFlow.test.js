// S2-7D6E4 — in-app PIN management step-up flow.
//
// Contract under test (approved by the owner):
//  1. clicking "Gestionar PIN" never navigates away and never logs the operator out;
//  2. an inline step-up modal appears first ("Confirma tu identidad para gestionar los PIN");
//  3. the step-up proof returned by verifyOwnPin is held ONLY in memory (never any Storage);
//  4. after a valid step-up, rider/operator/owner PIN changes go through setActorPin;
//  5. changing the OWNER'S OWN PIN shows a distinct "log in again" screen and DOES call
//     onLogout; changing another actor's PIN does NOT;
//  6. errors (wrong PIN, locked, save failure) are shown inline, never a false success;
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

function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function selectValue(select, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => {
    setter.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
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

test('the step-up modal is visible before any actor picker is shown', async () => {
  const { container, root } = await mount();
  click(container.querySelector('button[aria-haspopup="menu"]'));
  click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Gestionar PIN de administrador'));
  await flush();
  expect(container.querySelector('select')).toBeNull();
  unmount(container, root);
});

async function openStepUp(container) {
  click(container.querySelector('button[aria-haspopup="menu"]'));
  click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Gestionar PIN de administrador'));
  await flush();
}

test('wrong PIN shows an inline error and stays in the modal', async () => {
  api.verifyOwnPin.mockResolvedValue({ ok: false, error: 'PIN_INCORRECTO', _ok: true, _status: 401 });
  const { container, root } = await mount();
  await openStepUp(container);
  typeInto(container.querySelector('input[type="password"]'), '284917563');
  click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Confirmar'));
  await flush();
  expect(container.textContent).toMatch(/PIN incorrecto/);
  expect(container.querySelector('select')).toBeNull();
  expect(getPinStepUp()).toBeNull();
  unmount(container, root);
});

test('a locked owner shows a lockout-specific message, not the generic one', async () => {
  api.verifyOwnPin.mockResolvedValue({ ok: false, error: 'LOCKED', retryAfterSec: 37, _ok: true, _status: 429 });
  const { container, root } = await mount();
  await openStepUp(container);
  typeInto(container.querySelector('input[type="password"]'), '284917563');
  click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Confirmar'));
  await flush();
  expect(container.textContent).toMatch(/37s/);
  expect(container.textContent).not.toMatch(/^PIN incorrecto\.$/m);
  unmount(container, root);
});

test('correct PIN reveals actor management and stores the proof only in memory', async () => {
  const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
  api.verifyOwnPin.mockResolvedValue({ ok: true, stepUpProof: 'PROOF-XYZ', expiresInSec: 600, _ok: true, _status: 200 });
  api.getAuthActors.mockResolvedValue(ACTORS_OK);
  const { container, root } = await mount();
  await openStepUp(container);
  typeInto(container.querySelector('input[type="password"]'), '284917563');
  click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Confirmar'));
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
  typeInto(container.querySelector('input[type="password"]'), '284917563');
  click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Confirmar'));
  await flush();
}

test('rider PIN change: two matching new PINs, save, success message, owner stays logged in', async () => {
  api.setActorPin.mockResolvedValue({ ok: true, actor: 'rider', selfChanged: false, _ok: true, _status: 200 });
  const { container, root, onLogout } = await mount();
  await reachManage(container);

  selectValue(container.querySelector('select'), 'rider');
  const [newPinInput, confirmInput] = container.querySelectorAll('input[type="password"]');
  typeInto(newPinInput, '284739');
  typeInto(confirmInput, '284739');
  await flush();

  const saveBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Guardar');
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

test('mismatched new PINs block the save button', async () => {
  const { container, root } = await mount();
  await reachManage(container);
  selectValue(container.querySelector('select'), 'rider');
  const [newPinInput, confirmInput] = container.querySelectorAll('input[type="password"]');
  typeInto(newPinInput, '284739');
  typeInto(confirmInput, '111739');
  await flush();
  const saveBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Guardar');
  expect(saveBtn.disabled).toBe(true);
  expect(container.textContent).toMatch(/no coinciden/i);
  expect(api.setActorPin).not.toHaveBeenCalled();
  unmount(container, root);
});

test('owner self PIN change requires the explicit checkbox before saving is enabled', async () => {
  const { container, root } = await mount();
  await reachManage(container);
  selectValue(container.querySelector('select'), 'owner');
  const [newPinInput, confirmInput] = container.querySelectorAll('input[type="password"]');
  typeInto(newPinInput, '284739');
  typeInto(confirmInput, '284739');
  await flush();
  const saveBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Guardar');
  expect(saveBtn.disabled).toBe(true); // checkbox not ticked yet
  click(container.querySelector('input[type="checkbox"]'));
  await flush();
  expect(saveBtn.disabled).toBe(false);
  unmount(container, root);
});

test('owner self PIN change succeeds -> shows re-login screen and calls onLogout only then', async () => {
  api.setActorPin.mockResolvedValue({ ok: true, actor: 'owner', selfChanged: true, _ok: true, _status: 200 });
  const { container, root, onLogout } = await mount();
  await reachManage(container);
  selectValue(container.querySelector('select'), 'owner');
  const [newPinInput, confirmInput] = container.querySelectorAll('input[type="password"]');
  typeInto(newPinInput, '284739');
  typeInto(confirmInput, '284739');
  click(container.querySelector('input[type="checkbox"]'));
  await flush();
  click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Guardar'));
  await flush();

  expect(api.setActorPin).toHaveBeenCalledWith(expect.objectContaining({
    targetActor: 'owner', confirmation: 'CHANGE_OWNER_PIN',
  }));
  expect(container.textContent).toMatch(/PIN modificado/);
  expect(container.textContent).toMatch(/Accede nuevamente con el nuevo PIN/);
  expect(onLogout).not.toHaveBeenCalled(); // not yet — only after "Entendido"
  click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Entendido'));
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
  selectValue(container.querySelector('select'), 'rider');
  const [newPinInput, confirmInput] = container.querySelectorAll('input[type="password"]');
  typeInto(newPinInput, '284739');
  typeInto(confirmInput, '284739');
  await flush();
  click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Guardar'));
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
  clearPinStepUp(); // simulate the 10-minute client-side expiry firing
  selectValue(container.querySelector('select'), 'rider');
  const [newPinInput, confirmInput] = container.querySelectorAll('input[type="password"]');
  typeInto(newPinInput, '284739');
  typeInto(confirmInput, '284739');
  await flush();
  click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Guardar'));
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
  selectValue(container.querySelector('select'), 'rider');
  const [newPinInput, confirmInput] = container.querySelectorAll('input[type="password"]');
  typeInto(newPinInput, '284739');
  typeInto(confirmInput, '284739');
  await flush();
  const saveBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Guardar');
  click(saveBtn);
  click(saveBtn);
  click(saveBtn);
  await flush();
  expect(api.setActorPin).toHaveBeenCalledTimes(1);
  await act(async () => { resolveCall({ ok: true, actor: 'rider', selfChanged: false, _ok: true, _status: 200 }); });
  unmount(container, root);
});

test('the step-up PIN is never written to any Storage across the whole flow', async () => {
  const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
  api.setActorPin.mockResolvedValue({ ok: true, actor: 'rider', selfChanged: false, _ok: true, _status: 200 });
  const { container, root } = await mount();
  await reachManage(container);
  selectValue(container.querySelector('select'), 'rider');
  const [newPinInput, confirmInput] = container.querySelectorAll('input[type="password"]');
  typeInto(newPinInput, '284739');
  typeInto(confirmInput, '284739');
  await flush();
  click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Guardar'));
  await flush();
  expect(setItemSpy).not.toHaveBeenCalled();
  setItemSpy.mockRestore();
  unmount(container, root);
});

test('closing the flow and reopening asks for step-up again once the proof is gone', async () => {
  const { container, root } = await mount();
  await reachManage(container);
  click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Cerrar'));
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
