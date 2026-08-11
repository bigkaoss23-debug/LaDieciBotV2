import { useEffect, useRef, useState } from "react";
import { describeMesaError, mesaApi } from "../../mesa/mesaApi";
import { STATUS, tableState, bookedForToday, hasReadyOrder, mesaCss } from "./TabMesa";

// MESA_PHONE_SHELL_01 -- the phone shell's "Lista" tab: same authoritative
// Mesa floor data as Mapa (TabMesa itself), just as a compact list instead
// of a spatial map. Deliberately its own small mesaApi.floor() poll rather
// than a shared instance with TabMesa -- the two are never mounted at the
// same time in the shell (only one shellTab is active), so there is no
// double-poll to dedupe, and every other ServicioPage tab already polls
// independently the same way. What must NOT diverge -- and doesn't, because
// it's the exact same imported code, not a reimplementation -- is the
// status/label logic itself: STATUS/tableState/bookedForToday/hasReadyOrder
// all come straight from TabMesa.jsx.
export default function MesaListaView({ onSelectTable, notify }) {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const load = async (quiet) => {
      if (!quiet) setLoading(true);
      try {
        const result = await mesaApi.floor({ includeInactive: false });
        if (!aliveRef.current) return;
        const active = (result.tables || [])
          .filter((table) => table.active)
          .sort((a, b) => Number(a.number) - Number(b.number));
        setTables(active);
        setError("");
      } catch (err) {
        if (aliveRef.current) setError(describeMesaError(err));
      } finally {
        if (!quiet && aliveRef.current) setLoading(false);
      }
    };
    load(false);
    const timer = setInterval(() => load(true), 10000);
    return () => { aliveRef.current = false; clearInterval(timer); };
  }, []);

  if (loading) return <div className="mesa-root"><style>{mesaCss}</style><div className="mesa-banner">Cargando el plano de mesas…</div></div>;

  return <div className="mesa-root"><style>{mesaCss}</style>
    {error && <div className="mesa-banner mesa-error" style={{ marginBottom: 12 }}>{error}</div>}
    {tables.length === 0
      ? <div className="mesa-banner">No hay mesas activas.</div>
      : tables.map((table) => {
        const todayReservations = bookedForToday(table);
        const state = tableState(table, todayReservations);
        const ready = hasReadyOrder(table);
        // MESA_PHONE_VISUAL_PARITY_V2 -- same reservation fact Mapa's own
        // floor badge shows (bookedForToday.length > 0), independent of
        // Libre/Ocupada -- so an occupied table that's ALSO booked tonight
        // still surfaces that as an extra signal, not silently dropped.
        const hasReservation = todayReservations.length > 0;
        return <button key={table.id} onClick={() => onSelectTable(table.id)} className="mesa-row mesa-row-tap" style={{
          width: "100%", textAlign: "left", cursor: "pointer",
          borderLeft: `4px solid ${state.color}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: 18 }}>Mesa {table.number}</strong>
            <span style={{ color: state.color, fontWeight: 800, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.3 }}>{state.label}</span>
            {hasReservation && <span title="Tiene reserva" aria-label="Tiene reserva" style={{ fontSize: 13 }}>🔖</span>}
            {ready && <span className="mesa-badge" style={{ position: "static", background: "#22C55E", color: "#04210f" }}>Listo</span>}
          </div>
          <span className="mesa-muted">👥 máx {table.capacity ?? "—"}</span>
        </button>;
      })}
  </div>;
}
