import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AccountApp from './components/account/AccountApp';
import Splash from './components/Splash';
import {
  SURFACE,
  resolveSurface,
  isCallbackProcessed,
  markCallbackProcessed,
  sanitizeCallbackUrl,
  validateOperationalSession,
  operationalLogout,
} from './operationalSession';

// S2-7D3 — ONE authoritative boot gate.
//
// Previously the surface was chosen synchronously from raw URL params:
//     shouldRenderAccount(window.location) ? <AccountApp/> : <App/>
// so a Supabase callback hash beat a valid operational session, and because AccountApp
// captured its view from that URL into useState, the registration-confirmation page stayed
// on screen even after the URL had been cleaned. The callback had no "processed" marker
// either, so it replayed on every reload of that history entry.
//
// Now NOTHING renders until boot resolves: the splash is the only surface on screen while
// the callback decision, the account hydration and the operational session restore +
// server validation all happen behind it. The splash also owns its full animation here, so
// App starts past it — one splash covering all initialisation, never two.
function Boot() {
  const [ready, setReady] = useState(false);       // initialisation finished
  const [splashDone, setSplashDone] = useState(false);
  const [surface, setSurface] = useState(SURFACE.OPERATIONAL);

  useEffect(() => {
    let alive = true;
    (async () => {
      const loc = window.location;
      const decided = resolveSurface(loc, { callbackProcessed: isCallbackProcessed(loc) });

      if (decided === SURFACE.ACCOUNT_CALLBACK) {
        // Consume it exactly once for this tab: a reload must not replay it. AccountApp
        // sanitises the URL once Supabase has read the hash; this marker is what makes the
        // NEXT pass route operationally instead of re-rendering the confirmation.
        markCallbackProcessed(loc);
        if (alive) { setSurface(SURFACE.ACCOUNT_CALLBACK); setReady(true); }
        return;
      }
      if (decided === SURFACE.ACCOUNT) {
        if (alive) { setSurface(SURFACE.ACCOUNT); setReady(true); }
        return;
      }

      // Operational. An already-consumed callback must not linger in history.
      if (isCallbackProcessed(loc)) sanitizeCallbackUrl();

      // Restore + server-validate the operational session. A token invalidated by a PIN
      // rotation or a deactivated actor is dropped here, so the PIN screen appears rather
      // than a half-authenticated app.
      const ok = await validateOperationalSession();
      if (!ok) operationalLogout();
      if (alive) { setSurface(SURFACE.OPERATIONAL); setReady(true); }
    })();
    return () => { alive = false; };
  }, []);

  // The account surfaces run their own boot; hand off as soon as the decision is made so the
  // Supabase callback is not delayed behind the splash animation.
  if (ready && (surface === SURFACE.ACCOUNT || surface === SURFACE.ACCOUNT_CALLBACK)) {
    return <AccountApp />;
  }
  // Operational: hold the splash until BOTH the animation and initialisation are done.
  if (!(ready && splashDone)) return <Splash onDone={() => setSplashDone(true)} />;
  return <App skipSplash />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Boot />);
