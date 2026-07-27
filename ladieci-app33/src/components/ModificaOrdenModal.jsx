import { useState, useEffect, useRef, useReducer } from 'react';
import { C, tot, useWidth, EXTRAS_DULCES, calcTotale, pizzaLabel, esDulce, findExtra } from '../constants';
import { useMenuData } from '../menu/useMenuData';
// NB: canEditExtras is deliberately NOT used here. This modal has never gated the
// extras button by product type (it renders for every item), and introducing that gate
// would be a behaviour change beyond this port's scope.
import { extrasForProduct } from '../menu/menuAdapter';
// S2-7D4E-A — same canonical lifecycle as NuevoPedidoModal. This modal no longer
// knows draft mode exists; the gateway returns a typed result.
import {
  submissionReducer, initialSubmissionState, runSubmission, PHASE, ACTION, isBusy,
} from '../order/submissionLifecycle';
import { submitOrderPayload } from '../order/persistenceGateway';
import Chip from './ui/Chip';
import PizzaCustomBuilder from './PizzaCustomBuilder';
import { ZONE_DELIVERY, zonaBadgeStyle } from '../zones';
import { api } from '../api';
import CustomerTicketPrintModal from '../printing/components/CustomerTicketPrintModal';

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

  // S2-7D4D — catalogue SOURCE (drop-in). Flag off -> the same static constants this
  // modal already used, so editing existing orders is unchanged. Flag on -> Supabase
  // catalogue for lookup, price and availability. Items ALREADY on the order keep their
  // persisted snapshot values; the catalogue is only consulted for newly added products.
  const { MENU, CATS, INGREDIENTI } = useMenuData();
  const resolveExtra = (name) => (INGREDIENTI || []).find(g => g.n === name) || findExtra(name);
  const [items, setItems] = useState(()=>parseItems(orden.items));
  const [showCustomerTicket, setShowCustomerTicket] = useState(false);
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

  // S2-7D4E-A — same canonical lifecycle as NuevoPedidoModal, so both modals
  // report a blocked/failed save the same way instead of each inventing one.
  const [submission, dispatchSubmission] = useReducer(submissionReducer, initialSubmissionState);
  const savingRef = useRef(false);
  const submitLock = useRef({
    acquire: () => { if (savingRef.current) return false; savingRef.current = true; return true; },
    release: () => { savingRef.current = false; },
  }).current;
  const submissionBusy = isBusy(submission);

  const buildSavePayload = () => ({
    ...orden, items, nota, hora,
    ...(isDelivery ? {
      // Step 2 anti-cerotto: solo input operatore. Il backend
      // (modificaOrdine → resolveDeliveryFields) ri-risolve zona/durata
      // server-side se cambia indirizzo e IGNORA i campi geo/durata del client.
      direccion: direccion || null,
      zona: zonaManuale ? (zonaInfo?.zona?.id || null) : null,
      zona_lat: null,
      zona_lon: null,
      zona_manuale: zonaManuale,
      durata_andata_min:    null,
      durata_google_min:    null,
      durata_haversine_min: null,
      geo_source:           null
    } : {})
  });

  const handleSave = async () => {
    await runSubmission({
      lock: submitLock,
      dispatch: dispatchSubmission,
      buildSnapshot: buildSavePayload,
      validate: (snap) => (snap.items && snap.items.length > 0)
        ? null
        : { code: "empty_order", message: "El pedido no puede quedarse sin productos." },
      persist: (snap) => submitOrderPayload(snap, { persist: () => onSave(snap) }),
    });
  };

  // Only a successful save clears the lifecycle; blocked/error keep the modal
  // open with the edited items intact so nothing the operator did is lost.
  useEffect(() => {
    if (submission.phase !== PHASE.SUCCESS) return;
    dispatchSubmission({ type: ACTION.RESET });
  }, [submission.phase]); // eslint-disable-line

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
                {MENU.filter(m=>m.cat===cat
                  && m.disponible!==false && m.visiblePicker!==false).map(p=>{
                  const s = items.find(i=>String(i.id)===String(p.id));
                  const lbl = pizzaLabel(p);
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
                      <span style={{color:C.bianco,fontSize:12,fontWeight:700,
                        textAlign:"center",lineHeight:1.2}}>{lbl.primary}</span>
                      {lbl.secondary&&<span style={{color:C.grigio,fontSize:10,fontStyle:p.num?"italic":"normal",textAlign:"center"}}>{lbl.secondary}</span>}
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
                        const ing=resolveExtra(name);
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
                                const ing=resolveExtra(ex.name);
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
                      {showIngPanel===idx?"✕ Cerrar":(esDulce(it)?"➕ Añadir extra dulce":"➕ Añadir ingrediente extra")}
                    </button>
                    {showIngPanel===idx&&(
                      <div style={{marginTop:5,background:"rgba(14,14,14,0.95)",borderRadius:10,
                        border:"1px solid rgba(168,85,247,0.3)",padding:"8px",
                        display:"flex",flexWrap:"wrap",gap:5}}>
                        {(Array.isArray(it.extrasPermitidos) && it.extrasPermitidos.length>0
                            ? extrasForProduct(it, INGREDIENTI)
                            : (esDulce(it)?EXTRAS_DULCES:INGREDIENTI)
                          ).filter(ing=>ing.prezzo>0).map(ing=>(
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
                    {/* ── S2-7D4D-FIX1 — INGREDIENTI RIMOSSI, riapribili e modificabili.
                        Un ordine già salvato deve poter mostrare e cambiare le sue
                        rimozioni, altrimenti sarebbero scrivibili una volta sola.
                        Le rimozioni restano fuori da `sub` e non toccano il prezzo. */}
                    {(() => {
                      const base = Array.isArray(it.ingredientesBase) && it.ingredientesBase.length
                        ? it.ingredientesBase
                        : String(it.ing || "").split(",").map(s=>s.trim()).filter(Boolean);
                      const removed = Array.isArray(it.removedIngredients) ? it.removedIngredients : [];
                      // Un ordine storico può portare rimozioni per ingredienti non più
                      // nel catalogo: vanno comunque mostrate, o sparirebbero in silenzio.
                      const orphan = removed.filter(r => !base.includes(r));
                      const all = [...base, ...orphan];
                      if (!all.length) return null;
                      const toggle = (name) => setItems(prev=>prev.map((x,j)=>{
                        if (j!==idx) return x;
                        const cur = Array.isArray(x.removedIngredients)?x.removedIngredients:[];
                        return {...x, removedIngredients: cur.includes(name)
                          ? cur.filter(v=>v!==name) : [...cur, name]};
                      }));
                      return (
                        <div style={{marginTop:5}}>
                          <div style={{fontSize:9,fontWeight:900,letterSpacing:.8,color:"#777",
                            textTransform:"uppercase",marginBottom:4}}>Quitar ingredientes</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                            {all.map(name=>{
                              const off = removed.includes(name);
                              return (
                                <button key={name}
                                  data-testid="modifica-remove-chip"
                                  aria-pressed={off}
                                  onClick={()=>toggle(name)}
                                  style={{background:off?"rgba(220,38,38,0.16)":"rgba(255,255,255,0.04)",
                                    border:`1px solid ${off?"#DC2626":"#333"}`,borderRadius:999,
                                    color:off?"#F87171":"#bbb",fontSize:11,fontWeight:700,
                                    padding:"3px 9px",cursor:"pointer",
                                    textDecoration:off?"line-through":"none"}}>
                                  {off?"✕ ":""}{name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
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
            {/* S2-7D4E-A — single in-modal result surface (same contract as
                NuevoPedidoModal). No native alert for save feedback. */}
            {submission.feedback && (
              <div
                key={submission.feedbackSeq}
                data-testid="submission-feedback"
                data-tone={submission.feedback.tone}
                data-code={submission.feedback.code}
                role="status"
                aria-live="polite"
                style={{
                  marginBottom:8, padding:"9px 12px", borderRadius:9, fontSize:12.5,
                  fontWeight:700, lineHeight:1.35, whiteSpace:"pre-line",
                  background: submission.feedback.tone==="error" ? "rgba(232,52,28,0.14)"
                    : submission.feedback.tone==="warn" ? "rgba(251,191,36,0.14)"
                    : "rgba(59,130,246,0.14)",
                  border:`1.5px solid ${submission.feedback.tone==="error" ? "#E8341C"
                    : submission.feedback.tone==="warn" ? "#fbbf24" : "#3B82F6"}`,
                  color: submission.feedback.tone==="error" ? "#FCA5A5"
                    : submission.feedback.tone==="warn" ? "#fbbf24" : "#93C5FD",
                }}>
                {submission.feedback.message}
              </div>
            )}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <div>
                <div style={{color:C.grigio,fontSize:11}}>Total</div>
                <div style={{color:C.verde,fontWeight:800,fontSize:20,
                  fontFamily:"'DM Mono',monospace"}}>{total}€</div>
              </div>
              {!!String(orden.id ?? "").trim() && !orden._temp && parseItems(orden.items).length > 0 && (
                <button type="button" onClick={() => setShowCustomerTicket(true)}
                  style={{background:"rgba(255,255,255,.08)",color:C.bianco,
                    border:`1px solid ${C.fumo}`,borderRadius:11,padding:"13px 16px",
                    fontWeight:800,fontSize:13}}>
                  🖨 Imprimir ticket
                </button>
              )}
              <button onClick={handleSave}
                data-phase={submission.phase}
                disabled={items.length===0 || submissionBusy}
                style={{background:(items.length>0 && !submissionBusy)?C.rosso:C.fumo,
                  color:(items.length>0 && !submissionBusy)?"#fff":C.grigio,border:"none",
                  borderRadius:11,padding:"13px 22px",fontWeight:800,fontSize:14,
                  boxShadow:(items.length>0 && !submissionBusy)?`0 4px 14px ${C.rosso}55`:"none"}}>
                {submission.phase === PHASE.SUBMITTING ? "Guardando…"
                  : submission.phase === PHASE.ERROR ? "↻ Reintentar"
                  : "✅ Salva modifiche"}
              </button>
            </div>
          </div>
        </div>
      </div>
      {showCustomerTicket && (
        <CustomerTicketPrintModal order={orden} onClose={() => setShowCustomerTicket(false)} />
      )}
    </div>
  );
};

// ─── HELPER: ciclo chiuso = ordine pronto da confermare ─────────────

export default ModificaOrdenModal;
