// Gestión de accesos — read-only page (V3-I.1). react-dom + react-dom/test-utils, same
// house style as src/components/pinManagementFlow.test.js — no @testing-library dependency.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../api', () => ({
  __esModule: true,
  auth: { getActor: jest.fn(() => 'owner') },
}));
jest.mock('../../accessManagement/accessManagementApi', () => ({
  __esModule: true,
  listAccessUsers: jest.fn(),
}));

const { listAccessUsers } = require('../../accessManagement/accessManagementApi');
const AccessManagementPage = require('./AccessManagementPage').default;

function click(el) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

async function mount(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onBack = props.onBack || jest.fn();
  await act(async () => { root.render(<AccessManagementPage onBack={onBack} />); });
  return { container, root, onBack };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

const FOUR_USERS = [
  { actor: 'owner', displayName: 'Ana', canonicalRole: 'owner', active: true, hasPin: true },
  { actor: 'operator_primary', displayName: 'Operador Principal', canonicalRole: 'legacy_operator', active: true, hasPin: true },
  { actor: 'operator_backup', displayName: 'Operador de Apoyo', canonicalRole: 'legacy_operator', active: false, hasPin: false },
  { actor: 'rider', displayName: 'Luis', canonicalRole: 'rider', active: true, hasPin: true },
];

beforeEach(() => { jest.clearAllMocks(); });

test('shows a page-level loading state before data arrives', async () => {
  listAccessUsers.mockReturnValue(new Promise(() => {})); // never resolves in this test
  const { container, root } = await mount();
  expect(container.textContent).toMatch(/Cargando accesos/);
  unmount(container, root);
});

test('four-user success: MI ACCESO shows the owner, PERSONAL shows the rest, with correct Spanish labels', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: FOUR_USERS });
  const { container, root } = await mount();
  await flush();

  expect(container.textContent).toMatch(/Mi acceso/);
  expect(container.textContent).toMatch(/Personal/);

  const meCard = container.querySelector('[data-testid="access-card-owner"]');
  expect(meCard.textContent).toMatch(/Ana/);
  expect(meCard.textContent).toMatch(/Propietario/);

  const opPrimary = container.querySelector('[data-testid="access-card-operator_primary"]');
  const opBackup = container.querySelector('[data-testid="access-card-operator_backup"]');
  const rider = container.querySelector('[data-testid="access-card-rider"]');
  expect(opPrimary.textContent).toMatch(/Operador Principal/);
  expect(opPrimary.textContent).toMatch(/Operador actual/); // legacy label, not cashier/waiter
  expect(opPrimary.textContent).toMatch(/operator_primary/); // secondary technical id to tell the two apart
  expect(opBackup.textContent).toMatch(/Operador de Apoyo/);
  expect(opBackup.textContent).toMatch(/Operador actual/);
  expect(rider.textContent).toMatch(/Luis/);
  expect(rider.textContent).toMatch(/Repartidor/);

  // owner never duplicated into PERSONAL
  expect(container.querySelectorAll('[data-testid^="access-card-"]').length).toBe(4);
  unmount(container, root);
});

test('active/inactive and PIN configured/not-configured labels are correct per record', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: FOUR_USERS });
  const { container, root } = await mount();
  await flush();

  const opBackup = container.querySelector('[data-testid="access-card-operator_backup"]');
  expect(opBackup.textContent).toMatch(/Inactivo/);
  expect(opBackup.textContent).toMatch(/PIN no configurado/);

  const rider = container.querySelector('[data-testid="access-card-rider"]');
  expect(rider.textContent).toMatch(/Activo/);
  expect(rider.textContent).toMatch(/PIN configurado/);
  unmount(container, root);
});

test('safe empty state when the API returns zero users — no creation control offered', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: [] });
  const { container, root } = await mount();
  await flush();
  expect(container.textContent).toMatch(/No hay accesos para mostrar/);
  const buttons = Array.from(container.querySelectorAll('button'));
  expect(buttons.some((b) => /crear|nuevo|añadir/i.test(b.textContent))).toBe(false);
  unmount(container, root);
});

test('a recoverable network error shows a retry control, and retry re-fetches', async () => {
  listAccessUsers.mockResolvedValueOnce({ kind: 'network', status: 0, code: null });
  const { container, root } = await mount();
  await flush();
  expect(container.textContent).toMatch(/Error de red/);

  listAccessUsers.mockResolvedValueOnce({ kind: 'ok', status: 200, users: FOUR_USERS });
  click(container.querySelector('[data-testid="access-retry-btn"]'));
  await flush();
  expect(container.textContent).toMatch(/Mi acceso/);
  expect(listAccessUsers).toHaveBeenCalledTimes(2);
  unmount(container, root);
});

test('refresh is a single explicit GET-only action and de-duplicates concurrent clicks', async () => {
  listAccessUsers.mockResolvedValueOnce({ kind: 'ok', status: 200, users: FOUR_USERS });
  const { container, root } = await mount();
  await flush();
  expect(listAccessUsers).toHaveBeenCalledTimes(1);

  let resolveRefresh;
  listAccessUsers.mockReturnValueOnce(new Promise((res) => { resolveRefresh = res; }));
  const refreshBtn = container.querySelector('[data-testid="access-refresh-btn"]');
  click(refreshBtn);
  click(refreshBtn);
  click(refreshBtn);
  await flush();
  expect(listAccessUsers).toHaveBeenCalledTimes(2); // the three rapid clicks collapse into one in-flight call
  await act(async () => { resolveRefresh({ kind: 'ok', status: 200, users: FOUR_USERS }); });
  unmount(container, root);
});

test('a failed refresh keeps the last known-good list visible and shows an inline error, not a blank page', async () => {
  listAccessUsers.mockResolvedValueOnce({ kind: 'ok', status: 200, users: FOUR_USERS });
  const { container, root } = await mount();
  await flush();

  listAccessUsers.mockResolvedValueOnce({ kind: 'server', status: 500, code: null });
  click(container.querySelector('[data-testid="access-refresh-btn"]'));
  await flush();

  expect(container.textContent).toMatch(/Ana/); // known-good data still visible
  expect(container.querySelector('[data-testid="access-refresh-error"]')).toBeTruthy();
  unmount(container, root);
});

test('no sensitive field is ever rendered, even if a mocked response smuggled one in', async () => {
  listAccessUsers.mockResolvedValue({
    kind: 'ok', status: 200,
    users: [{ actor: 'owner', displayName: 'Ana', canonicalRole: 'owner', active: true, hasPin: true,
      pin: '1234', pinHash: 'abcd-should-not-render', token: 'secret-token-value' }],
  });
  const { container, root } = await mount();
  await flush();
  expect(container.textContent).not.toMatch(/1234/);
  expect(container.textContent).not.toMatch(/abcd-should-not-render/);
  expect(container.textContent).not.toMatch(/secret-token-value/);
  unmount(container, root);
});

test('the EN DESARROLLO section is explanatory text only — no clickable write action', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: FOUR_USERS });
  const { container, root } = await mount();
  await flush();
  expect(container.textContent).toMatch(/En desarrollo/);
  expect(container.textContent).toMatch(/Próximamente/);
  const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
  expect(buttons).not.toContain('Guardar');
  expect(buttons).not.toContain('Confirmar');
  expect(buttons.some((t) => /crear|activar|desactivar|cambiar rol|guardar pin/i.test(t))).toBe(false);
  unmount(container, root);
});

test('the back button calls onBack', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: FOUR_USERS });
  const { container, root, onBack } = await mount();
  await flush();
  click(container.querySelector('[data-testid="access-back-btn"]'));
  expect(onBack).toHaveBeenCalledTimes(1);
  unmount(container, root);
});
