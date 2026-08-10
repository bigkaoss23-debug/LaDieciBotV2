import { useState, useEffect } from 'react';
import { C, tot, MAX_PIZZE_ORA, LOGO_RED_SRC, useWidth } from '../../constants';
import { caricoTotale, lookupMenu, orarioToMs, calcTimer, FASE_CONFIG, notaCucina } from '../ordenes/TabListos';
import { formatItemExtrasLabel, resolveItemNote, formatItemRemovedLabel } from '../../menu/itemDisplay';
import { ZONE_DELIVERY, tempoAndata } from '../../zones';
import { applyUiOffset } from '../../utils/uiOffset';
import Suoni from '../../sounds';
import SnoozeButton from '../ui/SnoozeButton';
import { api } from '../../api';
import {
  buildManualGiroMetaById,
  formatManualGiroLabel,
  getManualGiroForOrder,
  manualGiroAccentColor,
  manualGiroSortAnchorMs,
  resolveGiroReadyBy
} from './manualGiroCocina';
import { buildVisibleOrderLabels, resolveVisibleOrderLabel } from '../../utils/orderNumber';

// COCINA_CARD_PIXEL_GRID: costanti griglia visiva unica per le card Cocina.
// RIBBON_H = altezza fissa del top slot (ribbon) uguale per delivery e retiro.
// SYS_FONT = stack di sistema per la leggibilità (solo Cocina; numeri restano 'DM Mono').
const RIBBON_H = 26;
const SYS_FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif';

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
      // Giro manuale: orario operativo UNICO backend-owned. Precedenza (decisione A)
      // hora_ref (operatore) > salida_ref (proxy). null → fallback forno_out per-ordine.
      const giroReadyBy = resolveGiroReadyBy(manualGiro);
      const horaForno = giroReadyBy
        ? giroReadyBy
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
        // A parità di slot 10min → il pickup viene PRIMA (max 5min ritardo accettabile per delivery)
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

  // P1-A -- see TabCocina.jsx's own comment; same collision pass, this is the
  // fullscreen/focus variant of the same board.
  const orderLabels = buildVisibleOrderLabels(activos);

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
              // COCINA_MANUAL_GIRO_VISUAL_GROUPING — accent condiviso per membri stesso giro.
              const giroAccent = o.manualGiro ? manualGiroAccentColor(o.manualGiro) : null;
              // COCINA_CARD_BORDER_WEIGHT: contorno UNIFORME 4px per pickup e delivery
              // (era 2px sui pickup). Halo pieno anche sui non-delivery (rinforzato in
              // late/tarde) → peso visivo coerente riga per riga.
              return (
                <div key={o.id} style={{
                  background:"#fff",
                  borderRadius:16,
                  border: giroAccent ? `4px solid ${giroAccent}` : (isDelivery ? `4px solid ${zonaColore}` : `4px solid ${fc.border}`),
                  display:"flex",flexDirection:"column",overflow:"hidden",
                  boxShadow: giroAccent
                    ? `0 0 0 4px ${giroAccent}88, 0 6px 24px ${giroAccent}55`
                    : isDelivery
                      ? `0 0 0 4px ${zonaColore}88, 0 6px 24px ${zonaColore}55`
                      : isUrgent
                        ? `0 0 0 4px ${fc.border}88, 0 6px 24px ${fc.border}55`
                        : "0 0 0 3px " + fc.border + "44, 0 4px 16px rgba(0,0,0,0.15)",
                  position:"relative"
                }}>
                  {/* COCINA_CARD_PIXEL_GRID · TOP_SLOT_SILENT: top slot ad altezza fissa
                      (RIBBON_H) uguale per TUTTE le card → allineamento. SOLO i delivery
                      mostrano la label (`🚚 DELIVERY[· G{seq}]`, accent zona/giro). I
                      non-delivery hanno slot MUTO (nessun testo/icona), fondo coerente con
                      l'header (fc.bgLight) → nessun segnale visivo forte, solo allineamento. */}
                  <div style={{height:RIBBON_H,flexShrink:0,boxSizing:"border-box",
                    display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"0 8px",
                    background: isDelivery ? (giroAccent || zonaColore) : fc.bgLight,
                    color:"#fff",fontSize:12,fontWeight:900,letterSpacing:.7,textTransform:"uppercase",
                    textShadow:"0 1px 3px rgba(0,0,0,0.55)"}}>
                    {isDelivery
                      ? <>🚚 DELIVERY{o.manualGiro ? ` · ${formatManualGiroLabel(o.manualGiro)}` : ""}</>
                      : null}
                  </div>
                  {/* Header colorato per fase — tema chiaro (full-screen pizzeria) */}
                  <div style={{background:fc.bgLight, padding:"12px 16px",minHeight:88,boxSizing:"border-box",
                    display:"flex",justifyContent:"space-between",alignItems:"flex-start",
                    borderBottom:`1px solid ${fc.border}55`}}>
                    <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
                      {/* COCINA_CARD_PIXEL_GRID: cliente SOTTO il numero ordine (stacked).
                          Numero dominante (24, mono, 900); cliente secondario con ellipsis. */}
                      <div style={{fontFamily:"'DM Mono',monospace",fontWeight:900,color:fc.textLight,fontSize:24,lineHeight:1}}>{resolveVisibleOrderLabel(o, orderLabels)}</div>
                      <div style={{fontFamily:SYS_FONT,color:fc.textLight,opacity:0.82,fontWeight:600,fontSize:14,lineHeight:1.15,marginTop:4,
                        whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>👤 {o.nombre}</div>
                      {/* COCINA_DELIVERY_CARD_COMPACT_UI: chip zona (Q2/Q5) RETIRADO de Cocina
                          (routing no útil; el giro se ve por la fascia + borde). Zona intacta
                          en Entregas/Repartidor/Nuevo Pedido. */}
                      {(o.horaForno || o.hora) && (
                        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:5,marginTop:5}}>
                          <div style={{display:"inline-flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            {/* COCINA_CARD_PIXEL_GRID: chip ora forno VERDE uniforme in Cocina
                                (stesso per pickup e delivery). Il tipo si distingue dal ribbon. */}
                            <div style={{display:"inline-flex",alignItems:"center",gap:6,
                              background:"#16A34A",
                              border:"1.5px solid #0E7A38",
                              borderRadius:20,padding:"4px 10px",
                              boxShadow:"0 2px 8px rgba(22,163,74,.35)"}}>
                              <span style={{fontSize:14}}>🕐</span>
                              <span style={{color:"#fff",fontWeight:900,fontSize:17,fontFamily:"'DM Mono',monospace"}}>
                                {o.horaForno || o.hora}
                              </span>
                            </div>
                            {o.isDelivery && (
                              <SnoozeButton orden={o} onUpdate={handleOffsetChange} />
                            )}
                          </div>
                          {/* COCINA_DELIVERY_CARD_COMPACT_UI: fila hora scooter (🛵) RETIRADA
                              de Cocina — timing de reparto no necesario aquí. Sigue en
                              Entregas/Repartidor. */}
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
                      // S2-7D4D — operational separation. The old single `it.sub` badge
                      // lumped supplements and the operator's free note into one orange
                      // "⚠ +Kinder, cortar en 4" blob. These are different things for the
                      // pizzaiolo, so they get separate rows: extras keep the orange chip
                      // (no "+" prefix — position and colour already say "extra"), the
                      // manual note gets its own red NOTA row.
                      const extrasLabel  = formatItemExtrasLabel(it);
                      const notaItem     = resolveItemNote(it);
                      const removedLabel = formatItemRemovedLabel(it);
                      const hasVar       = !!(extrasLabel || notaItem || removedLabel);
                      const nomeIng      = mi?.ing || it.ing || "";
                      // COCINA_CARD_PIXEL_GRID: nome pizza reale dominante + tag menù a fianco.
                      const realName = nomeCompleto || nomeBreve;
                      const tagName  = (nomeCompleto && nomeBreve && nomeBreve !== nomeCompleto) ? nomeBreve : "";
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
                          {/* COCINA_CARD_PIZZA_NAME: layout prodotto esplicito e stabile —
                              badge ×N a sinistra; a destra colonna [riga1 = nome breve/tag,
                              riga2 = nome vero grande]; ingredienti sotto. */}
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:compact?5:7,minWidth:0}}>
                            <span style={{background:"#111",color:"#fff",flexShrink:0,
                              borderRadius:8,padding:compact?"4px 12px":"6px 15px",fontFamily:"'DM Mono',monospace",
                              fontWeight:900,fontSize:compact?20:28,lineHeight:1}}>×{it.q}</span>
                            <div style={{display:"flex",flexDirection:"column",minWidth:0,flex:1,overflow:"hidden",gap:1}}>
                              {/* riga 1 — nome breve/tag (secondario) */}
                              {tagName && (
                                <span style={{fontFamily:SYS_FONT,color:"#6B7280",fontSize:compact?11:13,fontWeight:700,letterSpacing:.2,lineHeight:1.1,
                                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{tagName}</span>
                              )}
                              {/* riga 2 — nome vero (prioritario, clamp 2 righe) */}
                              <span style={{fontFamily:SYS_FONT,color:"#111",fontSize:compact?16:22,fontWeight:900,lineHeight:1.12,letterSpacing:-.2,
                                display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{realName}</span>
                            </div>
                          </div>
                          {/* Ingredienti — piccoli grigi, normal-case */}
                          {nomeIng && (
                            <div style={{fontFamily:SYS_FONT,color:"#777",fontSize:compact?10:12,fontWeight:500,lineHeight:1.5,marginBottom:hasVar?6:0}}>
                              {nomeIng}
                            </div>
                          )}
                          {/* 4a. EXTRAS / supplementi — badge arancione, senza prefisso "+" */}
                          {extrasLabel && (
                            <div style={{display:"inline-block",background:"#FF6B00",color:"#fff",
                              borderRadius:8,padding: compact?"3px 8px":"4px 12px",fontSize:compact?11:14,fontWeight:800,
                              marginTop:4,letterSpacing:.2,textTransform:"uppercase"}}>
                              {extrasLabel}
                            </div>
                          )}
                          {/* 4b. INGREDIENTI RIMOSSI — riga PROPRIA (S2-7D4D-FIX1).
                              Terzo stile, distinto sia dagli extra (arancione, si aggiunge)
                              sia dalla nota (rossa, è un'istruzione): qui si TOGLIE. */}
                          {removedLabel && (
                            <div style={{display:"inline-block",background:"#1F2937",color:"#FCA5A5",
                              border:"2px solid #7F1D1D",borderRadius:8,
                              padding: compact?"3px 8px":"4px 12px",fontSize:compact?11:14,fontWeight:900,
                              marginTop:4,letterSpacing:.3,textTransform:"uppercase"}}>
                              🚫 {removedLabel}
                            </div>
                          )}
                          {/* 4c. NOTA operatore — riga separata, outline rosso, wrap consentito.
                              Stile deliberatamente diverso dagli extras: non è un supplemento. */}
                          {notaItem && (
                            <div style={{marginTop:5,background:"#FEE2E2",border:"2px solid #DC2626",
                              borderRadius:8,padding:"6px 11px",color:"#991B1B",fontFamily:SYS_FONT,
                              fontSize:compact?11:14,fontWeight:900,letterSpacing:.2,textTransform:"uppercase",
                              whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.25}}>
                              📝 NOTA: {notaItem}
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
                          // S2-7D4D — the note no longer REPLACES the product name. Previously
                          // `it.sub ? it.sub : nome` meant a drink with any note rendered as the
                          // note alone, hiding what to actually put in the bag.
                          const notaItem = resolveItemNote(it);
                          return (
                            <div key={i} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",
                              padding:"3px 0",borderTop:i>0?"1px dashed #F0B00066":"none"}}>
                              <span style={{background:"#F0B000",color:"#fff",borderRadius:6,
                                padding:"2px 8px",fontFamily:"'DM Mono',monospace",
                                fontWeight:900,fontSize:13,lineHeight:1,flexShrink:0}}>×{it.q}</span>
                              <span style={{color:"#3A2A00",fontSize:13,fontWeight:800,flex:1,minWidth:0,
                                whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                                {`${nomeProdotto}${sizeInfo}`}
                              </span>
                              {notaItem && (
                                <span style={{background:"#FEE2E2",border:"2px solid #DC2626",borderRadius:7,
                                  padding:"2px 8px",color:"#991B1B",fontFamily:SYS_FONT,fontSize:12,fontWeight:900,
                                  textTransform:"uppercase",whiteSpace:"normal",wordBreak:"break-word",flexBasis:"100%"}}>
                                  📝 NOTA: {notaItem}
                                </span>
                              )}
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
