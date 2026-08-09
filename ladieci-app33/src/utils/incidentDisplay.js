// ===============================================================
// incidentDisplay.js — SERVICE CLOSEOUT V2 / SLICE 4B
//
// Pure presentation logic for backend closeout-incident facts: currency
// formatting, human labels for incident_type/category/resolution_status, and
// the operator carryover-banner decision. No React, no fetch — same
// philosophy as serviceEnsureOutcome.js/serviceEnsureFlow.js: the DECISION is
// provable without a renderer, and every component (the operator banner, the
// Admin Incidencias page) reads from this ONE module rather than each
// inventing its own mapping.
//
// Backend never returns a plain euro float here — financial_exposure_cents
// is always integer cents (see migrations/2026-08-08_service_closeout_
// incidents_foundation.sql). Never recomputed/rounded beyond formatting.
// ===============================================================

// "6250" -> "62,50 €" — es-ES locale (comma decimal separator), matching the
// product-spec copy examples exactly. No shared currency formatter exists
// elsewhere in this codebase (every screen inlines .toFixed(2), which yields
// a period, not the Spanish comma) — this is deliberately NOT that pattern.
export function formatEuroCents(cents) {
  const n = Number(cents);
  const safe = Number.isFinite(n) ? n : 0;
  return (safe / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// ── incident_type → concise Spanish label ───────────────────────────────────
// Known backend constants (src/serviceSessions/rolloverClassifier.js on the
// backend). Unknown/future types MUST still render safely — never crash,
// never hide the incident — via the generic fallback below.
const INCIDENT_TYPE_LABEL = Object.freeze({
  ORDER_UNCONFIRMED_AT_CLOSE: 'Pedido sin confirmar al cierre',
  KITCHEN_WORK_PENDING_AT_CLOSE: 'Trabajo de cocina pendiente al cierre',
  ORDER_READY_NOT_FINALIZED_AT_CLOSE: 'Pedido listo sin finalizar al cierre',
  DELIVERY_ACTIVE_AT_CLOSE: 'Reparto en curso al cierre',
  ORDER_STATE_UNRESOLVED_AT_CLOSE: 'Estado de pedido sin resolver al cierre',
  UNPAID_BALANCE_AT_CLOSE: 'Saldo pendiente al cierre',
  EMPTY_TABLE_LEFT_OPEN: 'Mesa vacía olvidada abierta',
});

export function describeIncidentType(incidentType) {
  return INCIDENT_TYPE_LABEL[incidentType] || 'Incidencia de cierre';
}

// ── category → concise Spanish label ────────────────────────────────────────
const CATEGORY_LABEL = Object.freeze({
  informational: 'Informativa',
  operational: 'Operativa',
  financial: 'Financiera',
  integrity: 'Integridad',
  security: 'Seguridad',
});

export function describeCategory(category) {
  return CATEGORY_LABEL[category] || 'Otra';
}

// ── resolution_status → concise Spanish label ───────────────────────────────
// 'superseded' is deliberately NEVER labeled the same as 'resolved' — the
// closeout attempt that detected it was abandoned before the real close, not
// addressed by anyone. Conflating the two would falsify the audit record.
const RESOLUTION_STATUS_LABEL = Object.freeze({
  pending: 'Pendiente',
  acknowledged: 'Revisada',
  resolved: 'Resuelta',
  superseded: 'Superada por un nuevo intento de cierre',
});

export function describeResolutionStatus(resolutionStatus) {
  return RESOLUTION_STATUS_LABEL[resolutionStatus] || resolutionStatus || 'Desconocido';
}

export const ACTIONABLE_RESOLUTION_STATUSES = Object.freeze(['pending', 'acknowledged']);
export const HISTORICAL_RESOLUTION_STATUSES = Object.freeze(['resolved', 'superseded']);

export function isActionableStatus(resolutionStatus) {
  return ACTIONABLE_RESOLUTION_STATUSES.includes(resolutionStatus);
}

// ── financial exposure phrasing — never implies a historical amount is still
// currently unpaid ─────────────────────────────────────────────────────────
export function describeFinancialExposure(incident) {
  if (!incident || incident.category !== 'financial' || incident.financial_exposure_cents == null) return null;
  const amount = formatEuroCents(incident.financial_exposure_cents);
  return isActionableStatus(incident.resolution_status)
    ? `${amount} pendientes al cierre`
    : `Exposición al detectar: ${amount}`;
}

// ── operator carryover banner — the ONE decision the banner component reads ─
// Returns null whenever nothing should render: no summary, a summary with
// has_actionable_incidents !== true (explicitly false, or the field simply
// absent — both collapse to "no banner", never an error state).
export function describePreviousCloseoutIncidents(summary) {
  if (!summary || summary.has_actionable_incidents !== true) return null;
  const total = (summary.counts && Number(summary.counts.total)) || 0;
  const cents = Number(summary.financial_exposure_cents) || 0;
  const countPhrase = `${total} incidencia${total === 1 ? '' : 's'} pendiente${total === 1 ? '' : 's'}`;
  const text = cents > 0
    ? `${countPhrase} · ${formatEuroCents(cents)} por revisar`
    : `${countPhrase} del servicio anterior`;
  return Object.freeze({ visible: true, text, total, financialExposureCents: cents });
}
