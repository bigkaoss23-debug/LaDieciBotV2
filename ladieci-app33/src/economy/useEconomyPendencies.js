import { useState, useEffect, useMemo, useCallback } from 'react';
import { economyApi, EconomyApiError } from './economyApi';

// ===============================================================
// useEconomyPendencies — the ONE way this frontend asks for the unresolved
// economic exposures ("Pendientes").
//
// It calls GET /api/economy/v1/pendencies — the canonical read-only reader
// (backend Pendencias Slice 1). NOT a new engine and NOT a new calculation:
// the backend derives POR_COBRAR / POR_DEVOLVER from the SAME per-order
// balance every other economic reader already computes, and REQUIERE_REVISION
// for ledger-evidenced money whose target cannot be safely identified.
//
// READ-ONLY. There is no write here and there must never be one: a pendencia
// resolves only because canonical backend economic truth changed, never
// because the operator pressed a button on this screen.
//
// Mirrors useEconomySnapshot's shape (status: loading | ready | error, plus a
// reload) so there is one hook idiom in Economía, not two.
// ===============================================================

const ERROR_COPY = {
  ECONOMY_UNAUTHENTICATED: 'Tu sesión ha caducado. Vuelve a entrar.',
  ECONOMY_SESSION_STALE: 'Tu sesión ha caducado. Vuelve a entrar.',
  ECONOMY_READ_FORBIDDEN: 'Tu perfil no tiene acceso a la economía.',
  ECONOMY_PENDENCIES_DIRECTION_INVALID: 'Filtro no válido.',
  ECONOMY_PENDENCIES_RANGE_INVALID: 'Las fechas del filtro no son válidas.',
  ECONOMY_PENDENCIES_RANGE_NOT_ORDERED: 'El final debe ser posterior al inicio.',
  ECONOMY_NETWORK_ERROR: 'Sin conexión con el servidor.',
};
export const describePendenciesError = (error) => {
  const code = error instanceof EconomyApiError ? error.code : null;
  return (code && ERROR_COPY[code]) || 'No se han podido cargar los pendientes.';
};

// REQUIERE_REVISION reasonCode -> operator-facing Spanish. Raw codes are
// deliberately NOT shown as primary copy (they are backend vocabulary); each
// known code maps to one short, honest phrase. An unknown code falls back to
// a generic "needs review" line rather than leaking the identifier.
const REASON_COPY = {
  ORPHANED_LEDGER_EVENT: 'Movimiento económico sin pedido identificable.',
  MISSING_STABLE_IDENTITY: 'El pedido no tiene una identidad económica fiable.',
  MISSING_TABLE_SESSION: 'No se ha podido resolver la mesa de este pedido.',
  LEGACY_ARCHIVE_NO_STABLE_IDENTITY: 'Registro del archivo histórico sin identidad verificable.',
};
export const describeRevisionReason = (reasonCode) =>
  REASON_COPY[reasonCode] || 'Este registro necesita revisión manual.';

// channel -> short operator label. MESA identity is operational metadata, not
// a customer; the reader already normalizes a Mesa order's customer to null.
const CHANNEL_COPY = {
  MESA: 'Mesa',
  RETIRO: 'Retiro',
  DOMICILIO: 'Domicilio',
  OTRO: 'Otro',
};
export const describeChannel = (channel) => CHANNEL_COPY[channel] || null;

const EMPTY = Object.freeze({
  porCobrar: [], porDevolver: [], requiereRevision: [],
  counts: { porCobrar: 0, porDevolver: 0, requiereRevision: 0 },
});

// Presentation-only totals: summed EXACTLY from the returned canonical items,
// never merged into them and never altering an amount. A null total means the
// group is empty (nothing to add), not "0,00 € owed".
const sumAmounts = (items) => {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return null;
  return Math.round(list.reduce((acc, it) => acc + (Number(it && it.amount) || 0), 0) * 100) / 100;
};

export default function useEconomyPendencies({ q } = {}) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  const query = typeof q === 'string' ? q.trim() : '';

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    economyApi.pendencies({ q: query || undefined })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setStatus('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(describePendenciesError(e));
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, [query, reloadTick]);

  const view = useMemo(() => {
    const src = data && data.ok ? data : EMPTY;
    const porCobrar = Array.isArray(src.porCobrar) ? src.porCobrar : [];
    const porDevolver = Array.isArray(src.porDevolver) ? src.porDevolver : [];
    const requiereRevision = Array.isArray(src.requiereRevision) ? src.requiereRevision : [];
    const counts = src.counts || {
      porCobrar: porCobrar.length,
      porDevolver: porDevolver.length,
      requiereRevision: requiereRevision.length,
    };
    return {
      porCobrar,
      porDevolver,
      requiereRevision,
      counts,
      totals: {
        porCobrar: sumAmounts(porCobrar),
        porDevolver: sumAmounts(porDevolver),
      },
      isEmpty:
        porCobrar.length === 0 && porDevolver.length === 0 && requiereRevision.length === 0,
    };
  }, [data]);

  return useMemo(
    () => ({ ...view, status, error, reload }),
    [view, status, error, reload],
  );
}
