// ===============================================================
// StaleTableRecovery.jsx — PREVIOUS_SERVICE_OPEN_TABLE_RECOVERY (2026-09-18)
//
// THE bridge for the one recovery deadlock the 2026-09-18 staging promotion
// hit: PREVIOUS_SERVICE_PENDING can block on an open table_session, but the
// entire operational shell (Mesa included) is replaced by the exception
// screen while the previous service is unresolved, so the table that blocks
// the close could never be reached. See
// PREVIOUS_SERVICE_OPEN_TABLE_RECOVERY_FIX_2026-09-18.md.
//
// This is NOT a second Mesa implementation. It reuses:
//   - mesaApi.floor() — the exact canonical read TabMesa itself calls;
//   - MesaWorkspace — the exact canonical per-table surface (Ver cuenta /
//     Cerrar mesa / Nueva comanda) TabMesa mounts for an occupied table.
// The ONLY new behaviour is the bound: allowIntake={false} hides "Nueva
// comanda" / "Añadir artículos" (TabMesa.jsx), so this surface can resolve
// the blocking table (pay, close) but can never add a new order to a
// service that belongs to a past Business Day. No other table is reachable
// from here — there is no floor map, no dock, no reservations agenda, no
// editing mode: only the one table_session_id the caller names.
//
// Identity: mesaApi's write actions (closeTable/pay/markServed/refund/
// adjust — mesaService.js on the backend) are keyed by tableSessionId and
// workspaceId alone, never by "the current operational service". A wrong
// or already-resolved tableSessionId simply matches no open session in
// mesaApi.floor()'s response, so this component can never open or modify
// a different table than the one the blocker named.
// ===============================================================

import { useCallback, useEffect, useState } from 'react';
import { mesaApi, describeMesaError } from '../../mesa/mesaApi';
import { MesaWorkspace, mesaCss, canManageMesaReservations, canRefundMesaPayment, canAdjustMesaObligation } from '../mesa/TabMesa';
import * as MS from '../ui/mesaSurface';

export default function StaleTableRecovery({ tableSessionId, role, onClose }) {
  const [tables, setTables] = useState(null); // null = still loading
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoadError('');
    try {
      const result = await mesaApi.floor({});
      setTables(result.tables || []);
    } catch (err) {
      setLoadError(describeMesaError(err));
      setTables((prev) => prev || []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const table = (tables || []).find((t) => t.session && t.session.id === tableSessionId) || null;

  if (tables === null) {
    return (
      <div className="mesa-root" data-testid="stale-table-recovery-loading">
        <style>{mesaCss}</style>
        <div style={MS.overlay}>
          <div style={{ ...MS.sheet(360) }}>
            <div style={{ ...MS.sheetBody, textAlign: 'center', color: MS.TEXT.muted, fontSize: 13.5 }}>Cargando mesa…</div>
          </div>
        </div>
      </div>
    );
  }

  if (!table) {
    // The blocker's table_session_id no longer matches an open session —
    // already resolved (by this operator a moment ago, or from elsewhere),
    // or the blocker list was stale. Either way there is nothing left to
    // recover here; never guess and never open a different table.
    return (
      <div className="mesa-root" data-testid="stale-table-recovery-resolved">
        <style>{mesaCss}</style>
        <div style={MS.overlay}>
          <div style={MS.sheet(400)}>
            <div style={MS.sheetHead}>
              <span style={MS.sheetTitle}>Mesa</span>
            </div>
            <div style={MS.sheetBody}>
              <div style={{ ...MS.card(), color: MS.TEXT.body, fontSize: 13.5 }}>
                {loadError || 'Esta mesa ya no tiene cuenta abierta.'}
              </div>
              <button data-testid="stale-table-recovery-back" onClick={onClose}
                style={{ ...MS.button({ tone: 'neutral', full: true }) }}>
                Volver
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mesa-root" data-testid="stale-table-recovery">
      <style>{mesaCss}</style>
      <MesaWorkspace
        key={table.id}
        table={table}
        onClose={onClose}
        onNewCommand={() => {}}
        allowIntake={false}
        onRefresh={() => load({ quiet: true })}
        onPrint={() => {}}
        canManageReservations={canManageMesaReservations(role)}
        canRefund={canRefundMesaPayment(role)}
        canAdjust={canAdjustMesaObligation(role)}
        onViewNight={() => {}}
        draft={null}
        onClearDraft={() => {}}
        onSendToCocina={async () => {}}
        compactCard={false}
      />
    </div>
  );
}
