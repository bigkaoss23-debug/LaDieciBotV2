import { useEffect, useRef, useState } from 'react';
import { auth, api } from '../api';
import { describeIdentity, ACTOR_LABEL, getPinStepUp, setPinStepUp, clearPinStepUp } from '../operationalSession';
import { PIN_LENGTH, resolvePinInput, pinInputMessage, PIN_MISMATCH_MESSAGE } from '../account/accountHelpers';

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
  const [pinFlowOpen, setPinFlowOpen] = useState(false);
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
                onClick={() => { setOpen(false); setPinFlowOpen(true); }}
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

      {isAdmin && pinFlowOpen && (
        <PinManagementFlow
          onClose={() => setPinFlowOpen(false)}
          onLogout={onLogout}
        />
      )}
    </div>
  );
}

// ── S2-7D6E4 — step-up-gated PIN management ─────────────────────────────────
// Self-contained: never navigates away, never logs the operator out (except after the
// owner changes their OWN PIN, where the current session is genuinely no longer valid).
// The step-up proof lives ONLY in operationalSession's in-memory module state — never
// localStorage, sessionStorage, or a cookie — and is cleared on any logout/session loss.
function PinManagementFlow({ onClose, onLogout }) {
  const existingProof = getPinStepUp();
  const [view, setView] = useState(existingProof ? 'manage' : 'stepup');

  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 10500,
    background: 'rgba(0,0,0,0.93)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 22,
    padding: 20, overflowY: 'auto',
  };

  return (
    <div style={overlayStyle}>
      {view === 'stepup' && (
        <StepUpView
          onCancel={onClose}
          onVerified={() => setView('manage')}
          onReauthRequired={() => { clearPinStepUp(); onLogout(); }}
        />
      )}
      {view === 'manage' && (
        <ManageActorsView
          onCancel={onClose}
          onNeedsStepUp={() => setView('stepup')}
          onOwnerPinChanged={() => { clearPinStepUp(); onLogout(); }}
        />
      )}
    </div>
  );
}

function StepUpView({ onCancel, onVerified, onReauthRequired }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const submit = async () => {
    // Synchronous double-submit guard — a fast second click must not slip through before
    // the setBusy(true) re-render lands.
    if (busyRef.current) return;
    if (pin.length < 4) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    let res;
    try {
      res = await api.verifyOwnPin(pin);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    setPin('');
    if (res && res._ok !== false && res.ok === true && typeof res.stepUpProof === 'string') {
      setPinStepUp(res.stepUpProof, res.expiresInSec);
      onVerified();
      return;
    }
    if (res && res.error === 'LOCKED') {
      const secs = Number(res.retryAfterSec) || 0;
      setError(secs > 0 ? `Demasiados intentos. Espera ${secs}s e inténtalo de nuevo.` : 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
      return;
    }
    if (res && res.error === 'REAUTH_REQUIRED') {
      // This session predates the per-login session id PIN management now requires — there
      // is no weaker fallback. The only fix is a fresh login, so we take it immediately
      // rather than leaving the admin stuck re-entering a PIN that can never succeed here.
      onReauthRequired();
      return;
    }
    setError('PIN incorrecto.');
  };

  return (
    <div style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
      <div style={{ color: '#fff', fontWeight: 800, fontSize: 19, letterSpacing: 0.3 }}>
        Confirma tu identidad para gestionar los PIN
      </div>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 6, marginBottom: 20 }}>
        Introduce tu PIN actual de propietario/administrador
      </div>

      <input
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoFocus
        value={pin}
        onChange={(e) => { setError(''); setPin(e.target.value.replace(/\D/g, '').slice(0, 12)); }}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        disabled={busy}
        style={{
          width: '100%', height: 52, borderRadius: 12, textAlign: 'center',
          fontSize: 22, letterSpacing: 6, fontWeight: 700,
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
          color: '#fff', marginBottom: 14,
        }}
      />

      {busy && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 10 }}>Verificando…</div>}
      {!busy && error && <div style={{ color: '#E8341C', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{error}</div>}

      <button
        type="button"
        onClick={submit}
        disabled={busy || pin.length < 4}
        style={{
          width: '100%', height: 52, borderRadius: 12,
          background: !busy && pin.length >= 4 ? '#F97316' : 'rgba(255,255,255,0.08)',
          color: !busy && pin.length >= 4 ? '#fff' : 'rgba(255,255,255,0.35)',
          border: '1px solid rgba(255,255,255,0.1)', fontSize: 15, fontWeight: 800,
          cursor: busy || pin.length < 4 ? 'default' : 'pointer', marginBottom: 10,
        }}
      >
        Confirmar
      </button>

      <button
        type="button"
        onClick={onCancel}
        style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 13, cursor: 'pointer', padding: '8px 20px' }}
      >
        Cancelar
      </button>
    </div>
  );
}

function ManageActorsView({ onCancel, onNeedsStepUp, onOwnerPinChanged }) {
  const [actors, setActors] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [target, setTarget] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [ownerAck, setOwnerAck] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // { selfChanged, actor } | null
  const busyRef = useRef(false);
  const ownActor = auth.getActor();

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await api.getAuthActors();
      if (!alive) return;
      if (Array.isArray(res)) { setActors(res); return; }
      setLoadError('No se pudo cargar la lista de actores.');
    })();
    return () => { alive = false; };
  }, []);

  const isOwnerTarget = target === 'owner';
  const primary = resolvePinInput(newPin);
  const confirm = resolvePinInput(confirmPin);
  const bothComplete = newPin.length === PIN_LENGTH && confirmPin.length === PIN_LENGTH;
  const matches = bothComplete && newPin === confirmPin;
  const canSubmit = !!target && primary.ok && confirm.ok && matches && (!isOwnerTarget || ownerAck) && !busy;

  const submit = async () => {
    if (busyRef.current || !canSubmit) return;
    // The step-up proof is only valid for 10 minutes: check our own bookkeeping BEFORE
    // spending a network round-trip, so an obviously-stale confirmation asks again rather
    // than surfacing the backend's generic failure.
    const proof = getPinStepUp();
    if (!proof) { onNeedsStepUp(); return; }

    busyRef.current = true;
    setBusy(true);
    setError('');
    let res;
    try {
      res = await api.setActorPin({
        targetActor: target,
        newPin,
        stepUpProof: proof,
        confirmation: isOwnerTarget ? 'CHANGE_OWNER_PIN' : undefined,
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }

    if (res && res._ok !== false && res.ok === true) {
      const selfChanged = res.actor === ownActor;
      setNewPin(''); setConfirmPin(''); setOwnerAck(false);
      if (selfChanged) {
        setDone({ selfChanged: true, actor: res.actor });
      } else {
        setDone({ selfChanged: false, actor: res.actor });
        setTarget('');
      }
      return;
    }

    // The backend collapses every setActorPin failure into one opaque shape by design (no
    // duplicate/stale/policy oracle). We cannot tell "step-up expired" from "PIN rejected"
    // from the response alone — the safe default is to require a fresh confirmation rather
    // than silently retry with a proof that might already be dead.
    clearPinStepUp();
    setError('No se pudo guardar el PIN. Vuelve a confirmar tu identidad e inténtalo de nuevo.');
    setNewPin(''); setConfirmPin('');
    setTimeout(() => onNeedsStepUp(), 1400);
  };

  const inputStyle = {
    width: '100%', height: 48, borderRadius: 10, textAlign: 'center',
    fontSize: 18, letterSpacing: 4, fontWeight: 700,
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', marginBottom: 10,
  };
  const labelStyle = { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginBottom: 6, textAlign: 'left' };

  if (done && done.selfChanged) {
    return (
      <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 18, marginBottom: 10 }}>PIN modificado</div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 24 }}>
          Accede nuevamente con el nuevo PIN.
        </div>
        <button
          type="button"
          onClick={onOwnerPinChanged}
          style={{
            width: '100%', height: 52, borderRadius: 12, background: '#F97316', color: '#fff',
            border: 'none', fontSize: 15, fontWeight: 800, cursor: 'pointer',
          }}
        >
          Entendido
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: 360 }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🔑</div>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>Gestión de PIN</div>
      </div>

      {done && !done.selfChanged && (
        <div style={{ color: '#4ADE80', fontSize: 13, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>
          PIN de {ACTOR_LABEL[done.actor] || done.actor} actualizado.
        </div>
      )}

      {loadError && <div style={{ color: '#E8341C', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{loadError}</div>}

      <div style={labelStyle}>Actor</div>
      <select
        value={target}
        onChange={(e) => { setTarget(e.target.value); setError(''); setOwnerAck(false); }}
        disabled={!actors || busy}
        style={{ ...inputStyle, textAlign: 'left', letterSpacing: 'normal', fontSize: 15, fontWeight: 600, appearance: 'none' }}
      >
        <option value="">{actors ? 'Selecciona un actor…' : 'Cargando…'}</option>
        {(actors || []).map((a) => (
          <option key={a.actor} value={a.actor}>
            {ACTOR_LABEL[a.actor] || a.actor}{a.active === false ? ' (inactivo)' : ''}
          </option>
        ))}
      </select>

      <div style={labelStyle}>Nuevo PIN ({PIN_LENGTH} dígitos)</div>
      <input
        type="password" inputMode="numeric" pattern="[0-9]*"
        value={newPin}
        onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
        disabled={!target || busy}
        style={inputStyle}
      />
      {newPin.length > 0 && !primary.ok && (
        <div style={{ color: '#E8341C', fontSize: 12, marginTop: -6, marginBottom: 10, textAlign: 'left' }}>
          {pinInputMessage(primary.code)}
        </div>
      )}

      <div style={labelStyle}>Confirmar nuevo PIN</div>
      <input
        type="password" inputMode="numeric" pattern="[0-9]*"
        value={confirmPin}
        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
        disabled={!target || busy}
        style={inputStyle}
      />
      {bothComplete && !matches && (
        <div style={{ color: '#E8341C', fontSize: 12, marginTop: -6, marginBottom: 10, textAlign: 'left' }}>
          {PIN_MISMATCH_MESSAGE}
        </div>
      )}

      {isOwnerTarget && (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 4, marginBottom: 14, textAlign: 'left', cursor: 'pointer' }}>
          <input type="checkbox" checked={ownerAck} onChange={(e) => setOwnerAck(e.target.checked)} disabled={busy} style={{ marginTop: 3 }} />
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
            Entiendo que estoy cambiando el PIN del propietario y que tendré que iniciar sesión de nuevo.
          </span>
        </label>
      )}

      {!busy && error && <div style={{ color: '#E8341C', fontSize: 13, fontWeight: 600, marginBottom: 10, textAlign: 'center' }}>{error}</div>}
      {busy && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 10, textAlign: 'center' }}>Guardando…</div>}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        style={{
          width: '100%', height: 52, borderRadius: 12,
          background: canSubmit ? '#F97316' : 'rgba(255,255,255,0.08)',
          color: canSubmit ? '#fff' : 'rgba(255,255,255,0.35)',
          border: '1px solid rgba(255,255,255,0.1)', fontSize: 15, fontWeight: 800,
          cursor: canSubmit ? 'pointer' : 'default', marginTop: 4, marginBottom: 10,
        }}
      >
        Guardar
      </button>

      <button
        type="button"
        onClick={onCancel}
        style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 13, cursor: 'pointer', padding: '8px 0' }}
      >
        Cerrar
      </button>
    </div>
  );
}
