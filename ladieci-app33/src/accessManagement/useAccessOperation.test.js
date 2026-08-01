// useAccessOperation — the ONE reusable write-operation controller (V3-I). Tested via a
// minimal harness component (react-dom + react-dom/test-utils, same house style as
// src/components/pinManagementFlow.test.js — no @testing-library dependency, no hook-
// testing library either).
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useAccessOperation } from './useAccessOperation';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('./clientRequestId', () => ({
  __esModule: true,
  generateClientRequestId: jest.fn(),
}));
const { generateClientRequestId } = require('./clientRequestId');

const { getPinStepUp, setPinStepUp, clearPinStepUp } = require('../operationalSession');

function click(el) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

function Harness({ apiRef, opRef }) {
  const op = useAccessOperation();
  opRef.current = op;
  return (
    <div>
      <div data-testid="phase">{op.phase}</div>
      <div data-testid="error">{op.errorMessage}</div>
      <button data-testid="run" onClick={() => op.run(apiRef.current)}>run</button>
      <button data-testid="cancel" onClick={() => op.cancel()}>cancel</button>
    </div>
  );
}

async function mount(apiFn) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const apiRef = { current: apiFn };
  const opRef = { current: null };
  await act(async () => { root.render(<Harness apiRef={apiRef} opRef={opRef} />); });
  return { container, root, apiRef, opRef };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

beforeEach(() => {
  jest.clearAllMocks();
  clearPinStepUp();
  generateClientRequestId.mockImplementation(() => `id-${Math.random().toString(36).slice(2)}`);
});
afterEach(() => { clearPinStepUp(); });

test('with no step-up proof, run() moves to awaitingStepUp and never calls the write', async () => {
  const call = jest.fn();
  const { container, root } = await mount(call);
  click(container.querySelector('[data-testid="run"]'));
  await flush();
  expect(container.querySelector('[data-testid="phase"]').textContent).toBe('awaitingStepUp');
  expect(call).not.toHaveBeenCalled();
  unmount(container, root);
});

test('with a valid proof, run() submits once with (proof, clientRequestId) and reaches success', async () => {
  setPinStepUp('PROOF-1', 600);
  const call = jest.fn(async (proof, reqId) => {
    expect(proof).toBe('PROOF-1');
    expect(typeof reqId).toBe('string');
    return { kind: 'ok' };
  });
  const { container, root } = await mount(call);
  click(container.querySelector('[data-testid="run"]'));
  await flush();
  expect(call).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[data-testid="phase"]').textContent).toBe('success');
  unmount(container, root);
});

test('the SAME clientRequestId is reused across retries of one attempt', async () => {
  setPinStepUp('PROOF-1', 600);
  const seenIds = [];
  const call = jest.fn(async (proof, reqId) => { seenIds.push(reqId); return { kind: 'server', status: 500, code: null }; });
  const { container, root } = await mount(call);
  click(container.querySelector('[data-testid="run"]'));
  await flush();
  click(container.querySelector('[data-testid="run"]'));
  await flush();
  expect(seenIds.length).toBe(2);
  expect(seenIds[0]).toBe(seenIds[1]); // same attempt, same idempotency key
  unmount(container, root);
});

test('cancel() drops the clientRequestId — the NEXT run() gets a fresh one', async () => {
  setPinStepUp('PROOF-1', 600);
  const seenIds = [];
  const call = jest.fn(async (proof, reqId) => { seenIds.push(reqId); return { kind: 'server', status: 500, code: null }; });
  const { container, root } = await mount(call);
  click(container.querySelector('[data-testid="run"]'));
  await flush();
  click(container.querySelector('[data-testid="cancel"]'));
  await flush();
  expect(container.querySelector('[data-testid="phase"]').textContent).toBe('idle');
  click(container.querySelector('[data-testid="run"]'));
  await flush();
  expect(seenIds.length).toBe(2);
  expect(seenIds[0]).not.toBe(seenIds[1]);
  unmount(container, root);
});

test('a step_up_required result clears the stale proof and returns to awaitingStepUp', async () => {
  setPinStepUp('STALE-PROOF', 600);
  const call = jest.fn(async () => ({ kind: 'step_up_required', status: 403, code: 'AUTH_STEP_UP_REQUIRED' }));
  const { container, root } = await mount(call);
  click(container.querySelector('[data-testid="run"]'));
  await flush();
  expect(container.querySelector('[data-testid="phase"]').textContent).toBe('awaitingStepUp');
  expect(getPinStepUp()).toBeNull();
  unmount(container, root);
});

test('retryAfterStepUp automatically re-attempts the SAME pending write with a fresh proof', async () => {
  const call = jest.fn(async (proof) => (proof === 'FRESH-PROOF' ? { kind: 'ok' } : { kind: 'step_up_required', status: 403, code: 'AUTH_STEP_UP_REQUIRED' }));
  const { container, root, opRef } = await mount(call);
  // First attempt: no proof at all -> awaitingStepUp, call() never invoked yet.
  click(container.querySelector('[data-testid="run"]'));
  await flush();
  expect(container.querySelector('[data-testid="phase"]').textContent).toBe('awaitingStepUp');
  expect(call).not.toHaveBeenCalled();
  // Human completes step-up; the panel calls setPinStepUp then retryAfterStepUp().
  setPinStepUp('FRESH-PROOF', 600);
  await act(async () => { opRef.current.retryAfterStepUp(); });
  await flush();
  expect(call).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[data-testid="phase"]').textContent).toBe('success');
  unmount(container, root);
});

test('a generic failure sets phase:error and a non-empty Spanish message, never the raw code', async () => {
  setPinStepUp('PROOF-1', 600);
  const call = jest.fn(async () => ({ kind: 'waiter_open_tables', status: 409, code: 'AUTH_WAITER_HAS_OPEN_TABLES' }));
  const { container, root } = await mount(call);
  click(container.querySelector('[data-testid="run"]'));
  await flush();
  expect(container.querySelector('[data-testid="phase"]').textContent).toBe('error');
  const msg = container.querySelector('[data-testid="error"]').textContent;
  expect(msg.length).toBeGreaterThan(0);
  expect(msg).not.toMatch(/AUTH_WAITER_HAS_OPEN_TABLES/);
  unmount(container, root);
});

test('busy/double-submit guard: two rapid run() calls before the first resolves only invoke the write once', async () => {
  setPinStepUp('PROOF-1', 600);
  let resolveCall;
  const call = jest.fn(() => new Promise((res) => { resolveCall = res; }));
  const { container, root } = await mount(call);
  const runBtn = container.querySelector('[data-testid="run"]');
  click(runBtn);
  click(runBtn);
  click(runBtn);
  await flush();
  expect(call).toHaveBeenCalledTimes(1);
  await act(async () => { resolveCall({ kind: 'ok' }); });
  unmount(container, root);
});

test('after success, the clientRequestId resets — a later independent operation gets a fresh one', async () => {
  setPinStepUp('PROOF-1', 600);
  const seenIds = [];
  let n = 0;
  const call = jest.fn(async (proof, reqId) => { seenIds.push(reqId); n += 1; return { kind: 'ok' }; });
  const { container, root } = await mount(call);
  click(container.querySelector('[data-testid="run"]'));
  await flush();
  click(container.querySelector('[data-testid="run"]')); // a brand-new attempt after success
  await flush();
  expect(n).toBe(2);
  expect(seenIds[0]).not.toBe(seenIds[1]);
  unmount(container, root);
});
