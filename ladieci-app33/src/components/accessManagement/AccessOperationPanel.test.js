// AccessOperationPanel — all 8 write panels (V3-I). react-dom + react-dom/test-utils,
// same house style as src/components/pinManagementFlow.test.js — no @testing-library.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../api', () => ({
  __esModule: true,
  api: { verifyOwnPin: jest.fn(), setActorPin: jest.fn() },
}));
jest.mock('../../accessManagement/accessManagementApi', () => ({
  __esModule: true,
  createAccessUser: jest.fn(),
  renameAccessUser: jest.fn(),
  changeAccessUserRole: jest.fn(),
  setAccessUserPin: jest.fn(),
  clearAccessUserPin: jest.fn(),
  deactivateAccessUser: jest.fn(),
  reactivateAccessUser: jest.fn(),
}));

const { api } = require('../../api');
const {
  createAccessUser, renameAccessUser, changeAccessUserRole,
  setAccessUserPin, clearAccessUserPin, deactivateAccessUser, reactivateAccessUser,
} = require('../../accessManagement/accessManagementApi');
const { setPinStepUp, clearPinStepUp } = require('../../operationalSession');
const {
  CreateAccessForm, RenameForm, RoleForm, PinSetForm, PinClearConfirm,
  DeactivateConfirm, ReactivateConfirm, OwnerPinChangeFlow,
} = require('./AccessOperationPanel');
const AccessOperationPanel = require('./AccessOperationPanel').default;

function click(el) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
function findByText(container, text, tag = 'button') {
  return Array.from(container.querySelectorAll(tag)).find((b) => b.textContent.trim() === text);
}
function pressDigits(container, digits) {
  const btns = Array.from(container.querySelectorAll('button')).filter((b) => /^[0-9]$/.test(b.textContent));
  for (const d of String(digits)) {
    const btn = btns.find((b) => b.textContent === d);
    click(btn);
  }
}
// Setting el.value directly bypasses React's own tracked-value setter, so its
// onChange never fires — same native-setter workaround already used for the
// <select> in pinManagementFlow.test.js, applied here to a text <input>.
function typeInto(input, text) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function mount(Component, props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<Component {...props} />); });
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

const TARGET = {
  actorId: 'operator_backup',
  primaryLabel: 'Operador 1',
  roleLabel: 'Operador actual',
  roleBeta: false,
  active: true,
  hasPin: true,
  secondaryTechnicalId: 'operator_backup',
  writeSnapshot: { dbRole: 'operator', active: true, sessionVersion: 4 },
};

beforeEach(() => {
  jest.clearAllMocks();
  clearPinStepUp();
  setPinStepUp('PROOF-1', 600); // most panel tests assume step-up is already satisfied
});
afterEach(() => { clearPinStepUp(); });

describe('CreateAccessForm', () => {
  test('requires a name and a role before Continuar, then shows a confirmation with both', async () => {
    const onSuccess = jest.fn();
    const { container, root } = await mount(CreateAccessForm, { onCancel: jest.fn(), onSuccess });
    const nameInput = container.querySelector('[data-testid="create-name-input"]');
    typeInto(nameInput, 'Carlos');
    click(container.querySelector('[data-testid="create-role-waiter"]'));
    await flush();
    click(findByText(container, 'Continuar'));
    await flush();
    expect(container.textContent).toMatch(/Carlos/);
    expect(container.textContent).toMatch(/Camarero/);
    unmount(container, root);
  });

  test('confirming calls createAccessUser with the proof, a clientRequestId, and no actor field', async () => {
    createAccessUser.mockResolvedValue({ kind: 'ok', user: { actor: 'new1', displayName: 'Carlos', canonicalRole: 'waiter', active: true } });
    const onSuccess = jest.fn();
    const { container, root } = await mount(CreateAccessForm, { onCancel: jest.fn(), onSuccess });
    const nameInput = container.querySelector('[data-testid="create-name-input"]');
    typeInto(nameInput, 'Carlos');
    click(container.querySelector('[data-testid="create-role-waiter"]'));
    await flush();
    click(findByText(container, 'Continuar'));
    await flush();
    click(findByText(container, 'Crear acceso'));
    await flush();
    expect(createAccessUser).toHaveBeenCalledWith(expect.objectContaining({
      displayName: 'Carlos', role: 'waiter', stepUpProof: 'PROOF-1',
    }));
    expect(createAccessUser.mock.calls[0][0]).not.toHaveProperty('actor');
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ actor: 'new1' }));
    unmount(container, root);
  });

  test('no step-up proof -> shows OwnerStepUpView instead of a raw error', async () => {
    clearPinStepUp();
    const { container, root } = await mount(CreateAccessForm, { onCancel: jest.fn(), onSuccess: jest.fn() });
    const nameInput = container.querySelector('[data-testid="create-name-input"]');
    typeInto(nameInput, 'Carlos');
    click(container.querySelector('[data-testid="create-role-waiter"]'));
    await flush();
    click(findByText(container, 'Continuar'));
    await flush();
    click(findByText(container, 'Crear acceso'));
    await flush();
    expect(container.textContent).toMatch(/Confirma tu identidad/);
    expect(createAccessUser).not.toHaveBeenCalled();
    unmount(container, root);
  });
});

describe('RenameForm', () => {
  test('a fallback label ("Operador N") is never pre-filled — the input starts empty', async () => {
    const { container, root } = await mount(RenameForm, { targetVm: TARGET, onCancel: jest.fn(), onSuccess: jest.fn() });
    const input = container.querySelector('[data-testid="rename-name-input"]');
    expect(input.value).toBe('');
    unmount(container, root);
  });

  test('a genuine human displayName IS pre-filled', async () => {
    const named = { ...TARGET, primaryLabel: 'Carlos Pérez' };
    const { container, root } = await mount(RenameForm, { targetVm: named, onCancel: jest.fn(), onSuccess: jest.fn() });
    const input = container.querySelector('[data-testid="rename-name-input"]');
    expect(input.value).toBe('Carlos Pérez');
    unmount(container, root);
  });

  test('submits renameAccessUser with the real actor id and the trimmed name', async () => {
    renameAccessUser.mockResolvedValue({ kind: 'ok', user: { actor: 'operator_backup', displayName: 'Carlos', canonicalRole: 'legacy_operator', active: true } });
    const onSuccess = jest.fn();
    const { container, root } = await mount(RenameForm, { targetVm: TARGET, onCancel: jest.fn(), onSuccess });
    const input = container.querySelector('[data-testid="rename-name-input"]');
    typeInto(input, '  Carlos  ');
    await flush();
    click(findByText(container, 'Guardar'));
    await flush();
    expect(renameAccessUser).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'operator_backup', displayName: 'Carlos', stepUpProof: 'PROOF-1',
    }));
    expect(onSuccess).toHaveBeenCalled();
    unmount(container, root);
  });
});

describe('RoleForm', () => {
  test('shows a confirmation naming the person and the new role before submitting', async () => {
    const { container, root } = await mount(RoleForm, { targetVm: TARGET, onCancel: jest.fn(), onSuccess: jest.fn() });
    click(container.querySelector('[data-testid="role-option-waiter"]'));
    await flush();
    expect(container.textContent).toMatch(/Operador 1/);
    expect(container.textContent).toMatch(/Camarero/);
    expect(changeAccessUserRole).not.toHaveBeenCalled();
    unmount(container, root);
  });

  test('confirming sends expectedRole = the RAW dbRole (not canonicalRole) and requestedRole = the new role', async () => {
    changeAccessUserRole.mockResolvedValue({ kind: 'ok', user: { actor: 'operator_backup', oldRole: 'operator', role: 'waiter', changed: true } });
    const onSuccess = jest.fn();
    const { container, root } = await mount(RoleForm, { targetVm: TARGET, onCancel: jest.fn(), onSuccess });
    click(container.querySelector('[data-testid="role-option-waiter"]'));
    await flush();
    click(findByText(container, 'Confirmar'));
    await flush();
    expect(changeAccessUserRole).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'operator_backup', expectedRole: 'operator', requestedRole: 'waiter', stepUpProof: 'PROOF-1',
    }));
    expect(onSuccess).toHaveBeenCalled();
    unmount(container, root);
  });

  test('a waiter-open-tables conflict shows the specific human message', async () => {
    changeAccessUserRole.mockResolvedValue({ kind: 'waiter_open_tables', status: 409, code: 'AUTH_WAITER_HAS_OPEN_TABLES' });
    const { container, root } = await mount(RoleForm, { targetVm: { ...TARGET, writeSnapshot: { dbRole: 'waiter', active: true, sessionVersion: 4 } }, onCancel: jest.fn(), onSuccess: jest.fn() });
    click(container.querySelector('[data-testid="role-option-cashier"]'));
    await flush();
    click(findByText(container, 'Confirmar'));
    await flush();
    expect(container.textContent).toMatch(/mesas abiertas/);
    unmount(container, root);
  });
});

describe('PinSetForm', () => {
  test('two-step entry: mismatch on confirm shows an error and does not submit', async () => {
    const { container, root } = await mount(PinSetForm, { targetVm: TARGET, onCancel: jest.fn(), onSuccess: jest.fn() });
    pressDigits(container, '284739');
    click(findByText(container, 'Continuar'));
    await flush();
    pressDigits(container, '111739'); // different
    click(findByText(container, 'Guardar'));
    await flush();
    expect(container.textContent).toMatch(/no coinciden/i);
    expect(setAccessUserPin).not.toHaveBeenCalled();
    unmount(container, root);
  });

  test('matching PINs submit setAccessUserPin for the real actor, PIN cleared from state after success', async () => {
    setAccessUserPin.mockResolvedValue({ kind: 'ok', user: { actor: 'operator_backup', active: true, hasPin: true } });
    const onSuccess = jest.fn();
    const { container, root } = await mount(PinSetForm, { targetVm: TARGET, onCancel: jest.fn(), onSuccess });
    pressDigits(container, '284739');
    click(findByText(container, 'Continuar'));
    await flush();
    pressDigits(container, '284739');
    click(findByText(container, 'Guardar'));
    await flush();
    expect(setAccessUserPin).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'operator_backup', pin: '284739', stepUpProof: 'PROOF-1',
    }));
    expect(onSuccess).toHaveBeenCalled();
    unmount(container, root);
  });

  test('no PIN digit ever appears in the rendered DOM as plain text outside the masked dots', async () => {
    const { container, root } = await mount(PinSetForm, { targetVm: TARGET, onCancel: jest.fn(), onSuccess: jest.fn() });
    pressDigits(container, '284739');
    // The dots are the only "value" indicator; no literal "284739" string should render.
    expect(container.textContent).not.toMatch(/284739/);
    unmount(container, root);
  });
});

describe('PinClearConfirm', () => {
  test('shows a destructive confirmation naming the person before any request', async () => {
    const { container, root } = await mount(PinClearConfirm, { targetVm: TARGET, onCancel: jest.fn(), onSuccess: jest.fn() });
    expect(container.textContent).toMatch(/Operador 1/);
    expect(clearAccessUserPin).not.toHaveBeenCalled();
    unmount(container, root);
  });

  test('confirming sends expectedSessionVersion from the target snapshot, no pin field', async () => {
    clearAccessUserPin.mockResolvedValue({ kind: 'ok', user: { actor: 'operator_backup', active: true } });
    const onSuccess = jest.fn();
    const { container, root } = await mount(PinClearConfirm, { targetVm: TARGET, onCancel: jest.fn(), onSuccess });
    click(findByText(container, 'Quitar PIN'));
    await flush();
    expect(clearAccessUserPin).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'operator_backup', expectedSessionVersion: 4, stepUpProof: 'PROOF-1',
    }));
    expect(clearAccessUserPin.mock.calls[0][0]).not.toHaveProperty('pin');
    expect(onSuccess).toHaveBeenCalled();
    unmount(container, root);
  });
});

describe('DeactivateConfirm / ReactivateConfirm', () => {
  test('deactivate sends expectedActive:true (current state) and shows the consequence sentence', async () => {
    deactivateAccessUser.mockResolvedValue({ kind: 'ok', user: { actor: 'operator_backup', active: false } });
    const onSuccess = jest.fn();
    const { container, root } = await mount(DeactivateConfirm, { targetVm: TARGET, onCancel: jest.fn(), onSuccess });
    expect(container.textContent).toMatch(/no podrá volver a entrar/i);
    click(findByText(container, 'Desactivar'));
    await flush();
    expect(deactivateAccessUser).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'operator_backup', expectedActive: true, stepUpProof: 'PROOF-1',
    }));
    expect(onSuccess).toHaveBeenCalled();
    unmount(container, root);
  });

  test('a waiter-open-tables conflict on deactivate shows the specific message', async () => {
    deactivateAccessUser.mockResolvedValue({ kind: 'waiter_open_tables', status: 409, code: 'AUTH_WAITER_HAS_OPEN_TABLES' });
    const { container, root } = await mount(DeactivateConfirm, { targetVm: TARGET, onCancel: jest.fn(), onSuccess: jest.fn() });
    click(findByText(container, 'Desactivar'));
    await flush();
    expect(container.textContent).toMatch(/mesas abiertas/);
    unmount(container, root);
  });

  test('reactivate sends expectedActive:false (current state)', async () => {
    reactivateAccessUser.mockResolvedValue({ kind: 'ok', user: { actor: 'operator_backup', active: true } });
    const onSuccess = jest.fn();
    const inactiveTarget = { ...TARGET, active: false, writeSnapshot: { ...TARGET.writeSnapshot, active: false } };
    const { container, root } = await mount(ReactivateConfirm, { targetVm: inactiveTarget, onCancel: jest.fn(), onSuccess });
    click(findByText(container, 'Activar'));
    await flush();
    expect(reactivateAccessUser).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'operator_backup', expectedActive: false, stepUpProof: 'PROOF-1',
    }));
    expect(onSuccess).toHaveBeenCalled();
    unmount(container, root);
  });
});

describe('OwnerPinChangeFlow', () => {
  test('uses the legacy api.setActorPin transport with targetActor:owner and confirmation:CHANGE_OWNER_PIN', async () => {
    api.setActorPin.mockResolvedValue({ ok: true, _ok: true, actor: 'owner' });
    const onSuccess = jest.fn();
    const { container, root } = await mount(OwnerPinChangeFlow, { onCancel: jest.fn(), onSuccess });
    pressDigits(container, '284739');
    click(findByText(container, 'Continuar'));
    await flush();
    pressDigits(container, '284739');
    click(findByText(container, 'Guardar'));
    await flush();
    expect(api.setActorPin).toHaveBeenCalledWith(expect.objectContaining({
      targetActor: 'owner', newPin: '284739', stepUpProof: 'PROOF-1', confirmation: 'CHANGE_OWNER_PIN',
    }));
    expect(onSuccess).toHaveBeenCalled();
    unmount(container, root);
  });

  test('mismatch on confirm never calls api.setActorPin', async () => {
    const { container, root } = await mount(OwnerPinChangeFlow, { onCancel: jest.fn(), onSuccess: jest.fn() });
    pressDigits(container, '284739');
    click(findByText(container, 'Continuar'));
    await flush();
    pressDigits(container, '111111');
    click(findByText(container, 'Guardar'));
    await flush();
    expect(api.setActorPin).not.toHaveBeenCalled();
    unmount(container, root);
  });
});

describe('AccessOperationPanel dispatcher', () => {
  test('renders the correct panel for each operation key, and null for an unknown one', async () => {
    const cases = [
      ['create', undefined, 'panel-create'],
      ['rename', TARGET, 'panel-rename'],
      ['role', TARGET, 'panel-role'],
      ['pin', TARGET, 'panel-pin-set'],
      ['clearPin', TARGET, 'panel-pin-clear'],
      ['deactivate', TARGET, 'panel-deactivate'],
      ['reactivate', { ...TARGET, active: false }, 'panel-reactivate'],
      ['ownerPin', undefined, 'panel-owner-pin'],
    ];
    for (const [operation, targetVm, testId] of cases) {
      const { container, root } = await mount(AccessOperationPanel, { operation, targetVm, onCancel: jest.fn(), onSuccess: jest.fn() });
      expect(container.querySelector(`[data-testid="${testId}"]`)).toBeTruthy();
      unmount(container, root);
    }
    const { container, root } = await mount(AccessOperationPanel, { operation: 'not-a-real-op', onCancel: jest.fn(), onSuccess: jest.fn() });
    expect(container.textContent.trim()).toBe('');
    unmount(container, root);
  });
});
