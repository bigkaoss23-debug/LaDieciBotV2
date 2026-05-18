import { useState, useEffect, useRef, useMemo } from 'react';
import { C, MENU, CATS, tot, genId, INGREDIENTI, calcTotale as calcTotaleHelper } from '../../constants';
import { sb, api, auth } from '../../api';
import ItemPickerModal from '../ItemPickerModal';
import Chip from '../ui/Chip';
import IaPill from '../ui/IaPill';
import Av from '../ui/Av';
import { ZONE_DELIVERY, zonaBadgeStyle } from '../../zones';

const stripMd = t => (t||"").replace(/\*\*(.*?)\*\*/gs,"$1").replace(/\*(.*?)\*/gs,"$1").replace(/_(.*?)_/gs,"$1");

const WADettaglio = ({msg,onConfirm,onManual,onBack,onElimina,onRispondi,allMsgs,onAgregar,ordenes,onUpdateIaItems,onMoveToPreguntas}) => {
  const _allMsgs = allMsgs || [];
  const [convChat, setConvChat] = useState([]);
  const detScrollRef = useRef(null);

  // Scroll to top quando cambia messaggio selezionato
  useEffect(() => {
    if (detScrollRef.current) detScrollRef.current.scrollTop = 0;
  }, [msg.id]);

  // Carica conv.chat completa da Supabase (fonte primaria della cronologia)
  useEffect(() => {
    const waId = msg.wa_id || msg.tel;
    if (!waId) return;
    sb.select("conv", "wa_id=eq."+waId+"&order=ts.desc&limit=1")
      .then(rows => { if (rows && rows[0] && rows[0].chat) setConvChat(rows[0].chat); })
      .catch(()=>{});
  }, [msg.wa_id, msg.tel]);

  // Thread: conv.chat se disponibile, altrimenti wa_msgs
  const chatThread = useMemo(() => {
    const waId = String(msg.wa_id || msg.tel || "").replace("+", "");

    // FIX MULTIORDINE: calcola i confini temporali di questo ordine
    // Ogni wa_msg ha il suo range: da (prevMsg.ts, nextMsg.ts]
    const sameWaMsgs = _allMsgs
      .filter(m => String(m.wa_id || m.tel || "").replace("+", "") === waId)
      .sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
    const currentIdx = sameWaMsgs.findIndex(m => m.id === msg.id);
    const nextMsg = currentIdx >= 0 && currentIdx < sameWaMsgs.length - 1 ? sameWaMsgs[currentIdx + 1] : null;
    const startTs = Number(msg.ts || 0) - 1; // incluso: parte dal messaggio corrente
    const endTs = nextMsg ? Number(nextMsg.ts || 0) : Infinity; // escluso il prossimo ordine

    if (convChat.length > 0) {
      // Mostra sempre tutta la conv.chat — è la fonte di verità della cronologia completa
      const filtered = convChat;
      // Deduplication: rimuove messaggi con stesso mittente+testo salvati a meno di 30s di distanza
      const normTxt = t => (t || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const deduped = [];
      [...filtered].sort((a,b) => (a.ts||0) - (b.ts||0)).forEach(cm => {
        const last = deduped[deduped.length - 1];
        if (last && last.da === cm.da && normTxt(cm.txt) === normTxt(last.txt) && Math.abs((cm.ts||0) - (last.ts||0)) < 600000) return;
        deduped.push(cm);
      });
      const thread = deduped.map((cm, idx) => ({
        id: "conv_" + idx,
        nombre: msg.nombre || "",
        tel: msg.tel,
        txt: cm.da === "bot" || cm.da === "operatore" ? "" : (cm.txt || ""),
        ts: cm.ts || 0,
        bot_risposta: cm.da === "bot" ? (cm.txt || "") : "",
        op_risposta: cm.da === "operatore" ? (cm.txt || "") : "",
        ia: cm.ia || null,
        _fromConv: true
      }));
      // FIX CHAT-DISPLAY: se conv.chat non ha il messaggio del cliente (solo bot),
      // inietta il txt del wa_msg come primo elemento con il suo ia (per subBadges)
      const hasClientMsg = thread.some(t => t.txt && t.txt.trim().length > 0);
      if (!hasClientMsg && msg.txt) {
        thread.unshift({
          id: "conv_orig",
          nombre: msg.nombre || "",
          tel: msg.tel,
          txt: msg.txt,
          ts: msg.ts || 0,
          bot_risposta: "",
          ia: msg.ia || null,
          _fromConv: true
        });
      }
      return thread;
    }
    const telNorm = String(msg.wa_id||msg.tel||"").replace("+","");
    return _allMsgs
      .filter(m => {
        if (String(m.wa_id||m.tel||m.nombre||"").replace("+","") !== telNorm) return false;
        const t = Number(m.ts || 0);
        return t > startTs && t < endTs;
      })
      .sort((a,b) => Number(a.ts||0) - Number(b.ts||0));
  }, [convChat, _allMsgs, msg.tel, msg.wa_id, msg.nombre, msg.txt, msg.ts, msg.ia, msg.id]);

  // Rileva se c'è un ordine attivo dello stesso cliente (stato COCINA)
  // Whitelist: ogni messaggio è ordine indipendente → mai "Agregar al pedido"
  const NUMEROS_WHITELIST = ["41767011848", "34614267535"];
  const msgInCocina = useMemo(() => {
    const telNorm = String(msg.wa_id||msg.tel||"").replace("+","");
    if (NUMEROS_WHITELIST.includes(telNorm)) return null;
    return _allMsgs.find(m => String(m.wa_id||m.tel||m.nombre||"").replace("+","") === telNorm && m.stato === "COCINA" && m.id !== msg.id) || null;
  }, [_allMsgs, msg.tel, msg.wa_id, msg.id]);

  // ID reale dell'ordine in cucina (da ordenes, non da wa_msgs)
  const ordenActivaId = useMemo(() => {
    const telNorm = String(msg.wa_id||msg.tel||"").replace("+","");
    const o = (ordenes||[]).find(o =>
      String(o.tel||o.wa_id||"").replace("+","") === telNorm && o.estado === "EN_COCINA"
    );
    return o?.id || msg.ordine_ref || null;
  }, [ordenes, msg.wa_id, msg.tel, msg.ordine_ref]);

  // Ordine collegato (per info delivery: tipo/indirizzo/zona)
  const ordenLinked = useMemo(() => {
    if (!ordenes) return null;
    const ref = msg.ordine_ref || ordenActivaId;
    if (ref) {
      const o = ordenes.find(x => x.id === ref);
      if (o) return o;
    }
    const telNorm = String(msg.wa_id||msg.tel||"").replace("+","");
    return (ordenes||[]).find(o =>
      String(o.tel||o.wa_id||"").replace("+","") === telNorm &&
      !["RETIRADO","COMPLETATO"].includes(o.estado)
    ) || null;
  }, [ordenes, msg.ordine_ref, ordenActivaId, msg.wa_id, msg.tel]);

  // Fetch diretto ordine quando ordenLinked è null ma ordine_ref è noto
  const [fetchedOrden, setFetchedOrden] = useState(null);
  useEffect(() => {
    if (ordenLinked || !msg.ordine_ref) { setFetchedOrden(null); return; }
    let cancelled = false;
    sb.select("ordenes", `id=eq.${encodeURIComponent(msg.ordine_ref)}&limit=1`).then(rows => {
      if (!cancelled && rows?.length) {
        const r = rows[0];
        setFetchedOrden({ ...r, items: typeof r.items === "string" ? JSON.parse(r.items) : (r.items||[]) });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [msg.ordine_ref, ordenLinked]);

  const efectiveOrden = ordenLinked || fetchedOrden;

  const deliveryZona = useMemo(() => {
    if (!efectiveOrden) return null;
    return ZONE_DELIVERY.find(z => z.id === efectiveOrden.zona) || null;
  }, [efectiveOrden]);

  // Tipo consegna: preferisce efectiveOrden (dato reale), fallback su msg (rilevato da bot_risposta)
  const tipoConsegna = efectiveOrden?.tipo_consegna || msg.tipo_consegna || "RITIRO";

  // Cucina piena — legge cucina_check dall'ordine POR_CONFIRMAR collegato
  const cucinaCheckInfo = useMemo(() => {
    if (!msg.ordine_ref || !ordenes) return null;
    const order = ordenes.find(o => o.id === msg.ordine_ref);
    if (!order || order.estado !== "POR_CONFIRMAR") return null;
    let cc = order.cucina_check;
    if (!cc) return null;
    if (typeof cc === "string") { try { cc = JSON.parse(cc); } catch(e) { return null; } }
    if (cc.stato !== "pieno") return null;
    return cc; // { stato, slot_disponibili, pizzeOra }
  }, [msg.ordine_ref, ordenes]);
  // Normalizza ia — può arrivare undefined o con items come stringa
  const safeIa = () => {
    const ia = msg.ia || {};
    let items = ia.items || [];
    if(typeof items === "string") {
      try { items = JSON.parse(items); } catch(e) { items = []; }
    }
    if(!Array.isArray(items)) items = [];
    return {
      ...ia,
      items: items.map(i=>({...i, p:parseFloat(i.p||0), q:parseInt(i.q)||1})),
      hora: ia.hora || "",
      conf: Number(ia.conf||0),
      nota: ia.nota || ""
    };
  };
  const [editItems,setEditItems] = useState(()=>safeIa().items);
  const editDirtyRef = useRef(false); // true = operatore ha modificato items, non sovrascrivere
  const [showIngPanel, setShowIngPanel] = useState(null); // index item con panel aperto
  const [showPickerWa, setShowPickerWa] = useState(false);
  const normalizeHora = (h) => {
    if(!h) return "";
    const c = String(h).trim().replace(",",":");
    if(/^\d{1,2}$/.test(c)) return c.padStart(2,"0")+":00";
    if(/^\d{1,2}[:.h]\d{2}$/.test(c)) return c.replace(/[.h]/,":");
    return c;
  };
  const [horaEdit,setHoraEdit] = useState(normalizeHora(msg.ia?.hora));
  const [reinterpretando,setReinterpretando] = useState(false);
  const [iaResult,setIaResult] = useState(()=>safeIa());
  const [showRisposta,setShowRisposta] = useState(false);
  const [testoRisposta,setTestoRisposta] = useState("");
  const [statoLocale,setStatoLocale] = useState(msg.stato||"NUEVO");
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [generandoRisposta,setGenerandoRisposta] = useState(false);
  const [rispostaIAGenerata,setRispostaIAGenerata] = useState(false);

  // Auto-genera risposta IA quando il messaggio non è un ordine
  useEffect(()=>{
    const isNoOrdine = iaResult.items.length===0 && (editItems||[]).length===0;
    if(!isNoOrdine || rispostaIAGenerata || generandoRisposta) return;
    setShowRisposta(true);
    setGenerandoRisposta(true);
    api.get("generaRispostaIA", { testo: msg.txt, wa_id: msg.wa_id||msg.tel||"" })
      .then(d=>{ if(d.risposta){ setTestoRisposta(d.risposta); setRispostaIAGenerata(true); } })
      .catch(()=>{})
      .finally(()=>setGenerandoRisposta(false));
  },[]);

  // Aggiorna stato locale quando msg cambia da polling
  useEffect(()=>{
    if(msg.stato && msg.stato !== statoLocale) {
      setStatoLocale(msg.stato);
    }
  },[msg.stato]);

  // Reset dirty flag e items quando si cambia conversazione
  useEffect(()=>{
    editDirtyRef.current = false;
    const ia = msg.ia || {};
    let items = ia.items || [];
    if(typeof items === "string") { try { items = JSON.parse(items); } catch(e) { items = []; } }
    if(!Array.isArray(items)) items = [];
    setEditItems(items.map(i=>({...i, p:parseFloat(i.p||0), q:parseInt(i.q)||1})));
    setHoraEdit(normalizeHora(ia.hora||""));
  },[msg.id]);

  // FIX D: sincronizza items/hora quando il backend aggiorna ia_items via polling
  // Se l'operatore ha modificato items (dirty), non sovrascrivere
  useEffect(()=>{
    if(editDirtyRef.current) return; // operatore ha modifiche in corso — non toccare
    const ia = msg.ia || {};
    let freshItems = ia.items || [];
    if(typeof freshItems === "string") { try { freshItems = JSON.parse(freshItems); } catch(e) { freshItems = []; } }
    if(!Array.isArray(freshItems) || freshItems.length === 0) return;
    const fresh = freshItems.map(i=>({...i, p:parseFloat(i.p||0), q:parseInt(i.q)||1}));
    // Merge fresh mantenendo sub/p editati dall'operatore — fresh è la lista canonica
    setEditItems(prev => {
      return fresh.map((fItem, fi) => {
        const pItem = prev[fi];
        if (!pItem) return fItem; // item nuovo aggiunto dal bot
        return {...fItem, sub: pItem.sub, p: pItem.p};
      });
    });
    setIaResult(prev => {
      const prevKey = (prev.items||[]).map(i=>i.n+"|"+i.q).join(",");
      const freshKey = fresh.map(i=>i.n+"|"+i.q).join(",");
      return prevKey !== freshKey ? {...prev, items: fresh, hora: ia.hora||prev.hora} : prev;
    });
    if(ia.hora) setHoraEdit(normalizeHora(ia.hora));
  // eslint-disable-next-line
  },[msg.ia]);
  const confC = c => c>=80?C.verde:c>=50?C.giallo:C.rosso;
  const adj=(idx,d)=>{
    editDirtyRef.current = true;
    setEditItems(prev=>
      prev.map((it,i)=>i===idx?{...it,q:Math.max(0,(parseInt(it.q)||1)+d)}:it)
          .filter(it=>it.q>0));
  };

  const reinterpreta = async () => {
    setReinterpretando(true);
    try {
      // Legge i dati IA aggiornati direttamente da Supabase
      const rows = await sb.select("wa_msgs", "id=eq."+encodeURIComponent(msg.id)+"&limit=1");
      if(rows && rows[0]) {
        const fresh = rows[0];
        let newItems = fresh.ia_items || [];
        if(typeof newItems==="string"){try{newItems=JSON.parse(newItems);}catch(e){newItems=[];}}
        if(!Array.isArray(newItems)) newItems=[];
        newItems = newItems.map(i=>({...i,p:parseFloat(i.p||0),q:parseInt(i.q)||1}));
        setIaResult({items:newItems, hora:fresh.ia_hora||"", conf:Number(fresh.ia_conf)||0, nota:fresh.ia_nota||""});
        setEditItems(newItems);
        if(fresh.ia_hora) setHoraEdit(fresh.ia_hora);
      }
    } catch(err) { console.error(err); }
    setReinterpretando(false);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.fumo}`,
        display:"flex",alignItems:"center",gap:12,background:C.carbone2,flexShrink:0}}>
        {onBack&&<button onClick={onBack} style={{background:"none",border:"none",
          color:C.grigio,fontSize:22,padding:0,lineHeight:1}}>←</button>}
        <Av name={msg.nombre} size={36}/>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:C.bianco,fontWeight:700,fontSize:15}}>{msg.nombre}</span>
            {statoLocale==="COCINA" && (
              <span style={{background:C.giallo+"22",color:C.giallo,
                border:`1px solid ${C.giallo}44`,borderRadius:20,
                padding:"2px 9px",fontSize:11,fontWeight:700}}>🍕 En cocina</span>
            )}
            {statoLocale==="RETIRADO" && (
              <span style={{background:C.verde+"22",color:C.verde,
                border:`1px solid ${C.verde}44`,borderRadius:20,
                padding:"2px 9px",fontSize:11,fontWeight:700}}>✅ Retirado</span>
            )}
          </div>
          <div style={{color:C.grigio,fontSize:12}}>{msg.tel} · {msg.ago}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {/* Bottone Re-IA: label + barra conf */}
          <button onClick={reinterpreta} disabled={reinterpretando} style={{
            background:reinterpretando?C.fumo:C.blu+"22",
            border:`1px solid ${reinterpretando?C.fumo:C.blu}`,
            borderRadius:8, padding:"5px 11px",
            display:"flex", flexDirection:"column", alignItems:"center", gap:4,
            cursor:reinterpretando?"default":"pointer", minWidth:62}}>
            <span style={{color:reinterpretando?C.grigio:C.blu, fontSize:11, fontWeight:700, lineHeight:1}}>
              {reinterpretando?"⟳ ...":"⚡ Re-IA"}
            </span>
            {iaResult.conf>0 && !reinterpretando && (
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <div style={{width:34,height:3,background:C.fumo,borderRadius:2}}>
                  <div style={{width:`${iaResult.conf}%`,height:"100%",background:confC(iaResult.conf),borderRadius:2}}/>
                </div>
                <span style={{color:confC(iaResult.conf),fontSize:10,fontWeight:700,
                  fontFamily:"'DM Mono',monospace",lineHeight:1}}>{iaResult.conf}%</span>
              </div>
            )}
          </button>
          {/* Preguntas — stessa altezza */}
          {statoLocale==="NUEVO" && onMoveToPreguntas && (
            <button
              onClick={()=> onMoveToPreguntas(msg.id, msg.wa_id||msg.tel)}
              style={{
                background:"rgba(168,85,247,0.15)", border:"1px solid #a855f7",
                color:"#a855f7", borderRadius:8, padding:"5px 11px",
                fontSize:11, fontWeight:700, cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center", minWidth:62,
                alignSelf:"stretch"
              }}>
              💬 Preguntas
            </button>
          )}
        </div>
      </div>
      {(tipoConsegna === "DOMICILIO" || efectiveOrden?.direccion) && (
        <div style={{
          padding:"8px 14px", background:C.carbone2,
          borderBottom:`1px solid ${C.fumo}`,
          display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", flexShrink:0
        }}>
          <span style={{
            background:"rgba(249,115,22,0.18)", border:"1px solid rgba(249,115,22,0.45)",
            color:"#F97316", borderRadius:6, padding:"2px 8px",
            fontSize:11, fontWeight:700
          }}>🛵 Entrega</span>
          {deliveryZona ? (
            <span style={zonaBadgeStyle(deliveryZona)}>
              {deliveryZona.id} · {deliveryZona.nome}
            </span>
          ) : tipoConsegna === "DOMICILIO" ? (
            <>
              <span style={{color:"#F97316",fontSize:11,fontWeight:700}}>⚠ Sin zona</span>
              {efectiveOrden?.direccion && (
                <a
                  href={`https://www.google.com/maps/dir/${encodeURIComponent("Plaza Italica 8, Roquetas de Mar")}/${encodeURIComponent((efectiveOrden.direccion || "").split(",")[0].trim() + ", Roquetas de Mar")}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    background:"#1D4ED8", color:"#fff",
                    borderRadius:6, padding:"2px 9px",
                    fontSize:11, fontWeight:800, textDecoration:"none",
                    flexShrink:0
                  }}
                >
                  🗺 Ver ruta
                </a>
              )}
            </>
          ) : null}
          {efectiveOrden?.direccion && (
            <span style={{color:C.bianco,fontSize:12,flex:1,minWidth:0,lineHeight:1.4}}>
              📍 {efectiveOrden.direccion}
            </span>
          )}
        </div>
      )}
      <div ref={detScrollRef} style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:14,display:"flex",flexDirection:"column",gap:12}}>
        {/* Chat thread completo del cliente */}
        {chatThread.length > 0 ? chatThread.map((m, idx) => {
          const isPreguntas = statoLocale === "IN_TRATTAMENTO";
          const botMsg = !isPreguntas && m.bot_risposta ? String(m.bot_risposta||"").trim() : null;
          const opMsg = m.op_risposta ? String(m.op_risposta||"").trim() : null;
          const isLast = idx === chatThread.length - 1;
          // small: solo messaggi storici BOT, mai il messaggio cliente
          const small = m._fromConv && !isLast && m.id !== "conv_orig" && m.da === "bot";
          const BEVANDE = new Set(MENU.filter(m=>m.cat==="Bebidas").map(m=>m.n));
          const subBadges = (m.ia?.items||[]).filter(it=>it.sub && !BEVANDE.has(it.n));
          return (
            <div key={m.id || idx} style={{display:"flex",flexDirection:"column",gap:4,
              opacity: small ? 0.65 : 1}}>
              {/* Messaggio cliente */}
              {m.txt ? (
                <div style={{background: small ? C.carbone2 : "#1e2030",borderRadius:"4px 14px 14px 14px",
                  padding: small?"6px 10px":"12px 15px",maxWidth:"85%",border:`1px solid ${small ? C.fumo : "rgba(255,255,255,0.25)"}`}}>
                  <div style={{color:C.wa,fontSize: small?9:11,fontWeight:700,marginBottom:3}}>{m.nombre}</div>
                  <div style={{color: small ? "#aaa" : "#ffffff",fontSize: small?11:13,lineHeight:1.65,fontWeight: small?400:600}}>{m.txt}</div>
                  {subBadges.length > 0 && (
                    <div style={{marginTop:6}}>
                      {subBadges.map((it,ii)=>(
                        <div key={ii} style={{display:"inline-block",background:"#CC2200",color:"#fff",
                          borderRadius:8,padding:"2px 8px",marginTop:4,marginRight:4,
                          fontSize:11,fontWeight:700}}>
                          ⚠ {it.n}: {it.sub}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
              {/* Risposta bot automatica */}
              {botMsg && (
                <div style={{alignSelf:"flex-end",maxWidth:"85%"}}>
                  <div style={{background:"#005C4B",borderRadius:"14px 4px 14px 14px",
                    padding: small?"6px 10px":"10px 13px",border:"1px solid rgba(255,255,255,0.08)"}}>
                    <div style={{color:"rgba(255,255,255,0.5)",fontSize: small?9:10,fontWeight:600,marginBottom:2}}>
                      La 10 Bot
                    </div>
                    <div style={{color:"#fff",fontSize: small?11:13,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{stripMd(botMsg)}</div>
                  </div>
                </div>
              )}
              {/* Risposta operatore manuale */}
              {opMsg && (
                <div style={{alignSelf:"flex-end",maxWidth:"85%"}}>
                  <div style={{background:"#1a3a5c",borderRadius:"14px 4px 14px 14px",
                    padding:"10px 13px",border:"1px solid rgba(255,255,255,0.08)"}}>
                    <div style={{color:"rgba(255,255,255,0.5)",fontSize:10,fontWeight:600,marginBottom:2}}>
                      Operador ✓✓
                    </div>
                    <div style={{color:"#fff",fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{stripMd(opMsg)}</div>
                  </div>
                </div>
              )}
            </div>
          );
        }) : (
          <div style={{background:"#1e2030",borderRadius:"4px 14px 14px 14px",
            padding:"12px 15px",maxWidth:"90%",border:"1px solid rgba(255,255,255,0.25)"}}>
            <div style={{color:C.wa,fontSize:11,fontWeight:700,marginBottom:3}}>{msg.nombre}</div>
            <div style={{color:"#ffffff",fontSize:13,lineHeight:1.65,fontWeight:600}}>{msg.txt}</div>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:11,marginTop:5,textAlign:"right"}}>{msg.ago} ✓✓</div>
          </div>
        )}

        {/* Messaggio bot sull'ultimo msg se non già mostrato nel thread — MAI per Preguntas (IN_TRATTAMENTO) */}
        {msg.bot_risposta && !chatThread.some(m => m.bot_risposta) && statoLocale !== "IN_TRATTAMENTO" && (
          <div style={{alignSelf:"flex-end",maxWidth:"90%"}}>
            <div style={{background:"#005C4B",borderRadius:"14px 4px 14px 14px",
              padding:"12px 14px",border:"1px solid rgba(255,255,255,0.08)"}}>
              <div style={{color:"rgba(255,255,255,0.5)",fontSize:11,fontWeight:600,marginBottom:3}}>
                La 10 Bot
              </div>
              <div style={{color:"#fff",fontSize:13,lineHeight:1.65,whiteSpace:"pre-wrap"}}>
                {stripMd(String(msg.bot_risposta||"").trim())}
              </div>
              <div style={{color:"rgba(255,255,255,0.4)",fontSize:11,marginTop:5,textAlign:"right"}}>✓✓</div>
            </div>
          </div>
        )}



        {iaResult.items.length===0 && editItems.length===0 && statoLocale !== "NUEVO"
          ?<div style={{background:C.carbone2,borderRadius:12,
            border:`1px solid ${C.rosso}30`,padding:"14px 16px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div style={{color:C.rosso,fontWeight:700,fontSize:13}}>⚠ No es un pedido</div>
              <button onClick={()=>{
                if(window.confirm("Eliminar este mensaje de todos los registros?")) {
                  onElimina(msg.id, msg.wa_id||msg.tel);
                }
              }} style={{background:"transparent",border:"none",
                color:"#FF444488",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                🗑 Eliminar</button>
            </div>

            {/* Risposta IA — appare automaticamente o dopo tap */}
            {!showRisposta ? (
              <button
                onClick={async ()=>{
                  setShowRisposta(true);
                  if(!rispostaIAGenerata) {
                    setGenerandoRisposta(true);
                    try {
                      const data = await api.get("generaRispostaIA", { testo: msg.txt, wa_id: msg.wa_id||msg.tel||"" });
                      if(data.risposta) {
                        setTestoRisposta(data.risposta);
                        setRispostaIAGenerata(true);
                      }
                    } catch(e){}
                    setGenerandoRisposta(false);
                  }
                }}
                style={{
                  width:"100%",background:C.wa+"18",border:`1px solid ${C.wa}`,
                  color:C.wa,borderRadius:9,padding:"11px 14px",
                  fontSize:13,fontWeight:700,display:"flex",
                  alignItems:"center",justifyContent:"center",gap:8}}>
                <span style={{fontSize:16}}>💬</span> Responder con IA
              </button>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {generandoRisposta ? (
                  <div style={{background:C.fumo,borderRadius:9,padding:"14px 12px",
                    color:C.grigio,fontSize:13,textAlign:"center",
                    display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    <span style={{animation:"pulse 1s infinite"}}>⟳</span>
                    IA generando respuesta...
                  </div>
                ) : (
                  <>
                    {rispostaIAGenerata && (
                      <div style={{color:C.blu,fontSize:11,fontWeight:600,
                        marginBottom:2,display:"flex",alignItems:"center",gap:4}}>
                        <span>⚡ Propuesta por IA</span>
                        <span style={{color:C.grigio,fontWeight:400}}>— edita si es necesario</span>
                      </div>
                    )}
                    <textarea
                      value={testoRisposta}
                      onChange={e=>setTestoRisposta(e.target.value)}
                      placeholder="Escribe tu respuesta al cliente..."
                      rows={4}
                      style={{background:C.fumo,
                        border:`1.5px solid ${rispostaIAGenerata?C.blu:C.wa}`,
                        borderRadius:9,color:C.bianco,padding:"10px 12px",
                        fontSize:13,resize:"none",width:"100%",lineHeight:1.6}}/>
                  </>
                )}
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{
                    setShowRisposta(false);
                    setGenerandoRisposta(false);
                  }} style={{
                    background:"transparent",border:`1px solid ${C.fumo}`,
                    color:C.grigio,borderRadius:9,padding:"9px 14px",fontSize:13}}>
                    ← Volver</button>
                  <button onClick={()=>{
                    if(testoRisposta.trim()) {
                      onRispondi(msg.tel, testoRisposta.trim());
                      setShowRisposta(false);
                      setTestoRisposta("");
                    }
                  }} disabled={!testoRisposta.trim()||generandoRisposta} style={{
                    flex:1,
                    background:testoRisposta.trim()&&!generandoRisposta?C.wa:C.fumo,
                    border:"none",
                    color:testoRisposta.trim()&&!generandoRisposta?"#fff":C.grigio,
                    borderRadius:9,padding:"9px 14px",fontSize:13,fontWeight:700,
                    display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    📤 Enviar por WhatsApp
                  </button>
                </div>
              </div>
            )}
          </div>
          :<div style={{background:C.carbone2,borderRadius:14,
            border:`1px solid ${C.blu}28`,padding:"14px 16px"}}>
            <div style={{color:C.blu,fontWeight:700,fontSize:13,marginBottom:10}}>⚡ Interpretado por IA</div>
            {editItems.map((it,i)=>(
              <div key={i} style={{background:C.fumo+"66",borderRadius:9,padding:"9px 12px",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:18}}>{it.e}</span>
                  <span style={{color:C.bianco,flex:1,fontSize:14,fontWeight:500}}>{it.n}</span>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <button onClick={()=>adj(i,-1)} style={{background:C.fumo,border:"none",
                      color:C.bianco,width:30,height:30,borderRadius:7,fontWeight:700,fontSize:16,
                      display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                    <span style={{color:C.bianco,fontWeight:800,minWidth:22,textAlign:"center",
                      fontFamily:"'DM Mono',monospace",fontSize:15}}>{it.q}</span>
                    <button onClick={()=>adj(i,+1)} style={{background:C.fumo,border:"none",
                      color:C.bianco,width:30,height:30,borderRadius:7,fontWeight:700,fontSize:16,
                      display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                  </div>
                  <span style={{color:C.grigio,fontSize:12,minWidth:42,textAlign:"right",
                    fontFamily:"'DM Mono',monospace"}}>{(it.p*it.q).toFixed(2)}€</span>
                </div>
                {/* Modifiche per item — sempre editabile */}
                <input
                  value={it.sub||""}
                  onChange={e => setEditItems(prev => prev.map((x,j) => j===i ? {...x, sub:e.target.value} : x))}
                  placeholder="Modificaciones (sin cebolla, extra picante...)"
                  style={{width:"100%",marginTop:6,background:"rgba(232,52,28,0.08)",
                    border:`1px solid ${it.sub ? "#E8341C88" : C.fumo}`,
                    borderRadius:7,color: it.sub ? "#E8341C" : C.grigio,
                    padding:"5px 9px",fontSize:12,fontWeight:it.sub?700:400,
                    boxSizing:"border-box"}}
                />
                {/* Riepilogo extras aggiunti via bottone */}
                {(()=>{
                  const matches = (it.sub||"").match(/\+[^,]+/g)||[];
                  const counts = {};
                  matches.forEach(m=>{
                    const name=m.replace(/^\+/,"").trim();
                    counts[name]=(counts[name]||0)+1;
                  });
                  const extras=Object.entries(counts).map(([name,qty])=>{
                    const ing=INGREDIENTI.find(g=>g.n===name);
                    return{name,qty,prezzo:ing?Math.round(ing.prezzo*qty*100)/100:0,e:ing?ing.e:"➕"};
                  });
                  if(!extras.length) return null;
                  return(
                    <div style={{marginTop:5,background:"rgba(168,85,247,0.08)",borderRadius:7,
                      padding:"6px 10px",border:"1px solid rgba(168,85,247,0.25)"}}>
                      <div style={{color:"#a855f7",fontSize:10,fontWeight:800,marginBottom:3,
                        letterSpacing:"0.05em"}}>🧩 EXTRAS AÑADIDOS</div>
                      {extras.map((ex,ei)=>(
                        <div key={ei} style={{display:"flex",justifyContent:"space-between",
                          alignItems:"center",fontSize:12,marginBottom:2,gap:6}}>
                          <span style={{color:"#ccc",flex:1}}>{ex.e} {ex.qty}× {ex.name}</span>
                          <span style={{color:"#a855f7",fontWeight:700,
                            fontFamily:"'DM Mono',monospace"}}>+{ex.prezzo.toFixed(2)}€</span>
                          <button
                            onClick={()=>{
                              const ing=INGREDIENTI.find(g=>g.n===ex.name);
                              setEditItems(prev=>prev.map((x,j)=>{
                                if(j!==i) return x;
                                // Rimuove una sola occorrenza di "+NomeIngrediente" dal sub
                                const parts=(x.sub||"").split(",").map(s=>s.trim()).filter(Boolean);
                                let rimosso=false;
                                const newParts=parts.filter(p=>{
                                  if(!rimosso && p==="+"+ex.name){rimosso=true;return false;}
                                  return true;
                                });
                                const newSub=newParts.join(", ");
                                const newP=ing?Math.round((x.p - ing.prezzo)*100)/100:x.p;
                                return{...x, sub:newSub, p:Math.max(0,newP)};
                              }));
                            }}
                            style={{background:"rgba(232,52,28,0.15)",border:"1px solid rgba(232,52,28,0.4)",
                              borderRadius:5,color:"#E8341C",fontSize:10,fontWeight:800,
                              padding:"2px 7px",cursor:"pointer",lineHeight:1.4,flexShrink:0}}>
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* Bottone aggiungi ingrediente extra → apre popup */}
                <button
                  onClick={()=>setShowIngPanel(i)}
                  style={{marginTop:6,background:"rgba(168,85,247,0.22)",
                    border:"1.5px solid rgba(168,85,247,0.65)",
                    borderRadius:7,color:"#c084fc",fontSize:11,fontWeight:700,
                    padding:"4px 10px",cursor:"pointer",width:"100%"}}>
                  ➕ Añadir ingrediente extra
                </button>
              </div>
            ))}
            {/* ── POPUP INGREDIENTE EXTRA ── */}
            {showIngPanel !== null && (
              <div style={{position:"fixed",inset:0,zIndex:9999,
                background:"rgba(0,0,0,0.8)",display:"flex",
                alignItems:"center",justifyContent:"center",padding:"20px"}}
                onClick={()=>setShowIngPanel(null)}>
                <div style={{background:"#1a1a1a",borderRadius:16,
                  width:"100%",maxWidth:420,maxHeight:"75vh",
                  display:"flex",flexDirection:"column",overflow:"hidden",
                  boxShadow:"0 20px 60px rgba(0,0,0,0.6)"}}
                  onClick={e=>e.stopPropagation()}>
                  {/* Header */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"14px 16px",borderBottom:"1px solid #2a2a2a"}}>
                    <div>
                      <div style={{color:"#fff",fontWeight:900,fontSize:14}}>Ingrediente extra</div>
                      {editItems[showIngPanel] && (
                        <div style={{color:"#a855f7",fontSize:11,fontWeight:700,marginTop:2}}>
                          {editItems[showIngPanel].n}
                        </div>
                      )}
                    </div>
                    <button onClick={()=>setShowIngPanel(null)}
                      style={{background:"#2a2a2a",border:"none",color:"#888",borderRadius:"50%",
                        width:28,height:28,fontSize:14,cursor:"pointer",lineHeight:1}}>✕</button>
                  </div>
                  {/* Griglia ingredienti */}
                  <div style={{overflowY:"auto",padding:"12px 14px",flex:1}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      {INGREDIENTI.filter(ing=>ing.prezzo>0).map(ing=>{
                        const currentSub = editItems[showIngPanel]?.sub || "";
                        const count = (currentSub.match(new RegExp(`\\+${ing.n}`, "g")) || []).length;
                        const sel = count > 0;
                        return (
                        <button key={ing.id}
                          onClick={()=>{
                            setEditItems(prev=>prev.map((x,j)=>j===showIngPanel?{
                              ...x,
                              p: Math.round((x.p + ing.prezzo)*100)/100,
                              sub: [x.sub, `+${ing.n}`].filter(Boolean).join(", ")
                            }:x));
                          }}
                          style={{background: sel ? "rgba(168,85,247,0.2)" : "#222",
                            border: `1px solid ${sel ? "#a855f7" : "#333"}`,
                            borderRadius:10,padding:"10px 12px",cursor:"pointer",
                            display:"flex",alignItems:"center",gap:8,textAlign:"left",
                            position:"relative"}}>
                          {sel && <span style={{position:"absolute",top:-6,right:-6,
                            background:"#a855f7",color:"#fff",borderRadius:"50%",
                            width:18,height:18,fontSize:10,fontWeight:900,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            border:"2px solid #1a1a1a"}}>{count}</span>}
                          <span style={{fontSize:18,flexShrink:0}}>{ing.e}</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{color: sel ? "#fff" : "#ddd",fontSize:12,fontWeight:sel?700:600,
                              whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ing.n}</div>
                            <div style={{color:"#a855f7",fontSize:11,fontWeight:800}}>+{ing.prezzo.toFixed(2)}€</div>
                          </div>
                        </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{padding:"12px 14px",borderTop:"1px solid #2a2a2a"}}>
                    <button onClick={()=>setShowIngPanel(null)}
                      style={{width:"100%",background:"#a855f7",border:"none",
                        borderRadius:10,padding:"12px 0",color:"#fff",
                        fontWeight:900,fontSize:14,cursor:"pointer"}}>
                      ✅ Listo
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* ── ItemPickerModal (rimpiazza il vecchio popup inline) ── */}
            <ItemPickerModal
              visible={showPickerWa}
              onClose={() => setShowPickerWa(false)}
              onAdd={async (item) => {
                editDirtyRef.current = true;
                const newItems = (() => {
                  const prev = editItems;
                  const idx = prev.findIndex(i => String(i.id) === String(item.id) && !item.sub);
                  if (idx >= 0 && !item.sub) {
                    const u = [...prev]; u[idx] = { ...u[idx], q: u[idx].q + 1 }; return u;
                  }
                  return [...prev, { id: item.id, n: item.n, q: item.q || 1, p: item.p, e: item.e, sub: item.sub || "", alg: item.alg || "", cat: item.cat, ing: item.ing || "" }];
                })();
                setEditItems(newItems);
                // Se l'ordine è già in cucina, salva subito su Railway
                if (statoLocale === "COCINA" && ordenActivaId) {
                  setSavingUpdate(true);
                  try {
                    await api.post({ action: "updateOrden", id: ordenActivaId, items: newItems, hora: horaEdit || undefined });
                    editDirtyRef.current = false;
                  } catch (e) { console.error(e); }
                  setSavingUpdate(false);
                }
              }}
              onUpdate={() => {}}
              itemEsistente={null}
            />
            {/* ─────────────────────────────────────────────────── */}
            {(()=>{
              // FIX UI-1: nascondi JSON grezzo (ORDINE_PENDING, ADICION, etc.) — mostra solo nota testuale
              const notaRaw = iaResult.nota || "";
              const isJson = notaRaw.trim().startsWith("{") || notaRaw.trim().startsWith("[");
              const notaVisualiz = isJson ? "" : notaRaw;
              return notaVisualiz ? <div style={{color:C.giallo,fontSize:12,marginTop:6}}>📝 {notaVisualiz}</div> : null;
            })()}
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6}}>
              <span style={{color:C.grigio,fontSize:12,whiteSpace:"nowrap"}}>{tipoConsegna === "DOMICILIO" ? "🛵 Hora entrega" : "🕐 Hora retiro"}</span>
              <input type="time" step="60" value={horaEdit} onChange={e=>setHoraEdit(e.target.value)}
                style={{flex:1,background:C.fumo,border:`1px solid ${C.fumo}`,
                  borderRadius:8,color:C.bianco,padding:"5px 8px",fontSize:13}}/>
              <button
                onClick={()=>setShowPickerWa(true)}
                style={{background:"rgba(232,52,28,0.22)",border:"1.5px solid rgba(232,52,28,0.7)",
                  borderRadius:8,color:"#ff6b55",fontWeight:800,fontSize:11,
                  padding:"5px 10px",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
                ➕ Agregar del menú
              </button>
            </div>
            <div style={{height:1,background:C.fumo,margin:"12px 0"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <span style={{color:C.grigio,fontSize:13}}>Total</span>
              <span style={{color:C.verde,fontWeight:800,fontSize:18,fontFamily:"'DM Mono',monospace"}}>
                {(() => {
                  const clean = editItems.filter(i => i.n !== "Entrega a domicilio");
                  return calcTotaleHelper(clean, tipoConsegna).toFixed(2);
                })()}€</span>
            </div>
            {/* ── Banner: Cucina piena ── */}
            {cucinaCheckInfo && statoLocale !== "COCINA" && statoLocale !== "RETIRADO" && (
              <div style={{
                background:"rgba(232,52,28,0.12)",
                border:"1.5px solid #E8341C88",
                borderRadius:12, padding:"10px 14px", marginBottom:4
              }}>
                <div style={{color:"#E8341C",fontWeight:700,fontSize:13,marginBottom:6}}>
                  ⚠️ Cucina piena alle {horaEdit}
                  {cucinaCheckInfo.pizzeOra != null && (
                    <span style={{fontWeight:400,color:"#E8341C99",marginLeft:6}}>
                      ({cucinaCheckInfo.pizzeOra}/8 pizze)
                    </span>
                  )}
                </div>
                {cucinaCheckInfo.slot_disponibili && cucinaCheckInfo.slot_disponibili.length > 0 && (
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                    {cucinaCheckInfo.slot_disponibili.map(slot => (
                      <button key={slot}
                        onClick={()=>{
                          setHoraEdit(slot);
                          onConfirm(msg.id, editItems, horaEdit, msg.nombre, msg.tel, slot);
                        }}
                        style={{
                          background:C.verde, color:"#fff", border:"none",
                          borderRadius:8, padding:"6px 12px",
                          fontWeight:700, fontSize:13, cursor:"pointer"
                        }}>
                        ➡️ Sposta {slot}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={()=> onConfirm(msg.id, editItems, horaEdit, msg.nombre, msg.tel)}
                  style={{
                    background:"transparent", color:"#E8341C",
                    border:"1px solid #E8341C88", borderRadius:8,
                    padding:"5px 12px", fontWeight:600, fontSize:12, cursor:"pointer"
                  }}>
                  Conferma comunque alle {horaEdit}
                </button>
              </div>
            )}

            <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",gap:8}}>
              {/* Bottone unico: Agregar se c'è ordine attivo, Confirmar altrimenti */}
              {msgInCocina && onAgregar ? (
                <button
                  onClick={()=>{ if(editItems.length>0) onAgregar(msg.id, msgInCocina.id, editItems, "COCINA"); }}
                  disabled={editItems.length===0}
                  style={{flex:1,
                    background: editItems.length>0 ? C.verde : C.fumo,
                    color:"#fff", border:"none", borderRadius:10, padding:"13px 0",
                    fontWeight:800, fontSize:14,
                    boxShadow: editItems.length>0 ? `0 4px 14px ${C.verde}44` : "none",
                    cursor: editItems.length>0 ? "pointer" : "not-allowed"}}>
                  ➕ Agregar al pedido
                </button>
              ) : (
                <button
                  onClick={()=>{
                    if(statoLocale==="COCINA"||statoLocale==="RETIRADO"||statoLocale==="COMPLETATO") return;
                    editDirtyRef.current = false;
                    onConfirm(msg.id,editItems,horaEdit,msg.nombre,msg.tel);
                  }}
                  disabled={(editItems.length===0 && !ordenActivaId) || statoLocale==="COCINA" || statoLocale==="RETIRADO" || statoLocale==="COMPLETATO"}
                  style={{flex:1,
                    background: statoLocale==="COCINA"
                      ? C.giallo
                      : statoLocale==="RETIRADO"
                      ? C.verde
                      : (editItems.length>0 || ordenActivaId) ? C.rosso : C.fumo,
                    color:"#fff", border:"none",
                    borderRadius:10, padding:"13px 0", fontWeight:800, fontSize:14,
                    opacity: (statoLocale==="COCINA"||statoLocale==="RETIRADO") ? 0.7 : 1,
                    boxShadow: (editItems.length>0 || ordenActivaId) && statoLocale==="NUEVO"
                      ? `0 4px 14px ${C.rosso}44` : "none",
                    cursor: (statoLocale==="COCINA"||statoLocale==="RETIRADO"||statoLocale==="COMPLETATO") ? "not-allowed" : "pointer"
                  }}>
                  {statoLocale==="COCINA"
                    ? "🍕 Enviado a cocina"
                    : statoLocale==="RETIRADO"
                    ? "✅ Retirado"
                    : statoLocale==="COMPLETATO"
                    ? "✅ Entregado"
                    : "🚀 CONFIRMAR → COCINA"}
                </button>
              )}
            </div>
            {statoLocale==="COCINA" && (
              <button
                onClick={async()=>{
                  if (!ordenActivaId) return;
                  setSavingUpdate(true);
                  try {
                    await api.post({action:"updateOrden", id:ordenActivaId, items:editItems, hora:horaEdit||undefined});
                    await api.post({action:"updateWaStato", id:msg.id, ia_items: editItems});
                    if (onUpdateIaItems) onUpdateIaItems(msg.id, editItems);
                    editDirtyRef.current = false;
                  } catch(e){ console.error(e); }
                  setSavingUpdate(false);
                }}
                disabled={savingUpdate}
                style={{width:"100%",marginTop:8,
                  background: savingUpdate ? C.fumo : "#E8341C",
                  border:"none",borderRadius:10,padding:"12px 0",
                  color:"#fff",fontWeight:900,fontSize:14,
                  cursor: savingUpdate ? "not-allowed" : "pointer",
                  boxShadow:"0 4px 14px rgba(232,52,28,0.35)"}}>
                {savingUpdate ? "Guardando..." : "💾 Actualizar en cocina"}
              </button>
            )}
            <button onClick={()=>{
              if(window.confirm("¿Eliminar este mensaje?")) onElimina(msg.id, msg.wa_id||msg.tel);
            }} style={{background:"transparent",border:"none",color:"#FF444466",
              fontSize:12,fontWeight:600,cursor:"pointer",padding:"4px 0",
              textAlign:"center",width:"100%"}}>🗑 Eliminar mensaje</button>
            </div>
          </div>
        }
      </div>
    </div>
  );
};


// ─── MODIFICA ORDINE MODAL ────────────────────────────────────
// ─── PIZZA CUSTOM BUILDER ─────────────────────────────────────

export default WADettaglio;
