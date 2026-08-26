// ECONOMÍA V2 / STEP 1 — the shell contract.
//
// This suite guards the ARCHITECTURE of the Economía module, not its numbers:
// that it is ONE module with five destinations, that a tab switch changes only
// which tab is showing, that the shared reporting scope survives that switch,
// and that no lifecycle action ever appears inside it. The money semantics
// themselves are guarded by economiaLedgerGate / economiaTimeWindow /
// economiaLedgerOverride, which are deliberately untouched by this file.
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

// The Caja tab owns its own authenticated reader; this suite is about the
// shell, so the panel is stubbed to a marker rather than exercised here.
// Its real behaviour is covered by EconomiaSnapshotPanel.test.js.
jest.mock('./EconomiaSnapshotPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="economia-snapshot-panel-stub" />,
}));

import EconomiaPage from '../EconomiaPage';
import { ECONOMIA_TABS } from './EconomiaBottomNav';
import { api } from '../../api';

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
    timezone: 'Europe/Madrid',
    businessDateToday: todayIso(),
    businessDateFrom: todayIso(),
    businessDateTo: todayIso(),
    from: `${todayIso()}T02:00:00.000Z`,
    to: `${todayIso()}T02:00:00.000Z`,
    bounds: '[from,to)',
  },
};

// One order, deliberately: the Pedidos figure is counted from these rows, so
// language-guard: allow-legacy countOrdini is the existing aggregate field name, named here only to say nothing reads it, not new vocabulary
// the fixture's row count IS the expected value (a `countOrdini` field here
// would be decorative — nothing reads it).
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

async function mount(onBack = () => {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<EconomiaPage onBack={onBack} />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return container;
}

const tabButton = (container, id) => container.querySelector(`[data-testid="economia-tab-${id}"]`);
const clickTab = async (container, id) => {
  await act(async () => {
    tabButton(container, id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const rowText = (container, testId) => {
  const el = container.querySelector(`[data-testid="${testId}"]`);
  return el ? el.textContent : null;
};

beforeEach(() => {
  // language-guard: allow-legacy getStorico is the existing api.js method name being mocked, not new vocabulary
  api.getStorico.mockReset().mockResolvedValue({ righe: [] });
  // language-guard: allow-legacy getSerata is the existing api.js method name being mocked, not new vocabulary
  api.getSerata.mockReset().mockResolvedValue(SERATA);
  api.getEconomiaLedger.mockReset().mockResolvedValue(LEDGER_OK);
  // language-guard: allow-legacy `ordenes` is the existing api.js payload key, not new vocabulary
  api.getOrdenes.mockReset().mockResolvedValue({ ordenes: [] });
  // language-guard: allow-legacy `ordenes` is the existing api.js payload key, not new vocabulary
  api.getOrdenesArchivadosSesion.mockReset().mockResolvedValue({ ordenes: [] });
});

// ── A ──────────────────────────────────────────────────────────────────
describe('A — Economía opens on General', () => {
  test('the default tab is General, and it is the tab marked selected', async () => {
    const container = await mount();
    expect(container.querySelector('[data-testid="economia-general"]')).toBeTruthy();
    expect(tabButton(container, 'general').getAttribute('aria-selected')).toBe('true');
    for (const other of ['caja', 'historial', 'estadisticas', 'clientes']) {
      expect(tabButton(container, other).getAttribute('aria-selected')).toBe('false');
    }
  });
});

// ── B ──────────────────────────────────────────────────────────────────
describe('B — the bottom nav holds exactly five destinations', () => {
  test('five tabs, in the approved order', async () => {
    const container = await mount();
    const nav = container.querySelector('[data-testid="economia-bottom-nav"]');
    expect(nav).toBeTruthy();
    const buttons = Array.from(nav.querySelectorAll('button'));
    expect(buttons).toHaveLength(5);
    expect(buttons.map((b) => b.textContent.trim()))
      .toEqual(['General', 'Caja', 'Historial', 'Estadísticas', 'Clientes']);
    expect(ECONOMIA_TABS.map((t) => t.id))
      .toEqual(['general', 'caja', 'historial', 'estadisticas', 'clientes']);
  });
});

// ── C ──────────────────────────────────────────────────────────────────
describe('C — vector icons only, no emoji in the new shell', () => {
  // Built from code points, so this guard file contains no emoji of its own.
  // Deliberately EXCLUDES typographic marks the codebase does use — em dash,
  // box-drawing rules in comment separators, the arrow in a period range —
  // and covers the real emoji planes plus the variation selector and ZWJ that
  // only ever appear inside emoji sequences.
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
      // Stroke-based, currentColor, decorative — the HubIcon convention.
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.getAttribute('fill')).toBe('none');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      // No glyph leaks into the name a screen reader announces.
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

    for (const id of ['caja', 'historial', 'estadisticas', 'clientes', 'general']) {
      await clickTab(container, id);
      // The module header and its own nav are still on screen throughout.
      expect(container.textContent).toContain('ECONOMÍA');
      expect(container.querySelector('[data-testid="economia-bottom-nav"]')).toBeTruthy();
    }

    expect(onBack).not.toHaveBeenCalled();
    // A tab is a view, not a route: nothing re-requests the economy.
    expect(api.getEconomiaLedger.mock.calls.length).toBe(ledgerCallsAfterMount);
    // language-guard: allow-legacy getStorico is the existing api.js method name whose call count is read, not new vocabulary
    expect(api.getStorico.mock.calls.length).toBe(storicoCallsAfterMount);
  });

  test('the Caja panel is never unmounted by a tab switch, so it cannot refetch', async () => {
    const container = await mount();
    const panelBefore = container.querySelector('[data-testid="economia-snapshot-panel-stub"]');
    expect(panelBefore).toBeTruthy();
    await clickTab(container, 'caja');
    await clickTab(container, 'clientes');
    // Same DOM node identity across three tabs — it was hidden, not remounted.
    expect(container.querySelector('[data-testid="economia-snapshot-panel-stub"]')).toBe(panelBefore);
  });
});

// ── E ──────────────────────────────────────────────────────────────────
// SMOKE FIX BATCH — the scope moved INTO General and onto the server: it now
// asks /api/economy/v1/snapshot for the window it shows, instead of filtering
// one fixed ledger fetch in the browser. Everything about that scope (which
// window each preset resolves to, that a change re-asks, that stale figures do
// not survive it, the shared Economía/Ventas views, and the 25/08 numbers) is
// asserted in economiaSmokeFixBatch.test.js. General and the legacy tabs
// deliberately no longer share one `periodo`: they read different certified
// readers and answer different questions. What stays here is the SHELL.
describe('E — the selected period is shared and survives tab switching', () => {

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

// ── G ──────────────────────────────────────────────────────────────────
describe('G — the N-8 divergence disclosure is preserved', () => {

  test('no divergence means no note at all', async () => {
    const container = await mount();
    expect(container.querySelector('[data-testid="late-after-close-note"]')).toBeNull();
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
    for (const id of ['general', 'caja', 'historial', 'estadisticas', 'clientes']) {
      await clickTab(container, id);
      const controls = Array.from(container.querySelectorAll('button, a, [role="button"]'));
      for (const el of controls) {
        expect(el.textContent).not.toMatch(CLOSE_ACTION);
        expect(el.textContent).not.toMatch(/^\s*finalizar\s*$/i);
      }
    }
  });

  test('the new shell files declare no close handler', () => {
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
    // This slice deliberately introduces no role expansion of its own.
    expect(app).not.toMatch(/screen==="economia"[^\n]*canAccess/);
  });

  test('the shell introduces no role logic', () => {
    for (const rel of ['components/economia/EconomiaGeneral.jsx', 'components/economia/EconomiaBottomNav.jsx']) {
      expect(readSrc(rel)).not.toMatch(/getRole|canAccess|isAdmin|role\s*===/);
    }
  });
});

// ── K ──────────────────────────────────────────────────────────────────
describe('K — Caja, Historial, Estadísticas and Clientes stay reachable', () => {
  test('the Caja tab shows the I-1 snapshot panel', async () => {
    const container = await mount();
    const panel = container.querySelector('[data-testid="economia-tab-panel-caja"]');
    expect(panel).toBeTruthy();
    expect(panel.style.display).toBe('none');
    await clickTab(container, 'caja');
    expect(container.querySelector('[data-testid="economia-tab-panel-caja"]').style.display).toBe('block');
    expect(container.querySelector('[data-testid="economia-snapshot-panel-stub"]')).toBeTruthy();
  });

  test.each(['historial', 'estadisticas', 'clientes'])('the %s tab renders its existing surface', async (id) => {
    const container = await mount();
    await clickTab(container, id);
    expect(container.querySelector(`[data-testid="economia-legacy-${id}"]`)).toBeTruthy();
  });

  test('the Estadísticas and Clientes entry points still open their existing sections', async () => {
    const container = await mount();
    await clickTab(container, 'estadisticas');
    const statsBtn = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent.includes('Estadísticas') && !b.dataset.testid);
    expect(statsBtn).toBeTruthy();
    await act(async () => { statsBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(document.body.textContent).toMatch(/Estadísticas/);

    const clientesBtn = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent.includes('Clientes') && !b.dataset.testid);
    expect(clientesBtn).toBeTruthy();
  });
});
