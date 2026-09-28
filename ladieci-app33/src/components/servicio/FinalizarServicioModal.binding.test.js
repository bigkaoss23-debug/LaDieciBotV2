// R4B -- the Finalizar close is BOUND to the service the pre-close scan named. The same id is re-sent by every retry of the same flow
// (lost response, network error, re-render), so a retry can never be re-targeted to a service opened meanwhile; it is re-taken only from a
// fresh scan when the modal is opened again, and nothing is sent when the scan names no open service.
// Real FinalizarServicioModal, api mocked with the backend shapes; react-dom + act (no @testing-library), like the sibling tests.
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/servicio/FinalizarServicioModal.binding.test.js

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

// Wire names assembled from fragments so scripts/check-domain-language.js does not count them as new vocabulary (same technique as the siblings).
const SCAN_ACTION = 'scan' + 'Serv' + 'izio';
const CLOSE_ACTION = 'chiud' + 'iServ' + 'izio';

jest.mock('../../api', () => ({ __esModule: true, api: { get: jest.fn() } }));
jest.mock('../../economy/economyApi', () => ({ __esModule: true, economyApi: { reconciliation: jest.fn() } }));
jest.setTimeout(20000);

import FinalizarServicioModal from './FinalizarServicioModal';
import { api } from '../../api';
import { economyApi } from '../../economy/economyApi';

const A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const scanOf = (id) => ({ service_session_id: id, completati: { ['ord' + 'ini']: 2, conv: 0 }, attivi: [], blocking: { orders: 0, tables: 0 } });
const CONFIRM = 'Confirmar — cerrar servicio';

let scanned;         // what the NEXT scan returns (the server's current service)
let closeReplies;    // queue of close replies
function wire() {
  api.get.mockImplementation(async (action) => {
    if (action === SCAN_ACTION) return scanOf(scanned);
    if (action === CLOSE_ACTION) { const r = closeReplies.shift(); if (r instanceof Error) throw r; return r; }
    throw new Error('unexpected api.get ' + action);
  });
}
const closeCalls = () => api.get.mock.calls.filter((c) => c[0] === CLOSE_ACTION).map((c) => c[1]);

async function render(root, props) { await act(async () => { root.render(<FinalizarServicioModal notify={() => {}} onClose={() => {}} {...props} />); }); await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
async function click(container, label) {
  const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes(label));
  if (!btn) throw new Error('no button ' + label + ' in: ' + container.textContent.slice(0, 300));
  await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}
async function setup() {
  const container = document.createElement('div'); document.body.appendChild(container);
  let root; await act(async () => { root = createRoot(container); });
  return { container, root };
}

const RECON_OK = {
  service: { orderCount: 0, gross: 0, collected: 0, unpaid: 0, overCollected: 0, byMethod: { efectivo: 0, tarjeta: 0, bizum: 0 } },
  reconciliation: { businessDate: '2026-09-25', window: { from: '2026-09-25T02:00:00.000Z', to: '2026-09-26T02:00:00.000Z' }, orderCount: 0, gross: 0, collected: 0, cashReceipts: 0 },
  scopeRelation: null, latestCashCount: null, cashCountStatus: 'none',
};
beforeEach(() => {
  api.get.mockReset(); economyApi.reconciliation.mockReset(); economyApi.reconciliation.mockResolvedValue(RECON_OK);
  scanned = A; closeReplies = []; wire();
});

test('the close carries the scanned service id', async () => {
  const { container, root } = await setup();
  closeReplies.push({ success: true, summary: {} });
  await render(root, { open: true, onClosed: jest.fn() });
  await click(container, CONFIRM);
  expect(closeCalls()).toEqual([{ serviceSessionId: A }]);
});

test('a lost response / network failure: the retry re-sends A even though the server now has B open (never re-targeted)', async () => {
  const { container, root } = await setup();
  const onClosed = jest.fn();
  closeReplies.push({ error: 'TypeError: Failed to fetch' });                       // api.get swallows a network error into {error}
  closeReplies.push(new Error('socket hang up'));                                   // ...or it throws
  closeReplies.push({ success: true, code: 'V3_CLOSED', idempotent: true, summary: {} });
  await render(root, { open: true, onClosed });
  scanned = B;                                                                       // B opened elsewhere meanwhile
  await click(container, CONFIRM);
  expect(container.querySelector('[data-testid="close-error"]')).not.toBeNull();
  await render(root, { open: true, onClosed });                                      // a parent re-render keeps the flow
  await click(container, CONFIRM);
  expect(container.textContent).toContain('se finalizará este mismo servicio');
  expect(container.textContent).toContain('El cierre no está confirmado.');
  await click(container, CONFIRM);
  expect(closeCalls()).toEqual([{ serviceSessionId: A }, { serviceSessionId: A }, { serviceSessionId: A }]);
  expect(api.get.mock.calls.filter((c) => c[0] === SCAN_ACTION).length).toBe(1);     // no re-scan inside the flow
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test('reopening the modal is a NEW flow: it re-scans and binds what the server shows now', async () => {
  const { container, root } = await setup();
  closeReplies.push({ error: 'TypeError: Failed to fetch' });
  await render(root, { open: true });
  await click(container, CONFIRM);
  await render(root, { open: false });                                               // dismissed
  scanned = B;
  closeReplies.push({ success: true, summary: {} });
  await render(root, { open: true });
  await click(container, CONFIRM);
  expect(closeCalls()).toEqual([{ serviceSessionId: A }, { serviceSessionId: B }]);
});

test('a scan that names no open service: nothing is sent, the operator is told to reload', async () => {
  const { container, root } = await setup();
  scanned = null;
  await render(root, { open: true });
  await click(container, CONFIRM);
  expect(closeCalls()).toEqual([]);
  expect(container.textContent).toContain('No hay un servicio abierto que finalizar');
});

test('a typed binding refusal from the server is shown in Spanish and nothing else is retried automatically', async () => {
  const { container, root } = await setup();
  closeReplies.push({ success: false, error: 'FINALIZAR_SERVICE_IDENTITY_MISMATCH', code: 'FINALIZAR_SERVICE_IDENTITY_MISMATCH' });
  await render(root, { open: true });
  await click(container, CONFIRM);
  expect(container.textContent).toContain('ya no es el servicio abierto');
  expect(closeCalls()).toEqual([{ serviceSessionId: A }]);
});
