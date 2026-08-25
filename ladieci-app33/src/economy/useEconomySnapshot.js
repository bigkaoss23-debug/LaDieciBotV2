import { useState, useEffect, useCallback, useMemo } from 'react';
import { economyApi, EconomyApiError } from './economyApi';

// ===============================================================
// useEconomySnapshot — the ONE way this frontend asks for an economic scope.
//
// SMOKE FIX BATCH. Before this hook, Economía's first tab filtered a single
// fixed 35-day ledger fetch client-side. The pills changed which rows were
// summed but never the window the screen SHOWED, so "Día" reported
// `21/07 04:00 → 26/08 04:00` while claiming "Día operativo 25/08". That is
// the bug this hook exists to make impossible: the scope is sent to the
// server, the server resolves the window, and the response's own
// `window.from/to` is the only thing rendered.
//
// NOT A NEW ENGINE. It calls /api/economy/v1/snapshot — the same certified
// I-1 reader the Caja panel already uses, which is also the reader whose
// semantics match the smoke fixtures: receipts are counted by their OWN
// instant (so cash taken today for an older service belongs to today), and
// obligations by theirs.
//
// EVERY WINDOW IS SERVER-RESOLVED. The presets below are exactly the ones
// resolveEconomicWindow() can resolve on its own, plus `personalizado`,
// where the operator supplies real instants. Nothing here computes a
// Madrid 04:00 boundary: that inverse-timezone math lives on the backend
// (economicWindow.madridInstant) and has no client-side equivalent, which is
// precisely why deriving windows in the browser produced the bug above.
// ===============================================================

export const ECONOMY_SCOPES = Object.freeze([
  { key: 'servicio', label: 'Servicio' },
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
  { key: 'mediodia', label: 'Mediodía' },
  { key: 'noche', label: 'Noche' },
  { key: 'personalizado', label: 'Personalizado' },
]);

const ERROR_COPY = {
  ECONOMY_UNAUTHENTICATED: 'Tu sesión ha caducado. Vuelve a entrar.',
  ECONOMY_SESSION_STALE: 'Tu sesión ha caducado. Vuelve a entrar.',
  ECONOMY_READ_FORBIDDEN: 'Tu perfil no tiene acceso a la economía.',
  ECONOMY_WINDOW_NOT_ORDERED: 'El final del período debe ser posterior al inicio.',
  ECONOMY_WINDOW_TOO_WIDE: 'El período seleccionado es demasiado amplio.',
  ECONOMY_WINDOW_FROM_INVALID: 'La fecha de inicio no es válida.',
  ECONOMY_WINDOW_TO_INVALID: 'La fecha de fin no es válida.',
  ECONOMY_SERVICE_SESSION_NOT_FOUND: 'No hay ningún servicio abierto.',
  ECONOMY_NETWORK_ERROR: 'Sin conexión con el servidor.',
};
export const describeEconomyError = (error) => {
  const code = error instanceof EconomyApiError ? error.code : null;
  return (code && ERROR_COPY[code]) || 'No se ha podido cargar la economía.';
};

// A scope is only ever sent once it is complete: `personalizado` with an empty
// input would ask the server to resolve a window the operator has not finished
// describing, and the answer would be rendered as if it were theirs.
export const scopeIsReady = (scope) => {
  if (!scope || !scope.preset) return false;
  if (scope.preset !== 'personalizado') return true;
  return Boolean(scope.from && scope.to);
};

export default function useEconomySnapshot(scope) {
  const [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  // Primitive dependencies, not the object: a caller re-creating an equal
  // scope object on every render must not re-fire the request.
  const preset = scope?.preset || 'hoy';
  const from = scope?.from || null;
  const to = scope?.to || null;
  const ready = scopeIsReady(scope);

  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    // The previous answer is dropped the moment the scope changes. Keeping it
    // on screen while a different window loads is exactly the "stale values
    // survived a scope change" defect from the smoke run.
    setSnapshot(null);
    setStatus('loading');
    setError(null);
    economyApi.snapshot(
      preset === 'personalizado' ? { preset, from, to } : { preset },
    )
      .then((payload) => {
        if (cancelled) return;
        setSnapshot(payload);
        setStatus('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(describeEconomyError(e));
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, [preset, from, to, ready, reloadTick]);

  return useMemo(() => ({ snapshot, status, error, reload }), [snapshot, status, error, reload]);
}
