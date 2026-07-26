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
// ===============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { OPEN_OUTCOME, OPEN_UNVERIFIED_MESSAGE, classifyOpenAttempt } from '../utils/openServiceOutcome';
import { SERVICE_PHASE, classifyServiceState } from '../utils/serviceSessionState';

const money = (value) => `${(Number(value) || 0).toFixed(2)} €`;

export default function CurrentNightCloseoutPage({ onBack, canOpen = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
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

  const openService = async () => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setError('');
    try {
      const outcome = classifyOpenAttempt(await api.openServiceSession());
      if (outcome.kind !== OPEN_OUTCOME.VERIFY) { setError(outcome.message); return; }
      const res = await load();
      if (classifyServiceState(res).phase !== SERVICE_PHASE.OPEN) setError(OPEN_UNVERIFIED_MESSAGE);
    } catch (_) {
      setError('Error de red al abrir el servicio. No se abrió nada.');
    } finally {
      openingRef.current = false;
      if (liveRef.current) setOpening(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: '#080808', color: '#fff', padding: 20, fontFamily: "'DM Sans',sans-serif" }}>
      <button onClick={onBack} style={button}>← Servicio</button>
      <section style={{ maxWidth: 980, margin: '28px auto' }}>
        <p style={{ color: '#f97316', fontWeight: 800, letterSpacing: 2 }}>SERVICIO ACTUAL</p>
        <h1>Cierre del servicio</h1>
        {error && <p role="alert" data-testid="closeout-error" style={{ color: '#ffb4b4' }}>{error}</p>}
        {!data && !error && <p>Cargando…</p>}
        {data && !data.available && (
          <div style={panel}>
            No hay un servicio abierto o recién cerrado.
            {canOpen && (
              <button data-testid="closeout-open-btn" disabled={opening} onClick={openService}
                style={{ ...button, display: 'block', marginTop: 14, opacity: opening ? 0.55 : 1 }}>
                {opening ? 'Abriendo…' : 'Abrir nuevo servicio'}
              </button>
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
