// ===============================================================
// PreviousCloseoutIncidentsBanner.jsx — SERVICE CLOSEOUT V2 / SLICE 4B
//
// Compact, NON-BLOCKING advisory: "the service is open and operational, but
// the previous closeout left actionable incidents". It must never read as
// "you cannot continue" — the entire point of Service Closeout V2 is that a
// previous anomaly no longer freezes the next service.
//
// Read-only: no action, no dismiss, no mutation. Backend truth only — this
// component owns no state of its own beyond what it is handed, so a page
// refresh simply re-derives it from the next ensure() response, never from
// localStorage.
// ===============================================================

import { describePreviousCloseoutIncidents } from '../../utils/incidentDisplay';

export default function PreviousCloseoutIncidentsBanner({ summary }) {
  const info = describePreviousCloseoutIncidents(summary);
  if (!info) return null;

  return (
    <div
      data-testid="previous-closeout-incidents-banner"
      role="status"
      style={{
        position: 'fixed', top: 40, left: '50%', transform: 'translateX(-50%)', zIndex: 139,
        background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.32)',
        borderRadius: 999, padding: '4px 14px', color: 'rgba(253,186,116,0.95)',
        fontSize: 11, fontWeight: 700, letterSpacing: 0.2, pointerEvents: 'none',
        maxWidth: '92vw', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {info.text}
    </div>
  );
}
