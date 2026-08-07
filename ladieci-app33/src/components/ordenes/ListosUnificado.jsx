import { useEffect, useState } from 'react';
import { C, useWidth } from '../../constants';
import { ORDER_STATES } from '../../core/orders';
import TabListos from './TabListos';
import ListosArchivados from './ListosArchivados';
import { WaiterListosView } from '../../waiter/WaiterListos';
import { useMesaReadyCommands } from '../../waiter/useMesaReadyCommands';

// Below this width the two-column Takeaway/Sala layout doesn't fit --
// derived from the same resize-driven useWidth() the rest of the page
// already uses (no user-agent sniffing). Wider than the 520px header-only
// breakpoint on purpose: a 600-680px tablet still has room for the header's
// compact mode but not for two real content columns side by side.
const SALA_COLUMN_BREAKPOINT = 720;

const sectionLabelStyle = {
  fontSize: 11, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.45)', marginBottom: 8,
};

// LISTOS_UNIFICADO_V1 -- one page, three explicit filters over two
// independently-sourced queues:
//   - Takeaway (Recogida/Domicilio): TabListos, completely unchanged logic
//     (own props/onRetirado/onVolverACocina/onCambiaPago), only its inline
//     Retirado rendering is suppressed here (hideRetirados) since completed
//     orders now live in the single Archivados row instead.
//   - Sala: Mesa comandas ready to be carried to the table, reusing
//     WaiterListosView (presentational only, shared with the future Waiter
//     Mode) fed by ONE useMesaReadyCommands() instance owned here. Never
//     call useMesaReadyCommands a second time from a sibling -- see that
//     hook's header comment for why.
// The two surfaces share this page but never share actions/endpoints: Sala's
// only mutation is mesaApi.markServed() (via the hook); TabListos keeps its
// own onRetirado/onVolverACocina/onCambiaPago wired exactly as before.
// "Todo" is not a third data source -- it is just both of the above shown
// together; Sala and Takeaway stay logically independent underneath.
const ListosUnificado = ({
  ordenes, onRetirado, onVolverACocina, onOpenTicket, loadingIds, waMsgs, onViewChat, onCambiaPago, vipIds,
  notify, refreshKey, onSalaCountChange, listosN,
}) => {
  const { readyRows, servedRows, loading, error, busyId, markServed } = useMesaReadyCommands({ notify, refreshKey });
  const width = useWidth();
  const isPhone = width < SALA_COLUMN_BREAKPOINT;
  const [filter, setFilter] = useState('todo'); // 'todo' | 'sala' | 'takeaway'

  const salaCount = readyRows.length;
  const takeawayCount = listosN;
  const todoCount = salaCount + takeawayCount;
  const hasSala = salaCount > 0;

  useEffect(() => { onSalaCountChange?.(salaCount); }, [salaCount, onSalaCountChange]);

  // Archivados: completed items only, distinguished by type but never
  // counted towards the active badges above.
  const retiradosTakeaway = ordenes.filter(o => !o.table_session_id && o.estado === ORDER_STATES.RETIRADO);

  const takeawayColumn = <TabListos
    ordenes={ordenes} onRetirado={onRetirado} onVolverACocina={onVolverACocina}
    onOpenTicket={onOpenTicket} loadingIds={loadingIds} waMsgs={waMsgs}
    onViewChat={onViewChat} onCambiaPago={onCambiaPago} vipIds={vipIds}
    hideRetirados
  />;

  const salaColumn = (
    <div className="listos-sala-column">
      <div style={sectionLabelStyle}>Sala</div>
      <WaiterListosView loading={loading} error={error} readyRows={readyRows} busyId={busyId} onServed={markServed} />
    </div>
  );

  const FILTERS = [
    { id: 'todo', label: 'Todo', n: todoCount },
    { id: 'sala', label: 'Sala', n: salaCount },
    { id: 'takeaway', label: 'Takeaway', n: takeawayCount },
  ];

  const filterBar = (
    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
      {FILTERS.map((f) => (
        <button
          key={f.id}
          onClick={() => setFilter(f.id)}
          style={{
            flex: 1, padding: '10px 12px', borderRadius: 10, fontWeight: 800, fontSize: 13,
            cursor: 'pointer', border: `1.5px solid ${filter === f.id ? C.verde : 'rgba(255,255,255,0.18)'}`,
            background: filter === f.id ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.04)',
            color: '#fff',
          }}>
          {f.label} ({f.n})
        </button>
      ))}
    </div>
  );

  let body;
  if (filter === 'sala') {
    body = salaColumn;
  } else if (filter === 'takeaway') {
    body = takeawayColumn;
  } else if (isPhone) {
    // Phone Todo: stacked, never a squeezed side-by-side. Skip an empty
    // Sala block entirely rather than wasting vertical space on it.
    body = (
      <div>
        {takeawayColumn}
        {hasSala && <div style={{ marginTop: 16 }}>{salaColumn}</div>}
      </div>
    );
  } else {
    // Desktop/tablet Todo: adaptive two columns. An empty Sala collapses
    // away instead of reserving half the screen for nothing.
    body = (
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: hasSala ? '1 1 60%' : '1 1 100%', minWidth: 0 }}>{takeawayColumn}</div>
        {hasSala && <div style={{ flex: '1 1 40%', minWidth: 0 }}>{salaColumn}</div>}
      </div>
    );
  }

  return (
    <div>
      {filterBar}
      {body}
      <ListosArchivados retiradosTakeaway={retiradosTakeaway} servedSala={servedRows} />
    </div>
  );
};

export default ListosUnificado;
