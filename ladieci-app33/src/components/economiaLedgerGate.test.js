// S2-7D6E4 — Economía must NEVER show a metodo_pago-derived money figure while the
// ledger is loading or has failed to load, and must show an explicit error + retry
// instead of a legacy fallback number. Component-level coverage (react-dom + test-utils,
// no @testing-library dependency — same pattern as
// src/components/account/adminPinForm.test.js) of the actual rendered "Ventas" KPI card
// and the ledger status banner, mocking api.js so no real network call happens.
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/economiaLedgerGate.test.js

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../api', () => ({
  __esModule: true,
  api: {
    getStorico: jest.fn(),
    getSerata: jest.fn(),
    getEconomiaLedger: jest.fn(),
  },
  sb: { select: jest.fn(async () => []) },
}));

import EconomiaPage from './EconomiaPage';
import { api } from '../api';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// The order the "Efectivo" bucket must NEVER be trusted for: metodo_pago says paid,
// but there is no assertion here about any order_financial_events row — exactly the
// incident (order #723) this whole task line exists to fix.
const SERATA_WITH_UNPROVEN_CASH_ORDER = {
  incasso: 12, countOrdini: 1, ticketMedio: 12, pizzeTot: 1, bevandeTot: 0,
  consegne: { DOMICILIO: 0, RITIRO: 1 },
  pagamenti: {
    efectivo: { incasso: 12, count: 1 }, tarjeta: { incasso: 0, count: 0 },
    bizum: { incasso: 0, count: 0 }, no_especificado: { incasso: 0, count: 0 },
  },
  canali: { MANUAL: 1 }, prodotti: [],
  ordini: [{
    id: '#1', totale: 12, metodo_pago: 'efectivo', estado: 'RETIRADO',
    tipo_consegna: 'RITIRO', canal: 'MANUAL', items: [], fecha: todayIso(), hora: '20:00', ts: Date.now(),
  }],
};

function kpiCardByLabel(container, label) {
  const buttons = Array.from(container.querySelectorAll('button'));
  return buttons.find((b) => Array.from(b.querySelectorAll('div')).some((d) => d.textContent.trim() === label));
}

// ECONOMÍA V2 — the KPI grid this suite guards now lives on the legacy tabs;
// the module opens on Resumen. Every pre-V2 assertion below is preserved
// verbatim, reached by first switching to a tab that renders that grid. The
// new default surface is covered separately, at the bottom of this file: the
// gate has to hold on BOTH, and the one the operator lands on matters most.
async function gotoLegacyTab(container, id = 'historial') {
  const btn = container.querySelector(`[data-testid="economia-tab-${id}"]`);
  expect(btn).toBeTruthy();
  await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

// Reads a Resumen row's rendered amount by its stable testid.
function resumenRow(container, testId) {
  const el = container.querySelector(`[data-testid="${testId}"]`);
  return el ? el.textContent : null;
}

async function mountEconomia() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root;
  await act(async () => {
    root = createRoot(container);
    root.render(<EconomiaPage onBack={() => {}} />);
  });
  return { container, root };
}

// Flushes the microtask queue so mocked promises resolve inside `act`.
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  api.getStorico.mockReset().mockResolvedValue({ righe: [] });
  api.getSerata.mockReset().mockResolvedValue(SERATA_WITH_UNPROVEN_CASH_ORDER);
  api.getEconomiaLedger.mockReset();
});

describe('Economía — ledger loading state', () => {
  test('shows the loading banner and NO legacy money value while the ledger call is pending', async () => {
    api.getEconomiaLedger.mockImplementation(() => new Promise(() => {})); // never resolves
    const { container } = await mountEconomia();
    await flush();
    await gotoLegacyTab(container);

    expect(container.textContent).toContain('Cargando importes contables');
    const ventas = kpiCardByLabel(container, 'Ventas');
    expect(ventas).toBeTruthy();
    expect(ventas.textContent).toContain('···');
    expect(ventas.textContent).not.toContain('12€');
    expect(ventas.textContent).not.toContain('0€');
    expect(ventas.disabled).toBe(true);
  });
});

describe('Economía — ledger error state', () => {
  test('shows an explicit error and a retry button, and no legacy money value', async () => {
    api.getEconomiaLedger.mockResolvedValue({ error: 'backend_unavailable' });
    const { container } = await mountEconomia();
    await flush();
    await gotoLegacyTab(container);

    expect(container.textContent).toContain('No se pudieron cargar los importes contables');
    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Reintentar'));
    expect(retryBtn).toBeTruthy();

    const ventas = kpiCardByLabel(container, 'Ventas');
    expect(ventas.textContent).toContain('⚠');
    expect(ventas.textContent).not.toContain('12€');
    expect(ventas.textContent).not.toContain('0€');
    expect(ventas.disabled).toBe(true);
  });

  test('retry after an error re-calls getEconomiaLedger and shows the real value on success', async () => {
    api.getEconomiaLedger.mockResolvedValueOnce({ error: 'backend_unavailable' });
    const { container } = await mountEconomia();
    await flush();
    await gotoLegacyTab(container);
    expect(container.textContent).toContain('No se pudieron cargar los importes contables');

    api.getEconomiaLedger.mockResolvedValueOnce({
      porGiorno: [{
        businessDate: todayIso(),
        paymentTotals: { efectivo: 12, tarjeta: 0, bizum: 0, other: 0 },
        totals: { collected: 12, gross: 12, refunded: 0, unpaid: 0 },
      }],
    });
    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Reintentar'));
    await act(async () => { retryBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    expect(container.textContent).not.toContain('No se pudieron cargar los importes contables');
    expect(api.getEconomiaLedger).toHaveBeenCalledTimes(2);
    const ventas = kpiCardByLabel(container, 'Ventas');
    expect(ventas.textContent).toContain('12€');
    expect(ventas.disabled).toBe(false);
  });
});

describe('Economía — ledger success: no metodo_pago used as proof of payment', () => {
  test('an order with metodo_pago=efectivo and a ledger that reports 0 collected shows 0€, never 12€', async () => {
    api.getEconomiaLedger.mockResolvedValue({
      porGiorno: [{
        businessDate: todayIso(),
        paymentTotals: { efectivo: 0, tarjeta: 0, bizum: 0, other: 0 },
        totals: { collected: 0, gross: 12, refunded: 0, unpaid: 12 },
      }],
    });
    const { container } = await mountEconomia();
    await flush();
    await gotoLegacyTab(container);

    expect(container.textContent).not.toContain('Cargando importes contables');
    expect(container.textContent).not.toContain('No se pudieron cargar');
    const ventas = kpiCardByLabel(container, 'Ventas');
    expect(ventas.textContent).toContain('0€');
    expect(ventas.textContent).not.toContain('12€');
    expect(ventas.disabled).toBe(false);
  });

  test('a ledger that confirms the 12€ payment shows 12€', async () => {
    api.getEconomiaLedger.mockResolvedValue({
      porGiorno: [{
        businessDate: todayIso(),
        paymentTotals: { efectivo: 12, tarjeta: 0, bizum: 0, other: 0 },
        totals: { collected: 12, gross: 12, refunded: 0, unpaid: 0 },
      }],
    });
    const { container } = await mountEconomia();
    await flush();
    await gotoLegacyTab(container);

    const ventas = kpiCardByLabel(container, 'Ventas');
    expect(ventas.textContent).toContain('12€');
    expect(ventas.disabled).toBe(false);
  });
});

// ECONOMÍA V2 — the same gate, on the tab the module actually opens on.
describe('Economía V2 — the money gate holds on the default Resumen tab', () => {
  test('while the ledger is pending, Resumen shows no amount at all — never 0, never the legacy 12€', async () => {
    api.getEconomiaLedger.mockImplementation(() => new Promise(() => {}));
    const { container } = await mountEconomia();
    await flush();

    expect(container.querySelector('[data-testid="economia-resumen"]')).toBeTruthy();
    expect(container.textContent).toContain('Cargando importes contables');
    for (const id of ['resumen-total-cobrado', 'resumen-efectivo', 'resumen-ventas', 'resumen-pendiente']) {
      const text = resumenRow(container, id);
      expect(text).toContain('···');
      expect(text).not.toContain('0,00');
      expect(text).not.toContain('12,00');
    }
  });

  test('on ledger failure Resumen states the failure and offers retry, and prints no amount', async () => {
    api.getEconomiaLedger.mockResolvedValue({ error: 'backend_unavailable' });
    const { container } = await mountEconomia();
    await flush();

    expect(container.querySelector('[data-testid="resumen-ledger-error"]')).toBeTruthy();
    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Reintentar'));
    expect(retryBtn).toBeTruthy();
    expect(resumenRow(container, 'resumen-total-cobrado')).not.toContain('12,00');
    expect(resumenRow(container, 'resumen-total-cobrado')).not.toContain('0,00');
  });

  test('a ledger reporting 0 collected against a 12€ unpaid sale shows both truths, unmixed', async () => {
    api.getEconomiaLedger.mockResolvedValue({
      porGiorno: [{
        businessDate: todayIso(),
        paymentTotals: { efectivo: 0, tarjeta: 0, bizum: 0, other: 0 },
        totals: { collected: 0, gross: 12, refunded: 0, unpaid: 12 },
      }],
    });
    const { container } = await mountEconomia();
    await flush();

    // Collected really is zero — and that zero is now provable, so it prints.
    expect(resumenRow(container, 'resumen-total-cobrado')).toContain('0,00');
    expect(resumenRow(container, 'resumen-efectivo')).toContain('0,00');
    // The sale exists and is unpaid: gross and unpaid are NOT the collected figure.
    expect(resumenRow(container, 'resumen-ventas')).toContain('12,00');
    expect(resumenRow(container, 'resumen-pendiente')).toContain('12,00');
  });

  test('a confirmed 12€ cash payment reaches both the total and the cash row', async () => {
    api.getEconomiaLedger.mockResolvedValue({
      porGiorno: [{
        businessDate: todayIso(),
        paymentTotals: { efectivo: 12, tarjeta: 0, bizum: 0, other: 0 },
        totals: { collected: 12, gross: 12, refunded: 0, unpaid: 0 },
      }],
    });
    const { container } = await mountEconomia();
    await flush();

    expect(resumenRow(container, 'resumen-total-cobrado')).toContain('12,00');
    expect(resumenRow(container, 'resumen-efectivo')).toContain('12,00');
    expect(resumenRow(container, 'resumen-pendiente')).toContain('0,00');
  });
});
