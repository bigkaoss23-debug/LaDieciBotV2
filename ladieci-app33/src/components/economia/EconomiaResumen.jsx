import { useState } from 'react';

// ===============================================================
// EconomiaResumen — ECONOMÍA V2 / STEP 1
//
// The default tab of the Economía module, and a serious economic overview
// only: what was collected, and what was sold. No product mix, no customer
// rankings, no delivery counts, no demand curves — those are Estadísticas.
//
// PURELY PRESENTATIONAL. Every figure arrives as a prop, already resolved by
// the certified reader (getEconomiaLedger -> economiaLedgerAggregate). This
// component derives NO money, owns NO fetch and knows NO calendar rule. That
// is deliberate: N-9's whole lesson was that a reporting screen which
// recomputes its own window silently answers a different question than the
// one the ledger answered.
//
// TWO GROUPS, BECAUSE THERE ARE TWO QUESTIONS. Money RECEIVED in the period
// and sales ORIGINATED in the period are not the same number and must never
// be added together — an order billed on Friday and paid on Saturday is in
// one group each day. The old page explained this in a paragraph that
// dominated the screen; the concept survives here as one small note behind
// an `i`.
//
// NO FINALIZAR. Nothing on this screen closes anything.
// ===============================================================

const GOLD = '#d7a84b';
const CREAM = '#f4ecdd';
const BRIGHT = '#f8ecd2';
const MUTED = '#978d7c';
const LABEL = '#a99d89';

const card = {
  border: '1px solid rgba(255,255,255,.09)',
  background: 'rgba(255,255,255,.03)',
  borderRadius: 16,
  padding: '14px 15px',
  marginBottom: 12,
};

const cardTitle = {
  margin: '0 0 10px', color: '#d9c8aa', fontSize: 12.5, fontWeight: 900,
  letterSpacing: .4, textTransform: 'uppercase',
};

const eur = (value, dec = 2) => `${(Number(value) || 0).toFixed(dec).replace('.', ',')} €`;

// One compact row. No giant card per figure: a zero belongs on a line, not
// on a tile the size of a headline.
const Row = ({ label, value, testId, strong, accent, dim, sub }) => (
  <div data-testid={testId} style={{
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
    padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.06)',
    fontSize: strong ? 15 : 13.5,
  }}>
    <span style={{ color: dim ? MUTED : LABEL, fontWeight: strong ? 800 : 600, flex: '1 1 auto', minWidth: 0 }}>
      {label}
      {sub && <span style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, marginTop: 1 }}>{sub}</span>}
    </span>
    <span style={{
      flex: '0 0 auto', fontWeight: strong ? 950 : 800,
      fontSize: strong ? 19 : 14,
      color: dim ? MUTED : accent ? GOLD : CREAM,
      fontFamily: "'DM Mono',monospace",
    }}>{value}</span>
  </div>
);

export default function EconomiaResumen({
  periodos, periodo, onPeriodo,
  windowLine, dayLine,
  ledgerStatus, onRetry,
  cobrado, originado, lateAfterClose,
}) {
  const [helpOpen, setHelpOpen] = useState(false);

  // S2-7D6E4 / N-9 — a money figure is NEVER rendered as 0 while the ledger
  // is loading or has failed. "0,00 €" is exactly the temporarily-false value
  // this gate exists to prevent.
  const ready = ledgerStatus === 'ready';
  const money = (n, dec = 2) => (
    ledgerStatus === 'error' ? '—' : ledgerStatus === 'loading' ? '···' : eur(n, dec)
  );

  return (
    <div data-testid="economia-resumen">
      {/* Period selection — the same four certified N-9 windows as before,
          visually simplified: no emoji, no gradient slabs. The window RULES
          are untouched; only the pills changed. */}
      <div role="group" aria-label="Período" style={{ display: 'flex', gap: 7, marginBottom: 10, overflowX: 'auto', paddingBottom: 2 }}>
        {periodos.map((p) => {
          const active = periodo === p.id;
          return (
            <button key={p.id} type="button" data-testid={`resumen-periodo-${p.id}`}
              aria-pressed={active} onClick={() => onPeriodo(p.id)}
              style={{
                background: active ? 'rgba(215,168,75,.13)' : 'rgba(255,255,255,.045)',
                border: `1px solid ${active ? GOLD : 'rgba(255,255,255,.10)'}`,
                color: active ? BRIGHT : MUTED,
                borderRadius: 999, padding: '7px 15px', fontSize: 12.5,
                fontWeight: active ? 850 : 700, whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer',
              }}>{p.label}</button>
          );
        })}
      </div>

      {/* N-9 — the interval the SERVER resolved, stated plainly and never
          recomputed here. A reporting screen has to be able to answer
          "which window is this?". */}
      {(windowLine || dayLine) && (
        <div data-testid="economia-window-disclosure" style={{
          color: MUTED, fontSize: 11.5, marginBottom: 14, letterSpacing: .2, lineHeight: 1.5,
        }}>
          {windowLine}
          {windowLine && dayLine ? <br /> : null}
          {dayLine}
        </div>
      )}

      {ledgerStatus === 'loading' && (
        <div data-testid="resumen-ledger-loading" style={{
          color: MUTED, fontSize: 12.5, marginBottom: 12, fontWeight: 600,
        }}>Cargando importes contables…</div>
      )}

      {ledgerStatus === 'error' && (
        <div data-testid="resumen-ledger-error" style={{
          ...card, borderColor: 'rgba(232,52,28,.35)', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ color: '#E8341C', fontWeight: 700, fontSize: 13, flex: 1 }}>
            No se pudieron cargar los importes contables.
          </div>
          <button type="button" onClick={onRetry} style={{
            background: 'rgba(232,52,28,.15)', border: '1px solid rgba(232,52,28,.5)',
            color: '#fff', borderRadius: 10, padding: '7px 14px',
            fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
          }}>Reintentar</button>
        </div>
      )}

      {/* ── GROUP 1 — money that actually arrived in this period ── */}
      <section style={card} data-testid="resumen-cobrado">
        <h3 style={cardTitle}>Cobrado en el período</h3>
        <Row label="Total cobrado" value={money(cobrado?.total)} testId="resumen-total-cobrado" strong accent />
        <Row label="Efectivo" value={money(cobrado?.efectivo)} testId="resumen-efectivo" />
        <Row label="Tarjeta"  value={money(cobrado?.tarjeta)}  testId="resumen-tarjeta" />
        <Row label="Bizum"    value={money(cobrado?.bizum)}    testId="resumen-bizum" />
        <Row label="Otros"    value={money(cobrado?.otros)}    testId="resumen-otros" />

        {/* N-8 — a service already finalized can still take money afterwards.
            Neither figure is wrong; they answer different questions, so the
            difference is stated rather than hidden. Small, and never a second
            dashboard. */}
        {ready && lateAfterClose && lateAfterClose.length > 0 && (
          <div data-testid="late-after-close-note" style={{
            background: 'rgba(215,168,75,.09)', border: '1px solid rgba(215,168,75,.30)',
            borderRadius: 10, padding: '9px 11px', marginTop: 12,
            fontSize: 12, lineHeight: 1.5, color: '#e7c983',
          }}>
            Estos importes son la <strong>situación actual</strong>.{' '}
            {lateAfterClose.length === 1
              ? 'En un servicio ya finalizado entró dinero después: '
              : `En ${lateAfterClose.length} servicios ya finalizados entró dinero después: `}
            {lateAfterClose.map((x, i) => (
              <span key={`${x.businessDate}-${i}`}>
                {i > 0 ? ' · ' : ''}
                {x.businessDate} — al finalizar {eur(x.alFinalizar)}, ahora {eur(x.ahora)}
              </span>
            ))}
            . El registro guardado no cambia.
          </div>
        )}
      </section>

      {/* ── GROUP 2 — what was sold in this period, paid or not ── */}
      <section style={card} data-testid="resumen-originado">
        <h3 style={cardTitle}>Ventas originadas en el período</h3>
        <Row label="Ventas" value={money(originado?.ventas)} testId="resumen-ventas" strong />
        <Row label="Pendiente de cobro" value={money(originado?.pendiente)} testId="resumen-pendiente" />
        <Row label="Anulado"
          // Honest gap, not a fabricated zero: the Economía reader returns
          // {gross, collected, refunded, unpaid} per business date and carries
          // no void figure, so there is nothing truthful to print here yet.
          // Showing 0,00 € would assert "nothing was cancelled", which this
          // data cannot support. Needs one additive backend field.
          value="—" testId="resumen-anulado" dim
          sub="no disponible en este período" />
        <Row label="Devuelto" value={money(originado?.devuelto)} testId="resumen-devuelto" />
        <Row label="Pedidos" value={ready ? String(originado?.pedidos ?? 0) : '···'} testId="resumen-pedidos" />
      </section>

      {/* The old page carried this as a large paragraph that dominated the
          screen. The concept is preserved; the real estate is not. */}
      <button type="button" data-testid="resumen-help-toggle"
        aria-expanded={helpOpen} onClick={() => setHelpOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'transparent', border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 12, padding: '10px 12px', cursor: 'pointer',
          color: MUTED, fontSize: 12, fontWeight: 700, textAlign: 'left',
        }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.4" />
        </svg>
        ¿Por qué hay dos totales?
      </button>
      {helpOpen && (
        <div data-testid="resumen-help-body" style={{
          color: MUTED, fontSize: 12, lineHeight: 1.6, padding: '11px 13px', marginTop: 8,
          border: '1px solid rgba(255,255,255,.07)', borderRadius: 12,
          background: 'rgba(255,255,255,.02)',
        }}>
          <strong style={{ color: LABEL }}>Cobrado</strong> es el dinero que entró
          durante el período, por el instante real de cada cobro.{' '}
          <strong style={{ color: LABEL }}>Ventas originadas</strong> es lo que se
          facturó en el período, esté cobrado o no. Un pedido facturado un día y
          pagado al siguiente cuenta en un grupo distinto cada día, así que los dos
          totales no se suman ni tienen por qué coincidir.
        </div>
      )}
    </div>
  );
}
