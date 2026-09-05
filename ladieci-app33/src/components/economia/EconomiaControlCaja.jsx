import { useState } from 'react';
import { C } from '../../constants';
import useEconomyCashCounts from '../../economy/useEconomyCashCounts';

// ===============================================================
// EconomiaControlCaja — the READ-ONLY cash-count evidence for the period
// General currently has selected.
//
// COMPACT BY DEFAULT. One row: a label, the number of counts the backend
// returned for this scope, and a status glyph. It expands to the exact
// persisted records. There is NO write control here — no "Registrar conteo",
// no edit, no delete: the operational count writer lives with the current
// service, not in a reporting screen.
//
// THE STATUS IS COUNTS, NOT MONEY. `⚠ N` is "N of these counts had a non-zero
// stored variance", decided to the cent from the backend's own
// `variance` field — never recomputed here from registered − counted, and
// never netted into one figure. A later clean count can NEVER hide an earlier
// discrepancy, because every non-zero row is counted, not just the newest.
// ===============================================================

const CREAM = '#f2ece3';
const LABEL = 'rgba(255,255,255,0.62)';
const MUTED = 'rgba(255,255,255,0.38)';
const OK = C.verde;
const WARN = C.orange;

const card = {
  border: '1px solid rgba(255,255,255,.075)',
  background: 'rgba(255,255,255,.028)',
  borderRadius: 16, marginBottom: 10, overflow: 'hidden',
};
const eyebrow = {
  color: MUTED, fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
};

const eur = (v) => `${(Number(v) || 0).toFixed(2).replace('.', ',')} €`;
const clock = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', hour12: false,
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(d).replace(',', '');
};

const Glyph = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{d}</svg>
);
const I_CHECK = <path d="M4 12.5l5 5L20 6.5" />;
const I_WARN = <><path d="M12 3.5 1.7 20.5h20.6L12 3.5Z" /><path d="M12 10v5M12 18h.01" /></>;
const I_CHEV = <path d="M9 6l6 6-6 6" />;

const varTone = (v) => {
  const c = Math.round((Number(v) || 0) * 100);
  return c === 0 ? OK : c > 0 ? C.blu : WARN;
};

export default function EconomiaControlCaja({ scope }) {
  const [open, setOpen] = useState(false);
  const {
    counts, recordCount, discrepancyCount, status,
  } = useEconomyCashCounts(scope || {});

  const loading = status === 'loading' || status === 'incomplete';
  const failed = status === 'error';

  // The compact right-hand status. Zero records → just the number, nothing
  // else. No "Sin conteos registrados", no explanatory paragraph.
  const StatusMark = () => {
    if (loading) return <span style={{ color: MUTED, fontSize: 12 }}>···</span>;
    if (failed) return <span style={{ color: MUTED, fontSize: 12 }}>—</span>;
    if (recordCount === 0) return null;
    if (discrepancyCount > 0) {
      return (
        <span data-testid="control-caja-warn" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: WARN, fontWeight: 800, fontSize: 12.5 }}>
          <Glyph d={I_WARN} size={13} /> {discrepancyCount}
        </span>
      );
    }
    return <span data-testid="control-caja-ok" style={{ color: OK, display: 'inline-flex' }}><Glyph d={I_CHECK} size={15} /></span>;
  };

  const canExpand = !loading && !failed && recordCount > 0;

  return (
    <div style={card} data-testid="general-control-caja">
      <button
        type="button"
        data-testid="control-caja-toggle"
        aria-expanded={canExpand ? open : undefined}
        onClick={() => canExpand && setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          background: 'transparent', border: 'none', padding: '13px 14px', minHeight: 44,
          cursor: canExpand ? 'pointer' : 'default', textAlign: 'left',
        }}
      >
        <span style={{ ...eyebrow, flex: '0 0 auto' }}>Control caja</span>
        <span style={{ flex: '1 1 auto' }} />
        <span data-testid="control-caja-count" style={{
          color: recordCount === 0 && !loading && !failed ? MUTED : CREAM,
          fontWeight: 900, fontSize: 14.5, fontFamily: "'DM Mono',monospace",
        }}>
          {loading ? '·' : failed ? '·' : recordCount}
        </span>
        <StatusMark />
        {canExpand && (
          <span style={{ color: MUTED, flex: '0 0 auto', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
            <Glyph d={I_CHEV} size={13} />
          </span>
        )}
      </button>

      {canExpand && open && (
        <div data-testid="control-caja-detail" style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
          {counts.map((row) => (
            <div key={row.id} data-testid="control-caja-row" style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px',
              padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,.045)',
            }}>
              <span style={{ color: CREAM, fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>{clock(row.countedAt)}</span>
              <span style={{ color: LABEL, fontSize: 12, fontWeight: 600 }}>{row.actor}</span>
              <span style={{ flex: '1 1 100%' }} />
              <span style={{ color: MUTED, fontSize: 11.5 }}>registrado {eur(row.recordedCashReceipts)}</span>
              <span style={{ color: LABEL, fontSize: 11.5 }}>contado {eur(row.countedCash)}</span>
              <span style={{ color: varTone(row.variance), fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                {eur(row.variance)}
              </span>
              {row.note ? (
                <span style={{ flex: '1 1 100%', color: MUTED, fontSize: 11, fontStyle: 'italic' }}>{row.note}</span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
