// src/components/PremiumProposalsLabPanel.jsx
// ─────────────────────────────────────────────────────────────────────────────
// "Central de reparto" — pannello interno/admin del Premium Planner (LAB).
//
// Accesso SOLO via deep-link nascosto /premium-proposals (dietro PIN), come
// /shadow-preview. NESSUN bottone/menu operatore punta qui.
//
// READ-ONLY: con flag ON un bottone chiama l'azione backend live
// `previewStrategicOpportunities` (preview, safety writes:false) con una fixture
// sintetica senza PII, e mostra: "Mejor propuesta" + cards selezionabili + ruta
// (routeTimeline) + mini-mappa zone con ETA. Tutti i valori arrivano dal backend:
// il frontend NON calcola ETA/ranking/status, NON applica nulla, NON crea
// manual_giros, NON tocca NuevoPedidoModal, NON mostra il body grezzo né PII.
// Se proposals[] manca → "backend contract unavailable" (NIENTE fallback da
// opportunities[]).
//
// Il flag REACT_APP_PREMIUM_PROPOSALS (default OFF) decide cosa mostrare.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback } from "react";
import { isPremiumProposalsEnabled } from "../featureFlags";
import { fetchPremiumProposals } from "../api/premiumProposals";
import PremiumProposalsCompact from "./PremiumProposalsCompact";

const wrap = {
  minHeight: "100vh",
  background: "#0b0b0c",
  color: "#e8e8ea",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "32px 18px 64px",
  fontFamily: "system-ui, sans-serif",
};
const card = {
  maxWidth: 600,
  width: "100%",
  border: "1px solid #2a2a2e",
  borderRadius: 16,
  padding: "24px 22px",
  background: "#141416",
};
const backBtn = {
  marginTop: 22,
  padding: "8px 18px",
  borderRadius: 8,
  border: "1px solid #3a3a40",
  background: "transparent",
  color: "#cfcfd4",
  cursor: "pointer",
};
const runBtn = (busy) => ({
  marginTop: 16,
  width: "100%",
  padding: "12px 18px",
  borderRadius: 10,
  border: "1px solid #3a5a3a",
  background: busy ? "#1a1a1c" : "rgba(124,179,66,0.14)",
  color: busy ? "#6a6a72" : "#9ccc65",
  cursor: busy ? "default" : "pointer",
  fontWeight: 800,
  fontSize: 15,
});
const KIND_LABEL = {
  direct: "Directa",
  insertion: "En giro",
  alternative: "Alternativa",
  not_recommended: "No recomendada",
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
  return "No se pudo cargar la vista" + (status ? ` (HTTP ${status})` : "") + (code ? ` · ${code}` : "") + ".";
}

// ── Mini-mappa zone: strip lineare dai routeTimeline.steps (solo render) ──────
function MiniZoneMap({ steps }) {
  if (!Array.isArray(steps) || steps.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 6, overflowX: "auto", padding: "4px 0 8px" }}>
      {steps.map((st, i) => {
        const col = statusColor(st.status);
        const ring = st.isNewOrder ? "#f59e0b" : st.isAnchor ? "#56c5d0" : "#2a2a2e";
        const title = st.zone || st.label || "·";
        return (
          <React.Fragment key={st.seq != null ? st.seq : i}>
            {i > 0 && <div style={{ alignSelf: "center", color: "#3a3a40", fontSize: 14 }}>→</div>}
            <div style={{ minWidth: 64, textAlign: "center", border: `1px solid ${ring}`, borderRadius: 10, padding: "8px 6px", background: "#1a1a1c" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#e8e8ea", whiteSpace: "nowrap" }}>{title}</div>
              {st.eta && (
                <div style={{ fontSize: 11, fontWeight: 800, color: col, marginTop: 3 }}>{st.eta}</div>
              )}
              {(st.isNewOrder || st.isAnchor) && (
                <div style={{ fontSize: 9, fontWeight: 700, color: ring, marginTop: 2 }}>
                  {st.isNewOrder ? "nuevo" : "en giro"}
                </div>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Ruta (routeTimeline) della proposta selezionata ──────────────────────────
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
      <MiniZoneMap steps={rt.steps} />
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "6px 0 8px" }}>
        {chip("Directa", rt.summary.directEta)}
        {chip("En giro", rt.summary.giroEta)}
        {chip("Regreso", rt.summary.returnEta)}
      </div>
      {rt.summary.tradeoffLabel && (
        <div style={{ fontSize: 12, color: "#9a9aa2", marginBottom: 6 }}>{rt.summary.tradeoffLabel}</div>
      )}
      {rt.risk && (
        <div style={{ fontSize: 11, fontWeight: 700, color: statusColor(rt.risk), marginBottom: 8 }}>
          Riesgo: {rt.risk}
        </div>
      )}
      {rt.operatorMessage && (
        <div style={{ fontSize: 12, color: "#7a7a82", marginTop: 4, fontStyle: "italic" }}>{rt.operatorMessage}</div>
      )}
    </div>
  );
}

// ── Card di una proposta (hero = la migliore) ────────────────────────────────
function ProposalCard({ row, selected, hero, onSelect }) {
  const stCol = statusColor(row.status);
  return (
    <button
      type="button"
      onClick={() => onSelect(row.rank)}
      aria-pressed={selected}
      style={{
        textAlign: "left",
        background: selected ? "#202227" : "#1a1a1c",
        border: `1px solid ${selected ? "#7cb342" : hero ? "#3a5a3a" : "#2a2a2e"}`,
        borderRadius: 12,
        padding: hero ? "14px 16px" : "10px 12px",
        cursor: "pointer",
        color: "inherit",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: hero ? 14 : 12, fontWeight: 800, color: "#e8e8ea" }}>
          {KIND_LABEL[row.kind] || row.kind || "—"}
        </span>
        {row.status && (
          <span style={{ fontSize: 11, fontWeight: 700, color: stCol, background: `${stCol}1f`, border: `1px solid ${stCol}55`, borderRadius: 20, padding: "2px 9px" }}>
            {row.status}
          </span>
        )}
        {row.timeLabel && <span style={{ fontSize: hero ? 13 : 11, color: "#cfcfd4" }}>⏱ {row.timeLabel}</span>}
        {row.zoneLabel && <span style={{ fontSize: hero ? 13 : 11, color: "#9a9aa2" }}>📍 {row.zoneLabel}</span>}
      </div>
      {row.reason && (
        <div style={{ fontSize: 12, color: "#7a7a82", marginTop: 6, lineHeight: 1.4 }}>{row.reason}</div>
      )}
    </button>
  );
}

export default function PremiumProposalsLabPanel({ onBack }) {
  const enabled = isPremiumProposalsEnabled();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState(null); // summary normalizzato, mai il body grezzo
  const [selectedRank, setSelectedRank] = useState(null); // selezione LOCALE
  const [showTech, setShowTech] = useState(false); // dettagli tecnici collassati
  const [rawProposals, setRawProposals] = useState(null); // proposals grezze (stesso fetch) per la Vista compacta

  const run = useCallback(async () => {
    setLoading(true);
    setError("");
    setView(null);
    setSelectedRank(null);
    setRawProposals(null);
    const res = await fetchPremiumProposals();
    if (!res.ok) {
      setError(errorText(res.status, res.data));
      setLoading(false);
      return;
    }
    const d = res.data || {};
    // Guardia dura: se proposals[] manca → contract non disponibile. NIENTE
    // fallback da opportunities[].
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
    // Stesse proposals grezze (nessun nuovo fetch) per la Vista compacta.
    setRawProposals(Array.isArray(d.proposals) ? d.proposals : []);
    // Auto-seleziona la migliore (rank più basso) per mostrare subito ruta+mappa.
    setSelectedRank(rows.length > 0 ? rows[0].rank : null);
    setLoading(false);
  }, []);

  const rows = view ? view.rows : [];
  const best = rows.length > 0 ? rows[0] : null;
  const others = rows.slice(1);
  const selectedRow = view && selectedRank != null ? rows.find((r) => r.rank === selectedRank) : null;
  const safetyOk = view && view.safety.readOnly === true && view.safety.writes === false;

  const sectionTitle = { fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", margin: "16px 0 8px" };

  return (
    <div style={wrap}>
      <div style={card}>
        {enabled ? (
          <>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: -0.3 }}>Central de reparto</h2>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Vista interna · solo lectura</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#7cb342", background: "rgba(124,179,66,0.1)", border: "1px solid rgba(124,179,66,0.35)", borderRadius: 20, padding: "5px 11px" }}>
                🔒 Read-only · backend verified
              </span>
            </div>

            <button type="button" style={runBtn(loading)} onClick={run} disabled={loading}>
              {loading ? "Calculando…" : "▷ Calcular propuestas"}
            </button>

            {error && (
              <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(232,52,28,0.4)", background: "rgba(232,52,28,0.08)", color: "#ffb4a8", fontSize: 13 }}>
                {error}
              </div>
            )}

            {/* Vista compacta: anteprima del blocco LEGGERO per NuevoPedidoModal.
                Usa gli STESSI proposals già caricati (rawProposals) — nessun fetch
                nuovo; il bottone interno riusa `run`. NON è montato nel modal. */}
            <div style={sectionTitle}>Vista compacta (preview modal)</div>
            <PremiumProposalsCompact
              proposals={rawProposals || []}
              loading={loading}
              error={error}
              onRunPreview={run}
              disabled={loading}
              hint="Vista ligera para el modal de Nuevo Pedido"
            />

            {view && !error && (
              <div style={{ marginTop: 6 }}>
                <div style={sectionTitle}>Central de reparto · detalle completo</div>
                {rows.length === 0 ? (
                  <div style={{ color: "#6a6a72", fontSize: 13, padding: "12px 0" }}>
                    Sin propuestas para esta situación.
                  </div>
                ) : (
                  <>
                    {/* Mejor propuesta */}
                    {best && (
                      <>
                        <div style={sectionTitle}>Mejor propuesta</div>
                        <ProposalCard row={best} hero selected={best.rank === selectedRank} onSelect={setSelectedRank} />
                      </>
                    )}

                    {/* Otras propuestas */}
                    {others.length > 0 && (
                      <>
                        <div style={sectionTitle}>Otras opciones</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {others.map((r, i) => (
                            <ProposalCard
                              key={r.rank != null ? r.rank : i}
                              row={r}
                              selected={r.rank === selectedRank}
                              onSelect={setSelectedRank}
                            />
                          ))}
                        </div>
                      </>
                    )}

                    {/* Ruta de la propuesta seleccionada */}
                    <div style={sectionTitle}>Ruta de la propuesta</div>
                    {selectedRow ? (
                      <RouteTimelineView rt={selectedRow.routeTimeline} />
                    ) : (
                      <div style={{ fontSize: 12, color: "#6a6a72", padding: "6px 0" }}>
                        Selecciona una propuesta para ver la ruta.
                      </div>
                    )}
                  </>
                )}

                {/* Dettagli tecnici (collassati) */}
                <div style={{ marginTop: 18, borderTop: "1px solid #1f1f23", paddingTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setShowTech((v) => !v)}
                    style={{ background: "transparent", border: "none", color: "#6a6a72", fontSize: 11, cursor: "pointer", padding: 0 }}
                  >
                    {showTech ? "▾" : "▸"} Detalles técnicos
                  </button>
                  {showTech && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                      <span style={{ fontSize: 10, fontFamily: "monospace", color: "#9a9aa2", background: "rgba(255,255,255,0.04)", border: "1px solid #2a2a2e", borderRadius: 6, padding: "3px 8px" }}>
                        {view.proposalContract}
                      </span>
                      <span style={{ fontSize: 10, fontFamily: "monospace", color: "#9a9aa2", background: "rgba(255,255,255,0.04)", border: "1px solid #2a2a2e", borderRadius: 6, padding: "3px 8px" }}>
                        proposals: {view.count}
                      </span>
                      <span style={{ fontSize: 10, fontFamily: "monospace", color: safetyOk ? "#7cb342" : "#e8341c", background: "rgba(255,255,255,0.04)", border: `1px solid ${safetyOk ? "#3a5a3a" : "#e8341c55"}`, borderRadius: 6, padding: "3px 8px" }}>
                        safety readOnly:{String(view.safety.readOnly)} writes:{String(view.safety.writes)}
                      </span>
                      {(view.warningsCount > 0 || view.blockersCount > 0) && (
                        <span style={{ fontSize: 10, fontFamily: "monospace", color: "#f59e0b", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 6, padding: "3px 8px" }}>
                          warnings:{view.warningsCount} blockers:{view.blockersCount}
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "#5a5a62", marginTop: 10 }}>
                    Solo lectura · no aplica cambios · no crea giros · sin PII.
                  </div>
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
