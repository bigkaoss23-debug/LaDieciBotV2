// OPS-HEALTH-01-FE-BADGE — pill globale salute sistema, fixed top-right.
//
// Politica:
// - silenzioso (no suoni, no notifications) — la "campanella" è già in
//   ServicioPage.jsx (watchdog /health binario), questo badge è il
//   termometro composito.
// - click toggle popover con dettaglio dei check.
// - solo dati safe: livello, latency DB, ageMin WA, count ordini, commit
//   short backend, checkedAt ISO. Nessun token, nessuna API key, nessun
//   payload utenti.
// - nessuna dipendenza nuova: usa solo React + hook useOpsHealth.

import { useState } from "react";
import { useOpsHealth } from "../hooks/useOpsHealth";

const COLORS = {
  green:    { bg: "rgba(34,197,94,0.15)",   border: "rgba(34,197,94,0.45)",   text: "#22C55E", dot: "🟢" },
  yellow:   { bg: "rgba(251,191,36,0.15)",  border: "rgba(251,191,36,0.45)",  text: "#fbbf24", dot: "🟡" },
  red:      { bg: "rgba(232,52,28,0.18)",   border: "rgba(232,52,28,0.55)",   text: "#E8341C", dot: "🔴" },
  checking: { bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.25)", text: "rgba(255,255,255,0.7)", dot: "⚫" },
};

const LABELS = {
  green:    "Sistema OK",
  yellow:   "Verifica sistema",
  red:      "Problema servicio",
  checking: "Verificando",
};

function fmtAge(ageMin) {
  if (ageMin == null) return "sin actividad";
  if (ageMin < 1) return "ahora";
  if (ageMin < 60) return `${ageMin}m`;
  return `${Math.floor(ageMin / 60)}h`;
}

function fmtIso(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
  } catch (_) {
    return "—";
  }
}

function checkColor(level) {
  return (COLORS[level] || COLORS.checking).text;
}

const OpsHealthBadge = () => {
  const { level, payload, lastError, lastCheckedAt } = useOpsHealth();
  const [open, setOpen] = useState(false);

  const c = COLORS[level] || COLORS.checking;
  const label = LABELS[level] || LABELS.checking;
  const checks = (payload && payload.checks) || {};

  return (
    <div style={{
      position: "fixed",
      top: 8,
      right: 8,
      zIndex: 100,
      fontFamily: "'DM Sans', sans-serif",
      pointerEvents: "auto",
    }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title={`${c.dot} ${label}${lastError ? " · " + lastError : ""}`}
        style={{
          background: c.bg,
          border: `1px solid ${c.border}`,
          borderRadius: 999,
          padding: "4px 10px",
          color: c.text,
          fontWeight: 700,
          fontSize: 11,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          lineHeight: 1.2,
        }}>
        <span style={{ fontSize: 12 }}>{c.dot}</span>
        <span>{label}</span>
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: 32,
          right: 0,
          minWidth: 240,
          maxWidth: 320,
          background: "rgba(13,13,13,0.96)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10,
          padding: "10px 12px",
          fontSize: 11,
          color: "rgba(255,255,255,0.85)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          lineHeight: 1.5,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: c.text, fontWeight: 800 }}>{c.dot} {label}</span>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>{fmtIso((payload && payload.checkedAt) || (lastCheckedAt && new Date(lastCheckedAt).toISOString()))}</span>
          </div>

          <Row label="Backend"
               value={(checks.backend && checks.backend.ok) ? "OK" : "—"}
               level={(checks.backend && checks.backend.level) || "checking"} />

          <Row label="Base de datos"
               value={
                 checks.database
                   ? (checks.database.ok
                       ? `OK · ${checks.database.latencyMs ?? "?"}ms`
                       : "Sin conexión")
                   : "—"
               }
               level={(checks.database && checks.database.level) || "checking"} />

          <Row label="WhatsApp recibidos"
               value={checks.whatsappInbound
                 ? (checks.whatsappInbound.lastAt
                     ? `hace ${fmtAge(checks.whatsappInbound.ageMin)}`
                     : "sin actividad reciente")
                 : "—"}
               level={(checks.whatsappInbound && checks.whatsappInbound.level) || "checking"} />

          <Row label="WhatsApp procesados"
               value={checks.whatsappProcessed
                 ? (checks.whatsappProcessed.lastAt
                     ? `hace ${fmtAge(checks.whatsappProcessed.ageMin)}`
                     : "sin actividad reciente")
                 : "—"}
               level={(checks.whatsappProcessed && checks.whatsappProcessed.level) || "checking"} />

          <Row label="Pedidos hoy"
               value={checks.ordini
                 ? `${checks.ordini.todayCount ?? 0}${checks.ordini.lastCreatedAt ? " · último " + fmtIso(checks.ordini.lastCreatedAt) : ""}`
                 : "—"}
               level={(checks.ordini && checks.ordini.level) || "checking"} />

          <div style={{
            marginTop: 8, paddingTop: 6,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex", justifyContent: "space-between",
            fontSize: 10, color: "rgba(255,255,255,0.4)"
          }}>
            <span>backend {payload && payload.commit ? payload.commit : "—"}</span>
            <span>uptime {payload && payload.uptimeSec != null ? `${payload.uptimeSec}s` : "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const Row = ({ label, value, level }) => (
  <div style={{
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "3px 0",
  }}>
    <span style={{ color: "rgba(255,255,255,0.55)" }}>{label}</span>
    <span style={{ color: checkColor(level), fontWeight: 600, textAlign: "right" }}>{value}</span>
  </div>
);

export default OpsHealthBadge;
