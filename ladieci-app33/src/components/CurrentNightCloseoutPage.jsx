// ===============================================================
// CurrentNightCloseoutPage.jsx — recovered from S2-6A (f841255 + 163458c)
// and adapted onto the Auth V2 / dynamic-menu line by S2-7D5.
//
// Read-only reconciliation of the CURRENT service. The backend chooses the
// session; this page accepts no date, range or session id — there is no session
// selector here and there must never be one (docs/SERVICE_SESSION_IDENTITY.md).
//
// It keeps the recovered "Abrir nuevo servicio" affordance for the case where an
// admin lands here directly, but it is NOT the principal open path any more:
// that is the closed-service landing in Servicio (ServiceStateGate).
//
// S2-7D5B — this page used to call api.openServiceSession() straight from the
// click handler: no confirmation, no actor recap, no lock, no verification. That
// was a second, unguarded way to open a real shift. It now mounts the SAME
// controller and the SAME confirmation surface as the landing, and it does not
// import `api.openServiceSession` at all.
// ===============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useOpenServiceController } from './service/useOpenServiceController';
import OpenServiceConfirmation from './service/OpenServiceConfirmation';
import { describeCloseoutKind } from '../utils/closeoutServiceKind';

const money = (value) => `${(Number(value) || 0).toFixed(2)} €`;

export default function CurrentNightCloseoutPage({ onBack, role, actor, onServiceOpened }) {
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

  // The SHARED controller — identical gate, confirmation, lock, classifier and
  // post-open verification as the Servicio landing. This page never calls
  // api.openServiceSession itself.
  const open = useOpenServiceController({
    role,
    onOpened: () => {
      load();
      // After a VERIFIED open, the operator belongs in Servicio, not on a
      // closeout report for a service that has just started.
      if (onServiceOpened) onServiceOpened();
    },
  });

  useEffect(() => {
    liveRef.current = true;
    load();
    return () => { liveRef.current = false; open.dispose(); };
  }, [load]);

  // Derived from the loaded contract only — never from the clock, businessDate
  // or the silent-ensure session (which describes the CURRENT service, not
  // necessarily the one being reported here).
  const kind = describeCloseoutKind(data);

  return (
    <main style={{ minHeight: '100vh', background: '#080808', color: '#fff', padding: 20, fontFamily: "'DM Sans',sans-serif" }}>
      <button onClick={onBack} style={button}>← Servicio</button>
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
            No hay un servicio abierto o recién cerrado.
            {open.mayOpen && !open.confirming && (
              <button data-testid="closeout-open-btn" onClick={open.requestOpen}
                style={{ ...button, display: 'block', marginTop: 14 }}>
                Abrir nuevo servicio
              </button>
            )}
            {open.mayOpen && open.confirming && (
              <OpenServiceConfirmation
                actor={actor} role={role}
                opening={open.opening} error={open.error}
                onConfirm={open.confirm} onCancel={open.cancel}
              />
            )}
          </div>
        )}
        {data && data.available && (
          <>
            <p>{data.businessDate} · {data.status === 'closed' ? 'Cerrado' : data.status === 'closing' ? 'Cerrando' : 'Abierto'}</p>
            <p style={{ color: '#aaa' }}>
              Apertura: {data.openedAt ? new Date(data.openedAt).toLocaleString() : '—'} ·
              {' '}Cierre: {data.closedAt ? new Date(data.closedAt).toLocaleString() : '—'}
            </p>
            <div style={grid}>
              {[
                ['Tickets', data.counts.tickets],
                ['Total', money(data.totals.gross)],
                ['Cobrado', money(data.totals.collected)],
                ['Pendiente', money(data.totals.unpaid)],
                ['Reembolsos', money(data.totals.refunded)],
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
