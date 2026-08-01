// Gestión de accesos — read-only page (V3-I.1 UX pass). react-dom + react-dom/test-utils,
// same house style as src/components/pinManagementFlow.test.js — no @testing-library dependency.
// Locks the restaurant-friendly contract: no raw actor ids, no "Legacy"/"Beta · En desarrollo"
// chips, one combined status concept per row, deterministic Operador-N fallback naming.
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

const { auth } = require('../../api');
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

// Staging-shaped fixture: legacy operators carry a migration-generated "... heredado"
// name, the rider's displayName is just the role word — none is a real person's name.
// operator_primary is deliberately marked inactive here (the real dataset has all four
// active) so the Inactivo-takes-priority-over-PIN-wording rule has coverage.
const REAL_FOUR_USERS = [
  { actor: 'owner', displayName: 'Propietario', canonicalRole: 'owner', active: true, hasPin: true },
  { actor: 'operator_backup', displayName: 'Operador de apoyo heredado', canonicalRole: 'legacy_operator', active: true, hasPin: true },
  { actor: 'operator_primary', displayName: 'Operador principal heredado', canonicalRole: 'legacy_operator', active: false, hasPin: false },
  { actor: 'rider', displayName: 'Repartidor', canonicalRole: 'rider', active: true, hasPin: true },
];

beforeEach(() => {
  jest.clearAllMocks();
  // react-scripts' jest config sets resetMocks:true, which wipes a jest.fn()'s
  // implementation (not just its call history) before every test — re-establish it
  // explicitly rather than relying on the jest.mock() factory's initial implementation.
  auth.getActor.mockReturnValue('owner');
});

test('shows a page-level loading state before data arrives', async () => {
  listAccessUsers.mockReturnValue(new Promise(() => {})); // never resolves in this test
  const { container, root } = await mount();
  expect(container.textContent).toMatch(/Cargando accesos/);
  unmount(container, root);
});

test('MI ACCESO shows Propietario with no duplicate role line and no Activo/Inactivo', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();

  const ownerRow = container.querySelector('[data-testid="access-owner-row"]');
  expect(ownerRow).toBeTruthy();
  expect(ownerRow.textContent).toMatch(/Propietario/);
  expect(ownerRow.textContent).toMatch(/PIN configurado/);
  expect(ownerRow.textContent).not.toMatch(/Activo|Inactivo/);
  // "Propietario" must appear once as the identity, not repeated as a separate role line.
  expect((ownerRow.textContent.match(/Propietario/g) || []).length).toBe(1);
  unmount(container, root);
});

test('PERSONAL shows deterministic Operador N fallback labels, never raw actor ids or "Legacy"', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();

  const backup = container.querySelector('[data-testid="access-row-operator_backup"]');
  const primary = container.querySelector('[data-testid="access-row-operator_primary"]');
  const rider = container.querySelector('[data-testid="access-row-rider"]');
  expect(backup.textContent).toMatch(/Operador 1/);
  expect(primary.textContent).toMatch(/Operador 2/);
  expect(rider.textContent).toMatch(/Operador 3/);

  expect(container.textContent).not.toMatch(/operator_backup|operator_primary/); // not visible collapsed
  expect(container.textContent).not.toMatch(/Legacy/i);
  expect(container.textContent).not.toMatch(/Beta · En desarrollo/);
  unmount(container, root);
});

test('collapsed staff row shows exactly one combined role+status line, no chip pile-up', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();

  const backup = container.querySelector('[data-testid="access-row-operator_backup"]');
  expect(backup.textContent).toMatch(/Operador actual/);
  expect(backup.textContent).toMatch(/PIN configurado/);

  const primary = container.querySelector('[data-testid="access-row-operator_primary"]'); // active:false in fixture
  expect(primary.textContent).toMatch(/Inactivo/);
  expect(primary.textContent).not.toMatch(/PIN no configurado/); // Inactivo takes priority, not both shown
  unmount(container, root);
});

test('the internal actor id is not visible until the row is expanded, and is subdued detail there', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();

  const row = container.querySelector('[data-testid="access-row-operator_backup"]');
  expect(container.querySelector('[data-testid="access-row-detail-operator_backup"]')).toBeNull();
  expect(row.getAttribute('aria-expanded')).toBe('false');

  click(row);
  await flush();
  expect(row.getAttribute('aria-expanded')).toBe('true');
  const detail = container.querySelector('[data-testid="access-row-detail-operator_backup"]');
  expect(detail).toBeTruthy();
  expect(detail.textContent).toMatch(/operator_backup/);

  click(row); // collapses again
  await flush();
  expect(container.querySelector('[data-testid="access-row-detail-operator_backup"]')).toBeNull();
  unmount(container, root);
});

test('only one row is expanded at a time', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();

  click(container.querySelector('[data-testid="access-row-operator_backup"]'));
  await flush();
  click(container.querySelector('[data-testid="access-row-rider"]'));
  await flush();

  expect(container.querySelector('[data-testid="access-row-detail-operator_backup"]')).toBeNull();
  expect(container.querySelector('[data-testid="access-row-detail-rider"]')).toBeTruthy();
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

  listAccessUsers.mockResolvedValueOnce({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  click(container.querySelector('[data-testid="access-retry-btn"]'));
  await flush();
  expect(container.querySelector('[data-testid="access-owner-row"]')).toBeTruthy();
  expect(listAccessUsers).toHaveBeenCalledTimes(2);
  unmount(container, root);
});

test('refresh is a single explicit GET-only action and de-duplicates concurrent clicks', async () => {
  listAccessUsers.mockResolvedValueOnce({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
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
  await act(async () => { resolveRefresh({ kind: 'ok', status: 200, users: REAL_FOUR_USERS }); });
  unmount(container, root);
});

test('a failed refresh keeps the last known-good list visible and shows an inline error, not a blank page', async () => {
  listAccessUsers.mockResolvedValueOnce({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();

  listAccessUsers.mockResolvedValueOnce({ kind: 'server', status: 500, code: null });
  click(container.querySelector('[data-testid="access-refresh-btn"]'));
  await flush();

  expect(container.querySelector('[data-testid="access-owner-row"]')).toBeTruthy(); // known-good data still visible
  expect(container.querySelector('[data-testid="access-refresh-error"]')).toBeTruthy();
  unmount(container, root);
});

test('no sensitive field is ever rendered, even if a mocked response smuggled one in', async () => {
  listAccessUsers.mockResolvedValue({
    kind: 'ok', status: 200,
    users: [{ actor: 'owner', displayName: 'Propietario', canonicalRole: 'owner', active: true, hasPin: true,
      pin: '1234', pinHash: 'abcd-should-not-render', token: 'secret-token-value' }],
  });
  const { container, root } = await mount();
  await flush();
  expect(container.textContent).not.toMatch(/1234/);
  expect(container.textContent).not.toMatch(/abcd-should-not-render/);
  expect(container.textContent).not.toMatch(/secret-token-value/);
  unmount(container, root);
});

test('the closing note is a single subtle line, not a large feature-checklist panel', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();
  expect(container.textContent).toMatch(/próximamente/i);
  // No oversized dedicated section heading for it anymore.
  const headings = Array.from(container.querySelectorAll('h2'));
  expect(headings.some((h) => /en desarrollo/i.test(h.textContent))).toBe(false);
  const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
  expect(buttons).not.toContain('Guardar');
  expect(buttons).not.toContain('Confirmar');
  expect(buttons.some((t) => /crear|activar|desactivar|cambiar rol|guardar pin/i.test(t))).toBe(false);
  unmount(container, root);
});

test('"Cambiar PIN" appears only as non-interactive future text, never an enabled button', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();
  expect(container.textContent).toMatch(/Cambiar PIN/);
  const buttons = Array.from(container.querySelectorAll('button'));
  expect(buttons.some((b) => /Cambiar PIN/.test(b.textContent))).toBe(false);
  unmount(container, root);
});

test('the back button calls onBack', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root, onBack } = await mount();
  await flush();
  click(container.querySelector('[data-testid="access-back-btn"]'));
  expect(onBack).toHaveBeenCalledTimes(1);
  unmount(container, root);
});
