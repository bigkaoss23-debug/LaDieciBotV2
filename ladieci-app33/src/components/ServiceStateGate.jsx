// ===============================================================
// ServiceStateGate.jsx — S2-7D5, shared-controller refactor S2-7D5B,
// silent ensure S2-7D6C
//
// THE service-state gate for the operational surface.
//
// S2-7D5's gap: its only "Abrir nuevo servicio" button lived inside the
// closeout page, so an operator entering Servicio saw a fully normal
// order-entry screen that could not possibly save. S2-7D5B centralized the
// button behind one guarded confirm-then-open flow, but it was still a MANUAL
// action every operator had to perform on every shift.
//
// S2-7D6C removes that manual step entirely. An authorized admin/operator
// entering Servicio silently calls ensureCurrentServiceSession — idempotent,
// so the second operator of a shift reuses the first one's session — and the
// operational shell simply opens. There is no confirmation, no success modal:
// created:true and created:false render identically. Manual opening
// (useOpenServiceController + OpenServiceConfirmation) still exists, entirely
// unchanged, but is reachable only from the closeout page now — an
// exceptional, deliberate, audited recovery action, never this gate's normal
// path. See "Ver cierre del servicio" below for the one place this gate still
// points there.
//
// Four states:
//   ensuring/retrying → a clear waiting surface, never a half-usable Servicio
//   ready             → the real Servicio, plus one restrained status line
//   exception         → the backend's typed reason, mapped to natural Spanish
//                        — never a locally invented schedule/session decision
// ===============================================================

import { useEffect, useRef } from 'react';
import { useSilentServiceEnsure, ENSURE_PHASE } from '../hooks/useSilentServiceEnsure';
import { ensuredStatusLabel } from '../utils/serviceEnsureOutcome';
import ServiceExceptionPanel from './service/ServiceExceptionPanel';
import PreviousCloseoutIncidentsBanner from './service/PreviousCloseoutIncidentsBanner';

export default function ServiceStateGate({ role, actor, onCloseout, children, hideStatusChrome = false }) {
  const ensure = useSilentServiceEnsure({ role });
  const { phase, session, exception, previousCloseoutIncidents, retry, recheckSilently } = ensure;
  const recheckRef = useRef(recheckSilently);
  recheckRef.current = recheckSilently;

  // A write refused with NO_OPEN_SERVICE_SESSION means the shift closed under
  // us (the operational rollover, or another operator's close). Silently
  // re-ensure rather than keep pretending — this never flips the visible
  // phase away from READY unless the outcome actually changed, so an
  // in-progress order on screen is not disturbed by a background check that
  // comes back the same.
  useEffect(() => {
    const onLost = () => { recheckRef.current(); };
    window.addEventListener('ld-service-session-lost', onLost);
    return () => window.removeEventListener('ld-service-session-lost', onLost);
  }, []);

  // ── ready → the real Servicio, with one restrained status line ─────────────
  if (phase === ENSURE_PHASE.READY) {
    return (
      <>
        {/* MOBILE_SHELL_POLISH_01 -- hideStatusChrome is set only by the Mesa
            phone shell (ServicioPage -> App.jsx), which has its own compact
            header and its own admin-only back arrow. Neither the session
            status nor any pending incidents are discarded: recheckSilently/
            previousCloseoutIncidents keep running underneath exactly as
            before, and both reappear the instant the admin steps back out to
            the normal Servicio view (hideStatusChrome flips false again). */}
        {!hideStatusChrome && (
          <div
            data-testid="service-open-status"
            style={{
              position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 140,
              background: 'rgba(46,213,115,0.10)', border: '1px solid rgba(46,213,115,0.32)',
              borderRadius: 999, padding: '4px 14px', color: 'rgba(120,231,168,0.9)',
              fontSize: 11, fontWeight: 700, letterSpacing: 0.3, pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}>
            {ensuredStatusLabel(session)}
          </div>
        )}
        {/* SERVICE CLOSEOUT V2 / SLICE 4B — compact, non-blocking, informational
            only. Never covers order controls (fixed, pointerEvents:none, sits
            below the status pill above), never replaces {children}, never a
            modal. Renders nothing when there is nothing actionable to report
            (see PreviousCloseoutIncidentsBanner/describePreviousCloseoutIncidents). */}
        {!hideStatusChrome && <PreviousCloseoutIncidentsBanner summary={previousCloseoutIncidents} />}
        {children}
      </>
    );
  }

  // ── exception → the typed backend reason, never a normal opening screen ───
  if (phase === ENSURE_PHASE.EXCEPTION) {
    return (
      <ServiceExceptionPanel
        role={role} actor={actor} exception={exception}
        retrying={false} onRetry={retry} onCloseout={onCloseout}
      />
    );
  }

  // ── ensuring / retrying / idle → a clear waiting surface ───────────────────
  return (
    <main data-testid="service-gate-loading" style={shell}>
      <div style={{ ...panel, maxWidth: 520, textAlign: 'center' }}>
        <p style={eyebrow}>SERVICIO</p>
        <h1 style={{ fontSize: 22, margin: '4px 0 10px' }}>
          {phase === ENSURE_PHASE.RETRYING ? 'Reintentando…' : 'Comprobando el estado del servicio…'}
        </h1>
        <p style={{ color: '#9a9a9a', fontSize: 14, margin: 0 }}>
          Un momento: los pedidos solo pueden crearse con un servicio abierto.
        </p>
      </div>
    </main>
  );
}

const shell = {
  minHeight: '100vh', background: '#080808', color: '#fff', padding: 20,
  fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const panel = { background: '#141414', border: '1px solid #2c2c2c', borderRadius: 16, padding: 22 };
const eyebrow = { color: '#f97316', fontWeight: 800, letterSpacing: 2, fontSize: 11, margin: 0 };
