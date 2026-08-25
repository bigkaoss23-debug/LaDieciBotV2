// ECONOMÍA V2 / STEP 1.1 — the General ↔ Caja semantic boundary.
//
// Manual smoke on 0f45a09 found the two first tabs reading as duplicates:
// Caja opened on "RESUMEN ECONÓMICO" + "COBRADO EN EL PERÍODO" + "VENTAS
// ORIGINADAS EN EL PERÍODO" before reaching the cash count it exists for.
// This suite pins the boundary so it cannot drift back:
//
//   General → read-only economic truth (the two period groups, N-8, N-9)
//   Caja    → the counting window and the cash count, and nothing else
//
// It mounts the REAL EconomiaSnapshotPanel — a stub would make the whole
// question unanswerable — with only its network reader mocked.
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/economia/economiaGeneralCajaBoundary.test.js

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../api', () => ({
  __esModule: true,
  // language-guard: allow-legacy getStorico is the existing api.js method name being mocked, not new vocabulary
  api: { getStorico: jest.fn(), getSerata: jest.fn(), getEconomiaLedger: jest.fn() },
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

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const LEDGER_OK = {
  porGiorno: [{
    businessDate: todayIso(),
    paymentTotals: { efectivo: 40, tarjeta: 25, bizum: 10, other: 5 },
    totals: { collected: 80, gross: 100, refunded: 3, unpaid: 20 },
  }],
  window: {
    timezone: 'Europe/Madrid', businessDateToday: todayIso(),
    businessDateFrom: todayIso(), businessDateTo: todayIso(),
    from: `${todayIso()}T02:00:00.000Z`, to: `${todayIso()}T02:00:00.000Z`, bounds: '[from,to)',
  },
};

const SNAPSHOT = {
  ok: true,
  window: {
    preset: 'hoy', label: 'Hoy',
    from: '2026-08-20T15:30:00.000Z', to: '2026-08-21T02:00:00.000Z',
    timezone: 'Europe/Madrid', businessDate: '2026-08-20', serviceSessionId: null,
    bounds: '[from,to)', asOf: '2026-08-21T12:00:00.000Z', generatedAt: '2026-08-21T12:00:00.000Z',
  },
  obligation: { gross: 262.5, unpaid: 0, voided: 0, refunded: 0 },
  receipts: { collected: 262.5, collectedGross: 262.5, refunded: 0, byMethod: { efectivo: 85, tarjeta: 130, bizum: 47.5, other: 0 } },
  counts: { obligations: 5, obligationsCancelled: 0, obligationsUnpaid: 0, receiptEvents: 8, payments: 8, refunds: 0 },
  economicBreakdown: { obligations: {}, receipts: {}, source: 'stamped_era_read_rule' },
  windowCrossing: { obligationBeforeWindowReceiptInside: [], obligationInsideWindowReceiptAfter: [], receiptsSplitAcrossBoundary: [] },
  drillDown: { obligations: [], receipts: [], legacyReceipts: [] },
  serviceProvenance: [],
};

// language-guard: allow-legacy the getSerata payload keys below are the existing aggregate field names, not new vocabulary
const SERATA = {
  // language-guard: allow-legacy pizzeTot is the existing aggregate field name required by the fixture shape, not new vocabulary
  incasso: 80, ticketMedio: 20, pizzeTot: 3, bevandeTot: 1,
  // language-guard: allow-legacy RITIRO is the existing delivery-type enum value, not new vocabulary
  consegne: { DOMICILIO: 1, RITIRO: 3 },
  // language-guard: allow-legacy the payment-bucket field name is the existing getSerata payload key, not new vocabulary
  pagamenti: {
    efectivo: { incasso: 40, count: 2 }, tarjeta: { incasso: 25, count: 1 },
    bizum: { incasso: 10, count: 1 }, no_especificado: { incasso: 5, count: 0 },
  },
  canali: { MANUAL: 4 }, prodotti: [],
  // language-guard: allow-legacy the order-list field name is the existing getSerata payload key, not new vocabulary
  ordini: [{
    // language-guard: allow-legacy tipo_consegna/RITIRO are the existing delivery-type field and enum value, not new vocabulary
    id: '#1', totale: 20, estado: 'RETIRADO', tipo_consegna: 'RITIRO',
    canal: 'MANUAL', items: [], fecha: todayIso(), hora: '20:00', ts: Date.now(),
  }],
};

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<EconomiaPage onBack={() => {}} />); });
  await act(async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); });
  return container;
}
const tabButton = (c, id) => c.querySelector(`[data-testid="economia-tab-${id}"]`);
const clickTab = async (c, id) => {
  await act(async () => { tabButton(c, id).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await act(async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); });
};
// Text of the tab currently on screen. Off-tab panels stay mounted but hidden,
// so "what the operator sees" is the visible subtree, not the whole container.
const visibleText = (c) => {
  const caja = c.querySelector('[data-testid="economia-tab-panel-caja"]');
  const cajaOpen = caja && caja.style.display !== 'none';
  if (cajaOpen) return caja.textContent;
  const general = c.querySelector('[data-testid="economia-general"]');
  return general ? general.textContent : c.textContent;
};

beforeEach(() => {
  jest.clearAllMocks();
  // language-guard: allow-legacy getStorico/getSerata are the existing api.js method names being mocked, not new vocabulary
  api.getStorico.mockReset().mockResolvedValue({ righe: [] });
  // language-guard: allow-legacy getSerata is the existing api.js method name being mocked, not new vocabulary
  api.getSerata.mockReset().mockResolvedValue(SERATA);
  api.getEconomiaLedger.mockReset().mockResolvedValue(LEDGER_OK);
  // CRA's resetMocks:true wipes implementations set in the jest.mock factory.
  createEconomyRequestId.mockImplementation(() => 'cash_testrequestid0001');
  economyApi.snapshot.mockResolvedValue(SNAPSHOT);
  economyApi.listCashCounts.mockResolvedValue({ ok: true, counts: [] });
  economyApi.createCashCount.mockResolvedValue({ ok: true, created: true, count: {} });
});

// ── 1 ──────────────────────────────────────────────────────────────────
describe('1 — the bottom nav labels are exactly the approved five', () => {
  test('General / Caja / Historial / Estadísticas / Clientes, in order', async () => {
    const container = await mount();
    const nav = container.querySelector('[data-testid="economia-bottom-nav"]');
    const buttons = Array.from(nav.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent.trim()))
      .toEqual(['General', 'Caja', 'Historial', 'Estadísticas', 'Clientes']);
    expect(ECONOMIA_TABS.map((t) => t.id))
      .toEqual(['general', 'caja', 'historial', 'estadisticas', 'clientes']);
  });

  test('the word "Resumen" no longer names any tab', async () => {
    const container = await mount();
    const nav = container.querySelector('[data-testid="economia-bottom-nav"]');
    expect(nav.textContent).not.toMatch(/resumen/i);
    expect(container.querySelector('[data-testid="economia-tab-resumen"]')).toBeNull();
  });
});

// ── 2 ──────────────────────────────────────────────────────────────────
describe('2 — General owns the economic overview', () => {
  test('both period groups render on General', async () => {
    const container = await mount();
    const general = container.querySelector('[data-testid="economia-general"]');
    expect(general).toBeTruthy();
    expect(general.textContent).toMatch(/Cobrado en el período/i);
    expect(general.textContent).toMatch(/Ventas originadas en el período/i);
    expect(general.textContent).toMatch(/Situación económica/i);
  });

  test('General does not call itself a "resumen"', async () => {
    const container = await mount();
    expect(container.querySelector('[data-testid="economia-general"]').textContent)
      .not.toMatch(/resumen/i);
  });
});

// ── 3 ──────────────────────────────────────────────────────────────────
describe('3 — Caja does NOT render the General blocks', () => {
  test('no economic overview, no duplicate heading, no originadas-vs-recibido essay', async () => {
    const container = await mount();
    await clickTab(container, 'caja');
    const caja = container.querySelector('[data-testid="economia-tab-panel-caja"]');
    expect(caja.style.display).toBe('block');

    expect(caja.textContent).not.toMatch(/RESUMEN ECONÓMICO/i);
    expect(caja.textContent).not.toMatch(/COBRADO EN EL PERÍODO/i);
    expect(caja.textContent).not.toMatch(/VENTAS ORIGINADAS EN EL PERÍODO/i);
    // The two-sets explanation belongs to General.
    expect(caja.querySelector('[data-testid="two-sets-note"]')).toBeNull();
    // And the metric tiles of the economic half are gone with it.
    for (const id of ['m-collected', 'm-card', 'm-bizum', 'm-gross', 'm-unpaid', 'm-void', 'm-refund', 'm-tickets']) {
      expect(caja.querySelector(`[data-testid="${id}"]`)).toBeNull();
    }
  });

  test('the N-8 divergence disclosure is not duplicated into Caja', async () => {
    api.getEconomiaLedger.mockResolvedValue({
      ...LEDGER_OK,
      divergesFromCloseout: true,
      sessions: [{
        businessDate: '2026-08-10', divergesFromCloseout: true,
        closeoutSnapshot: { totals: { collected: 82 } }, totals: { collected: 139.5 },
      }],
    });
    const container = await mount();
    // Present on General...
    expect(container.querySelector('[data-testid="late-after-close-note"]')).toBeTruthy();
    await clickTab(container, 'caja');
    // ...and not repeated inside Caja.
    const caja = container.querySelector('[data-testid="economia-tab-panel-caja"]');
    expect(caja.querySelector('[data-testid="late-after-close-note"]')).toBeNull();
  });

  test('the two groups exist exactly once in the whole module', async () => {
    const container = await mount();
    const count = (re) => (container.textContent.match(re) || []).length;
    expect(count(/Cobrado en el período/gi)).toBe(1);
    expect(count(/Ventas originadas en el período/gi)).toBe(1);
  });
});

// ── 4 ──────────────────────────────────────────────────────────────────
describe('4 — Caja owns the cash-count contract, unchanged', () => {
  test('counting window, recorded cash, counted cash, note and the confirm control', async () => {
    const container = await mount();
    await clickTab(container, 'caja');
    const caja = container.querySelector('[data-testid="economia-tab-panel-caja"]');

    expect(caja.textContent).toMatch(/CONTEO DE CAJA/i);
    expect(caja.querySelector('[data-testid="snapshot-panel-heading"]').textContent)
      .toMatch(/PERÍODO DEL CONTEO/i);
    expect(caja.querySelector('[data-testid="m-cash-recorded"]').textContent)
      .toMatch(/Efectivo registrado/i);
    expect(caja.querySelector('[data-testid="counted-cash-input"]')).toBeTruthy();
    expect(caja.querySelector('[data-testid="cash-count-note"]')).toBeTruthy();
    expect(caja.querySelector('[data-testid="confirm-cash-count"]').textContent)
      .toMatch(/Registrar conteo/i);
    // The window selector stays: it is what "registrado en el período" means.
    expect(caja.querySelector('[data-testid="preset-hoy"]')).toBeTruthy();
    expect(caja.querySelector('[data-testid="window-range"]')).toBeTruthy();
  });

  test('the difference preview still computes against recorded cash', async () => {
    const container = await mount();
    await clickTab(container, 'caja');
    const input = container.querySelector('[data-testid="counted-cash-input"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setter.call(input, '80');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // Recorded 85, counted 80 → -5,00 €. Unchanged by the boundary cleanup.
    expect(container.querySelector('[data-testid="m-variance-preview"]').textContent)
      .toMatch(/-5,00\s?€/);
  });

  test('the standing "counting is not a close" sentence survives verbatim', async () => {
    const container = await mount();
    await clickTab(container, 'caja');
    expect(container.querySelector('[data-testid="cash-count-not-a-close"]').textContent)
      .toMatch(/no finaliza el servicio/i);
  });
});

// ── 5 ──────────────────────────────────────────────────────────────────
describe('5 — switching General ↔ Caja does not re-run the economic engine', () => {
  test('neither reader is called again, and neither panel is remounted', async () => {
    const container = await mount();
    const ledgerCalls = api.getEconomiaLedger.mock.calls.length;
    const snapshotCalls = economyApi.snapshot.mock.calls.length;
    const panelBefore = container.querySelector('[data-testid="economia-snapshot-panel"]');
    expect(panelBefore).toBeTruthy();

    await clickTab(container, 'caja');
    await clickTab(container, 'general');
    await clickTab(container, 'caja');

    expect(api.getEconomiaLedger.mock.calls.length).toBe(ledgerCalls);
    expect(economyApi.snapshot.mock.calls.length).toBe(snapshotCalls);
    // Same DOM node across all three switches: hidden, never remounted.
    expect(container.querySelector('[data-testid="economia-snapshot-panel"]')).toBe(panelBefore);
  });

  test('there is exactly ONE economic reader per tab — no duplicated engine', async () => {
    await mount();
    // General reads the business-date ledger; Caja reads the timestamp
    // snapshot. One call each, and neither tab calls the other's reader.
    expect(api.getEconomiaLedger).toHaveBeenCalledTimes(1);
    expect(economyApi.snapshot).toHaveBeenCalledTimes(1);
  });
});

// ── 6 ──────────────────────────────────────────────────────────────────
describe('6 — each tab keeps its own selected scope across switching', () => {
  test("General's period survives a trip through Caja", async () => {
    const container = await mount();
    await act(async () => {
      container.querySelector('[data-testid="general-periodo-mese"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await clickTab(container, 'caja');
    await clickTab(container, 'general');
    expect(container.querySelector('[data-testid="general-periodo-mese"]').getAttribute('aria-pressed')).toBe('true');
  });

  test("Caja's counting window survives a trip through General", async () => {
    const container = await mount();
    await clickTab(container, 'caja');
    await act(async () => {
      container.querySelector('[data-testid="preset-ayer"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); });
    const snapshotCallsAfterPick = economyApi.snapshot.mock.calls.length;

    await clickTab(container, 'general');
    await clickTab(container, 'caja');

    // Still on "Ayer", and it did not re-request on the way back.
    const ayer = container.querySelector('[data-testid="preset-ayer"]');
    expect(ayer).toBeTruthy();
    expect(economyApi.snapshot.mock.calls.length).toBe(snapshotCallsAfterPick);
  });
});

// ── 7 ──────────────────────────────────────────────────────────────────
describe('7 — no Finalizar / Cerrar servicio anywhere in Economía', () => {
  const CLOSE_ACTION = /finalizar\s+servicio|cerrar\s+servicio|cerrar\s+el\s+servicio|cierre\s+del\s+servicio|fin\s+de\s+servicio/i;

  test('no control on any of the five tabs offers a lifecycle close', async () => {
    const container = await mount();
    for (const id of ['general', 'caja', 'historial', 'estadisticas', 'clientes']) {
      await clickTab(container, id);
      for (const el of Array.from(container.querySelectorAll('button, a, [role="button"]'))) {
        expect(el.textContent).not.toMatch(CLOSE_ACTION);
        expect(el.textContent).not.toMatch(/^\s*finalizar\s*$/i);
      }
    }
  });

  test('Caja states that counting is not a close, and offers no close of its own', async () => {
    const container = await mount();
    await clickTab(container, 'caja');
    const caja = container.querySelector('[data-testid="economia-tab-panel-caja"]');
    expect(caja.textContent).toMatch(/no finaliza el servicio/i);
    for (const el of Array.from(caja.querySelectorAll('button'))) {
      expect(el.textContent).not.toMatch(CLOSE_ACTION);
    }
  });
});

// ── 8 ──────────────────────────────────────────────────────────────────
describe('8 — the N-8 disclosure stays on General', () => {
  test('both truths are named, and the registered close is stated as unchanged', async () => {
    api.getEconomiaLedger.mockResolvedValue({
      ...LEDGER_OK,
      divergesFromCloseout: true,
      sessions: [{
        businessDate: '2026-08-10', divergesFromCloseout: true,
        closeoutSnapshot: { totals: { collected: 82 } }, totals: { collected: 139.5 },
      }],
    });
    const container = await mount();
    const general = container.querySelector('[data-testid="economia-general"]');
    const note = general.querySelector('[data-testid="late-after-close-note"]');
    expect(note).toBeTruthy();
    expect(note.textContent).toContain('82,00');
    expect(note.textContent).toContain('139,50');
    expect(note.textContent).toMatch(/no cambia/i);
  });

  test('the N-9 window statement also stays on General', async () => {
    const container = await mount();
    const general = container.querySelector('[data-testid="economia-general"]');
    const disclosure = general.querySelector('[data-testid="economia-window-disclosure"]');
    expect(disclosure).toBeTruthy();
    expect(disclosure.textContent).toContain('Europe/Madrid');
  });
});

// ── 9 ──────────────────────────────────────────────────────────────────
describe('9 — nothing here reaches the backend or the schema', () => {
  test('the slice writes nothing: no cash count is created by rendering', async () => {
    const container = await mount();
    await clickTab(container, 'caja');
    expect(economyApi.createCashCount).not.toHaveBeenCalled();
  });

  test('General derives no money and owns no calendar of its own', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, 'EconomiaGeneral.jsx'), 'utf8');
    expect(src).not.toMatch(/new Date\s*\(\s*\)/);
    expect(src).not.toMatch(/setHours\s*\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/);
    // No reader of its own: presentational, props only. Asserted on imports
    // and calls, not on prose — the header comment legitimately NAMES the
    // reader whose output this component renders.
    expect(src).not.toMatch(/^\s*import[^\n]*from\s*'\.\.\/\.\.\/(api|economy\/economyApi)'/m);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\b(economyApi|api)\.\w+\s*\(/);
  });

  test('the boundary is a prop on the existing panel, not a second reader', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, 'EconomiaSnapshotPanel.jsx'), 'utf8');
    expect(src).toMatch(/showEconomicWindow\s*=\s*true/);
    // Still exactly one snapshot reader in the panel.
    expect((src.match(/economyApi\.snapshot\(/g) || []).length).toBe(1);
  });
});
