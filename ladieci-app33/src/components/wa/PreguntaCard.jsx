import { useState } from 'react';
import { C } from '../../constants';
import { api } from '../../api';
import IaPill from '../ui/IaPill';

const PreguntaCard = ({m, sel, onSel, cache, ordenes, tick, primoTs, waiting}) => {
  const isDone = m.stato==="RETIRADO"||m.stato==="COMPLETATO";
  const isNew  = !m.leido && !waiting;
  const isConfermato = m.stato === "NUEVO" && (m.ia?.conf || 0) >= 90;
  // Timer real-time — tick forza il re-render ogni 10s
  // Usa il ts più vecchio del thread (primoTs) così il timer non si azzera sui nuovi messaggi
  void tick;
  const timerMins = Math.floor((Date.now() - Number(primoTs || m.ts || 0)) / 60000);
  const timerCol = timerMins < 3 ? C.verde : timerMins < 7 ? C.orange : C.rosso;
  const timerLabel = timerMins < 1 ? "ahora" : timerMins + "m";
  const telNormCard = String(m.wa_id||m.tel||"").replace("+","");
  const isModificaOrdine = telNormCard !== "" &&
    (m.stato === "IN_TRATTAMENTO" || m.stato === "NUEVO") &&
    !!(ordenes||[]).find(o => {
      const oTel = String(o.tel||o.wa_id||"").replace("+","");
      return oTel === telNormCard && (o.estado==="POR_CONFIRMAR"||o.estado==="EN_COCINA"||o.estado==="LISTO");
    });
  let isAdicion = false, adicionConfirmado = false;
  try {
    const nota = m?.ia?.nota || "";
    if (nota.indexOf('"tipo":"ADICION"') !== -1) {
      isAdicion = true;
      adicionConfirmado = JSON.parse(nota).confirmado_cliente || false;
    }
  } catch(e) {}
  const cardColor = isAdicion ? C.verde : isConfermato ? C.blu : C.viola;
  return (
    <div onClick={()=>onSel(m)} style={{
      margin:"6px 10px", padding:"14px 16px", borderRadius:20,
      background: isAdicion ? "rgba(34,197,94,0.07)" : isConfermato ? "rgba(59,130,246,0.07)" : "rgba(255,255,255,0.06)",
      backdropFilter:"blur(32px) saturate(1.9) brightness(1.08)",
      WebkitBackdropFilter:"blur(32px) saturate(1.9) brightness(1.08)",
      border:`1.5px solid ${isAdicion?(adicionConfirmado?C.verde:"rgba(34,197,94,0.4)"):isConfermato?(sel===m.id?"rgba(59,130,246,0.75)":"rgba(59,130,246,0.45)"):sel===m.id?"rgba(168,85,247,0.55)":isNew?"rgba(168,85,247,0.28)":"rgba(255,255,255,0.09)"}`,
      boxShadow:`0 4px 24px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,${sel===m.id?".18":".11"})`,
      cursor:"pointer", opacity:isDone?0.45:waiting?0.6:1,
      position:"relative", overflow:"hidden", transition:"border-color .15s, box-shadow .15s"
    }}>
      <div style={{position:"absolute",top:0,left:"8%",right:"8%",height:1,
        background:`linear-gradient(90deg,transparent,rgba(${isAdicion?"34,197,94":isConfermato?"59,130,246":"168,85,247"},0.4),transparent)`,
        pointerEvents:"none"}}/>
      <div style={{position:"absolute",top:0,left:0,right:0,height:"42%",
        background:"linear-gradient(180deg,rgba(255,255,255,0.07) 0%,transparent 100%)",
        borderRadius:"20px 20px 0 0",pointerEvents:"none"}}/>
      <div style={{display:"flex",alignItems:"flex-start",gap:13,position:"relative"}}>
        <div style={{position:"relative",flexShrink:0}}>
          <div style={{width:48,height:48,borderRadius:"50%",
            background:`linear-gradient(135deg,${cardColor}28,${cardColor}50)`,
            border:`2px solid ${cardColor}55`,
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{color:cardColor,fontWeight:900,fontSize:isAdicion?22:16}}>
              {isAdicion ? "➕" : m.nombre.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
            </span>
          </div>
          <div style={{position:"absolute",bottom:1,right:1,width:12,height:12,borderRadius:"50%",
            background:isConfermato?C.blu:isNew?(isAdicion?C.verde:C.viola):"#333",border:"2px solid #070707",
            boxShadow:isConfermato?`0 0 8px ${C.blu}cc`:isNew?`0 0 8px ${isAdicion?C.verde:C.viola}cc`:"none"}}/>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",marginBottom:5,gap:6}}>
            <span style={{fontWeight:800,fontSize:16,color:isNew||isConfermato?"#F5F5F5":"#888",
              flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
              letterSpacing:-.2}}>{m.nombre}</span>
            <span style={{color:timerCol,fontSize:11,fontWeight:700,flexShrink:0}}>{timerLabel}</span>
            {isConfermato && (
              <span style={{background:"rgba(59,130,246,0.15)",
                color:C.blu,border:`1px solid rgba(59,130,246,0.4)`,
                borderRadius:20,padding:"2px 7px",fontSize:10,fontWeight:800,flexShrink:0}}>
                ✅ CONFERMATO
              </span>
            )}
            {isModificaOrdine && (
              <span style={{background:"rgba(249,115,22,0.15)",
                color:C.orange,border:`1px solid rgba(249,115,22,0.45)`,
                borderRadius:20,padding:"2px 7px",fontSize:10,fontWeight:800,flexShrink:0}}>
                ⚠️ MODIFICA ORDINE
              </span>
            )}
            {isAdicion && !isConfermato && (
              <span style={{background:adicionConfirmado?`${C.verde}22`:"rgba(34,197,94,0.12)",
                color:C.verde,border:`1px solid ${C.verde}44`,
                borderRadius:20,padding:"2px 7px",fontSize:10,fontWeight:800,flexShrink:0}}>
                {adicionConfirmado ? "✅ CONFIRMAR" : "➕ ADICIÓN"}
              </span>
            )}
            {!isAdicion&&!isConfermato&&!isModificaOrdine&&isNew&&<div style={{width:8,height:8,borderRadius:"50%",background:C.viola,
              flexShrink:0,boxShadow:`0 0 8px ${C.viola}cc`}}/>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
            {m.ia?.tipo_consegna==="DOMICILIO" && (
              <span style={{fontSize:10,fontWeight:700,color:"#f97316",background:"rgba(249,115,22,0.12)",
                border:"1px solid rgba(249,115,22,0.3)",borderRadius:20,padding:"1px 7px",flexShrink:0}}>
                🛵 DOMICILIO
              </span>
            )}
            {m.ia?.tipo_consegna==="RITIRO" && (
              <span style={{fontSize:10,fontWeight:700,color:"#22c55e",background:"rgba(34,197,94,0.1)",
                border:"1px solid rgba(34,197,94,0.25)",borderRadius:20,padding:"1px 7px",flexShrink:0}}>
                🏪 RITIRO
              </span>
            )}
            {m.ia?.hora && (
              <span style={{fontSize:11,color:"#888"}}>🕐 {m.ia.hora}</span>
            )}
          </div>
          <div style={{color:isNew?"#D0D0D0":"#888",fontSize:14,fontWeight:isNew?500:400,
            lineHeight:1.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
            letterSpacing:.1}}>{m.txt}</div>
          {waiting && (
            <div style={{marginTop:5,display:"flex",alignItems:"center",gap:5}}>
              <span style={{fontSize:11}}>⏳</span>
              <span style={{color:"#888",fontSize:11,fontWeight:600}}>En espera de respuesta</span>
            </div>
          )}
          {!waiting&&!isAdicion&&cache?.generando&&(
            <div style={{marginTop:5,display:"flex",alignItems:"center",gap:5}}>
              <span style={{color:C.blu,fontSize:11,animation:"pulse 1s infinite"}}>⟳</span>
              <span style={{color:C.blu,fontSize:11,fontWeight:600}}>Generando respuesta IA...</span>
            </div>
          )}
          {!waiting&&!isAdicion&&cache&&!cache.generando&&cache.testo&&(
            <div style={{marginTop:5,display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:C.verde}}/>
              <span style={{color:C.verde,fontSize:11,fontWeight:700}}>Respuesta lista</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


export default PreguntaCard;
