// ─── ACCOUNT APP (customer-facing, Spanish) ─────────────────────────────────
// S2-7C2. Minimal, professional account surface in Spanish: Iniciar sesión /
// Crear cuenta / ¿Olvidaste tu contraseña?, plus email-confirmation and
// password-recovery landings. Rendered by index.js ONLY for the /cuenta route or
// a Supabase auth-callback landing at root — the operator PIN app is never touched.
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PASSWORD_MIN,
  PASSWORD_POLICY_MESSAGE,
  validateNewPassword,
  validateEmail,
  parseAuthCallback,
  accountSignUp,
  accountSignIn,
  accountRequestReset,
  accountUpdatePassword,
  accountSignOut,
  fetchAccountMe,
  summarizeAccount,
} from '../../account/accountApi';
import { getAccountClient } from '../../account/supabaseAccountClient';

const POLICY_TEXT = `Mínimo ${PASSWORD_MIN} caracteres, con letras y números.`;

// A single accurate message for every policy failure (length + composition),
// plus the confirmation-mismatch case. Never claims that only a number, or only
// length, is required.
function policyError(code) {
  if (code === 'mismatch') return 'Las dos contraseñas no coinciden.';
  return PASSWORD_POLICY_MESSAGE;
}

// Map a Supabase auth error to a neutral, non-secret Spanish message. NB: we must
// NOT collapse every error containing the word "password" into a length message —
// only genuine weak/short-password errors map to the policy message; a
// same-as-old-password error gets its own accurate message.
function friendlyAuthError(error) {
  const msg = (error && (error.message || error.error_description || error.error)) || '';
  const code = (error && error.code) || '';
  const m = String(msg).toLowerCase();
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Primero debes confirmar el correo electrónico.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ya existe una cuenta con este correo electrónico.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Vuelve a probar en unos minutos.';
  if (m.includes('different from the old') || m.includes('should be different') || m.includes('same as the old')) {
    return 'La nueva contraseña debe ser distinta de la anterior.';
  }
  if (code === 'weak_password' || m.includes('weak password') || m.includes('should be at least') || m.includes('should contain')) {
    return PASSWORD_POLICY_MESSAGE;
  }
  return 'Se ha producido un error. Inténtalo de nuevo.';
}

function initialViewFromUrl() {
  const cb = parseAuthCallback(
    typeof window !== 'undefined' ? window.location.hash : '',
    typeof window !== 'undefined' ? window.location.search : ''
  );
  if (cb.error) return { view: 'link_error', cb };
  if (cb.type === 'recovery') return { view: 'recovery', cb };
  if (cb.type === 'signup' || cb.type === 'magiclink' || cb.type === 'invite') return { view: 'confirmed', cb };
  return { view: 'home', cb };
}

// Accessible show/hide password field. Default hidden; the toggle is a real
// <button> (keyboard focusable, Enter/Space activatable) with a visible Spanish
// label ("Mostrar"/"Ocultar") as its accessible name and aria-pressed for state.
// Toggling only flips this input's type between password/text — the value is
// never logged or persisted, and autoComplete keeps password managers working.
export function PasswordField({ id, label, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="ld-acc-label">
      <label htmlFor={id}>{label}</label>
      <span className="ld-acc-pwwrap">
        <input
          id={id}
          className="ld-acc-input ld-acc-input-pw"
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
        />
        <button
          type="button"
          className="ld-acc-eye"
          aria-pressed={show}
          onClick={() => setShow((s) => !s)}
        >
          {show ? 'Ocultar' : 'Mostrar'}
        </button>
      </span>
    </div>
  );
}

export default function AccountApp() {
  const init = useMemo(initialViewFromUrl, []);
  const [view, setView] = useState(init.view);

  // Remove all auth query/hash params from the visible URL AFTER the callback is
  // processed. See supabaseAccountClient — detectSessionInUrl runs async and needs
  // the hash to establish the recovery/confirm session, so we strip only once the
  // first auth event fires; a short fallback covers the invalid-link case.
  useEffect(() => {
    if (!(init.view === 'recovery' || init.view === 'confirmed' || init.view === 'link_error')) return;
    let stripped = false;
    const strip = () => {
      if (stripped) return;
      stripped = true;
      try { window.history.replaceState({}, document.title, window.location.pathname); } catch (_) { /* noop */ }
    };
    let sub = null;
    try {
      const supabase = getAccountClient();
      const r = supabase.auth.onAuthStateChange(() => strip());
      sub = r && r.data && r.data.subscription;
    } catch (_) { /* noop */ }
    const t = setTimeout(strip, 1500);
    return () => { clearTimeout(t); if (sub && sub.unsubscribe) sub.unsubscribe(); };
  }, [init.view]);

  return (
    <div className="ld-acc-root">
      <StyleTag />
      <div className="ld-acc-card">
        <div className="ld-acc-brand">La Dieci · Cuenta</div>

        {view === 'home' && <HomeView setView={setView} />}
        {view === 'signup' && <SignupView setView={setView} />}
        {view === 'login' && <LoginView setView={setView} />}
        {view === 'forgot' && <ForgotView setView={setView} />}
        {view === 'account' && <AccountView setView={setView} />}
        {view === 'recovery' && <RecoveryView setView={setView} />}
        {view === 'confirmed' && <ConfirmedView setView={setView} />}
        {view === 'link_error' && <LinkErrorView setView={setView} />}

        <SeparationNote />
      </div>
    </div>
  );
}

function SeparationNote() {
  return (
    <p className="ld-acc-note">
      Este es el acceso de <strong>cliente</strong>. El acceso operativo con PIN es
      distinto: <a href="/" className="ld-acc-link">abre la app operativa</a>.
    </p>
  );
}

function HomeView({ setView }) {
  return (
    <div>
      <h1 className="ld-acc-h1">Tu cuenta</h1>
      <p className="ld-acc-sub">Inicia sesión o crea una cuenta nueva.</p>
      <button className="ld-acc-btn" onClick={() => setView('login')}>Iniciar sesión</button>
      <button className="ld-acc-btn ld-acc-btn-secondary" onClick={() => setView('signup')}>Crear cuenta</button>
      <button className="ld-acc-linkbtn" onClick={() => setView('forgot')}>¿Olvidaste tu contraseña?</button>
    </div>
  );
}

function SignupView({ setView }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!validateEmail(email)) { setErr('Introduce un correo electrónico válido.'); return; }
    const v = validateNewPassword(pw, pw2);
    if (!v.ok) { setErr(policyError(v.code)); return; }
    setBusy(true);
    const { error } = await accountSignUp(email, pw);
    setBusy(false);
    if (error) { setErr(friendlyAuthError(error)); return; }
    setDone(true);
  };

  if (done) {
    return (
      <div>
        <h1 className="ld-acc-h1">Cuenta creada</h1>
        <p className="ld-acc-ok">Revisa tu correo electrónico para confirmar la cuenta.</p>
        <button className="ld-acc-btn ld-acc-btn-secondary" onClick={() => setView('home')}>Volver al inicio</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="ld-acc-h1">Crear cuenta</h1>
      <label className="ld-acc-label" htmlFor="su-email">Correo electrónico
        <input id="su-email" className="ld-acc-input" type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </label>
      <PasswordField id="su-pw" label="Contraseña" value={pw} autoComplete="new-password"
        onChange={(e) => setPw(e.target.value)} />
      <PasswordField id="su-pw2" label="Confirmar contraseña" value={pw2} autoComplete="new-password"
        onChange={(e) => setPw2(e.target.value)} />
      <p className="ld-acc-policy">{POLICY_TEXT}</p>
      {err && <p className="ld-acc-err">{err}</p>}
      <button className="ld-acc-btn" type="submit" disabled={busy}>{busy ? 'Espera…' : 'Crear cuenta'}</button>
      <button className="ld-acc-linkbtn" type="button" onClick={() => setView('home')}>Atrás</button>
    </form>
  );
}

function LoginView({ setView }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!validateEmail(email)) { setErr('Introduce un correo electrónico válido.'); return; }
    if (!pw) { setErr('Introduce la contraseña.'); return; }
    setBusy(true);
    const { error } = await accountSignIn(email, pw);
    setBusy(false);
    if (error) { setErr(friendlyAuthError(error)); return; }
    setView('account');
  };

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="ld-acc-h1">Iniciar sesión</h1>
      <label className="ld-acc-label" htmlFor="li-email">Correo electrónico
        <input id="li-email" className="ld-acc-input" type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </label>
      <PasswordField id="li-pw" label="Contraseña" value={pw} autoComplete="current-password"
        onChange={(e) => setPw(e.target.value)} />
      {err && <p className="ld-acc-err">{err}</p>}
      <button className="ld-acc-btn" type="submit" disabled={busy}>{busy ? 'Espera…' : 'Iniciar sesión'}</button>
      <button className="ld-acc-linkbtn" type="button" onClick={() => setView('forgot')}>¿Olvidaste tu contraseña?</button>
      <button className="ld-acc-linkbtn" type="button" onClick={() => setView('home')}>Atrás</button>
    </form>
  );
}

function ForgotView({ setView }) {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!validateEmail(email)) { setErr('Introduce un correo electrónico válido.'); return; }
    setBusy(true);
    const { error } = await accountRequestReset(email);
    setBusy(false);
    // Neutral confirmation regardless of whether the address exists (no enumeration).
    if (error && /rate limit|too many/i.test(error.message || '')) { setErr(friendlyAuthError(error)); return; }
    setDone(true);
  };

  if (done) {
    return (
      <div>
        <h1 className="ld-acc-h1">Revisa tu correo electrónico</h1>
        <p className="ld-acc-ok">Si existe una cuenta con este correo electrónico, recibirás un enlace para restablecer la contraseña.</p>
        <button className="ld-acc-btn ld-acc-btn-secondary" onClick={() => setView('home')}>Volver al inicio</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="ld-acc-h1">¿Olvidaste tu contraseña?</h1>
      <p className="ld-acc-sub">Introduce tu correo electrónico: te enviaremos un enlace para restablecer la contraseña.</p>
      <label className="ld-acc-label" htmlFor="fp-email">Correo electrónico
        <input id="fp-email" className="ld-acc-input" type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </label>
      {err && <p className="ld-acc-err">{err}</p>}
      <button className="ld-acc-btn" type="submit" disabled={busy}>{busy ? 'Espera…' : 'Enviar enlace'}</button>
      <button className="ld-acc-linkbtn" type="button" onClick={() => setView('home')}>Atrás</button>
    </form>
  );
}

export function RecoveryView({ setView }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const v = validateNewPassword(pw, pw2);
    if (!v.ok) { setErr(policyError(v.code)); return; }
    setBusy(true);
    const { error } = await accountUpdatePassword(pw);
    setBusy(false);
    if (error) { setErr(friendlyAuthError(error)); return; }
    // Force a clean re-login with the new password on all sessions.
    await accountSignOut();
    setDone(true);
  };

  if (done) {
    return (
      <div>
        <h1 className="ld-acc-h1">Contraseña actualizada</h1>
        <p className="ld-acc-ok">Tu contraseña se ha actualizado. Inicia sesión con la nueva contraseña.</p>
        <button className="ld-acc-btn" onClick={() => setView('login')}>Iniciar sesión</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="ld-acc-h1">Nueva contraseña</h1>
      <PasswordField id="rc-pw" label="Nueva contraseña" value={pw} autoComplete="new-password"
        onChange={(e) => setPw(e.target.value)} />
      <PasswordField id="rc-pw2" label="Confirmar nueva contraseña" value={pw2} autoComplete="new-password"
        onChange={(e) => setPw2(e.target.value)} />
      <p className="ld-acc-policy">{POLICY_TEXT}</p>
      {err && <p className="ld-acc-err">{err}</p>}
      <button className="ld-acc-btn" type="submit" disabled={busy}>{busy ? 'Espera…' : 'Guardar nueva contraseña'}</button>
    </form>
  );
}

function ConfirmedView({ setView }) {
  return (
    <div>
      <h1 className="ld-acc-h1">Correo electrónico verificado</h1>
      <p className="ld-acc-ok">Tu cuenta ha sido confirmada. Ya puedes iniciar sesión.</p>
      <button className="ld-acc-btn" onClick={() => setView('account')}>Ir a mi cuenta</button>
      <button className="ld-acc-linkbtn" onClick={() => setView('login')}>Iniciar sesión</button>
    </div>
  );
}

function LinkErrorView({ setView }) {
  return (
    <div>
      <h1 className="ld-acc-h1">Enlace no válido</h1>
      <p className="ld-acc-err">El enlace ha caducado o ya no es válido. Solicita uno nuevo.</p>
      <button className="ld-acc-btn" onClick={() => setView('forgot')}>Solicitar un enlace nuevo</button>
      <button className="ld-acc-linkbtn" onClick={() => setView('home')}>Volver al inicio</button>
    </div>
  );
}

function AccountView({ setView }) {
  const [state, setState] = useState({ loading: true });

  const load = useCallback(async () => {
    setState({ loading: true });
    const r = await fetchAccountMe();
    if (r.status === 401) { setState({ loading: false, unauth: true }); return; }
    if (!r.ok) { setState({ loading: false, error: true }); return; }
    setState({ loading: false, me: r.body });
  }, []);

  useEffect(() => { load(); }, [load]);

  const logout = async () => { await accountSignOut(); setView('home'); };

  if (state.loading) return <p className="ld-acc-sub">Cargando…</p>;
  if (state.unauth) {
    return (
      <div>
        <h1 className="ld-acc-h1">Sesión caducada</h1>
        <p className="ld-acc-err">Vuelve a iniciar sesión para continuar.</p>
        <button className="ld-acc-btn" onClick={() => setView('login')}>Iniciar sesión</button>
      </div>
    );
  }
  if (state.error) {
    return (
      <div>
        <h1 className="ld-acc-h1">Error</h1>
        <p className="ld-acc-err">No se pudo cargar la cuenta. Inténtalo de nuevo.</p>
        <button className="ld-acc-btn ld-acc-btn-secondary" onClick={load}>Reintentar</button>
        <button className="ld-acc-linkbtn" onClick={logout}>Cerrar sesión</button>
      </div>
    );
  }

  const me = state.me || {};
  const summary = summarizeAccount(me);
  const noWorkspace = summary.noWorkspace;
  const noAccess = summary.noAccess;

  return (
    <div>
      <h1 className="ld-acc-h1">Mi cuenta</h1>
      <ul className="ld-acc-list">
        <li>
          <span className="ld-acc-k">Correo electrónico</span>
          <span className={summary.emailVerified ? 'ld-acc-badge ok' : 'ld-acc-badge warn'}>
            {summary.emailVerified ? 'verificado' : 'no verificado'}
          </span>
        </li>
        <li>
          <span className="ld-acc-k">Negocio</span>
          <span className="ld-acc-v">{noWorkspace ? 'Ningún negocio asignado' : `${summary.membershipCount} asignado(s)`}</span>
        </li>
        <li>
          <span className="ld-acc-k">Acceso La Dieci</span>
          <span className="ld-acc-v">{noAccess ? 'Sin acceso a La Dieci' : 'Activo'}</span>
        </li>
      </ul>
      <button className="ld-acc-linkbtn" onClick={logout}>Cerrar sesión</button>
    </div>
  );
}

function StyleTag() {
  return (
    <style>{`
      .ld-acc-root{min-height:100vh;display:flex;align-items:center;justify-content:center;
        background:#0f1115;color:#e8eaed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:24px;box-sizing:border-box;}
      .ld-acc-card{width:100%;max-width:380px;background:#171a21;border:1px solid #262b36;border-radius:14px;padding:28px 24px;box-shadow:0 8px 30px rgba(0,0,0,.35);}
      .ld-acc-brand{font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#8b93a7;margin-bottom:14px;}
      .ld-acc-h1{font-size:22px;margin:0 0 6px;font-weight:600;}
      .ld-acc-sub{font-size:14px;color:#a7adbb;margin:0 0 18px;line-height:1.4;}
      .ld-acc-label{display:block;font-size:13px;color:#c3c9d6;margin:0 0 12px;}
      .ld-acc-input{width:100%;box-sizing:border-box;margin-top:6px;padding:11px 12px;border-radius:9px;border:1px solid #2c3240;background:#0f1218;color:#e8eaed;font-size:15px;outline:none;}
      .ld-acc-input:focus{border-color:#4f7cff;}
      .ld-acc-pwwrap{position:relative;display:block;}
      .ld-acc-input-pw{padding-right:86px;}
      .ld-acc-eye{position:absolute;right:6px;top:calc(50% + 3px);transform:translateY(-50%);
        background:#232838;border:1px solid #2c3240;color:#c3c9d6;font-size:12px;padding:5px 10px;border-radius:7px;cursor:pointer;}
      .ld-acc-eye:focus{outline:2px solid #4f7cff;outline-offset:1px;}
      .ld-acc-policy{font-size:12px;color:#8b93a7;margin:2px 0 14px;}
      .ld-acc-btn{width:100%;padding:12px;border:none;border-radius:9px;background:#4f7cff;color:#fff;font-size:15px;font-weight:600;cursor:pointer;margin:6px 0;}
      .ld-acc-btn:disabled{opacity:.6;cursor:default;}
      .ld-acc-btn-secondary{background:#232838;color:#e8eaed;}
      .ld-acc-linkbtn{width:100%;background:none;border:none;color:#8fa4ff;font-size:14px;cursor:pointer;padding:8px;margin-top:4px;}
      .ld-acc-err{color:#ff8a8a;font-size:13px;margin:6px 0;}
      .ld-acc-ok{color:#7fe0a3;font-size:14px;margin:6px 0 16px;line-height:1.45;}
      .ld-acc-note{font-size:12px;color:#8b93a7;margin:18px 0 0;line-height:1.5;border-top:1px solid #262b36;padding-top:14px;}
      .ld-acc-link,.ld-acc-note a{color:#8fa4ff;text-decoration:none;}
      .ld-acc-list{list-style:none;padding:0;margin:6px 0 16px;}
      .ld-acc-list li{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid #21262f;font-size:14px;}
      .ld-acc-k{color:#a7adbb;}
      .ld-acc-v{color:#e8eaed;text-align:right;}
      .ld-acc-badge{font-size:12px;padding:3px 9px;border-radius:20px;}
      .ld-acc-badge.ok{background:rgba(60,190,120,.15);color:#7fe0a3;}
      .ld-acc-badge.warn{background:rgba(230,170,60,.15);color:#e6c07a;}
    `}</style>
  );
}
