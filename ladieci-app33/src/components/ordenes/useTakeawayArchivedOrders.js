import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';

// LISTOS_ARCHIVADOS_V1 -- authoritative source for completed Recogida/Domicilio
// orders of the CURRENT service session, backed by the backend's
// getOrdenesArchivadosSesion (session-scoped, terminal-state-only read,
// mirroring getOrdenes' own session-scoping). Independent of, and much less
// frequently refreshed than, ServicioPage's realtime-driven `ordenes` state --
// that one intentionally drops RETIRADO rows the moment its own active-state
// query excludes them; this hook exists precisely so Archivados does not
// depend on that transient snapshot and survives a poll/refresh/reload.
//
// Owned by ListosUnificado only (mirrors useMesaReadyCommands' single-owner
// convention) -- do not call this a second time from a sibling component.
export function useTakeawayArchivedOrders({ refreshKey = 0 } = {}) {
  const [archivedOrdenes, setArchivedOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const res = await api.getOrdenesArchivadosSesion();
      if (res && res.error) {
        setError(res.error);
      } else {
        setArchivedOrdenes(res.ordenes || []);
        setError('');
      }
    } catch (err) {
      setError('No se pudo cargar el archivo.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    const timer = setInterval(() => load({ quiet: true }), 15000);
    return () => clearInterval(timer);
  }, [load]);

  return { archivedOrdenes, loading, error };
}
