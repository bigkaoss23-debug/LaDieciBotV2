// ECONOMÍA V2 / SMOKE FIX BATCH — the scope contract.
//
// Manual smoke on 70ce145 proved the period selector was decorative: the pills
// changed which rows were summed but never the window the screen displayed, so
// "Día" reported `21/07 04:00 → 26/08 04:00` while claiming "Día operativo
// 25/08", and stale figures survived a scope change. This suite pins the fix:
//
//   * the scope is SENT to the server and the SERVER's resolved window is what
//     the screen renders, so the two can never disagree;
//   * changing the scope re-asks and drops the previous answer;
//   * General's two inner views (Economía / Ventas) share ONE scope and ONE
//     request — same scope, different view;
//   * Caja keeps its own certified window and its append-only cash contract.
//
// The 25/08 figures below are the real staging fixture:
//   Ventas 123,50 (#999030 54,50 + #999031 69,00) · Pedidos 2
//   Cobrado 158,50 = efectivo 89,50 + tarjeta 69,00
// The efectivo legitimately exceeds Service B's 54,50 because 35,00 was taken
// on 25/08 for an OLDER service — receipts count by their own instant. That is
// N-9 behaviour and is asserted here, not "fixed".
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/economia/economiaSmokeFixBatch.test.js

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../api', () => ({
  __esModule: true,
  // language-guard: allow-legacy getStorico/getSerata are the existing api.js method names being mocked, not new vocabulary
  api: { getStorico: jest.fn(), getSerata: jest.fn(), getEconomiaLedger: jest.fn(), getOrdenes: jest.fn(), },
  sb: { select: jest.fn(async () => []) },
}));

jest.mock('../../economy/economyApi', () => ({
  __esModule: true,
  EconomyApiError: class EconomyApiError extends Error {
    constructor(code, status = 0) { super(code); this.name = 'EconomyApiError'; this.code = code; this.status = status; }
  },
  createEconomyRequestId: jest.fn(() => 'cash_testrequestid0001'),
  economyApi: { snapshot: jest.fn(), listCashCounts: jest.fn(), createCashCount: jest.fn() },
}));

import EconomiaPage from '../EconomiaPage';
import { ECONOMIA_TABS } from './EconomiaBottomNav';
import { api } from '../../api';
import { economyApi, createEconomyRequestId } from '../../economy/economyApi';

// ── the real 25/08 staging fixture ─────────────────────────────────────────
const DAY = '2026-08-25';
const DIA_WINDOW = Object.freeze({
  preset: 'hoy', label: 'Hoy',
  from: '2026-08-25T02:00:00.000Z',  // 25/08 04:00 Madrid
  to: '2026-08-26T02:00:00.000Z',    // 26/08 04:00 Madrid
  timezone: 'Europe/Madrid', businessDate: DAY, serviceSessionId: null, bounds: '[from,to)',
});
const snapshotFor = (window, over = {}) => ({
  ok: true,
  window,
  obligation: { gross: 123.5, unpaid: 0, voided: 0, refunded: 0, ...(over.obligation || {}) },
  receipts: {
    collected: 158.5, collectedGross: 158.5, refunded: 0,
    byMethod: { efectivo: 89.5, tarjeta: 69, bizum: 0, other: 0 },
    ...(over.receipts || {}),
  },
  counts: { obligations: 2, obligationsCancelled: 0, obligationsUnpaid: 0, receiptEvents: 6, payments: 6, refunds: 0 },
  economicBreakdown: { obligations: {}, receipts: {}, source: 'stamped_era_read_rule' },
  windowCrossing: { obligationBeforeWindowReceiptInside: [], obligationInsideWindowReceiptAfter: [], receiptsSplitAcrossBoundary: [] },
  drillDown: { obligations: [], receipts: [], legacyReceipts: [] },
  serviceProvenance: [],
  ...(over.root || {}),
});
// Two real persisted sessions on 25/08 — one closed (B), one open (C). These
// are the staging fixtures, and they are what the Servicios browser lists.
const SERVICE_B = '51cf341a-2609-4a74-9e12-c49a0a3d6d84';
const SERVICE_C = '42af1de9-8981-4d01-b331-554566bec60a';
const PROVENANCE = [
  { serviceSessionId: SERVICE_B, businessDate: DAY, status: 'closed',
    openedAt: '2026-08-25T16:55:20.049Z', closedAt: '2026-08-25T17:01:33.177Z' },
  { serviceSessionId: SERVICE_C, businessDate: DAY, status: 'open',
    openedAt: '2026-08-25T17:02:59.058Z', closedAt: null },
];
const DIA = snapshotFor(DIA_WINDOW, { root: { serviceProvenance: PROVENANCE } });

// Service C as the reader returns it: an OPEN service runs to `asOf`.
const SERVICE_C_WINDOW = Object.freeze({
  preset: 'servicio', label: 'Servicio',
  from: '2026-08-25T17:02:59.058Z', to: '2026-08-25T18:30:00.000Z',
  timezone: 'Europe/Madrid', businessDate: DAY, serviceSessionId: SERVICE_C, bounds: '[from,to)',
});
const SERVICE_C_SNAPSHOT = snapshotFor(SERVICE_C_WINDOW, {
  obligation: { gross: 101, unpaid: 32, voided: 0, refunded: 0 },
  receipts: { collected: 69, collectedGross: 69, refunded: 0, byMethod: { efectivo: 0, tarjeta: 69, bizum: 0, other: 0 } },
  root: {
    counts: { obligations: 3, obligationsCancelled: 0, obligationsUnpaid: 2, receiptEvents: 2, payments: 2, refunds: 0 },
    serviceProvenance: PROVENANCE,
    drillDown: {
      obligations: [
        { id: '#999031', amount: 69, unpaidAmount: 0, refundedAmount: 0, cancelled: false, time: '19:10', paymentState: 'paid' },
        { id: '#999032', amount: 15, unpaidAmount: 15, refundedAmount: 0, cancelled: false, time: '19:40', paymentState: 'unpaid' },
        { id: '#999033', amount: 17, unpaidAmount: 17, refundedAmount: 0, cancelled: false, time: '19:55', paymentState: 'unpaid' },
      ], receipts: [], legacyReceipts: [],
    },
  },
});

// language-guard: allow-legacy the getSerata payload keys below are the existing aggregate field names, not new vocabulary
const SERATA = {
  // language-guard: allow-legacy pizzeTot is the existing aggregate field name required by the fixture shape, not new vocabulary
  incasso: 123.5, ticketMedio: 61.75, pizzeTot: 2, bevandeTot: 0,
  // language-guard: allow-legacy RITIRO is the existing delivery-type enum value, not new vocabulary
  consegne: { DOMICILIO: 0, RITIRO: 2 },
  // language-guard: allow-legacy the payment-bucket field name is the existing getSerata payload key, not new vocabulary
  pagamenti: {
    efectivo: { incasso: 89.5, count: 4 }, tarjeta: { incasso: 69, count: 2 },
    bizum: { incasso: 0, count: 0 }, no_especificado: { incasso: 0, count: 0 },
  },
  canali: { MANUAL: 2 }, prodotti: [],
  // language-guard: allow-legacy the order-list field name is the existing getSerata payload key, not new vocabulary
  ordini: [{ id: '#999030', totale: 54.5, estado: 'RETIRADO', tipo_consegna: 'RITIRO', canal: 'MANUAL', items: [], fecha: DAY, hora: '20:00', ts: Date.now() }],
};

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<EconomiaPage onBack={() => {}} />); });
  await settle();
  return container;
}
const settle = async () => { await act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); }); };
const t = (c, id) => c.querySelector(`[data-testid="${id}"]`);
const clickEl = async (el) => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
};
const clickTab = (c, id) => clickEl(t(c, `economia-tab-${id}`));
const setInput = async (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await settle();
};
const lastSnapshotArg = () => economyApi.snapshot.mock.calls[economyApi.snapshot.mock.calls.length - 1][0];

beforeEach(() => {
  jest.clearAllMocks();
  // language-guard: allow-legacy getStorico/getSerata are the existing api.js method names being mocked, not new vocabulary
  api.getStorico.mockReset().mockResolvedValue({ righe: [] });
  // language-guard: allow-legacy getSerata is the existing api.js method name being mocked, not new vocabulary
  api.getSerata.mockReset().mockResolvedValue(SERATA);
  api.getEconomiaLedger.mockReset().mockResolvedValue({ porGiorno: [], window: {} });
  // language-guard: allow-legacy `ordenes` is the existing api.js payload key, not new vocabulary
  api.getOrdenes.mockReset().mockResolvedValue({ ordenes: [
    // language-guard: allow-legacy tipo_consegna/RITIRO are the existing delivery-type field and enum value, not new vocabulary
    { id: '#999031', tipo_consegna: 'RITIRO', canal: 'BANCO', nombre: 'Mesa 2', zona: null },
    // language-guard: allow-legacy tipo_consegna is the existing delivery-type field name, not new vocabulary
    { id: '#999032', tipo_consegna: 'DOMICILIO', canal: 'MANUAL', nombre: 'Big Art', zona: 'Q2' },
    // language-guard: allow-legacy tipo_consegna is the existing delivery-type field name, not new vocabulary
    { id: '#999033', tipo_consegna: 'DOMICILIO', canal: 'MANUAL', nombre: 'Big Art', zona: 'Q2' },
  ] });
  createEconomyRequestId.mockImplementation(() => 'cash_testrequestid0001');
  economyApi.snapshot.mockResolvedValue(DIA);
  economyApi.listCashCounts.mockResolvedValue({ ok: true, counts: [] });
  economyApi.createCashCount.mockResolvedValue({ ok: true, created: true, count: {} });
});

// ── 1-7 · THE SCOPE ACTUALLY CONTROLS THE WINDOW ───────────────────────────
describe('scope · the selector controls the window, and the window is the server\'s', () => {
  test('1 · the day scope renders the operating-day window the server resolved, 04:00 → 04:00', async () => {
    const c = await mount();
    // The smoke defect: a 36-day interval on screen under a one-day label.
    expect(t(c, 'general-window').textContent).toMatch(/25\/0?8 04:00/);
    expect(t(c, 'general-window').textContent).toMatch(/26\/0?8 04:00/);
    expect(t(c, 'general-window').textContent).not.toMatch(/21\/0?7/);
    expect(lastSnapshotArg()).toEqual({ preset: 'hoy' });
  });

  test('2-4 · every scope change re-asks the server with that scope, exactly once', async () => {
    const c = await mount();
    // NOTE: the module legitimately makes calls on mount — General asks for its
    // scope, the Servicios browser asks for the day's sessions, and the
    // (mounted, hidden) Caja panel asks for its own counting window. What
    // matters is the DELTA General adds per scope change.
    for (const key of ['ayer', 'hoy']) {
      const before = economyApi.snapshot.mock.calls.length;
      await clickEl(t(c, `general-scope-${key}`));
      expect(lastSnapshotArg()).toEqual({ preset: key });
      expect(economyApi.snapshot.mock.calls.length - before).toBe(1);
    }
  });

  test('the clock-window presets are gone; the four canonical scopes remain', async () => {
    // Mediodía and Noche looked like services without being services. The
    // product persists real ones, so the selector points at those instead.
    const c = await mount();
    expect(t(c, 'general-scope-mediodia')).toBeNull();
    expect(t(c, 'general-scope-noche')).toBeNull();
    expect(t(c, 'general-scope-hoy')).toBeTruthy();
    expect(t(c, 'general-scope-servicio')).toBeTruthy();
    expect(t(c, 'general-scope-ayer')).toBeTruthy();
    expect(t(c, 'general-scope-personalizado')).toBeTruthy();
    const row = t(c, 'general-scope-row');
    expect(row.querySelectorAll('button')).toHaveLength(4);
    // language-guard: allow-legacy the blocked terms are named inside a NEGATIVE assertion proving they are absent from the UI, not new vocabulary
    expect(row.textContent).not.toMatch(/mediod|noche|pranzo|cena/i);
  });

  test('5 · Personalizado starts from the range just shown, and is sent as real instants', async () => {
    const c = await mount();
    // The contradiction smoke found: empty Desde/Hasta while the PREVIOUS
    // preset's resolved range stayed on screen underneath. The inputs are now
    // seeded from what was just resolved, so the operator edits something real.
    await clickEl(t(c, 'general-scope-personalizado'));
    expect(t(c, 'general-custom-from').value).toBeTruthy();
    expect(t(c, 'general-custom-to').value).toBeTruthy();
    expect(lastSnapshotArg().preset).toBe('personalizado');
    expect(lastSnapshotArg().from).toBe(t(c, 'general-custom-from').value);
    expect(lastSnapshotArg().to).toBe(t(c, 'general-custom-to').value);
    // Editing re-asks with the operator's own instants.
    await setInput(t(c, 'general-custom-from'), '2026-08-25T17:30');
    expect(lastSnapshotArg()).toEqual({
      preset: 'personalizado', from: '2026-08-25T17:30', to: t(c, 'general-custom-to').value,
    });
  });

  test('an incomplete custom range shows no resolved window at all', async () => {
    const c = await mount();
    await clickEl(t(c, 'general-scope-personalizado'));
    await setInput(t(c, 'general-custom-to'), '');
    // No stale range from the previous preset may survive underneath.
    expect(t(c, 'general-window')).toBeNull();
    expect(t(c, 'general-scope-incomplete')).toBeTruthy();
  });

  test('6 · returning to the day scope re-asks for it and never reuses the previous window', async () => {
    const c = await mount();
    await clickEl(t(c, 'general-scope-ayer'));
    await clickEl(t(c, 'general-scope-hoy'));
    expect(lastSnapshotArg()).toEqual({ preset: 'hoy' });
    expect(t(c, 'general-window').textContent).toMatch(/25\/0?8 04:00/);
  });

  test('7 · figures from the previous scope do not survive the change', async () => {
    const c = await mount();
    expect(t(c, 'general-kpi-cobrado').textContent).toContain('158,50');
    // A scope whose answer has not arrived yet must show no figure at all —
    // never the last one, which belonged to a different window.
    let release;
    economyApi.snapshot.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    await clickEl(t(c, 'general-scope-ayer'));
    expect(t(c, 'general-kpi-cobrado').textContent).not.toContain('158,50');
    expect(t(c, 'general-kpi-cobrado').textContent).toContain('···');
    await act(async () => { release(snapshotFor({ ...DIA_WINDOW, preset: 'ayer' }, { receipts: { collected: 10, byMethod: { efectivo: 10, tarjeta: 0, bizum: 0, other: 0 } } })); });
    await settle();
    expect(t(c, 'general-kpi-cobrado').textContent).toContain('10,00');
  });
});

// ── 8-10 · ONE SCOPE, TWO VIEWS ────────────────────────────────────────────
describe('inner views · Economía and Ventas share one scope and one request', () => {
  test('8-9 · switching views preserves the scope and asks nothing new', async () => {
    const c = await mount();
    await clickEl(t(c, 'general-scope-ayer'));
    const calls = economyApi.snapshot.mock.calls.length;
    await clickEl(t(c, 'general-view-ventas'));
    expect(t(c, 'general-view-panel-ventas')).toBeTruthy();
    await clickEl(t(c, 'general-view-economia'));
    expect(t(c, 'general-view-panel-economia')).toBeTruthy();
    // Same scope still selected, and the reader was never re-asked.
    expect(t(c, 'general-scope-ayer').getAttribute('aria-pressed')).toBe('true');
    expect(economyApi.snapshot.mock.calls.length).toBe(calls);
  });

  test('10 · the child views carry no picker of their own', async () => {
    const c = await mount();
    const pickers = () => ['hoy', 'ayer', 'personalizado', 'servicio']
      .map((k) => c.querySelectorAll(`[data-testid="general-scope-${k}"]`).length);
    expect(pickers().every((n) => n === 1)).toBe(true);
    await clickEl(t(c, 'general-view-ventas'));
    expect(pickers().every((n) => n === 1)).toBe(true);
    expect(t(c, 'general-view-panel-ventas').querySelector('[data-testid="general-scope-hoy"]')).toBeNull();
    expect(t(c, 'general-view-panel-ventas').querySelector('input[type="datetime-local"]')).toBeNull();
  });
});

// ── 11-15 · THE 25/08 FIXTURE ──────────────────────────────────────────────
describe('25/08 · the figures the smoke run proved', () => {
  test('11-15 · ventas, pedidos, cobrado and the two live methods', async () => {
    const c = await mount();
    expect(t(c, 'general-kpi-ventas').textContent).toContain('123,50');   // 11
    expect(t(c, 'general-kpi-ventas').textContent).toContain('2 pedidos'); // 12
    expect(t(c, 'general-kpi-cobrado').textContent).toContain('158,50');  // 13
    expect(t(c, 'general-efectivo').textContent).toContain('89,50');      // 14
    expect(t(c, 'general-tarjeta').textContent).toContain('69,00');       // 15
    expect(t(c, 'general-bizum').textContent).toContain('0,00');
    expect(t(c, 'general-otros').textContent).toContain('0,00');
    // Ventas view, same scope, same numbers.
    await clickEl(t(c, 'general-view-ventas'));
    expect(t(c, 'general-ventas-total').textContent).toContain('123,50');
    expect(t(c, 'general-ventas-total').textContent).toContain('2 pedidos');
  });

  test('collected exceeding sales is legitimate and is never reconciled away', async () => {
    // 89,50 efectivo against a 54,50 cash service is a receipt taken today for
    // an older one. The two totals are shown as themselves, never summed and
    // never forced to agree.
    const c = await mount();
    const cobrado = t(c, 'general-kpi-cobrado').textContent;
    const ventas = t(c, 'general-kpi-ventas').textContent;
    expect(cobrado).toContain('158,50');
    expect(ventas).toContain('123,50');
    expect(c.textContent).not.toContain('282,00'); // the meaningless sum
  });

  test('Anulado is a real figure now, not a dash', async () => {
    economyApi.snapshot.mockResolvedValue(snapshotFor(DIA_WINDOW, { obligation: { gross: 123.5, unpaid: 0, voided: 12.5, refunded: 0 } }));
    const c = await mount();
    expect(t(c, 'general-kpi-anulado').textContent).toContain('12,50');
  });
});

// ── SERVICIOS · a real service-session browser ─────────────────────────────
describe('servicios · real persisted sessions, open and closed alike', () => {
  const pickService = async (c, id) => {
    await clickEl(t(c, 'general-scope-servicio'));
    await clickEl(t(c, `general-service-${id}`));
  };

  test('choosing Servicios lists the day\'s persisted sessions with times and state', async () => {
    const c = await mount();
    await clickEl(t(c, 'general-scope-servicio'));
    const picker = t(c, 'general-service-picker');
    expect(picker).toBeTruthy();
    expect(t(c, `general-service-${SERVICE_B}`)).toBeTruthy();
    expect(t(c, `general-service-${SERVICE_C}`)).toBeTruthy();
    // Times and status, never a lunch/dinner classification.
    expect(picker.textContent).toMatch(/Cerrado/);
    expect(picker.textContent).toMatch(/Abierto/);
    expect(picker.textContent).toMatch(/ahora/);
    // language-guard: allow-legacy the blocked terms are named inside a NEGATIVE assertion proving they are absent from the UI, not new vocabulary
    expect(picker.textContent).not.toMatch(/mediod|noche|pranzo|cena/i);
  });

  test('nothing is asked until a service is actually chosen', async () => {
    const c = await mount();
    const before = economyApi.snapshot.mock.calls.length;
    await clickEl(t(c, 'general-scope-servicio'));
    // `servicio` without an id is not a question the reader can answer — asking
    // anyway is exactly what produced "No se ha podido cargar la economía."
    expect(economyApi.snapshot.mock.calls.length).toBe(before);
    expect(t(c, 'general-scope-incomplete').textContent).toMatch(/Elige un servicio/i);
    expect(t(c, 'general-error')).toBeNull();
  });

  test('an OPEN service loads: the id is sent, and its economy renders', async () => {
    // The reproduced bug: Service C is genuinely OPEN and the screen errored.
    // An open service is not a reason for the reader to fail.
    economyApi.snapshot.mockImplementation((args) => Promise.resolve(
      args?.preset === 'servicio' ? SERVICE_C_SNAPSHOT : DIA,
    ));
    const c = await mount();
    await pickService(c, SERVICE_C);
    expect(lastSnapshotArg()).toEqual({ preset: 'servicio', serviceSessionId: SERVICE_C });
    expect(t(c, 'general-error')).toBeNull();
    // The service-level picture smoke expected: 101,00 / 69,00 / 32,00.
    expect(t(c, 'general-kpi-ventas').textContent).toContain('101,00');
    expect(t(c, 'general-kpi-cobrado').textContent).toContain('69,00');
    expect(t(c, 'general-kpi-pendiente').textContent).toContain('32,00');
    expect(t(c, 'general-window').textContent).toMatch(/Abierto/);
  });

  test('a CLOSED service is equally inspectable', async () => {
    economyApi.snapshot.mockImplementation((args) => Promise.resolve(
      args?.serviceSessionId === SERVICE_B
        ? snapshotFor({ ...SERVICE_C_WINDOW, serviceSessionId: SERVICE_B }, { root: { serviceProvenance: PROVENANCE } })
        : DIA,
    ));
    const c = await mount();
    await pickService(c, SERVICE_B);
    expect(lastSnapshotArg()).toEqual({ preset: 'servicio', serviceSessionId: SERVICE_B });
    expect(t(c, 'general-error')).toBeNull();
  });

  test('the chosen service scopes Ventas identically, and survives the view switch', async () => {
    economyApi.snapshot.mockImplementation((args) => Promise.resolve(
      args?.preset === 'servicio' ? SERVICE_C_SNAPSHOT : DIA,
    ));
    const c = await mount();
    await pickService(c, SERVICE_C);
    const calls = economyApi.snapshot.mock.calls.length;

    await clickEl(t(c, 'general-view-ventas'));
    // Same scope, same three orders — not a different window, not a re-ask.
    expect(economyApi.snapshot.mock.calls.length).toBe(calls);
    const rows = c.querySelectorAll('[data-testid="general-ventas-row"]');
    expect(rows).toHaveLength(3);
    expect(t(c, 'general-ventas-total').textContent).toContain('101,00');

    await clickEl(t(c, 'general-view-economia'));
    expect(t(c, `general-service-${SERVICE_C}`).getAttribute('aria-pressed')).toBe('true');
    expect(economyApi.snapshot.mock.calls.length).toBe(calls);
  });

  test('switching service re-scopes both views together', async () => {
    economyApi.snapshot.mockImplementation((args) => Promise.resolve(
      args?.serviceSessionId === SERVICE_C ? SERVICE_C_SNAPSHOT
        : args?.serviceSessionId === SERVICE_B
          ? snapshotFor({ ...SERVICE_C_WINDOW, serviceSessionId: SERVICE_B }, {
            obligation: { gross: 54.5, unpaid: 0, voided: 0, refunded: 0 },
            root: { serviceProvenance: PROVENANCE, counts: { obligations: 1 } },
          })
          : DIA,
    ));
    const c = await mount();
    await pickService(c, SERVICE_C);
    expect(t(c, 'general-kpi-ventas').textContent).toContain('101,00');
    await clickEl(t(c, `general-service-${SERVICE_B}`));
    expect(lastSnapshotArg()).toEqual({ preset: 'servicio', serviceSessionId: SERVICE_B });
    expect(t(c, 'general-kpi-ventas').textContent).toContain('54,50');
    await clickEl(t(c, 'general-view-ventas'));
    expect(t(c, 'general-ventas-total').textContent).toContain('54,50');
  });

  test('leaving Servicios drops the service id, so no scope says one thing and asks another', async () => {
    economyApi.snapshot.mockImplementation((args) => Promise.resolve(
      args?.preset === 'servicio' ? SERVICE_C_SNAPSHOT : DIA,
    ));
    const c = await mount();
    await pickService(c, SERVICE_C);
    await clickEl(t(c, 'general-scope-hoy'));
    expect(lastSnapshotArg()).toEqual({ preset: 'hoy' });
  });
});

// ── VENTAS · identifiable orders, not an anonymous status list ─────────────
describe('ventas · which sales compose this scope', () => {
  test('each row carries its order number, context, amount and payment state', async () => {
    economyApi.snapshot.mockImplementation((args) => Promise.resolve(
      args?.preset === 'servicio' ? SERVICE_C_SNAPSHOT : DIA,
    ));
    const c = await mount();
    await clickEl(t(c, 'general-scope-servicio'));
    await clickEl(t(c, `general-service-${SERVICE_C}`));
    await clickEl(t(c, 'general-view-ventas'));
    const rows = Array.from(c.querySelectorAll('[data-testid="general-ventas-row"]'));
    expect(rows).toHaveLength(3);
    const text = rows.map((r) => r.textContent);
    // Order numbers, not anonymous "Cobrado / Pendiente" lines.
    expect(text[0]).toContain('#999031');
    expect(text[0]).toContain('69,00');
    expect(text[0]).toContain('Cobrado');
    expect(text[1]).toContain('#999032');
    expect(text[1]).toContain('15,00');
    expect(text[1]).toContain('Pendiente');
    expect(text[2]).toContain('#999033');
    expect(text[2]).toContain('17,00');
    // Context resolved from the order rows the page already holds.
    expect(text[0]).toContain('Mesa 2');
    expect(text[1]).toContain('Domicilio · Q2');
  });

  test('an order with no context row still renders its number, amount and state', async () => {
    // Money and identity come from the certified reader; the context chip is
    // the only thing a missing lookup row can cost.
    // language-guard: allow-legacy `ordenes` is the existing api.js payload key, not new vocabulary
    api.getOrdenes.mockResolvedValue({ ordenes: [] });
    economyApi.snapshot.mockImplementation((args) => Promise.resolve(
      args?.preset === 'servicio' ? SERVICE_C_SNAPSHOT : DIA,
    ));
    const c = await mount();
    await clickEl(t(c, 'general-scope-servicio'));
    await clickEl(t(c, `general-service-${SERVICE_C}`));
    await clickEl(t(c, 'general-view-ventas'));
    const first = c.querySelectorAll('[data-testid="general-ventas-row"]')[0];
    expect(first.textContent).toContain('#999031');
    expect(first.textContent).toContain('69,00');
    expect(first.textContent).toContain('Cobrado');
    expect(first.textContent).not.toContain('Mesa 2');
  });
});

// ── 16-19 · CAJA ───────────────────────────────────────────────────────────
describe('caja · its own window, its own append-only contract', () => {
  test('16 · the counting window is still the certified `hoy` 04:00 → 04:00', async () => {
    const c = await mount();
    await clickTab(c, 'caja');
    expect(t(c, 'preset-hoy')).toBeTruthy();
    expect(t(c, 'window-range').textContent).toMatch(/25\/0?8/);
    expect(t(c, 'window-range').textContent).toMatch(/26\/0?8/);
  });

  test('17-18 · counting appends, and touches no lifecycle', async () => {
    const c = await mount();
    await clickTab(c, 'caja');
    await setInput(t(c, 'counted-cash-input'), '89,50');
    await clickEl(t(c, 'confirm-cash-count'));
    expect(economyApi.createCashCount).toHaveBeenCalledTimes(1);
    // Append only: the client has no update and no delete to call.
    expect(economyApi.createCashCount.mock.calls[0][0]).toHaveProperty('clientRequestId');
    expect(Object.keys(economyApi)).not.toEqual(expect.arrayContaining(['updateCashCount', 'deleteCashCount']));
    // And nothing in the module can close a service.
    for (const el of Array.from(c.querySelectorAll('button'))) {
      expect(el.textContent).not.toMatch(/finalizar\s+servicio|cerrar\s+servicio/i);
    }
  });

  test('19 · cross-window receipts stay disclosed, compactly', async () => {
    economyApi.snapshot.mockResolvedValue(snapshotFor(DIA_WINDOW, {
      root: {
        windowCrossing: {
          obligationBeforeWindowReceiptInside: [{ orderId: '#999001' }, { orderId: '#999002' }],
          obligationInsideWindowReceiptAfter: [],
          receiptsSplitAcrossBoundary: [],
        },
      },
    }));
    const c = await mount();
    await clickTab(c, 'caja');
    const box = t(c, 'window-crossing');
    expect(box).toBeTruthy();
    expect(box.textContent).toContain('2 cobros a caballo del período');
    expect(box.textContent).toContain('2 de pedidos anteriores al período');
  });
});

// ── copy + boundaries that must survive ────────────────────────────────────
describe('copy · the screen stopped reading like documentation', () => {
  test('the removed paragraphs are gone from both tabs', async () => {
    const c = await mount();
    expect(c.textContent).not.toMatch(/Solo consulta/i);
    expect(c.textContent).not.toMatch(/Elige el tramo que vas a contar/i);
    expect(c.textContent).not.toMatch(/no tienen por qué coincidir/i);
    expect(c.textContent).not.toMatch(/Europe\/Madrid/);
    await clickTab(c, 'caja');
    expect(c.textContent).not.toMatch(/Elige el tramo que vas a contar/i);
  });

  test('the first tab is headed Situación económica, and never says "resumen"', async () => {
    const c = await mount();
    const general = t(c, 'economia-general');
    expect(general.textContent).toContain('Situación económica');
    expect(general.textContent).toMatch(/Período/);
    expect(general.textContent).not.toMatch(/resumen/i);
  });

  test('the header states no order count of its own', async () => {
    const c = await mount();
    expect(c.textContent).not.toMatch(/pedidos entregados/i);
  });

  test('the N-8 divergence is disclosed compactly, and only on General', async () => {
    api.getEconomiaLedger.mockResolvedValue({
      porGiorno: [], window: {},
      divergesFromCloseout: true,
      sessions: [{
        businessDate: '2026-08-10', divergesFromCloseout: true,
        closeoutSnapshot: { totals: { collected: 82 } }, totals: { collected: 139.5 },
      }],
    });
    const c = await mount();
    expect(t(c, 'general-n8')).toBeTruthy();
    // Compact by default; the paragraph is gone.
    expect(c.textContent).not.toMatch(/Estos importes son la/i);
    expect(t(c, 'general-n8-detail')).toBeNull();
    await clickEl(t(c, 'general-n8-toggle'));
    const detail = t(c, 'general-n8-detail');
    expect(detail.textContent).toContain('82,00');
    expect(detail.textContent).toContain('139,50');
    expect(detail.textContent).toContain('57,50');
    expect(detail.textContent).toMatch(/no cambia/i);
    // Not duplicated into Caja.
    await clickTab(c, 'caja');
    expect(t(c, 'economia-tab-panel-caja').querySelector('[data-testid="general-n8"]')).toBeNull();
  });

  test('the five destinations are unchanged', async () => {
    const c = await mount();
    expect(Array.from(t(c, 'economia-bottom-nav').querySelectorAll('button')).map((b) => b.textContent.trim()))
      .toEqual(['General', 'Caja', 'Historial', 'Estadísticas', 'Clientes']);
    expect(ECONOMIA_TABS.map((x) => x.id)).toEqual(['general', 'caja', 'historial', 'estadisticas', 'clientes']);
  });
});
