import { useCallback, useEffect, useRef, useState } from "react";
import { C } from "../constants";
import { describeMesaError, mesaApi } from "../mesa/mesaApi";
import { hasReadyOrder } from "../components/mesa/TabMesa";
import Suoni from "../sounds";

// Single authoritative source for "which Mesa comandas are ready to serve
// right now". Extracted out of WaiterListos.jsx (S2-7D4C "Listos unificado")
// so a caller can own ONE polling instance and feed it to more than one
// visual surface (the dynamic Sala column inside Listos, and — unchanged —
// WaiterListos.jsx itself for the future Waiter Mode) without either one
// re-deriving the data or starting a second interval/chime. Call this hook
// from exactly ONE always-mounted-while-relevant component; consumers that
// only need to RENDER the rows should receive them as props, not call this
// hook a second time, or polling/chime duplicate.
export function useMesaReadyCommands({ notify, refreshKey = 0 } = {}) {
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
      // was even mounted) and never more than once per transition.
      if (knownReadyRef.current !== null) {
        let hasNew = false;
        readyIds.forEach((id) => { if (!knownReadyRef.current.has(id)) hasNew = true; });
        if (hasNew) Suoni.mesaListo();
      }
      knownReadyRef.current = readyIds;
    } catch (err) {
      setError(describeMesaError(err));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    const timer = setInterval(() => load({ quiet: true }), 10000);
    return () => clearInterval(timer);
  }, [load]);

  const markServed = useCallback(async (table, commandId) => {
    setBusyId(commandId);
    try {
      await mesaApi.markServed(table.session.id, commandId);
      await load({ quiet: true });
    } catch (err) {
      notify?.(`❌ ${describeMesaError(err)}`, C.rosso);
    } finally {
      setBusyId(null);
    }
  }, [load, notify]);

  const readyRows = tables
    .filter((table) => table.active && hasReadyOrder(table))
    .flatMap((table) => (table.session.commands || [])
      .filter((command) => command.state === "LISTO")
      .map((command) => ({ table, command })));

  return { readyRows, loading, error, busyId, markServed };
}
