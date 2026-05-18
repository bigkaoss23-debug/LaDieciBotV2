import { useState } from 'react';

const EconBotPage = ({ onEconomia, onBotIA, onBack, pendingSug = 0 }) => {
  const [hovE, setHovE] = useState(false);
  const [hovB, setHovB] = useState(false);

  const card = (label, sub, icon, hov, onEnter, onLeave, onClick, accent, badge) => (
    <button
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        background: hov ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.025)",
        border: `1px solid ${hov ? accent + "55" : accent + "22"}`,
        borderRadius: 18,
        padding: "30px 28px",
        display: "flex", alignItems: "center", gap: 22,
        width: "100%", textAlign: "left", cursor: "pointer",
        transition: "all 0.2s ease",
        transform: hov ? "translateY(-2px)" : "none",
        boxShadow: hov
          ? `0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px ${accent}22`
          : "0 4px 20px rgba(0,0,0,0.4)",
        WebkitTapHighlightColor: "transparent",
      }}>
      <div style={{
        width: 54, height: 54, borderRadius: 14, flexShrink: 0,
        background: `${accent}12`,
        border: `1px solid ${accent}25`,
        display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 22,
        filter: hov ? `drop-shadow(0 0 10px ${accent}66)` : "none",
        transition: "filter 0.2s"
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          color: hov ? "#fff" : "#ccc",
          fontSize: 16, fontWeight: 700, letterSpacing: 2,
          textTransform: "uppercase", marginBottom: 5,
          transition: "color 0.2s"
        }}>{label}</div>
        <div style={{ color: "#3a3a3a", fontSize: 12, letterSpacing: 0.5 }}>{sub}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {badge > 0 && (
          <div style={{
            background: accent, color: "#fff",
            borderRadius: 20, padding: "2px 9px",
            fontSize: 11, fontWeight: 800
          }}>{badge}</div>
        )}
        <div style={{
          color: hov ? accent : "#2a2a2a",
          fontSize: 20, fontWeight: 300,
          transition: "color 0.2s"
        }}>›</div>
      </div>
    </button>
  );

  return (
    <div style={{
      background: "#080808",
      minHeight: "100vh",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "40px 24px",
      fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
      position: "relative", overflow: "hidden",
      userSelect: "none",
    }}>
      {/* Glow */}
      <div style={{
        position: "absolute", top: "35%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 500, height: 500, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(80,50,180,0.07) 0%, transparent 65%)",
        pointerEvents: "none", zIndex: 0
      }} />

      {/* Back */}
      <button onClick={onBack} style={{
        position: "absolute", top: 24, left: 20,
        background: "transparent", border: "none",
        color: "#333", fontSize: 13, fontWeight: 600,
        letterSpacing: 1, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 4px", zIndex: 2
      }}>‹ Indietro</button>

      {/* Title */}
      <div style={{ zIndex: 1, textAlign: "center", marginBottom: 44 }}>
        <div style={{
          color: "#1e1e1e", fontSize: 10, letterSpacing: 5,
          textTransform: "uppercase", fontWeight: 600
        }}>Seleziona sezione</div>
      </div>

      {/* Cards */}
      <div style={{
        zIndex: 1, display: "flex", flexDirection: "column",
        gap: 14, width: "100%", maxWidth: 400
      }}>
        {card(
          "Economia",
          "Incassi · Storico · Statistiche",
          "📊",
          hovE,
          () => setHovE(true),
          () => setHovE(false),
          onEconomia,
          "#6644CC"
        )}
        {card(
          "Bot IA",
          "Analisi · Suggerimenti · Apprendimento",
          "🤖",
          hovB,
          () => setHovB(true),
          () => setHovB(false),
          onBotIA,
          "#9933CC",
          pendingSug
        )}
      </div>
    </div>
  );
};

export default EconBotPage;
