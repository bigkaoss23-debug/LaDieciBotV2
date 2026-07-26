import {
  SERVICE_PHASE, classifyServiceState, serviceOpenLabel, closedServiceReason, CLIENT_SELECTS_SESSION,
} from './serviceSessionState';

const openRes = {
  ok: true, available: true, code: 'OK', status: 'open',
  serviceSessionId: '3665f8a0-3c1e-4277-9fc7-0d71ce27ee8f',
  businessDate: '2026-07-26', openedAt: '2026-07-26T19:14:44.537Z', closedAt: null,
};

describe('classifyServiceState', () => {
  test('status open is the ONLY phase that admits order entry', () => {
    expect(classifyServiceState(openRes).phase).toBe(SERVICE_PHASE.OPEN);
  });

  test('no session at all → closed', () => {
    const res = { ok: true, available: false, code: 'NO_CURRENT_SERVICE', status: 'none' };
    expect(classifyServiceState(res).phase).toBe(SERVICE_PHASE.CLOSED);
  });

  // The DB trigger still refuses inserts while closing/closed, so `available:true`
  // must NOT be mistaken for "orders may be created".
  test('closing and closed are available for reporting but CLOSED for order entry', () => {
    expect(classifyServiceState({ ...openRes, status: 'closing' }).phase).toBe(SERVICE_PHASE.CLOSED);
    expect(classifyServiceState({ ...openRes, status: 'closed' }).phase).toBe(SERVICE_PHASE.CLOSED);
  });

  test('an error body is an error phase, never an open service', () => {
    expect(classifyServiceState({ error: 'boom' }).phase).toBe(SERVICE_PHASE.ERROR);
    expect(classifyServiceState(null).phase).toBe(SERVICE_PHASE.ERROR);
    expect(classifyServiceState(undefined).phase).toBe(SERVICE_PHASE.ERROR);
  });

  test('an expired session says so in Spanish', () => {
    expect(classifyServiceState({ error: 'sesión expirada' }).message).toMatch(/PIN/i);
  });

  test('metadata is carried through for display', () => {
    const s = classifyServiceState(openRes);
    expect(s.businessDate).toBe('2026-07-26');
    expect(s.openedAt).toBe('2026-07-26T19:14:44.537Z');
  });
});

describe('labels', () => {
  test('open label is one restrained line with the business date', () => {
    const label = serviceOpenLabel(classifyServiceState(openRes));
    expect(label).toMatch(/^Servicio abierto/);
    expect(label).toContain('2026-07-26');
  });

  test('no label when the service is not open', () => {
    expect(serviceOpenLabel(classifyServiceState({ status: 'none' }))).toBe('');
    expect(serviceOpenLabel(null)).toBe('');
  });

  test('closed reasons are operator Spanish, distinct per status', () => {
    expect(closedServiceReason({ status: 'none' })).toBe('No hay un servicio abierto');
    expect(closedServiceReason({ status: 'closing' })).toMatch(/cerrando/i);
    expect(closedServiceReason({ status: 'closed' })).toMatch(/ya está cerrado/i);
  });
});

test('the client never selects a session — no selector concept exists here', () => {
  expect(CLIENT_SELECTS_SESSION).toBe(false);
});
