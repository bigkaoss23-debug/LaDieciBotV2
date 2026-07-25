import { useEffect, useRef, useState } from 'react';
import { auth } from '../api';
import { describeIdentity } from '../operationalSession';

// S2-7D3 — persistent operational mini-menu.
//
// Identity comes from the VERIFIED Auth V2 session (token claims / login response mirrored
// into tab storage by api.auth), never from request bodies or non-authoritative flags. The
// menu renders only when a canonical operational token is present.
//
// Owner/admin additionally gets the account entry points that actually exist. If the personal
// account session is absent, those simply open the account login — the operational admin
// token is NEVER treated as a personal-account login.
export default function OperationalMenu({ onLogout }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const authed = auth.isAuthenticated();
  const actor = auth.getActor();
  const role = auth.getRole();

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!authed) return null;

  const identity = describeIdentity(actor, role);
  const isAdmin = role === 'admin';
  const initial = (identity || '?').trim().charAt(0).toUpperCase();

  const itemStyle = {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '11px 14px', background: 'transparent', border: 'none',
    color: '#fff', fontSize: 14, cursor: 'pointer', borderRadius: 10,
  };

  return (
    <div ref={boxRef} style={{ position: 'fixed', top: 10, right: 12, zIndex: 10000 }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={identity ? `Menú de ${identity}` : 'Menú operativo'}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 40, height: 40, borderRadius: '50%',
          background: isAdmin ? '#F97316' : 'rgba(255,255,255,0.14)',
          color: isAdmin ? '#000' : '#fff',
          border: '1px solid rgba(255,255,255,0.18)',
          fontWeight: 800, fontSize: 15, cursor: 'pointer',
        }}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 48, right: 0, minWidth: 232,
            background: '#161622', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 14, padding: 8,
            boxShadow: '0 14px 44px rgba(0,0,0,0.65)',
          }}
        >
          {/* verified identity */}
          <div style={{ padding: '10px 14px 12px', borderBottom: '1px solid rgba(255,255,255,0.09)', marginBottom: 6 }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>{identity || 'Sesión operativa'}</div>
            <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, marginTop: 3, letterSpacing: 0.3 }}>
              Sesión operativa activa
            </div>
          </div>

          {isAdmin && (
            <>
              <button
                type="button" role="menuitem" style={itemStyle}
                onClick={() => { setOpen(false); window.location.assign('/cuenta'); }}
              >
                Mi cuenta
              </button>
              <button
                type="button" role="menuitem" style={itemStyle}
                onClick={() => { setOpen(false); window.location.assign('/cuenta?admin_pin=1'); }}
              >
                Gestionar PIN de administrador
              </button>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.09)', margin: '6px 0' }} />
            </>
          )}

          <button
            type="button" role="menuitem"
            style={{ ...itemStyle, color: '#F87171', fontWeight: 700 }}
            onClick={() => { setOpen(false); onLogout(); }}
          >
            Cerrar sesión operativa
          </button>
        </div>
      )}
    </div>
  );
}
