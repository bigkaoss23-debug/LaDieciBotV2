import { useEffect } from "react";
import { mesaCss } from "../components/mesa/TabMesa";
import { useMesaReadyCommands } from "./useMesaReadyCommands";
import {
  formatItemExtrasLabel,
  formatItemRemovedLabel,
  resolveItemNote,
  resolveItemProductNames,
} from "../menu/itemDisplay";

// Pure presentational view over Mesa's ready-to-serve queue. Exported
// separately so the Listos-unificado "Sala" column (ServicioPage) can render
// the exact same cards from a SINGLE useMesaReadyCommands() instance it
// already owns, instead of importing this file's default export and
// starting a second poll/chime for the same data (see useMesaReadyCommands.js
// header comment).
export function WaiterListosView({ loading, error, readyRows, busyId, onServed }) {
  if (loading) return <div className="mesa-root"><style>{mesaCss}</style><div className="mesa-banner">Cargando comandas listas…</div></div>;

  return <div className="mesa-root"><style>{mesaCss}</style>
    {error && <div className="mesa-banner mesa-error" style={{ marginBottom: 12 }}>{error}</div>}
    {readyRows.length === 0
      ? <div className="mesa-banner">Ninguna comanda de mesa lista todavía.</div>
      : readyRows.map(({ table, command }) => (
        <div key={command.id} className="mesa-row" style={{ alignItems: "flex-start", padding: "14px 4px" }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: 16 }}>Mesa {table.number} · #{command.commandNumber}</div>
            <div className="mesa-muted" style={{ marginTop: 3, display: "flex", flexDirection: "column", gap: 2 }}>
              {(command.items || []).length === 0
                ? "0 productos"
                : command.items.map((item, idx) => {
                    const names = resolveItemProductNames(item);
                    const extrasLabel = formatItemExtrasLabel(item);
                    const removedLabel = formatItemRemovedLabel(item);
                    const note = resolveItemNote(item);
                    const qty = Number(item.q) || 1;
                    return (
                      <span key={idx}>
                        <span>{qty > 1 ? `${qty}× ` : ""}{names.primary}</span>
                        {names.secondary && <span style={{ display: "block", paddingLeft: 14, fontSize: 11, opacity: 0.75 }}>{names.secondary}</span>}
                        {extrasLabel && <span style={{ display: "block", paddingLeft: 14, fontSize: 11, color: "#FDBA74" }}>+ {extrasLabel}</span>}
                        {removedLabel && <span style={{ display: "block", paddingLeft: 14, fontSize: 11, color: "#FCA5A5" }}>{removedLabel}</span>}
                        {note && <span style={{ display: "block", paddingLeft: 14, fontSize: 11, color: "#FDE68A" }}>📝 {note}</span>}
                      </span>
                    );
                  })}
            </div>
            <div className="mesa-muted" style={{ marginTop: 3, fontSize: 11 }}>{command.time || "ahora"}{command.note ? ` · "${command.note}"` : ""}</div>
          </div>
          <button className="mesa-btn green" disabled={busyId === command.id} onClick={() => onServed(table, command.id)}>
            {busyId === command.id ? "…" : "✓ Servida"}
          </button>
        </div>
      ))}
  </div>;
}

// Table-ready comandas for the waiter shell. Deliberately built on the SAME
// mesaApi.floor() polling contract and the SAME hasReadyOrder() predicate
// TabMesa's own ready-pulse uses (both consumed via useMesaReadyCommands,
// not reimplemented here) so this list and the floor's pulsing green border
// can never drift into disagreeing about which tables are "ready".
//
// This is intentionally NOT a reskin of the existing TabListos (which shows
// WhatsApp/Tel/Barra pickup orders, i.e. table_session_id IS NULL) -- a
// table-service waiter's "Listos" is about THEIR tables, which live in an
// entirely different part of the data model (table.session.commands, not
// the ordenes list). Reusing TabListos here would have meant showing a
// waiter a queue of orders that were never theirs to serve.
export default function WaiterListos({ notify, onCountChange, refreshKey = 0 }) {
  const { readyRows, loading, error, busyId, markServed } = useMesaReadyCommands({ notify, refreshKey });

  useEffect(() => { onCountChange?.(readyRows.length); }, [readyRows.length, onCountChange]);

  return <WaiterListosView
    loading={loading}
    error={error}
    readyRows={readyRows}
    busyId={busyId}
    onServed={markServed}
  />;
}
