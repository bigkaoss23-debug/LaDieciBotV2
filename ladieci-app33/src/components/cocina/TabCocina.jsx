import { useState, useEffect } from 'react';
import { C, tot, useWidth, MENU } from '../../constants';
import { sb, api } from '../../api';
import Suoni from '../../sounds';
// NB: `formatSub` is deliberately no longer imported. It collapsed duplicate tokens but
// kept the raw "+" prefix and could not tell a supplement from an operator note;
// formatItemExtrasLabel supersedes it for the Cocina item rows (S2-7D4D).
import { lookupMenu, orarioToMs, calcTimer, FASE_CONFIG, notaCucina } from '../ordenes/TabListos';
import { formatItemExtrasLabel, resolveItemNote, formatItemRemovedLabel } from '../../menu/itemDisplay';
import { ZONE_DELIVERY, tempoAndata } from '../../zones';
import { applyUiOffset } from '../../utils/uiOffset';
import SnoozeButton from '../ui/SnoozeButton';
import { ORDER_STATES } from '../../core/orders';
import {
  buildManualGiroMetaById,
  formatManualGiroLabel,
  getManualGiroForOrder,
  manualGiroAccentColor,
  manualGiroSortAnchorMs,
  resolveGiroReadyBy
} from './manualGiroCocina';

// COCINA_CARD_PIXEL_GRID: costanti griglia visiva unica per le card Cocina.
// RIBBON_H = altezza fissa del top slot (ribbon) uguale per delivery e retiro,
// così l'header verde parte sempre alla stessa quota. SYS_FONT = stack di sistema
// per la leggibilità (solo Cocina; i numeri restano 'DM Mono').
const RIBBON_H = 26;
const SYS_FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif';

// hora = orario consegna cliente → horaForno = hora − tempoAndata(ordine)
// = orario in cui la pizza esce dal forno = momento partenza driver.
// Il margine di cottura è gestito a monte dal sistema slot (NuevoPedidoModal + getCaricoForno).
const subtractMinutes = (hora, min) => {
  if (!hora || !min) return null;
  const [hh, mm] = hora.split(":").map(Number);
  const tot = hh * 60 + mm - min;
  if (tot < 0) return null;
  return `${String(Math.floor(tot/60)%24).padStart(2,"0")}:${String(tot % 60).padStart(2,"0")}`;
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
      // Giro manuale: orario operativo UNICO backend-owned. Precedenza (decisione A)
      // hora_ref (operatore) > salida_ref (proxy). null → nessun piano giro valido →
      // fallback al forno_out per-ordine (NON si finge un piano nel frontend).
      const giroReadyBy = resolveGiroReadyBy(manualGiro);
      const horaForno = giroReadyBy
        ? giroReadyBy
        // Snooze visivo per-card: solo DOMICILIO usa l'offset (PICKUP è priorità reale)
        : (isDelivery ? applyUiOffset(horaFornoBase, o.ui_offset_min) : horaFornoBase);
      // nPizze = solo pizze (no bevande, no dolci)
      const nPizze = items.reduce((s,it) => s + (parseInt(it.q)||1), 0);
      // Il timer usa horaForno come deadline (non hora)
      const oPerTimer = horaForno ? {...o, hora: horaForno} : o;
      // Orario consegna (🛵): SEMPRE la hora cliente del singolo stop (promessa reale).
      // NIENTE entrega_ref unico del giro: in una rotta multi-stop i tempi di consegna
      // sono diversi per stop (il tempo unico falsava #001 23:30 mostrato 23:24). Gli
      // ETA per-stop veri arriveranno da route_plan in Option B.
      const isManualGiro = !!(manualGiro && manualGiro.id);
      const horaEntrega = o.hora;
      // Warning non bloccante: la pizza esce dal forno DOPO l'ora cliente (solo delivery)
      const fornoMs = orarioToMs(horaForno);
      const horaMs = orarioToMs(o.hora);
      const riesgoRetraso = isDelivery && fornoMs != null && horaMs != null && fornoMs > horaMs;
      return {...o, items, extras, horaForno, horaEntrega, isManualGiro, nPizze, isDelivery, zonaObj, manualGiro, riesgoRetraso, _timer: calcTimer(oPerTimer, now)};
    })
    .filter(o=>o.items.length>0 || o.extras.length>0);

  const activos = [...activosBase].sort((a,b)=>{
      const aH = a.horaForno || a.hora, bH = b.horaForno || b.hora;
      if(aH&&bH){
        const aMs=manualGiroSortAnchorMs(a, activosBase)||0,bMs=manualGiroSortAnchorMs(b, activosBase)||0;
        // A parità di slot 10min → il pickup viene PRIMA (max 5min ritardo accettabile per delivery)
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
            // COCINA_MANUAL_GIRO_VISUAL_GROUPING — accent condiviso per membri dello
            // stesso manual_giro_id (border/halo/stripe); zona demota a dot.
            const giroAccent = o.manualGiro ? manualGiroAccentColor(o.manualGiro) : null;
            // COCINA_CARD_BORDER_WEIGHT: contorno UNIFORME 4px per pickup e delivery
            // (era 2px sui pickup → sbilanciato). Halo pieno anche sui non-delivery
            // (rinforzato in late/tarde) → peso visivo coerente riga per riga.
            return (
              <div key={o.id} style={{background:"#fff",borderRadius:16,
                border: hasAggiunta ? `3px solid #E8341C` : (giroAccent ? `4px solid ${giroAccent}` : (o.isDelivery ? `4px solid ${zonaColore}` : `4px solid ${fc.border}`)),
                display:"flex",flexDirection:"column",overflow:"hidden",
                boxShadow: hasAggiunta
                  ? `0 0 0 3px #E8341C44, 0 4px 20px #E8341C33`
                  : giroAccent
                    ? `0 0 0 4px ${giroAccent}88, 0 6px 24px ${giroAccent}55`
                    : o.isDelivery
                      ? `0 0 0 4px ${zonaColore}88, 0 6px 24px ${zonaColore}55`
                      : isUrgent?`0 0 0 4px ${fc.border}88, 0 6px 24px ${fc.border}55`:`0 0 0 3px ${fc.border}44, 0 4px 16px rgba(0,0,0,0.15)`}}>
              {hasAggiunta && (
                <div style={{background:"#E8341C",color:"#fff",textAlign:"center",
                  padding:"5px",fontSize:13,fontWeight:900,letterSpacing:.5,
                  animation:"livePulse 1s infinite"}}>
                  ⚠️ AGGIUNTA IN ATTESA ⚠️
                </div>
              )}
              {/* COCINA_CARD_PIXEL_GRID · TOP_SLOT_SILENT: top slot ad altezza fissa
                  (RIBBON_H) uguale per TUTTE le card → allineamento. SOLO i delivery
                  mostrano la label (`🚚 DELIVERY[· G{seq}]`, accent zona/giro). I
                  non-delivery hanno slot MUTO (nessun testo/icona), fondo coerente con
                  l'header (fc.bg) → nessun segnale visivo forte, solo allineamento. */}
              <div style={{height:RIBBON_H,flexShrink:0,boxSizing:"border-box",
                display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"0 8px",
                background: o.isDelivery ? (giroAccent || zonaColore) : fc.bg,
                color:"#fff",fontSize:12,fontWeight:900,letterSpacing:.7,textTransform:"uppercase",
                textShadow:"0 1px 3px rgba(0,0,0,0.55)"}}>
                {o.isDelivery
                  ? <>🚚 DELIVERY{o.manualGiro ? ` · ${formatManualGiroLabel(o.manualGiro)}` : ""}</>
                  : null}
              </div>
                <div style={{background:fc.bg,padding:"12px 16px",minHeight:88,boxSizing:"border-box",
                  display:"flex",justifyContent:"space-between",alignItems:"flex-start",
                  borderBottom:`1px solid ${fc.border}55`}}>
                  <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
                    {/* COCINA_CARD_PIXEL_GRID: cliente SOTTO il numero ordine (stacked).
                        Numero dominante (24, mono, 900); cliente secondario con ellipsis. */}
                    <div style={{fontFamily:"'DM Mono',monospace",fontWeight:900,color:"#fff",fontSize:24,lineHeight:1}}>{o.id}</div>
                    <div style={{fontFamily:SYS_FONT,color:"rgba(255,255,255,.82)",fontWeight:600,fontSize:14,lineHeight:1.15,marginTop:4,
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>👤 {o.nombre}</div>
                    {/* COCINA_DELIVERY_CARD_COMPACT_UI: chip zona (Q2/Q5) RETIRADO de Cocina
                        (routing no útil en cocina; el giro se ve por la fascia + borde).
                        Zona sigue intacta en Entregas/Repartidor/Nuevo Pedido. */}
                    {/* Orario forno (uscita) — la hora clave para la cocina */}
                    {(o.horaForno || o.hora) && (
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:5,marginTop:5}}>
                        <div style={{display:"inline-flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          {/* COCINA_CARD_PIXEL_GRID: chip ora forno VERDE uniforme in Cocina
                              (stesso per pickup e delivery). Il tipo si distingue dal ribbon +
                              bordo/accent; il chip resta un unico verde alto-contrasto. */}
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
                        {/* COCINA_DELIVERY_CARD_COMPACT_UI: fila hora scooter (🛵 entrega)
                            RETIRADA de Cocina — la cocina no necesita el timing de reparto.
                            La hora de entrega sigue en Entregas/Repartidor. */}
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
                    // S2-7D4D — extras and the operator's manual note are separate concepts
                    // and get separate rows (see PanelCocina for the same split).
                    const extrasLabel = formatItemExtrasLabel(it);
                    const notaItem    = resolveItemNote(it);
                    const removedLabel = formatItemRemovedLabel(it);
                    const nomeIng = mi?.ing || it.ing || "";
                    // COCINA_CARD_PIXEL_GRID: nome pizza reale dominante + tag menù a fianco.
                    const realName = nomeSub || it.n;
                    const tagName  = (nomeSub && it.n && it.n !== nomeSub) ? it.n : "";
                    return (
                      <div key={i} style={{
                        borderBottom: !compact && i<o.items.length-1 ? `2px dashed ${fc.border}44` : "none",
                        paddingBottom: !compact && i<o.items.length-1 ? 12 : 0,
                        background: compact ? "#f7f7f7" : "transparent",
                        borderRadius: compact ? 8 : 0,
                        border: compact ? `1.5px solid ${fc.border}33` : "none",
                        padding: compact ? "8px 8px" : 0,
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
                              display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{realName}{sizeInfo}</span>
                          </div>
                        </div>
                        {/* EXTRAS / supplementi — badge arancione, senza prefisso "+" */}
                        {extrasLabel && (
                          <div style={{display:"inline-block",background:"#FF6B00",color:"#fff",
                            borderRadius:8,padding:"4px 12px",fontSize:compact?12:15,fontWeight:800,
                            marginBottom:5,letterSpacing:.2,textTransform:"uppercase"}}>
                            {extrasLabel}
                          </div>
                        )}
                        {/* INGREDIENTI RIMOSSI — riga PROPRIA (S2-7D4D-FIX1). Terzo stile,
                            distinto dagli extra (si aggiunge) e dalla nota (istruzione). */}
                        {removedLabel && (
                          <div style={{display:"inline-block",background:"#1F2937",color:"#FCA5A5",
                            border:"2px solid #7F1D1D",borderRadius:8,padding:"4px 12px",
                            fontSize:compact?12:15,fontWeight:900,marginBottom:5,letterSpacing:.3,
                            textTransform:"uppercase"}}>
                            🚫 {removedLabel}
                          </div>
                        )}
                        {/* NOTA operatore — riga separata, outline rosso, wrap consentito */}
                        {notaItem && (
                          <div style={{background:"#FEE2E2",border:"2px solid #DC2626",
                            borderRadius:8,padding:"6px 11px",color:"#991B1B",fontFamily:SYS_FONT,
                            fontSize:compact?12:15,fontWeight:900,letterSpacing:.2,textTransform:"uppercase",
                            whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.25,marginBottom:5}}>
                            📝 NOTA: {notaItem}
                          </div>
                        )}
                        {/* Ingredienti — piccoli e grigi, normal-case */}
                        {nomeIng && (
                          <div style={{fontFamily:SYS_FONT,color:"#555",fontSize:compact?11:13,fontWeight:500,lineHeight:1.5}}>
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
                        // S2-7D4D — the note no longer REPLACES the product name.
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
                            <span style={{color:"#fff",fontSize:10,fontWeight:700,textAlign:"center",lineHeight:1.2}}>{p.num?`${p.num}. `:""}{p.n}</span>
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
