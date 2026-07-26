// ===============================================================
// ServiceStateGate.jsx — S2-7D5, shared-controller refactor S2-7D5B
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
// S2-7D5B: the opening itself is NOT implemented here. It lives in
// useOpenServiceController + OpenServiceConfirmation, shared with the closeout
// page, so there is exactly one guarded path to an open shift.
// ===============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { isRider } from '../utils/adminRbac';
import {
  SERVICE_PHASE, classifyServiceState, serviceOpenLabel, closedServiceReason,
} from '../utils/serviceSessionState';
import { useOpenServiceController } from './service/useOpenServiceController';
import OpenServiceConfirmation, {
  Row, identityGrid, fmtDate, fmtTime, roleLabelOf, primaryBtn, ghostBtn,
} from './service/OpenServiceConfirmation';

const useNow = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  return now;
};

export default function ServiceStateGate({ role, actor, onCloseout, children }) {
  const [state, setState] = useState({ phase: SERVICE_PHASE.LOADING });
  const liveRef = useRef(true);
  const now = useNow();

  const refresh = useCallback(async () => {
    const res = await api.getCurrentServiceCloseout();
    const next = classifyServiceState(res);
    if (liveRef.current) setState(next);
    return next;
  }, []);

  // One shared controller: role gate, confirmation, synchronous lock, typed
  // classifier and post-open verification all live there.
  const open = useOpenServiceController({
    role,
    onOpened: (verified) => { if (liveRef.current) setState(verified); },
  });

  useEffect(() => {
    liveRef.current = true;
    refresh().catch(() => {
      if (liveRef.current) {
        setState({ phase: SERVICE_PHASE.ERROR, message: 'No se pudo leer el estado del servicio.' });
      }
    });
    return () => { liveRef.current = false; open.dispose(); };
  }, [refresh]);

  // A write refused with NO_OPEN_SERVICE_SESSION means the shift closed under us
  // (the 23:50 cron, or another operator). Re-read rather than keep pretending.
  useEffect(() => {
    const onLost = () => { refresh().catch(() => {}); };
    window.addEventListener('ld-service-session-lost', onLost);
    return () => window.removeEventListener('ld-service-session-lost', onLost);
  }, [refresh]);

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

        <dl data-testid="service-identity" style={identityGrid}>
          <Row k="Usuario" v={actor || '—'} />
          <Row k="Rol" v={roleLabelOf(role)} />
          <Row k="Fecha" v={fmtDate(now)} />
          <Row k="Hora" v={fmtTime(now)} />
          {state.businessDate ? <Row k="Último servicio" v={`${state.businessDate} · ${state.status}`} /> : null}
        </dl>

        {isRider(role) && (
          <p data-testid="service-rider-notice" style={{ color: '#fbbf24', fontSize: 13, marginTop: 18 }}>
            El reparto no abre el servicio. Avisa a un operador.
          </p>
        )}

        {open.mayOpen && !open.confirming && (
          <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
            <button data-testid="open-service-btn" onClick={open.requestOpen} style={primaryBtn}>
              Abrir servicio
            </button>
            <button onClick={() => refresh()} style={ghostBtn}>Actualizar estado</button>
            {onCloseout && (
              <button data-testid="landing-closeout-btn" onClick={onCloseout} style={ghostBtn}>Cierre del servicio</button>
            )}
          </div>
        )}

        {open.mayOpen && open.confirming && (
          <OpenServiceConfirmation
            actor={actor} role={role}
            opening={open.opening} error={open.error}
            onConfirm={open.confirm} onCancel={open.cancel}
          />
        )}
      </section>
    </main>
  );
}

const shell = {
  minHeight: '100vh', background: '#080808', color: '#fff', padding: 20,
  fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const panel = { background: '#141414', border: '1px solid #2c2c2c', borderRadius: 16, padding: 22 };
const eyebrow = { color: '#f97316', fontWeight: 800, letterSpacing: 2, fontSize: 11, margin: 0 };
