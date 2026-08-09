import {
  formatEuroCents, describeIncidentType, describeCategory, describeResolutionStatus,
  describeFinancialExposure, describePreviousCloseoutIncidents, isActionableStatus,
} from './incidentDisplay';

describe('formatEuroCents — es-ES locale, comma decimal separator', () => {
  test('6250 cents -> "62,50 €"', () => {
    expect(formatEuroCents(6250)).toBe('62,50 €');
  });
  test('0 cents -> "0,00 €"', () => {
    expect(formatEuroCents(0)).toBe('0,00 €');
  });
  test('non-numeric input never throws, degrades to 0,00 €', () => {
    expect(formatEuroCents(null)).toBe('0,00 €');
    expect(formatEuroCents(undefined)).toBe('0,00 €');
    expect(formatEuroCents('not a number')).toBe('0,00 €');
  });
});

describe('describeIncidentType — known types + safe unknown fallback', () => {
  test('UNPAID_BALANCE_AT_CLOSE -> Saldo pendiente al cierre', () => {
    expect(describeIncidentType('UNPAID_BALANCE_AT_CLOSE')).toBe('Saldo pendiente al cierre');
  });
  test('KITCHEN_WORK_PENDING_AT_CLOSE has a concise Spanish label', () => {
    expect(typeof describeIncidentType('KITCHEN_WORK_PENDING_AT_CLOSE')).toBe('string');
    expect(describeIncidentType('KITCHEN_WORK_PENDING_AT_CLOSE').length).toBeGreaterThan(0);
  });
  test('a brand-new/unknown incident type never crashes, renders a generic fallback', () => {
    expect(() => describeIncidentType('SOME_FUTURE_TYPE_NOT_YET_MAPPED')).not.toThrow();
    expect(describeIncidentType('SOME_FUTURE_TYPE_NOT_YET_MAPPED')).toBe('Incidencia de cierre');
  });
  test('null/undefined type never crashes', () => {
    expect(() => describeIncidentType(null)).not.toThrow();
    expect(() => describeIncidentType(undefined)).not.toThrow();
  });
});

describe('describeCategory', () => {
  test.each([
    ['operational', 'Operativa'], ['financial', 'Financiera'], ['informational', 'Informativa'],
    ['integrity', 'Integridad'], ['security', 'Seguridad'],
  ])('%s -> %s', (cat, label) => { expect(describeCategory(cat)).toBe(label); });
  test('unknown category has a safe fallback', () => {
    expect(() => describeCategory('something_new')).not.toThrow();
  });
});

describe('describeResolutionStatus — superseded is semantically distinct from resolved', () => {
  test('pending -> Pendiente', () => { expect(describeResolutionStatus('pending')).toBe('Pendiente'); });
  test('acknowledged -> Revisada', () => { expect(describeResolutionStatus('acknowledged')).toBe('Revisada'); });
  test('resolved -> Resuelta', () => { expect(describeResolutionStatus('resolved')).toBe('Resuelta'); });
  test('superseded -> its own label, NEVER "Resuelta"', () => {
    const label = describeResolutionStatus('superseded');
    expect(label).not.toBe('Resuelta');
    expect(label.toLowerCase()).toContain('superada');
  });
});

describe('isActionableStatus', () => {
  test('pending/acknowledged are actionable', () => {
    expect(isActionableStatus('pending')).toBe(true);
    expect(isActionableStatus('acknowledged')).toBe(true);
  });
  test('resolved/superseded are NOT actionable', () => {
    expect(isActionableStatus('resolved')).toBe(false);
    expect(isActionableStatus('superseded')).toBe(false);
  });
});

describe('describeFinancialExposure — never implies a historical amount is still owed', () => {
  test('actionable financial incident: "pendientes al cierre" phrasing', () => {
    const text = describeFinancialExposure({ category: 'financial', financial_exposure_cents: 6250, resolution_status: 'pending' });
    expect(text).toBe('62,50 € pendientes al cierre');
  });
  test('historical (resolved) financial incident: "Exposición al detectar" phrasing, not "pendientes"', () => {
    const text = describeFinancialExposure({ category: 'financial', financial_exposure_cents: 6250, resolution_status: 'resolved' });
    expect(text).toBe('Exposición al detectar: 62,50 €');
    expect(text).not.toMatch(/pendientes al cierre/);
  });
  test('historical (superseded) financial incident uses the SAME "al detectar" phrasing, not "pendientes"', () => {
    const text = describeFinancialExposure({ category: 'financial', financial_exposure_cents: 1000, resolution_status: 'superseded' });
    expect(text).toBe('Exposición al detectar: 10,00 €');
  });
  test('non-financial category -> null (never shown)', () => {
    expect(describeFinancialExposure({ category: 'operational', financial_exposure_cents: null, resolution_status: 'pending' })).toBeNull();
  });
  test('financial category but no exposure recorded -> null', () => {
    expect(describeFinancialExposure({ category: 'financial', financial_exposure_cents: null, resolution_status: 'pending' })).toBeNull();
  });
});

describe('describePreviousCloseoutIncidents — the operator banner decision', () => {
  test('mandatory case: total 3, financial exposure 6250 -> visible, count + amount', () => {
    const info = describePreviousCloseoutIncidents({
      has_actionable_incidents: true,
      counts: { total: 3, informational: 0, operational: 2, financial: 1, critical: 0 },
      financial_exposure_cents: 6250,
    });
    expect(info).not.toBeNull();
    expect(info.visible).toBe(true);
    expect(info.text).toContain('3');
    expect(info.text).toContain('62,50 €');
  });

  test('mandatory case: operational-only, exposure 0 -> count shown, NO "0,00 €" anywhere', () => {
    const info = describePreviousCloseoutIncidents({
      has_actionable_incidents: true,
      counts: { total: 2, informational: 0, operational: 2, financial: 0, critical: 0 },
      financial_exposure_cents: 0,
    });
    expect(info).not.toBeNull();
    expect(info.text).toContain('2');
    expect(info.text).not.toMatch(/0,00\s*€/);
  });

  test('mandatory case: has_actionable_incidents explicitly false -> null (no banner)', () => {
    const info = describePreviousCloseoutIncidents({
      has_actionable_incidents: false,
      counts: { total: 0, informational: 0, operational: 0, financial: 0, critical: 0 },
      financial_exposure_cents: 0,
    });
    expect(info).toBeNull();
  });

  test('mandatory case: field entirely absent (undefined) -> null, never throws', () => {
    expect(() => describePreviousCloseoutIncidents(undefined)).not.toThrow();
    expect(describePreviousCloseoutIncidents(undefined)).toBeNull();
    expect(describePreviousCloseoutIncidents(null)).toBeNull();
  });

  test('singular phrasing for exactly 1 incident (no "1 incidencias")', () => {
    const info = describePreviousCloseoutIncidents({
      has_actionable_incidents: true,
      counts: { total: 1, informational: 0, operational: 1, financial: 0, critical: 0 },
      financial_exposure_cents: 0,
    });
    expect(info.text).not.toMatch(/1 incidencias/);
    expect(info.text).toMatch(/1 incidencia\b/);
  });
});
