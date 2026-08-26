import { useState, useMemo, useEffect } from 'react';
import { C } from '../../constants';
import useEconomySnapshot, {
  ECONOMY_SCOPES, scopeIsReady, useServiceSessions,
} from '../../economy/useEconomySnapshot';

// ===============================================================
// EconomiaGeneral — ONE SCOPE, TWO VIEWS.
//
//   Período  ─────────────────────────────  chosen once, at the top
//     ├── ECONOMÍA   where is the money
//     └── VENTAS     which orders compose it
//
// Both views read the SAME snapshot object. Switching re-renders; it never
// re-asks and never re-scopes.
//
// THE PERIOD MODEL IS THREE CONCEPTS, NOT A LIST OF CLOCK WINDOWS:
//   Hoy / Ayer      a whole Business Day (04:00 → 04:00), server-resolved
//   Servicios       one REAL persisted service_session, chosen by the operator
//   Personalizado   an explicit arbitrary range
// Mediodía and Noche are gone: they looked like services without being
// services, and the product persists real ones to point at instead.
//
// EVERY WINDOW COMES FROM THE SERVER. Nothing here derives a Madrid 04:00
// boundary — doing that in the browser is what produced the 35-day window bug.
// ===============================================================

const ACCENT = C.orange;
const MONEY_IN = C.verde;
const CREAM = '#f2ece3';
const LABEL = 'rgba(255,255,255,0.62)';
const MUTED = 'rgba(255,255,255,0.38)';

const card = {
  border: '1px solid rgba(255,255,255,.075)',
  background: 'rgba(255,255,255,.028)',
  borderRadius: 16, padding: '13px 14px', marginBottom: 10,
};
const eyebrow = {
  color: MUTED, fontSize: 10, fontWeight: 800, letterSpacing: 1,
  textTransform: 'uppercase',
};

const eur = (v, dec = 2) => `${(Number(v) || 0).toFixed(dec).replace('.', ',')} €`;

const madrid = (iso, opts) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour12: false, ...opts }).format(d);
};
// Compact wall clock. The timezone name is deliberately not printed: one
// restaurant, one timezone, and the operator should not have to read
// implementation semantics to use the screen.
const stamp = (iso) => madrid(iso, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
const hhmm = (iso) => madrid(iso, { hour: '2-digit', minute: '2-digit' });

const Glyph = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{d}</svg>
);
const I_CASH  = <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /></>;
const I_CARD  = <><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19" /></>;
const I_BIZUM = <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M14.5 8 9.5 16M17 11l-3 5" /></>;
const I_OTHER = <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></>;
const I_CAL   = <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>;
const I_CHEV  = <><path d="M9 6l6 6-6 6" /></>;

// A service that opened and closed on different local dates must say so. One
// anomalous session on staging ran 23/08 18:16 → 25/08 18:50; rendered as bare
// clock times it read "18:16 → 18:50", which looks like a 34-minute service
// instead of a two-day one. Same-day sessions stay compact — the dates are
// only added where their absence would mislead.
const dayOf = (iso) => (iso ? madrid(iso, { day: '2-digit', month: '2-digit' }) : null);
export function serviceSpan(session) {
  const openDay = dayOf(session?.openedAt);
  const closeDay = session?.closedAt ? dayOf(session.closedAt) : null;
  const open = hhmm(session?.openedAt);
  const close = session?.closedAt ? hhmm(session.closedAt) : 'ahora';
  const crossesDate = Boolean(closeDay) && closeDay !== openDay;
  return crossesDate
    ? `${openDay} ${open} → ${closeDay} ${close}`
    : `${open} → ${close}`;
}

const Kpi = ({ label, value, testId, tone, big, onClick, sub }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} data-testid={testId}
      style={{
        flex: big ? '1 1 100%' : '1 1 calc(50% - 5px)', minWidth: 0, textAlign: 'left',
        border: '1px solid rgba(255,255,255,.07)', background: 'rgba(255,255,255,.03)',
        borderRadius: 13, padding: big ? '11px 13px' : '10px 12px',
        cursor: onClick ? 'pointer' : 'default', display: 'block',
      }}>
      <div style={eyebrow}>{label}</div>
      <div style={{
        color: tone || CREAM, fontWeight: 900, fontSize: big ? 25 : 16.5,
        fontFamily: "'DM Mono',monospace", letterSpacing: -0.4, marginTop: 2,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ flex: '1 1 auto', minWidth: 0 }}>{value}</span>
        {onClick && <span style={{ color: MUTED, flexShrink: 0 }}><Glyph d={I_CHEV} size={14} /></span>}
      </div>
      {sub && <div style={{ color: MUTED, fontSize: 10.5, marginTop: 1 }}>{sub}</div>}
    </Tag>
  );
};

const MethodRow = ({ icon, label, value, testId, last }) => (
  <div data-testid={testId} style={{
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
    borderBottom: last ? 'none' : '1px solid rgba(255,255,255,.055)',
  }}>
    <span style={{
      flex: '0 0 auto', width: 26, height: 26, borderRadius: 8,
      border: '1px solid rgba(249,115,22,.32)', color: ACCENT,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}><Glyph d={icon} size={13} /></span>
    <span style={{ flex: '1 1 auto', color: LABEL, fontSize: 12.5, fontWeight: 600 }}>{label}</span>
    <span style={{ flex: '0 0 auto', color: CREAM, fontWeight: 800, fontSize: 13.5, fontFamily: "'DM Mono',monospace" }}>{value}</span>
  </div>
);

// datetime-local wants the operator's own wall clock; the reader wants an
// instant. `new Date(iso)` then local parts is the browser's own conversion,
// used only to PREFILL the two inputs from a range the server already resolved.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function EconomiaGeneral({ lateAfterClose, orderContext }) {
  const [scope, setScope] = useState({ preset: 'hoy', from: '', to: '', serviceSessionId: null });
  const [view, setView] = useState('economia');
  const [n8Open, setN8Open] = useState(false);

  const { snapshot, status, error, reload } = useEconomySnapshot(scope);
  const { sessions, businessDate: servicesDay, status: sessionsStatus } = useServiceSessions('hoy');
  const ready = status === 'ready' && snapshot;

  const win = snapshot?.window || null;
  const money = (n) => (ready ? eur(n) : status === 'error' ? '—' : '···');
  const count = (n) => (ready ? String(n ?? 0) : '···');

  const obligation = snapshot?.obligation || {};
  const receipts = snapshot?.receipts || {};
  const byMethod = receipts.byMethod || {};
  const counts = snapshot?.counts || {};
  // OVER-COLLECTED / AJUSTE COMERCIAL V1 SLICE C (§15) -- the backend's own
  // dedicated section (economicSnapshot.js, Over-Collected Slice A), read
  // exactly as-is: unpaid and overCollected are two independent exposures
  // that can BOTH be non-zero at once (different tables/orders on opposite
  // sides), so this is never netted into unpaid - overCollected here or
  // anywhere below.
  const balance = snapshot?.balance || {};

  // Entering Personalizado with empty inputs while the previous preset's range
  // stayed on screen was the contradiction smoke found. The custom range now
  // starts from whatever was resolved a moment ago, so the operator edits
  // something real instead of facing two disagreeing statements.
  const [lastResolved, setLastResolved] = useState(null);
  useEffect(() => { if (win?.from && win?.to) setLastResolved({ from: win.from, to: win.to }); }, [win]);

  const pickPreset = (preset) => {
    if (preset === 'personalizado') {
      const seed = lastResolved;
      setScope((s) => ({
        ...s, preset,
        from: s.from || toLocalInput(seed?.from),
        to: s.to || toLocalInput(seed?.to),
      }));
      return;
    }
    // Leaving `servicio` clears the id: a stale id under a day preset is a
    // scope that says one thing and asks another.
    setScope((s) => ({ ...s, preset, serviceSessionId: preset === 'servicio' ? s.serviceSessionId : null }));
  };

  const windowLine = useMemo(() => (win ? `${stamp(win.from)} → ${stamp(win.to)}` : null), [win]);
  const selectedSession = scope.preset === 'servicio'
    ? sessions.find((s) => s.serviceSessionId === scope.serviceSessionId) || null
    : null;

  return (
    <div data-testid="economia-general">
      {/* ── SCOPE ─────────────────────────────────────────────────────── */}
      <div style={{ ...card, padding: '11px 12px 12px' }} data-testid="general-scope">
        <h2 style={{ margin: '0 0 9px', color: CREAM, fontSize: 15, fontWeight: 900, letterSpacing: .2 }}>
          Situación económica
        </h2>

        {/* One row. It scrolls sideways on a narrow phone rather than wrapping
            into a block of stacked pills that owned a third of the screen. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...eyebrow, flexShrink: 0 }}>Período</span>
          <div role="group" aria-label="Período" data-testid="general-scope-row"
            style={{ display: 'flex', gap: 5, overflowX: 'auto', flex: '1 1 auto', paddingBottom: 1 }}>
            {ECONOMY_SCOPES.map((p) => {
              const active = scope.preset === p.key;
              return (
                <button key={p.key} type="button" data-testid={`general-scope-${p.key}`}
                  aria-pressed={active} onClick={() => pickPreset(p.key)}
                  style={{
                    background: active ? 'rgba(249,115,22,.15)' : 'transparent',
                    border: `1px solid ${active ? ACCENT : 'rgba(255,255,255,.12)'}`,
                    color: active ? '#ffd9b8' : 'rgba(255,255,255,0.52)',
                    borderRadius: 9, padding: '6px 11px', fontSize: 12.5, minHeight: 34,
                    fontWeight: active ? 850 : 700, whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer',
                  }}>{p.label}</button>
              );
            })}
          </div>
        </div>

        {/* ── SERVICIOS — the real, persisted sessions of the day ───────── */}
        {scope.preset === 'servicio' && (
          <div data-testid="general-service-picker" style={{ marginTop: 10 }}>
            <div style={{ ...eyebrow, marginBottom: 6 }} data-testid="general-services-heading">
              Servicios{servicesDay ? ` del ${servicesDay.slice(8, 10)}/${servicesDay.slice(5, 7)}` : ''}
            </div>
            {sessionsStatus === 'loading' && <div style={{ color: MUTED, fontSize: 12 }}>···</div>}
            {sessionsStatus === 'ready' && sessions.length === 0 && (
              <div data-testid="general-no-services" style={{ color: MUTED, fontSize: 12 }}>
                Sin servicios con actividad hoy.
              </div>
            )}
            <div style={{ display: 'grid', gap: 6 }}>
              {sessions.map((s) => {
                const active = scope.serviceSessionId === s.serviceSessionId;
                const open = s.status === 'open';
                return (
                  <button key={s.serviceSessionId} type="button"
                    data-testid={`general-service-${s.serviceSessionId}`}
                    aria-pressed={active}
                    onClick={() => setScope((cur) => ({ ...cur, preset: 'servicio', serviceSessionId: s.serviceSessionId }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                      background: active ? 'rgba(249,115,22,.13)' : 'rgba(255,255,255,.03)',
                      border: `1px solid ${active ? ACCENT : 'rgba(255,255,255,.09)'}`,
                      borderRadius: 11, padding: '9px 11px', cursor: 'pointer', minHeight: 40,
                    }}>
                    <span style={{
                      flex: '1 1 auto', minWidth: 0, color: active ? '#ffd9b8' : CREAM,
                      fontSize: 13, fontWeight: 800, fontFamily: "'DM Mono',monospace",
                    }}>
                      {serviceSpan(s)}
                    </span>
                    <span style={{
                      flexShrink: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: .4,
                      textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999,
                      color: open ? MONEY_IN : MUTED,
                      border: `1px solid ${open ? 'rgba(34,197,94,.35)' : 'rgba(255,255,255,.12)'}`,
                    }}>{open ? 'Abierto' : 'Cerrado'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── PERSONALIZADO ────────────────────────────────────────────── */}
        {scope.preset === 'personalizado' && (
          <div style={{
            display: 'grid', gap: 8, marginTop: 10,
            gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))',
          }}>
            <label style={{ ...eyebrow }}>
              Desde
              <input data-testid="general-custom-from" type="datetime-local" value={scope.from}
                onChange={(e) => setScope((s) => ({ ...s, from: e.target.value }))}
                style={{
                  display: 'block', width: '100%', marginTop: 4, background: C.carbone2,
                  color: C.bianco, border: '1px solid rgba(255,255,255,.12)',
                  borderRadius: 9, padding: '8px 9px', fontSize: 12.5, minHeight: 36,
                }} />
            </label>
            <label style={{ ...eyebrow }}>
              Hasta
              <input data-testid="general-custom-to" type="datetime-local" value={scope.to}
                onChange={(e) => setScope((s) => ({ ...s, to: e.target.value }))}
                style={{
                  display: 'block', width: '100%', marginTop: 4, background: C.carbone2,
                  color: C.bianco, border: '1px solid rgba(255,255,255,.12)',
                  borderRadius: 9, padding: '8px 9px', fontSize: 12.5, minHeight: 36,
                }} />
            </label>
          </div>
        )}

        {/* The interval the SERVER resolved for THIS scope. It is cleared the
            moment the scope changes, so it can never describe a different
            question than the figures below. */}
        {windowLine && (
          <div data-testid="general-window" style={{
            display: 'flex', alignItems: 'center', gap: 7, marginTop: 10,
            color: MUTED, fontSize: 11.5, fontFamily: "'DM Mono',monospace",
          }}>
            <span style={{ color: ACCENT, flexShrink: 0 }}><Glyph d={I_CAL} size={13} /></span>
            {windowLine}
            {selectedSession && (
              <span style={{ color: selectedSession.status === 'open' ? MONEY_IN : MUTED, fontWeight: 800 }}>
                · {selectedSession.status === 'open' ? 'Abierto' : 'Cerrado'}
              </span>
            )}
          </div>
        )}
        {status === 'incomplete' && (
          <div data-testid="general-scope-incomplete" style={{ color: MUTED, fontSize: 11.5, marginTop: 9 }}>
            {scope.preset === 'servicio' ? 'Elige un servicio.' : 'Elige inicio y fin.'}
          </div>
        )}
      </div>

      {/* ── VIEWS ─────────────────────────────────────────────────────── */}
      <div role="tablist" aria-label="Vista" data-testid="general-view-tabs" style={{
        display: 'flex', gap: 5, marginBottom: 10,
        border: '1px solid rgba(255,255,255,.07)', borderRadius: 11, padding: 3,
        background: 'rgba(255,255,255,.02)',
      }}>
        {[{ id: 'economia', label: 'Economía' }, { id: 'ventas', label: 'Ventas' }].map((tb) => {
          const active = view === tb.id;
          return (
            <button key={tb.id} type="button" role="tab" aria-selected={active}
              data-testid={`general-view-${tb.id}`} onClick={() => setView(tb.id)}
              style={{
                flex: 1, border: 'none', borderRadius: 9, padding: '8px 8px', minHeight: 36,
                background: active ? 'rgba(249,115,22,.14)' : 'transparent',
                color: active ? ACCENT : 'rgba(255,255,255,0.45)',
                fontSize: 12, fontWeight: active ? 850 : 700, cursor: 'pointer',
                letterSpacing: .3, textTransform: 'uppercase',
              }}>{tb.label}</button>
          );
        })}
      </div>

      {status === 'error' && (
        <div data-testid="general-error" style={{
          ...card, borderColor: 'rgba(232,52,28,.35)', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ color: C.rosso, fontWeight: 700, fontSize: 12.5, flex: 1 }}>{error}</div>
          <button type="button" onClick={reload} style={{
            background: 'rgba(232,52,28,.15)', border: '1px solid rgba(232,52,28,.5)',
            color: '#fff', borderRadius: 9, padding: '7px 13px',
            fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
          }}>Reintentar</button>
        </div>
      )}

      {view === 'economia' && (
        <div data-testid="general-view-panel-economia">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <Kpi label="Cobrado" value={money(receipts.collected)} testId="general-kpi-cobrado" big tone={ready ? MONEY_IN : undefined} />
            <Kpi label="Ventas" value={money(obligation.gross)} testId="general-kpi-ventas"
              onClick={() => setView('ventas')} sub={`${count(counts.obligations)} pedidos`} />
            <Kpi label="Pendiente" value={money(obligation.unpaid)} testId="general-kpi-pendiente"
              tone={ready && (obligation.unpaid || 0) > 0 ? ACCENT : undefined} />
            {/* §5/§15 -- compact: only shown once it is genuinely non-zero, exactly
                like Pendiente's own tone above never implies it replaces this. */}
            {ready && (balance.overCollected || 0) > 0 && (
              <Kpi label="Cobrado de más" value={money(balance.overCollected)} testId="general-kpi-cobrado-de-mas" tone={ACCENT} />
            )}
            <Kpi label="Devuelto" value={money(obligation.refunded)} testId="general-kpi-devuelto" />
            <Kpi label="Anulado" value={money(obligation.voided)} testId="general-kpi-anulado" />
          </div>

          <div style={card} data-testid="general-methods">
            <div style={{ ...eyebrow, marginBottom: 3 }}>Métodos de cobro</div>
            <MethodRow icon={I_CASH}  label="Efectivo" value={money(byMethod.efectivo)} testId="general-efectivo" />
            <MethodRow icon={I_CARD}  label="Tarjeta"  value={money(byMethod.tarjeta)}  testId="general-tarjeta" />
            <MethodRow icon={I_BIZUM} label="Bizum"    value={money(byMethod.bizum)}    testId="general-bizum" />
            <MethodRow icon={I_OTHER} label="Otros"    value={money(byMethod.other)}    testId="general-otros" last />
          </div>

          {ready && lateAfterClose && lateAfterClose.length > 0 && (
            <div data-testid="general-n8" style={{
              border: '1px solid rgba(249,115,22,.28)', background: 'rgba(249,115,22,.07)',
              borderRadius: 13, marginBottom: 10, overflow: 'hidden',
            }}>
              <button type="button" data-testid="general-n8-toggle"
                aria-expanded={n8Open} onClick={() => setN8Open((v) => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  background: 'transparent', border: 'none', padding: '10px 12px', minHeight: 40,
                  color: '#f0b183', fontSize: 12, fontWeight: 800, cursor: 'pointer', textAlign: 'left',
                }}>
                <span style={{ flex: '1 1 auto' }}>Cobros posteriores al cierre</span>
                <span style={{ color: MUTED, fontWeight: 700 }}>{n8Open ? 'Ocultar' : 'Ver detalle'}</span>
              </button>
              {n8Open && (
                <div data-testid="general-n8-detail" style={{ padding: '0 12px 11px', color: '#e0b894', fontSize: 11.5, lineHeight: 1.6 }}>
                  {lateAfterClose.map((x, i) => (
                    <div key={`${x.businessDate}-${i}`}>
                      {x.businessDate} · al cierre {eur(x.alFinalizar)} · ahora {eur(x.ahora)}
                      {' · '}<strong>{eur((Number(x.ahora) || 0) - (Number(x.alFinalizar) || 0))}</strong>
                    </div>
                  ))}
                  <div style={{ color: MUTED, marginTop: 5 }}>El cierre registrado no cambia.</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {view === 'ventas' && (
        <div data-testid="general-view-panel-ventas">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <Kpi label="Ventas" value={money(obligation.gross)} testId="general-ventas-total" big
              sub={`${count(counts.obligations)} pedidos`} />
          </div>
          <SalesDetail rows={snapshot?.drillDown?.obligations} ready={ready} orderContext={orderContext} />
        </div>
      )}
    </div>
  );
}

// ── VENTAS — which orders compose this scope ───────────────────────────────
// Economía answers "where is the money"; this answers "which sales". The rows
// are the certified reader's own obligation drill-down — same scope, same
// figures, no second query and no analytics engine.
//
// CONTEXT IS A LABEL, NOT A FIGURE. The reader carries each order's identity,
// amount and payment state but not its channel, so "Mesa 2" / "Domicilio · Q2"
// is looked up from order rows this page already holds, keyed by order id. If
// an order is not in that lookup the row still renders — number, amount and
// state all come from the reader — it simply shows no context chip. Money is
// never sourced from the lookup.
export function orderContextLabel(row) {
  if (!row) return null;
  // language-guard: allow-legacy tipo_consegna is the existing delivery-type field name being read for a label, not new vocabulary
  const tipo = String(row.tipo_consegna || '').toUpperCase();
  const name = String(row.nombre || '').trim();
  if (tipo === 'DOMICILIO') return row.zona ? `Domicilio · ${row.zona}` : 'Domicilio';
  if (/^mesa\s/i.test(name)) return name;
  const canal = String(row.canal || '').toUpperCase();
  if (canal === 'BANCO') return 'Barra';
  if (canal === 'WA' || canal === 'WHATSAPP') return 'WhatsApp';
  if (canal === 'MANUAL') return 'Teléfono';
  return 'Retiro';
}

const STATE_LABEL = (t) => {
  if (t.cancelled) return { text: 'Anulado', tone: MUTED };
  if ((t.unpaidAmount || 0) > 0) return { text: 'Pendiente', tone: ACCENT };
  if ((t.refundedAmount || 0) > 0) return { text: 'Devuelto', tone: MUTED };
  return { text: 'Cobrado', tone: MONEY_IN };
};

function SalesDetail({ rows, ready, orderContext }) {
  const list = Array.isArray(rows) ? rows : [];
  if (!ready) return <div data-testid="general-ventas-detail" style={{ ...card, color: MUTED, fontSize: 12 }}>···</div>;
  if (list.length === 0) {
    return (
      <div data-testid="general-ventas-detail" style={{ ...card, color: MUTED, fontSize: 12 }}>
        Sin ventas en este período.
      </div>
    );
  }
  return (
    <div style={card} data-testid="general-ventas-detail">
      {list.map((r, i) => {
        const id = r.id || r.orderId || '—';
        const ctx = orderContextLabel(orderContext ? orderContext[id] : null);
        const st = STATE_LABEL(r);
        return (
          <div key={`${id}-${i}`} data-testid="general-ventas-row" style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
            borderBottom: i === list.length - 1 ? 'none' : '1px solid rgba(255,255,255,.055)',
          }}>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <span style={{ display: 'block', color: CREAM, fontSize: 13, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                {id}
                {ctx && <span style={{ color: MUTED, fontWeight: 600, fontFamily: 'inherit' }}> · {ctx}</span>}
              </span>
              <span style={{ display: 'block', color: st.tone, fontSize: 10.5, fontWeight: 800, marginTop: 2 }}>
                {st.text}{r.time ? <span style={{ color: MUTED, fontWeight: 600 }}> · {r.time}</span> : null}
              </span>
            </span>
            <span style={{ flexShrink: 0, color: CREAM, fontWeight: 800, fontSize: 13.5, fontFamily: "'DM Mono',monospace" }}>
              {eur(r.amount)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
