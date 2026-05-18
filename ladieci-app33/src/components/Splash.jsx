import { useState, useEffect } from 'react';
import { LOGO_RED_SRC, C } from '../constants';

const Splash = ({onDone}) => {
  const [fase, setFase] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setFase(1), 150);
    const t2 = setTimeout(() => setFase(2), 1800);
    const t3 = setTimeout(() => onDone(), 3600);
    return () => { clearTimeout(t1);clearTimeout(t2);clearTimeout(t3); };
  }, []);

  return (
    <div onClick={onDone} style={{
      position:"fixed", inset:0, cursor:"pointer",
      background:"#060606",
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      overflow:"hidden", userSelect:"none"
    }}>
      <style>{`
        @keyframes logoBoom {
          0%   { transform:scale(0.12); opacity:0;   filter:blur(28px) brightness(0.2) saturate(0) contrast(0.25); }
          10%  { transform:scale(0.22); opacity:0.2; filter:blur(22px) brightness(0.3) saturate(0.1) contrast(0.35); }
          20%  { transform:scale(0.35); opacity:0.4; filter:blur(16px) brightness(0.4) saturate(0.2) contrast(0.5); }
          30%  { transform:scale(0.48); opacity:0.55;filter:blur(11px) brightness(0.55) saturate(0.35) contrast(0.62); }
          40%  { transform:scale(0.60); opacity:0.68;filter:blur(7px)  brightness(0.68) saturate(0.5) contrast(0.73); }
          50%  { transform:scale(0.71); opacity:0.78;filter:blur(4.5px) brightness(0.78) saturate(0.65) contrast(0.82); }
          60%  { transform:scale(0.81); opacity:0.86;filter:blur(2.5px) brightness(0.87) saturate(0.78) contrast(0.9); }
          70%  { transform:scale(0.89); opacity:0.92;filter:blur(1.2px) brightness(0.93) saturate(0.88) contrast(0.97); }
          80%  { transform:scale(0.95); opacity:0.97;filter:blur(0.5px) brightness(0.97) saturate(0.95) contrast(1.05); }
          90%  { transform:scale(0.99); opacity:1;   filter:blur(0px)   brightness(1.0)  saturate(1.0)  contrast(1.15); }
          100% { transform:scale(1.0);  opacity:1;   filter:blur(0px)   brightness(1.02) saturate(1.02) contrast(1.28) drop-shadow(0 0 8px #FF220055) drop-shadow(0 0 18px #AA110022); }
        }
        @keyframes glowBoom {
          0%   { opacity: 0; transform: scale(0.3); }
          55%  { opacity: 0.75; transform: scale(1.1); }
          100% { opacity: 0.5; transform: scale(1); }
        }
        @keyframes glowPulse {
          0%,100% { opacity: 0.45; }
          50%     { opacity: 0.68; }
        }
        @keyframes warnBlink {
          0%,100% { border-color: rgba(255,200,0,0.85); box-shadow: 0 0 22px rgba(255,200,0,0.5); }
          50%     { border-color: rgba(255,200,0,0.25); box-shadow: none; }
        }
      `}</style>

      {/* Glow sfondo */}
      <div style={{
        position:"absolute", top:"50%", left:"50%",
        transform:"translate(-50%,-55%)",
        width:700, height:700, borderRadius:"50%",
        background:"radial-gradient(circle, #BB1800 0%, #770000 25%, #330000 50%, transparent 70%)",
        opacity: fase>=1 ? 0.5 : 0,
        filter:"blur(50px)",
        transition:"opacity .8s ease",
        animation: fase>=1 ? "glowPulse 3s ease infinite" : "none",
        pointerEvents:"none"
      }}/>

      {/* Logo + testo */}
      <div style={{
        position:"relative", zIndex:2,
        display:"flex", flexDirection:"column",
        alignItems:"center", gap:28
      }}>
        {/* Logo scale-up con contrasto crescente */}
        <div style={{
          position:"relative",
          width:"min(78vw, 340px)",
          height:"min(78vw, 340px)"
        }}>
          {/* Alone rosso */}
          <div style={{
            position:"absolute", inset:"-18%",
            background:"radial-gradient(circle, #CC220050 0%, transparent 65%)",
            filter:"blur(28px)", borderRadius:"50%", zIndex:0,
            opacity: fase>=1 ? 1 : 0,
            animation: fase>=1 ? "glowBoom 2.2s linear forwards" : "none"
          }}/>
          {/* Logo */}
          <img src={LOGO_RED_SRC} style={{
            width:"100%", height:"100%", objectFit:"contain",
            position:"relative", zIndex:1,
            animation: fase>=1 ? "logoBoom 2.2s linear forwards" : "none",
            opacity: fase>=1 ? 1 : 0
          }}/>
        </div>

        {/* Testo — appare durante il boom */}
        <div style={{
          textAlign:"center",
          opacity: fase>=1 ? 1 : 0,
          transform:`translateY(${fase>=1?0:20}px)`,
          transition:"all .9s cubic-bezier(.16,1,.3,1) .6s"
        }}>
          <div style={{
            color:"#FFFFFF", fontSize:36, fontWeight:800,
            letterSpacing:10, textTransform:"uppercase",
            filter:"drop-shadow(0 0 14px #FF220066)"
          }}>LA DIECI</div>
          <div style={{
            color:"#CC2200", fontSize:11, letterSpacing:6,
            textTransform:"uppercase", marginTop:8, fontWeight:600,
            filter:"drop-shadow(0 0 10px #CC220077)"
          }}>PIZZA DEL DIEZ · ROQUETAS DE MAR</div>
        </div>
      </div>

      {/* Toca */}
      <div style={{
        position:"absolute", bottom:48,
        display:"flex", flexDirection:"column",
        alignItems:"center", gap:12,
        opacity: fase>=2 ? 1 : 0,
        transform:`translateY(${fase>=2?0:8}px)`,
        transition:"all .7s ease"
      }}>
        <div style={{width:28,height:2,background:"#CC2200",borderRadius:1,
          boxShadow:"0 0 10px #CC220099"}}/>
        <div style={{color:"#555",fontSize:10,letterSpacing:5,
          textTransform:"uppercase",fontWeight:600}}>TOCA PARA ENTRAR</div>
      </div>
    </div>
  );
};

// ─── HOME ─────────────────────────────────────────────────────

export default Splash;
