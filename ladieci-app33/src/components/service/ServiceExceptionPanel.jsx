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
// ===============================================================

import { exceptionAllowsRetry, exceptionShowsCloseoutLink, isRider } from '../../utils/serviceEnsureOutcome';
import { Row, identityGrid, fmtDate, fmtTime, roleLabelOf, primaryBtn, ghostBtn } from './OpenServiceConfirmation';

export default function ServiceExceptionPanel({ role, actor, exception, retrying, onRetry, onCloseout }) {
  const now = new Date();
  const kind = exception && exception.kind;
  const canRetry = exceptionAllowsRetry(kind);
  const showCloseout = Boolean(onCloseout) && exceptionShowsCloseoutLink(kind);

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
          {canRetry && (
            <button
              data-testid="service-exception-retry-btn"
              onClick={onRetry}
              disabled={retrying}
              style={{ ...primaryBtn, opacity: retrying ? 0.55 : 1, cursor: retrying ? 'default' : 'pointer' }}>
              {retrying ? 'Comprobando…' : 'Reintentar'}
            </button>
          )}
          {showCloseout && (
            <button data-testid="service-exception-closeout-btn" onClick={onCloseout} style={ghostBtn}>
              Ver cierre del servicio
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

const shell = {
  minHeight: '100vh', background: '#080808', color: '#fff', padding: 20,
  fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const panel = { background: '#141414', border: '1px solid #2c2c2c', borderRadius: 16, padding: 22 };
const eyebrow = { color: '#f97316', fontWeight: 800, letterSpacing: 2, fontSize: 11, margin: 0 };
