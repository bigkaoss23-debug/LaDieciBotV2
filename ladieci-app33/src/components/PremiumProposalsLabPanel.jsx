// src/components/PremiumProposalsLabPanel.jsx
// ─────────────────────────────────────────────────────────────────────────────
// SCAFFOLD interno/admin del Premium Planner proposals lab.
//
// Accesso SOLO via deep-link nascosto /premium-proposals (dietro PIN), come
// /shadow-preview. NESSUN bottone/menu operatore punta qui.
//
// Questo è SOLO infrastruttura: gating + placeholder. In questo step NON fa
// alcuna chiamata backend, NON consuma proposals[], NON tocca NuevoPedidoModal.
// Il flag REACT_APP_PREMIUM_PROPOSALS (default OFF) decide cosa mostrare.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { isPremiumProposalsEnabled } from "../featureFlags";

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
  maxWidth: 460,
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

export default function PremiumProposalsLabPanel({ onBack }) {
  const enabled = isPremiumProposalsEnabled();

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
              Placeholder scaffold. Nessuna chiamata backend in questo step:
              non consuma <code>proposals[]</code> né <code>previewStrategicOpportunities</code>.
              Il consumo dati arriverà in uno step successivo, dietro questo stesso flag.
            </p>
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
