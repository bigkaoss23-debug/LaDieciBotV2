// ===============================================================
// CurrentNightCloseoutPage.jsx — recovered from S2-6A (f841255 + 163458c)
// and adapted onto the Auth V2 / dynamic-menu line by S2-7D5.
//
// Read-only reconciliation of the CURRENT service. The backend chooses the
// session; this page accepts no date, range or session id — there is no session
// selector here and there must never be one (docs/SERVICE_SESSION_IDENTITY.md).
//
// G-1 — THIS PAGE IS NOW PURELY A REPORT. Every "Abrir nuevo servicio"
// affordance is gone, along with the controller and the confirmation modal
// that guarded it. There is nothing left for them to do: the Operational
// Service resumes by itself on the next real order or the next table
// seating (resolve_order_intake_context_v1 →
// open_operational_service_v1('next_service_of_business_day')), so asking an
// operator to open one by hand can only ever be lifecycle bureaucracy
// exposed to someone who should never have had to see it.
//
// The backend action and its server-side controller are deliberately NOT
// deleted in this slice — they simply have no caller here any more, and the
// backend now answers them with a typed refusal because ensure_service_
// session no longer reports REOPEN_REQUIRED. Retiring that surface is its
// own slice.
// ===============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { describeCloseoutKind } from '../utils/closeoutServiceKind';

const money = (value) => `${(Number(value) || 0).toFixed(2)} €`;

export default function CurrentNightCloseoutPage({ onBack, onReturnHome }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const liveRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await api.getCurrentServiceCloseout();
      if (!liveRef.current) return null;
      if (!res || res.error) { setError('No se pudo cargar el cierre.'); return null; }
      setError('');
      setData(res);
      return res;
    } catch (_) {
      if (liveRef.current) setError('No se pudo cargar el cierre.');
      return null;
    }
  }, []);

  useEffect(() => {
    liveRef.current = true;
    load();
    return () => { liveRef.current = false; };
  }, [load]);

  // Derived from the loaded contract only — never from the clock, businessDate
  // or the silent-ensure session (which describes the CURRENT service, not
  // necessarily the one being reported here).
  const kind = describeCloseoutKind(data);

  return (
    <main style={{ minHeight: '100vh', background: '#080808', color: '#fff', padding: 20, fontFamily: "'DM Sans',sans-serif" }}>
      {/* S2-7D6E — a CLOSED session's report is a dead end by design: going "back" into
          Servicio would remount the gate, re-run ensure, and land right back here — the
          reported loop. Only a genuinely still-open/closing session (or no session at
          all) makes "← Servicio" a real place to return to. */}
      {data && data.status === 'closed' ? (
        <button onClick={onReturnHome} data-testid="closeout-home-btn" style={button}>Volver al menú principal</button>
      ) : (
        <button onClick={onBack} data-testid="closeout-back-btn" style={button}>← Servicio</button>
      )}
      <section style={{ maxWidth: 980, margin: '28px auto' }}>
        {/* S2-7D6C2 — which service this report is about comes ONLY from
            closeout.serviceKind. Before `data` exists there is nothing to
            claim, so the neutral wording stands. */}
        <p data-testid="closeout-eyebrow" style={{ color: '#f97316', fontWeight: 800, letterSpacing: 2 }}>{kind.eyebrow}</p>
        <h1 data-testid="closeout-title">{kind.title}</h1>
        {error && <p role="alert" data-testid="closeout-error" style={{ color: '#ffb4b4' }}>{error}</p>}
        {!data && !error && <p>Cargando…</p>}
        {data && !data.available && (
          <div style={panel}>
            Todavía no hay nada que resumir. El servicio se abrirá solo con el próximo pedido o la próxima mesa.
          </div>
        )}
        {data && data.available && (
          <>
            <p>{data.businessDate} · {data.status === 'closed' ? 'Cerrado' : data.status === 'closing' ? 'Cerrando' : 'Abierto'}</p>
            <p style={{ color: '#aaa' }}>
              Apertura: {data.openedAt ? new Date(data.openedAt).toLocaleString() : '—'} ·
              {' '}Cierre: {data.closedAt ? new Date(data.closedAt).toLocaleString() : '—'}
            </p>
            {/* G-1 — F-9 used to put an "Abrir nuevo servicio" button here so an
                operator reading a finalized report had a path forward. There is
                nothing to be forward TO any more: the next real order or the
                next table seating opens the next Operational Service on its
                own. A finalized report is now just a finalized report, and
                "Volver al menú principal" above is a real exit, not a dead
                end. */}
            {data.status === 'closed' && (
              <p data-testid="closeout-finalized-note" style={{ color: '#8a8a8a', fontSize: 13, marginTop: 6 }}>
                Servicio finalizado. El próximo pedido o la próxima mesa abrirán el siguiente servicio automáticamente.
              </p>
            )}
            <div style={grid}>
              {[
                ['Tickets', data.counts.tickets],
                ['Total', money(data.totals.gross)],
                ['Cobrado', money(data.totals.collected)],
                ['Pendiente', money(data.totals.unpaid)],
                ['Reembolsos', money(data.totals.refunded)],
                // UAT-P1-B -- cancelled value was only ever visible per ticket,
                // never summarised, although the official closeout carries it
                // (total_void_cents). Rendered only once the report actually
                // supplies it, so an open service's tile grid is unchanged.
                ...(data.totals.voided == null ? [] : [['Anulado', money(data.totals.voided)]]),
                ['Diferencia', money(data.totals.difference)],
              ].map(([k, v]) => (
                <div key={k} style={panel}>
                  <small>{k}</small>
                  <strong style={{ display: 'block', fontSize: 22, marginTop: 5 }}>{v}</strong>
                </div>
              ))}
            </div>
            <h2>Caja por método</h2>
            <div style={grid}>
              {Object.entries(data.paymentTotals).map(([k, v]) => (
                <div key={k} style={panel}>
                  <span style={{ textTransform: 'capitalize' }}>{k}</span>
                  <strong style={{ float: 'right' }}>{money(v)}</strong>
                </div>
              ))}
            </div>
            <h2>Tickets</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['#', 'Hora', 'Estado', 'Importe', 'Pago'].map(h => <th key={h} style={cell}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.tickets.map(t => (
                    <tr key={t.id}>
                      <td style={cell}>{t.number ?? t.id}</td>
                      <td style={cell}>{t.time || '—'}</td>
                      <td style={cell}>{t.state || '—'}</td>
                      <td style={cell}>{money(t.amount)}</td>
                      <td style={cell}>{t.paymentState}{t.paymentMethod ? ` · ${t.paymentMethod}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

const button = { background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 10, padding: '10px 14px', cursor: 'pointer' };
const panel = { background: '#151515', border: '1px solid #333', borderRadius: 14, padding: 16 };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 10 };
const cell = { padding: 12, borderBottom: '1px solid #292929', textAlign: 'left' };
