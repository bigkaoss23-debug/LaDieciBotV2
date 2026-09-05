import { useState, useEffect, useMemo, useCallback } from 'react';
import { economyApi, EconomyApiError } from './economyApi';
import { pendenciesScopeIsReady } from './useEconomyPendencies';

// ===============================================================
// useEconomyCashCounts — the READ side of Control Caja.
//
// It calls GET /api/economy/v1/cash-counts, the canonical history reader. The
// deployed backend (c4d1a14) resolves the scope SERVER-SIDE: hoy | ayer |
// personalizado filter counted_at inside the resolved window; `servicio`
// matches the count's own persisted service_session_id EXACTLY (a legacy
// NULL-attribution row is never fabricated into a service). This hook computes
// no period boundary and no financial figure — `variance` is the backend's own
// stored fact, read as-is.
//
// READ-ONLY. There is no write here. The operational count writer lives with
// the current service (ContarCajaModal), not in Economía.
// ===============================================================

const ERROR_COPY = {
  ECONOMY_UNAUTHENTICATED: 'Tu sesión ha caducado. Vuelve a entrar.',
  ECONOMY_SESSION_STALE: 'Tu sesión ha caducado. Vuelve a entrar.',
  ECONOMY_READ_FORBIDDEN: 'Tu perfil no tiene acceso a la economía.',
  ECONOMY_NETWORK_ERROR: 'Sin conexión con el servidor.',
};
export const describeCashCountsError = (error) => {
  const code = error instanceof EconomyApiError ? error.code : null;
  return (code && ERROR_COPY[code]) || 'No se han podido cargar los conteos.';
};

// A stored variance is in euros in the projected row. "Non-zero" is decided to
// the cent, exactly as the reconciliation gate does it — never recomputed from
// registered − counted (§16/§18): the backend already stored the fact.
const isDiscrepancy = (row) => Math.round((Number(row && row.variance) || 0) * 100) !== 0;

export default function useEconomyCashCounts({
  preset, serviceSessionId, from, to, businessDate,
} = {}) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error | incomplete
  const [error, setError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  const ready = pendenciesScopeIsReady({ preset, serviceSessionId, from, to });
  const scopeKey = `${preset || ''}|${serviceSessionId || ''}|${from || ''}|${to || ''}|${businessDate || ''}`;

  useEffect(() => {
    setData(null);
    setError(null);
    if (!ready) { setStatus('incomplete'); return undefined; }
    let cancelled = false;
    setStatus('loading');
    // Promise.resolve wrapper: a synchronous throw becomes a rejection this
    // .catch handles, rather than an uncaught error in the effect body.
    Promise.resolve().then(() => economyApi.listCashCounts({
      preset: preset || undefined,
      serviceSessionId: preset === 'servicio' ? (serviceSessionId || undefined) : undefined,
      from: preset === 'personalizado' ? (from || undefined) : undefined,
      to: preset === 'personalizado' ? (to || undefined) : undefined,
      businessDate: businessDate || undefined,
    }))
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setStatus('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(describeCashCountsError(e));
        setStatus('error');
      });
    return () => { cancelled = true; };
    // scopeKey folds preset/serviceSessionId/from/to/businessDate into one
    // primitive so an equal-but-new scope object does not re-fire the request.
  }, [scopeKey, ready, reloadTick]);

  return useMemo(() => {
    const counts = data && data.ok && Array.isArray(data.counts) ? data.counts : [];
    const discrepancyCount = counts.filter(isDiscrepancy).length;
    return {
      counts,
      recordCount: counts.length,
      discrepancyCount,
      allClean: counts.length > 0 && discrepancyCount === 0,
      scope: (data && data.scope) || null,
      window: (data && data.window) || null,
      status,
      error,
      reload,
    };
  }, [data, status, error, reload]);
}
