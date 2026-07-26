// ===============================================================
// serviceSessionState.js — S2-7D5
//
// Pure interpretation of the backend contracts around the operational shift.
// No React, no fetch: everything here is a function of a response body, so the
// gate's behaviour is unit-testable without a browser.
//
// CONTRACT (backend src/closeout/currentServiceCloseout.js):
//   { ok, available, code, serviceSessionId, businessDate, openedAt, closedAt,
//     status: 'none' | 'open' | 'closing' | 'closed', totals, counts, ... }
//
// Only status === 'open' means an order may be created. 'closing' and 'closed'
// are `available:true` for reporting, but the DB trigger
// (service_session_assign_order) still raises NO_OPEN_SERVICE_SESSION on insert,
// so the gate must treat them as CLOSED for order entry. Reporting a shift as
// usable when the database will refuse the write is exactly the failure this
// block exists to remove.
// ===============================================================

export const SERVICE_PHASE = Object.freeze({
  LOADING: 'loading',
  OPEN: 'open',
  CLOSED: 'closed',
  ERROR: 'error',
});

// There is exactly one service identity and the backend chooses it. The client
// never selects a session, a date, or a lunch/dinner window — see the backend
// docs/SERVICE_SESSION_IDENTITY.md. This constant documents that at the call site.
export const CLIENT_SELECTS_SESSION = false;

export function classifyServiceState(res) {
  if (!res || typeof res !== 'object') {
    return { phase: SERVICE_PHASE.ERROR, message: 'No se pudo leer el estado del servicio.' };
  }
  if (res.error) {
    return {
      phase: SERVICE_PHASE.ERROR,
      message: res.error === 'sesión expirada'
        ? 'Sesión expirada. Vuelve a introducir el PIN.'
        : 'No se pudo leer el estado del servicio.',
    };
  }
  const status = String(res.status || (res.available ? '' : 'none'));
  const common = {
    status,
    businessDate: res.businessDate || null,
    openedAt: res.openedAt || null,
    closedAt: res.closedAt || null,
  };
  if (status === 'open') return { phase: SERVICE_PHASE.OPEN, ...common };
  // 'none' | 'closing' | 'closed' — no order may be created.
  return { phase: SERVICE_PHASE.CLOSED, ...common };
}

const two = (n) => String(n).padStart(2, '0');

// "Servicio abierto · 2026-07-26 · 21:14" — restrained, one line, no seconds.
export function serviceOpenLabel(state) {
  if (!state || state.phase !== SERVICE_PHASE.OPEN) return '';
  const parts = ['Servicio abierto'];
  if (state.businessDate) parts.push(String(state.businessDate));
  if (state.openedAt) {
    const d = new Date(state.openedAt);
    if (!Number.isNaN(d.getTime())) parts.push(`${two(d.getHours())}:${two(d.getMinutes())}`);
  }
  return parts.join(' · ');
}

// Why the service is not usable for order entry, in operator Spanish.
export function closedServiceReason(state) {
  const status = state && state.status;
  if (status === 'closing') return 'El servicio se está cerrando.';
  if (status === 'closed') return 'El servicio de hoy ya está cerrado.';
  return 'No hay un servicio abierto';
}
