import { useState, useEffect } from 'react';
import { C } from '../../constants';
import useEconomyPendencies, {
  describeChannel, describeRevisionReason,
} from '../../economy/useEconomyPendencies';

// ===============================================================
// EconomiaPendientes — PENDENCIAS ECONÓMICAS SLICE 1, the operator surface.
//
// A READ-ONLY window onto the unresolved economic exposures the backend
// already derives:
//   Por cobrar        the customer still owes money
//   Por devolver      the restaurant owes money back to the customer
//   Requiere revisión ledger-evidenced money whose target is not safe to
//                     identify automatically — NOT an actionable balance
//
// There is NO action here, by design: no "cobrar saldo", no refund, no
// "marcar resuelto", no close/reopen of an old Mesa. A closed Mesa stays
// closed; a pendencia clears later only because canonical backend economic
// truth changed. This slice shows the exposure and nothing more.
//
// It renders WHATEVER the API returns — the amounts, dates and identities are
// the reader's, never recomputed or invented here. Presentation-only totals
// are summed straight from the returned items (see the hook).
// ===============================================================

const ACCENT = C.orange;          // por cobrar — customer owes (amber, the Economía "pendiente" tone)
const REFUND = C.blu;             // por devolver — restaurant owes back
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

const eur = (v) => `${(Number(v) || 0).toFixed(2).replace('.', ',')} €`;

// One restaurant, one timezone — the zone name is deliberately not printed.
const stamp = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', hour12: false,
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(d).replace(',', '');
};

const Glyph = ({ d, size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{d}</svg>
);
const I_SEARCH = <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>;
const I_IN     = <><path d="M12 5v14" /><path d="M19 12l-7 7-7-7" /></>;
const I_OUT    = <><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></>;
const I_FLAG   = <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>;

// A Mesa order has no customer identity — `customer` is normalized to
// {null,null} by the reader, and a 'MESA-…' string is never a phone. Non-Mesa
// blank/sentinel values are already null. This only ever surfaces a genuine,
// stored name/phone.
const realName = (item) => {
  const name = item && item.customer && item.customer.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
};
const realPhone = (item) => {
  const phone = item && item.customer && item.customer.phone;
  if (typeof phone !== 'string' || !phone.trim()) return null;
  if (/^MESA-/i.test(phone.trim())) return null;
  return phone.trim();
};

// The identity line for an actionable item. Mesa: table + command number,
// operational metadata only. Non-Mesa: the real customer name if there is
// one, otherwise the display order number. The stable orderUid is used as the
// React key and never shown.
function identityOf(item) {
  const d = item.display || {};
  const orderNo = d.orderNumber ? (String(d.orderNumber).startsWith('#') ? String(d.orderNumber) : `#${d.orderNumber}`) : null;
  if (item.channel === 'MESA') {
    const mesa = d.tableName || (d.tableNumber != null ? `Mesa ${d.tableNumber}` : 'Mesa');
    return orderNo ? `${mesa} · Pedido ${orderNo}` : mesa;
  }
  const name = realName(item);
  if (name) return name;
  return orderNo ? `Pedido ${orderNo}` : 'Pedido';
}

function metaOf(item) {
  const bits = [];
  const chan = describeChannel(item.channel);
  if (chan && item.channel !== 'MESA') bits.push(chan);
  const phone = realPhone(item);
  if (phone) bits.push(phone);
  const when = stamp(item.originalDate);
  if (when) bits.push(when);
  return bits.join(' · ');
}

const SummaryTile = ({ label, value, tone, testId }) => (
  <div data-testid={testId} style={{
    flex: '1 1 0', minWidth: 0,
    border: '1px solid rgba(255,255,255,.07)', background: 'rgba(255,255,255,.03)',
    borderRadius: 12, padding: '9px 10px',
  }}>
    <div style={{ ...eyebrow, fontSize: 9.5 }}>{label}</div>
    <div style={{
      color: tone || CREAM, fontWeight: 900, fontSize: 15.5,
      fontFamily: "'DM Mono',monospace", letterSpacing: -0.3, marginTop: 3,
    }}>{value}</div>
  </div>
);

const AmountItem = ({ item, tone, testId }) => (
  <div data-testid={testId} style={{
    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 0',
    borderBottom: '1px solid rgba(255,255,255,.055)',
  }}>
    <span style={{ flex: '1 1 auto', minWidth: 0 }}>
      <span style={{ display: 'block', color: CREAM, fontSize: 13, fontWeight: 800, fontFamily: "'DM Mono',monospace", wordBreak: 'break-word' }}>
        {identityOf(item)}
      </span>
      {metaOf(item) && (
        <span style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, marginTop: 2 }}>
          {metaOf(item)}
        </span>
      )}
    </span>
    <span style={{ flexShrink: 0, color: tone, fontWeight: 900, fontSize: 14.5, fontFamily: "'DM Mono',monospace" }}>
      {eur(item.amount)}
    </span>
  </div>
);

// REQUIERE_REVISIÓN row. No disclosure of raw backend vocabulary
// (reasonCode / direction / channel enums): an operator cannot act on those,
// and the mapped Spanish phrase already states, at the right altitude, that
// the record needs a manual look. Deliberately zero interactive controls.
function RevisionItem({ item, testId }) {
  const orderNo = item.orderDisplay
    ? (String(item.orderDisplay).startsWith('#') ? String(item.orderDisplay) : `#${item.orderDisplay}`)
    : null;
  const when = stamp(item.originalDate);
  return (
    <div data-testid={testId} style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,.055)',
    }}>
      <span style={{ flex: '1 1 auto', minWidth: 0 }}>
        <span style={{ display: 'block', color: LABEL, fontSize: 13, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
          {orderNo || 'Sin pedido'}
        </span>
        <span style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, marginTop: 3, lineHeight: 1.45 }}>
          {describeRevisionReason(item.reasonCode)}
          {when ? ` · ${when}` : ''}
        </span>
      </span>
      {item.amount != null && (
        <span style={{ flexShrink: 0, color: MUTED, fontWeight: 800, fontSize: 13.5, fontFamily: "'DM Mono',monospace" }}>
          {eur(item.amount)}
        </span>
      )}
    </div>
  );
}

function Group({ title, count, total, tone, icon, items, emptyText, testId, renderItem }) {
  return (
    <div style={card} data-testid={testId}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: items.length ? 2 : 6 }}>
        <span style={{ color: tone, flexShrink: 0 }}><Glyph d={icon} size={14} /></span>
        <span style={{ ...eyebrow, color: tone }}>{title}</span>
        <span style={{ flex: '1 1 auto' }} />
        <span style={{ color: MUTED, fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>
          {count}{total != null ? ` · ${eur(total)}` : ''}
        </span>
      </div>
      {items.length === 0
        ? <div data-testid={`${testId}-empty`} style={{ color: MUTED, fontSize: 12 }}>{emptyText}</div>
        : items.map((it, i) => renderItem(it, i))}
    </div>
  );
}

// EconomiaPendientes({ scope, scopeLabel, onClearScope })
//
//   scope        canonical params ({preset, serviceSessionId?, from?, to?}) or
//                null / {} for GLOBAL / Todos. Passed straight to the reader —
//                the server resolves it. This component computes no window.
//   scopeLabel   short human label for the active filter chip ("Hoy", "Ayer",
//                "Servicio", "Personalizado").
//   onClearScope clears the filter → back to GLOBAL / Todos.
export default function EconomiaPendientes({ scope = null, scopeLabel = null, onClearScope } = {}) {
  const [rawQuery, setRawQuery] = useState('');
  // The value that actually goes on the wire only changes when the operator
  // pauses typing, so the reader is not re-hit on every keystroke.
  const [committedQuery, setCommittedQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setCommittedQuery(rawQuery), 300);
    return () => clearTimeout(id);
  }, [rawQuery]);

  const scopeParams = scope && scope.preset ? scope : {};
  const filtered = Boolean(scopeParams.preset);

  const {
    porCobrar, porDevolver, requiereRevision, counts, totals,
    isEmpty, status, error, reload,
  } = useEconomyPendencies({ ...scopeParams, q: committedQuery });

  const loading = status === 'loading' || status === 'incomplete';
  const failed = status === 'error';

  return (
    <div data-testid="economia-pendientes">
      {/* ── ACTIVE FILTER — only when a scope was carried in from General.
          A bare visit to this destination has no chip. */}
      {filtered && (
        <div data-testid="pendientes-scope-chip" style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
        }}>
          <button type="button" data-testid="pendientes-scope-clear"
            onClick={() => onClearScope && onClearScope()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(249,115,22,.15)', border: `1px solid ${ACCENT}`,
              color: '#ffd9b8', borderRadius: 999, padding: '5px 10px 5px 12px',
              fontSize: 12, fontWeight: 800, cursor: 'pointer', minHeight: 30,
            }}>
            {scopeLabel || 'Filtrado'}
            <span aria-hidden="true" style={{ fontSize: 13, opacity: .8 }}>×</span>
          </button>
        </div>
      )}

      {/* ── SEARCH ─────────────────────────────────────────────────────── */}
      <div style={{ ...card, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ color: MUTED, flexShrink: 0 }}><Glyph d={I_SEARCH} size={15} /></span>
        <input
          data-testid="pendientes-search"
          type="search"
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          placeholder="Buscar mesa, pedido o cliente"
          aria-label="Buscar pendientes"
          style={{
            flex: '1 1 auto', minWidth: 0, background: 'transparent', border: 'none',
            color: CREAM, fontSize: 13, fontWeight: 600, outline: 'none', padding: '4px 0',
          }}
        />
      </div>

      {/* ── ERROR — isolated to this section, the rest of Economía is fine ── */}
      {failed && (
        <div data-testid="pendientes-error" style={{
          ...card, borderColor: 'rgba(232,52,28,.35)', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ color: C.rosso, fontWeight: 700, fontSize: 12.5, flex: 1 }}>{error}</div>
          <button type="button" data-testid="pendientes-retry" onClick={reload} style={{
            background: 'rgba(232,52,28,.15)', border: '1px solid rgba(232,52,28,.5)',
            color: '#fff', borderRadius: 9, padding: '7px 13px',
            fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
          }}>Reintentar</button>
        </div>
      )}

      {/* ── LOADING — local, non-blocking ─────────────────────────────── */}
      {loading && (
        <div data-testid="pendientes-loading" style={{ ...card, color: MUTED, fontSize: 12 }}>···</div>
      )}

      {!loading && !failed && (
        <>
          {/* ── SUMMARY ─────────────────────────────────────────────── */}
          <div data-testid="pendientes-summary" style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <SummaryTile testId="pendientes-summary-cobrar" label="Por cobrar"
              value={totals.porCobrar != null ? eur(totals.porCobrar) : '—'}
              tone={counts.porCobrar > 0 ? ACCENT : undefined} />
            <SummaryTile testId="pendientes-summary-devolver" label="Por devolver"
              value={totals.porDevolver != null ? eur(totals.porDevolver) : '—'}
              tone={counts.porDevolver > 0 ? REFUND : undefined} />
            <SummaryTile testId="pendientes-summary-revision" label="Requiere revisión"
              value={String(counts.requiereRevision || 0)}
              tone={counts.requiereRevision > 0 ? '#c9a8e6' : undefined} />
          </div>

          {isEmpty ? (
            <div data-testid="pendientes-empty" style={{ ...card, color: LABEL, fontSize: 12.5 }}>
              No hay pendientes. Todo cuadra.
            </div>
          ) : (
            <>
              <Group testId="pendientes-group-cobrar" title="Por cobrar"
                count={counts.porCobrar} total={totals.porCobrar} tone={ACCENT} icon={I_IN}
                items={porCobrar} emptyText="Sin saldos pendientes."
                renderItem={(it, i) => (
                  <AmountItem key={it.orderUid || `c-${i}`} item={it} tone={ACCENT} testId="pendientes-item-cobrar" />
                )} />

              <Group testId="pendientes-group-devolver" title="Por devolver"
                count={counts.porDevolver} total={totals.porDevolver} tone={REFUND} icon={I_OUT}
                items={porDevolver} emptyText="Nada pendiente de devolución."
                renderItem={(it, i) => (
                  <AmountItem key={it.orderUid || `d-${i}`} item={it} tone={REFUND} testId="pendientes-item-devolver" />
                )} />

              <Group testId="pendientes-group-revision" title="Requiere revisión"
                count={counts.requiereRevision} total={null} tone="#c9a8e6" icon={I_FLAG}
                items={requiereRevision} emptyText="Sin incidencias pendientes de revisión."
                renderItem={(it, i) => (
                  <RevisionItem key={`${it.reasonCode || 'r'}-${it.orderDisplay || i}`} item={it} testId="pendientes-item-revision" />
                )} />
            </>
          )}
        </>
      )}
    </div>
  );
}
