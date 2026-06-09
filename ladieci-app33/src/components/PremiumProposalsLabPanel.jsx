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
// rank/kind/status/timeLabel/zoneLabel + routeTimeline whitelist + safety). Le
// card sono selezionabili (selezione LOCALE) per mostrare la ruta della proposta.
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

// Colore per uno status/risk testuale (solo classe colore, nessun ricalcolo).
function statusColor(s) {
  const k = String(s || "").toLowerCase();
  if (k === "ok" || k === "compatible") return "#7cb342";
  if (k.includes("ajuste") || k.includes("tight") || k === "warning") return "#f59e0b";
  if (k.includes("blocked") || k.includes("no_recomendado") || k.includes("lleno") || k.includes("full")) return "#e8341c";
  return "#9a9aa2";
}

// Sanitizza routeTimeline (contract route-timeline-v2) ai SOLI campi whitelist:
// nessun PII (zone/label/eta/slip sono no-PII by design), mai il body grezzo.
function safeTimeline(rt) {
  if (!rt || typeof rt !== "object") return null;
  const s = (v) => (v == null ? "" : String(v));
  const sum = rt.summary && typeof rt.summary === "object" ? rt.summary : {};
  const steps = Array.isArray(rt.timeline)
    ? rt.timeline.map((t) => ({
        seq: Number.isFinite(t.seq) ? t.seq : null,
        zone: s(t.zone),
        label: s(t.label),
        eta: s(t.eta),
        slipLabel: s(t.slipLabel),
        status: s(t.status),
        isNewOrder: !!t.isNewOrder,
        isAnchor: !!t.isAnchor,
      }))
    : [];
  return {
    summary: {
      directEta: s(sum.directEta),
      giroEta: s(sum.giroEta),
      returnEta: s(sum.returnEta),
      tradeoffLabel: s(sum.tradeoffLabel),
    },
    risk: s(rt.risk),
    operatorMessage: s(rt.operatorMessage),
    steps,
  };
}

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
    routeTimeline: safeTimeline(p.routeTimeline),
  };
}

function errorText(status, data) {
  if (status === 401) return "Sesión expirada. Vuelve a entrar con el PIN.";
  if (status === 403) return "Acceso no permitido para este rol.";
  if (status === 0) return "Error de red. Comprueba la conexión.";
  const code = data && (data.error || (Array.isArray(data.blockers) && data.blockers[0] && data.blockers[0].code));
  return "No se pudo cargar la preview" + (status ? ` (HTTP ${status})` : "") + (code ? ` · ${code}` : "") + ".";
}

// ── Render della ruta (routeTimeline) della proposta selezionata ─────────────
function RouteTimelineView({ rt }) {
  if (!rt) {
    return (
      <div style={{ fontSize: 12, color: "#6a6a72", padding: "10px 0" }}>
        Esta propuesta no incluye ruta detallada.
      </div>
    );
  }
  const chip = (label, val) =>
    val ? (
      <span style={{ fontSize: 11, color: "#9a9aa2" }}>
        {label} <b style={{ color: "#cfcfd4" }}>{val}</b>
      </span>
    ) : null;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        {chip("directa", rt.summary.directEta)}
        {chip("en giro", rt.summary.giroEta)}
        {chip("regreso", rt.summary.returnEta)}
      </div>
      {rt.summary.tradeoffLabel && (
        <div style={{ fontSize: 12, color: "#9a9aa2", marginBottom: 6 }}>{rt.summary.tradeoffLabel}</div>
      )}
      {rt.risk && (
        <div style={{ fontSize: 11, fontWeight: 700, color: statusColor(rt.risk), marginBottom: 8 }}>
          riesgo: {rt.risk}
        </div>
      )}
      {rt.steps.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rt.steps.map((st, i) => {
            const col = statusColor(st.status);
            return (
              <div
                key={st.seq != null ? st.seq : i}
                style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderLeft: `3px solid ${col}`, paddingLeft: 10 }}
              >
                <span style={{ fontSize: 11, fontWeight: 800, color: "#e8e8ea" }}>{st.seq != null ? st.seq : "·"}</span>
                {st.zone && <span style={{ fontSize: 11, color: "#cfcfd4" }}>{st.zone}</span>}
                {st.label && <span style={{ fontSize: 11, color: "#9a9aa2" }}>{st.label}</span>}
                {st.eta && <span style={{ fontSize: 11, color: "#9a9aa2" }}>⏱ {st.eta}</span>}
                {st.slipLabel && <span style={{ fontSize: 11, color: col }}>{st.slipLabel}</span>}
                {st.isNewOrder && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 5, padding: "1px 6px" }}>nuevo</span>
                )}
                {st.isAnchor && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#56c5d0", border: "1px solid rgba(86,197,208,0.4)", borderRadius: 5, padding: "1px 6px" }}>en giro</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {rt.operatorMessage && (
        <div style={{ fontSize: 12, color: "#7a7a82", marginTop: 8, fontStyle: "italic" }}>{rt.operatorMessage}</div>
      )}
    </div>
  );
}

export default function PremiumProposalsLabPanel({ onBack }) {
  const enabled = isPremiumProposalsEnabled();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState(null); // summary normalizzato, mai il body grezzo
  const [selectedRank, setSelectedRank] = useState(null); // selezione LOCALE

  const run = useCallback(async () => {
    setLoading(true);
    setError("");
    setView(null);
    setSelectedRank(null);
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
    const rows = d.proposals
      .map(safeRow)
      .filter(Boolean)
      .sort((a, b) => (a.rank == null ? 999 : a.rank) - (b.rank == null ? 999 : b.rank));
    setView({
      proposalContract: d.proposalContract,
      contract: typeof d.contract === "string" ? d.contract : "",
      count: d.proposals.length,
      rows,
      safety: { readOnly: safety.readOnly, writes: safety.writes },
      warningsCount: Array.isArray(d.warnings) ? d.warnings.length : 0,
      blockersCount: Array.isArray(d.blockers) ? d.blockers.length : 0,
    });
    setLoading(false);
  }, []);

  const selectedRow = view && selectedRank != null ? view.rows.find((r) => r.rank === selectedRank) : null;

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
                    {view.rows.map((r, i) => {
                      const isSel = r.rank != null && r.rank === selectedRank;
                      const stCol = statusColor(r.status);
                      return (
                        <button
                          type="button"
                          key={r.rank != null ? r.rank : i}
                          onClick={() => setSelectedRank(r.rank)}
                          aria-pressed={isSel}
                          style={{
                            textAlign: "left",
                            background: isSel ? "#202227" : "#1a1a1c",
                            border: `1px solid ${isSel ? "#7cb342" : "#2a2a2e"}`,
                            borderRadius: 8,
                            padding: "10px 12px",
                            cursor: "pointer",
                            color: "inherit",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: "#e8e8ea" }}>#{r.rank != null ? r.rank : "?"}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#9ccc65", background: "rgba(124,179,66,0.1)", border: "1px solid #3a5a3a", borderRadius: 6, padding: "2px 8px" }}>
                              {KIND_LABEL[r.kind] || r.kind || "—"}
                            </span>
                            {r.status && (
                              <span style={{ fontSize: 11, color: stCol }}>status: {r.status}</span>
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
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Ruta della proposta selezionata (routeTimeline) */}
                {view.rows.length > 0 && (
                  <div style={{ marginTop: 14, borderTop: "1px solid #2a2a2e", paddingTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>
                      Ruta de la propuesta
                    </div>
                    {selectedRow ? (
                      <RouteTimelineView rt={selectedRow.routeTimeline} />
                    ) : (
                      <div style={{ fontSize: 12, color: "#6a6a72", padding: "6px 0" }}>
                        Selecciona una propuesta para ver la ruta.
                      </div>
                    )}
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
