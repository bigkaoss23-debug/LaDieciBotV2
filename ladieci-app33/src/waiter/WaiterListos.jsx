import { useCallback, useEffect, useRef, useState } from "react";
import { C } from "../constants";
import { describeMesaError, mesaApi } from "../mesa/mesaApi";
import { hasReadyOrder, mesaCss } from "../components/mesa/TabMesa";
import Suoni from "../sounds";

// Table-ready comandas for the waiter shell. Deliberately built on the SAME
// mesaApi.floor() polling contract and the SAME hasReadyOrder() predicate
// TabMesa's own ready-pulse uses (both imported from TabMesa.jsx, not
// reimplemented here) so this list and the floor's pulsing green border can
// never drift into disagreeing about which tables are "ready" -- exactly the
// "same authoritative source, no duplicate heuristics" requirement.
//
// This is intentionally NOT a reskin of the existing TabListos (which shows
// WhatsApp/Tel/Barra pickup orders, i.e. table_session_id IS NULL) -- a
// table-service waiter's "Listos" is about THEIR tables, which live in an
// entirely different part of the data model (table.session.commands, not
// the ordenes list). Reusing TabListos here would have meant showing a
// waiter a queue of orders that were never theirs to serve.
export default function WaiterListos({ notify, onCountChange, refreshKey = 0 }) {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  // null until the first successful load -- distinguishes "nothing known
  // yet" (never ring) from "known empty" (ring on the next genuinely new
  // ready command).
  const knownReadyRef = useRef(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const result = await mesaApi.floor({});
      const nextTables = result.tables || [];
      setTables(nextTables);
      setError("");

      const readyIds = new Set();
      nextTables.forEach((table) => {
        (table.session?.commands || []).forEach((command) => {
          if (command.state === "LISTO") readyIds.add(command.id);
        });
      });
      // One chime per NEWLY-ready command -- never on the very first load
      // (that would ring for every dish already sitting there before this
      // tab was even opened) and never more than once per transition (no
      // loop: readyIds is diffed against the previous poll, not re-fired
      // every 10s while a command just sits in LISTO).
      if (knownReadyRef.current !== null) {
        let hasNew = false;
        readyIds.forEach((id) => { if (!knownReadyRef.current.has(id)) hasNew = true; });
        if (hasNew) Suoni.mesaListo();
      }
      knownReadyRef.current = readyIds;
      onCountChange?.(readyIds.size);
    } catch (err) {
      setError(describeMesaError(err));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    const timer = setInterval(() => load({ quiet: true }), 10000);
    return () => clearInterval(timer);
  }, [load]);

  const markServed = async (table, commandId) => {
    setBusyId(commandId);
    try {
      await mesaApi.markServed(table.session.id, commandId);
      await load({ quiet: true });
    } catch (err) {
      notify?.(`❌ ${describeMesaError(err)}`, C.rosso);
    } finally {
      setBusyId(null);
    }
  };

  const readyRows = tables
    .filter((table) => table.active && hasReadyOrder(table))
    .flatMap((table) => (table.session.commands || [])
      .filter((command) => command.state === "LISTO")
      .map((command) => ({ table, command })));

  if (loading) return <div className="mesa-root"><style>{mesaCss}</style><div className="mesa-banner">Cargando comandas listas…</div></div>;

  return <div className="mesa-root"><style>{mesaCss}</style>
    {error && <div className="mesa-banner mesa-error" style={{ marginBottom: 12 }}>{error}</div>}
    {readyRows.length === 0
      ? <div className="mesa-banner">Ninguna comanda de mesa lista todavía.</div>
      : readyRows.map(({ table, command }) => (
        <div key={command.id} className="mesa-row" style={{ alignItems: "flex-start", padding: "14px 4px" }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: 16 }}>Mesa {table.number} · #{command.commandNumber}</div>
            <div className="mesa-muted" style={{ marginTop: 3 }}>
              {(command.items || []).map((item) => item.n).filter(Boolean).join(", ") || `${(command.items || []).length} productos`}
            </div>
            <div className="mesa-muted" style={{ marginTop: 3, fontSize: 11 }}>{command.time || "ahora"}{command.note ? ` · "${command.note}"` : ""}</div>
          </div>
          <button className="mesa-btn green" disabled={busyId === command.id} onClick={() => markServed(table, command.id)}>
            {busyId === command.id ? "…" : "✓ Servida"}
          </button>
        </div>
      ))}
  </div>;
}
