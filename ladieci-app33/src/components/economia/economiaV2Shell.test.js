// ECONOMÍA V2 / STEP 2 — the shell contract.
//
// Guards the ARCHITECTURE of the Economía module, not its numbers: five
// destinations (Caja is gone, Pendientes took its place), a tab switch changes
// only which tab is showing, the shared reporting scope survives that switch,
// the Pendientes bottom-nav badge is GLOBAL, and no lifecycle action ever
// appears inside the module. Money semantics are guarded elsewhere
// (economiaLedgerGate / economiaTimeWindow / economiaSmokeFixBatch).
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/economia/economiaV2Shell.test.js

import React from 'react';
import fs from 'fs';
import path from 'path';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../api', () => ({
  __esModule: true,
  api: {
    // language-guard: allow-legacy getStorico is the existing api.js method name being mocked, not new vocabulary
    getStorico: jest.fn(),
    // language-guard: allow-legacy getSerata is the existing api.js method name being mocked, not new vocabulary
    getSerata: jest.fn(),
    getEconomiaLedger: jest.fn(), getOrdenes: jest.fn(), getOrdenesArchivadosSesion: jest.fn(),
  },
  sb: { select: jest.fn(async () => []) },
}));

// Every economy reader the shell + General touch, stubbed so this suite stays
// about navigation, not fetch behaviour.
jest.mock('../../economy/economyApi', () => ({
  __esModule: true,
  EconomyApiError: class EconomyApiError extends Error {
    constructor(code, status = 0) { super(code); this.name = 'EconomyApiError'; this.code = code; this.status = status; }
  },
  createEconomyRequestId: jest.fn(() => 'cash_testrequestid0001'),
  economyApi: {
    snapshot: jest.fn(), listCashCounts: jest.fn(), createCashCount: jest.fn(),
    pendencies: jest.fn(), reconciliation: jest.fn(),
  },
}));

// Pendientes owns its own reader; this suite is about the shell, so the page is
// stubbed to a marker. Its real behaviour is covered by EconomiaPendientes.test.js.
jest.mock('./EconomiaPendientes', () => ({
  __esModule: true,
  default: (props) => (
    <div data-testid="economia-pendientes-stub"
      data-scope={props && props.scope ? (props.scope.preset || 'set') : 'global'} />
  ),
}));

import EconomiaPage from '../EconomiaPage';
import { ECONOMIA_TABS } from './EconomiaBottomNav';
import { api } from '../../api';
import { economyApi } from '../../economy/economyApi';

const SRC = path.join(__dirname, '..', '..');
const readSrc = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

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

// language-guard: allow-legacy the fixture is named after the existing getSerata payload it stands in for, not new vocabulary
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

const SNAPSHOT_OK = {
  ok: true,
  window: { preset: 'hoy', from: `${todayIso()}T02:00:00.000Z`, to: `${todayIso()}T02:00:00.000Z`, timezone: 'Europe/Madrid', businessDate: todayIso(), bounds: '[from,to)' },
  obligation: { gross: 100, unpaid: 20, voided: 0, refunded: 0 },
  receipts: { collected: 80, collectedGross: 80, refunded: 0, byMethod: { efectivo: 40, tarjeta: 25, bizum: 10, other: 5 } },
  balance: { unpaid: 20, overCollected: 0, unresolvedOverCollected: 0 },
  counts: { obligations: 1 },
  economicBreakdown: { obligations: {}, receipts: {}, source: 'stamped_era_read_rule' },
  windowCrossing: { obligationBeforeWindowReceiptInside: [], obligationInsideWindowReceiptAfter: [], receiptsSplitAcrossBoundary: [] },
  drillDown: { obligations: [], receipts: [], legacyReceipts: [] },
  serviceProvenance: [],
};
const PENDENCIES_ZERO = {
  ok: true, porCobrar: [], porDevolver: [], requiereRevision: [],
  counts: { porCobrar: 0, porDevolver: 0, requiereRevision: 0 },
  totals: { porCobrar: 0, porDevolver: 0 }, scope: null, window: null,
};

async function mount(onBack = () => {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<EconomiaPage onBack={onBack} />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  return container;
}

const tabButton = (container, id) => container.querySelector(`[data-testid="economia-tab-${id}"]`);
const clickTab = async (container, id) => {
  await act(async () => {
    tabButton(container, id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
  // language-guard: allow-legacy getStorico is the existing api.js method name being mocked, not new vocabulary
  api.getStorico.mockReset().mockResolvedValue({ righe: [] });
  // language-guard: allow-legacy getSerata/SERATA are the existing api.js method name and its fixture, not new vocabulary
  api.getSerata.mockReset().mockResolvedValue(SERATA);
  api.getEconomiaLedger.mockReset().mockResolvedValue(LEDGER_OK);
  // language-guard: allow-legacy `ordenes` is the existing api.js payload key, not new vocabulary
  api.getOrdenes.mockReset().mockResolvedValue({ ordenes: [] });
  // language-guard: allow-legacy `ordenes` is the existing api.js payload key, not new vocabulary
  api.getOrdenesArchivadosSesion.mockReset().mockResolvedValue({ ordenes: [] });
  economyApi.snapshot.mockReset().mockResolvedValue(SNAPSHOT_OK);
  economyApi.listCashCounts.mockReset().mockResolvedValue({ ok: true, counts: [], scope: null, window: null });
  economyApi.pendencies.mockReset().mockResolvedValue(PENDENCIES_ZERO);
  economyApi.reconciliation.mockReset().mockResolvedValue({ ok: true });
});

// ── A ──────────────────────────────────────────────────────────────────
describe('A — Economía opens on General', () => {
  test('the default tab is General, and it is the tab marked selected', async () => {
    const container = await mount();
    expect(container.querySelector('[data-testid="economia-general"]')).toBeTruthy();
    expect(tabButton(container, 'general').getAttribute('aria-selected')).toBe('true');
    for (const other of ['pendientes', 'historial', 'estadisticas', 'clientes']) {
      expect(tabButton(container, other).getAttribute('aria-selected')).toBe('false');
    }
  });
});

// ── B ──────────────────────────────────────────────────────────────────
describe('B — the bottom nav holds exactly five destinations', () => {
  test('five tabs, in the approved order — Caja removed, Pendientes in its place', async () => {
    const container = await mount();
    const nav = container.querySelector('[data-testid="economia-bottom-nav"]');
    expect(nav).toBeTruthy();
    const buttons = Array.from(nav.querySelectorAll('button'));
    expect(buttons).toHaveLength(5);
    expect(buttons.map((b) => b.textContent.trim()))
      .toEqual(['General', 'Pendientes', 'Historial', 'Estadísticas', 'Clientes']);
    expect(ECONOMIA_TABS.map((t) => t.id))
      .toEqual(['general', 'pendientes', 'historial', 'estadisticas', 'clientes']);
    // Caja is gone as a destination.
    expect(tabButton(container, 'caja')).toBeNull();
  });
});

// ── C ──────────────────────────────────────────────────────────────────
describe('C — vector icons only, no emoji in the shell', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;

  test.each([
    'components/economia/EconomiaBottomNav.jsx',
    'components/economia/EconomiaGeneral.jsx',
  ])('%s contains no emoji', (rel) => {
    const src = readSrc(rel);
    const hit = src.match(EMOJI);
    expect(hit ? `${rel}: ${hit[0]}` : null).toBeNull();
  });

  test('every nav item renders an inline <svg>, and the label is the whole accessible name', async () => {
    const container = await mount();
    const nav = container.querySelector('[data-testid="economia-bottom-nav"]');
    for (const item of ECONOMIA_TABS) {
      const btn = tabButton(container, item.id);
      const svg = btn.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.getAttribute('fill')).toBe('none');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(btn.textContent.trim()).toBe(item.label);
    }
    expect(nav.textContent).not.toMatch(EMOJI);
  });
});

// ── D ──────────────────────────────────────────────────────────────────
describe('D — switching tabs never leaves the Economía module', () => {
  test('the page stays mounted, onBack is never called, and the data layer does not refetch', async () => {
    const onBack = jest.fn();
    const container = await mount(onBack);
    const ledgerCallsAfterMount = api.getEconomiaLedger.mock.calls.length;
    // language-guard: allow-legacy getStorico is the existing api.js method name whose call count is read, not new vocabulary
    const storicoCallsAfterMount = api.getStorico.mock.calls.length;

    for (const id of ['pendientes', 'historial', 'estadisticas', 'clientes', 'general']) {
      await clickTab(container, id);
      expect(container.textContent).toContain('ECONOMÍA');
      expect(container.querySelector('[data-testid="economia-bottom-nav"]')).toBeTruthy();
    }

    expect(onBack).not.toHaveBeenCalled();
    expect(api.getEconomiaLedger.mock.calls.length).toBe(ledgerCallsAfterMount);
    // language-guard: allow-legacy getStorico is the existing api.js method name whose call count is read, not new vocabulary
    expect(api.getStorico.mock.calls.length).toBe(storicoCallsAfterMount);
  });

  test('the Pendientes panel is never unmounted by a tab switch, so it cannot refetch', async () => {
    const container = await mount();
    const panelBefore = container.querySelector('[data-testid="economia-pendientes-stub"]');
    expect(panelBefore).toBeTruthy();
    await clickTab(container, 'pendientes');
    await clickTab(container, 'clientes');
    expect(container.querySelector('[data-testid="economia-pendientes-stub"]')).toBe(panelBefore);
  });
});

// ── F ──────────────────────────────────────────────────────────────────
describe('F — General renders the approved economic content', () => {
  test('none of the banned Estadísticas content leaks into General', async () => {
    const container = await mount();
    const general = container.querySelector('[data-testid="economia-general"]').textContent;
    for (const banned of [/pizza/i, /bebida/i, /delivery/i, /cliente/i, /ranking/i]) {
      expect(general).not.toMatch(banned);
    }
  });
});

// ── H ──────────────────────────────────────────────────────────────────
describe('H — the N-9 window resolver is untouched', () => {
  test('the shell adds no second calendar: no browser-midnight recomputation in the new files', () => {
    for (const rel of ['components/economia/EconomiaGeneral.jsx', 'components/economia/EconomiaBottomNav.jsx']) {
      const src = readSrc(rel);
      expect(src).not.toMatch(/setHours\s*\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/);
      expect(src).not.toMatch(/toISOString\s*\(\s*\)\s*\.\s*slice/);
      expect(src).not.toMatch(/new Date\s*\(\s*\)/);
    }
  });
});

// ── I ──────────────────────────────────────────────────────────────────
describe('I — no lifecycle close action exists inside Economía', () => {
  const CLOSE_ACTION = /finalizar\s+servicio|cerrar\s+servicio|cerrar\s+el\s+servicio|cierre\s+del\s+servicio|fin\s+de\s+servicio/i;

  test('no control anywhere in the module offers to close the service', async () => {
    const container = await mount();
    for (const id of ['general', 'pendientes', 'historial', 'estadisticas', 'clientes']) {
      await clickTab(container, id);
      const controls = Array.from(container.querySelectorAll('button, a, [role="button"]'));
      for (const el of controls) {
        expect(el.textContent).not.toMatch(CLOSE_ACTION);
        expect(el.textContent).not.toMatch(/^\s*finalizar\s*$/i);
      }
    }
  });

  test('the shell files declare no close handler', () => {
    for (const rel of ['components/economia/EconomiaGeneral.jsx', 'components/economia/EconomiaBottomNav.jsx']) {
      const src = readSrc(rel);
      expect(src).not.toMatch(/onFinalizar|finalizarServicio|closeService|cerrarServicio/);
    }
  });
});

// ── J ──────────────────────────────────────────────────────────────────
describe('J — admin access behaviour is unchanged', () => {
  test('the Economía route in App.jsx is byte-identical to before this slice', () => {
    const app = readSrc('App.jsx');
    expect(app).toContain('{screen==="economia" && <EconomiaPage onBack={()=>setScreen("home")}/>}');
    expect(app).not.toMatch(/screen==="economia"[^\n]*canAccess/);
  });

  test('the shell introduces no role logic', () => {
    for (const rel of ['components/economia/EconomiaGeneral.jsx', 'components/economia/EconomiaBottomNav.jsx']) {
      expect(readSrc(rel)).not.toMatch(/getRole|canAccess|isAdmin|role\s*===/);
    }
  });
});

// ── K ──────────────────────────────────────────────────────────────────
describe('K — Pendientes, Historial, Estadísticas and Clientes stay reachable', () => {
  test('the Pendientes tab shows the dedicated read-only view', async () => {
    const container = await mount();
    const panel = container.querySelector('[data-testid="economia-tab-panel-pendientes"]');
    expect(panel).toBeTruthy();
    expect(panel.style.display).toBe('none');
    await clickTab(container, 'pendientes');
    expect(container.querySelector('[data-testid="economia-tab-panel-pendientes"]').style.display).toBe('block');
    expect(container.querySelector('[data-testid="economia-pendientes-stub"]')).toBeTruthy();
  });

  test.each(['historial', 'estadisticas', 'clientes'])('the %s tab renders its existing surface', async (id) => {
    const container = await mount();
    await clickTab(container, id);
    expect(container.querySelector(`[data-testid="economia-legacy-${id}"]`)).toBeTruthy();
  });
});

// ── L ── the GLOBAL Pendientes badge ───────────────────────────────────
describe('L — the Pendientes bottom-nav badge is GLOBAL', () => {
  const badgeEl = (c) => c.querySelector('[data-testid="economia-pendientes-badge"]');

  test('zero unresolved → no badge', async () => {
    economyApi.pendencies.mockResolvedValue(PENDENCIES_ZERO);
    const container = await mount();
    expect(badgeEl(container)).toBeNull();
  });

  test('non-zero → a compact badge with the GLOBAL total (porCobrar + porDevolver + requiereRevision)', async () => {
    economyApi.pendencies.mockResolvedValue({
      ...PENDENCIES_ZERO,
      counts: { porCobrar: 1, porDevolver: 1, requiereRevision: 1 },
    });
    const container = await mount();
    expect(badgeEl(container)).toBeTruthy();
    expect(badgeEl(container).textContent.trim()).toBe('3');
  });

  test('the badge total stays GLOBAL even when the Pendientes page carries a period filter', async () => {
    // General's PENDIENTE at Hoy resolves to one por-cobrar item; the GLOBAL
    // read still counts three unresolved issues.
    economyApi.pendencies.mockImplementation((params = {}) => {
      if (params.preset === 'hoy') {
        return Promise.resolve({
          ok: true, porCobrar: [{ orderUid: 'u1', amount: 20, channel: 'RETIRO', display: {}, customer: {} }],
          porDevolver: [], requiereRevision: [],
          counts: { porCobrar: 1, porDevolver: 0, requiereRevision: 0 },
          totals: { porCobrar: 20, porDevolver: null },
          scope: { preset: 'hoy' }, window: {},
        });
      }
      return Promise.resolve({ ...PENDENCIES_ZERO, counts: { porCobrar: 3, porDevolver: 0, requiereRevision: 0 } });
    });
    const container = await mount();
    // Navigate from General's PENDIENTE KPI into the scoped page.
    const kpi = container.querySelector('[data-testid="general-kpi-pendiente"]');
    expect(kpi).toBeTruthy();
    await act(async () => { kpi.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    // The page is now scoped (stub reports it), but the badge is still 3.
    expect(container.querySelector('[data-testid="economia-pendientes-stub"]').getAttribute('data-scope')).toBe('hoy');
    expect(badgeEl(container).textContent.trim()).toBe('3');
  });

  test('tapping the bottom-nav Pendientes item directly always lands on GLOBAL / Todos', async () => {
    economyApi.pendencies.mockImplementation((params = {}) => {
      if (params.preset === 'hoy') {
        return Promise.resolve({
          ok: true, porCobrar: [{ orderUid: 'u1', amount: 20, channel: 'RETIRO', display: {}, customer: {} }],
          porDevolver: [], requiereRevision: [],
          counts: { porCobrar: 1, porDevolver: 0, requiereRevision: 0 },
          totals: { porCobrar: 20, porDevolver: null }, scope: { preset: 'hoy' }, window: {},
        });
      }
      return Promise.resolve({ ...PENDENCIES_ZERO, counts: { porCobrar: 3, porDevolver: 0, requiereRevision: 0 } });
    });
    const container = await mount();
    // First arrive scoped from General.
    const kpi = container.querySelector('[data-testid="general-kpi-pendiente"]');
    await act(async () => { kpi.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector('[data-testid="economia-pendientes-stub"]').getAttribute('data-scope')).toBe('hoy');
    // Now go elsewhere, then tap Pendientes directly.
    await clickTab(container, 'general');
    await clickTab(container, 'pendientes');
    expect(container.querySelector('[data-testid="economia-pendientes-stub"]').getAttribute('data-scope')).toBe('global');
  });
});
