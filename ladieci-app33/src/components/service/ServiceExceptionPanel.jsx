// ===============================================================
// ServiceExceptionPanel.jsx — S2-7D6C
//
// THE surface for every non-success ensureCurrentServiceSession outcome. It is
// presentational only — the outcome (title, message, retryability, whether a
// closeout link helps) is entirely decided by serviceEnsureOutcome.js, never
// re-interpreted here. Renders natural Spanish only; no raw backend code or
// stack trace ever reaches this component's own markup (the classifier's
// `message` is already the safe, human copy).
//
// This is NOT the normal opening flow — there is no confirmation, no "abrir
// servicio" affordance here. A "Ver cierre del servicio" link is offered only
// where a human action there could resolve the conflict (see
// exceptionShowsCloseoutLink); that page keeps its own, separate, unchanged
// manual-recovery control (useOpenServiceController + OpenServiceConfirmation)
// for the rare case a deliberate, audited attempt is actually needed.
//
// STALE SERVICE PROTECTION V1 — the ONE exception with a real recovery action
// here: PREVIOUS_SERVICE_PENDING. It shows a compact "servicio anterior"
// line (the backend-supplied stale Business Day, never computed here) and a
// "Finalizar servicio anterior" button that opens the EXISTING Finalizar flow
// (FinalizarServicioModal — the same component ServicioPage mounts) in place.
// On a successful close it re-runs the silent ensure via onRetry.
// ===============================================================

import { useState } from 'react';
import {
  exceptionAllowsRetry, exceptionShowsCloseoutLink, exceptionShowsStaleFinalize, isRider,
} from '../../utils/serviceEnsureOutcome';
import { Row, identityGrid, fmtDate, fmtTime, roleLabelOf, primaryBtn, ghostBtn } from './OpenServiceConfirmation';
import FinalizarServicioModal from '../servicio/FinalizarServicioModal';

// Backend 'YYYY-MM-DD' → 'DD/MM'. Presentation only; never a comparison.
const shortBusinessDate = (isoDate) =>
  (typeof isoDate === 'string' && isoDate.length >= 10)
    ? `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`
    : '';

export default function ServiceExceptionPanel({ role, actor, exception, retrying, onRetry, onCloseout }) {
  const now = new Date();
  const kind = exception && exception.kind;
  const canRetry = exceptionAllowsRetry(kind);
  const showCloseout = Boolean(onCloseout) && exceptionShowsCloseoutLink(kind);
  const showStaleFinalize = exceptionShowsStaleFinalize(kind) && !isRider(role);
  const staleDate = shortBusinessDate(exception && exception.staleBusinessDate);
  const [finalizarOpen, setFinalizarOpen] = useState(false);

  return (
    <main data-testid="service-exception-landing" style={shell}>
      <section style={{ ...panel, maxWidth: 560, width: '100%' }}>
        <p style={eyebrow}>SERVICIO</p>
        <h1 data-testid="service-exception-title" style={{ fontSize: 26, margin: '4px 0 6px' }}>
          {exception && exception.title}
        </h1>
        <p data-testid="service-exception-message" style={{ color: '#a5a5a5', fontSize: 14, lineHeight: 1.6, margin: '0 0 18px' }}>
          {exception && exception.message}
        </p>

        {showStaleFinalize && (
          <div data-testid="service-stale-recovery" style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            border: '1px solid #3a2f22', background: 'rgba(240,169,60,0.08)',
            borderRadius: 12, padding: '10px 12px', margin: '0 0 18px',
          }}>
            <span style={{ color: '#f0a93c', fontWeight: 800, fontSize: 12, letterSpacing: 0.4 }}>SERVICIO ANTERIOR</span>
            {staleDate && (
              <span data-testid="service-stale-date" style={{ color: '#e6e6e6', fontSize: 13, fontWeight: 700 }}>{staleDate}</span>
            )}
            <span style={{ color: '#a5a5a5', fontSize: 12.5 }}>Resolver antes de continuar</span>
          </div>
        )}

        <dl data-testid="service-identity" style={identityGrid}>
          <Row k="Usuario" v={actor || '—'} />
          <Row k="Rol" v={roleLabelOf(role)} />
          <Row k="Fecha" v={fmtDate(now)} />
          <Row k="Hora" v={fmtTime(now)} />
        </dl>

        {isRider(role) && (
          <p data-testid="service-rider-notice" style={{ color: '#fbbf24', fontSize: 13, marginTop: 18 }}>
            El reparto no abre el servicio. Avisa a un operador.
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
          {showStaleFinalize && (
            <button
              data-testid="service-stale-finalize-btn"
              onClick={() => setFinalizarOpen(true)}
              style={primaryBtn}>
              Finalizar servicio anterior
            </button>
          )}
          {canRetry && (
            <button
              data-testid="service-exception-retry-btn"
              onClick={onRetry}
              disabled={retrying}
              style={{ ...(showStaleFinalize ? ghostBtn : primaryBtn), opacity: retrying ? 0.55 : 1, cursor: retrying ? 'default' : 'pointer' }}>
              {retrying ? 'Comprobando…' : 'Reintentar'}
            </button>
          )}
          {showCloseout && (
            /* UX-01 -- this opens the same READ-ONLY report as the Servicio
               bar's "Resumen" button, so it must not promise a "cierre" it
               cannot perform. Same destination, honest name. */
            <button data-testid="service-exception-closeout-btn" onClick={onCloseout} style={ghostBtn}>
              Ver resumen del servicio
            </button>
          )}
        </div>
      </section>

      {/* STALE SERVICE PROTECTION V1 — the EXISTING Finalizar flow, mounted in
          place. No navigation, no second close UI: the stale service IS the
          current service (migration 120 leaves the pointer read untouched), so
          this closes exactly the right one. A real close re-runs the silent
          ensure, which then lands on the normal idle / open state. */}
      <FinalizarServicioModal
        open={finalizarOpen}
        title="Finalizar servicio anterior"
        onClose={() => setFinalizarOpen(false)}
        onClosed={() => { setFinalizarOpen(false); if (onRetry) onRetry(); }}
      />
    </main>
  );
}

const shell = {
  minHeight: '100vh', background: '#080808', color: '#fff', padding: 20,
  fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const panel = { background: '#141414', border: '1px solid #2c2c2c', borderRadius: 16, padding: 22 };
const eyebrow = { color: '#f97316', fontWeight: 800, letterSpacing: 2, fontSize: 11, margin: 0 };
