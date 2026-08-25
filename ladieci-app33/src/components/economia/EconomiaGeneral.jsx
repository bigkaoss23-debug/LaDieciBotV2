import { useState, useMemo } from 'react';
import { C } from '../../constants';
import useEconomySnapshot, { ECONOMY_SCOPES, scopeIsReady } from '../../economy/useEconomySnapshot';

// ===============================================================
// EconomiaGeneral — ECONOMÍA V2 / SMOKE FIX BATCH
//
// ONE SCOPE, TWO VIEWS.
//
//   Período  ──────────────────────────────  chosen once, at the top
//     ├── ECONOMÍA   what was collected, owed, refunded, voided
//     └── VENTAS     what was sold, in detail
//
// Both inner tabs read the SAME snapshot object. There is no second picker,
// no second request and no second engine: switching tabs re-renders, it never
// re-asks.
//
// WHY THE SCOPE MOVED TO THE SERVER. The previous version filtered one fixed
// 35-day ledger fetch in the browser. Selecting "Día" changed which rows were
// summed but not the window the screen displayed, so it showed
// `21/07 04:00 → 26/08 04:00` while claiming "Día operativo 25/08". Now every
// window is resolved by /api/economy/v1/snapshot and only its own
// `window.from/to` is rendered — the screen cannot disagree with the query.
//
// WHY THIS READER. Receipts are counted by their OWN instant, obligations by
// theirs. That is what makes 25/08 read Cobrado 158,50 € (89,50 efectivo,
// including 35,00 taken today for an older service) against Ventas 123,50 €.
// The two figures differ legitimately and are never added together.
//
// NO FINALIZAR. Nothing here closes anything.
// ===============================================================

const ACCENT = C.orange;
const MONEY_IN = C.verde;
const CREAM = '#f2ece3';
const LABEL = 'rgba(255,255,255,0.62)';
const MUTED = 'rgba(255,255,255,0.38)';

const card = {
  border: '1px solid rgba(255,255,255,.075)',
  background: 'rgba(255,255,255,.028)',
  borderRadius: 18, padding: '14px 15px', marginBottom: 12,
};

const eur = (v, dec = 2) => `${(Number(v) || 0).toFixed(dec).replace('.', ',')} €`;

// Compact wall clock, Madrid. The timezone name is deliberately NOT printed:
// the operator works in one restaurant in one timezone and does not need to
// read implementation semantics to use the screen.
const clock = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(',', '');
};

const Glyph = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{d}</svg>
);
const I_CASH   = <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /></>;
const I_CARD   = <><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19" /></>;
const I_BIZUM  = <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M14.5 8 9.5 16M17 11l-3 5" /></>;
const I_OTHER  = <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></>;
const I_CAL    = <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>;
const I_CHEV   = <><path d="M9 6l6 6-6 6" /></>;

// A dashboard tile. Dense on purpose: six of these must be readable at a
// glance on a phone without any of them shouting.
const Kpi = ({ label, value, testId, tone, big, onClick, sub }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} data-testid={testId}
      style={{
        flex: big ? '1 1 100%' : '1 1 calc(50% - 5px)', minWidth: 0, textAlign: 'left',
        border: '1px solid rgba(255,255,255,.07)', background: 'rgba(255,255,255,.03)',
        borderRadius: 14, padding: big ? '13px 14px' : '11px 12px',
        cursor: onClick ? 'pointer' : 'default', display: 'block',
      }}>
      <div style={{ color: MUTED, fontSize: 10.5, fontWeight: 700, letterSpacing: .7, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{
        color: tone || CREAM, fontWeight: 900, fontSize: big ? 26 : 17,
        fontFamily: "'DM Mono',monospace", letterSpacing: -0.4, marginTop: 3,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ flex: '1 1 auto', minWidth: 0 }}>{value}</span>
        {onClick && <span style={{ color: MUTED, flexShrink: 0 }}><Glyph d={I_CHEV} size={15} /></span>}
      </div>
      {sub && <div style={{ color: MUTED, fontSize: 10.5, marginTop: 2 }}>{sub}</div>}
    </Tag>
  );
};

const MethodRow = ({ icon, label, value, testId }) => (
  <div data-testid={testId} style={{
    display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0',
    borderBottom: '1px solid rgba(255,255,255,.055)',
  }}>
    <span style={{
      flex: '0 0 auto', width: 28, height: 28, borderRadius: 8,
      border: '1px solid rgba(249,115,22,.32)', color: ACCENT,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}><Glyph d={icon} size={14} /></span>
    <span style={{ flex: '1 1 auto', color: LABEL, fontSize: 13, fontWeight: 600 }}>{label}</span>
    <span style={{ flex: '0 0 auto', color: CREAM, fontWeight: 800, fontSize: 14, fontFamily: "'DM Mono',monospace" }}>
      {value}
    </span>
  </div>
);

export default function EconomiaGeneral({ lateAfterClose }) {
  // ONE scope for the whole tab. Both inner views read it; neither owns one.
  const [scope, setScope] = useState({ preset: 'hoy', from: '', to: '' });
  const [view, setView] = useState('economia'); // 'economia' | 'ventas'
  const [n8Open, setN8Open] = useState(false);

  const { snapshot, status, error, reload } = useEconomySnapshot(scope);
  const ready = status === 'ready' && snapshot;

  const win = snapshot?.window || null;
  const money = (n) => (ready ? eur(n) : status === 'error' ? '—' : '···');
  const count = (n) => (ready ? String(n ?? 0) : '···');

  const obligation = snapshot?.obligation || {};
  const receipts = snapshot?.receipts || {};
  const byMethod = receipts.byMethod || {};
  const counts = snapshot?.counts || {};

  const windowLine = useMemo(
    () => (win ? `${clock(win.from)} → ${clock(win.to)}` : null),
    [win],
  );

  const setPreset = (preset) => setScope((s) => ({ ...s, preset }));

  return (
    <div data-testid="economia-general">
      {/* ── SHARED SCOPE — chosen once, used by both inner views ───────── */}
      <div style={{ ...card }} data-testid="general-scope">
        {/* The page heading. The scope control below is labelled only
            "Período" — a picker does not need a sentence explaining that
            picking changes nothing. */}
        <h2 style={{
          margin: '0 0 12px', color: CREAM, fontSize: 15.5, fontWeight: 900, letterSpacing: .2,
        }}>Situación económica</h2>
        <div style={{
          color: MUTED, fontSize: 10.5, fontWeight: 800, letterSpacing: 1,
          textTransform: 'uppercase', marginBottom: 10,
        }}>Período</div>

        <div role="group" aria-label="Período" style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {ECONOMY_SCOPES.map((p) => {
            const active = scope.preset === p.key;
            return (
              <button key={p.key} type="button" data-testid={`general-scope-${p.key}`}
                aria-pressed={active} onClick={() => setPreset(p.key)}
                style={{
                  background: active ? 'rgba(249,115,22,.14)' : 'rgba(255,255,255,.045)',
                  border: `1px solid ${active ? ACCENT : 'rgba(255,255,255,.10)'}`,
                  boxShadow: active ? '0 0 14px rgba(249,115,22,.15)' : 'none',
                  color: active ? '#ffd9b8' : 'rgba(255,255,255,0.5)',
                  borderRadius: 999, padding: '7px 14px', fontSize: 12.5,
                  fontWeight: active ? 850 : 700, whiteSpace: 'nowrap', cursor: 'pointer',
                }}>{p.label}</button>
            );
          })}
        </div>

        {/* Responsive by construction: the two fields are a grid that collapses
            to one column on a phone instead of wrapping mid-control. */}
        {scope.preset === 'personalizado' && (
          <div style={{
            display: 'grid', gap: 9, marginTop: 11,
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          }}>
            <label style={{ color: MUTED, fontSize: 10.5, fontWeight: 700, letterSpacing: .5 }}>
              DESDE
              <input data-testid="general-custom-from" type="datetime-local" value={scope.from}
                onChange={(e) => setScope((s) => ({ ...s, from: e.target.value }))}
                style={{
                  display: 'block', width: '100%', marginTop: 4, background: C.carbone2,
                  color: C.bianco, border: '1px solid rgba(255,255,255,.12)',
                  borderRadius: 9, padding: '9px 10px', fontSize: 13,
                }} />
            </label>
            <label style={{ color: MUTED, fontSize: 10.5, fontWeight: 700, letterSpacing: .5 }}>
              HASTA
              <input data-testid="general-custom-to" type="datetime-local" value={scope.to}
                onChange={(e) => setScope((s) => ({ ...s, to: e.target.value }))}
                style={{
                  display: 'block', width: '100%', marginTop: 4, background: C.carbone2,
                  color: C.bianco, border: '1px solid rgba(255,255,255,.12)',
                  borderRadius: 9, padding: '9px 10px', fontSize: 13,
                }} />
            </label>
          </div>
        )}

        {/* The interval the SERVER resolved for this scope. Rendered, never
            recomputed — this line and the figures below always describe the
            same query. */}
        {windowLine && (
          <div data-testid="general-window" style={{
            display: 'flex', alignItems: 'center', gap: 7, marginTop: 11,
            color: MUTED, fontSize: 11.5, fontFamily: "'DM Mono',monospace",
          }}>
            <span style={{ color: ACCENT, flexShrink: 0 }}><Glyph d={I_CAL} size={13} /></span>
            {windowLine}
          </div>
        )}
        {!scopeIsReady(scope) && (
          <div data-testid="general-scope-incomplete" style={{ color: MUTED, fontSize: 11.5, marginTop: 10 }}>
            Elige inicio y fin.
          </div>
        )}
      </div>

      {/* ── INNER TABS — same scope, two views ─────────────────────────── */}
      <div role="tablist" aria-label="Vista" data-testid="general-view-tabs" style={{
        display: 'flex', gap: 6, marginBottom: 12,
        border: '1px solid rgba(255,255,255,.07)', borderRadius: 13, padding: 4,
        background: 'rgba(255,255,255,.02)',
      }}>
        {[{ id: 'economia', label: 'Economía' }, { id: 'ventas', label: 'Ventas' }].map((t) => {
          const active = view === t.id;
          return (
            <button key={t.id} type="button" role="tab" aria-selected={active}
              data-testid={`general-view-${t.id}`} onClick={() => setView(t.id)}
              style={{
                flex: 1, border: 'none', borderRadius: 10, padding: '9px 8px',
                background: active ? 'rgba(249,115,22,.14)' : 'transparent',
                color: active ? ACCENT : 'rgba(255,255,255,0.45)',
                fontSize: 12.5, fontWeight: active ? 850 : 700, cursor: 'pointer',
                letterSpacing: .3, textTransform: 'uppercase',
              }}>{t.label}</button>
          );
        })}
      </div>

      {status === 'error' && (
        <div data-testid="general-error" style={{
          ...card, borderColor: 'rgba(232,52,28,.35)', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ color: C.rosso, fontWeight: 700, fontSize: 13, flex: 1 }}>{error}</div>
          <button type="button" onClick={reload} style={{
            background: 'rgba(232,52,28,.15)', border: '1px solid rgba(232,52,28,.5)',
            color: '#fff', borderRadius: 10, padding: '7px 14px',
            fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
          }}>Reintentar</button>
        </div>
      )}

      {/* ── VIEW: ECONOMÍA ────────────────────────────────────────────── */}
      {view === 'economia' && (
        <div data-testid="general-view-panel-economia">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <Kpi label="Cobrado" value={money(receipts.collected)} testId="general-kpi-cobrado" big tone={ready ? MONEY_IN : undefined} />
            {/* Compact, and it navigates rather than duplicating the detail. */}
            <Kpi label="Ventas" value={money(obligation.gross)} testId="general-kpi-ventas"
              onClick={() => setView('ventas')} sub={`${count(counts.obligations)} pedidos`} />
            <Kpi label="Pendiente" value={money(obligation.unpaid)} testId="general-kpi-pendiente"
              tone={ready && (obligation.unpaid || 0) > 0 ? ACCENT : undefined} />
            <Kpi label="Devuelto" value={money(obligation.refunded)} testId="general-kpi-devuelto" />
            <Kpi label="Anulado" value={money(obligation.voided)} testId="general-kpi-anulado" />
          </div>

          <div style={card} data-testid="general-methods">
            <div style={{
              color: MUTED, fontSize: 10.5, fontWeight: 800, letterSpacing: 1,
              textTransform: 'uppercase', marginBottom: 4,
            }}>Métodos de cobro</div>
            <MethodRow icon={I_CASH}  label="Efectivo" value={money(byMethod.efectivo)} testId="general-efectivo" />
            <MethodRow icon={I_CARD}  label="Tarjeta"  value={money(byMethod.tarjeta)}  testId="general-tarjeta" />
            <MethodRow icon={I_BIZUM} label="Bizum"    value={money(byMethod.bizum)}    testId="general-bizum" />
            <MethodRow icon={I_OTHER} label="Otros"    value={money(byMethod.other)}    testId="general-otros" />
          </div>

          {/* N-8 — compact by default. The semantics are untouched; only the
              paragraph is gone. Both truths stay reachable in one tap. */}
          {ready && lateAfterClose && lateAfterClose.length > 0 && (
            <div data-testid="general-n8" style={{
              border: '1px solid rgba(249,115,22,.28)', background: 'rgba(249,115,22,.07)',
              borderRadius: 14, marginBottom: 12, overflow: 'hidden',
            }}>
              <button type="button" data-testid="general-n8-toggle"
                aria-expanded={n8Open} onClick={() => setN8Open((v) => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  background: 'transparent', border: 'none', padding: '11px 13px',
                  color: '#f0b183', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', textAlign: 'left',
                }}>
                <span style={{ flex: '1 1 auto' }}>Cobros posteriores al cierre</span>
                <span style={{ color: MUTED, fontWeight: 700 }}>{n8Open ? 'Ocultar' : 'Ver detalle'}</span>
              </button>
              {n8Open && (
                <div data-testid="general-n8-detail" style={{
                  padding: '0 13px 12px', color: '#e0b894', fontSize: 12, lineHeight: 1.6,
                }}>
                  {lateAfterClose.map((x, i) => (
                    <div key={`${x.businessDate}-${i}`} style={{ marginBottom: 4 }}>
                      {x.businessDate} · al cierre {eur(x.alFinalizar)} · ahora {eur(x.ahora)}
                      {' · '}<strong>{eur((Number(x.ahora) || 0) - (Number(x.alFinalizar) || 0))}</strong>
                    </div>
                  ))}
                  <div style={{ color: MUTED, marginTop: 6 }}>El cierre registrado no cambia.</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── VIEW: VENTAS ──────────────────────────────────────────────── */}
      {view === 'ventas' && (
        <div data-testid="general-view-panel-ventas">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <Kpi label="Ventas" value={money(obligation.gross)} testId="general-ventas-total" big />
            <Kpi label="Pedidos" value={count(counts.obligations)} testId="general-ventas-pedidos" />
            <Kpi label="Pendiente" value={money(obligation.unpaid)} testId="general-ventas-pendiente" />
          </div>
          <SalesDetail rows={snapshot?.drillDown?.obligations} ready={ready} />
        </div>
      )}
    </div>
  );
}

// The sales detail of the SAME scope. It reads the drill-down the certified
// reader already returns — no new analytics, no second query, and deliberately
// not the future Estadísticas product.
function SalesDetail({ rows, ready }) {
  const list = Array.isArray(rows) ? rows : [];
  if (!ready) {
    return <div data-testid="general-ventas-detail" style={{ ...card, color: MUTED, fontSize: 12.5 }}>···</div>;
  }
  if (list.length === 0) {
    return (
      <div data-testid="general-ventas-detail" style={{ ...card, color: MUTED, fontSize: 12.5 }}>
        Sin ventas en este período.
      </div>
    );
  }
  return (
    <div style={card} data-testid="general-ventas-detail">
      <div style={{
        color: MUTED, fontSize: 10.5, fontWeight: 800, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 4,
      }}>Detalle</div>
      {list.map((r, i) => (
        <div key={`${r.orderId || i}`} style={{
          display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 0',
          borderBottom: i === list.length - 1 ? 'none' : '1px solid rgba(255,255,255,.055)',
        }}>
          <span style={{ color: ACCENT, fontSize: 12.5, fontWeight: 800, flexShrink: 0, fontFamily: "'DM Mono',monospace" }}>
            {r.orderId || '—'}
          </span>
          <span style={{ flex: '1 1 auto', minWidth: 0, color: MUTED, fontSize: 11.5 }}>
            {r.cancelled ? 'Anulado' : r.unpaidAmount > 0 ? 'Pendiente' : 'Cobrado'}
          </span>
          <span style={{ flexShrink: 0, color: CREAM, fontWeight: 800, fontSize: 13.5, fontFamily: "'DM Mono',monospace" }}>
            {eur(r.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}
