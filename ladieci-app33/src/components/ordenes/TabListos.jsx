import { useState } from 'react';
import { C, tot, MAX_PIZZE_ORA, MENU, calcTotale, aplicarDescuento } from '../../constants';
import Chip from '../ui/Chip';
import Badge from '../ui/Badge';
import DescuentoInput from '../ui/DescuentoInput';
import { ZONE_DELIVERY, ZonaBadge } from '../../zones';
import { ORDER_STATES } from '../../core/orders';

const isPizzaItem = (it) => {
  if (!it || !it.n) return false;
  if (it.n === "Entrega a domicilio") return false;
  const cat = it.cat || "Pizzas";
  if (cat === "Bebidas") return false;
  if (cat === "Postres" && it.n !== "Pizza Nutella") return false;
  return true;
};

const TabListos = ({ordenes,onRetirado,onVolverACocina,loadingIds=new Set(),waMsgs=[],onViewChat,onCambiaPago,vipIds}) => {
  const [pendingPago,      setPendingPago]      = useState(null);
  const [filterPago,       setFilterPago]       = useState("todos");
  const [pendingCambioPago, setPendingCambioPago] = useState(null); // id ordine in modifica
  // Descuento applicato durante il flow RETIRADO, per-ordine. Reset alla chiusura del popup.
  const [descuentoPago,    setDescuentoPago]    = useState({}); // { [ordenId]: {tipo, valor} }
  const setDescuentoFor = (id, tipo, valor) => {
    setDescuentoPago(prev => ({ ...prev, [id]: { tipo, valor } }));
  };
  const getDescuentoFor = (id) => descuentoPago[id] || { tipo: null, valor: 0 };
  const handleRetirado = (o, metodo, descuento) => {
    onRetirado(o.id, metodo, descuento);
  };
  const handleVolverACocina = (o) => {
    if (!window.confirm("¿Volver el pedido a cocina? Esta acción quitará el pedido de Listos y lo devolverá a Cocina.")) return;
    onVolverACocina && onVolverACocina(o.id, {
      origin: "TabListos",
      actor: "operador",
      reason: "manual_operator_rollback",
    });
  };

  const listos    = ordenes.filter(o=>o.estado===ORDER_STATES.LISTO || o.estado===ORDER_STATES.EN_ENTREGA);
  const retirados = ordenes.filter(o=>o.estado===ORDER_STATES.RETIRADO);
  const tutti     = [...listos, ...retirados];

  // 3D Glass styles
  const glassListo = {
    background: "linear-gradient(145deg, rgba(34,197,94,0.42) 0%, rgba(22,163,74,0.28) 45%, rgba(15,107,50,0.38) 100%)",
    backdropFilter: "blur(24px) saturate(2.0) brightness(1.12)",
    WebkitBackdropFilter: "blur(24px) saturate(2.0) brightness(1.12)",
    border: "1.5px solid rgba(34,197,94,0.60)",
    boxShadow: "0 6px 28px rgba(34,197,94,0.28), inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -1px 0 rgba(0,0,0,0.18)",
  };
  const glassRetirado = {
    background: "linear-gradient(145deg, rgba(249,115,22,0.38) 0%, rgba(234,88,12,0.24) 45%, rgba(154,52,6,0.34) 100%)",
    backdropFilter: "blur(24px) saturate(1.8) brightness(1.05)",
    WebkitBackdropFilter: "blur(24px) saturate(1.8) brightness(1.05)",
    border: "1.5px solid rgba(249,115,22,0.50)",
    boxShadow: "0 4px 20px rgba(249,115,22,0.20), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.15)",
    opacity: 0.82,
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {tutti.length===0
        ?<div style={{background:C.carbone,borderRadius:14,border:`1px solid ${C.fumo}`,
          padding:"40px 0",textAlign:"center",color:C.verde,fontSize:15,fontWeight:600}}>
          ✅ Todo entregado</div>
        :tutti.map(o=>{
          const isDone = o.estado===ORDER_STATES.RETIRADO;
          const cardStyle = isDone ? glassRetirado : glassListo;
          // Sorgente di verità: o.totale salvato dal backend. Fallback per ordini legacy.
          const cleanItems = (Array.isArray(o.items) ? o.items : []).filter(i => i.n !== "Entrega a domicilio");
          const totaleNum = (Number(o.totale) > 0) ? Number(o.totale) : calcTotale(cleanItems, o.tipo_consegna);
          const totale = totaleNum.toFixed(2);
          return (
            <div key={o.id}
              onClick={isDone && onViewChat ? () => onViewChat(o.wa_id||o.tel) : undefined}
              style={{
                ...cardStyle,
                borderRadius:16,
                padding:"16px 18px",
                display:"flex",alignItems:"center",gap:14,
                cursor: isDone && onViewChat ? "pointer" : "default",
              }}>
              <div style={{flex:1}}>
                {/* Riga 1: ID + Nome + Badge */}
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}>
                  <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,
                    color:"#FFFFFF",fontSize:17,textShadow:"0 1px 3px rgba(0,0,0,0.5)"}}>{o.id}</span>
                  <span style={{color:"#FFFFFF",fontWeight:700,textShadow:"0 1px 3px rgba(0,0,0,0.4)"}}>
                    👤 {o.nombre}
                    {o.cliente_id && vipIds && vipIds.has && vipIds.has(o.cliente_id) && (
                      <span title="Cliente VIP" style={{marginLeft:4,color:"#FACC15",filter:"drop-shadow(0 0 3px rgba(250,204,21,0.6))"}}>⭐</span>
                    )}
                  </span>
                  {isDone
                    ? <span style={{background:"rgba(255,255,255,0.20)",color:"#FFFFFF",
                        border:"1px solid rgba(255,255,255,0.35)",borderRadius:20,
                        padding:"2px 9px",fontSize:11,fontWeight:700}}>✅ Entregado</span>
                    : <span style={{background:"rgba(0,0,0,0.25)",color:"#FFFFFF",
                        border:"1px solid rgba(255,255,255,0.30)",borderRadius:20,
                        padding:"2px 9px",fontSize:11,fontWeight:700}}>
                        {o.canal==="WA"?"💬 WA":"📞 Tel"}
                      </span>}
                  {o.ya_pagado && (
                    <span style={{
                      background: o.metodo_pago==="tarjeta" ? "rgba(37,99,235,0.35)" : "rgba(22,163,74,0.35)",
                      color:"#fff", border: o.metodo_pago==="tarjeta"
                        ? "1px solid rgba(96,165,250,0.6)" : "1px solid rgba(74,222,128,0.6)",
                      borderRadius:20, padding:"2px 9px", fontSize:11, fontWeight:700
                    }}>
                      {o.metodo_pago==="tarjeta" ? "💳" : "💵"} Ya pagado
                    </span>
                  )}
                  {/* Badge zona */}
                  {o.tipo_consegna==="DOMICILIO" && o.zona && (() => {
                    const zona = ZONE_DELIVERY.find(z => z.id === o.zona);
                    return zona ? <ZonaBadge zona={zona} size="sm" /> : null;
                  })()}
                </div>
                {/* Riga 2: Items */}
                <div style={{fontSize:13,marginBottom:6,display:"flex",flexDirection:"column",gap:3}}>
                  {cleanItems.map((it,idx)=>(
                    <span key={idx} style={{color:"rgba(255,255,255,0.92)",fontWeight:500}}>
                      {it.e} {it.q}× {it.n}
                      {it.sub && <span style={{color:"#FFD580",fontWeight:700}}> — {it.sub}</span>}
                    </span>
                  ))}
                  {o.tipo_consegna==="DOMICILIO" && (
                    <span style={{color:"rgba(255,255,255,0.92)",fontWeight:500}}>🛵 1× Entrega a domicilio</span>
                  )}
                </div>
                {/* Riga 3: Tel + Ora + Totale */}
                <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"center"}}>
                  {o.tel&&<span style={{color:"rgba(255,255,255,0.80)",fontSize:12}}>📞 {o.tel}</span>}
                  {o.hora&&<span style={{color:"rgba(255,255,255,0.80)",fontSize:12}}>🕐 {o.hora}</span>}
                  <span style={{color:"#FFFFFF",fontWeight:800,fontFamily:"'DM Mono',monospace",fontSize:15}}>
                    {totale}€
                  </span>
                </div>
              </div>
              {/* Badge pagamento cliccabile per ordini RETIRADO */}
              {isDone && onCambiaPago && (
                pendingCambioPago === o.id ? (
                  <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0,alignItems:"center"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.8)",marginBottom:2}}>¿Cambiar pago?</div>
                    <div style={{display:"flex",gap:7}}>
                      <button
                        onClick={e=>{e.stopPropagation();onCambiaPago(o.id,"efectivo");setPendingCambioPago(null);}}
                        style={{background:"#16A34A",color:"#fff",border:"none",
                          borderRadius:10,padding:"9px 12px",fontWeight:800,fontSize:12,cursor:"pointer",
                          opacity:o.metodo_pago==="efectivo"?0.45:1}}>
                        💵 Efectivo
                      </button>
                      <button
                        onClick={e=>{e.stopPropagation();onCambiaPago(o.id,"tarjeta");setPendingCambioPago(null);}}
                        style={{background:"#2563EB",color:"#fff",border:"none",
                          borderRadius:10,padding:"9px 12px",fontWeight:800,fontSize:12,cursor:"pointer",
                          opacity:o.metodo_pago==="tarjeta"?0.45:1}}>
                        💳 Tarjeta
                      </button>
                      <button
                        onClick={e=>{e.stopPropagation();onCambiaPago(o.id,"bizum");setPendingCambioPago(null);}}
                        style={{background:"#0EA5E9",color:"#fff",border:"none",
                          borderRadius:10,padding:"9px 12px",fontWeight:800,fontSize:12,cursor:"pointer",
                          opacity:o.metodo_pago==="bizum"?0.45:1}}>
                        📱 Bizum
                      </button>
                    </div>
                    <button
                      onClick={e=>{e.stopPropagation();setPendingCambioPago(null);}}
                      style={{background:"transparent",color:"rgba(255,255,255,0.4)",border:"none",
                        fontSize:11,cursor:"pointer",padding:"2px 0"}}>
                      cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={e=>{e.stopPropagation();setPendingCambioPago(o.id);}}
                    style={{
                      background: o.metodo_pago==="tarjeta"?"rgba(37,99,235,0.35)"
                        : o.metodo_pago==="efectivo"?"rgba(22,163,74,0.35)"
                        : o.metodo_pago==="bizum"?"rgba(14,165,233,0.35)"
                        : "rgba(255,255,255,0.10)",
                      border: o.metodo_pago==="tarjeta"?"1.5px solid rgba(96,165,250,0.6)"
                        : o.metodo_pago==="efectivo"?"1.5px solid rgba(74,222,128,0.6)"
                        : o.metodo_pago==="bizum"?"1.5px solid rgba(56,189,248,0.6)"
                        : "1.5px solid rgba(255,255,255,0.25)",
                      borderRadius:10, padding:"9px 13px",
                      color:"#fff", fontWeight:800, fontSize:13,
                      cursor:"pointer", flexShrink:0,
                      display:"flex",alignItems:"center",gap:5
                    }}>
                    {o.metodo_pago==="tarjeta"?"💳 Tarjeta"
                      : o.metodo_pago==="efectivo"?"💵 Efectivo"
                      : o.metodo_pago==="bizum"?"📱 Bizum"
                      : "❓ Sin método"}
                    <span style={{fontSize:10,opacity:.6}}>✎</span>
                  </button>
                )
              )}
              {!isDone && (
                o.tipo_consegna === "DOMICILIO" ? (
                  /* Delivery — completamento gestito dal driver su RepartidorPage */
                  <div style={{
                    display:"flex", flexDirection:"column", alignItems:"center",
                    gap:6, flexShrink:0
                  }}>
                    <div style={{
                      background:"rgba(249,115,22,0.12)",
                      border:"1.5px solid rgba(249,115,22,0.40)",
                      borderRadius:11, padding:"10px 16px",
                      color:"#F97316", fontWeight:800, fontSize:13,
                      textAlign:"center", letterSpacing:.3
                    }}>
                      {o.estado === ORDER_STATES.EN_ENTREGA ? "🛵 En camino" : "🛵 Esperando driver"}
                    </div>
                    <div style={{
                      color:"rgba(255,255,255,0.25)", fontSize:10,
                      fontWeight:600, textAlign:"center"
                    }}>
                      Gestión en página driver
                    </div>
                    {o.estado === ORDER_STATES.LISTO && onVolverACocina && (() => { const vBusy = loadingIds.has(o.id); return (
                      <button
                        onClick={e=>{ e.stopPropagation(); if (vBusy) return; handleVolverACocina(o); }}
                        disabled={vBusy}
                        style={{
                          background: vBusy ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.10)", color:"#fff",
                          border: `1.5px solid rgba(255,255,255,${vBusy ? 0.10 : 0.22})`,
                          borderRadius:10, padding:"8px 12px",
                          fontWeight:800, fontSize:12,
                          cursor: vBusy ? "wait" : "pointer",
                          opacity: vBusy ? 0.7 : 1,
                        }}>
                        {vBusy ? "Volviendo…" : "↩ Volver a cocina"}
                      </button>
                    ); })()}
                  </div>
                ) : o.ya_pagado ? (
                  <div style={{display:"flex",flexDirection:"column",gap:8,flexShrink:0,alignItems:"stretch"}}>
                    {o.estado === ORDER_STATES.LISTO && onVolverACocina && (() => { const vBusy = loadingIds.has(o.id); return (
                      <button
                        onClick={e=>{ e.stopPropagation(); if (vBusy) return; handleVolverACocina(o); }}
                        disabled={vBusy}
                        style={{
                          background: vBusy ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.10)", color:"#fff",
                          border: `1.5px solid rgba(255,255,255,${vBusy ? 0.10 : 0.22})`,
                          borderRadius:10, padding:"8px 12px",
                          fontWeight:800, fontSize:12,
                          cursor: vBusy ? "wait" : "pointer",
                          opacity: vBusy ? 0.7 : 1,
                        }}>
                        {vBusy ? "Volviendo…" : "↩ Volver a cocina"}
                      </button>
                    ); })()}
                    {(() => { const busy = loadingIds.has(o.id); return (
                    <button
                      onClick={e=>{ e.stopPropagation(); if (busy) return; handleRetirado(o, o.metodo_pago); }}
                      disabled={busy}
                      style={{
                        background: busy ? `${C.verde}55` : C.verde, color:"#fff", border:"none",
                        borderRadius:11,padding:"13px 20px",fontWeight:800,fontSize:14,
                        boxShadow: busy ? "none" : `0 4px 14px ${C.verde}44`,
                        cursor: busy ? "wait" : "pointer",
                        opacity: busy ? 0.7 : 1,
                      }}>
                      {busy ? "Confirmando…" : "🛍 Retirado"}
                    </button>
                    ); })()}
                  </div>
                ) : pendingPago === o.id ? (
                  (() => {
                    const desc = getDescuentoFor(o.id);
                    const totaleBaseOrd = Number(o.totale) || calcTotale((o.items||[]).filter(it=>it.n!=="Entrega a domicilio"), o.tipo_consegna || "RITIRO");
                    const descPayload = desc.tipo ? { tipo: desc.tipo, valor: desc.valor } : null;
                    const finalizar = (metodo) => {
                      handleRetirado(o, metodo, descPayload);
                      setPendingPago(null);
                      setDescuentoPago(prev => { const p = {...prev}; delete p[o.id]; return p; });
                    };
                    return (
                  <div style={{display:"flex",flexDirection:"column",gap:8,flexShrink:0,alignItems:"stretch",minWidth:240}}>
                    <div style={{maxWidth:280}}>
                      <DescuentoInput
                        tipo={desc.tipo}
                        valor={desc.valor}
                        onChange={(t, v) => setDescuentoFor(o.id, t, v)}
                        totaleBase={totaleBaseOrd}
                        compact
                      />
                    </div>
                    <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.7)",textAlign:"center"}}>¿Cómo paga?</div>
                    {(() => { const pagoBusy = loadingIds.has(o.id); return (
                    <div style={{display:"flex",gap:6,justifyContent:"center"}}>
                      <button
                        onClick={e=>{ e.stopPropagation(); if (pagoBusy) return; finalizar("efectivo"); }}
                        disabled={pagoBusy}
                        style={{background: pagoBusy ? "#16A34A55" : "#16A34A", color:"#fff", border:"none",
                          borderRadius:10,padding:"10px 12px",fontWeight:800,fontSize:12,
                          cursor: pagoBusy ? "wait" : "pointer", opacity: pagoBusy ? 0.7 : 1}}>
                        💵 Efectivo
                      </button>
                      <button
                        onClick={e=>{ e.stopPropagation(); if (pagoBusy) return; finalizar("tarjeta"); }}
                        disabled={pagoBusy}
                        style={{background: pagoBusy ? "#2563EB55" : "#2563EB", color:"#fff", border:"none",
                          borderRadius:10,padding:"10px 12px",fontWeight:800,fontSize:12,
                          cursor: pagoBusy ? "wait" : "pointer", opacity: pagoBusy ? 0.7 : 1}}>
                        💳 Tarjeta
                      </button>
                      <button
                        onClick={e=>{ e.stopPropagation(); if (pagoBusy) return; finalizar("bizum"); }}
                        disabled={pagoBusy}
                        style={{background: pagoBusy ? "#0EA5E955" : "#0EA5E9", color:"#fff", border:"none",
                          borderRadius:10,padding:"10px 12px",fontWeight:800,fontSize:12,
                          cursor: pagoBusy ? "wait" : "pointer", opacity: pagoBusy ? 0.7 : 1}}>
                        📱 Bizum
                      </button>
                    </div>
                    ); })()}
                    <button
                      onClick={e=>{e.stopPropagation();setPendingPago(null);setDescuentoPago(prev => { const p = {...prev}; delete p[o.id]; return p; });}}
                      style={{background:"transparent",color:"rgba(255,255,255,0.4)",border:"none",
                        fontSize:11,cursor:"pointer",padding:"2px 0"}}>
                      cancelar
                    </button>
                  </div>
                    );
                  })()
                ) : (
                  <div style={{display:"flex",flexDirection:"column",gap:8,flexShrink:0,alignItems:"stretch"}}>
                    {o.estado === ORDER_STATES.LISTO && onVolverACocina && (() => { const vBusy = loadingIds.has(o.id); return (
                      <button
                        onClick={e=>{ e.stopPropagation(); if (vBusy) return; handleVolverACocina(o); }}
                        disabled={vBusy}
                        style={{
                          background: vBusy ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.10)", color:"#fff",
                          border: `1.5px solid rgba(255,255,255,${vBusy ? 0.10 : 0.22})`,
                          borderRadius:10, padding:"8px 12px",
                          fontWeight:800, fontSize:12,
                          cursor: vBusy ? "wait" : "pointer",
                          opacity: vBusy ? 0.7 : 1,
                        }}>
                        {vBusy ? "Volviendo…" : "↩ Volver a cocina"}
                      </button>
                    ); })()}
                    <button
                      onClick={e=>{e.stopPropagation();setPendingPago(o.id);}}
                      style={{
                        background:C.verde,color:"#fff",border:"none",
                        borderRadius:11,padding:"13px 20px",fontWeight:800,fontSize:14,
                        boxShadow:`0 4px 14px ${C.verde}44`,cursor:"pointer",
                      }}>
                      🛍 Retirado
                    </button>
                  </div>
                )
              )}
            </div>
          );
        })
      }

      {/* ── RESUMEN DE TURNO ─────────────────────────────────── */}
      {retirados.length > 0 && (() => {
        // Sorgente di verità: o.totale del backend. Mai più ricalcoli locali +2.50.
        const getOrdineTotal = (o) => {
          if (Number(o.totale) > 0) return Number(o.totale);
          const clean = (Array.isArray(o.items)?o.items:[]).filter(i => i.n !== "Entrega a domicilio");
          return calcTotale(clean, o.tipo_consegna);
        };
        const nOrdini     = retirados.length;
        const nPizze      = retirados.reduce((s,o) =>
          s + (Array.isArray(o.items)?o.items:[]).filter(isPizzaItem).reduce((ss,it)=>ss+(parseInt(it.q)||1),0), 0);
        const totEuro     = retirados.reduce((s,o) => s + getOrdineTotal(o), 0);
        const totEfectivo = retirados.filter(o=>o.metodo_pago==="efectivo").reduce((s,o) => s + getOrdineTotal(o), 0);
        const totTarjeta  = retirados.filter(o=>o.metodo_pago==="tarjeta").reduce((s,o) => s + getOrdineTotal(o), 0);
        const totBizum    = retirados.filter(o=>o.metodo_pago==="bizum").reduce((s,o) => s + getOrdineTotal(o), 0);
        // Ordini senza metodo_pago (es. consegne non ancora assegnate)
        const totNoPago   = retirados.filter(o=>!o.metodo_pago).reduce((s,o) => s + getOrdineTotal(o), 0);

        const sep = <span style={{color:"rgba(255,255,255,0.2)",margin:"0 8px"}}>·</span>;
        const mono = {fontFamily:"'DM Mono',monospace",fontWeight:900};

        return (
          <div style={{
            marginTop:14,
            background:"linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))",
            border:"1.5px solid rgba(255,255,255,0.12)",
            borderRadius:16, padding:"12px 18px",
            display:"flex", alignItems:"center", flexWrap:"wrap", gap:4,
          }}>
            <span style={{fontSize:10,fontWeight:800,letterSpacing:"2px",
              textTransform:"uppercase",color:"rgba(255,255,255,0.35)",marginRight:6}}>
              📊
            </span>
            <span style={{...mono,fontSize:15,color:"#fff"}}>{nOrdini}</span>
            <span style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginLeft:3}}>pedidos</span>
            {sep}
            <span style={{...mono,fontSize:15,color:"#fff"}}>{nPizze}</span>
            <span style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginLeft:3}}>pizzas</span>
            {sep}
            <span style={{...mono,fontSize:15,color:"#27AE60"}}>{totEuro.toFixed(2)}€</span>
            <span style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginLeft:3}}>en caja</span>
            {sep}
            <span style={{fontSize:13,color:"rgba(255,255,255,0.5)"}}>💵</span>
            <span style={{...mono,fontSize:15,color:"#4ADE80",marginLeft:4}}>{totEfectivo.toFixed(2)}€</span>
            {sep}
            <span style={{fontSize:13,color:"rgba(255,255,255,0.5)"}}>💳</span>
            <span style={{...mono,fontSize:15,color:"#60A5FA",marginLeft:4}}>{totTarjeta.toFixed(2)}€</span>
            {totBizum > 0 && (<>
              {sep}
              <span style={{fontSize:13,color:"rgba(255,255,255,0.5)"}}>📱</span>
              <span style={{...mono,fontSize:15,color:"#38BDF8",marginLeft:4}}>{totBizum.toFixed(2)}€</span>
            </>)}
            {totNoPago > 0 && (<>
              {sep}
              <span style={{fontSize:13,color:"rgba(255,255,255,0.4)"}}>❓</span>
              <span style={{...mono,fontSize:14,color:"rgba(255,200,100,0.85)",marginLeft:4}}>{totNoPago.toFixed(2)}€</span>
              <span style={{fontSize:11,color:"rgba(255,255,255,0.3)",marginLeft:2}}>s/método</span>
            </>)}
          </div>
        );
      })()}
    </div>
  );
};

// ─── NOTIFICA SONORA ────────────────────────────────────────
const playNotifica = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Due beep brevi — tono pizzeria
    [0, 0.18].forEach(delay => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + delay + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + 0.12);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.15);
    });
  } catch(e) { /* audio non disponibile */ }
};

// ─── HELPERS TIMER CUCINA ────────────────────────────────────
const PREP_MINUTI   = 20; // minuti per preparare un ordine

// Lookup robusto: match per id numerico/stringa, poi per nome esatto, poi per sub
const _normName = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const lookupMenu = (it) => {
  if(!it) return null;
  // 1. Match id (numero o stringa)
  let m = MENU.find(x => x.id === it.id || x.id === Number(it.id) || String(x.id) === String(it.id));
  // 2. Match per nome esatto (case-insensitive)
  if(!m && it.n) m = MENU.find(x => x.n.toLowerCase() === it.n.toLowerCase());
  // 3. Match per nome parziale
  if(!m && it.n) m = MENU.find(x => it.n.toLowerCase().includes(x.n.toLowerCase()) || x.n.toLowerCase().includes(it.n.toLowerCase()));
  // 4. Match normalizzato (accenti, doppie consonanti) — per ordini inseriti manualmente
  if(!m && it.n) {
    const itn = _normName(it.n);
    m = MENU.find(x => {
      const xn = _normName(x.n);
      return itn.includes(xn) || xn.includes(itn) || itn.split(/\s/)[0] === xn.split(/\s/)[0];
    });
  }
  return m || null;
};

const orarioToMs = (horaStr) => {
  if(!horaStr) return null;
  const [hh,mm] = horaStr.split(":").map(Number);
  if(isNaN(hh)||isNaN(mm)) return null;
  const d = new Date();
  d.setHours(hh,mm,0,0);
  return d.getTime();
};

const caricoTotale = (ordenes) => {
  const countItems = (items) => (items||[]).filter(it => {
    const mi = lookupMenu(it);
    const cat = it.cat || mi?.cat || "Pizzas";
    return cat !== "Bebidas" && (cat !== "Postres" || it.n === "Pizza Nutella");
  }).reduce((a,i) => a + (Number(i.q)||1), 0);
  // Conta solo ordini EN_COCINA — carico reale in cucina adesso
  return ordenes
    .filter(o => o.estado === ORDER_STATES.EN_COCINA)
    .reduce((s,o) => s + countItems(o.items), 0);
};

const calcTimer = (o, now) => {
  if(o.hora) {
    const ritiroMs = orarioToMs(o.hora);
    if(ritiroMs) {
      const diffMs  = ritiroMs - now;
      const diffSec = Math.round(diffMs / 1000);
      const absSec  = Math.abs(diffSec);
      const mm = Math.floor(absSec / 60);
      const ss = absSec % 60;
      const scaduto = diffSec < 0;
      // Fasi: timeline reale della pizza (3 stadi visibili + tarde)
      // >10min      → espera: mostra solo orario, NO countdown
      // 6-10min     → preparando: 🥖 PREPARANDO (verde chiaro, stesura impasto)
      // 1-6min      → al_horno: 🔥 AL HORNO (giallo/arancio, in cottura)
      // 0-1min      → lista/para_salir: 🛎 LISTA (RITIRO) o 🛵 PARA SALIR (DOMICILIO)
      // <0          → tarde: ⚠ TARDE (rosso lampeggiante)
      const isDelivery = o.tipo_consegna === "DOMICILIO";
      let fase;
      if(scaduto)       fase = "tarde";
      else if(mm < 1)   fase = isDelivery ? "para_salir" : "lista";
      else if(mm < 6)   fase = "al_horno";
      else if(mm < 10)  fase = "preparando";
      else              fase = "espera";
      const showCountdown = fase !== "espera";
      return { mm, ss, scaduto, fase, showCountdown, conOrario:true,
        imminente: fase==="tarde" || fase==="lista" || fase==="para_salir",
        attenzione: fase==="al_horno" || fase==="preparando"
      };
    }
  }
  // Nessun orario: timer parte dall'ordine, sempre visibile
  const tsValido = o.ts && o.ts > 1000000000000 ? o.ts : now;
  const diffSec = Math.floor((now - tsValido) / 1000);
  const mm = Math.max(0, Math.floor(diffSec / 60));
  const ss = Math.max(0, diffSec % 60);
  // Branch senza orario: usa fasi nuove ma temporizzate "all'incontrario"
  // (qui mm cresce dall'inizio ordine, non decresce verso uscita)
  let fase;
  if(mm >= 15)      fase = "tarde";
  else if(mm >= 10) fase = "al_horno";
  else if(mm >= 5)  fase = "preparando";
  else              fase = "espera";
  return { mm, ss, scaduto: mm>=15, fase, showCountdown:true,
    imminente: mm>=15, attenzione: mm>=5, conOrario:false };
};

// Consolida duplicati in sub: "+Ajo, +Ajo, sin cebolla" → "+Ajo ×2, sin cebolla"
const formatSub = (sub) => {
  if (!sub) return "";
  const parts = sub.split(",").map(s => s.trim()).filter(Boolean);
  const counts = {}, order = [];
  parts.forEach(p => { if (!counts[p]) { counts[p] = 0; order.push(p); } counts[p]++; });
  return order.map(p => counts[p] > 1 ? `${p} ×${counts[p]}` : p).join(", ");
};

// ─── FASE CONFIG — colori timer cucina ───────────────────────
// Timeline reale: PREPARANDO (impasto) → AL HORNO (cottura) → LISTA/PARA SALIR (uscita) → TARDE
// Due varianti per tema:
//   • dark (bg/border/timerColor/labelColor) — usato in PanelCocina (sfondo scuro)
//   • light (bgLight/textLight/timerColorLight/labelColorLight) — usato in TabCocina full-screen (sfondo bianco)
const FASE_CONFIG = {
  espera: {
    bg:"#1C3A2A", border:"#2D6A4A", timerColor:"#52D68A", label:null, labelColor:"#52D68A",
    bgLight:"#BBF7D0", textLight:"#065F46", timerColorLight:"#059669", labelColorLight:"#065F46",
  },
  preparando: {
    bg:"#1C3A2A", border:"#2D6A4A", timerColor:"#52D68A", label:"🥖 PREPARANDO", labelColor:"#A6F0C8",
    bgLight:"#BBF7D0", textLight:"#065F46", timerColorLight:"#059669", labelColorLight:"#065F46",
  },
  al_horno: {
    bg:"#3D2800", border:"#8B5E00", timerColor:"#F5C842", label:"🔥 AL HORNO", labelColor:"#FFE080",
    bgLight:"#FED7AA", textLight:"#7C2D12", timerColorLight:"#D97706", labelColorLight:"#7C2D12",
  },
  lista: {
    bg:"#0E3050", border:"#1A6090", timerColor:"#5BB8F5", label:"🛎 LISTA", labelColor:"#90D0FF",
    bgLight:"#BFDBFE", textLight:"#1E3A8A", timerColorLight:"#2563EB", labelColorLight:"#1E3A8A",
  },
  para_salir: {
    bg:"#0E3050", border:"#1A6090", timerColor:"#5BB8F5", label:"🛵 PARA SALIR", labelColor:"#90D0FF",
    bgLight:"#BFDBFE", textLight:"#1E3A8A", timerColorLight:"#2563EB", labelColorLight:"#1E3A8A",
  },
  tarde: {
    bg:"#1A0000", border:"#880000", timerColor:"#FF2222", label:"⚠ TARDE", labelColor:"#FF8888",
    bgLight:"#FECACA", textLight:"#7F1D1D", timerColorLight:"#DC2626", labelColorLight:"#7F1D1D",
  },
};

// Filtra nota: mostra solo se contiene info utili per il pizzaiolo
// Esclude note tipo "ritiro alle X", "para las X", orari puri
const notaCucina = (nota) => {
  if(!nota) return "";
  const n = nota.toLowerCase();
  // Escludi se è solo un orario o riferimento al ritiro
  if(/^(para las?|a las?|ritiro|recogida|las?\s*\d{1,2}[:.]\d{2}|\d{1,2}[:.]\d{2})/.test(n)) return "";
  if(/^(ordine di grandi|confirmar|pedido grande)/.test(n)) return "";
  // Escludi note di pagamento — non interessano la cucina
  if(/cambio|paga con|efectivo|tarjeta|bizum|paypal|\$|\bpaga\b/.test(n)) return "";
  // Mantieni solo note con ingredienti, allergie, modifiche
  if(n.includes("sin ") || n.includes("con extra") || n.includes("alergi") ||
     n.includes("sin gluten") || n.includes("picante") || n.includes("nota") ||
     n.includes("quitar") || n.includes("agregar") || n.includes("añadir") ||
     n.includes("mitad") || n.includes("bien hecho") || n.includes("poco hecho")) {
    return nota;
  }
  // Se la nota è corta e non contiene orari → mostrala (es. "sin ajo")
  if(nota.length < 60 && !/\d{1,2}[:.]\d{2}/.test(nota)) return nota;
  return "";
};

export { caricoTotale, lookupMenu, orarioToMs, calcTimer, formatSub, FASE_CONFIG, notaCucina };
export default TabListos;
