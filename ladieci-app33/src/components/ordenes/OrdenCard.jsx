import { useState } from 'react';
import { C, tot, calcTotale, DELIVERY_FEE } from '../../constants';
import Chip from '../ui/Chip';
import { ZONE_DELIVERY, ZonaBadge } from '../../zones';
import { ORDER_STATES } from '../../core/orders';

const OrdenCard = ({o, onModifica, accentColor, hasAlert, onElimina, onConfirm, onForzarEntrega, vipIds, loadingIds = new Set()}) => {
  const busy = loadingIds.has(o.id);
  const isVip = !!(o.cliente_id && vipIds && vipIds.has && vipIds.has(o.cliente_id));
  const [confirmDel, setConfirmDel] = useState(false);
  // Normalizza items — può arrivare come stringa JSON dal backend.
  // Filtriamo via il fake item "Entrega a domicilio" per record legacy.
  const safeItems = (() => {
    if (!o.items) return [];
    const arr = Array.isArray(o.items)
      ? o.items
      : (typeof o.items === "string" ? (() => { try { return JSON.parse(o.items); } catch(e) { return []; } })() : []);
    return (Array.isArray(arr) ? arr : []).filter(i => i.n !== "Entrega a domicilio");
  })();

  const estado = o.estado;
  const isListo    = estado === ORDER_STATES.LISTO;
  const isRetirado = estado === ORDER_STATES.RETIRADO;
  const isCocina   = estado === ORDER_STATES.EN_COCINA;
  // Totale: prima sorgente è o.totale (calcolato dal backend). Fallback se manca (ordini legacy).
  const totaleNum = (Number(o.totale) > 0)
    ? Number(o.totale)
    : calcTotale(safeItems, o.tipo_consegna);
  const totale = totaleNum.toFixed(2);

  // Scala blu: POR_CONFIRMAR=turchese → EN_COCINA=blu medio → LISTO=blu dimmer → RETIRADO=notte
  const styles = {
    [ORDER_STATES.POR_CONFIRMAR]: {
      bg:     "linear-gradient(145deg,rgba(6,182,212,0.78) 0%,rgba(14,165,233,0.58) 50%,rgba(3,105,161,0.72) 100%)",
      border: "1.5px solid rgba(103,232,249,0.85)",
      glow:   "0 0 20px rgba(6,182,212,0.45), 0 6px 26px rgba(14,165,233,0.28), inset 0 1px 0 rgba(186,230,253,0.22)",
      shimmer:"rgba(103,232,249,0.45)",
      text:   "#E0F9FF",
      items:  "rgba(224,248,255,0.82)",
      price:  "#67E8F9",
      tel:    "#7DD3FC",
      ora:    "#A5B4FC",
      opacity:1,
      badge: <span style={{background:"rgba(6,182,212,0.28)",color:"#22D3EE",border:"1.5px solid rgba(103,232,249,0.55)",borderRadius:20,padding:"3px 11px",fontSize:12,fontWeight:800}}>⏳ Confirmando</span>,
    },
    [ORDER_STATES.EN_COCINA]: {
      bg:     "linear-gradient(145deg,rgba(29,78,216,0.78) 0%,rgba(37,99,235,0.58) 50%,rgba(17,50,160,0.72) 100%)",
      border: "1.5px solid rgba(96,165,250,0.82)",
      glow:   "0 0 18px rgba(59,130,246,0.45), 0 6px 24px rgba(29,78,216,0.30), inset 0 1px 0 rgba(147,197,253,0.20)",
      shimmer:"rgba(147,197,253,0.40)",
      text:   "#DBEAFE",
      items:  "rgba(219,234,254,0.80)",
      price:  "#93C5FD",
      tel:    "#93C5FD",
      ora:    "#C4B5FD",
      opacity:1,
      badge: <span style={{background:"rgba(37,99,235,0.30)",color:"#93C5FD",border:"1.5px solid rgba(96,165,250,0.50)",borderRadius:20,padding:"3px 11px",fontSize:12,fontWeight:800,boxShadow:"0 0 8px rgba(59,130,246,0.35)"}}>🔥 Cocina</span>,
    },
    [ORDER_STATES.LISTO]: {
      bg:     "linear-gradient(145deg,rgba(30,58,138,0.78) 0%,rgba(29,78,216,0.50) 50%,rgba(17,50,130,0.70) 100%)",
      border: "1.5px solid rgba(59,130,246,0.62)",
      glow:   "0 4px 20px rgba(29,78,216,0.22), inset 0 1px 0 rgba(147,197,253,0.12)",
      shimmer:"rgba(100,149,237,0.25)",
      text:   "rgba(186,220,255,0.85)",
      items:  "rgba(165,200,245,0.65)",
      price:  "rgba(100,160,240,0.80)",
      tel:    "rgba(100,149,237,0.65)",
      ora:    "rgba(150,130,210,0.60)",
      opacity:1,
      badge: <span style={{background:"rgba(29,78,216,0.25)",color:"rgba(147,197,253,0.85)",border:"1px solid rgba(59,130,246,0.38)",borderRadius:20,padding:"3px 11px",fontSize:12,fontWeight:700}}>✅ Listo</span>,
    },
    [ORDER_STATES.RETIRADO]: {
      bg:     "linear-gradient(145deg,rgba(15,23,60,0.88) 0%,rgba(20,30,80,0.78) 50%,rgba(10,16,45,0.90) 100%)",
      border: "1.5px solid rgba(30,50,120,0.40)",
      glow:   "0 4px 14px rgba(10,16,60,0.50), inset 0 1px 0 rgba(255,255,255,0.04)",
      shimmer:"rgba(60,80,160,0.18)",
      text:   "rgba(140,165,210,0.60)",
      items:  "rgba(110,140,190,0.42)",
      price:  "rgba(80,110,180,0.50)",
      tel:    "rgba(80,110,180,0.40)",
      ora:    "rgba(100,90,160,0.40)",
      opacity:0.72,
      badge: <span style={{background:"rgba(20,35,90,0.50)",color:"rgba(120,150,200,0.70)",border:"1px solid rgba(50,80,160,0.30)",borderRadius:20,padding:"3px 11px",fontSize:12,fontWeight:600}}>✅ Entregado</span>,
    },
  };
  const s = styles[estado] || styles[ORDER_STATES.POR_CONFIRMAR];
  const zonaColore = o.tipo_consegna === "DOMICILIO" && o.zona
    ? (ZONE_DELIVERY.find(z => z.id === o.zona)?.colore || null)
    : null;

  return (
  <div style={{
    background:s.bg,
    backdropFilter:"blur(28px) saturate(1.8)",
    WebkitBackdropFilter:"blur(28px) saturate(1.8)",
    border: hasAlert ? "2px solid #E8341C" : zonaColore ? `3px solid ${zonaColore}` : s.border,
    borderRadius:18,padding:"14px 18px",cursor:"pointer",
    boxShadow: hasAlert
      ? `0 0 18px #E8341C88, ${s.glow}`
      : zonaColore
        ? `0 0 0 1px ${zonaColore}55, 0 0 16px ${zonaColore}88, 0 0 32px ${zonaColore}33, ${s.glow}`
        : s.glow,
    position:"relative",overflow:"hidden",
    opacity:s.opacity,
  }} onClick={()=>onModifica({...o,items:safeItems})}>
    <div style={{position:"absolute",top:0,left:"6%",right:"6%",height:1,
      background:`linear-gradient(90deg,transparent,${s.shimmer},transparent)`,pointerEvents:"none"}}/>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7,flexWrap:"wrap"}}>
      <span style={{fontFamily:"'DM Mono',monospace",fontWeight:800,color:s.text,fontSize:16}}>{o.id}</span>
      <span style={{color:s.text,fontWeight:700}}>
        👤 {o.nombre}
        {isVip && <span title="Cliente VIP" style={{marginLeft:4,color:"#FACC15",filter:"drop-shadow(0 0 3px rgba(250,204,21,0.6))"}}>⭐</span>}
      </span>
      {/* Badge 🛵 domicilio — visibile a colpo d'occhio */}
      {o.tipo_consegna==="DOMICILIO" && (
        <span style={{
          background:"rgba(249,115,22,0.2)", color:"#fb923c",
          border:"1.5px solid rgba(249,115,22,0.5)",
          borderRadius:20, padding:"3px 10px",
          fontSize:12, fontWeight:800, letterSpacing:.3
        }}>🛵 Entrega</span>
      )}
      {/* Badge zona */}
      {o.tipo_consegna==="DOMICILIO" && o.zona && (() => {
        const zona = ZONE_DELIVERY.find(z => z.id === o.zona);
        return zona ? <ZonaBadge zona={zona} size="sm" /> : null;
      })()}
      {s.badge}
      {o.ya_pagado && (
        <span style={{
          background: o.metodo_pago === "tarjeta" ? "rgba(37,99,235,0.30)" : "rgba(22,163,74,0.30)",
          color: o.metodo_pago === "tarjeta" ? "#93C5FD" : "#4ADE80",
          border: o.metodo_pago === "tarjeta" ? "1.5px solid rgba(96,165,250,0.55)" : "1.5px solid rgba(74,222,128,0.55)",
          borderRadius:20, padding:"3px 10px", fontSize:12, fontWeight:800
        }}>
          {o.metodo_pago === "tarjeta" ? "💳" : "💵"} Ya pagado
        </span>
      )}
      {hasAlert&&<span style={{background:"#E8341C",color:"#fff",borderRadius:20,padding:"3px 10px",fontSize:13,fontWeight:900,animation:"livePulse 1s infinite",boxShadow:"0 0 12px #E8341Ccc",letterSpacing:.5}}>⚠️⚠️ AGGIUNTA!</span>}
      <span style={{marginLeft:"auto",background:"rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.28)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8,padding:"4px 10px",fontSize:12,fontWeight:600}}>✏️ Editar</span>
    </div>
    <div style={{fontSize:13,marginBottom:7,display:"flex",flexDirection:"column",gap:2,lineHeight:1.5}}>
      {safeItems.map((it,idx)=>(
        <span key={idx} style={{color:s.items}}>
          {it.e||""} {it.q}× {it.n}
          {it.sub&&<span style={{color:"#FCA5A5",fontWeight:700}}> — {it.sub}</span>}
        </span>
      ))}
      {o.tipo_consegna==="DOMICILIO" && (
        <span style={{color:s.items}}>🛵 1× Entrega a domicilio</span>
      )}
    </div>
    <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"center"}}>
      {o.tel&&<span style={{color:s.tel,fontSize:12}}>📞 {o.tel}</span>}
      {o.hora&&<span style={{color:s.ora,fontSize:12}}>🕐 {o.hora}</span>}
      {Number(o.descuento_importe) > 0 && (
        <span style={{
          background:"rgba(245,158,11,0.18)", border:"1px solid rgba(245,158,11,0.5)",
          color:"#FBBF24", fontSize:10, fontWeight:800, letterSpacing:.3,
          borderRadius:6, padding:"2px 6px", fontFamily:"'DM Mono',monospace"
        }}>-{Number(o.descuento_importe).toFixed(2)}€ desc</span>
      )}
      <span style={{color:s.price,fontWeight:800,fontFamily:"'DM Mono',monospace",fontSize:14,marginLeft:"auto"}}>{totale}€</span>
    </div>
    {/* Riga indirizzo — solo se è una consegna a domicilio */}
    {o.tipo_consegna==="DOMICILIO" && o.direccion && (
      <div style={{
        marginTop:7, padding:"6px 10px",
        background:"rgba(249,115,22,0.1)",
        border:"1px solid rgba(249,115,22,0.3)",
        borderRadius:9, fontSize:12,
        color:"#fdba74", fontWeight:600,
        display:"flex", alignItems:"center", gap:6
      }}>
        <span>📍</span>
        <span style={{flex:1}}>{o.direccion}{o.direccion_note && ` · ${o.direccion_note}`}</span>
      </div>
    )}
    {/* ── Forzar entrega (DOMICILIO + LISTO, fallback operatore) ── */}
    {onForzarEntrega && o.tipo_consegna === "DOMICILIO" && estado === ORDER_STATES.LISTO && (
      <div style={{marginTop:8,display:"flex",justifyContent:"flex-end"}} onClick={e=>e.stopPropagation()}>
        <button
          onClick={()=>{ if (!busy) onForzarEntrega(o.id); }}
          disabled={busy}
          style={{
            background:"rgba(249,115,22,0.10)",
            color: busy ? "rgba(249,115,22,0.35)" : "rgba(249,115,22,0.75)",
            border: `1px solid rgba(249,115,22,${busy ? 0.15 : 0.30})`,
            borderRadius:9, padding:"5px 14px",
            fontWeight:700, fontSize:12,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.7 : 1,
            display:"flex", alignItems:"center", gap:5
        }}>{busy ? "Forzando…" : "🛵 Forzar entrega"}</button>
      </div>
    )}
    {/* ── Conferma → Cucina (solo POR_CONFIRMAR; disabilitato finché _temp:
            l'id è ancora client-side, updateEstado fallirebbe contro un id sconosciuto
            al backend e dopo il reassign dell'id il patch ottimistico resterebbe orfano,
            facendo rimbalzare l'ordine in tab Telefono al primo refetch.) ── */}
    {onConfirm && estado === ORDER_STATES.POR_CONFIRMAR && (
      <div style={{marginTop:8,display:"flex",justifyContent:"flex-end"}} onClick={e=>e.stopPropagation()}>
        <button
          onClick={()=>{ if (!o._temp && !busy) onConfirm(o.id); }}
          disabled={!!o._temp || busy}
          title={o._temp ? "Guardando pedido…" : (busy ? "Confirmando…" : "Mandar a cocina")}
          style={{
            background: (o._temp || busy)
              ? "rgba(255,255,255,0.05)"
              : "linear-gradient(135deg,rgba(6,182,212,0.35),rgba(14,165,233,0.25))",
            color: (o._temp || busy) ? "rgba(255,255,255,0.35)" : "#FDB975",
            border: (o._temp || busy) ? "1.5px solid rgba(255,255,255,0.12)" : "1.5px solid rgba(251,146,60,0.65)",
            borderRadius:10, padding:"8px 20px",
            fontWeight:800, fontSize:13, letterSpacing:.3,
            boxShadow: (o._temp || busy) ? "none" : "0 2px 10px rgba(251,146,60,0.25)",
            cursor: (o._temp || busy) ? "wait" : "pointer",
            opacity: (o._temp || busy) ? 0.6 : 1,
            display:"flex", alignItems:"center", gap:6
          }}>{o._temp ? "⏳ Guardando…" : (busy ? "Confirmando…" : "🚀 A Cocina")}</button>
      </div>
    )}
    {/* ── Cestino elimina ── */}
    {onElimina && (
      <div style={{marginTop:10,display:"flex",justifyContent:"flex-end"}}
        onClick={e=>e.stopPropagation()}>
        {confirmDel
          ? <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{color:"rgba(255,100,100,0.80)",fontSize:12}}>¿Eliminar pedido?</span>
              <button onClick={()=>{ setConfirmDel(false); onElimina(o.id); }}
                style={{background:"#E8341C",color:"#fff",border:"none",borderRadius:8,
                  padding:"5px 14px",fontWeight:800,fontSize:12,cursor:"pointer",
                  boxShadow:"0 2px 8px rgba(232,52,28,0.45)"}}>
                Sí, eliminar
              </button>
              <button onClick={()=>setConfirmDel(false)}
                style={{background:"rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.55)",
                  border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,
                  padding:"5px 12px",fontWeight:600,fontSize:12,cursor:"pointer"}}>
                Cancelar
              </button>
            </div>
          : <button onClick={()=>setConfirmDel(true)}
              style={{background:"rgba(232,52,28,0.10)",color:"rgba(255,100,100,0.70)",
                border:"1px solid rgba(232,52,28,0.25)",borderRadius:8,
                padding:"5px 12px",fontWeight:600,fontSize:12,cursor:"pointer",
                display:"flex",alignItems:"center",gap:5}}>
              🗑 Eliminar
            </button>}
      </div>
    )}
  </div>
  );
};


export default OrdenCard;
