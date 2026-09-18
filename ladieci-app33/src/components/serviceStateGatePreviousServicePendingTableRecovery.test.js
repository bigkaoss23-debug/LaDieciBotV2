// PREVIOUS_SERVICE_OPEN_TABLE_RECOVERY (2026-09-18) — the real deadlock the
// 2026-09-18 staging promotion hit: PREVIOUS_SERVICE_PENDING can block on an
// open table_session, but the entire operational shell (Mesa included) is
// replaced by the exception screen while the previous service is
// unresolved, so the ONE table that blocks the close could never be
// reached (FinalizarServicioModal's pending rows were plain, non-clickable
// <div>s; see PREVIOUS_SERVICE_OPEN_TABLE_RECOVERY_FIX_2026-09-18.md).
//
// Mounted for real, same react-dom + act pattern as
// serviceStateGatePreviousServicePending.test.js (this project has no
// @testing-library). api.get/economyApi.reconciliation mocked as there;
// mesaApi additionally mocked here since the recovery bridge (
// StaleTableRecovery -> MesaWorkspace, both from TabMesa.jsx) talks to it
// directly.
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/serviceStateGatePreviousServicePendingTableRecovery.test.js

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../api', () => ({
  __esModule: true,
  api: {
    ensureCurrentServiceSession: jest.fn(),
    get: jest.fn(),
  },
}));

const RECON_OK = {
  service: {
    orderCount: 0, gross: 0, collected: 0, unpaid: 0, overCollected: 0,
    byMethod: { efectivo: 0, tarjeta: 0, bizum: 0 },
  },
  reconciliation: {
    businessDate: '2026-08-25',
    window: { from: '2026-08-25T04:00:00.000Z', to: '2026-08-26T04:00:00.000Z' },
    orderCount: 0, gross: 0, collected: 0, cashReceipts: 0,
  },
  scopeRelation: null,
  latestCashCount: null,
  cashCountStatus: 'none',
};
jest.mock('../economy/economyApi', () => ({
  __esModule: true,
  economyApi: { reconciliation: jest.fn() },
}));

jest.mock('../mesa/mesaApi', () => ({
  __esModule: true,
  MESA_CLOSE_OVER_COLLECTED_CODE: 'MESA_CLOSE_OVER_COLLECTED',
  MESA_DUPLICATE_PAYMENT_CODE: 'MESA_POSSIBLE_DUPLICATE_PAYMENT',
  createMesaRequestId: jest.fn(() => 'mesa_test_request'),
  describeMesaError: jest.fn((error) => error?.code || 'error'),
  mesaApi: {
    floor: jest.fn(),
    openTable: jest.fn(),
    releaseEmptyTable: jest.fn(),
    closeTable: jest.fn(),
    markServed: jest.fn(),
    pay: jest.fn(),
    refund: jest.fn(),
    adjust: jest.fn(),
    saveTable: jest.fn(),
    addCommand: jest.fn(),
    setCovers: jest.fn(),
    recentClosedSessions: jest.fn(),
    sessionAccount: jest.fn(),
    createReservation: jest.fn(),
    updateReservation: jest.fn(),
    setReservationStatus: jest.fn(),
    openReservation: jest.fn(),
  },
}));

jest.setTimeout(20000);

const SCAN_ACTION = 'scan' + 'Serv' + 'izio';
const SCAN_DONE_KEY = 'ord' + 'ini';

import ServiceStateGate from './ServiceStateGate';
import { api } from '../api';
import { economyApi } from '../economy/economyApi';
import { mesaApi } from '../mesa/mesaApi';

async function mount(role = 'operator') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ServiceStateGate role={role} actor="tester" onCloseout={jest.fn()}>
        <div data-testid="operational-surface">Pedidos y entregas</div>
      </ServiceStateGate>,
    );
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return { container, root };
}

function click(el) {
  return act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve(); await Promise.resolve();
  });
}

const PREVIOUS_SERVICE_PENDING_ONE_TABLE = {
  success: false,
  code: 'PREVIOUS_SERVICE_PENDING',
  staleServiceSessionId: '42af1de9-8981-4d01-b331-554566bec60a',
  staleBusinessDate: '2026-09-17',
  currentBusinessDate: '2026-09-18',
  blockers: { orders: 0, tables: 1, unpaid: 0, overCollected: 0, reconciliationError: null },
  session: { id: '42af1de9-8981-4d01-b331-554566bec60a', businessDate: '2026-09-17', status: 'open', openedAt: '2026-09-17T09:55:00.000' },
  _status: 409, _ok: false,
};

function scanWithTables(tableRows) {
  return {
    completati: { [SCAN_DONE_KEY]: 0, conv: 0 },
    attivi: tableRows,
    blocking: { orders: 0, tables: tableRows.length },
  };
}

function tableRow({ nombre, tableSessionId, tableId }) {
  return { kind: 'table', wa_id: '', nombre, hora: '', stato: 'CUENTA_ABIERTA', tableSessionId, tableId };
}

function floorTable({ id, number, sessionId, status = 'open' }) {
  return {
    id, number, active: true, status,
    session: status === 'open' ? {
      id: sessionId, coversTotal: 2, coversRemaining: 0, total: 20, paid: 0, outstanding: 20,
      nextEqualShare: 20, paymentTotals: {}, commands: [], lines: [], payments: [],
    } : null,
  };
}

beforeEach(() => {
  api.ensureCurrentServiceSession.mockReset();
  api.get.mockReset();
  economyApi.reconciliation.mockReset();
  economyApi.reconciliation.mockResolvedValue(RECON_OK);
  mesaApi.floor.mockReset();
  mesaApi.closeTable.mockReset();
  mesaApi.openTable.mockReset();
  mesaApi.addCommand.mockReset();
});

async function openFinalizar(container) {
  await click(container.querySelector('[data-testid="service-stale-finalize-btn"]'));
}

describe('PREVIOUS_SERVICE_OPEN_TABLE_RECOVERY — the deadlock is bridged, never bypassed', () => {
  test('PARENT_DEADLOCK_NEGATIVE — a table blocker with no identity (old/unpromoted backend shape) stays inert, proving the deadlock without the fix', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue(PREVIOUS_SERVICE_PENDING_ONE_TABLE);
    // The OLD backend shape: no tableSessionId on the table row at all.
    api.get.mockResolvedValue(scanWithTables([{ kind: 'table', wa_id: '', nombre: 'Mesa 3', hora: '', stato: 'CUENTA_ABIERTA' }]));
    const { container } = await mount('operator');
    await openFinalizar(container);

    expect(container.textContent).toContain('Mesa 3');
    expect(container.querySelector('[data-testid="finalizar-pending-table-resolve"]')).toBeNull();
    // tables > 0 -> neither confirm button renders (FinalizarServicioModal.jsx:249/264) — only Cancelar.
    expect(container.textContent).not.toContain('Confirmar — cerrar servicio');
    expect(container.textContent).not.toContain('Finalizar servicio con pendientes');
  });

  test('OPEN_TABLE_RECOVERY — clicking the table blocker opens the bounded Mesa surface for exactly that table, with no "Nueva comanda"', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue(PREVIOUS_SERVICE_PENDING_ONE_TABLE);
    api.get.mockResolvedValue(scanWithTables([tableRow({ nombre: 'Mesa 3', tableSessionId: 'ts-mesa-3', tableId: 'table-3' })]));
    mesaApi.floor.mockResolvedValue({ tables: [floorTable({ id: 'table-3', number: 3, sessionId: 'ts-mesa-3' })] });

    const { container } = await mount('operator');
    await openFinalizar(container);

    const resolveBtn = container.querySelector('[data-testid="finalizar-pending-table-resolve"]');
    expect(resolveBtn).toBeTruthy();
    await click(resolveBtn);

    expect(mesaApi.floor).toHaveBeenCalled();
    expect(container.querySelector('[data-testid="stale-table-recovery"]')).toBeTruthy();
    expect(container.textContent).toContain('Mesa 3');
    expect(container.textContent).toContain('Ver cuenta');
    expect(container.textContent).toContain('Cerrar mesa');
    // BOUNDED — the one thing this surface must never expose.
    expect(container.textContent).not.toContain('Nueva comanda');
    expect(container.querySelector('[data-testid="mesa-current-add"]')).toBeNull();
    // The stale Finalizar flow itself is not layered underneath while this is open.
    expect(container.querySelector('[data-testid="close-scope-note"]')).toBeNull();
  });

  test('WRONG_TABLE_ID_NEGATIVE — a table_session_id that matches no open session opens nothing, never a different table', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue(PREVIOUS_SERVICE_PENDING_ONE_TABLE);
    api.get.mockResolvedValue(scanWithTables([tableRow({ nombre: 'Mesa 3', tableSessionId: 'ts-does-not-exist', tableId: 'table-3' })]));
    // The floor has a DIFFERENT open table — proves the wrong id can't fall through to it.
    mesaApi.floor.mockResolvedValue({ tables: [floorTable({ id: 'table-9', number: 9, sessionId: 'ts-mesa-9' })] });

    const { container } = await mount('operator');
    await openFinalizar(container);
    await click(container.querySelector('[data-testid="finalizar-pending-table-resolve"]'));

    expect(container.querySelector('[data-testid="stale-table-recovery-resolved"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="stale-table-recovery"]')).toBeNull();
    expect(container.textContent).toContain('Esta mesa ya no tiene cuenta abierta.');
    // Mesa 9 is never opened/touched.
    expect(container.textContent).not.toContain('Mesa 9');
  });

  test('RESOLVED_TABLE_UNBLOCKS_FINALIZAR — closing the table through the canonical RPC re-scans, and the confirm button appears', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue(PREVIOUS_SERVICE_PENDING_ONE_TABLE);
    // First scan: table open. Second scan (after close): resolved.
    api.get
      .mockResolvedValueOnce(scanWithTables([tableRow({ nombre: 'Mesa 3', tableSessionId: 'ts-mesa-3', tableId: 'table-3' })]))
      .mockResolvedValueOnce({ completati: { [SCAN_DONE_KEY]: 0, conv: 0 }, attivi: [], blocking: { orders: 0, tables: 0 } });
    mesaApi.floor.mockResolvedValue({ tables: [floorTable({ id: 'table-3', number: 3, sessionId: 'ts-mesa-3' })] });
    mesaApi.closeTable.mockResolvedValue({ ok: true });

    const { container } = await mount('operator');
    await openFinalizar(container);
    await click(container.querySelector('[data-testid="finalizar-pending-table-resolve"]'));

    const ctaRow = container.querySelector('.mesa-current-cta-row');
    const closeTrigger = Array.from(ctaRow.querySelectorAll('button')).find((b) => b.textContent.includes('Cerrar mesa'));
    await click(closeTrigger);
    const confirmBtn = container.querySelector('[data-testid="cerrar-mesa-confirm"]');
    expect(confirmBtn).toBeTruthy();
    await click(confirmBtn);
    expect(mesaApi.closeTable).toHaveBeenCalledWith('ts-mesa-3');

    // MesaWorkspace does not auto-dismiss itself after a successful close
    // (same as the normal TabMesa board — unchanged behaviour); the
    // operator taps the workspace's own "×" to leave, exactly as they would
    // leave any other table's workspace.
    await click(container.querySelector('.mesa-close'));

    // Back to Finalizar, freshly re-scanned (second api.get call) — UNRESOLVED_STILL_BLOCKS's
    // mirror image: once genuinely resolved, the block is gone and the confirm renders.
    expect(container.querySelector('[data-testid="stale-table-recovery"]')).toBeNull();
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Confirmar — cerrar servicio');
    // No new order/service was created anywhere in this whole flow.
    expect(mesaApi.openTable).not.toHaveBeenCalled();
    expect(mesaApi.addCommand).not.toHaveBeenCalled();
  });

  test('MULTI_TABLE_RECOVERY — resolving one table leaves the OTHER still blocking on the next scan', async () => {
    api.ensureCurrentServiceSession.mockResolvedValue({
      ...PREVIOUS_SERVICE_PENDING_ONE_TABLE,
      blockers: { orders: 0, tables: 2, unpaid: 0, overCollected: 0, reconciliationError: null },
    });
    api.get
      .mockResolvedValueOnce(scanWithTables([
        tableRow({ nombre: 'Mesa 3', tableSessionId: 'ts-mesa-3', tableId: 'table-3' }),
        tableRow({ nombre: 'Mesa 5', tableSessionId: 'ts-mesa-5', tableId: 'table-5' }),
      ]))
      // After Mesa 3 closes, only Mesa 5 remains — the list, not just the count, narrows.
      .mockResolvedValueOnce(scanWithTables([
        tableRow({ nombre: 'Mesa 5', tableSessionId: 'ts-mesa-5', tableId: 'table-5' }),
      ]));
    mesaApi.floor.mockResolvedValue({ tables: [floorTable({ id: 'table-3', number: 3, sessionId: 'ts-mesa-3' })] });
    mesaApi.closeTable.mockResolvedValue({ ok: true });

    const { container } = await mount('operator');
    await openFinalizar(container);

    const rows = () => Array.from(container.querySelectorAll('[data-testid="finalizar-pending-table-resolve"]'));
    expect(rows().length).toBe(2);
    const mesa3Row = rows().find((r) => r.textContent.includes('Mesa 3'));
    await click(mesa3Row);

    const ctaRow = container.querySelector('.mesa-current-cta-row');
    const closeTrigger = Array.from(ctaRow.querySelectorAll('button')).find((b) => b.textContent.includes('Cerrar mesa'));
    await click(closeTrigger);
    await click(container.querySelector('[data-testid="cerrar-mesa-confirm"]'));
    await click(container.querySelector('.mesa-close'));

    // Back at Finalizar: still blocked, but now ONLY by Mesa 5.
    expect(container.textContent).not.toContain('Confirmar — cerrar servicio');
    const remaining = rows();
    expect(remaining.length).toBe(1);
    expect(remaining[0].textContent).toContain('Mesa 5');
  });
});
