import { useState, useEffect, useCallback, useMemo } from 'react';
import { economyApi, EconomyApiError } from './economyApi';

// ===============================================================
// useEconomySnapshot — the ONE way this frontend asks for an economic scope.
//
// Before this hook, Economía's first tab filtered a single fixed 35-day ledger
// fetch client-side. The pills changed which rows were summed but never the
// window the screen SHOWED, so "Día" reported `21/07 04:00 → 26/08 04:00` while
// claiming "Día operativo 25/08". The scope is now sent to the server, the
// server resolves the window, and the response's own `window.from/to` is the
// only thing rendered.
//
// NOT A NEW ENGINE. It calls /api/economy/v1/snapshot — the same certified I-1
// reader the Caja panel uses, and the one whose semantics match the fixtures:
// receipts count by their OWN instant, obligations by theirs.
//
// EVERY WINDOW IS SERVER-RESOLVED. Nothing here computes a Madrid 04:00
// boundary; that inverse-timezone math lives in economicWindow.madridInstant
// and has no client-side equivalent, which is exactly how the bug happened.
//
// THE PERIOD MODEL IS THREE CONCEPTS, DELIBERATELY NOT FOUR:
//   Business Day      hoy / ayer      — a whole operating day
//   Service Session   servicio + id   — one real persisted service
//   Arbitrary range   personalizado   — explicit instants
// `mediodia` / `noche` are gone. They are arbitrary clock windows that read
// like services without being services, and the product has real service
// sessions to point at instead. The backend still supports them; this client
// deliberately does not offer them.
// ===============================================================

export const ECONOMY_SCOPES = Object.freeze([
  { key: 'hoy', label: 'Hoy' },
  { key: 'servicio', label: 'Servicios' },
  { key: 'ayer', label: 'Ayer' },
  { key: 'personalizado', label: 'Personalizado' },
]);

const ERROR_COPY = {
  ECONOMY_UNAUTHENTICATED: 'Tu sesión ha caducado. Vuelve a entrar.',
  ECONOMY_SESSION_STALE: 'Tu sesión ha caducado. Vuelve a entrar.',
  ECONOMY_READ_FORBIDDEN: 'Tu perfil no tiene acceso a la economía.',
  ECONOMY_WINDOW_NOT_ORDERED: 'El final debe ser posterior al inicio.',
  ECONOMY_WINDOW_TOO_WIDE: 'El período es demasiado amplio.',
  ECONOMY_WINDOW_FROM_INVALID: 'La fecha de inicio no es válida.',
  ECONOMY_WINDOW_TO_INVALID: 'La fecha de fin no es válida.',
  // The one that produced "No se ha podido cargar la economía." on every tap
  // of Servicio: the backend has always required an explicit id for this
  // preset, and the client was sending the preset alone.
  ECONOMY_SERVICE_SESSION_REQUIRED: 'Elige un servicio.',
  ECONOMY_SERVICE_SESSION_NOT_FOUND: 'Ese servicio ya no existe.',
  ECONOMY_NETWORK_ERROR: 'Sin conexión con el servidor.',
};
export const describeEconomyError = (error) => {
  const code = error instanceof EconomyApiError ? error.code : null;
  return (code && ERROR_COPY[code]) || 'No se ha podido cargar la economía.';
};

// A scope is only sent once it is complete. `servicio` without an id and
// `personalizado` without both ends are not questions the server can answer,
// and asking anyway is what turned an unfinished selection into an error
// banner.
export const scopeIsReady = (scope) => {
  if (!scope || !scope.preset) return false;
  if (scope.preset === 'personalizado') return Boolean(scope.from && scope.to);
  if (scope.preset === 'servicio') return Boolean(scope.serviceSessionId);
  return true;
};

// What actually goes on the wire for a scope — one place, so the request can
// never drift from what `scopeIsReady` just approved.
export const scopeToParams = (scope) => {
  if (scope.preset === 'personalizado') return { preset: 'personalizado', from: scope.from, to: scope.to };
  if (scope.preset === 'servicio') return { preset: 'servicio', serviceSessionId: scope.serviceSessionId };
  return { preset: scope.preset };
};

export default function useEconomySnapshot(scope) {
  const [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error | incomplete
  const [error, setError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  // Primitive dependencies, not the object: a caller re-creating an equal scope
  // object on every render must not re-fire the request.
  const preset = scope?.preset || 'hoy';
  const from = scope?.from || null;
  const to = scope?.to || null;
  const serviceSessionId = scope?.serviceSessionId || null;
  const ready = scopeIsReady(scope);

  useEffect(() => {
    // The previous answer is dropped the moment the scope changes — including
    // when the new scope is not answerable yet. Leaving the old figures (and
    // the old resolved range) on screen under a new selection is exactly the
    // "Personalizado shows the previous Noche range" defect.
    setSnapshot(null);
    setError(null);
    if (!ready) { setStatus('incomplete'); return undefined; }
    let cancelled = false;
    setStatus('loading');
    economyApi.snapshot(scopeToParams({ preset, from, to, serviceSessionId }))
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
  }, [preset, from, to, serviceSessionId, ready, reloadTick]);

  return useMemo(() => ({ snapshot, status, error, reload }), [snapshot, status, error, reload]);
}

// ===============================================================
// useServiceSessions — the real, persisted services of a business day.
//
// Read from the day snapshot's own `serviceProvenance`, which the certified
// reader already returns: id, business date, status, opened_at, closed_at. No
// language-guard: allow-legacy PRANZO/CENA are named here only to state that this selector deliberately does NOT classify services that way, not new vocabulary
// new endpoint, no clock-based guessing, and no PRANZO/CENA classification —
// a service is whatever the lifecycle actually persisted.
//
// It lists services that HAVE economic activity in the day window. A service
// with no obligations and no receipts has no economy to inspect, so it does
// not appear; that is the reader's own definition, not an approximation here.
// ===============================================================
export function useServiceSessions(dayPreset = 'hoy') {
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    economyApi.snapshot({ preset: dayPreset })
      .then((payload) => {
        if (cancelled) return;
        const rows = Array.isArray(payload?.serviceProvenance) ? payload.serviceProvenance : [];
        setSessions(
          rows
            .filter((r) => r && r.serviceSessionId)
            // Oldest first: services read as a timeline of the day.
            .slice()
            .sort((a, b) => String(a.openedAt || '').localeCompare(String(b.openedAt || ''))),
        );
        setStatus('ready');
      })
      .catch(() => { if (!cancelled) { setSessions([]); setStatus('error'); } });
    return () => { cancelled = true; };
  }, [dayPreset]);

  return useMemo(() => ({ sessions, status }), [sessions, status]);
}
