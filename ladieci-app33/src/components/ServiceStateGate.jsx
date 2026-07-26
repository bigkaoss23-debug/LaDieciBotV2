// ===============================================================
// ServiceStateGate.jsx — S2-7D5
//
// THE service-state gate for the operational surface.
//
// The design gap the recovered S2-6A UI never closed: its only "Abrir nuevo
// servicio" button lived inside the closeout page, so an operator entering
// Servicio saw a fully normal order-entry screen that could not possibly save —
// every insert dies on the DB trigger NO_OPEN_SERVICE_SESSION. This component
// makes the shift state the FIRST thing the operator meets.
//
// Three states, no fourth:
//   loading  → a clear waiting surface, never a half-usable Servicio
//   open     → the real Servicio, plus one restrained persistent status line
//   closed   → a landing that explains why, and offers the only open control
//
// Rider never sees the open control (frontend defense in depth; Railway is the
// authority). The client never chooses a session id, a date or a shift window.
// ===============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { canOpenService, isRider } from '../utils/adminRbac';
import {
  SERVICE_PHASE, classifyServiceState, serviceOpenLabel, closedServiceReason,
} from '../utils/serviceSessionState';
import { ATTEMPT, createAttemptLock, runOpenServiceAttempt } from '../utils/openServiceFlow';

const two = (n) => String(n).padStart(2, '0');

const useNow = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  return now;
};

const fmtDate = (d) => d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = (d) => `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
// The business date the backend WILL fix at open time is derived server-side in
// Europe/Madrid. Shown here as the local calendar day, labelled as a preview so
// it can never be mistaken for an identity the client asserts.
const localBusinessDate = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

const ROLE_LABEL = { admin: 'Administrador', operator: 'Operador', rider: 'Repartidor' };

const panel = {
  background: '#141414', border: '1px solid #2c2c2c', borderRadius: 16, padding: 22,
};
const primaryBtn = {
  background: '#F97316', border: 'none', borderRadius: 14, padding: '15px 22px',
  color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', letterSpacing: 0.4,
};
const ghostBtn = {
  background: 'transparent', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 14,
  padding: '13px 22px', color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
};

export default function ServiceStateGate({ role, actor, onCloseout, children }) {
  const [state, setState] = useState({ phase: SERVICE_PHASE.LOADING });
  const [confirming, setConfirming] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const lockRef = useRef(null);       // synchronous double-click lock
  if (lockRef.current === null) lockRef.current = createAttemptLock();
  const liveRef = useRef(true);
  const now = useNow();

  const refresh = useCallback(async () => {
    const res = await api.getCurrentServiceCloseout();
    const next = classifyServiceState(res);
    if (liveRef.current) setState(next);
    return next;
  }, []);

  useEffect(() => {
    liveRef.current = true;
    refresh().catch(() => {
      if (liveRef.current) {
        setState({ phase: SERVICE_PHASE.ERROR, message: 'No se pudo leer el estado del servicio.' });
      }
    });
    return () => { liveRef.current = false; };
  }, [refresh]);

  // A write refused with NO_OPEN_SERVICE_SESSION means the shift closed under us
  // (the 23:50 cron, or another operator). Re-read rather than keep pretending.
  useEffect(() => {
    const onLost = () => { refresh().catch(() => {}); };
    window.addEventListener('ld-service-session-lost', onLost);
    return () => window.removeEventListener('ld-service-session-lost', onLost);
  }, [refresh]);

  // ── Phase 5 — open with an explicit in-application confirmation ────────────
  const doOpen = async () => {
    // The lock lives inside runOpenServiceAttempt and is acquired synchronously,
    // before any await: the second click of a double click sends nothing.
    if (lockRef.current.busy) return;
    setOpening(true);
    setOpenError('');
    const result = await runOpenServiceAttempt({
      lock: lockRef.current,
      openService: () => api.openServiceSession(),
      readState: () => api.getCurrentServiceCloseout(),
    });
    if (!liveRef.current) return;
    setOpening(false);
    if (result.kind === ATTEMPT.IGNORED) return;
    if (result.kind === ATTEMPT.OPENED) {
      setState(result.state);          // verified open — only now do we enter Servicio
      setConfirming(false);
      return;
    }
    if (result.state) setState(result.state);
    setOpenError(result.message);
  };

  // ── open → the real Servicio, with one restrained status line ──────────────
  if (state.phase === SERVICE_PHASE.OPEN) {
    return (
      <>
        <div
          data-testid="service-open-status"
          style={{
            position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 140,
            background: 'rgba(46,213,115,0.10)', border: '1px solid rgba(46,213,115,0.32)',
            borderRadius: 999, padding: '4px 14px', color: 'rgba(120,231,168,0.9)',
            fontSize: 11, fontWeight: 700, letterSpacing: 0.3, pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
          {serviceOpenLabel(state)}
        </div>
        {children}
      </>
    );
  }

  if (state.phase === SERVICE_PHASE.LOADING) {
    return (
      <main data-testid="service-gate-loading" style={shell}>
        <div style={{ ...panel, maxWidth: 520, textAlign: 'center' }}>
          <p style={eyebrow}>SERVICIO</p>
          <h1 style={{ fontSize: 22, margin: '4px 0 10px' }}>Comprobando el estado del servicio…</h1>
          <p style={{ color: '#9a9a9a', fontSize: 14, margin: 0 }}>
            Un momento: los pedidos solo pueden crearse con un servicio abierto.
          </p>
        </div>
      </main>
    );
  }

  // ── closed / error → the landing. No order-entry surface is exposed here. ──
  const mayOpen = canOpenService(role);
  const roleLabel = ROLE_LABEL[String(role || '').toLowerCase()] || (role || '—');

  return (
    <main data-testid="service-closed-landing" style={shell}>
      <section style={{ ...panel, maxWidth: 560, width: '100%' }}>
        <p style={eyebrow}>SERVICIO</p>
        <h1 data-testid="service-closed-title" style={{ fontSize: 26, margin: '4px 0 6px' }}>
          {state.phase === SERVICE_PHASE.ERROR ? 'Estado del servicio no disponible' : closedServiceReason(state)}
        </h1>
        <p style={{ color: '#a5a5a5', fontSize: 14, lineHeight: 1.6, margin: '0 0 18px' }}>
          {state.phase === SERVICE_PHASE.ERROR
            ? (state.message || 'No se pudo leer el estado del servicio.')
            : 'Los pedidos quedan vinculados a un servicio. Mientras no haya un servicio abierto no se puede crear ningún pedido.'}
        </p>

        <dl data-testid="service-identity" style={grid}>
          <Row k="Usuario" v={actor || '—'} />
          <Row k="Rol" v={roleLabel} />
          <Row k="Fecha" v={fmtDate(now)} />
          <Row k="Hora" v={fmtTime(now)} />
          {state.businessDate ? <Row k="Último servicio" v={`${state.businessDate} · ${state.status}`} /> : null}
        </dl>

        {isRider(role) && (
          <p data-testid="service-rider-notice" style={{ color: '#fbbf24', fontSize: 13, marginTop: 18 }}>
            El reparto no abre el servicio. Avisa a un operador.
          </p>
        )}

        {mayOpen && !confirming && (
          <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
            <button data-testid="open-service-btn" onClick={() => { setOpenError(''); setConfirming(true); }} style={primaryBtn}>
              Abrir servicio
            </button>
            <button onClick={() => refresh()} style={ghostBtn}>Actualizar estado</button>
            {onCloseout && (
              <button data-testid="landing-closeout-btn" onClick={onCloseout} style={ghostBtn}>Cierre del servicio</button>
            )}
          </div>
        )}

        {/* ── Phase 5 confirmation — in-application, never window.confirm ──── */}
        {mayOpen && confirming && (
          <div data-testid="open-service-confirm" style={{
            marginTop: 22, background: 'rgba(249,115,22,0.08)',
            border: '1px solid rgba(249,115,22,0.4)', borderRadius: 14, padding: 18,
          }}>
            <div style={{ color: '#fb923c', fontWeight: 800, fontSize: 15, marginBottom: 12 }}>
              Abrir un nuevo servicio
            </div>
            <dl style={grid}>
              <Row k="Acción" v="Abrir nuevo servicio" />
              <Row k="Usuario" v={actor || '—'} />
              <Row k="Rol" v={roleLabel} />
              <Row k="Fecha y hora" v={`${fmtDate(now)} · ${fmtTime(now)}`} />
              <Row k="Fecha de servicio" v={`${localBusinessDate(now)} (la fija el servidor)`} />
            </dl>
            <p data-testid="open-service-consequence" style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 1.6, margin: '14px 0 0' }}>
              Los nuevos pedidos quedarán vinculados a este servicio.
            </p>

            {openError && (
              <div data-testid="open-service-error" role="alert" style={{
                marginTop: 14, background: 'rgba(192,57,43,0.16)', border: '1px solid rgba(192,57,43,0.55)',
                borderRadius: 12, padding: '11px 14px', color: '#ffb4b4', fontSize: 13, fontWeight: 600,
              }}>
                {openError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                data-testid="open-service-confirm-btn"
                onClick={doOpen}
                disabled={opening}
                style={{ ...primaryBtn, opacity: opening ? 0.55 : 1, cursor: opening ? 'default' : 'pointer' }}>
                {opening ? 'Abriendo…' : 'Confirmar y abrir servicio'}
              </button>
              <button
                data-testid="open-service-cancel-btn"
                onClick={() => { setConfirming(false); setOpenError(''); }}
                disabled={opening}
                style={{ ...ghostBtn, opacity: opening ? 0.55 : 1 }}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function Row({ k, v }) {
  return (
    <>
      <dt style={{ color: '#8a8a8a', fontSize: 12, letterSpacing: 0.4 }}>{k}</dt>
      <dd style={{ margin: 0, color: '#f0f0f0', fontSize: 13, fontWeight: 600 }}>{v}</dd>
    </>
  );
}

const shell = {
  minHeight: '100vh', background: '#080808', color: '#fff', padding: 20,
  fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const eyebrow = { color: '#f97316', fontWeight: 800, letterSpacing: 2, fontSize: 11, margin: 0 };
const grid = {
  display: 'grid', gridTemplateColumns: 'minmax(120px,auto) 1fr', gap: '8px 16px',
  margin: 0, alignItems: 'baseline',
};
