import { useState } from 'react';
import { C } from '../../constants';

// ===============================================================
// EconomiaGeneral — ECONOMÍA V2 / STEP 1.1
//
// The first tab of the Economía module, and a serious economic overview
// only: what was collected, and what was sold. No product mix, no customer
// rankings, no delivery counts, no demand curves — those are Estadísticas.
//
// NAMED `General`, NOT `Resumen`. This tab and Caja were both presenting
// something called a "resumen económico", which made them read as two
// versions of one page. The boundary is now explicit and one-directional:
//
//   General → read-only economic truth (this file)
//   Caja    → physical cash reconciliation and cash counts
//
// The blocks below live HERE and nowhere else. EconomiaSnapshotPanel is
// mounted for Caja with its economic-window half switched off precisely so
// these two groups are not rendered twice in one module.
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
// one group each day.
//
// NO FINALIZAR. Nothing on this screen closes anything.
// ===============================================================

// Warm amber on black, from the approved reference screens. C.orange and
// C.verde are the codebase's existing accents — no new palette.
const ACCENT = C.orange;        // #F97316
const MONEY_IN = C.verde;       // headline collected, as in the reference
const CREAM = '#f2ece3';
const LABEL = 'rgba(255,255,255,0.62)';
const MUTED = 'rgba(255,255,255,0.38)';

const card = {
  border: '1px solid rgba(255,255,255,.075)',
  background: 'rgba(255,255,255,.028)',
  borderRadius: 18,
  padding: '16px 16px 6px',
  marginBottom: 12,
};

const cardTitle = {
  margin: '0 0 12px', color: 'rgba(255,255,255,0.55)', fontSize: 11.5, fontWeight: 800,
  letterSpacing: 1.1, textTransform: 'uppercase',
};

const eur = (value, dec = 2) => `${(Number(value) || 0).toFixed(dec).replace('.', ',')} €`;

// Decorative, stroke-only, currentColor — never emoji. Rendered inside a
// small outlined tile, the iconography of the approved reference screens.
const Glyph = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{d}</svg>
);

const I_CASH   = <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /></>;
const I_CARD   = <><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19" /></>;
const I_BIZUM  = <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M14.5 8 9.5 16M17 11l-3 5" /></>;
const I_OTHER  = <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></>;
const I_SALES  = <><path d="M4 20V7.5l8-4 8 4V20" /><path d="M9.5 20v-6h5v6" /></>;
const I_UNPAID = <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></>;
const I_VOID   = <><circle cx="12" cy="12" r="8.5" /><path d="M6.2 6.2 17.8 17.8" /></>;
const I_REFUND = <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20.5 3.5v4.2h-4.2" /></>;
const I_ORDERS = <><path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16z" /><path d="M3.5 8 12 12.5 20.5 8M12 12.5v8" /></>;

const Tile = ({ d }) => (
  <span style={{
    flex: '0 0 auto', width: 32, height: 32, borderRadius: 9,
    border: `1px solid rgba(249,115,22,.34)`, color: ACCENT,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }}><Glyph d={d} /></span>
);

// One compact row. No giant card per figure: a zero belongs on a line, not
// on a tile the size of a headline.
const Row = ({ icon, label, value, testId, strong, tone, dim, sub, last }) => (
  <div data-testid={testId} style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: strong ? '12px 0' : '10px 0',
    borderBottom: last ? 'none' : '1px solid rgba(255,255,255,.055)',
  }}>
    <Tile d={icon} />
    <span style={{ flex: '1 1 auto', minWidth: 0 }}>
      <span style={{ display: 'block', color: dim ? MUTED : LABEL, fontSize: strong ? 13.5 : 13, fontWeight: strong ? 800 : 600 }}>
        {label}
      </span>
      {sub && <span style={{ display: 'block', color: MUTED, fontSize: 10.5, fontWeight: 600, marginTop: 2 }}>{sub}</span>}
    </span>
    <span style={{
      flex: '0 0 auto', fontWeight: strong ? 950 : 800,
      fontSize: strong ? 22 : 14.5,
      color: dim ? MUTED : tone || CREAM,
      fontFamily: "'DM Mono',monospace", letterSpacing: -0.2,
    }}>{value}</span>
  </div>
);

export default function EconomiaGeneral({
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
    <div data-testid="economia-general">
      {/* Scope header. Deliberately NOT called a "resumen": that word now
          belongs to no tab, so General and Caja can never again read as two
          versions of the same page. */}
      <div style={{ ...card, padding: '15px 16px 16px' }}>
        <h2 style={{
          margin: '0 0 3px', color: CREAM, fontSize: 16, fontWeight: 900, letterSpacing: .2,
        }}>Situación económica</h2>
        <div style={{ color: MUTED, fontSize: 11.5, marginBottom: 13, lineHeight: 1.45 }}>
          Solo consulta. Elegir un período no modifica ningún pedido ni ningún cobro.
        </div>

        {/* The same four certified N-9 windows as before, visually simplified:
            no emoji, no gradient slabs. The window RULES are untouched; only
            the pills changed. */}
        <div role="group" aria-label="Período" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
          {periodos.map((p) => {
            const active = periodo === p.id;
            return (
              <button key={p.id} type="button" data-testid={`general-periodo-${p.id}`}
                aria-pressed={active} onClick={() => onPeriodo(p.id)}
                style={{
                  background: active ? 'rgba(249,115,22,.14)' : 'rgba(255,255,255,.045)',
                  border: `1px solid ${active ? ACCENT : 'rgba(255,255,255,.10)'}`,
                  boxShadow: active ? '0 0 16px rgba(249,115,22,.16)' : 'none',
                  color: active ? '#ffd9b8' : 'rgba(255,255,255,0.5)',
                  borderRadius: 999, padding: '8px 16px', fontSize: 12.5,
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
            display: 'flex', alignItems: 'flex-start', gap: 8,
            color: MUTED, fontSize: 11.5, marginTop: 13, letterSpacing: .2, lineHeight: 1.5,
          }}>
            <span style={{ color: ACCENT, flexShrink: 0, marginTop: 1 }}>
              <Glyph d={<><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>} size={14} />
            </span>
            <span>
              {windowLine}
              {windowLine && dayLine ? <br /> : null}
              {dayLine}
            </span>
          </div>
        )}
      </div>

      {ledgerStatus === 'loading' && (
        <div data-testid="general-ledger-loading" style={{
          color: MUTED, fontSize: 12.5, margin: '0 0 12px 2px', fontWeight: 600,
        }}>Cargando importes contables…</div>
      )}

      {ledgerStatus === 'error' && (
        <div data-testid="general-ledger-error" style={{
          ...card, padding: '14px 16px', borderColor: 'rgba(232,52,28,.35)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ color: C.rosso, fontWeight: 700, fontSize: 13, flex: 1 }}>
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
      <section style={card} data-testid="general-cobrado">
        <h3 style={cardTitle}>Cobrado en el período</h3>
        <Row icon={I_CASH}  label="Total cobrado" value={money(cobrado?.total)} testId="general-total-cobrado" strong tone={ready ? MONEY_IN : undefined} />
        <Row icon={I_CASH}  label="Efectivo" value={money(cobrado?.efectivo)} testId="general-efectivo" />
        <Row icon={I_CARD}  label="Tarjeta"  value={money(cobrado?.tarjeta)}  testId="general-tarjeta" />
        <Row icon={I_BIZUM} label="Bizum"    value={money(cobrado?.bizum)}    testId="general-bizum" />
        <Row icon={I_OTHER} label="Otros"    value={money(cobrado?.otros)}    testId="general-otros" last />

        {/* N-8 — a service already finalized can still take money afterwards.
            Neither figure is wrong; they answer different questions, so the
            difference is stated rather than hidden. Small, and never a second
            dashboard. This disclosure belongs to General and appears nowhere
            else in the module. */}
        {ready && lateAfterClose && lateAfterClose.length > 0 && (
          <div data-testid="late-after-close-note" style={{
            background: 'rgba(249,115,22,.08)', border: '1px solid rgba(249,115,22,.28)',
            borderRadius: 12, padding: '10px 12px', margin: '10px 0 12px',
            fontSize: 12, lineHeight: 1.5, color: '#f0b183',
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
      <section style={card} data-testid="general-originado">
        <h3 style={cardTitle}>Ventas originadas en el período</h3>
        <Row icon={I_SALES}  label="Ventas" value={money(originado?.ventas)} testId="general-ventas" strong />
        <Row icon={I_UNPAID} label="Pendiente de cobro" value={money(originado?.pendiente)} testId="general-pendiente"
          tone={ready && (originado?.pendiente || 0) > 0 ? ACCENT : undefined} />
        <Row icon={I_VOID} label="Anulado"
          // Honest gap, not a fabricated zero: the Economía ledger reader
          // returns {gross, collected, refunded, unpaid} per business date and
          // carries no void figure, so there is nothing truthful to print here
          // yet. Showing 0,00 € would assert "nothing was cancelled", which
          // this data cannot support. Needs one additive backend field.
          value="—" testId="general-anulado" dim
          sub="no disponible en este período" />
        <Row icon={I_REFUND} label="Devuelto" value={money(originado?.devuelto)} testId="general-devuelto" />
        <Row icon={I_ORDERS} label="Pedidos" value={ready ? String(originado?.pedidos ?? 0) : '···'} testId="general-pedidos" last />
      </section>

      {/* The old page carried this as a large paragraph that dominated the
          screen. The concept is preserved; the real estate is not. */}
      <button type="button" data-testid="general-help-toggle"
        aria-expanded={helpOpen} onClick={() => setHelpOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 9, width: '100%',
          background: 'transparent', border: '1px solid rgba(255,255,255,.075)',
          borderRadius: 14, padding: '12px 14px', cursor: 'pointer',
          color: 'rgba(255,255,255,0.5)', fontSize: 12.5, fontWeight: 700, textAlign: 'left',
        }}>
        <span style={{ color: ACCENT, flexShrink: 0, display: 'inline-flex' }}>
          <Glyph d={<><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.4" /></>} size={16} />
        </span>
        ¿Por qué hay dos totales?
      </button>
      {helpOpen && (
        <div data-testid="general-help-body" style={{
          color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 1.65, padding: '12px 14px', marginTop: 8,
          border: '1px solid rgba(255,255,255,.06)', borderRadius: 14,
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
