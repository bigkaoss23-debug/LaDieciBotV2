// ===============================================================
// OpenServiceConfirmation.jsx — S2-7D5B
//
// THE confirmation surface for opening a service session. Rendered identically
// by the closed-service landing (Servicio) and by the closeout page, so the two
// entry points cannot drift apart again.
//
// It is presentational only: it owns no lock, issues no request, and decides no
// authorization. Everything comes from useOpenServiceController. In-application
// only — window.alert / window.confirm are never used, because a native dialog
// is invisible wherever they are suppressed.
// ===============================================================

import { useEffect, useState } from 'react';

const two = (n) => String(n).padStart(2, '0');

const useNow = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  return now;
};

export const fmtDate = (d) => d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtTime = (d) => `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
// Preview of the day the backend WILL fix in Europe/Madrid at open time. Labelled
// as server-owned so it can never read as an identity the client asserts.
export const localBusinessDate = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

export const ROLE_LABEL = { admin: 'Administrador', operator: 'Operador', rider: 'Repartidor' };
export const roleLabelOf = (role) => ROLE_LABEL[String(role || '').toLowerCase()] || (role || '—');

export function Row({ k, v }) {
  return (
    <>
      <dt style={{ color: '#8a8a8a', fontSize: 12, letterSpacing: 0.4 }}>{k}</dt>
      <dd style={{ margin: 0, color: '#f0f0f0', fontSize: 13, fontWeight: 600 }}>{v}</dd>
    </>
  );
}

export const identityGrid = {
  display: 'grid', gridTemplateColumns: 'minmax(120px,auto) 1fr', gap: '8px 16px',
  margin: 0, alignItems: 'baseline',
};

const primaryBtn = {
  background: '#F97316', border: 'none', borderRadius: 14, padding: '15px 22px',
  color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', letterSpacing: 0.4,
};
const ghostBtn = {
  background: 'transparent', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 14,
  padding: '13px 22px', color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
};

export default function OpenServiceConfirmation({ actor, role, opening, error, onConfirm, onCancel }) {
  const now = useNow();
  return (
    <div data-testid="open-service-confirm" style={{
      marginTop: 22, background: 'rgba(249,115,22,0.08)',
      border: '1px solid rgba(249,115,22,0.4)', borderRadius: 14, padding: 18,
    }}>
      <div style={{ color: '#fb923c', fontWeight: 800, fontSize: 15, marginBottom: 12 }}>
        Abrir un nuevo servicio
      </div>
      <dl style={identityGrid}>
        <Row k="Acción" v="Abrir nuevo servicio" />
        <Row k="Usuario" v={actor || '—'} />
        <Row k="Rol" v={roleLabelOf(role)} />
        <Row k="Fecha y hora" v={`${fmtDate(now)} · ${fmtTime(now)}`} />
        <Row k="Fecha de servicio" v={`${localBusinessDate(now)} (la fija el servidor)`} />
      </dl>
      <p data-testid="open-service-consequence" style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 1.6, margin: '14px 0 0' }}>
        Los nuevos pedidos quedarán vinculados a este servicio.
      </p>

      {error && (
        <div data-testid="open-service-error" role="alert" style={{
          marginTop: 14, background: 'rgba(192,57,43,0.16)', border: '1px solid rgba(192,57,43,0.55)',
          borderRadius: 12, padding: '11px 14px', color: '#ffb4b4', fontSize: 13, fontWeight: 600,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button
          data-testid="open-service-confirm-btn"
          onClick={onConfirm}
          disabled={opening}
          style={{ ...primaryBtn, opacity: opening ? 0.55 : 1, cursor: opening ? 'default' : 'pointer' }}>
          {opening ? 'Abriendo…' : 'Confirmar y abrir servicio'}
        </button>
        <button
          data-testid="open-service-cancel-btn"
          onClick={onCancel}
          disabled={opening}
          style={{ ...ghostBtn, opacity: opening ? 0.55 : 1 }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export { primaryBtn, ghostBtn };
