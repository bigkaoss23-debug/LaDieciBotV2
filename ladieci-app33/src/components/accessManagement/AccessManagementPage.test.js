// Gestión de accesos — the full operational page (V3-I, V3-I UX pass). react-dom +
// react-dom/test-utils, same house style as src/components/pinManagementFlow.test.js —
// no @testing-library dependency. Per-panel internal behavior is already covered by
// AccessOperationPanel.test.js (untouched by the UX pass) — this file checks the PAGE's
// own responsibilities: tab structure/accessibility, card disclosure, the 4-button
// operation grid, the PIN Cambiar/Quitar sub-choice, technical-details disclosure,
// single-panel-open enforcement, refresh-after-success, and the create entry point.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../api', () => ({
  __esModule: true,
  auth: { getActor: jest.fn(() => 'owner') },
  api: { verifyOwnPin: jest.fn(), setActorPin: jest.fn() },
}));
jest.mock('../../accessManagement/accessManagementApi', () => ({
  __esModule: true,
  listAccessUsers: jest.fn(),
  createAccessUser: jest.fn(),
  renameAccessUser: jest.fn(),
  changeAccessUserRole: jest.fn(),
  setAccessUserPin: jest.fn(),
  clearAccessUserPin: jest.fn(),
  deactivateAccessUser: jest.fn(),
  reactivateAccessUser: jest.fn(),
}));

const { auth } = require('../../api');
const {
  listAccessUsers, renameAccessUser, deactivateAccessUser,
} = require('../../accessManagement/accessManagementApi');
const { setPinStepUp, clearPinStepUp } = require('../../operationalSession');
const AccessManagementPage = require('./AccessManagementPage').default;

function click(el) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
function findByText(container, text, tag = 'button') {
  return Array.from(container.querySelectorAll(tag)).find((b) => b.textContent.trim() === text);
}

async function mount(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onBack = props.onBack || jest.fn();
  const onLogout = props.onLogout || jest.fn();
  await act(async () => { root.render(<AccessManagementPage onBack={onBack} onLogout={onLogout} />); });
  return { container, root, onBack, onLogout };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

function goToPersonalTab(container) {
  click(container.querySelector('[data-testid="access-tab-personal"]'));
}

// Staging-shaped fixture: legacy operators carry a migration-generated "... heredado"
// name, the rider's displayName is just the role word — none is a real person's name.
// operator_primary is deliberately marked inactive + no PIN here (the real dataset has
// all four active) so the Inactivo-takes-priority-over-PIN-wording rule has coverage.
const REAL_FOUR_USERS = [
  { actor: 'owner', displayName: 'Propietario', dbRole: 'admin', canonicalRole: 'owner', active: true, hasPin: true, sessionVersion: 15 },
  { actor: 'operator_backup', displayName: 'Operador de apoyo heredado', dbRole: 'operator', canonicalRole: 'legacy_operator', active: true, hasPin: true, sessionVersion: 4 },
  { actor: 'operator_primary', displayName: 'Operador principal heredado', dbRole: 'operator', canonicalRole: 'legacy_operator', active: false, hasPin: false, sessionVersion: 10 },
  { actor: 'rider', displayName: 'Repartidor', dbRole: 'rider', canonicalRole: 'rider', active: true, hasPin: true, sessionVersion: 2 },
];

beforeEach(() => {
  jest.clearAllMocks();
  // react-scripts' jest config sets resetMocks:true, which wipes a jest.fn()'s
  // implementation (not just its call history) before every test — re-establish it
  // explicitly rather than relying on the jest.mock() factory's initial implementation.
  auth.getActor.mockReturnValue('owner');
  clearPinStepUp();
});
afterEach(() => { clearPinStepUp(); });

test('shows a page-level loading state before data arrives', async () => {
  listAccessUsers.mockReturnValue(new Promise(() => {})); // never resolves in this test
  const { container, root } = await mount();
  expect(container.textContent).toMatch(/Cargando accesos/);
  unmount(container, root);
});

// ═══ TABS ═══════════════════════════════════════════════════════════════════

test('Mi acceso is the default active tab, with correct ARIA wiring on both tabs', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();

  const tablist = container.querySelector('[role="tablist"]');
  expect(tablist).toBeTruthy();
  const miAcceso = container.querySelector('[data-testid="access-tab-miAcceso"]');
  const personal = container.querySelector('[data-testid="access-tab-personal"]');
  expect(miAcceso.getAttribute('role')).toBe('tab');
  expect(miAcceso.getAttribute('aria-selected')).toBe('true');
  expect(personal.getAttribute('aria-selected')).toBe('false');
  expect(miAcceso.getAttribute('aria-controls')).toBe('access-tabpanel-miAcceso');

  const miPanel = container.querySelector('[data-testid="access-tabpanel-miAcceso"]');
  const personalPanel = container.querySelector('[data-testid="access-tabpanel-personal"]');
  expect(miPanel.hasAttribute('hidden')).toBe(false);
  expect(personalPanel.hasAttribute('hidden')).toBe(true);
  expect(miPanel.getAttribute('role')).toBe('tabpanel');
  unmount(container, root);
});

test('clicking the Personal tab switches ARIA selection and visible tabpanel', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();

  goToPersonalTab(container);
  await flush();

  expect(container.querySelector('[data-testid="access-tab-personal"]').getAttribute('aria-selected')).toBe('true');
  expect(container.querySelector('[data-testid="access-tab-miAcceso"]').getAttribute('aria-selected')).toBe('false');
  expect(container.querySelector('[data-testid="access-tabpanel-personal"]').hasAttribute('hidden')).toBe(false);
  expect(container.querySelector('[data-testid="access-tabpanel-miAcceso"]').hasAttribute('hidden')).toBe(true);
  unmount(container, root);
});

test('ArrowRight/ArrowLeft on the tablist moves selection between the two tabs', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();

  const tablist = container.querySelector('[role="tablist"]');
  act(() => { tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
  await flush();
  expect(container.querySelector('[data-testid="access-tab-personal"]').getAttribute('aria-selected')).toBe('true');

  act(() => { tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
  await flush();
  expect(container.querySelector('[data-testid="access-tab-miAcceso"]').getAttribute('aria-selected')).toBe('true');
  unmount(container, root);
});

// ═══ MI ACCESO ══════════════════════════════════════════════════════════════

test('MI ACCESO shows a distinct owner card with no duplicate role line and no Activo/Inactivo', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();

  const ownerCard = container.querySelector('[data-testid="access-owner-card"]');
  expect(ownerCard).toBeTruthy();
  expect(ownerCard.textContent).toMatch(/Propietario/);
  expect(ownerCard.textContent).toMatch(/PIN configurado/);
  expect(ownerCard.textContent).not.toMatch(/Activo|Inactivo/);
  expect((ownerCard.textContent.match(/Propietario/g) || []).length).toBe(1);
  unmount(container, root);
});

test('the owner Cambiar PIN control is a real button, not a text link, and meets the 44px touch target', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();

  const btn = container.querySelector('[data-testid="access-owner-change-pin-btn"]');
  expect(btn.tagName).toBe('BUTTON');
  expect(getComputedStyle(btn).minHeight).toBe('44px');
  unmount(container, root);
});

// ═══ PERSONAL — cards, fallback labels, disclosure ═══════════════════════════

test('PERSONAL shows deterministic Operador N fallback labels, never raw actor ids or "Legacy"', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();
  goToPersonalTab(container);
  await flush();

  const backup = container.querySelector('[data-testid="access-row-operator_backup"]');
  const primary = container.querySelector('[data-testid="access-row-operator_primary"]');
  const rider = container.querySelector('[data-testid="access-row-rider"]');
  expect(backup.textContent).toMatch(/Operador 1/);
  expect(primary.textContent).toMatch(/Operador 2/);
  expect(rider.textContent).toMatch(/Operador 3/);

  const personalPanel = container.querySelector('[data-testid="access-tabpanel-personal"]');
  expect(personalPanel.textContent).not.toMatch(/operator_backup|operator_primary/); // not visible collapsed
  expect(personalPanel.textContent).not.toMatch(/Legacy/i);
  expect(personalPanel.textContent).not.toMatch(/Beta · En desarrollo/);
  unmount(container, root);
});

test('the Personal section header shows a staff count', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();
  goToPersonalTab(container);
  await flush();
  expect(container.querySelector('[data-testid="access-tabpanel-personal"]').textContent).toMatch(/3 personas/);
  unmount(container, root);
});

test('collapsed staff card shows exactly one combined role+status line, no chip pile-up', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();
  goToPersonalTab(container);
  await flush();

  const backup = container.querySelector('[data-testid="access-row-operator_backup"]');
  expect(backup.textContent).toMatch(/Operador actual/);
  expect(backup.textContent).toMatch(/PIN configurado/);

  const primary = container.querySelector('[data-testid="access-row-operator_primary"]'); // active:false in fixture
  expect(primary.textContent).toMatch(/Inactivo/);
  expect(primary.textContent).not.toMatch(/PIN no configurado/); // Inactivo takes priority, not both shown
  unmount(container, root);
});

test('the staff card header is a real button meeting the 44px touch target, and toggles aria-expanded', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();
  goToPersonalTab(container);
  await flush();

  const row = container.querySelector('[data-testid="access-row-operator_backup"]');
  expect(row.tagName).toBe('BUTTON');
  expect(getComputedStyle(row).minHeight).toBe('44px');
  expect(row.getAttribute('aria-expanded')).toBe('false');
  click(row);
  await flush();
  expect(row.getAttribute('aria-expanded')).toBe('true');
  unmount(container, root);
});

test('technical details are hidden by default behind a closed disclosure, and reset closed when the card collapses', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();
  goToPersonalTab(container);
  await flush();

  const row = container.querySelector('[data-testid="access-row-operator_backup"]');
  click(row);
  await flush();
  // Expanded, but technical details are NOT shown until explicitly opened.
  expect(container.querySelector('[data-testid="access-row-detail-operator_backup"]')).toBeNull();
  expect(container.textContent).not.toMatch(/operator_backup/);

  const toggle = container.querySelector('[data-testid="access-tech-toggle-operator_backup"]');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  click(toggle);
  await flush();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  const detail = container.querySelector('[data-testid="access-row-detail-operator_backup"]');
  expect(detail).toBeTruthy();
  expect(detail.textContent).toMatch(/operator_backup/);

  click(row); // collapse the whole card
  await flush();
  click(row); // re-expand
  await flush();
  expect(container.querySelector('[data-testid="access-row-detail-operator_backup"]')).toBeNull(); // closed again by default
  unmount(container, root);
});

test('only one card is expanded at a time', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();
  goToPersonalTab(container);
  await flush();

  click(container.querySelector('[data-testid="access-row-operator_backup"]'));
  await flush();
  click(container.querySelector('[data-testid="access-row-rider"]'));
  await flush();

  expect(container.querySelector('[data-testid="access-row-operator_backup"]').getAttribute('aria-expanded')).toBe('false');
  expect(container.querySelector('[data-testid="access-row-rider"]').getAttribute('aria-expanded')).toBe('true');
  unmount(container, root);
});

test('safe empty state when the API returns zero users — no creation control offered', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: [] });
  const { container, root } = await mount();
  await flush();
  expect(container.textContent).toMatch(/No hay accesos para mostrar/);
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
  expect(container.querySelector('[data-testid="access-owner-card"]')).toBeTruthy();
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

  expect(container.querySelector('[data-testid="access-owner-card"]')).toBeTruthy(); // known-good data still visible
  expect(container.querySelector('[data-testid="access-refresh-error"]')).toBeTruthy();
  unmount(container, root);
});

test('no sensitive field is ever rendered, even if a mocked response smuggled one in', async () => {
  listAccessUsers.mockResolvedValue({
    kind: 'ok', status: 200,
    users: [{ actor: 'owner', displayName: 'Propietario', dbRole: 'admin', canonicalRole: 'owner', active: true, hasPin: true, sessionVersion: 1,
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

// ═══ V3-I UX — the 4-button operation grid ═══════════════════════════════════

test('expanding a card reveals a 4-button grid (Nombre/Rol/PIN/Estado), each a real button with a 44px touch target', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();
  goToPersonalTab(container);
  await flush();

  click(container.querySelector('[data-testid="access-row-operator_backup"]'));
  await flush();

  const nombre = container.querySelector('[data-testid="access-action-operator_backup-nombre"]');
  const rol = container.querySelector('[data-testid="access-action-operator_backup-rol"]');
  const pin = container.querySelector('[data-testid="access-action-operator_backup-pin"]');
  const estado = container.querySelector('[data-testid="access-action-operator_backup-estado"]');
  for (const btn of [nombre, rol, pin, estado]) {
    expect(btn.tagName).toBe('BUTTON');
    expect(getComputedStyle(btn).minHeight).toBe('44px');
  }
  // Estado is active:true here -> the lifecycle action offered is Desactivar acceso.
  expect(estado.textContent).toBe('Desactivar acceso');
  unmount(container, root);
});

test('Estado reads "Activar acceso" for an inactive account, and no separate reactivate/deactivate cells exist', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();
  goToPersonalTab(container);
  await flush();

  click(container.querySelector('[data-testid="access-row-operator_primary"]')); // active:false in fixture
  await flush();
  const estado = container.querySelector('[data-testid="access-action-operator_primary-estado"]');
  expect(estado.textContent).toBe('Activar acceso');
  unmount(container, root);
});

test('the PIN grid cell opens a Cambiar/Quitar choice; Quitar PIN only appears when a PIN is already set', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();
  goToPersonalTab(container);
  await flush();

  // operator_backup has a PIN -> both Cambiar PIN and Quitar PIN offered.
  click(container.querySelector('[data-testid="access-row-operator_backup"]'));
  await flush();
  click(container.querySelector('[data-testid="access-action-operator_backup-pin"]'));
  await flush();
  expect(container.querySelector('[data-testid="access-pin-menu-operator_backup"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="access-pin-menu-operator_backup-change"]').textContent).toBe('Cambiar PIN');
  expect(container.querySelector('[data-testid="access-pin-menu-operator_backup-clear"]')).toBeTruthy();

  // Cancelling the choice returns to the grid, with no operation panel mounted.
  click(container.querySelector('[data-testid="access-pin-menu-operator_backup-cancel"]'));
  await flush();
  expect(container.querySelector('[data-testid="access-pin-menu-operator_backup"]')).toBeNull();
  expect(container.querySelector('[data-testid="access-action-operator_backup-nombre"]')).toBeTruthy();

  // operator_primary has no PIN -> only Configurar PIN is offered, no Quitar PIN.
  click(container.querySelector('[data-testid="access-row-operator_backup"]')); // collapse
  await flush();
  click(container.querySelector('[data-testid="access-row-operator_primary"]'));
  await flush();
  click(container.querySelector('[data-testid="access-action-operator_primary-pin"]'));
  await flush();
  expect(container.querySelector('[data-testid="access-pin-menu-operator_primary-change"]').textContent).toBe('Configurar PIN');
  expect(container.querySelector('[data-testid="access-pin-menu-operator_primary-clear"]')).toBeNull();
  unmount(container, root);
});

test('choosing Cambiar PIN from the menu opens the real PIN set panel (the existing, unmodified operation)', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();
  goToPersonalTab(container);
  await flush();

  click(container.querySelector('[data-testid="access-row-operator_backup"]'));
  await flush();
  click(container.querySelector('[data-testid="access-action-operator_backup-pin"]'));
  await flush();
  click(container.querySelector('[data-testid="access-pin-menu-operator_backup-change"]'));
  await flush();
  expect(container.querySelector('[data-testid="panel-pin-set"]')).toBeTruthy();
  unmount(container, root);
});

test('choosing Quitar PIN from the menu opens the real PIN clear confirmation', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();
  goToPersonalTab(container);
  await flush();

  click(container.querySelector('[data-testid="access-row-operator_backup"]'));
  await flush();
  click(container.querySelector('[data-testid="access-action-operator_backup-pin"]'));
  await flush();
  click(container.querySelector('[data-testid="access-pin-menu-operator_backup-clear"]'));
  await flush();
  expect(container.querySelector('[data-testid="panel-pin-clear"]')).toBeTruthy();
  unmount(container, root);
});

test('only one action grid/panel is visible at a time — opening "+ Añadir acceso" closes an open row panel', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  const { container, root } = await mount();
  await flush();
  goToPersonalTab(container);
  await flush();

  click(container.querySelector('[data-testid="access-row-rider"]'));
  await flush();
  click(container.querySelector('[data-testid="access-action-rider-rol"]'));
  await flush();
  expect(container.querySelector('[data-testid="panel-role"]')).toBeTruthy();

  // "+ Añadir acceso" lives inside the Personal section, next to its heading — not a
  // detached footer — and opening it must close that panel (only one open at a time).
  click(container.querySelector('[data-testid="access-create-btn"]'));
  await flush();
  expect(container.querySelector('[data-testid="panel-create"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="panel-role"]')).toBeNull();
  unmount(container, root);
});

test('a successful write refreshes the list and closes the panel', async () => {
  listAccessUsers.mockResolvedValueOnce({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  setPinStepUp('PROOF-1', 600);
  deactivateAccessUser.mockResolvedValue({ kind: 'ok', user: { actor: 'rider', active: false } });
  const { container, root } = await mount();
  await flush();
  goToPersonalTab(container);
  await flush();

  click(container.querySelector('[data-testid="access-row-rider"]'));
  await flush();
  click(container.querySelector('[data-testid="access-action-rider-estado"]'));
  await flush();

  const updatedUsers = REAL_FOUR_USERS.map((u) => (u.actor === 'rider' ? { ...u, active: false } : u));
  listAccessUsers.mockResolvedValueOnce({ kind: 'ok', status: 200, users: updatedUsers });
  click(findByText(container, 'Desactivar'));
  await flush();

  expect(deactivateAccessUser).toHaveBeenCalledTimes(1);
  expect(listAccessUsers).toHaveBeenCalledTimes(2); // initial load + post-write refresh
  expect(container.querySelector('[data-testid="panel-deactivate"]')).toBeNull();
  unmount(container, root);
});

test('rename success re-opens (keeps expanded) the card for the actor that was just changed', async () => {
  listAccessUsers.mockResolvedValueOnce({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  setPinStepUp('PROOF-1', 600);
  renameAccessUser.mockResolvedValue({ kind: 'ok', user: { actor: 'operator_backup', displayName: 'Carlos', canonicalRole: 'legacy_operator', active: true } });
  const { container, root } = await mount();
  await flush();
  goToPersonalTab(container);
  await flush();

  click(container.querySelector('[data-testid="access-row-operator_backup"]'));
  await flush();
  click(container.querySelector('[data-testid="access-action-operator_backup-nombre"]'));
  await flush();
  const input = container.querySelector('[data-testid="rename-name-input"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => { setter.call(input, 'Carlos'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await flush();

  listAccessUsers.mockResolvedValueOnce({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  click(findByText(container, 'Guardar'));
  await flush();

  expect(container.querySelector('[data-testid="access-row-operator_backup"]').getAttribute('aria-expanded')).toBe('true');
  unmount(container, root);
});

test('owner "Cambiar PIN" opens the owner PIN panel, and a successful self-change calls onLogout (forced re-login)', async () => {
  listAccessUsers.mockResolvedValue({ kind: 'ok', status: 200, users: REAL_FOUR_USERS });
  setPinStepUp('PROOF-1', 600);
  const { api } = require('../../api');
  api.setActorPin.mockResolvedValue({ ok: true, _ok: true, actor: 'owner' });
  const { container, root, onLogout } = await mount();
  await flush();

  click(container.querySelector('[data-testid="access-owner-change-pin-btn"]'));
  await flush();
  expect(container.querySelector('[data-testid="panel-owner-pin"]')).toBeTruthy();

  const pressDigits = (digits) => {
    const btns = Array.from(container.querySelectorAll('button')).filter((b) => /^[0-9]$/.test(b.textContent));
    for (const d of String(digits)) click(btns.find((b) => b.textContent === d));
  };
  pressDigits('284739');
  click(findByText(container, 'Continuar'));
  await flush();
  pressDigits('284739');
  click(findByText(container, 'Guardar'));
  await flush();

  expect(onLogout).toHaveBeenCalledTimes(1);
  unmount(container, root);
});
