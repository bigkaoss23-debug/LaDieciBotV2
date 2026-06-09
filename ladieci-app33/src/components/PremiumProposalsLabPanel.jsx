// src/components/PremiumProposalsLabPanel.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Pannello interno/admin del Premium Planner proposals lab.
//
// Accesso SOLO via deep-link nascosto /premium-proposals (dietro PIN), come
// /shadow-preview. NESSUN bottone/menu operatore punta qui.
//
// READ-ONLY: con flag ON mostra un bottone che chiama l'azione backend live
// `previewStrategicOpportunities` (preview, safety writes:false) con una fixture
// sintetica senza PII, e ne mostra SOLO un summary (proposalContract + proposals[]
// rank/kind/status/timeLabel/zoneLabel + safety + warning/blocker sintetici).
// NON esegue apply, NON crea manual_giros, NON tocca NuevoPedidoModal, NON mostra
// il body grezzo né PII. Se proposals[] manca → "backend contract unavailable"
// (NON si ricostruisce nulla da opportunities[]).
//
// Il flag REACT_APP_PREMIUM_PROPOSALS (default OFF) decide cosa mostrare.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback } from "react";
import { isPremiumProposalsEnabled } from "../featureFlags";
import { fetchPremiumProposals } from "../api/premiumProposals";

const wrap = {
  minHeight: "100vh",
  background: "#0b0b0c",
  color: "#e8e8ea",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  textAlign: "center",
  fontFamily: "system-ui, sans-serif",
};
const card = {
  maxWidth: 560,
  width: "100%",
  border: "1px solid #2a2a2e",
  borderRadius: 12,
  padding: "28px 24px",
  background: "#141416",
};
const backBtn = {
  marginTop: 20,
  padding: "8px 18px",
  borderRadius: 8,
  border: "1px solid #3a3a40",
  background: "transparent",
  color: "#cfcfd4",
  cursor: "pointer",
};
const runBtn = (busy) => ({
  marginTop: 18,
  padding: "9px 18px",
  borderRadius: 8,
  border: "1px solid #3a5a3a",
  background: busy ? "#1a1a1c" : "rgba(124,179,66,0.12)",
  color: busy ? "#6a6a72" : "#9ccc65",
  cursor: busy ? "default" : "pointer",
  fontWeight: 700,
});
const KIND_LABEL = {
  direct: "directa",
  insertion: "en giro",
  alternative: "alternativa",
  not_recommended: "no recomendada",
};

// Estrae SOLO i campi whitelist da un proposal (mai il body grezzo, mai PII).
function safeRow(p) {
  if (!p || typeof p !== "object") return null;
  const s = (v) => (v == null ? "" : String(v));
  return {
    rank: Number.isFinite(p.rank) ? p.rank : null,
    kind: s(p.kind),
    status: s(p.status),
    timeLabel: s(p.timeLabel),
    zoneLabel: s(p.zoneLabel),
    reason: s(p.reason),
  };
}

function errorText(status, data) {
  if (status === 401) return "Sesión expirada. Vuelve a entrar con el PIN.";
  if (status === 403) return "Acceso no permitido para este rol.";
  if (status === 0) return "Error de red. Comprueba la conexión.";
  const code = data && (data.error || (Array.isArray(data.blockers) && data.blockers[0] && data.blockers[0].code));
  return "No se pudo cargar la preview" + (status ? ` (HTTP ${status})` : "") + (code ? ` · ${code}` : "") + ".";
}

export default function PremiumProposalsLabPanel({ onBack }) {
  const enabled = isPremiumProposalsEnabled();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState(null); // summary normalizzato, mai il body grezzo

  const run = useCallback(async () => {
    setLoading(true);
    setError("");
    setView(null);
    const res = await fetchPremiumProposals();
    if (!res.ok) {
      setError(errorText(res.status, res.data));
      setLoading(false);
      return;
    }
    const d = res.data || {};
    // Guardia dura: se proposals[] manca → contract non disponibile. NON si
    // ricostruisce nulla da opportunities[].
    if (!Array.isArray(d.proposals) || typeof d.proposalContract !== "string") {
      setError("backend contract unavailable");
      setLoading(false);
      return;
    }
    const safety = d.safety && typeof d.safety === "object" ? d.safety : {};
    setView({
      proposalContract: d.proposalContract,
      contract: typeof d.contract === "string" ? d.contract : "",
      count: d.proposals.length,
      rows: d.proposals.map(safeRow).filter(Boolean),
      safety: { readOnly: safety.readOnly, writes: safety.writes },
      warningsCount: Array.isArray(d.warnings) ? d.warnings.length : 0,
      blockersCount: Array.isArray(d.blockers) ? d.blockers.length : 0,
    });
    setLoading(false);
  }, []);

  return (
    <div style={wrap}>
      <div style={card}>
        {enabled ? (
          <>
            <div style={{ fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: "#7cb342", marginBottom: 8 }}>
              read-only · interno
            </div>
            <h2 style={{ margin: "0 0 10px", fontSize: 22 }}>Premium Planner proposals lab</h2>
            <p style={{ margin: 0, color: "#9a9aa2", fontSize: 14, lineHeight: 1.5 }}>
              Preview di sola lettura di <code>previewStrategicOpportunities</code> con una
              fixture sintetica (nessun PII, nessuna scrittura). Mostra solo un summary
              di <code>proposals[]</code>.
            </p>

            <button type="button" style={runBtn(loading)} onClick={run} disabled={loading}>
              {loading ? "Cargando…" : "▷ Run read-only preview"}
            </button>

            {error && (
              <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(232,52,28,0.4)", background: "rgba(232,52,28,0.08)", color: "#ffb4a8", fontSize: 13, textAlign: "left" }}>
                {error}
              </div>
            )}

            {view && !error && (
              <div style={{ marginTop: 18, textAlign: "left" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: "#9ccc65", background: "rgba(255,255,255,0.04)", border: "1px solid #3a5a3a", borderRadius: 6, padding: "4px 9px" }}>
                    {view.proposalContract}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: "#9a9aa2", background: "rgba(255,255,255,0.04)", border: "1px solid #2a2a2e", borderRadius: 6, padding: "4px 9px" }}>
                    proposals: {view.count}
                  </span>
                  {["readOnly", "writes"].map((k) => {
                    const v = view.safety[k];
                    const want = k === "readOnly";
                    const good = v === want;
                    const col = good ? "#7cb342" : "#e8341c";
                    return (
                      <span key={k} style={{ fontSize: 11, fontFamily: "monospace", color: col, background: "rgba(255,255,255,0.04)", border: `1px solid ${col}55`, borderRadius: 6, padding: "4px 9px" }}>
                        safety.{k}: {String(v)}
                      </span>
                    );
                  })}
                  {(view.warningsCount > 0 || view.blockersCount > 0) && (
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "#f59e0b", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 6, padding: "4px 9px" }}>
                      warnings: {view.warningsCount} · blockers: {view.blockersCount}
                    </span>
                  )}
                </div>

                {view.rows.length === 0 ? (
                  <div style={{ color: "#6a6a72", fontSize: 13, padding: "8px 0" }}>
                    Sin propuestas para esta fixture (proposals: 0).
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {view.rows.map((r, i) => (
                      <div key={r.rank != null ? r.rank : i} style={{ background: "#1a1a1c", border: "1px solid #2a2a2e", borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: "#e8e8ea" }}>#{r.rank != null ? r.rank : "?"}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#9ccc65", background: "rgba(124,179,66,0.1)", border: "1px solid #3a5a3a", borderRadius: 6, padding: "2px 8px" }}>
                            {KIND_LABEL[r.kind] || r.kind || "—"}
                          </span>
                          {r.status && (
                            <span style={{ fontSize: 11, color: "#9a9aa2" }}>status: {r.status}</span>
                          )}
                          {r.timeLabel && (
                            <span style={{ fontSize: 11, color: "#9a9aa2" }}>⏱ {r.timeLabel}</span>
                          )}
                          {r.zoneLabel && (
                            <span style={{ fontSize: 11, color: "#9a9aa2" }}>📍 {r.zoneLabel}</span>
                          )}
                        </div>
                        {r.reason && (
                          <div style={{ fontSize: 12, color: "#7a7a82", marginTop: 6, lineHeight: 1.4 }}>{r.reason}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 11, color: "#5a5a62", marginTop: 12 }}>
                  Solo lectura · no aplica cambios · no crea giros · sin PII.
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <h2 style={{ margin: "0 0 10px", fontSize: 22 }}>Premium Planner preview disabled</h2>
            <p style={{ margin: 0, color: "#9a9aa2", fontSize: 14, lineHeight: 1.5 }}>
              Questa anteprima è disattivata (flag <code>REACT_APP_PREMIUM_PROPOSALS</code> OFF).
              Vista interna read-only, non visibile agli operatori.
            </p>
          </>
        )}
        {typeof onBack === "function" && (
          <button type="button" style={backBtn} onClick={onBack}>
            ← Volver
          </button>
        )}
      </div>
    </div>
  );
}
