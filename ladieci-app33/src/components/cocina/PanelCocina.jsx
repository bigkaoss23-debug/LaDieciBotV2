import { useState, useEffect } from 'react';
import { C, tot, MAX_PIZZE_ORA, LOGO_RED_SRC, useWidth } from '../../constants';
import { caricoTotale, lookupMenu, orarioToMs, calcTimer, FASE_CONFIG, notaCucina } from '../ordenes/TabListos';
import { ZONE_DELIVERY, tempoAndata } from '../../zones';
import { applyUiOffset } from '../../utils/uiOffset';
import Suoni from '../../sounds';
import SnoozeButton from '../ui/SnoozeButton';
import { api } from '../../api';
import {
  buildManualGiroMetaById,
  formatManualGiroLabel,
  getManualGiroForOrder,
  manualGiroBadgeStyle,
  manualGiroSortAnchorMs
} from './manualGiroCocina';

const subtractMinutes = (hora, min) => {
  if (!hora || !min) return null;
  const [hh, mm] = hora.split(":").map(Number);
  const tot = hh * 60 + mm - min;
  if (tot < 0) return null;
  return `${String(Math.floor(tot/60)%24).padStart(2,"0")}:${String(tot % 60).padStart(2,"0")}`;
};

const PanelCocina = ({ordenes, convConfermata=[], onListo, onClose, loadingIds=new Set(), pizzeFatte=0}) => {
  const [now, setNow] = useState(Date.now());
  const [manualGiros, setManualGiros] = useState([]);
  // Override locale ottimistico per ui_offset_min — il polling/WS poi sincronizza
  const [localOffsets, setLocalOffsets] = useState({});
  const handleOffsetChange = (id, val) => {
    setLocalOffsets(prev => ({ ...prev, [id]: val }));
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
        else if (res && res.error) console.warn("[panel cocina manualGiros] fetch error:", res.error);
      } catch (e) {
        console.warn("[panel cocina manualGiros] fetch threw:", (e && e.message) || e);
      }
    };
    safeLoad();
    const poll = setInterval(safeLoad, 10000);
    return () => { mounted = false; clearInterval(poll); };
  }, []);
  const w = useWidth();
  const cols = w >= 680 ? 3 : w >= 420 ? 2 : 1;

  const totPizze = caricoTotale(ordenes);
  const pctCarico = Math.min(100, Math.round((totPizze / MAX_PIZZE_ORA) * 100));
  const caricoColor = pctCarico >= 90 ? "#C0392B" : pctCarico >= 65 ? "#E67E22" : "#27AE60";
  const caricoLabel = pctCarico >= 90 ? "FORNO SATURO" : pctCarico >= 65 ? "Cargado" : "Ok";

  const isExtra = (it) => {
    const mi = lookupMenu(it);
    const cat = it.cat || mi?.cat || "Pizzas";
    if (cat === "Bebidas") return true;
    if (cat === "Postres" && it.n !== "Pizza Nutella") return true;
    return false;
  };
  const manualGiroMetaById = buildManualGiroMetaById(manualGiros);

  const activosBase = ordenes
    .filter(o => o.estado==="EN_COCINA")
    .map(o => {
      // Applica override ottimistico ui_offset_min (se presente, sovrascrive il valore polled)
      if (Object.prototype.hasOwnProperty.call(localOffsets, o.id)) {
        o = { ...o, ui_offset_min: localOffsets[o.id] };
      }
      const all = (o.items||[]).filter(it => it.n !== "Entrega a domicilio");
      const items = all.filter(it => !isExtra(it));
      const isDelivery = o.tipo_consegna === "DOMICILIO";
      const zonaObj = isDelivery ? ZONE_DELIVERY.find(z => z.id === o.zona) : null;
      const manualGiro = getManualGiroForOrder(o, manualGiroMetaById);
      // Sorgente unica: o.forno_out (backend cascade-aware). Fallback legacy per ordini pre-migration.
      const horaFornoBase = o.forno_out
        || (isDelivery && zonaObj && o.hora ? subtractMinutes(o.hora, tempoAndata(o, zonaObj)) : (o.hora || null));
      // Giro manuale: hora_ref è l'orario operativo UNICO del giro → comanda su forno_out.
      const horaForno = (manualGiro && manualGiro.hora_ref)
        ? manualGiro.hora_ref
        // Snooze visivo per-card: solo DOMICILIO usa l'offset
        : (isDelivery ? applyUiOffset(horaFornoBase, o.ui_offset_min) : horaFornoBase);
      const oPerTimer = horaForno ? {...o, hora: horaForno} : o;
      return {
        ...o,
        items,
        extras: all.filter(it => isExtra(it)),
        isDelivery, horaForno, manualGiro,
        _timer: calcTimer(oPerTimer, now)
      };
    })
    .filter(o => o.items.length > 0 || o.extras.length > 0);

  const activos = [...activosBase].sort((a,b) => {
      const aH = a.horaForno || a.hora, bH = b.horaForno || b.hora;
      if(aH && bH) {
        const aMs = manualGiroSortAnchorMs(a, activosBase)||0, bMs = manualGiroSortAnchorMs(b, activosBase)||0;
        // A parità di slot 10min → RITIRO viene PRIMA (max 5min ritardo accettabile per delivery)
        const aSlot10 = Math.floor(aMs/(10*60*1000));
        const bSlot10 = Math.floor(bMs/(10*60*1000));
        if (a.manual_giro_id && a.manual_giro_id === b.manual_giro_id) {
          return (orarioToMs(aH)||0) - (orarioToMs(bH)||0);
        }
        if (aSlot10 === bSlot10 && a.isDelivery !== b.isDelivery) return a.isDelivery ? 1 : -1;
        return aMs - bMs;
      }
      if(aH) return -1; if(bH) return 1;
      return (a.ts||0) - (b.ts||0);
    });

  const nowStr = new Date(now).toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"});
  const dateStr = new Date(now).toLocaleDateString("es",{weekday:"short",day:"numeric",month:"short"});

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:800,
      background:"#fff",
      display:"flex", flexDirection:"column",
      animation:"fadeIn .2s ease",
      fontFamily:"'Satoshi',-apple-system,sans-serif",
      paddingTop:"env(safe-area-inset-top)",
      paddingBottom:"env(safe-area-inset-bottom)"
    }}>
      {/* Header — 3 colonne */}
      <div style={{
        background:"#fff",
        borderBottom:"1.5px solid #e8e8e8",
        padding:"10px 16px",
        display:"flex", alignItems:"center", gap:12,
        flexShrink:0,
      }}>
        {/* SINISTRA: Logo + pedidos/pizzas */}
        <div style={{display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{width:44,height:44,borderRadius:12,overflow:"visible",flexShrink:0,
            background:"#0A0A0A",
            border:"2px solid rgba(232,52,28,0.8)",
            boxShadow:"0 0 16px rgba(232,52,28,0.4)",
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <img src={LOGO_RED_SRC} style={{
              width:"115%",height:"115%",objectFit:"contain",
              filter:"brightness(1.3) contrast(1.2) saturate(1.25) drop-shadow(0 0 8px rgba(255,60,20,0.7))"
            }}/>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#bbb",letterSpacing:"2px",
              textTransform:"uppercase",marginBottom:3}}>Pizzeria</div>
            <div style={{fontSize:21,fontWeight:800,color:"#111",lineHeight:1}}>
              {activos.length === 0
                ? <span style={{color:"#27AE60"}}>Todo listo ✓</span>
                : <span>{activos.length} pedido{activos.length!==1?"s":""} · {totPizze} pizza{totPizze!==1?"s":""}</span>
              }
            </div>
          </div>
        </div>

        {/* CENTRO: ora + data + barra */}
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:900,color:"#111",lineHeight:1}}>
            {nowStr}
          </div>
          <div style={{fontSize:10,color:"#bbb",marginTop:2,letterSpacing:.5,textTransform:"capitalize",marginBottom:7}}>
            {dateStr}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}>
            <div style={{width:160,height:6,background:"#f0f0f0",borderRadius:3,overflow:"hidden"}}>
              <div style={{
                width:`${pctCarico}%`,height:"100%",
                background:caricoColor,
                borderRadius:3,transition:"width .4s ease"
              }}/>
            </div>
            <span style={{fontSize:12,fontWeight:700,color:caricoColor,whiteSpace:"nowrap"}}>
              {pctCarico}% — {caricoLabel}
            </span>
          </div>
        </div>

        {/* DESTRA: scoreboard pizze hechas */}
        <div style={{flexShrink:0,display:"flex",alignItems:"center",gap:10}}>
          <div style={{
            background:"#0A0A0A",
            border:"2px solid rgba(232,52,28,0.5)",
            borderRadius:9,
            padding:"4px 11px",
            textAlign:"center",
            minWidth:60,
          }}>
            <div style={{fontSize:8,fontWeight:800,letterSpacing:"2px",
              textTransform:"uppercase",color:"rgba(255,255,255,0.4)",marginBottom:2}}>
              🍕 Hechas
            </div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:900,
              color:"#fff",lineHeight:1,
              textShadow:"0 0 10px rgba(232,52,28,0.7)"}}>
              {pizzeFatte}
            </div>
          </div>

          {/* Cerrar */}
          <button onClick={onClose} style={{
            background:"#f4f4f4",border:"1px solid #e0e0e0",color:"#666",
            borderRadius:"50%",width:34,height:34,fontSize:16,fontWeight:700,
            display:"flex",alignItems:"center",justifyContent:"center",
            cursor:"pointer"
          }}>✕</button>
        </div>
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:"12px 12px 28px"}}>
        {activos.length === 0 ? (
          <div style={{display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",height:320,gap:14}}>
            <div style={{fontSize:72}}>✅</div>
            <div style={{fontSize:24,fontWeight:900,color:"#2D6A2D"}}>Cocina al día</div>
            <div style={{fontSize:15,color:"#555"}}>Sin pedidos pendientes</div>
          </div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:12}}>
            {activos.map((o) => {
              const t  = o._timer;
              const fc = FASE_CONFIG[t.fase] || FASE_CONFIG.espera;
              const isUrgent = t.fase==="tarde" || t.fase==="lista" || t.fase==="para_salir";
              const timerStr = `${t.scaduto&&t.conOrario?"-":""}${String(t.mm).padStart(2,"0")}:${String(t.ss).padStart(2,"0")}`;
              const notaVisibile = notaCucina(o.nota);
              const notaCucinaOp = o.nota_cucina ? String(o.nota_cucina).trim() : "";
              const isDelivery = o.tipo_consegna === "DOMICILIO";
              const zonaColore = isDelivery
                ? (ZONE_DELIVERY.find(z => z.id === o.zona)?.colore || "#F97316")
                : null;
              return (
                <div key={o.id} style={{
                  background:"#fff",
                  borderRadius:16,
                  border: isDelivery ? `4px solid ${zonaColore}` : `2px solid ${fc.border}`,
                  display:"flex",flexDirection:"column",overflow:"hidden",
                  boxShadow: isDelivery
                    ? `0 0 0 4px ${zonaColore}88, 0 6px 24px ${zonaColore}55`
                    : isUrgent
                      ? `0 0 0 3px ${fc.border}44, 0 4px 20px ${fc.border}33`
                      : "0 2px 10px rgba(0,0,0,0.12)",
                  position:"relative"
                }}>
                  {/* Header colorato per fase — tema chiaro (full-screen pizzeria) */}
                  <div style={{background:fc.bgLight, padding:"12px 16px",
                    display:"flex",justifyContent:"space-between",alignItems:"flex-start",
                    borderBottom:`1px solid ${fc.border}55`}}>
                    <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
                      <div style={{fontFamily:"'DM Mono',monospace",fontWeight:900,color:fc.textLight,fontSize:20,lineHeight:1}}>{o.id}</div>
                      <div style={{color:fc.textLight,opacity:0.85,fontWeight:700,fontSize:14,marginTop:3,
                        whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>👤 {o.nombre}</div>
                      {o.manualGiro && (
                        <div style={{marginTop:6}}>
                          <span style={manualGiroBadgeStyle(true)}>
                            giro manual · {formatManualGiroLabel(o.manualGiro)}
                          </span>
                        </div>
                      )}
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
                            fontWeight:900,color:fc.timerColorLight,lineHeight:1,
                            animation:isUrgent?"blink 1s infinite":"none"}}>{timerStr}</div>
                          <div style={{color:fc.textLight,opacity:0.55,fontSize:10,textAlign:"center",marginTop:2,letterSpacing:.5}}>
                            {t.conOrario ? (t.scaduto ? "RETRASO" : o.isDelivery ? "al horno" : "al retiro") : "desde orden"}
                          </div>
                          {fc.label&&<div style={{marginTop:4,color:fc.labelColorLight,fontSize:12,fontWeight:900,
                            letterSpacing:.5,animation:isUrgent?"blink 1s infinite":"none"}}>{fc.label}</div>}
                        </>
                      ) : (
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                          <div style={{background:"rgba(5,150,105,0.12)",border:"1px solid rgba(5,150,105,0.35)",
                            borderRadius:20,padding:"5px 12px",color:"#059669",fontSize:12,fontWeight:800}}>⏳ EN ESPERA</div>
                          {t.mm>0&&<div style={{color:"rgba(0,0,0,0.4)",fontSize:11,
                            fontFamily:"'DM Mono',monospace"}}>{t.mm} min</div>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Body — pizze */}
                  {(()=>{
                    const compact = o.items.length >= 5;
                    return (
                      <div style={{padding:"12px 16px",flex:1,
                        display: compact ? "grid" : "flex",
                        gridTemplateColumns: compact ? "1fr 1fr" : undefined,
                        flexDirection: compact ? undefined : "column",
                        gap: compact ? 8 : 12, background:"#fff"}}>
                    {o.items.map((it,i)=>{
                      const mi = lookupMenu(it);
                      const nomeCompleto = mi?.sub || "";
                      const nomeBreve    = it.n || "";
                      const varSub       = it.sub || "";
                      const nomeIng      = mi?.ing || it.ing || "";
                      return (
                        <div key={i} style={{
                          borderBottom: !compact && i<o.items.length-1 ? `2px dashed ${fc.border}44` : "none",
                          paddingBottom: !compact && i<o.items.length-1 ? 12 : 0,
                          background: compact ? "#f7f7f7" : "transparent",
                          borderRadius: compact ? 8 : 0,
                          border: compact ? `1.5px solid ${fc.border}33` : "none",
                          padding: compact ? "8px 8px" : 0,
                          minWidth: 0,
                          overflow: "hidden",
                        }}>
                          {/* 1. Pill qty + nome breve */}
                          <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:compact?4:8}}>
                            <div style={{display:"inline-flex",alignItems:"center",gap:8,
                              background:"#f0f0f0",borderRadius:9,padding:"4px 10px"}}>
                              <span style={{background:"#111",color:"#fff",
                                borderRadius:7,padding:compact?"3px 11px":"5px 14px",fontFamily:"'DM Mono',monospace",
                                fontWeight:900,fontSize:compact?18:24,lineHeight:1}}>×{it.q}</span>
                              <span style={{color:"#222",fontSize:compact?13:15,fontWeight:800,letterSpacing:.3}}>{nomeBreve}</span>
                            </div>
                          </div>
                          {/* 2. Nome completo — grande */}
                          {nomeCompleto && (
                            <div style={{color:"#111",fontSize:compact?15:22,fontWeight:900,lineHeight:1.2,
                              marginBottom:4,letterSpacing:-.3}}>
                              {nomeCompleto}
                            </div>
                          )}
                          {!nomeCompleto && (
                            <div style={{color:"#111",fontSize:compact?15:22,fontWeight:900,lineHeight:1.2,marginBottom:4}}>
                              {nomeBreve}
                            </div>
                          )}
                          {/* 3. Ingredienti — piccoli grigi */}
                          {nomeIng && (
                            <div style={{color:"#777",fontSize:compact?10:12,fontWeight:500,lineHeight:1.5,marginBottom:varSub?6:0}}>
                              {nomeIng}
                            </div>
                          )}
                          {/* 4. Variazione — IN FONDO, badge arancione */}
                          {varSub && (
                            <div style={{display:"inline-block",background:"#FF6B00",color:"#fff",
                              borderRadius:8,padding: compact?"3px 8px":"4px 12px",fontSize:compact?11:14,fontWeight:800,
                              marginTop:4,letterSpacing:.2}}>
                              ⚠ {varSub}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Bebidas / Postres — solo se presenti */}
                    {o.extras && o.extras.length > 0 && (
                      <div style={{
                        marginTop: o.items.length>0 ? 4 : 0,
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
                    {/* Note operatore — span entrambe le colonne in compact */}
                    {notaCucinaOp&&(
                      <div style={{background:"#E8341C",borderRadius:9,
                        padding:"9px 13px",color:"#fff",fontSize:15,fontWeight:900,letterSpacing:.2,
                        gridColumn: compact ? "1 / -1" : undefined}}>
                        🍕 {notaCucinaOp}
                      </div>
                    )}
                    {notaVisibile&&(
                      <div style={{background:"rgba(232,52,28,0.12)",border:"2px solid rgba(232,52,28,0.45)",
                        borderRadius:9,padding:"9px 13px",color:"#C0271A",fontSize:15,fontWeight:800,
                        gridColumn: compact ? "1 / -1" : undefined}}>
                        ⚠ {notaVisibile}
                      </div>
                    )}
                      </div>
                    );
                  })()}

                  {/* Footer LISTO */}
                  <div style={{padding:"11px 16px 14px",borderTop:`1px solid ${fc.border}44`,background:"#f5f5f5"}}>
                    <button
                      onClick={()=>{ Suoni.campanellaDieci(); onListo(o.id, {
                        origin: "PanelCocina",
                        actor: "cocina_fullscreen",
                      }); }}
                      style={{width:"100%",
                        background:"linear-gradient(145deg,#27AE60,#1A7A44)",
                        border:"none",color:"#fff",borderRadius:12,padding:"14px 0",
                        fontWeight:900,fontSize:16,letterSpacing:.5,
                        boxShadow:"0 4px 14px rgba(39,174,96,.35)",cursor:"pointer",
                        fontFamily:"'Satoshi',-apple-system,sans-serif"}}>
                      ✅ LISTO
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── TAB COCINA KDS (in-tab) ──────────────────────────────────

export default PanelCocina;
