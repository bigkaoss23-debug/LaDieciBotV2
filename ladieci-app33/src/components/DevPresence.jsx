import { useEffect, useState } from 'react';
import { sb, api } from '../api';

const HEARTBEAT_KEY = "DEV_HEARTBEAT";
const SEND_INTERVAL_MS = 30_000;
const POLL_INTERVAL_MS = 15_000;
const FRESH_WINDOW_MS = 90_000;

// Sender — invisibile, da montare in App.jsx (sempre attivo se ?dev=1)
export function DevHeartbeatSender() {
  useEffect(() => {
    const isDev = new URLSearchParams(window.location.search).get("dev") === "1";
    if (!isDev) return;
    const send = () => {
      api.post({ action: "setConfig", chiave: HEARTBEAT_KEY, valore: String(Date.now()) })
        .catch(e => console.warn("[DevPresence] heartbeat send:", e?.message || e));
    };
    send();
    const id = setInterval(send, SEND_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return null;
}

// Reader — terminale UI, da montare solo dove vuoi che venga visto (ServicioPage)
export default function DevPresence() {
  const [lastBeat, setLastBeat] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    const read = async () => {
      try {
        const rows = await sb.select("config", `chiave=eq.${HEARTBEAT_KEY}`);
        const ts = Number(rows?.[0]?.valore);
        if (alive && Number.isFinite(ts)) setLastBeat(ts);
      } catch (e) { /* silent */ }
    };
    read();
    const id = setInterval(read, POLL_INTERVAL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { alive = false; clearInterval(id); clearInterval(tick); };
  }, []);

  const fresh = lastBeat != null && (now - lastBeat) < FRESH_WINDOW_MS;
  if (!fresh) return null;

  const secsAgo = Math.max(0, Math.floor((now - lastBeat) / 1000));
  const hhmm = new Date(lastBeat).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{
      position: "fixed",
      top: 10, right: 10,
      zIndex: 9998,
      background: "#000",
      border: "1px solid rgba(74,222,128,0.4)",
      borderRadius: 5,
      padding: "3px 7px",
      fontFamily: "'DM Mono', 'Courier New', monospace",
      fontSize: 9.5,
      color: "#4ade80",
      lineHeight: 1.35,
      boxShadow: "0 0 10px rgba(74,222,128,0.13)",
      pointerEvents: "none",
      userSelect: "none"
    }}>
      <style>{`@keyframes devBlink{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      <span style={{
        display: "inline-block",
        width: 5.5, height: 5.5, borderRadius: "50%",
        background: "#4ade80",
        boxShadow: "0 0 5px #4ade80",
        marginRight: 5,
        animation: "devBlink 1.2s infinite"
      }} />
      <span style={{ color: "#4ade80" }}>dev@ladieci</span>
      <span style={{ color: "#22c55e", opacity: .55 }}>:~$ </span>
      <span style={{ color: "#86efac" }}>monitoring</span>
      <span style={{ color: "rgba(74,222,128,0.45)", marginLeft: 5, fontSize: 8.5 }}>
        · {hhmm} · {secsAgo}s
      </span>
    </div>
  );
}
