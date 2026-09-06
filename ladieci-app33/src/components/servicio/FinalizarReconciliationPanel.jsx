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
// A count also has to be CURRENT, not merely same-window. A count taken at
// 13:35 against a recorded 65,00 € is a true fact about 13:35; if 51,00 € in
// cash arrives afterwards the day's recorded cash becomes 116,00 €, and
// subtracting one from the other would print «-51,00 €» — money that never
// went missing, shown to the operator who counted correctly. So when the
// backend reports the count as stale this panel shows it as HISTORY (its
// time, its amount, and the figure it was taken against) and states plainly
// that there is no current count, instead of a difference. Recording a new
// count is offered as what fixes it; nothing here blocks Finalizar either
// way, because a count has never been required to close.
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

  // The backend is the authority on whether a count still describes this
  // economy. The fallback covers only the deploy window in which a newer
  // panel meets a backend that predates the field: there the panel can still
  // SEE that the count was taken against a different recorded figure, and
  // declines to render a comparison it knows is not one, rather than printing
  // a difference that has no meaning.
  const latest = data.latestCashCount || data.cashCount || null;
  const status = data.cashCountStatus || (
    !latest ? 'none'
      : Number(latest.recordedCashReceiptsAtCount) !== Number(r.cashReceipts) ? 'stale'
        : 'current'
  );
  const count = status === 'current' ? (data.cashCount || latest) : null;
  const variance = count ? data.variance : null;
  const varianceTone = variance === null || variance === undefined
    ? 'rgba(255,255,255,0.5)' : variance === 0 ? C.verde : variance > 0 ? C.blu : C.orange;

  // K1 — over-collected is a backend fact (data.service.overCollected), taken
  // as-is. It is NOT `s.gross - s.collected` and NOT `something - s.unpaid`:
  // this panel does no economic arithmetic. Shown only when there is one.
  const overCollected = Number(s && s.overCollected) || 0;
  const hasOverCollected = overCollected > 0;

  // K2/K3 — ONLY the backend decides whether the SERVICE window and the
  // BUSINESS-DAY / cash-count window are comparable. FAIL SAFE: the comparative
  // copy renders only when the backend EXPLICITLY certifies comparability
  // (cashCountComparable === true); the crossing note renders only when the
  // backend EXPLICITLY reports a crossing (cashCountComparable === false).
  // scopeRelation missing / null / undefined → neither: silence, never a claim
  // the backend did not make, and never a client-side window comparison.
  const scopesComparable = data.scopeRelation && data.scopeRelation.cashCountComparable === true;
  const scopesCrossing = data.scopeRelation && data.scopeRelation.cashCountComparable === false;

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
        <Row testId="svc-unpaid" label="Saldo pendiente" value={eur(s.unpaid)} tone={s.unpaid > 0 ? C.orange : undefined} />
        {hasOverCollected && (
          <Row testId="svc-overcollected" label="Cobrado de más" value={eur(overCollected)} tone={C.blu} />
        )}
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
        {/* K3 — when the backend reports the service window is NOT inside this
            Business Day window (a service left open across days), the figures
            and any cash count below describe the DAY, not this service. Said
            once, only on an explicit backend crossing, so "Diferencia 0,00 €"
            cannot be read as "this service reconciles". */}
        {scopesCrossing && (
          <div data-testid="scope-crossing-note" style={{ color: '#ffab00', fontSize: 10.5, marginBottom: 8, lineHeight: 1.45 }}>
            Este servicio abarca un período distinto del día operativo: el conteo y las cifras
            de abajo describen el día, no solo este servicio.
          </div>
        )}
        <Row testId="day-tickets" label="Pedidos del período" value={String(r.orderCount)} />
        <Row testId="day-gross" label="Ingresos del período" value={eur(r.gross)} strong />
        <Row testId="day-collected" label="Cobrado" value={eur(r.collected)} tone={C.verde} strong />
        <Row testId="day-cash" label="Efectivo registrado" value={eur(r.cashReceipts)} />

        {count && (
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
        )}

        {/* A count exists but the cash moved after it. It is shown as the
            historical fact it is — never subtracted from a later total. */}
        {status === 'stale' && latest && (
          <div data-testid="stale-cash-count" style={{
            background: 'rgba(255,171,0,0.07)', border: '1px solid rgba(255,171,0,0.24)',
            borderRadius: 10, padding: '9px 11px', marginTop: 9,
          }}>
            <div style={{ color: '#ffab00', fontSize: 11.5, fontWeight: 700 }}>
              No hay un conteo de caja actual
            </div>
            <div data-testid="stale-cash-count-detail" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
              El último conteo fue de {eur(latest.countedCash)} a las {shortWindow(latest.countedAt)},
              cuando el efectivo registrado era {eur(latest.recordedCashReceiptsAtCount)}. Después
              hubo movimientos en efectivo, y ahora el registrado es {eur(r.cashReceipts)}.
            </div>
            <div data-testid="stale-cash-count-guidance" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10.5, marginTop: 5, lineHeight: 1.45 }}>
              Ese conteo sigue siendo válido para su momento, por eso no se compara con el total
              actual. Para ver una diferencia, registra un conteo nuevo. También puedes finalizar
              el servicio sin conteo.
            </div>
          </div>
        )}

        {status === 'none' && (
          <div data-testid="no-cash-count" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11.5, marginTop: 7 }}>
            No hay conteo de caja compatible para este período.
          </div>
        )}
      </div>

      {/* The one line that stops the two cash figures reading as a contradiction.
          SMOKE FIX — it used to assert "este día operativo tuvo N servicios",
          inferred from `serviceCount`. On 2026-08-25 that read "2 servicios"
          while exactly one service_session belonged to the business date: the
          extra money was a payment received today for an OLDER service. Money
          received today is a RECEIPT fact, not evidence about how many services
          the day contains, so the line now states only what it can see — the
          day's cash, and this service's share of it.
          K2 — and it renders ONLY when the backend EXPLICITLY certifies the two
          windows are comparable (scopeRelation.cashCountComparable === true).
          On the audited fixture the service window sat entirely outside its
          Business Day window, so "De este servicio: 70,00 €" inside "Hoy se
          cobraron 89,50 €" was a false subset claim (the service's real share
          of that 89,50 € was 0). Crossing — or no scopeRelation at all — means
          silence, never a comparison the backend did not sanction. */}
      {scopesComparable
        && Math.round(((Number(r.cashReceipts) || 0) - (Number(s.byMethod.efectivo) || 0)) * 100) !== 0 && (
        <div data-testid="scope-explainer" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, lineHeight: 1.5 }}>
          Hoy se cobraron {eur(r.cashReceipts)} en efectivo. De este servicio: {eur(s.byMethod.efectivo)}.
        </div>
      )}
    </div>
  );
}
