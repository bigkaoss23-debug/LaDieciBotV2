import { useState, useEffect } from 'react';
import { C, tot, useWidth, MENU } from '../../constants';
import { sb, api } from '../../api';
import Suoni from '../../sounds';
import { lookupMenu, orarioToMs, calcTimer, formatSub, FASE_CONFIG, notaCucina } from '../ordenes/TabListos';
import { ZONE_DELIVERY, tempoAndata } from '../../zones';
import { applyUiOffset } from '../../utils/uiOffset';
import SnoozeButton from '../ui/SnoozeButton';
import { ORDER_STATES } from '../../core/orders';
import {
  buildManualGiroMetaById,
  formatManualGiroLabel,
  getManualGiroForOrder,
  manualGiroBadgeStyle,
  manualGiroSortAnchorMs
} from './manualGiroCocina';

// hora = orario consegna cliente → horaForno = hora − tempoAndata(ordine)
// = orario in cui la pizza esce dal forno = momento partenza driver.
// Il margine di cottura è gestito a monte dal sistema slot (NuevoPedidoModal + getCaricoForno).
const subtractMinutes = (hora, min) => {
  if (!hora || !min) return null;
  const [hh, mm] = hora.split(":").map(Number);
  const tot = hh * 60 + mm - min;
  if (tot < 0) return null;
  return `${String(Math.floor(tot / 60)).padStart(2,"0")}:${String(tot % 60).padStart(2,"0")}`;
};


const TabCocina = ({ordenes,onListo,loadingIds=new Set(),msgsPreguntas=[],pizzeFatte=0}) => {
  const [now, setNow] = useState(Date.now());
  const [editId, setEditId]       = useState(null);
  const [editNota, setEditNota]   = useState("");
  const [editHora, setEditHora]   = useState("");
  const [saving, setSaving]       = useState(false);
  const [anyadirId, setAnyadirId]         = useState(null);
  const [anyadirCat, setAnyadirCat]       = useState("Pizzas");
  const [anyadirItems, setAnyadirItems]   = useState([]);
  const [anyadirSaving, setAnyadirSaving] = useState(false);
  const [manualGiros, setManualGiros] = useState([]);
  // Override locale ottimistico per ui_offset_min — il polling/WS poi sincronizza
  const [localOffsets, setLocalOffsets] = useState({});
  const handleOffsetChange = (id, val) => {
    setLocalOffsets(prev => ({ ...prev, [id]: val }));
  };
  const handleListo = (o) => {
    onListo(o.id, {
      origin: "TabCocina",
      actor: "cocina",
    });
  };

  useEffect(()=>{
    const i = setInterval(()=>setNow(Date.now()),1000);
    return()=>clearInterval(i);
  },[]);

  useEffect(() => {
    let mounted = true;
    const safeLoad = async () => {
      try {
        const res = await api.getManualGiros();
        if (!mounted) return;
        if (Array.isArray(res)) setManualGiros(res);
        else if (res && res.error) console.warn("[cocina manualGiros] fetch error:", res.error);
      } catch (e) {
        console.warn("[cocina manualGiros] fetch threw:", (e && e.message) || e);
      }
    };
    safeLoad();
    const poll = setInterval(safeLoad, 10000);
    return () => { mounted = false; clearInterval(poll); };
  }, []);

  // La campanella suona solo quando il pizzaiolo schiaccia LISTO — sotto, sul click del bottone.
  // Nessun trigger automatico sui cambi di fase (toglie rumore e lascia il controllo al pizzaiolo).

  const openEdit = (o) => {
    setEditId(o.id);
    setEditNota(o.nota_cucina || "");
    setEditHora(o.hora || "");
  };
  const saveEdit = async () => {
    setSaving(true);
    try {
      await api.post({ action: "updateNotaCucina", id: editId, nota_cucina: editNota });
      if (editHora) await api.post({ action: "modificaOrdine", id: editId, hora: editHora });
    } catch(e) { console.error(e); }
    setSaving(false);
    setEditId(null);
  };

  // ─── AÑADIR MANUAL ──────────────────────────────────────────────────
  const openAnyadir = (o) => {
    setAnyadirId(o.id);
    setAnyadirItems([...(o.items||[])]);
    setAnyadirCat("Pizzas");
    setEditId(null); // chiude eventuale pannello edit
  };
  const tapAnyadir = (p) => {
    setAnyadirItems(prev => {
      const idx = prev.findIndex(i => String(i.id)===String(p.id) || i.n===p.n);
      if (idx >= 0) {
        const u = [...prev];
        u[idx] = {...u[idx], q: u[idx].q + 1};
        return u;
      }
      return [...prev, {id:p.id, n:p.n, q:1, p:p.p, e:p.e, sub:"", alg:p.alg||"", cat:p.cat, ing:p.ing||""}];
    });
  };
  const removeAnyadir = (p) => {
    setAnyadirItems(prev => {
      const idx = prev.findIndex(i => String(i.id)===String(p.id) || i.n===p.n);
      if (idx < 0) return prev;
      const u = [...prev];
      if (u[idx].q > 1) { u[idx] = {...u[idx], q: u[idx].q - 1}; return u; }
      u.splice(idx, 1); return u;
    });
  };
  const saveAnyadir = async () => {
    setAnyadirSaving(true);
    try { await api.post({action:"updateOrden", id:anyadirId, items:anyadirItems}); }
    catch(e) { console.error(e); }
    setAnyadirSaving(false);
    setAnyadirId(null);
  };
  // ────────────────────────────────────────────────────────────────────

  const w = useWidth();
  const cols = w >= 768 ? 3 : 1;

  const ORDER_FASE = {tarde:0,ahora:1,urgente:2,preparando:3,espera:4};

  // Tab Cocina operatore: mostra ordine completo (pizze + bevande + dolci)
  // Tel che hanno messaggi in Preguntas (aggiunta dopo conferma)
  const telConAggiunta = new Set(
    msgsPreguntas.map(m => String(m.tel||m.wa_id||"").replace("+",""))
  );

  const isExtra = (it) => {
    const mi = lookupMenu(it);
    const cat = it.cat || mi?.cat || "";
    if (cat === "Bebidas") return true;
    if (cat === "Postres" && it.n !== "Pizza Nutella") return true;
    return false;
  };

  const manualGiroMetaById = buildManualGiroMetaById(manualGiros);

  const activosBase = ordenes
    .filter(o=>o.estado===ORDER_STATES.EN_COCINA)
    .map(o=>{
      // Applica override ottimistico ui_offset_min (se presente, sovrascrive il valore polled)
      if (Object.prototype.hasOwnProperty.call(localOffsets, o.id)) {
        o = { ...o, ui_offset_min: localOffsets[o.id] };
      }
      const all = (o.items||[]).filter(it=>it.n!=="Entrega a domicilio");
      const items = all.filter(it => !isExtra(it));
      const extras = all.filter(it => isExtra(it));
      const isDelivery = o.tipo_consegna === "DOMICILIO";
      const zonaObj = isDelivery ? ZONE_DELIVERY.find(z => z.id === o.zona) : null;
      const manualGiro = getManualGiroForOrder(o, manualGiroMetaById);
      // Sorgente unica: o.forno_out (backend cascade-aware). Fallback legacy per ordini pre-migration.
      const horaFornoBase = o.forno_out
        || (isDelivery && zonaObj && o.hora ? subtractMinutes(o.hora, tempoAndata(o, zonaObj)) : (o.hora || null));
      // Giro manuale: hora_ref è l'orario operativo UNICO del giro (scelto dall'operatore)
      // → comanda su forno_out per allineare tutti i membri allo stesso timer.
      const horaForno = (manualGiro && manualGiro.hora_ref)
        ? manualGiro.hora_ref
        // Snooze visivo per-card: solo DOMICILIO usa l'offset (PICKUP è priorità reale)
        : (isDelivery ? applyUiOffset(horaFornoBase, o.ui_offset_min) : horaFornoBase);
      // nPizze = solo pizze (no bevande, no dolci)
      const nPizze = items.reduce((s,it) => s + (parseInt(it.q)||1), 0);
      // Il timer usa horaForno come deadline (non hora)
      const oPerTimer = horaForno ? {...o, hora: horaForno} : o;
      return {...o, items, extras, horaForno, nPizze, isDelivery, zonaObj, manualGiro, _timer: calcTimer(oPerTimer, now)};
    })
    .filter(o=>o.items.length>0 || o.extras.length>0);

  const activos = [...activosBase].sort((a,b)=>{
      const aH = a.horaForno || a.hora, bH = b.horaForno || b.hora;
      if(aH&&bH){
        const aMs=manualGiroSortAnchorMs(a, activosBase)||0,bMs=manualGiroSortAnchorMs(b, activosBase)||0;
        // A parità di slot 10min → RITIRO viene PRIMA (max 5min ritardo accettabile per delivery)
        const aSlot10 = Math.floor(aMs/(10*60*1000));
        const bSlot10 = Math.floor(bMs/(10*60*1000));
        if (a.manual_giro_id && a.manual_giro_id === b.manual_giro_id) {
          return (orarioToMs(aH)||0) - (orarioToMs(bH)||0);
        }
        if (aSlot10 === bSlot10 && a.isDelivery !== b.isDelivery) return a.isDelivery ? 1 : -1;
        return aMs-bMs;
      }
      if(aH)return -1; if(bH)return 1;
      return (a.ts||0)-(b.ts||0);
    });

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {activos.length===0
        ?<div style={{background:"rgba(39,174,96,0.08)",borderRadius:14,
            border:"1.5px solid rgba(39,174,96,0.25)",
            padding:"50px 0",textAlign:"center",color:"#27AE60",fontSize:16,fontWeight:700}}>
          ✅ Cocina al día — sin pedidos
        </div>
        :<div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:12}}>
          {activos.map(o=>{
            const t  = o._timer;
            const fc = FASE_CONFIG[t.fase] || FASE_CONFIG.espera;
            const isUrgent = t.fase==="tarde" || t.fase==="lista" || t.fase==="para_salir";
            const timerStr = `${t.scaduto&&t.conOrario?"-":""}${String(t.mm).padStart(2,"0")}:${String(t.ss).padStart(2,"0")}`;
            const notaVisibile = o.isDelivery ? "" : notaCucina(o.nota);
            const notaCucinaOp = o.nota_cucina ? String(o.nota_cucina).trim() : "";
            const oTel = String(o.tel||o.wa_id||"").replace("+","");
            const hasAggiunta = telConAggiunta.has(oTel);
            const zonaColore = o.isDelivery ? (o.zonaObj?.colore || "#F97316") : null;
            return (
              <div key={o.id} style={{background:"#fff",borderRadius:16,
                border: hasAggiunta ? `3px solid #E8341C` : (o.isDelivery ? `4px solid ${zonaColore}` : `2px solid ${fc.border}`),
                display:"flex",flexDirection:"column",overflow:"hidden",
                boxShadow: hasAggiunta
                  ? `0 0 0 3px #E8341C44, 0 4px 20px #E8341C33`
                  : o.isDelivery
                    ? `0 0 0 4px ${zonaColore}88, 0 6px 24px ${zonaColore}55`
                    : isUrgent?`0 0 0 3px ${fc.border}44,0 4px 20px ${fc.border}33`:`0 2px 10px rgba(0,0,0,0.15)`}}>
              {hasAggiunta && (
                <div style={{background:"#E8341C",color:"#fff",textAlign:"center",
                  padding:"5px",fontSize:13,fontWeight:900,letterSpacing:.5,
                  animation:"livePulse 1s infinite"}}>
                  ⚠️ AGGIUNTA IN ATTESA ⚠️
                </div>
              )}
                <div style={{background:fc.bg,padding:"12px 16px",
                  display:"flex",justifyContent:"space-between",alignItems:"flex-start",
                  borderBottom:`1px solid ${fc.border}55`}}>
                  <div>
                    <div style={{fontFamily:"'DM Mono',monospace",fontWeight:900,color:"#fff",fontSize:20,lineHeight:1}}>{o.id}</div>
                    <div style={{color:"rgba(255,255,255,.85)",fontWeight:700,fontSize:14,marginTop:3}}>👤 {o.nombre}</div>
                    {o.manualGiro && (
                      <div style={{marginTop:6}}>
                        <span style={manualGiroBadgeStyle(false)}>
                          giro manual · {formatManualGiroLabel(o.manualGiro)}
                        </span>
                      </div>
                    )}
                    {/* Orario forno (sopra) + consegna (sotto) — 2 bottoni distinti */}
                    {(o.horaForno || o.hora) && (
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:5,marginTop:5}}>
                        <div style={{display:"inline-flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <div style={{display:"inline-flex",alignItems:"center",gap:6,
                            background: o.isDelivery ? "#F97316" : "#16A34A",
                            border: o.isDelivery ? "1.5px solid rgba(249,115,22,0.7)" : "1.5px solid #78350F",
                            borderRadius:20,padding:"4px 10px",
                            boxShadow: o.isDelivery ? "0 2px 8px rgba(249,115,22,.4)" : "0 2px 8px rgba(120,53,15,.4)"}}>
                            <span style={{fontSize:14}}>{o.isDelivery ? "⏱" : "🕐"}</span>
                            <span style={{color:"#fff",fontWeight:900,fontSize:17,fontFamily:"'DM Mono',monospace"}}>
                              {o.horaForno || o.hora}
                            </span>
                          </div>
                          {o.isDelivery && (
                            <SnoozeButton orden={o} onUpdate={handleOffsetChange} />
                          )}
                        </div>
                        {o.isDelivery && o.hora && (
                          <div style={{display:"inline-flex",alignItems:"center",gap:6,
                            background:"#C2410C",border:"1.5px solid rgba(194,65,12,0.85)",
                            borderRadius:20,padding:"4px 10px",
                            boxShadow:"0 2px 8px rgba(194,65,12,.4)"}}>
                            <span style={{fontSize:14}}>🛵</span>
                            <span style={{color:"#fff",fontWeight:900,fontSize:17,fontFamily:"'DM Mono',monospace"}}>
                              {o.hora}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    {t.showCountdown ? (
                      <>
                        <div style={{fontFamily:"'DM Mono',monospace",fontSize:t.conOrario?40:34,
                          fontWeight:900,color:fc.timerColor,lineHeight:1,
                          textShadow:`0 0 16px ${fc.timerColor}88`,
                          animation:isUrgent?"blink 1s infinite":"none"}}>{timerStr}</div>
                        <div style={{color:"rgba(255,255,255,.45)",fontSize:10,textAlign:"center",marginTop:2,letterSpacing:.5}}>
                          {t.conOrario ? (o.isDelivery ? "al horno" : "al retiro") : "desde orden"}
                        </div>
                        {fc.label&&<div style={{marginTop:4,color:fc.labelColor,fontSize:12,fontWeight:900,
                          letterSpacing:.5,animation:isUrgent?"blink 1s infinite":"none"}}>{fc.label}</div>}
                      </>
                    ) : (
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                        <div style={{background:"rgba(82,214,138,0.15)",border:"1px solid rgba(82,214,138,0.4)",
                          borderRadius:20,padding:"5px 12px",color:"#52D68A",fontSize:12,fontWeight:800}}>⏳ EN ESPERA</div>
                        {t.mm>0&&<div style={{color:"rgba(255,255,255,.3)",fontSize:11,
                          fontFamily:"'DM Mono',monospace"}}>{t.mm} min</div>}
                      </div>
                    )}
                  </div>
                </div>
                {(()=>{
                    const compact = o.items.length >= 5;
                    return (
                <div style={{padding:"12px 16px",flex:1,
                  display: compact ? "grid" : "flex",
                  gridTemplateColumns: compact ? "1fr 1fr" : undefined,
                  flexDirection: compact ? undefined : "column",
                  gap: compact ? 8 : 12, background:"#fff"}}>
                  {o.items.map((it,i)=>{
                    const mi=lookupMenu(it);
                    const _cat = mi?.cat || it.cat || "Pizzas";
                    const _isSize = mi?.sub && /^[\d,.]+\s*(cl|ml|l)$/i.test(mi.sub.trim());
                    const nomeSub = (_cat==="Bebidas"||_cat==="Postres"||_isSize) ? "" : (mi?.sub || "");
                    const sizeInfo = _isSize ? ` ${mi.sub}` : "";
                    const varSub  = it.sub || "";
                    const nomeIng = mi?.ing || it.ing || "";
                    return (
                      <div key={i} style={{
                        borderBottom: !compact && i<o.items.length-1 ? `2px dashed ${fc.border}44` : "none",
                        paddingBottom: !compact && i<o.items.length-1 ? 12 : 0,
                        background: compact ? "#f7f7f7" : "transparent",
                        borderRadius: compact ? 8 : 0,
                        border: compact ? `1.5px solid ${fc.border}33` : "none",
                        padding: compact ? "8px 8px" : 0,
                      }}>
                        {/* Pill: quantità + nome pizzaiolo */}
                        <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:compact?4:8}}>
                          <div style={{display:"inline-flex",alignItems:"center",gap:8,
                            background:"#f0f0f0",borderRadius:9,padding:"4px 10px"}}>
                            <span style={{background:"#111",color:"#fff",
                              borderRadius:7,padding:compact?"3px 11px":"5px 14px",fontFamily:"'DM Mono',monospace",
                              fontWeight:900,fontSize:compact?18:24,lineHeight:1}}>×{it.q}</span>
                            <span style={{color:"#222",fontSize:compact?13:15,fontWeight:800,letterSpacing:.3}}>{it.n}</span>
                          </div>
                        </div>
                        {/* Nome italiano — grande e marcato */}
                        {(nomeSub || (!varSub && !nomeIng)) && (
                          <div style={{color:"#111",fontSize:compact?17:24,fontWeight:900,lineHeight:1.2,marginBottom:5,letterSpacing:-.3,
                            textShadow:"0 1px 0 rgba(255,255,255,0.5)"}}>
                            {(nomeSub || it.n)}{sizeInfo}
                          </div>
                        )}
                        {/* Variazione ingredienti cliente — evidenziata in arancione */}
                        {varSub && (
                          <div style={{display:"inline-block",background:"#FF6B00",color:"#fff",
                            borderRadius:8,padding:"4px 12px",fontSize:compact?12:15,fontWeight:800,
                            marginBottom:5,letterSpacing:.2}}>
                            ⚠ {formatSub(varSub)}
                          </div>
                        )}
                        {/* Ingredienti — piccoli e grigi */}
                        {nomeIng && (
                          <div style={{color:"#555",fontSize:compact?11:13,fontWeight:500,lineHeight:1.5}}>
                            {nomeIng}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {o.extras && o.extras.length > 0 && (
                    <div style={{
                      marginTop: o.items.length > 0 ? 4 : 0,
                      background:"#FFF7E6",
                      border:"1.5px dashed #F0B000",
                      borderRadius:10,
                      padding:"8px 12px",
                      gridColumn: compact ? "1 / -1" : undefined
                    }}>
                      <div style={{fontSize:10,fontWeight:900,letterSpacing:1.2,
                        color:"#A06900",textTransform:"uppercase",marginBottom:6}}>
                        🥤 Bebidas / Postres
                      </div>
                      {o.extras.map((it,i)=>{
                        const mi = lookupMenu(it);
                        const isSize = mi?.sub && /^[\d,.]+\s*(cl|ml|l)$/i.test(mi.sub.trim());
                        const nomeProdotto = mi?.n || it.n || "";
                        const sizeInfo = isSize ? ` ${mi.sub}` : "";
                        const varSub = it.sub || "";
                        return (
                          <div key={i} style={{display:"flex",alignItems:"center",gap:8,
                            padding:"3px 0",borderTop:i>0?"1px dashed #F0B00066":"none"}}>
                            <span style={{background:"#F0B000",color:"#fff",borderRadius:6,
                              padding:"2px 8px",fontFamily:"'DM Mono',monospace",
                              fontWeight:900,fontSize:13,lineHeight:1,flexShrink:0}}>×{it.q}</span>
                            <span style={{color:"#3A2A00",fontSize:13,fontWeight:800,flex:1,
                              whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                              {varSub ? varSub : `${nomeProdotto}${sizeInfo}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {notaCucinaOp&&(
                    <div style={{background:"#E8341C",borderRadius:9,
                      padding:"9px 13px",color:"#fff",fontSize:15,fontWeight:900,letterSpacing:.2,
                      gridColumn: compact?"1 / -1":undefined}}>
                      🍕 {notaCucinaOp}
                    </div>
                  )}
                  {notaVisibile&&(
                    <div style={{background:"rgba(232,52,28,0.15)",border:"2px solid rgba(232,52,28,0.5)",
                      borderRadius:9,padding:"9px 13px",color:"#FF8888",fontSize:15,fontWeight:800,
                      gridColumn: compact?"1 / -1":undefined}}>
                      ⚠ {notaVisibile}
                    </div>
                  )}
                </div>
                    );
                  })()}
                {/* Panel modifica nota + ora */}
                {editId === o.id && (
                  <div style={{padding:"12px 16px",background:"#f5f5f5",
                    borderTop:`1px solid ${fc.border}44`}}>
                    <textarea
                      value={editNota}
                      onChange={e=>setEditNota(e.target.value)}
                      placeholder="Nota cucina (es: sin cebolla, añadir birra...)"
                      rows={2}
                      style={{width:"100%",background:"#fff",border:"1.5px solid #E8341C88",
                        borderRadius:8,color:"#111",fontSize:14,padding:"8px 10px",
                        resize:"none",boxSizing:"border-box",fontFamily:"inherit",marginBottom:8}}
                    />
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{color:"#666",fontSize:13,flexShrink:0}}>🕐 Ora:</span>
                      <input
                        type="text"
                        value={editHora}
                        onChange={e=>setEditHora(e.target.value)}
                        placeholder="21:00"
                        style={{flex:1,background:"#fff",border:"1.5px solid #ccc",
                          borderRadius:8,color:"#111",fontSize:14,padding:"7px 10px",
                          fontFamily:"'DM Mono',monospace"}}
                      />
                      <button onClick={saveEdit} disabled={saving}
                        style={{background:"#E8341C",border:"none",borderRadius:8,
                          color:"#fff",fontWeight:900,fontSize:13,padding:"8px 14px",
                          cursor:saving?"not-allowed":"pointer",flexShrink:0}}>
                        {saving ? "..." : "💾 Salva"}
                      </button>
                      <button onClick={()=>setEditId(null)}
                        style={{background:"#333",border:"none",borderRadius:8,
                          color:"#888",fontWeight:700,fontSize:13,padding:"8px 10px",cursor:"pointer"}}>
                        ✕
                      </button>
                    </div>
                  </div>
                )}
                {/* ── PANNELLO AÑADIR MANUAL ── */}
                {anyadirId===o.id && (
                  <div style={{borderTop:`2px solid #E8341C`,background:"#1a1a1a",padding:"12px 14px"}}>
                    {/* Tab categorie */}
                    <div style={{display:"flex",gap:6,marginBottom:10}}>
                      {["Pizzas","Postres","Bebidas"].map(cat=>(
                        <button key={cat} onClick={()=>setAnyadirCat(cat)}
                          style={{flex:1,background:anyadirCat===cat?"#E8341C":"#2a2a2a",
                            border:`1px solid ${anyadirCat===cat?"#E8341C":"#444"}`,
                            color:anyadirCat===cat?"#fff":"#aaa",borderRadius:8,
                            padding:"7px 0",fontWeight:800,fontSize:12,cursor:"pointer"}}>
                          {cat==="Pizzas"?"🍕":cat==="Postres"?"🍰":"🍺"} {cat}
                        </button>
                      ))}
                    </div>
                    {/* Griglia items */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:10}}>
                      {MENU.filter(m=>m.cat===anyadirCat).map(p=>{
                        const sel = anyadirItems.find(i=>String(i.id)===String(p.id)||i.n===p.n);
                        return (
                          <button key={p.id} onClick={()=>tapAnyadir(p)}
                            style={{background:sel?"#E8341C22":"#2a2a2a",
                              border:`2px solid ${sel?"#E8341C":"#444"}`,
                              borderRadius:10,padding:"8px 4px",position:"relative",
                              display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer"}}>
                            {sel&&<span style={{position:"absolute",top:-7,right:-7,
                              background:"#E8341C",color:"#fff",borderRadius:"50%",
                              width:20,height:20,fontSize:11,fontWeight:900,
                              display:"flex",alignItems:"center",justifyContent:"center",
                              border:"2px solid #1a1a1a"}}>{sel.q}</span>}
                            <span style={{fontSize:20}}>{p.e}</span>
                            <span style={{color:"#fff",fontSize:10,fontWeight:700,textAlign:"center",lineHeight:1.2}}>{p.n}</span>
                            <span style={{color:sel?"#E8341C":"#888",fontSize:10,fontWeight:700}}>{p.p.toFixed(2)}€</span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Items selezionati + azioni */}
                    {anyadirItems.length>0 && (
                      <div style={{background:"#111",borderRadius:8,padding:"8px 10px",marginBottom:8,fontSize:12,color:"#ccc"}}>
                        {anyadirItems.map((it,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:i<anyadirItems.length-1?4:0}}>
                            <span>{it.e} {it.q}× {it.n}</span>
                            <div style={{display:"flex",gap:4}}>
                              <button onClick={()=>removeAnyadir(it)}
                                style={{background:"#333",border:"none",color:"#E8341C",borderRadius:5,
                                  width:20,height:20,fontSize:13,fontWeight:900,cursor:"pointer",lineHeight:1}}>−</button>
                              <button onClick={()=>tapAnyadir(MENU.find(m=>String(m.id)===String(it.id)||m.n===it.n)||it)}
                                style={{background:"#333",border:"none",color:"#27AE60",borderRadius:5,
                                  width:20,height:20,fontSize:13,fontWeight:900,cursor:"pointer",lineHeight:1}}>+</button>
                            </div>
                          </div>
                        ))}
                        <div style={{marginTop:6,color:"#E8341C",fontWeight:900,fontSize:13}}>
                          Totale: {anyadirItems.reduce((s,i)=>s+i.p*i.q,0).toFixed(2)}€
                        </div>
                      </div>
                    )}
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>setAnyadirId(null)}
                        style={{background:"#333",border:"none",color:"#888",borderRadius:8,
                          padding:"10px 14px",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                        ✕ Cancelar
                      </button>
                      <button onClick={saveAnyadir} disabled={anyadirSaving}
                        style={{flex:1,background:anyadirSaving?"#555":"#E8341C",border:"none",
                          color:"#fff",borderRadius:8,padding:"10px 0",
                          fontWeight:900,fontSize:13,cursor:anyadirSaving?"not-allowed":"pointer"}}>
                        {anyadirSaving?"Guardando...":"💾 Guardar cambios"}
                      </button>
                    </div>
                  </div>
                )}
                <div style={{padding:"11px 16px 14px",borderTop:`1px solid ${fc.border}44`,background:"#f5f5f5"}}>
                  {(() => { const busy = loadingIds.has(o.id); return (
                  <button
                    onClick={()=>{ if (busy) return; Suoni.campanellaDieci(); handleListo(o); }}
                    disabled={busy}
                    style={{width:"100%",
                      background: busy ? "rgba(39,174,96,0.35)" : "linear-gradient(145deg,#27AE60,#1A7A44)",
                      border:"none",color:"#fff",borderRadius:12,padding:"14px 0",
                      fontWeight:900,fontSize:16,letterSpacing:.5,
                      boxShadow: busy ? "none" : "0 4px 14px rgba(39,174,96,.35)",
                      cursor: busy ? "wait" : "pointer",
                      opacity: busy ? 0.7 : 1}}>
                    {busy ? "Confirmando…" : "✅ LISTO"}
                  </button>
                  ); })()}
                </div>
              </div>
            );
          })}
        </div>
      }
    </div>
  );
};


// ─── LIVE TIME ────────────────────────────────────────

export default TabCocina;
