// src/components/PremiumProposalsCompact.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Vista COMPATTA read-only delle propuestas de reparto (Premium Planner).
//
// Pensata per il futuro inserimento LEGGERO nel NuevoPedidoModal: CTA piccola
// "Ver propuestas" → max 3/4 cards compatte → mini dettaglio (timeline/mappa)
// SOLO on-demand. NON è la "Central de reparto" grande (quella resta nel LAB).
//
// È un componente PURO / RENDER-ONLY:
//   - riceve props già pronte (proposals/loading/error/...), NON fa fetch;
//   - non calcola ETA/ranking/status/capacity/slip/forno_out/driver conflict;
//   - nessun Date.now, nessun parsing orari;
//   - solo selezione LOCALE; nessun apply, nessuna modifica ordine, nessun
//     manual_giro, nessuna chiamata backend;
//   - sanitizza i campi (whitelist): mai PII, mai il body grezzo, mai
//     opportunities[]. Mostra solo: rank/kind/status/timeLabel/zoneLabel/reason
//     + routeTimeline whitelist.
//
// NON importa né tocca NuevoPedidoModal. Montaggio nel modal = step futuro.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";

// ── helper PURI (esportati, riutilizzabili) ──────────────────────────────────
export const KIND_LABEL = {
  direct: "Directa",
  insertion: "En giro",
  alternative: "Alternativa",
  not_recommended: "No recomendada",
};

// Colore da uno status/risk testuale del backend (solo presentazione).
export function proposalStatusColor(s) {
  const k = String(s || "").toLowerCase();
  if (k === "ok" || k === "compatible") return "#7cb342";
  if (k.includes("ajuste") || k.includes("tight") || k === "warning") return "#f59e0b";
  if (k.includes("blocked") || k.includes("no_recomendado") || k.includes("lleno") || k.includes("full")) return "#e8341c";
  return "#9a9aa2";
}

const sstr = (v) => (v == null ? "" : String(v));

// Sanitizza routeTimeline ai SOLI campi whitelist (no PII, no body grezzo).
function safeTimeline(rt) {
  if (!rt || typeof rt !== "object") return null;
  const sum = rt.summary && typeof rt.summary === "object" ? rt.summary : {};
  const steps = Array.isArray(rt.timeline)
    ? rt.timeline.map((t) => ({
        seq: Number.isFinite(t.seq) ? t.seq : null,
        zone: sstr(t.zone),
        eta: sstr(t.eta),
        status: sstr(t.status),
        isNewOrder: !!t.isNewOrder,
        isAnchor: !!t.isAnchor,
      }))
    : [];
  return {
    summary: {
      directEta: sstr(sum.directEta),
      giroEta: sstr(sum.giroEta),
      returnEta: sstr(sum.returnEta),
    },
    operatorMessage: sstr(rt.operatorMessage),
    steps,
  };
}

// Sanitizza una proposta ai SOLI campi renderizzati.
function safeRow(p) {
  if (!p || typeof p !== "object") return null;
  return {
    rank: Number.isFinite(p.rank) ? p.rank : null,
    kind: sstr(p.kind),
    status: sstr(p.status),
    timeLabel: sstr(p.timeLabel),
    zoneLabel: sstr(p.zoneLabel),
    reason: sstr(p.reason),
    routeTimeline: safeTimeline(p.routeTimeline),
  };
}

// ── mini mappa zone (solo render dei nodi backend) ───────────────────────────
function MiniMap({ steps }) {
  if (!Array.isArray(steps) || steps.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 5, overflowX: "auto", padding: "2px 0 6px" }}>
      {steps.map((st, i) => {
        const col = proposalStatusColor(st.status);
        const ring = st.isNewOrder ? "#f59e0b" : st.isAnchor ? "#56c5d0" : "#2a2a2e";
        return (
          <React.Fragment key={st.seq != null ? st.seq : i}>
            {i > 0 && <div style={{ alignSelf: "center", color: "#3a3a40", fontSize: 12 }}>→</div>}
            <div style={{ minWidth: 52, textAlign: "center", border: `1px solid ${ring}`, borderRadius: 8, padding: "5px 5px", background: "#1a1a1c" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#e8e8ea", whiteSpace: "nowrap" }}>{st.zone || "·"}</div>
              {st.eta && <div style={{ fontSize: 10, fontWeight: 800, color: col, marginTop: 2 }}>{st.eta}</div>}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── mini dettaglio della proposta selezionata ────────────────────────────────
function MiniDetail({ rt }) {
  if (!rt) {
    return <div style={{ fontSize: 11, color: "#6a6a72", padding: "6px 0" }}>Sin ruta detallada.</div>;
  }
  const chip = (label, val) =>
    val ? (
      <span style={{ fontSize: 11, color: "#9a9aa2" }}>
        {label} <b style={{ color: "#cfcfd4" }}>{val}</b>
      </span>
    ) : null;
  return (
    <div style={{ marginTop: 6 }}>
      <MiniMap steps={rt.steps} />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 2 }}>
        {chip("Directa", rt.summary.directEta)}
        {chip("En giro", rt.summary.giroEta)}
        {chip("Regreso", rt.summary.returnEta)}
      </div>
      {rt.operatorMessage && (
        <div style={{ fontSize: 11, color: "#7a7a82", marginTop: 6, fontStyle: "italic" }}>{rt.operatorMessage}</div>
      )}
    </div>
  );
}

export default function PremiumProposalsCompact({
  proposals,
  loading = false,
  error = "",
  onRunPreview,
  disabled = false,
  hint = "Sugerencias de reparto · solo lectura",
}) {
  const [selectedRank, setSelectedRank] = useState(null);

  const rows = (Array.isArray(proposals) ? proposals : [])
    .map(safeRow)
    .filter(Boolean)
    .sort((a, b) => (a.rank == null ? 999 : a.rank) - (b.rank == null ? 999 : b.rank))
    .slice(0, 4); // compatto: max 4

  const selectedRow = selectedRank != null ? rows.find((r) => r.rank === selectedRank) : null;
  const hasResults = rows.length > 0;

  const ctaStyle = {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #3a5a3a",
    background: disabled || loading ? "#1a1a1c" : "rgba(124,179,66,0.12)",
    color: disabled || loading ? "#6a6a72" : "#9ccc65",
    cursor: disabled || loading ? "default" : "pointer",
    fontWeight: 700,
    fontSize: 13,
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* Stato chiuso/default + CTA (nessuna mappa/timeline prima della preview) */}
      {!hasResults && !error && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            style={ctaStyle}
            onClick={() => { if (!disabled && !loading && typeof onRunPreview === "function") onRunPreview(); }}
            disabled={disabled || loading}
          >
            {loading ? "Calculando…" : "Ver propuestas"}
          </button>
          {hint && <span style={{ fontSize: 11, color: "#6a6a72" }}>{hint}</span>}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: "#ffb4a8", padding: "6px 0" }}>{error}</div>
      )}

      {/* Risultati compatti (max 4) */}
      {hasResults && !error && (
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map((r, i) => {
              const isSel = r.rank != null && r.rank === selectedRank;
              const isBest = i === 0;
              const stCol = proposalStatusColor(r.status);
              return (
                <button
                  type="button"
                  key={r.rank != null ? r.rank : i}
                  onClick={() => setSelectedRank(r.rank)}
                  aria-pressed={isSel}
                  style={{
                    textAlign: "left",
                    background: isSel ? "#202227" : "#1a1a1c",
                    border: `1px solid ${isSel ? "#7cb342" : isBest ? "#3a5a3a" : "#2a2a2e"}`,
                    borderRadius: 10,
                    padding: "8px 10px",
                    cursor: "pointer",
                    color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#e8e8ea" }}>
                      {KIND_LABEL[r.kind] || r.kind || "—"}
                    </span>
                    {r.status && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: stCol, background: `${stCol}1f`, border: `1px solid ${stCol}55`, borderRadius: 20, padding: "1px 8px" }}>
                        {r.status}
                      </span>
                    )}
                    {r.timeLabel && <span style={{ fontSize: 11, color: "#cfcfd4" }}>⏱ {r.timeLabel}</span>}
                    {r.zoneLabel && <span style={{ fontSize: 11, color: "#9a9aa2" }}>📍 {r.zoneLabel}</span>}
                  </div>
                  {r.reason && (
                    <div style={{ fontSize: 11, color: "#7a7a82", marginTop: 4, lineHeight: 1.35 }}>{r.reason}</div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Mini dettaglio on-demand (solo se una card è selezionata) */}
          {selectedRow && (
            <div style={{ marginTop: 8, borderTop: "1px solid #1f1f23", paddingTop: 8 }}>
              <MiniDetail rt={selectedRow.routeTimeline} />
            </div>
          )}

          <div style={{ fontSize: 10, color: "#5a5a62", marginTop: 8 }}>
            Solo lectura · no aplica cambios · sin PII.
          </div>
        </div>
      )}
    </div>
  );
}
