import { useRef, useState } from 'react';
import { api } from '../../api';
import { setPinStepUp } from '../../operationalSession';
import { PIN_LOGIN_MIN, PIN_LOGIN_MAX } from '../../utils/pinLoginPolicy';
import PinPad from '../ui/PinPad';

// S2-7D6E5 / V3-I — the owner's OWN login PIN, re-verified through the SAME canonical
// PinPad and the SAME 6..12 legacy-compatible range as the operational login
// (utils/pinLoginPolicy.js) — this is literally the same credential class, so it must
// share the bound, not invent its own.
//
// Extracted verbatim from OperationalMenu.jsx (previously a private, non-exported
// `StepUpView`) so it can be reused as THE canonical owner step-up modal from any
// owner-only surface (OperationalMenu's admin-PIN flow AND AccessManagementPage's
// write operations) — one proof format, one UI, no second implementation.
export default function OwnerStepUpView({ onCancel, onVerified, onReauthRequired, title, subtitle }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const submit = async () => {
    // Synchronous double-submit guard — a fast second click must not slip through before
    // the setBusy(true) re-render lands.
    if (busyRef.current) return;
    if (pin.length < PIN_LOGIN_MIN || pin.length > PIN_LOGIN_MAX) return;
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
      // is no weaker fallback. Show WHY before the forced logout actually happens — a
      // controlled logout must never read as a silent, unexplained kick-out.
      setError('Por seguridad, vuelve a iniciar sesión para gestionar los PIN.');
      setTimeout(() => onReauthRequired(), 1400);
      return;
    }
    setError('PIN incorrecto.');
  };

  return (
    <PinPad
      icon="🔒"
      title={title || 'Confirma tu identidad para gestionar los PIN'}
      subtitle={subtitle || 'Introduce tu PIN actual de propietario/administrador'}
      value={pin}
      onChange={(v) => { setError(''); setPin(v); }}
      minLength={PIN_LOGIN_MIN}
      maxLength={PIN_LOGIN_MAX}
      loading={busy}
      loadingLabel="Verificando…"
      error={error}
      submitLabel="Confirmar"
      onSubmit={submit}
      onCancel={onCancel}
    />
  );
}
