import { useState, useEffect, useMemo } from 'react';
import { C } from '../../constants';
import IaPill from '../ui/IaPill';
import Badge from '../ui/Badge';

const isCicloChiuso = (m) => {
  const conf  = Number(m.ia?.conf || 0);
  const items = m.ia?.items || [];
  const hora  = m.ia?.hora || "";
  // conf>=95 con bot_risposta = bot ha già confermato → ciclo chiuso
  if (conf >= 95 && m.bot_risposta && m.bot_risposta.length > 10) return true;
  if (items.length === 0) return false;
  if (conf < 60) return false;
  if (conf >= 90) return true;
  if (!hora) return false;
  return true;
};

// ─── TAB WA — LISTA (stable outer component to prevent remount) ────
const WaLista = ({msgs, msgsFiltrati, sel, setSel, isTablet, msgsPreguntas}) => {
  const _msgsPreguntas = msgsPreguntas || [];
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(p => p+1), 30000);
    return () => clearInterval(t);
  }, []);

  const telInStallo = useMemo(() => {
    const s = new Set();
    _msgsPreguntas.forEach(m => { if(m.tel) s.add(m.tel); });
    return s;
  }, [_msgsPreguntas]);

  const minutiAttesa = (m) => {
    const ts = Number(m.ts||0);
    if (!ts) return 0;
    return Math.floor((Date.now() - ts) / 60000);
  };

  return (
    <div style={{
      ...(isTablet?{width:320,borderRight:"1px solid rgba(255,255,255,0.07)"}:{flex:1}),
      display:"flex",flexDirection:"column",
      background:"transparent",overflow:"hidden",
      paddingBottom:100,
    }}>
      <div style={{padding:"12px 16px 8px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:C.wa,
          boxShadow:`0 0 9px ${C.wa}cc`,flexShrink:0,animation:"livePulse 2.2s ease infinite"}}/>
        <span style={{fontWeight:700,fontSize:14,color:C.bianco}}>Pedidos</span>
        <Badge n={msgs.filter(m=>!m.leido&&(m.stato==="NUEVO"||!m.stato)).length} c={C.wa}/>
      </div>
      <div style={{flex:1,overflowY:"auto"}}>
        {msgsFiltrati.length === 0 && (
          <div style={{textAlign:"center",padding:"40px 0",color:C.grigio}}>
            <div style={{fontSize:28,marginBottom:8}}>💬</div>
            <div style={{fontSize:13}}>Sin órdenes de WhatsApp</div>
          </div>
        )}
        {msgsFiltrati.map(m=>{
          const isNuevo  = m.stato==="NUEVO"||!m.stato;
          const isTratt  = m.stato==="IN_TRATTAMENTO";
          const isCocina = m.stato==="COCINA";
          const isDone   = m.stato==="RETIRADO"||m.stato==="COMPLETATO";
          const isStallo = !isCocina && !isDone && telInStallo.has(m.tel);
          const isAttesa = !isCocina && !isDone && !isStallo && (isTratt || isNuevo);
          const mins      = isAttesa ? minutiAttesa(m) : 0;
          const timerPct  = isAttesa ? Math.min(100, Math.round((mins/15)*100)) : 0;
          const timerCol  = mins < 5 ? C.verde : mins < 10 ? C.giallo : C.rosso;

          // Scala colori: verde(nuovo) → giallo(in trattamento) → arancio(cocina) → scuro(done)
          const cardBg     = isStallo  ? "rgba(255,255,255,0.025)"
                           : isDone    ? "rgba(255,255,255,0.03)"
                           : isCocina  ? "linear-gradient(145deg,rgba(249,115,22,0.18) 0%,rgba(234,88,12,0.10) 60%,rgba(180,60,8,0.16) 100%)"
                           : isTratt   ? "linear-gradient(145deg,rgba(250,204,21,0.14) 0%,rgba(245,158,11,0.08) 60%,rgba(180,120,8,0.12) 100%)"
                           : isNuevo   ? "linear-gradient(145deg,rgba(34,197,94,0.20) 0%,rgba(22,163,74,0.10) 60%,rgba(15,107,50,0.18) 100%)"
                           : "rgba(255,255,255,0.055)";
          const cardBorder = isStallo  ? "rgba(255,255,255,0.06)"
                           : isDone    ? "rgba(255,255,255,0.07)"
                           : isCocina  ? "rgba(249,115,22,0.45)"
                           : isTratt   ? "rgba(250,204,21,0.38)"
                           : isNuevo   ? "rgba(34,197,94,0.45)"
                           : "rgba(255,255,255,0.10)";
          const sideGlow   = isDone    ? "transparent"
                           : isCocina  ? "rgba(249,115,22,0.12)"
                           : isTratt   ? "rgba(250,204,21,0.09)"
                           : isNuevo   ? "rgba(34,197,94,0.12)"
                           : "transparent";
          const shimmer    = isDone    ? "rgba(255,255,255,0.06)"
                           : isCocina  ? "rgba(249,115,22,0.40)"
                           : isTratt   ? "rgba(250,204,21,0.35)"
                           : isNuevo   ? "rgba(34,197,94,0.40)"
                           : "rgba(255,255,255,0.18)";
          const avatarGlow = isCocina ? C.orange : isStallo ? "#555" : isTratt ? C.giallo : isNuevo ? C.verde : "#888";
          const dotColor   = isCocina ? C.orange : isDone ? "#444" : isStallo ? "#444" : isTratt ? C.giallo : isNuevo ? C.wa : C.wa;
          const dotShadow  = isCocina ? "rgba(249,115,22,0.8)" : (isDone||isStallo) ? "transparent"
                           : isTratt ? `${C.giallo}cc` : `${C.wa}cc`;
          const boxGlow    = isDone    ? "0 4px 14px rgba(0,0,0,0.30)"
                           : isCocina  ? "0 4px 22px rgba(249,115,22,0.22), 0 2px 12px rgba(0,0,0,0.35)"
                           : isTratt   ? "0 4px 22px rgba(250,204,21,0.18), 0 2px 12px rgba(0,0,0,0.35)"
                           : isNuevo   ? "0 4px 22px rgba(34,197,94,0.22), 0 2px 12px rgba(0,0,0,0.35)"
                           : "0 4px 20px rgba(0,0,0,0.38)";
          return (
            <div key={m.id} onClick={()=>!isStallo&&setSel(m.id)} style={{
              margin:"4px 10px",padding:"11px 14px",borderRadius:18,
              background: cardBg,
              backdropFilter:"blur(32px) saturate(1.9) brightness(1.08)",
              WebkitBackdropFilter:"blur(32px) saturate(1.9) brightness(1.08)",
              border:`1.5px solid ${sel===m.id?"rgba(242,242,242,0.30)":cardBorder}`,
              boxShadow:`${boxGlow}, inset 0 1px 0 rgba(255,255,255,${sel===m.id?".18":".10"})`,
              cursor: isStallo ? "not-allowed" : "pointer",
              opacity: isDone ? 0.45 : isStallo ? 0.40 : 1,
              position:"relative",overflow:"hidden",
            }}>
              <div style={{position:"absolute",top:0,left:"6%",right:"6%",height:1,
                background:`linear-gradient(90deg,transparent,${shimmer},transparent)`,pointerEvents:"none"}}/>
              <div style={{position:"absolute",inset:0,borderRadius:18,pointerEvents:"none",
                background:`radial-gradient(ellipse 50% 80% at 10% 50%, ${sideGlow}, transparent)`}}/>
              <div style={{display:"flex",alignItems:"flex-start",gap:11,position:"relative"}}>
                <div style={{position:"relative",flexShrink:0}}>
                  <div style={{width:42,height:42,borderRadius:"50%",
                    background:`linear-gradient(135deg,${avatarGlow}18,${avatarGlow}35)`,
                    border:`2px solid ${avatarGlow}40`,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span style={{color:avatarGlow,fontWeight:800,fontSize:13}}>
                      {m.nombre.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                    </span>
                  </div>
                  <div style={{position:"absolute",bottom:1,right:1,width:11,height:11,borderRadius:"50%",
                    background:dotColor,border:"2px solid #070707",boxShadow:`0 0 8px ${dotShadow}`}}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",marginBottom:4,gap:5}}>
                    <span style={{fontWeight:700,fontSize:13.5,color:isDone?"#666":"#EFEFEF",
                      flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.nombre}</span>
                    <span style={{color:"#3C3C3C",fontSize:10,flexShrink:0}}>{m.ago}</span>
                    {(m.ia?.conf||0)>0&&!isDone&&!isAttesa&&<IaPill conf={m.ia.conf}/>}
                    {isCocina&&<div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0,
                      background:"rgba(249,115,22,0.13)",border:"1px solid rgba(249,115,22,0.35)",
                      borderRadius:20,padding:"2px 7px",color:C.orange,fontSize:10,fontWeight:700}}>🍕 Cocina</div>}
                    {isStallo&&<div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0,
                      background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",
                      borderRadius:20,padding:"2px 7px",color:"#666",fontSize:10,fontWeight:700}}>⏳ Espera</div>}
                    {isAttesa&&<div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0,
                      background:"rgba(250,204,21,0.12)",border:"1px solid rgba(250,204,21,0.3)",
                      borderRadius:20,padding:"2px 7px",color:C.giallo,fontSize:10,fontWeight:700}}>⏱ {mins}m</div>}
                    {isDone&&<div style={{background:"rgba(255,255,255,0.05)",
                      border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,padding:"2px 7px",
                      color:"#555",fontSize:10,fontWeight:600}}>✅ Entregado</div>}
                  </div>
                  <div style={{color:"#BBBBBB",fontSize:13,fontWeight:500,lineHeight:1.45,letterSpacing:.15,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.txt}</div>
                  {isAttesa && (
                    <div style={{marginTop:7}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:10,color:"#555"}}>
                        <span>⏳ Esperando respuesta…</span>
                        <span style={{color:timerCol,fontWeight:700}}>{mins}m</span>
                      </div>
                      <div style={{height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:2,width:`${timerPct}%`,
                          background:`linear-gradient(90deg,${C.verde},${timerCol})`,
                          transition:"width 30s linear",boxShadow:`0 0 6px ${timerCol}88`}}/>
                      </div>
                    </div>
                  )}
                  {(!m.leido&&!isDone&&!isCocina&&!isAttesa)&&(
                    <div style={{marginTop:5,display:"flex",justifyContent:"flex-end"}}>
                      <div style={{width:7,height:7,borderRadius:"50%",background:C.wa,
                        boxShadow:`0 0 8px ${C.wa}cc`}}/>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── TAB PREGUNTAS — conversazioni non-ordini ─────────────────
// ─── TAB PREGUNTAS — Lista card (glass 3D, fuori dal componente) ──────────

export { isCicloChiuso };
export default WaLista;
