// ─── ACCOUNT APP (customer-facing) ──────────────────────────────────────────
// S2-7C2. Minimal, professional account surface: Accedi / Crea account / Password
// dimenticata, plus email-confirmation and password-recovery landings. Rendered by
// index.js ONLY for the /cuenta route or a Supabase auth-callback landing at root —
// the operator PIN app is never touched.
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PASSWORD_MIN,
  validatePassword,
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

const POLICY_TEXT = `Minimo ${PASSWORD_MIN} caratteri, con lettere e numeri.`;

function policyError(code) {
  switch (code) {
    case 'too_short': return `La password deve avere almeno ${PASSWORD_MIN} caratteri.`;
    case 'need_letter': return 'La password deve contenere almeno una lettera.';
    case 'need_digit': return 'La password deve contenere almeno un numero.';
    default: return 'Password non valida.';
  }
}

// Map a Supabase auth error to a neutral, non-secret Italian message.
function friendlyAuthError(error) {
  const msg = (error && (error.message || error.error_description || error.error)) || '';
  const m = String(msg).toLowerCase();
  if (m.includes('invalid login')) return 'Email o password non corretti.';
  if (m.includes('email not confirmed')) return 'Devi prima confermare l’email.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Esiste già un account con questa email.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Troppi tentativi. Riprova tra qualche minuto.';
  if (m.includes('weak') || m.includes('password')) return policyError('too_short');
  return 'Si è verificato un errore. Riprova.';
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

export default function AccountApp() {
  const init = useMemo(initialViewFromUrl, []);
  const [view, setView] = useState(init.view);

  // Remove all auth query/hash params from the visible URL after the callback is
  // processed — tokens, error fragments and recovery params must not linger in the
  // address bar or history. CRITICAL ORDERING: we strip only AFTER Supabase has
  // consumed the URL (detectSessionInUrl runs async and needs the hash to establish
  // the recovery/confirm session). We wait for the first auth event, then replace;
  // a short fallback covers the invalid-link case (no session, so no auth event).
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
      const supabase = getAccountClient(); // starts detectSessionInUrl on the callback URL
      const r = supabase.auth.onAuthStateChange(() => strip());
      sub = r && r.data && r.data.subscription;
    } catch (_) { /* noop */ }
    const t = setTimeout(strip, 1500); // fallback: invalid/expired link never fires an auth event
    return () => { clearTimeout(t); if (sub && sub.unsubscribe) sub.unsubscribe(); };
  }, [init.view]);

  const goHome = useCallback(() => setView('home'), []);

  return (
    <div className="ld-acc-root">
      <StyleTag />
      <div className="ld-acc-card">
        <div className="ld-acc-brand">La Dieci · Account</div>

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
      Questo è l’accesso <strong>cliente</strong>. L’accesso operativo con PIN è
      separato: <a href="/" className="ld-acc-link">apri l’app operativa</a>.
    </p>
  );
}

function HomeView({ setView }) {
  return (
    <div>
      <h1 className="ld-acc-h1">Il tuo account</h1>
      <p className="ld-acc-sub">Accedi o crea un nuovo account cliente.</p>
      <button className="ld-acc-btn" onClick={() => setView('login')}>Accedi</button>
      <button className="ld-acc-btn ld-acc-btn-secondary" onClick={() => setView('signup')}>Crea account</button>
      <button className="ld-acc-linkbtn" onClick={() => setView('forgot')}>Password dimenticata</button>
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
    if (!validateEmail(email)) { setErr('Inserisci un’email valida.'); return; }
    const v = validatePassword(pw);
    if (!v.ok) { setErr(policyError(v.code)); return; }
    if (pw !== pw2) { setErr('Le due password non coincidono.'); return; }
    setBusy(true);
    const { error } = await accountSignUp(email, pw);
    setBusy(false);
    if (error) { setErr(friendlyAuthError(error)); return; }
    setDone(true);
  };

  if (done) {
    return (
      <div>
        <h1 className="ld-acc-h1">Account creato</h1>
        <p className="ld-acc-ok">Controlla la tua email per confermare l’account.</p>
        <button className="ld-acc-btn ld-acc-btn-secondary" onClick={() => setView('home')}>Torna all’inizio</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="ld-acc-h1">Crea account</h1>
      <label className="ld-acc-label">Email
        <input className="ld-acc-input" type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="ld-acc-label">Password
        <input className="ld-acc-input" type="password" autoComplete="new-password" value={pw}
          onChange={(e) => setPw(e.target.value)} />
      </label>
      <label className="ld-acc-label">Conferma password
        <input className="ld-acc-input" type="password" autoComplete="new-password" value={pw2}
          onChange={(e) => setPw2(e.target.value)} />
      </label>
      <p className="ld-acc-policy">{POLICY_TEXT}</p>
      {err && <p className="ld-acc-err">{err}</p>}
      <button className="ld-acc-btn" type="submit" disabled={busy}>{busy ? 'Attendere…' : 'Crea account'}</button>
      <button className="ld-acc-linkbtn" type="button" onClick={() => setView('home')}>Indietro</button>
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
    if (!validateEmail(email)) { setErr('Inserisci un’email valida.'); return; }
    if (!pw) { setErr('Inserisci la password.'); return; }
    setBusy(true);
    const { error } = await accountSignIn(email, pw);
    setBusy(false);
    if (error) { setErr(friendlyAuthError(error)); return; }
    setView('account');
  };

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="ld-acc-h1">Accedi</h1>
      <label className="ld-acc-label">Email
        <input className="ld-acc-input" type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="ld-acc-label">Password
        <input className="ld-acc-input" type="password" autoComplete="current-password" value={pw}
          onChange={(e) => setPw(e.target.value)} />
      </label>
      {err && <p className="ld-acc-err">{err}</p>}
      <button className="ld-acc-btn" type="submit" disabled={busy}>{busy ? 'Attendere…' : 'Accedi'}</button>
      <button className="ld-acc-linkbtn" type="button" onClick={() => setView('forgot')}>Password dimenticata</button>
      <button className="ld-acc-linkbtn" type="button" onClick={() => setView('home')}>Indietro</button>
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
    if (!validateEmail(email)) { setErr('Inserisci un’email valida.'); return; }
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
        <h1 className="ld-acc-h1">Controlla l’email</h1>
        <p className="ld-acc-ok">Se esiste un account con questa email, riceverai un link per reimpostare la password.</p>
        <button className="ld-acc-btn ld-acc-btn-secondary" onClick={() => setView('home')}>Torna all’inizio</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="ld-acc-h1">Password dimenticata</h1>
      <p className="ld-acc-sub">Inserisci la tua email: ti invieremo un link per reimpostare la password.</p>
      <label className="ld-acc-label">Email
        <input className="ld-acc-input" type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </label>
      {err && <p className="ld-acc-err">{err}</p>}
      <button className="ld-acc-btn" type="submit" disabled={busy}>{busy ? 'Attendere…' : 'Invia link'}</button>
      <button className="ld-acc-linkbtn" type="button" onClick={() => setView('home')}>Indietro</button>
    </form>
  );
}

function RecoveryView({ setView }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const v = validatePassword(pw);
    if (!v.ok) { setErr(policyError(v.code)); return; }
    if (pw !== pw2) { setErr('Le due password non coincidono.'); return; }
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
        <h1 className="ld-acc-h1">Password aggiornata</h1>
        <p className="ld-acc-ok">La tua password è stata aggiornata. Accedi con la nuova password.</p>
        <button className="ld-acc-btn" onClick={() => setView('login')}>Accedi</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="ld-acc-h1">Nuova password</h1>
      <label className="ld-acc-label">Nuova password
        <input className="ld-acc-input" type="password" autoComplete="new-password" value={pw}
          onChange={(e) => setPw(e.target.value)} />
      </label>
      <label className="ld-acc-label">Conferma nuova password
        <input className="ld-acc-input" type="password" autoComplete="new-password" value={pw2}
          onChange={(e) => setPw2(e.target.value)} />
      </label>
      <p className="ld-acc-policy">{POLICY_TEXT}</p>
      {err && <p className="ld-acc-err">{err}</p>}
      <button className="ld-acc-btn" type="submit" disabled={busy}>{busy ? 'Attendere…' : 'Aggiorna password'}</button>
    </form>
  );
}

function ConfirmedView({ setView }) {
  return (
    <div>
      <h1 className="ld-acc-h1">Email confermata</h1>
      <p className="ld-acc-ok">Il tuo account è stato confermato. Ora puoi accedere.</p>
      <button className="ld-acc-btn" onClick={() => setView('account')}>Vai al mio account</button>
      <button className="ld-acc-linkbtn" onClick={() => setView('login')}>Accedi</button>
    </div>
  );
}

function LinkErrorView({ setView }) {
  return (
    <div>
      <h1 className="ld-acc-h1">Link non valido</h1>
      <p className="ld-acc-err">Il link è scaduto o non è più valido. Richiedine uno nuovo.</p>
      <button className="ld-acc-btn" onClick={() => setView('forgot')}>Richiedi un nuovo link</button>
      <button className="ld-acc-linkbtn" onClick={() => setView('home')}>Torna all’inizio</button>
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

  if (state.loading) return <p className="ld-acc-sub">Caricamento…</p>;
  if (state.unauth) {
    return (
      <div>
        <h1 className="ld-acc-h1">Sessione scaduta</h1>
        <p className="ld-acc-err">Accedi di nuovo per continuare.</p>
        <button className="ld-acc-btn" onClick={() => setView('login')}>Accedi</button>
      </div>
    );
  }
  if (state.error) {
    return (
      <div>
        <h1 className="ld-acc-h1">Errore</h1>
        <p className="ld-acc-err">Impossibile caricare l’account. Riprova.</p>
        <button className="ld-acc-btn ld-acc-btn-secondary" onClick={load}>Riprova</button>
        <button className="ld-acc-linkbtn" onClick={logout}>Esci</button>
      </div>
    );
  }

  const me = state.me || {};
  const summary = summarizeAccount(me);
  const noWorkspace = summary.noWorkspace;
  const noAccess = summary.noAccess;

  return (
    <div>
      <h1 className="ld-acc-h1">Il mio account</h1>
      <ul className="ld-acc-list">
        <li>
          <span className="ld-acc-k">Email</span>
          <span className={me.emailVerified ? 'ld-acc-badge ok' : 'ld-acc-badge warn'}>
            {me.emailVerified ? 'verificata' : 'non verificata'}
          </span>
        </li>
        <li>
          <span className="ld-acc-k">Spazio di lavoro</span>
          <span className="ld-acc-v">{noWorkspace ? 'Nessuno spazio di lavoro assegnato' : `${me.memberships.length} assegnato/i`}</span>
        </li>
        <li>
          <span className="ld-acc-k">Accesso La Dieci</span>
          <span className="ld-acc-v">{noAccess ? 'Nessun accesso a La Dieci ancora' : 'Attivo'}</span>
        </li>
      </ul>
      <button className="ld-acc-linkbtn" onClick={logout}>Esci</button>
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
