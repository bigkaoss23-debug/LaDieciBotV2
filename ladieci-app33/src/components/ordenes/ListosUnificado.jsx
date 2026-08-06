import { useEffect, useState } from 'react';
import { C, useWidth } from '../../constants';
import TabListos from './TabListos';
import { WaiterListosView } from '../../waiter/WaiterListos';
import { useMesaReadyCommands } from '../../waiter/useMesaReadyCommands';

// Below this width the two-column Recogida/Sala layout doesn't fit --
// derived from the same resize-driven useWidth() the rest of the page
// already uses (no user-agent sniffing). Wider than the 520px header-only
// breakpoint on purpose: a 600-680px tablet still has room for the header's
// compact mode but not for two real content columns side by side.
const SALA_COLUMN_BREAKPOINT = 720;

// Listos unificado (S2-7D4C) -- one page, two independently-sourced queues:
//   - Recogida/Domicilio: TabListos, completely unchanged (own props/logic).
//   - Sala: Mesa comandas ready to be carried to the table, reusing
//     WaiterListosView (presentational only) fed by ONE useMesaReadyCommands()
//     instance owned here. Never call useMesaReadyCommands a second time
//     from a sibling -- see that hook's header comment for why.
// The two surfaces share this page but never share actions/endpoints: Sala's
// only mutation is mesaApi.markServed() (via the hook); TabListos keeps its
// own onRetirado/onVolverACocina/onCambiaPago wired exactly as before.
const ListosUnificado = ({
  ordenes, onRetirado, onVolverACocina, onOpenTicket, loadingIds, waMsgs, onViewChat, onCambiaPago, vipIds,
  notify, refreshKey, onSalaCountChange, listosN,
}) => {
  const { readyRows, loading, error, busyId, markServed } = useMesaReadyCommands({ notify, refreshKey });
  const width = useWidth();
  const isPhone = width < SALA_COLUMN_BREAKPOINT;
  const [phoneView, setPhoneView] = useState('pickup'); // 'pickup' | 'sala'
  const hasSala = readyRows.length > 0;

  useEffect(() => { onSalaCountChange?.(readyRows.length); }, [readyRows.length, onSalaCountChange]);
  // If Sala empties out while the operator was looking at it on phone,
  // fall back to the default queue rather than leaving an empty screen.
  useEffect(() => { if (!hasSala && phoneView === 'sala') setPhoneView('pickup'); }, [hasSala, phoneView]);

  const pickupColumn = <TabListos
    ordenes={ordenes} onRetirado={onRetirado} onVolverACocina={onVolverACocina}
    onOpenTicket={onOpenTicket} loadingIds={loadingIds} waMsgs={waMsgs}
    onViewChat={onViewChat} onCambiaPago={onCambiaPago} vipIds={vipIds}
  />;

  const salaColumn = hasSala && (
    <div className="listos-sala-column">
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.45)', marginBottom: 8,
      }}>
        Sala
      </div>
      <WaiterListosView loading={loading} error={error} readyRows={readyRows} busyId={busyId} onServed={markServed} />
    </div>
  );

  if (isPhone) {
    return (
      <div>
        {hasSala && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              onClick={() => setPhoneView('pickup')}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 10, fontWeight: 800, fontSize: 13,
                cursor: 'pointer', border: `1.5px solid ${phoneView === 'pickup' ? C.verde : 'rgba(255,255,255,0.18)'}`,
                background: phoneView === 'pickup' ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.04)',
                color: '#fff',
              }}>
              Recogida/Domicilio ({listosN})
            </button>
            <button
              onClick={() => setPhoneView('sala')}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 10, fontWeight: 800, fontSize: 13,
                cursor: 'pointer', border: `1.5px solid ${phoneView === 'sala' ? C.verde : 'rgba(255,255,255,0.18)'}`,
                background: phoneView === 'sala' ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.04)',
                color: '#fff',
              }}>
              Sala ({readyRows.length})
            </button>
          </div>
        )}
        {phoneView === 'sala' && hasSala
          ? <div className="listos-sala-column"><WaiterListosView loading={loading} error={error} readyRows={readyRows} busyId={busyId} onServed={markServed} /></div>
          : pickupColumn}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ flex: hasSala ? '1 1 60%' : '1 1 100%', minWidth: 0 }}>{pickupColumn}</div>
      {hasSala && <div style={{ flex: '1 1 40%', minWidth: 0 }}>{salaColumn}</div>}
    </div>
  );
};

export default ListosUnificado;
