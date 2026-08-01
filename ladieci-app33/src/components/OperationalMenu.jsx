import { useEffect, useRef, useState } from 'react';
import { auth, api } from '../api';
import { describeIdentity, ACTOR_LABEL, getPinStepUp, clearPinStepUp } from '../operationalSession';
import { PIN_LENGTH, resolvePinInput, pinInputMessage, PIN_MISMATCH_MESSAGE } from '../account/accountHelpers';
import PinPad from './ui/PinPad';
import OwnerStepUpView from './ownerStepUp/OwnerStepUpView';

// S2-7D3 — persistent operational mini-menu.
//
// Identity comes from the VERIFIED Auth V2 session (token claims / login response mirrored
// into tab storage by api.auth), never from request bodies or non-authoritative flags. The
// menu renders only when a canonical operational token is present.
//
// Owner/admin additionally gets the account entry points that actually exist. If the personal
// account session is absent, those simply open the account login — the operational admin
// token is NEVER treated as a personal-account login.
export default function OperationalMenu({ onLogout, onAccessManagement }) {
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
              {typeof onAccessManagement === 'function' && (
                <button
                  type="button" role="menuitem" style={itemStyle}
                  onClick={() => { setOpen(false); onAccessManagement(); }}
                >
                  Gestión de accesos
                </button>
              )}
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
        <OwnerStepUpView
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

// S2-7D6E5 — new/confirm PIN entry now runs as two SEPARATE PinPad screens (never both
// fields on one screen) — same canonical pad the login and step-up screens use, same
// exact-PIN_LENGTH policy (accountHelpers.js), same weak/mismatch guards as before.
function ManageActorsView({ onCancel, onNeedsStepUp, onOwnerPinChanged }) {
  const [actors, setActors] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState('select'); // 'select' | 'newPin' | 'confirmPin'
  const [target, setTarget] = useState('');
  const [ownerAck, setOwnerAck] = useState(false);
  const [newPin, setNewPin] = useState('');       // committed once screen 1 validates
  const [pinDraft, setPinDraft] = useState('');    // live value bound to whichever pad is open
  const [pinError, setPinError] = useState('');
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
  const targetLabel = (ACTOR_LABEL[target] || target || '').toLowerCase();
  const canContinueFromSelect = !!target && (!isOwnerTarget || ownerAck);

  const goToNewPin = () => {
    if (!canContinueFromSelect) return;
    setPinDraft(''); setPinError('');
    setStep('newPin');
  };

  const submitNewPin = () => {
    const check = resolvePinInput(pinDraft);
    if (!check.ok) { setPinError(pinInputMessage(check.code)); setPinDraft(''); return; }
    setNewPin(pinDraft);
    setPinDraft(''); setPinError('');
    setStep('confirmPin');
  };

  const submitConfirmPin = async () => {
    if (busyRef.current) return;
    if (pinDraft !== newPin) {
      // "Repeat confirmation" — the FIRST PIN is kept, only the confirm attempt resets.
      setPinError(PIN_MISMATCH_MESSAGE);
      setPinDraft('');
      return;
    }
    // The step-up proof is only valid for 10 minutes: check our own bookkeeping BEFORE
    // spending a network round-trip, so an obviously-stale confirmation asks again rather
    // than surfacing the backend's generic failure.
    const proof = getPinStepUp();
    if (!proof) { onNeedsStepUp(); return; }

    busyRef.current = true;
    setBusy(true);
    setPinError('');
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
      setNewPin(''); setPinDraft(''); setOwnerAck(false);
      if (selfChanged) {
        setDone({ selfChanged: true, actor: res.actor });
      } else {
        setDone({ selfChanged: false, actor: res.actor });
        setTarget(''); setStep('select');
      }
      return;
    }

    // The backend collapses every setActorPin failure into one opaque shape by design (no
    // duplicate/stale/policy oracle). We cannot tell "step-up expired" from "PIN rejected"
    // from the response alone — the safe default is to require a fresh confirmation rather
    // than silently retry with a proof that might already be dead.
    clearPinStepUp();
    setPinError('No se pudo guardar el PIN. Vuelve a confirmar tu identidad e inténtalo de nuevo.');
    setNewPin(''); setPinDraft('');
    setTimeout(() => onNeedsStepUp(), 1400);
  };

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

  if (step === 'newPin') {
    return (
      <PinPad
        icon="🔑"
        title={`Nuevo PIN del ${targetLabel}`}
        subtitle={`${PIN_LENGTH} dígitos`}
        value={pinDraft}
        onChange={(v) => { setPinError(''); setPinDraft(v); }}
        minLength={PIN_LENGTH}
        maxLength={PIN_LENGTH}
        error={pinError}
        submitLabel="Continuar"
        onSubmit={submitNewPin}
        onCancel={onCancel}
      />
    );
  }

  if (step === 'confirmPin') {
    return (
      <PinPad
        icon="🔑"
        title="Confirma el nuevo PIN"
        value={pinDraft}
        onChange={(v) => { setPinError(''); setPinDraft(v); }}
        minLength={PIN_LENGTH}
        maxLength={PIN_LENGTH}
        loading={busy}
        loadingLabel="Guardando…"
        error={pinError}
        submitLabel="Guardar"
        onSubmit={submitConfirmPin}
        onCancel={onCancel}
      />
    );
  }

  // step === 'select'
  const inputStyle = {
    width: '100%', height: 48, borderRadius: 10, textAlign: 'left',
    fontSize: 15, fontWeight: 600, appearance: 'none',
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', marginBottom: 10,
  };
  const labelStyle = { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginBottom: 6, textAlign: 'left' };

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
        onChange={(e) => { setTarget(e.target.value); setOwnerAck(false); }}
        disabled={!actors}
        style={inputStyle}
      >
        <option value="">{actors ? 'Selecciona un actor…' : 'Cargando…'}</option>
        {(actors || []).map((a) => (
          <option key={a.actor} value={a.actor}>
            {ACTOR_LABEL[a.actor] || a.actor}{a.active === false ? ' (inactivo)' : ''}
          </option>
        ))}
      </select>

      {isOwnerTarget && (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 4, marginBottom: 14, textAlign: 'left', cursor: 'pointer' }}>
          <input type="checkbox" checked={ownerAck} onChange={(e) => setOwnerAck(e.target.checked)} style={{ marginTop: 3 }} />
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
            Entiendo que estoy cambiando el PIN del propietario y que tendré que iniciar sesión de nuevo.
          </span>
        </label>
      )}

      <button
        type="button"
        onClick={goToNewPin}
        disabled={!canContinueFromSelect}
        style={{
          width: '100%', height: 52, borderRadius: 12,
          background: canContinueFromSelect ? '#F97316' : 'rgba(255,255,255,0.08)',
          color: canContinueFromSelect ? '#fff' : 'rgba(255,255,255,0.35)',
          border: '1px solid rgba(255,255,255,0.1)', fontSize: 15, fontWeight: 800,
          cursor: canContinueFromSelect ? 'pointer' : 'default', marginTop: 4, marginBottom: 10,
        }}
      >
        Continuar
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
