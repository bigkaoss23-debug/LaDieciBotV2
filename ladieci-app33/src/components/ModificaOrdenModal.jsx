import { useState, useEffect, useRef } from 'react';
import { C, MENU, CATS, tot, useWidth, INGREDIENTI, calcTotale } from '../constants';
import Chip from './ui/Chip';
import PizzaCustomBuilder from './PizzaCustomBuilder';
import { ZONE_DELIVERY, zonaBadgeStyle } from '../zones';
import { api } from '../api';

const ModificaOrdenModal = ({orden, onClose, onSave}) => {
  // Normalizza items: può essere array, stringa JSON, o undefined
  const parseItems = (raw) => {
    if(!raw) return [];
    if(Array.isArray(raw)) return raw.map(i=>({...i, p:parseFloat(i.p||0), q:parseInt(i.q)||1}));
    if(typeof raw === "string") {
      try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr.map(i=>({...i, p:parseFloat(i.p||0), q:parseInt(i.q)||1})) : []; }
      catch(e){ return []; }
    }
    return [];
  };
  const [items, setItems] = useState(()=>parseItems(orden.items));
  const [nota,  setNota]  = useState(String(orden.nota||""));
  const [hora,  setHora]  = useState(String(orden.hora||""));
  const [cat,   setCat]   = useState("Pizzas");
  // ═══ Delivery / Zone state ═══
  const isDelivery = orden.tipo_consegna === "DOMICILIO";
  const [direccion, setDireccion] = useState(String(orden.direccion || ""));
  const initialZona = ZONE_DELIVERY.find(z => z.id === orden.zona) || null;
  const [zonaInfo, setZonaInfo] = useState(initialZona ? {
    zona: initialZona, lat: orden.zona_lat, lon: orden.zona_lon,
    metodo: orden.zona_manuale ? "manual" : "polygon",
    durataAndataMin: orden.durata_andata_min ?? null,
    googleMin: orden.durata_google_min ?? null,
    haversineMin: orden.durata_haversine_min ?? null,
    source: orden.geo_source || null
  } : null);
  const [zonaLoading, setZonaLoading] = useState(false);
  const [zonaManuale, setZonaManuale] = useState(!!orden.zona_manuale);
  const geocodeTimer = useRef(null);
  const direccionOrig = useRef(String(orden.direccion || ""));

  // Debounced geocode quando l'indirizzo cambia (solo DOMICILIO).
  // ENGINE UNICO: stesso resolver del bot WhatsApp e di NuevoPedidoModal.
  useEffect(() => {
    if (!isDelivery) return;
    if (zonaManuale) return;
    if (direccion.trim() === direccionOrig.current.trim() && initialZona) return;
    if (direccion.trim().length < 5) { setZonaInfo(null); return; }
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    setZonaLoading(true);
    geocodeTimer.current = setTimeout(async () => {
      try {
        const res = await api.resolveAddress(direccion, { tel: orden.tel || null });
        if (res && res.zona) {
          const zonaObj = ZONE_DELIVERY.find(z => z.id === res.zona);
          const metodo = res.source === "keyword" ? "keyword"
                       : res.cached ? "cache"
                       : "polygon";
          setZonaInfo({
            zona: zonaObj || null,
            lat: res.lat, lon: res.lon,
            metodo,
            durataAndataMin: res.durataAndataMin ?? null,
            googleMin: res.googleMin ?? null,
            haversineMin: res.haversineMin ?? null,
            source: res.source || null
          });
        } else {
          setZonaInfo(null);
        }
      } catch (e) {
        console.warn("[resolveAddress] failed:", e?.message || e);
        setZonaInfo(null);
      } finally {
        setZonaLoading(false);
      }
    }, 800);
    return () => { if (geocodeTimer.current) clearTimeout(geocodeTimer.current); };
  // eslint-disable-next-line
  }, [direccion, zonaManuale]);

  const [subCat, setSubCat] = useState("Pizza a tu gusto"); // custom pizza sub-view
  const [showIngPanel, setShowIngPanel] = useState(null);
  const w = useWidth();
  const cols = w >= 768 ? 4 : 2;

  const tap = (p) => setItems(prev => {
    const ex = prev.find(i=>i.id===p.id);
    if(ex) return prev.map(i=>i.id===p.id?{...i,q:i.q+1}:i);
    return [...prev,{...p,q:1}];
  });
  const adj = (id,d) => setItems(prev=>
    prev.map(i=>i.id===id?{...i,q:Math.max(0,i.q+d)}:i).filter(i=>i.q>0));
  // Totale = sum(items) + delivery_fee (per DOMICILIO). Sorgente unica: calcTotale.
  const total = calcTotale(items, orden.tipo_consegna).toFixed(2);

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:600,
      display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,
        background:"rgba(0,0,0,.8)",backdropFilter:"blur(4px)"}}/>
      <div onClick={e=>e.stopPropagation()} style={{position:"relative",background:C.carbone,
        borderRadius:"22px 22px 0 0",height:"92vh",display:"flex",
        flexDirection:"column",boxShadow:"0 -10px 40px rgba(0,0,0,.6)",
        animation:"slideUp .3s ease"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"10px 0 4px",flexShrink:0}}>
          <div style={{width:36,height:4,borderRadius:2,background:C.fumo}}/>
        </div>
        <div style={{padding:"8px 18px 12px",borderBottom:`1px solid ${C.fumo}`,
          display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{color:C.bianco,fontWeight:800,fontSize:17}}>✏️ Modifica ordine</div>
            <div style={{color:C.grigio,fontSize:12,marginTop:2}}>{orden.id} · {orden.nombre}</div>
          </div>
          <button onClick={onClose} style={{background:C.fumo,color:C.grigio,border:"none",
            borderRadius:"50%",width:32,height:32,fontSize:16,
            display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
          <div style={{display:"flex",gap:6,padding:"10px 12px",
            borderBottom:`1px solid ${C.fumo}`,overflowX:"auto",flexShrink:0}}>
            {[...CATS,"⭐ Custom"].map(cc=>(
              <button key={cc} onClick={()=>setCat(cc)} style={{
                background:cat===cc
                  ? cc==="⭐ Custom"?"linear-gradient(135deg,#C4A87A,#A0854A)":C.rosso
                  : "transparent",
                border:`1.5px solid ${cat===cc?cc==="⭐ Custom"?"#C4A87A":C.rosso:C.fumo}`,
                color:cat===cc?"#fff":C.grigio,borderRadius:20,
                padding:"6px 16px",fontSize:13,fontWeight:600,
                whiteSpace:"nowrap",flexShrink:0,
                boxShadow:cat===cc&&cc==="⭐ Custom"?"0 3px 12px rgba(196,168,122,0.4)":"none"
              }}>{cc}</button>
            ))}
          </div>
          <div style={{padding:10,overflowY:"auto",flex:1}}>
            {cat !== "⭐ Custom" ? (
              <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:8}}>
                {MENU.filter(m=>m.cat===cat).map(p=>{
                  const s = items.find(i=>String(i.id)===String(p.id));
                  return (
                    <button key={p.id} onClick={()=>tap(p)} style={{
                      background:s?C.rosso+"33":C.carbone2,
                      border:`2px solid ${s?C.rosso:C.fumo}`,
                      borderRadius:14,padding:"14px 8px",
                      display:"flex",flexDirection:"column",
                      alignItems:"center",gap:5,position:"relative",
                      boxShadow:s?`0 4px 16px ${C.rosso}33`:"none"}}>
                      {s&&<span style={{position:"absolute",top:-8,right:-8,
                        background:C.rosso,color:"#fff",border:`2px solid ${C.carbone}`,
                        borderRadius:"50%",width:22,height:22,fontSize:11,fontWeight:900,
                        display:"flex",alignItems:"center",justifyContent:"center"}}>{s.q}</span>}
                      <span style={{fontSize:28}}>{p.e}</span>
                      <span style={{color:C.bianco,fontSize:12,fontWeight:600,
                        textAlign:"center",lineHeight:1.2}}>{p.n}</span>
                      {p.sub&&<span style={{color:C.grigio,fontSize:10,textAlign:"center"}}>{p.sub}</span>}
                      <span style={{color:s?C.avana:C.rosso,fontSize:12,fontWeight:700}}>
                        {p.p.toFixed(2)}€</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* ── PIZZA CUSTOM ── */
              <PizzaCustomBuilder items={items} setItems={setItems}/>
            )}
          </div>
          <div style={{borderTop:`1px solid ${C.fumo}`,background:C.carbone2,
            padding:"12px 14px",flexShrink:0}}>
            {items.length>0&&(
              <div style={{marginBottom:10,maxHeight:280,overflowY:"auto"}}>
                {items.map((it,idx)=>{
                  const itEmoji = (it.e && String(it.e).length<=4) ? it.e : "🍕";
                  const itP = parseFloat(it.p)||0;
                  const itQ = parseInt(it.q)||1;
                  const itId = it.id ?? idx;
                  return (
                  <div key={itId} style={{marginBottom:8,paddingBottom:8,borderBottom:`1px solid ${C.fumo}`}}>
                    {/* Riga qty */}
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      <span style={{fontSize:15}}>{itEmoji}</span>
                      <span style={{color:C.bianco,fontSize:13,flex:1,
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.n}</span>
                      <button onClick={()=>adj(itId,-1)} style={{background:C.fumo,
                        color:C.bianco,border:"none",borderRadius:6,width:26,height:26,
                        fontSize:15,fontWeight:700,display:"flex",alignItems:"center",
                        justifyContent:"center"}}>−</button>
                      <span style={{color:C.bianco,fontWeight:800,minWidth:18,
                        textAlign:"center",fontFamily:"'DM Mono',monospace"}}>{itQ}</span>
                      <button onClick={()=>adj(itId,+1)} style={{background:C.fumo,
                        color:C.bianco,border:"none",borderRadius:6,width:26,height:26,
                        fontSize:15,fontWeight:700,display:"flex",alignItems:"center",
                        justifyContent:"center"}}>+</button>
                      <span style={{color:C.grigio,fontSize:11,minWidth:36,textAlign:"right",
                        fontFamily:"'DM Mono',monospace"}}>{(itP*itQ).toFixed(2)}€</span>
                    </div>
                    {/* Campo variazioni */}
                    <input
                      value={it.sub||""}
                      onChange={e=>setItems(prev=>prev.map((x,j)=>j===idx?{...x,sub:e.target.value}:x))}
                      placeholder="Variaciones (sin cebolla, extra picante...)"
                      style={{width:"100%",marginTop:5,background:"rgba(232,52,28,0.08)",
                        border:`1px solid ${it.sub?"#E8341C88":C.fumo}`,
                        borderRadius:7,color:it.sub?"#E8341C":C.grigio,
                        padding:"5px 9px",fontSize:12,fontWeight:it.sub?700:400,
                        boxSizing:"border-box"}}
                    />
                    {/* Riepilogo extras */}
                    {(()=>{
                      const matches=(it.sub||"").match(/\+[^,]+/g)||[];
                      const counts={};
                      matches.forEach(m=>{const name=m.replace(/^\+/,"").trim();counts[name]=(counts[name]||0)+1;});
                      const extras=Object.entries(counts).map(([name,qty])=>{
                        const ing=INGREDIENTI.find(g=>g.n===name);
                        return{name,qty,prezzo:ing?Math.round(ing.prezzo*qty*100)/100:0,e:ing?ing.e:"➕"};
                      });
                      if(!extras.length) return null;
                      return(
                        <div style={{marginTop:4,background:"rgba(168,85,247,0.08)",borderRadius:7,
                          padding:"5px 9px",border:"1px solid rgba(168,85,247,0.25)"}}>
                          <div style={{color:"#a855f7",fontSize:10,fontWeight:800,marginBottom:2}}>🧩 EXTRAS AÑADIDOS</div>
                          {extras.map((ex,ei)=>(
                            <div key={ei} style={{display:"flex",justifyContent:"space-between",
                              alignItems:"center",fontSize:11,marginBottom:2,gap:6}}>
                              <span style={{color:"#ccc",flex:1}}>{ex.e} {ex.qty}× {ex.name}</span>
                              <span style={{color:"#a855f7",fontWeight:700,fontFamily:"'DM Mono',monospace"}}>+{ex.prezzo.toFixed(2)}€</span>
                              <button onClick={()=>{
                                const ing=INGREDIENTI.find(g=>g.n===ex.name);
                                setItems(prev=>prev.map((x,j)=>{
                                  if(j!==idx) return x;
                                  const parts=(x.sub||"").split(",").map(s=>s.trim()).filter(Boolean);
                                  let rimosso=false;
                                  const newParts=parts.filter(p=>{
                                    if(!rimosso&&p==="+"+ex.name){rimosso=true;return false;}
                                    return true;
                                  });
                                  const newP=ing?Math.round((x.p-ing.prezzo)*100)/100:x.p;
                                  return{...x,sub:newParts.join(", "),p:Math.max(0,newP)};
                                }));
                              }} style={{background:"rgba(232,52,28,0.15)",border:"1px solid rgba(232,52,28,0.4)",
                                borderRadius:5,color:"#E8341C",fontSize:10,fontWeight:800,
                                padding:"2px 6px",cursor:"pointer",flexShrink:0}}>✕</button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {/* Bottone ingrediente extra */}
                    <button
                      onClick={()=>setShowIngPanel(showIngPanel===idx?null:idx)}
                      style={{marginTop:5,background:"rgba(168,85,247,0.12)",
                        border:`1px solid ${showIngPanel===idx?"#a855f7":"rgba(168,85,247,0.3)"}`,
                        borderRadius:7,color:"#a855f7",fontSize:11,fontWeight:700,
                        padding:"4px 10px",cursor:"pointer",width:"100%"}}>
                      {showIngPanel===idx?"✕ Cerrar":"➕ Añadir ingrediente extra"}
                    </button>
                    {showIngPanel===idx&&(
                      <div style={{marginTop:5,background:"rgba(14,14,14,0.95)",borderRadius:10,
                        border:"1px solid rgba(168,85,247,0.3)",padding:"8px",
                        display:"flex",flexWrap:"wrap",gap:5}}>
                        {INGREDIENTI.filter(ing=>ing.prezzo>0).map(ing=>(
                          <button key={ing.id}
                            onClick={()=>{
                              setItems(prev=>prev.map((x,j)=>j===idx?{
                                ...x,
                                p:Math.round((x.p+ing.prezzo)*100)/100,
                                sub:[x.sub,`+${ing.n}`].filter(Boolean).join(", ")
                              }:x));
                              setShowIngPanel(null);
                            }}
                            style={{background:"rgba(168,85,247,0.1)",border:"1px solid rgba(168,85,247,0.35)",
                              borderRadius:7,color:"#ccc",fontSize:11,padding:"5px 8px",cursor:"pointer",
                              display:"flex",alignItems:"center",gap:4}}>
                            <span>{ing.e}</span>
                            <span style={{fontWeight:600}}>{ing.n}</span>
                            <span style={{color:"#a855f7",fontWeight:800}}>+{ing.prezzo.toFixed(2)}€</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
            {/* ═══ Indirizzo + zona (solo DOMICILIO) ═══ */}
            {isDelivery && (
              <div style={{marginBottom:8,display:"flex",flexDirection:"column",gap:6}}>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <span style={{fontSize:13}}>📍</span>
                  <input value={direccion} onChange={e=>{setDireccion(e.target.value);setZonaManuale(false);}}
                    placeholder="Dirección de entrega"
                    style={{flex:1,background:C.carbone,border:`1px solid ${C.fumo}`,
                      borderRadius:8,color:C.bianco,padding:"8px 10px",fontSize:13}}/>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  {zonaLoading ? (
                    <span style={{color:C.grigio,fontSize:11}}>⟳ Detectando zona...</span>
                  ) : zonaInfo?.zona ? (
                    <span style={zonaBadgeStyle(zonaInfo.zona)}>
                      {zonaInfo.zona.id} · {zonaInfo.zona.nome}{zonaManuale ? " ✋" : ""}
                    </span>
                  ) : direccion.trim().length >= 5 ? (
                    <span style={{color:"#F97316",fontSize:11,fontWeight:700}}>⚠ Fuera de zona</span>
                  ) : null}
                  {/* Bottoni zona manuale */}
                  {ZONE_DELIVERY.map(z => (
                    <button key={z.id} type="button"
                      onClick={()=>{
                        setZonaInfo({ zona: z, lat: null, lon: null, metodo: "manual" });
                        setZonaManuale(true);
                      }}
                      style={{
                        background: zonaInfo?.zona?.id===z.id ? z.coloreSfondo : "transparent",
                        border:`1px solid ${zonaInfo?.zona?.id===z.id ? z.colore : C.fumo}`,
                        color: zonaInfo?.zona?.id===z.id ? z.colore : C.grigio,
                        borderRadius:6, padding:"2px 6px", fontSize:10, fontWeight:700, cursor:"pointer"
                      }}>{z.id}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <input value={nota} onChange={e=>setNota(e.target.value)}
                placeholder="📝 Notas..."
                style={{flex:1,background:C.carbone,border:`1px solid ${C.fumo}`,
                  borderRadius:8,color:C.bianco,padding:"8px 10px",fontSize:13}}/>
              <input type="time" value={hora} onChange={e=>setHora(e.target.value)}
                style={{width:95,background:C.carbone,border:`1px solid ${C.fumo}`,
                  borderRadius:8,color:C.bianco,padding:"8px 8px",fontSize:13}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{color:C.grigio,fontSize:11}}>Total</div>
                <div style={{color:C.verde,fontWeight:800,fontSize:20,
                  fontFamily:"'DM Mono',monospace"}}>{total}€</div>
              </div>
              <button onClick={()=>onSave({
                  ...orden, items, nota, hora,
                  ...(isDelivery ? {
                    direccion: direccion || null,
                    zona: zonaInfo?.zona?.id || null,
                    zona_lat: zonaInfo?.lat ?? null,
                    zona_lon: zonaInfo?.lon ?? null,
                    zona_manuale: zonaManuale,
                    durata_andata_min:    zonaInfo?.durataAndataMin ?? null,
                    durata_google_min:    zonaInfo?.googleMin ?? null,
                    durata_haversine_min: zonaInfo?.haversineMin ?? null,
                    geo_source:           zonaInfo?.source || null
                  } : {})
                })}
                disabled={items.length===0}
                style={{background:items.length>0?C.rosso:C.fumo,
                  color:items.length>0?"#fff":C.grigio,border:"none",
                  borderRadius:11,padding:"13px 22px",fontWeight:800,fontSize:14,
                  boxShadow:items.length>0?`0 4px 14px ${C.rosso}55`:"none"}}>
                ✅ Salva modifiche
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── HELPER: ciclo chiuso = ordine pronto da confermare ─────────────

export default ModificaOrdenModal;
