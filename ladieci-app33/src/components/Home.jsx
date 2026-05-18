import { useState, useEffect } from 'react';
import { LOGO_RED_SRC } from '../constants';

const IconServizio = ({ glow }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke={glow ? "#fff" : "rgba(255,255,255,0.6)"}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ filter: glow ? "drop-shadow(0 0 5px rgba(255,80,40,0.9))" : "none", transition: "all 0.2s" }}>
    <path d="M3 2v7c0 1.1.9 2 2 2 1.1 0 2-.9 2-2V2"/>
    <line x1="7" y1="2" x2="7" y2="22"/>
    <path d="M21 15V2s-5 3-5 9v6"/>
    <line x1="16" y1="15" x2="21" y2="15"/>
    <line x1="18.5" y1="15" x2="18.5" y2="22"/>
  </svg>
);

const IconEconomia = ({ glow }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke={glow ? "#fff" : "rgba(255,255,255,0.6)"}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ filter: glow ? "drop-shadow(0 0 5px rgba(255,80,40,0.9))" : "none", transition: "all 0.2s" }}>
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
    <polyline points="16 7 22 7 22 13"/>
  </svg>
);

const Home = ({ onServizio, onEconBot }) => {
  const [hovS, setHovS] = useState(false);
  const [hovE, setHovE] = useState(false);
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700;800&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    const update = () => {
      const now = new Date();
      const day = now.toLocaleDateString("it", { weekday: "long", day: "numeric", month: "long" });
      setTimeStr(day.charAt(0).toUpperCase() + day.slice(1));
    };
    update();
    const t = setInterval(update, 60000);
    return () => { clearInterval(t); document.head.removeChild(link); };
  }, []);

  const card = (label, IconComp, hov, onEnter, onLeave, onClick) => (
    <button
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        position: "relative",
        background: hov
          ? "linear-gradient(120deg, rgba(220,35,10,0.55) 0%, rgba(140,15,5,0.45) 40%, rgba(8,2,2,0.85) 100%)"
          : "linear-gradient(120deg, rgba(220,35,10,0.25) 0%, rgba(100,10,3,0.3) 40%, rgba(6,2,2,0.75) 100%)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: `1px solid ${hov ? "rgba(255,60,20,0.8)" : "rgba(200,40,10,0.35)"}`,
        borderRadius: 12,
        padding: "24px 36px",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
        width: "100%", cursor: "pointer",
        transition: "all 0.22s ease",
        transform: hov ? "translateY(-2px) scale(1.01)" : "none",
        boxShadow: hov
          ? "0 16px 50px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,50,15,0.5), 0 0 30px rgba(220,35,10,0.4)"
          : "0 6px 24px rgba(0,0,0,0.7), 0 0 0 1px rgba(180,30,8,0.15)",
        WebkitTapHighlightColor: "transparent",
        overflow: "hidden",
      }}>
      {/* Riga rossa in cima — dettaglio geometrico */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: hov
          ? "linear-gradient(90deg, transparent 0%, rgba(255,60,20,0.9) 30%, rgba(255,100,50,1) 50%, rgba(255,60,20,0.9) 70%, transparent 100%)"
          : "linear-gradient(90deg, transparent 0%, rgba(200,35,10,0.4) 30%, rgba(220,50,15,0.5) 50%, rgba(200,35,10,0.4) 70%, transparent 100%)",
        transition: "background 0.3s",
      }} />
      <IconComp glow={hov} />
      <div style={{
        color: "#fff", fontSize: 14, fontWeight: 700,
        fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif",
        letterSpacing: 5, textTransform: "uppercase",
        position: "relative", zIndex: 1,
      }}>{label}</div>
    </button>
  );

  return (
    <div style={{
      background: "#000", minHeight: "100vh",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "40px 24px",
      fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif",
      position: "relative", overflow: "hidden", userSelect: "none",
    }}>
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(115vw, 1150px)", height: "min(115vw, 1150px)",
        pointerEvents: "none", zIndex: 0,
      }}>
        <img src={LOGO_RED_SRC} alt="" style={{
          width: "100%", height: "100%", objectFit: "contain",
          opacity: 0.35,
          filter: "blur(1.5px) brightness(1.4) saturate(1.3) drop-shadow(0 0 60px rgba(255,40,15,0.95)) drop-shadow(0 0 120px rgba(220,30,10,0.7)) drop-shadow(0 0 200px rgba(200,20,5,0.5))",
        }} />
      </div>
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 1000, height: 1000, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,40,15,0.28) 0%, rgba(200,20,5,0.12) 35%, transparent 65%)",
        pointerEvents: "none", zIndex: 0, filter: "blur(50px)"
      }} />
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.85) 75%, #000 100%)",
        pointerEvents: "none", zIndex: 0
      }} />

      <div style={{ zIndex: 2, display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 460 }}>
        {card("Servizio", IconServizio, hovS, () => setHovS(true), () => setHovS(false), onServizio)}
        {card("Economia & Bot", IconEconomia, hovE, () => setHovE(true), () => setHovE(false), onEconBot)}
      </div>

      <div style={{
        position: "absolute", bottom: 28, zIndex: 2,
        color: "#2a0a06", fontSize: 9, letterSpacing: 4,
        textTransform: "uppercase", fontWeight: 600,
        fontFamily: "'Inter Tight', system-ui, sans-serif",
      }}>{timeStr}</div>
    </div>
  );
};

export default Home;
