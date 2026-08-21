import { C } from '../../constants';

// ===============================================================
// FinalizarReconciliationPanel — J-1
//
// Two truths, side by side, never added together.
//
//   ESTE SERVICIO   what Finalizar actually closes. For 480eca89:
//                   5 tickets, 262,50 €, of which 85,00 € in cash.
//   DÍA OPERATIVO   the Business Day that service belongs to, which on
//                   2026-08-20 contained TWO Operational Services:
//                   406,00 € sold, 386,50 € collected, 157,50 € in cash.
//
// 85,00 and 157,50 are BOTH correct. The single job of this panel is to make
// that obvious at a glance, because an operator who reads them as the same
// number will conclude the system lost 72,50 €. So each block carries an
// explicit scope label, the day block always states how many services it
// spans, and one line of copy names the reason they differ.
//
// The physical cash count is shown ONLY when its own window is exactly the
// day window — the backend refuses to attach any other, and refuses to
// compute a variance from one. When there is no compatible count the panel
// says so plainly rather than showing 0,00 €, which would assert an agreement
// nobody verified.
//
// NOTHING HERE CLOSES ANYTHING. This is preflight information rendered above
// the existing confirmation buttons, which are unchanged.
// ===============================================================

const eur = (value) => `${(Number(value) || 0).toFixed(2).replace('.', ',')} €`;

const shortWindow = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(',', '');
};

function Row({ label, value, tone, testId, strong = false }) {
  return (
    <div data-testid={testId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0' }}>
      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{label}</span>
      <span style={{ color: tone || (strong ? '#fff' : 'rgba(255,255,255,0.9)'), fontSize: 12, fontWeight: strong ? 800 : 600 }}>
        {value}
      </span>
    </div>
  );
}

function ScopeBadge({ children }) {
  return (
    <span style={{
      background: 'rgba(196,168,122,0.14)', border: '1px solid rgba(196,168,122,0.35)',
      color: C.avana, borderRadius: 999, padding: '2px 9px',
      fontSize: 10, fontWeight: 800, letterSpacing: 0.4, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

export default function FinalizarReconciliationPanel({ data, loading, error }) {
  if (loading) {
    return (
      <div data-testid="reconciliation-loading" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 16 }}>
        Cargando resumen económico…
      </div>
    );
  }
  if (error) {
    // Never block Finalizar on a preflight read: the service close does not
    // depend on this panel, and saying so is more useful than hiding it.
    return (
      <div data-testid="reconciliation-error" style={{
        background: 'rgba(255,171,0,0.08)', border: '1px solid rgba(255,171,0,0.28)',
        borderRadius: 12, padding: '10px 14px', marginBottom: 16,
      }}>
        <div style={{ color: '#ffab00', fontSize: 12, fontWeight: 700 }}>No se pudo cargar el resumen económico</div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 3 }}>{error}</div>
      </div>
    );
  }
  if (!data) return null;

  const s = data.service;
  const r = data.reconciliation;
  const count = data.cashCount;
  const variance = data.variance;
  const varianceTone = variance === null || variance === undefined
    ? 'rgba(255,255,255,0.5)' : variance === 0 ? C.verde : variance > 0 ? C.blu : C.orange;

  const box = {
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 12, padding: '12px 14px', marginBottom: 10,
  };

  return (
    <div data-testid="finalizar-reconciliation" style={{ marginBottom: 18 }}>

      {/* ── SCOPE 1: the service actually being closed ─────────────────── */}
      <div data-testid="scope-service" style={box}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: 0.6 }}>SERVICIO</span>
          <ScopeBadge>Este servicio</ScopeBadge>
        </div>
        <Row testId="svc-tickets" label="Pedidos" value={String(s.orderCount)} />
        <Row testId="svc-gross" label="Total" value={eur(s.gross)} strong />
        <Row testId="svc-collected" label="Cobrado" value={eur(s.collected)} tone={C.verde} strong />
        <Row testId="svc-unpaid" label="Pendiente" value={eur(s.unpaid)} tone={s.unpaid > 0 ? C.orange : undefined} />
        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '7px 0' }} />
        <Row testId="svc-cash" label="Efectivo" value={eur(s.byMethod.efectivo)} />
        <Row testId="svc-card" label="Tarjeta" value={eur(s.byMethod.tarjeta)} />
        <Row testId="svc-bizum" label="Bizum" value={eur(s.byMethod.bizum)} />
      </div>

      {/* ── SCOPE 2: the Business Day it belongs to ────────────────────── */}
      <div data-testid="scope-day" style={{ ...box, borderColor: 'rgba(196,168,122,0.28)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: 0.6 }}>RECONCILIACIÓN ECONÓMICA</span>
          <ScopeBadge>Día operativo {r.businessDate ? r.businessDate.slice(8, 10) + '/' + r.businessDate.slice(5, 7) : ''}</ScopeBadge>
        </div>
        <div data-testid="day-window" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginBottom: 8 }}>
          {shortWindow(r.window.from)} → {shortWindow(r.window.to)} · hora de Madrid
        </div>
        <Row testId="day-tickets" label="Pedidos del período" value={String(r.orderCount)} />
        <Row testId="day-gross" label="Ingresos del período" value={eur(r.gross)} strong />
        <Row testId="day-collected" label="Cobrado" value={eur(r.collected)} tone={C.verde} strong />
        <Row testId="day-cash" label="Efectivo registrado" value={eur(r.cashReceipts)} />

        {count ? (
          <>
            <Row testId="day-counted" label="Conteo físico" value={eur(count.countedCash)} />
            <Row
              testId="day-variance"
              label="Diferencia frente al efectivo registrado"
              value={eur(variance)}
              tone={varianceTone}
              strong
            />
            <div data-testid="variance-note" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10.5, marginTop: 6, lineHeight: 1.45 }}>
              El sistema todavía no incluye fondo inicial ni movimientos manuales de caja.
            </div>
          </>
        ) : (
          <div data-testid="no-cash-count" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11.5, marginTop: 7 }}>
            No hay conteo de caja compatible para este período.
          </div>
        )}
      </div>

      {/* The one line that stops 85,00 and 157,50 reading as a contradiction. */}
      {r.serviceCount > 1 && (
        <div data-testid="scope-explainer" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, lineHeight: 1.5 }}>
          Este día operativo tuvo <strong>{r.serviceCount} servicios</strong>, por eso el efectivo del día
          ({eur(r.cashReceipts)}) es mayor que el de este servicio ({eur(s.byMethod.efectivo)}).
        </div>
      )}
    </div>
  );
}
