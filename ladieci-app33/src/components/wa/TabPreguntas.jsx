import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { C, useWidth, DELIVERY_FEE } from '../../constants';
import { ZONE_DELIVERY } from '../../zones';
import { sb, api, auth } from '../../api';
import PreguntaCard from './PreguntaCard';
import WADettaglio from './WADettaglio';
import { isCicloChiuso } from './WaLista';
import Badge from '../ui/Badge';

// Rimuove markdown (asterischi, underscore) per display pulito nelle bolle
const stripMd = t => (t||"").replace(/\*\*(.*?)\*\*/gs,"$1").replace(/\*(.*?)\*/gs,"$1").replace(/_(.*?)_/gs,"$1");

const TabPreguntas = ({msgs, allMsgs, ordenes, onCreaOrdine, onElimina, onRispondi, onAddicion, onConfirmaDaConfermare, onNuevoPedido, onMoveToNuevo}) => {
  const _allMsgs = allMsgs || [];
  const [sel, setSel] = useState(null); // tel del cliente
  const [risposteCache, setRisposteCache] = useState({}); // key = tel
  const [editItemsMap, setEditItemsMap] = useState({}); // key = tel, items editabili per modifica_complessa
  const [editDireccionMap, setEditDireccionMap] = useState({}); // key = tel, indirizzo editabile
  const [editZonaMap, setEditZonaMap] = useState({}); // key = tel, zona manuale selezionata dall'operatore
  const [convThreads, setConvThreads] = useState({}); // key = tel, array messaggi da CONV
  const prevLenRef = useRef({});
  const [tick, setTick] = useState(0); // timer real-time per le card
  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 10000);
    return () => clearInterval(t);
  }, []);
  const autoLoadedRef = useRef({}); // track which tels already auto-loaded
  const risposteCacheRef = useRef({});
  const [waitingTels, setWaitingTels] = useState(new Set());
  // P1 anti double-click: feedback visivo per il bottone "Enviar al cliente · Confirmar pedido".
  // Il side-effect è già protetto handler-side da `confermaInflightRef` in ServicioPage —
  // questo set serve solo a `disabled` + label "Enviando…" durante l'attesa.
  const [confirmingTels, setConfirmingTels] = useState(new Set());
  const waitingSentAtRef = useRef({}); // tel → timestamp dell'invio risposta // ref sempre aggiornato per accesso in callback con deps []
  const threadScrollRef = useRef(null);
  const w = useWidth();
  risposteCacheRef.current = risposteCache; // sempre aggiornato

  // Scroll al top del thread quando si apre una nuova conversazione
  useEffect(() => {
    if (threadScrollRef.current) {
      threadScrollRef.current.scrollTop = 0;
    }
  }, [sel]);

  // Auto-carica bot_risposta dal backend quando il messaggio arriva con risposta pre-generata
  // Rimuove da waitingTels se arriva un nuovo messaggio dal cliente
  useEffect(() => {
    msgs.forEach(m => {
      const tel = String(m.wa_id||m.tel||m.nombre||"").replace("+","");
      if (!tel) return;
      // Riattiva conversazione solo se il messaggio è arrivato DOPO l'invio della risposta
      setWaitingTels(prev => {
        if (!prev.has(tel)) return prev;
        const sentAt = waitingSentAtRef.current[tel] || 0;
        const msgTs = Number(m.ts || 0);
        if (msgTs <= sentAt) return prev; // stesso messaggio vecchio, non rimuovere
        const next = new Set(prev); next.delete(tel);
        delete waitingSentAtRef.current[tel];
        return next;
      });
      if (autoLoadedRef.current[tel]) return; // già caricato
      autoLoadedRef.current[tel] = true;
      // Usa bot_risposta pre-esistente se disponibile, altrimenti auto-genera
      if (m.bot_risposta && m.bot_risposta.length > 10) {
        setRisposteCache(prev => {
          if (prev[tel]?.testo) return prev;
          return {...prev, [tel]: {testo: stripMd(m.bot_risposta), generando: false}};
        });
      } else {
        // Auto-genera risposta IA se non già in cache
        setRisposteCache(prev => {
          if (prev[tel]?.testo || prev[tel]?.generando) return prev;
          return {...prev, [tel]: {testo: "", generando: true}};
        });
        api.get("generaRispostaIA", { testo: m.txt||"", wa_id: tel })
          .then(d => { setRisposteCache(prev => ({...prev, [tel]: {testo: stripMd(d.risposta || ""), generando: false}})); })
          .catch(() => { setRisposteCache(prev => ({...prev, [tel]: {testo: "", generando: false}})); });
      }
    });
  }, [msgs]);

  const parseAdicion = (m) => {
    try {
      const nota = m?.ia?.nota || "";
      if (nota.indexOf('"tipo":"ADICION"') === -1 && nota.indexOf('"tipo":"ADICION_NUEVO"') === -1) return null;
      return JSON.parse(nota);
    } catch(e) { return null; }
  };
  const isTablet = w >= 768;

  // Raggruppa per cliente — usa wa_id come chiave univoca
  const clientiConversazioni = useMemo(() => {
    const byTel = {};
    // Lista: solo messaggi del tab corrente (Preguntas)
    msgs.forEach(m => {
      const key = String(m.wa_id||m.tel||m.nombre||"").replace("+","");
      if(!byTel[key]) byTel[key] = { key, msgs:[], thread:[] };
      byTel[key].msgs.push(m);
    });
    // Thread: prendi solo messaggi dello stesso wa_id
    (_allMsgs||msgs).forEach(m => {
      const key = String(m.wa_id||m.tel||m.nombre||"").replace("+","");
      if(!byTel[key]) return; // solo clienti già in Preguntas
      byTel[key].thread.push(m);
    });
    return Object.values(byTel).map(c => {
      const primoTs = c.msgs.reduce((min, m) => {
        const t = Number(m.ts||0);
        return t > 0 && t < min ? t : min;
      }, Infinity);
      return {
        ...c,
        msgs: (c.thread.length > 0 ? c.thread : c.msgs).sort((a,b)=>Number(a.ts||0)-Number(b.ts||0)),
        ultimo: c.msgs.sort((a,b)=>Number(b.ts||0)-Number(a.ts||0))[0],
        nonLetti: c.msgs.filter(m=>!m.leido).length,
        primoTs: primoTs === Infinity ? null : primoTs
      };
    }).sort((a,b)=>Number(b.ultimo?.ts||0)-Number(a.ultimo?.ts||0));
  }, [msgs, _allMsgs]);

  // Batch load conv.chat per tutti i tel in Preguntas — per sapere subito chi è già stato risposto
  useEffect(() => {
    const tels = clientiConversazioni.map(c => c.key).filter(Boolean);
    if (tels.length === 0) return;
    const toLoad = tels.filter(tel => !convThreads[tel]);
    if (toLoad.length === 0) return;
    sb.select("conv", "wa_id=in.(" + toLoad.map(t => `"${t}"`).join(",") + ")&select=wa_id,chat")
      .then(rows => {
        if (!rows || rows.length === 0) return;
        setConvThreads(prev => {
          const upd = {...prev};
          rows.forEach(r => { if (r.wa_id && r.chat) upd[r.wa_id] = r.chat; });
          return upd;
        });
      }).catch(() => {});
  // eslint-disable-next-line
  }, [clientiConversazioni.map(c=>c.key).join(",")]);

  // Thread del cliente selezionato
  const selConv = useMemo(() =>
    clientiConversazioni.find(c=>c.key===sel)||null,
  [clientiConversazioni, sel]);
  const waMsgsThread = selConv ? selConv.msgs : [];

  // Thread chat: CONV e' la fonte primaria, WA_MSGS come fallback
  const selThread = useMemo(() => {
    const tel = sel;
    if (!tel) return waMsgsThread;
    const convChat = convThreads[tel] || [];

    if (convChat.length > 0) {
      const nombre = selConv?.ultimo?.nombre || "";
      const combined = convChat.map((cm, idx) => {
        const isBot = cm.da === "bot" || cm.da === "operatore";
        // FIX SUB-01: preserva cm.ia dal backend cosi i subBadges (variazioni pizza) sono visibili
        const iaData = cm.ia ? cm.ia : { conf: 0, items: [], hora: "", nota: "" };
        return {
          id: "conv_" + idx + "_" + cm.ts,
          nombre: nombre,
          tel: tel,
          txt: isBot ? "" : (cm.txt || ""),
          ts: cm.ts || 0,
          ago: "",
          ia: iaData,
          da: cm.da || "user",
          bot_risposta: cm.da === "bot" ? (cm.txt || "") : "",
          op_risposta: cm.da === "operatore" ? (cm.txt || "") : "",
          _botOnly: isBot,
          _fromConv: true
        };
      });
      // Aggiungi msg WA_MSGS solo se non già presente in conv.chat (stesso testo normalizzato entro 60s)
      const normT = t => (t||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
      waMsgsThread.forEach(wm => {
        const alreadyInConv = combined.some(c => normT(c.txt) === normT(wm.txt) && Math.abs((c.ts||0)-(wm.ts||0)) < 600000);
        if (!alreadyInConv) combined.push(wm);
      });
      combined.sort((a,b) => (a.ts||0) - (b.ts||0));
      // Deduplica: rimuove voci con stesso mittente+testo normalizzato a meno di 5 minuti di distanza
      const deduped = [];
      combined.forEach(item => {
        const dupIdx = deduped.findIndex(d => normT(d.txt) === normT(item.txt) && d.da === item.da && Math.abs((item.ts||0) - (d.ts||0)) < 600000);
        if (dupIdx >= 0) return;
        deduped.push(item);
      });
      return deduped;
    }
    return waMsgsThread;
  }, [waMsgsThread, convThreads, sel, selConv]);


  // L'ultimo messaggio REALE del thread (escludi _botOnly sintetici)
  const selMsgReal = selThread.filter(m => !m._botOnly);
  const selMsg    = selMsgReal[selMsgReal.length-1] || selThread[selThread.length-1] || null;

  // Ref per il textarea — per il focus quando si clicca Manual
  const textareaRef = useRef(null);

  // Genera risposta IA per un thread (solo su richiesta esplicita: "Regenerar")
  const generaRisposta = useCallback((tel, txt, ctxItems, ctxHora, thread) => {
    if(!tel||!txt) return;
    setRisposteCache(prev => ({...prev, [tel]: {testo:"", generando:true}}));
    const itemsParam = ctxItems && ctxItems.length > 0 ? "&items="+encodeURIComponent(JSON.stringify(ctxItems)) : "";
    const horaParam  = ctxHora ? "&hora="+encodeURIComponent(ctxHora) : "";
    const threadParam = thread && thread.length > 0
      ? "&thread="+encodeURIComponent(JSON.stringify(thread.map(m=>({txt:m.txt, bot:m.bot_risposta||""}))))
      : "";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const lastMsgId = thread && thread.length > 0 ? thread[thread.length-1]?.id : null;
    const params = { testo: txt, wa_id: tel };
    if (ctxItems && ctxItems.length > 0) params.items = JSON.stringify(ctxItems);
    if (ctxHora) params.hora = ctxHora;
    if (thread && thread.length > 0) params.thread = JSON.stringify(thread.map(m=>({txt:m.txt, bot:m.bot_risposta||""})));
    api.get("generaRispostaIA", params)
      .then(d => {
        clearTimeout(timer);
        const risposta = d.risposta || "";
        setRisposteCache(prev=>({...prev,[tel]:{testo:stripMd(risposta),generando:false}}));
        if (lastMsgId && risposta) {
          api.post({action:"aggiornaRispostaBot", id:lastMsgId, bot_risposta:risposta}).catch(()=>{});
        }
      })
      .catch(()=> { clearTimeout(timer); setRisposteCache(prev=>({...prev,[tel]:{testo:"",generando:false}})); });
  }, []);

  // Seleziona cliente — carica thread CONV, non rigenerare se risposta già in cache
  const handleSel = useCallback((tel, txt, ctxItems, ctxHora, thread) => {
    setSel(tel);
    // Carica thread completo da CONV sheet
    api.get("getConvThread", { wa_id: tel })
      .then(d => {
        if (d.chat && d.chat.length > 0) {
          setConvThreads(prev => ({...prev, [tel]: d.chat}));
        }
      })
      .catch(()=>{});
    // Se già in cache (es. da autoLoadedRef), non toccare — evita rigenerazione
    if (risposteCacheRef.current[tel]?.testo?.length > 10) return;
    // Se l'ultimo messaggio del thread ha già bot_risposta, usala direttamente
    const lastWithBot = thread && [...thread].reverse().find(m => m.bot_risposta && m.bot_risposta.length > 10);
    if (lastWithBot) {
      setRisposteCache(prev => ({...prev, [tel]: {testo: stripMd(lastWithBot.bot_risposta), generando: false}}));
      return;
    }
    // Nessuna risposta disponibile — genera e salva nel DB
    const lastMsgId = thread && thread.length > 0 ? thread[thread.length-1]?.id : null;
    setRisposteCache(prev => ({...prev, [tel]: {testo:"", generando:true}}));
    const params2 = { testo: txt, wa_id: tel };
    if (ctxItems && ctxItems.length > 0) params2.items = JSON.stringify(ctxItems);
    if (ctxHora) params2.hora = ctxHora;
    if (thread && thread.length > 0) params2.thread = JSON.stringify(thread.map(m=>({txt:m.txt, bot:m.bot_risposta||""})));
    api.get("generaRispostaIA", params2)
      .then(d => {
        const risposta = d.risposta || "";
        setRisposteCache(prev=>({...prev,[tel]:{testo:stripMd(risposta),generando:false}}));
        if (lastMsgId && risposta) {
          api.post({action:"aggiornaRispostaBot", id:lastMsgId, bot_risposta:risposta}).catch(()=>{});
        }
      })
      .catch(()=> setRisposteCache(prev=>({...prev,[tel]:{testo:"",generando:false}})));
  }, []);

  // Rigenera SOLO quando arriva un messaggio nuovo dal cliente (non da getConv o polling)
  useEffect(() => {
    if(!sel||!selMsg) return;
    const prev = prevLenRef.current[sel]||0;
    const curr = selThread.length;
    if(curr > prev && prev > 0) {
      // Non rigenerare se c'è già una risposta buona in cache
      const cached = risposteCacheRef.current[sel];
      if (!cached?.testo || cached.testo.length < 10) {
        generaRisposta(sel, selMsg.txt, selMsg.ia?.items||[], selMsg.ia?.hora||'', selThread);
      }
    }
    prevLenRef.current[sel] = curr;
  }, [selThread.length, sel, selMsg, generaRisposta]);

  const setTesto = useCallback((tel, t) =>
    setRisposteCache(prev=>({...prev,[tel]:{...(prev[tel]||{}),testo:t}}))
  , []);

  // Invia risposta → crea ordine in cucina → rimuovi da preguntas
  const handleEnviar = useCallback((tel) => {
    const cache = risposteCache[tel];
    if(!cache?.testo?.trim()||cache.generando) return;
    // 1. Invia messaggio WA
    onRispondi(tel, cache.testo.trim());
    // 2. Svuota campo risposta — conversazione continua
    setRisposteCache(prev=>({...prev,[tel]:{testo:"",generando:false}}));
  }, [risposteCache, onRispondi]);

  // Confirmar pedido: sposta da Preguntas a Pedidos cambiando stato→NUEVO + conf=100
  const handleConfermaOrdine = useCallback(async (tel, items, hora, nombre, direccion, tipoConsegna, zona_manuale) => {
    const telNorm = String(tel||"").replace("+","");
    try {
      // Cerca in TUTTI i messaggi (allMsgs include anche IN_TRATTAMENTO)
      const tuttiMsgs = (_allMsgs || msgs);
      const msgsDelTel = tuttiMsgs.filter(m => {
        const mTel = String(m.wa_id||m.tel||"").replace("+","");
        return mTel === telNorm && mTel !== "";
      }).sort((a,b) => Number(b.ts||0) - Number(a.ts||0));

      const testoBot = risposteCache[tel]?.testo?.trim() || msgsDelTel[0]?.bot_risposta || "";

      // Cambia stato→NUEVO + conf=100 su TUTTI i messaggi del tel → spariscono da Preguntas
      for (var i = 0; i < msgsDelTel.length; i++) {
        const m = msgsDelTel[i];
        if (m.stato === "IN_TRATTAMENTO") {
          await api.post({
            action: "updateWaStato",
            id: m.id,
            stato: "NUEVO",
            ia_conf: 100,
            bot_risposta: i === 0 ? testoBot : undefined
          });
        }
      }
      // Muovi a Pedidos per revisione operatore (gestito da onCreaOrdine)
      await onCreaOrdine(nombre, tel, items, hora, direccion, tipoConsegna, zona_manuale);
      // Aggiorna stato locale + switcha a Pedidos (senza aspettare il prossimo poll)
      const primoMsg = msgsDelTel.find(m => m.stato === "IN_TRATTAMENTO");
      if (primoMsg && onMoveToNuevo) await onMoveToNuevo(primoMsg.id, nombre, tel);
    } catch(e) {
      console.error("handleConfermaOrdine error:", e);
    }
    setRisposteCache(prev=>({...prev,[tel]:{testo:"",generando:false}}));
    setEditZonaMap(prev=>{ const n={...prev}; delete n[tel]; return n; });
    setSel(null);
  }, [onCreaOrdine, msgs, _allMsgs, risposteCache, onMoveToNuevo]);

  // Determina se una conversazione è "in attesa" (operatore ha già risposto)
  // Combina waitingTels (sessione) + convThreads (persistente, caricato all'apertura)
  const isWaiting = useCallback((tel) => {
    if (waitingTels.has(tel)) return true;
    const thread = convThreads[tel];
    if (thread && thread.length > 0) {
      const lastOpOrClient = [...thread].reverse().find(m => m.da === "operatore" || m.da === "cliente");
      if (lastOpOrClient?.da !== "operatore") return false;
      // Se è arrivato un nuovo messaggio dal cliente DOPO l'ultima risposta operatore → riattiva
      const lastOpTs = Number(lastOpOrClient.ts || 0);
      const hasMsgNewer = msgs.some(m => {
        const mTel = String(m.wa_id||m.tel||"").replace("+","");
        return mTel === tel && Number(m.ts||0) > lastOpTs;
      });
      if (hasMsgNewer) return false;
      return true;
    }
    return false;
  }, [waitingTels, convThreads, msgs]);

  // Messaggi nuovi (non risposti) in cima — risposti in fondo
  const sortedMsgs = useMemo(() => {
    return [...clientiConversazioni].sort((a, b) => {
      const aW = isWaiting(a.key) ? 1 : 0;
      const bW = isWaiting(b.key) ? 1 : 0;
      if (aW !== bW) return aW - bW;
      return Number(b.ultimo?.ts||0) - Number(a.ultimo?.ts||0);
    });
  }, [clientiConversazioni, isWaiting]);

  // ── Lista ──────────────────────────────────────────────
  const listaEl = (
    <div style={{
      ...(isTablet ? {width:340,borderRight:`1px solid rgba(255,255,255,0.07)`,flexShrink:0} : {flex:1}),
      display:"flex",flexDirection:"column",overflow:"hidden"
    }}>
      {/* Header lista */}
      <div style={{padding:"14px 16px 8px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <div style={{width:8,height:8,borderRadius:"50%",background:C.viola,
          boxShadow:`0 0 9px ${C.viola}cc`,flexShrink:0}}/>
        <span style={{fontWeight:800,fontSize:16,color:C.bianco,letterSpacing:.2}}>Preguntas</span>
        <Badge n={msgs.filter(m=>!m.leido).length} c={C.viola}/>
      </div>
      <div style={{flex:1,overflowY:"auto",paddingBottom:20}}>
        {msgs.length === 0 && (
          <div style={{textAlign:"center",padding:"60px 0 40px",color:C.grigio}}>
            <div style={{fontSize:40,marginBottom:12}}>💭</div>
            <div style={{fontSize:14,fontWeight:600}}>Sin preguntas activas</div>
            <div style={{fontSize:12,marginTop:4,color:"#444"}}>Los mensajes no identificados como pedidos aparecen aquí</div>
          </div>
        )}
        {sortedMsgs.map(conv => {
          const m   = conv.ultimo;
          const tel = conv.key;
          return (
            <div key={tel} onClick={()=>{
              const threadForSel = (_allMsgs||[]).filter(am=>String(am.wa_id||am.tel||am.nombre||"").replace("+","")===tel).sort((a,b)=>Number(a.ts||0)-Number(b.ts||0));
              const lastMsg = threadForSel[threadForSel.length-1]||m;
              handleSel(tel, lastMsg.txt, lastMsg.ia?.items||[], lastMsg.ia?.hora||"", threadForSel);
            }} style={{position:"relative"}}>
              <PreguntaCard m={m} sel={sel===tel?m.id:null}
                onSel={()=>{}} cache={risposteCache[tel]} ordenes={ordenes} tick={tick} primoTs={conv.primoTs}
                waiting={isWaiting(tel)}/>
              {conv.msgs.length > 1 && (
                <div style={{position:"absolute",top:12,right:14,
                  background:C.viola,color:"#fff",borderRadius:20,
                  padding:"2px 8px",fontSize:10,fontWeight:800}}>
                  {conv.msgs.length} msgs
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Dettaglio ──────────────────────────────────────────
  const detalleEl = selMsg ? (() => {
    const msg   = selMsg;
    const cache = risposteCache[sel] || {testo:"", generando:false};
    return (
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
        {/* Header */}
        <div style={{
          padding:"14px 18px",
          borderBottom:`1px solid rgba(255,255,255,0.07)`,
          display:"flex",alignItems:"center",gap:14,
          background:"rgba(255,255,255,0.04)",
          backdropFilter:"blur(20px)",
          WebkitBackdropFilter:"blur(20px)",
          flexShrink:0
        }}>
          {!isTablet && (
            <button onClick={()=>setSel(null)} style={{background:"none",border:"none",
              color:C.grigio,fontSize:24,padding:0,lineHeight:1,flexShrink:0}}>←</button>
          )}
          {/* Avatar grande */}
          <div style={{width:50,height:50,borderRadius:"50%",flexShrink:0,
            background:`linear-gradient(135deg,${C.viola}30,${C.viola}55)`,
            border:`2.5px solid ${C.viola}66`,
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:`0 0 18px ${C.viola}44`}}>
            <span style={{color:C.viola,fontWeight:900,fontSize:18}}>
              {msg.nombre.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
            </span>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{color:"#EFEFEF",fontWeight:800,fontSize:17,lineHeight:1,
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{msg.nombre}</div>
            <div style={{color:C.grigio,fontSize:13,marginTop:3}}>{msg.tel} · {msg.ago}</div>
          </div>
          {isTablet && (
            <button onClick={()=>setSel(null)} style={{background:"rgba(255,255,255,0.06)",
              border:"1px solid rgba(255,255,255,0.1)",color:C.grigio,borderRadius:10,
              width:34,height:34,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          )}
        </div>

        {/* Corpo scrollabile */}
        <div ref={threadScrollRef} style={{flex:1,overflowY:"auto",padding:"18px 18px 0"}}>
          {/* Thread completo — tutti i messaggi */}
          {selThread.map((tmsg, ti) => {
            const botMsg = tmsg.bot_risposta ? String(tmsg.bot_risposta).trim() : null;
            const opMsg  = tmsg.op_risposta  ? String(tmsg.op_risposta).trim()  : null;
            return (
            <div key={tmsg.id} style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8}}>
              {/* Bolla cliente */}
              {(!tmsg._botOnly && tmsg.txt) && (
              <div style={{
                background:`rgba(168,85,247,${tmsg.id===msg.id?".15":".08"})`,
                backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",
                borderRadius:"6px 18px 18px 18px",padding:"12px 16px",
                maxWidth:"88%",
                border:`1.5px solid rgba(168,85,247,${tmsg.id===msg.id?".5":".2"})`,
              }}>
                <div style={{color:C.viola,fontSize:11,fontWeight:800,marginBottom:4}}>
                  {tmsg.nombre} · {tmsg.ago}
                </div>
                <div style={{color:"#EFEFEF",fontSize:15,lineHeight:1.6}}>{tmsg.txt}</div>
                {(tmsg.ia?.items||[]).filter(it=>it.sub).map((it,ii)=>(
                  <div key={ii} style={{display:"inline-block",background:"#CC2200",color:"#fff",
                    borderRadius:8,padding:"2px 8px",marginTop:6,marginRight:4,
                    fontSize:12,fontWeight:700}}>
                    ⚠ {it.n}: {it.sub}
                  </div>
                ))}
              </div>
              )}
              {/* Bolla operatore — risposta manuale inviata */}
              {opMsg && (
              <div style={{alignSelf:"flex-end",maxWidth:"88%"}}>
                <div style={{background:"rgba(59,130,246,0.15)",borderRadius:"18px 6px 18px 18px",
                  padding:"10px 14px",border:"1px solid rgba(59,130,246,0.35)"}}>
                  <div style={{color:"rgba(96,165,250,0.8)",fontSize:10,fontWeight:700,marginBottom:3}}>
                    Operador ✓✓
                  </div>
                  <div style={{color:"#EFEFEF",fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{stripMd(opMsg)}</div>
                </div>
              </div>
              )}
              {/* Bolla bot automatica — solo se presente e distinta */}
              {botMsg && (
              <div style={{alignSelf:"flex-end",maxWidth:"88%"}}>
                <div style={{background:"rgba(0,92,75,0.4)",borderRadius:"18px 6px 18px 18px",
                  padding:"10px 14px",border:"1px solid rgba(255,255,255,0.08)"}}>
                  <div style={{color:"rgba(255,255,255,0.45)",fontSize:10,fontWeight:600,marginBottom:2}}>
                    La 10 Bot
                  </div>
                  <div style={{color:"#fff",fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{stripMd(botMsg)}</div>
                </div>
              </div>
              )}
            </div>
            );
          })}

          {/* CARD ADICION */}
          {(()=>{
            const adicion = parseAdicion(msg);
            if (!adicion) return null;
            const isListo = adicion.orden_estado === "LISTO";
            const confirmado = adicion.confirmado_cliente;
            const itemsNuevos = adicion.items_nuevos || [];
            // FIX UI-3: per ADICION_NUEVO recupera items completi dal msg originale aggiornato
            let itemsCompletos = adicion.items_completos || [];
            if (adicion.tipo === "ADICION_NUEVO" && adicion.orden_ref) {
              const msgOriginale = _allMsgs.find(m => m.id === adicion.orden_ref);
              if (msgOriginale?.ia?.items?.length) {
                itemsCompletos = msgOriginale.ia.items;
              }
            }
            // Totale visualizzato per il messaggio di adición — items netti, niente delivery aggiunto qui
            // (è una vista intermedia che mostra cosa viene aggiunto, non il totale ordine).
            const cleanItems = itemsCompletos.filter(i => i.n !== "Entrega a domicilio");
            const total = cleanItems.reduce((s,i)=>s+(parseFloat(i.p||0))*(parseInt(i.q)||1),0);
            return (
              <div style={{
                background: isListo?"rgba(249,115,22,0.12)":"rgba(34,197,94,0.10)",
                border:`2px solid ${isListo?C.orange:C.verde}`,
                borderRadius:16,padding:"14px 16px",marginBottom:12,
              }}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <span style={{fontSize:18}}>➕</span>
                  <span style={{color:isListo?C.orange:C.verde,fontWeight:800,fontSize:14}}>
                    ADICIÓN AL PEDIDO #{adicion.orden_ref}
                  </span>
                  {isListo&&<span style={{background:C.orange+"33",color:C.orange,
                    border:`1px solid ${C.orange}66`,borderRadius:20,padding:"2px 8px",
                    fontSize:10,fontWeight:700}}>⚠️ YA LISTO</span>}
                  <span style={{marginLeft:"auto",background:confirmado?`${C.verde}22`:"rgba(255,255,255,0.06)",
                    color:confirmado?C.verde:"#888",border:`1px solid ${confirmado?C.verde+"44":"rgba(255,255,255,0.1)"}`,
                    borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700}}>
                    {confirmado?"✅ Cliente confirmó":"⏳ Esperando cliente"}
                  </span>
                </div>
                <div style={{marginBottom:8}}>
                  <div style={{color:"#888",fontSize:11,fontWeight:700,marginBottom:4}}>AÑADIR:</div>
                  {itemsNuevos.map((it,i)=>(
                    <div key={i} style={{color:"#EFEFEF",fontSize:13,display:"flex",gap:6,marginBottom:2}}>
                      <span>{it.e||"🍕"}</span>
                      <span style={{fontWeight:600}}>{it.q}x {it.n}</span>
                      <span style={{color:"#888",marginLeft:"auto"}}>{((it.p||0)*(it.q||1)).toFixed(2)}€</span>
                    </div>
                  ))}
                </div>
                <div style={{borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:8}}>
                  <div style={{color:"#888",fontSize:11,fontWeight:700,marginBottom:4}}>PEDIDO COMPLETO:</div>
                  {itemsCompletos.map((it,i)=>(
                    <div key={i} style={{color:"#ccc",fontSize:12,display:"flex",gap:6,marginBottom:2}}>
                      <span>{it.e||"🍕"}</span><span>{it.q}x {it.n}</span>
                      <span style={{color:"#888",marginLeft:"auto"}}>{((it.p||0)*(it.q||1)).toFixed(2)}€</span>
                    </div>
                  ))}
                  <div style={{color:isListo?C.orange:C.verde,fontWeight:800,fontSize:14,
                    marginTop:6,display:"flex",justifyContent:"space-between"}}>
                    <span>💰 Total</span><span>{Number(total).toFixed(2)}€</span>
                  </div>
                </div>
              </div>
            );
          })()}

          <div style={{marginBottom:8}}/>

          {/* Area risposta AI — solo per msg NON ADICION */}
          {!parseAdicion(msg) && <div style={{
            background:"rgba(107,46,193,0.10)",
            backdropFilter:"blur(24px)",
            WebkitBackdropFilter:"blur(24px)",
            border:`1.5px solid ${cache.testo?"rgba(147,51,234,0.6)":"rgba(107,46,193,0.28)"}`,
            borderRadius:18,padding:"14px 16px",marginBottom:16,
            boxShadow:`0 4px 20px rgba(107,46,193,0.12), inset 0 1px 0 rgba(255,255,255,0.08)`,
            position:"relative",overflow:"hidden"
          }}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:"45%",
              background:"linear-gradient(180deg,rgba(255,255,255,0.05) 0%,transparent 100%)",
              pointerEvents:"none"}}/>
            <div style={{color:C.viola,fontSize:12,fontWeight:800,marginBottom:10,
              display:"flex",alignItems:"center",gap:8,position:"relative"}}>
              <span style={{fontSize:14}}>⚡</span>
              <span style={{letterSpacing:.3}}>Respuesta sugerida por IA</span>
              {/* ✋ Manual — svuota testo IA e apre tastiera */}
              <button onClick={()=>{
                setTesto(msg.tel||msg.nombre, "");
                setTimeout(()=>{ if(textareaRef.current) textareaRef.current.focus(); }, 50);
              }} style={{marginLeft:"auto",background:"rgba(168,85,247,0.12)",
                border:`1px solid ${C.viola}33`,borderRadius:20,padding:"2px 8px",
                fontSize:10,fontWeight:700,color:C.viola,cursor:"pointer"}}>✋ Manual</button>
              <button onClick={()=>generaRisposta(msg.tel||msg.nombre, selMsg?.txt||msg.txt, selMsg?.ia?.items||[], selMsg?.ia?.hora||'', selThread)}
                style={{background:"transparent",border:`1px solid ${C.viola}44`,
                  color:C.viola,borderRadius:20,padding:"2px 8px",fontSize:10,
                  fontWeight:700,cursor:"pointer"}}>⚡ Regenerar</button>
              {risposteCache[msg.tel||msg.nombre]?.generando && (
                <span style={{color:"#888",fontWeight:500,fontSize:11,
                  animation:"pulse 1s infinite"}}>generando...</span>
              )}
              {!risposteCache[msg.tel||msg.nombre]?.generando && risposteCache[msg.tel||msg.nombre]?.testo && (
                <span style={{
                  background:`${C.verde}22`,color:C.verde,
                  border:`1px solid ${C.verde}44`,
                  borderRadius:20,padding:"2px 8px",
                  fontSize:10,fontWeight:700
                }}>✓ lista</span>
              )}
            </div>
            <textarea
              ref={textareaRef}
              value={risposteCache[msg.tel||msg.nombre]?.testo||""}
              onChange={e=>setTesto(msg.tel||msg.nombre, e.target.value)}
              placeholder={risposteCache[msg.tel||msg.nombre]?.generando ? "IA escribiendo..." : "Escribe o edita la respuesta..."}
              rows={isTablet ? 5 : 4}
              style={{
                width:"100%",background:"transparent",border:"none",
                color:"#EFEFEF",fontSize:15,lineHeight:1.65,
                resize:"none",outline:"none",
                fontFamily:"'Satoshi',-apple-system,sans-serif",
                cursor:cache.generando?"default":"text",
                position:"relative"
              }}
              disabled={risposteCache[msg.tel||msg.nombre]?.generando||false}
            />
          </div>}
        </div>

        {/* Footer azioni */}
        <div style={{
          padding:"14px 18px 20px",
          borderTop:`1px solid rgba(255,255,255,0.07)`,
          background:"rgba(255,255,255,0.03)",
          backdropFilter:"blur(20px)",
          WebkitBackdropFilter:"blur(20px)",
          display:"flex",flexDirection:"column",gap:10,flexShrink:0
        }}>
          {(()=>{
            const adicion = parseAdicion(msg);
            if (adicion) {
              // Usa lo stato ATTUALE dell'ordine
              const ordenActual = ordenes?.find(o => o.id === adicion.orden_ref);
              const estadoActual = ordenActual?.estado || adicion.orden_estado;
              const isListo = estadoActual === "LISTO";
              const confirmado = adicion.confirmado_cliente;
              return (<>
                {isListo && (
                  <div style={{background:"rgba(249,115,22,0.12)",border:`1px solid ${C.orange}66`,
                    borderRadius:10,padding:"8px 12px",fontSize:12,color:C.orange,fontWeight:700,
                    display:"flex",alignItems:"center",gap:6}}>
                    ⚠️ El pedido ya estaba LISTO — avisa al cliente
                  </div>
                )}
                <button
                  onClick={()=>{ onAddicion(msg.id, adicion.orden_ref, adicion.items_nuevos||[], estadoActual); }}
                  style={{
                    background: confirmado ? `linear-gradient(135deg,${C.verde},#16a34a)` : `linear-gradient(135deg,rgba(34,197,94,0.35),rgba(22,163,74,0.35))`,
                    border:`2px solid ${C.verde}`,color:"#fff",borderRadius:14,
                    padding:"16px 0",fontWeight:900,fontSize:15,width:"100%",
                    boxShadow:`0 6px 24px ${C.verde}${confirmado?"55":"22"}`,
                    display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                    cursor:"pointer",transition:"all .2s",
                    animation: confirmado ? "livePulse 2s infinite" : "none"
                  }}>
                  <span style={{fontSize:18}}>✅</span>
                  <span>{confirmado ? "CONFIRMAR ADICIÓN" : "Añadir sin confirmación cliente"}</span>
                </button>
                <button onClick={()=>{ onElimina(msg.id, msg.wa_id||msg.tel); setSel(null); }}
                  style={{background:"transparent",border:"none",color:"#333",
                    fontSize:12,padding:"4px 0",cursor:"pointer",textAlign:"center"}}>
                  🗑 Ignorar adición
                </button>
              </>);
            }
            return (<>
              {(()=>{
                const tel = msg.tel||msg.nombre;
                const cache = risposteCache[tel];
                const testo = cache?.testo?.trim();
                const generando = cache?.generando;
                const hasText = testo && testo.length > 0 && !generando;

                // Usa SOLO l'ultimo messaggio attivo — il totale è aggiornato nell'ultimo msg
                const activeMsgs = [...selThread].filter(tm =>
                  !tm._botOnly && tm.stato !== "COMPLETATO" && tm.stato !== "COCINA"
                );
                const lastActiveMsg = activeMsgs[activeMsgs.length - 1] || null;
                // FIX: se selThread non ha ia.items (filtro 3s da conv.chat), fallback su waMsgsThread
                const lastWaActive = [...waMsgsThread]
                  .filter(wm => wm.stato !== "COMPLETATO" && wm.stato !== "COCINA")
                  .pop();
                const iaItems = (lastActiveMsg?.ia?.items || []).length > 0
                  ? (lastActiveMsg?.ia?.items || []).map(it => ({...it}))
                  : (lastWaActive?.ia?.items || []).map(it => ({...it}));
                const horaMsg = activeMsgs.slice().reverse().find(tm=>tm.ia?.hora&&tm.ia.hora.length>0);
                const hora = horaMsg?.ia?.hora || lastWaActive?.ia?.hora || "";

                const direccionIa = activeMsgs.slice().reverse().find(tm=>tm.ia?.direccion)?.ia?.direccion
                  || lastWaActive?.ia?.direccion || "";
                const direccion = editDireccionMap[tel] !== undefined ? editDireccionMap[tel] : direccionIa;
                const tipoConsegna = (activeMsgs.slice().reverse().find(tm=>tm.ia?.tipo_consegna)?.ia?.tipo_consegna
                  || lastWaActive?.ia?.tipo_consegna || "RITIRO").toUpperCase();

                // Ordine già in cucina (non modificabile via confirm normale)
                const ordenEnCucina = ordenes?.find(o => {
                  const oTel = String(o.tel||o.wa_id||"").replace("+","");
                  const mTel = String(tel||"").replace("+","");
                  return oTel === mTel && (o.estado==="EN_COCINA"||o.estado==="LISTO");
                });
                // Ordine pre-creato dall'Agente, aspetta conferma operatore
                const ordenDaConfermare = ordenes?.find(o => {
                  const oTel = String(o.tel||o.wa_id||"").replace("+","");
                  const mTel = String(tel||"").replace("+","");
                  return oTel === mTel && o.estado==="POR_CONFIRMAR";
                });

                // modifica_complessa: segnali di sostituzione nel testo del cliente
                const subSignals = /\ben vez de\b|\ben lugar de\b|\bcambiar? por\b|\bquitar\b|\bcambia la\b|\bno quiero la\b|\bno me pongas\b|\bquitame\b|\belimina\b/i;
                const isModificaComplessa = ordenEnCucina && subSignals.test(selMsg?.txt || "");
                const editItems = editItemsMap[tel] ?? iaItems;
                const allItems = editItems;
                const hasItems = allItems.length > 0;

                const canConfirm = hasText || (hasItems && !ordenEnCucina);
                const clienteNombre = msg.nombre.split(" ")[0];
                // Totale visualizzato nel form di conferma: items + delivery_fee
                const cleanAllItems = allItems.filter(it => it.n !== "Entrega a domicilio");
                const sumIt = cleanAllItems.reduce((s,it)=>s+(Number(it.p)||0)*(Number(it.q)||1),0);
                const tot = sumIt + (tipoConsegna === "DOMICILIO" ? DELIVERY_FEE : 0);

                return (
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>

                    {(hasItems && ordenEnCucina) || isModificaComplessa ? (
                      /* ── ORDINE IN CUCINA: aggiunta o sostituzione ── */
                      <>
                        <button
                          onClick={async ()=>{
                            const testoInvio = testo || "";
                            if (isModificaComplessa) {
                              // Sostituzione: il testo è lo scontrino → parse → aggiorna Pedidos
                              if(testoInvio) onRispondi(tel, testoInvio);
                              if (msg.id) {
                                api.post({action:"aggiornaRispostaBot",id:msg.id,bot_risposta:testoInvio})
                                  .catch(e => console.warn("[TabPreguntas confirm-mod] aggiornaRispostaBot fallito:", e?.message || e));
                                api.post({action:"updateWaStato",id:msg.id,stato:"COMPLETATO"})
                                  .catch(e => console.warn("[TabPreguntas confirm-mod] updateWaStato COMPLETATO fallito:", e?.message || e));
                              }
                              if (testoInvio && ordenEnCucina?.id) {
                                api.post({action:"parseOrdineDaRisposta", testo:testoInvio, ordenId:ordenEnCucina.id})
                                  .catch(e => console.warn("[TabPreguntas confirm-mod] parseOrdineDaRisposta fallito:", e?.message || e));
                              }
                            } else {
                              // Aggiunta normale: aggiunge items al pedido
                              onAddicion(msg.id, ordenEnCucina.id, allItems, ordenEnCucina.estado, false);
                            }
                            setRisposteCache(prev=>({...prev,[tel]:{testo:"",generando:false}}));
                            setSel(null);
                          }}
                          style={{background:`linear-gradient(135deg,${C.orange},#f59e0b)`,
                            border:`2px solid ${C.orange}`,color:"#fff",
                            borderRadius:14,padding:"18px 0",fontWeight:900,fontSize:16,width:"100%",
                            boxShadow:`0 6px 28px ${C.orange}66`,
                            display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                            cursor:"pointer",transition:"all .2s",letterSpacing:-.2}}>
                          <span style={{fontSize:20}}>✅</span>
                          <span>{isModificaComplessa
                            ? `Confirmar + avisar ${clienteNombre}`
                            : `Confirmar — añadir ${allItems.length} producto${allItems.length!==1?"s":""} + avisar ${clienteNombre}`}
                          </span>
                        </button>
                        <button onClick={async ()=>{
                            const testoInvio = testo || "";
                            if(testoInvio) onRispondi(tel, testoInvio);
                            if (msg.id) {
                              api.post({action:"aggiornaRispostaBot",id:msg.id,bot_risposta:testoInvio})
                                .catch(e => console.warn("[TabPreguntas solo-responder] aggiornaRispostaBot fallito:", e?.message || e));
                              api.post({action:"updateWaStato",id:msg.id,stato:"COMPLETATO"})
                                .catch(e => console.warn("[TabPreguntas solo-responder] updateWaStato COMPLETATO fallito:", e?.message || e));
                            }
                            setRisposteCache(prev=>({...prev,[tel]:{testo:"",generando:false}}));
                            setSel(null);
                          }}
                          style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.13)",
                            color:"#C0C0C0",fontSize:13,fontWeight:600,
                            borderRadius:10,padding:"10px 0",cursor:"pointer",textAlign:"center",width:"100%"}}>
                          📤 Solo responder sin modificar pedido
                        </button>
                      </>
                    ) : (
                      /* ── CASO NORMAL: confirmar pedido nuevo o responder ── */
                      <>
                      {/* ── Riepilogo ordine (solo quando ci sono items) ── */}
                      {hasItems && (
                        <div style={{
                          background:"rgba(255,255,255,0.04)",
                          border:"1px solid rgba(255,255,255,0.1)",
                          borderRadius:12,padding:"12px 14px",marginBottom:2,
                          display:"flex",flexDirection:"column",gap:7
                        }}>
                          {/* Header tipo + ora + totale */}
                          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <span style={{
                              background: tipoConsegna==="DOMICILIO"?"rgba(249,115,22,0.18)":"rgba(34,197,94,0.14)",
                              color: tipoConsegna==="DOMICILIO"?C.orange:C.verde,
                              border:`1px solid ${tipoConsegna==="DOMICILIO"?C.orange+"44":C.verde+"44"}`,
                              borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:800
                            }}>
                              {tipoConsegna==="DOMICILIO"?"🛵 DOMICILIO":"🏪 RITIRO"}
                            </span>
                            {hora && <span style={{color:"#888",fontSize:12}}>🕐 {hora}</span>}
                            <span style={{marginLeft:"auto",color:C.verde,fontWeight:800,fontSize:14}}>
                              {tot.toFixed(2)}€
                            </span>
                          </div>
                          {/* Lista items */}
                          {allItems.map((it,i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:13}}>
                              <span>{it.e||"🍕"}</span>
                              <span style={{color:"#EFEFEF",fontWeight:600}}>{it.q}x {it.n}</span>
                              {it.sub && <span style={{color:"#ef4444",fontSize:11,fontWeight:700,flex:1}}>⚠ {it.sub}</span>}
                              <span style={{color:"#888",marginLeft:"auto"}}>{((it.p||0)*(it.q||1)).toFixed(2)}€</span>
                            </div>
                          ))}
                          {/* Direccion — solo DOMICILIO */}
                          {tipoConsegna==="DOMICILIO" && (
                            <div style={{marginTop:2}}>
                              <div style={{color:"#888",fontSize:10,fontWeight:700,marginBottom:4,letterSpacing:.3}}>DIRECCIÓN</div>
                              <input
                                value={direccion}
                                onChange={e=>setEditDireccionMap(prev=>({...prev,[tel]:e.target.value}))}
                                placeholder="Dirección de entrega..."
                                style={{
                                  width:"100%",background:"rgba(255,255,255,0.07)",
                                  border:`1px solid ${direccion?"rgba(249,115,22,0.45)":"rgba(255,255,255,0.18)"}`,
                                  borderRadius:8,padding:"8px 10px",
                                  color:"#EFEFEF",fontSize:13,outline:"none",
                                  fontFamily:"inherit",boxSizing:"border-box"
                                }}
                              />
                              {/* Chip zona manuale — operatore assegna la zona quando il geocoding fallisce */}
                              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>
                                {ZONE_DELIVERY.map(z => {
                                  const sel = editZonaMap[tel] === z.id;
                                  return (
                                    <button
                                      key={z.id}
                                      onClick={()=>setEditZonaMap(prev=>({...prev,[tel]: sel ? null : z.id}))}
                                      style={{
                                        background: sel ? z.colore : "rgba(255,255,255,0.06)",
                                        border:`1.5px solid ${z.colore}`,
                                        borderRadius:20,padding:"3px 10px",
                                        color: sel ? "#fff" : z.colore,
                                        fontSize:11,fontWeight:700,cursor:"pointer",
                                        transition:"all .15s",opacity: sel ? 1 : 0.7,
                                        letterSpacing:.3
                                      }}
                                    >{z.nomeBreve}</button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {(() => { const cBusy = confirmingTels.has(tel); const cEnabled = canConfirm && !cBusy; return (
                      <button
                        onClick={async ()=>{
                          if(!canConfirm) return;
                          if (confirmingTels.has(tel)) return;
                          setConfirmingTels(prev => { const n = new Set(prev); n.add(tel); return n; });
                          try {
                          const testoInvio = testo || "";
                          if(testoInvio) onRispondi(tel, testoInvio);
                          setConvThreads(prev=>{
                            const existing = prev[tel]||[];
                            const last = existing[existing.length-1];
                            if (last?.da==="operatore"&&last?.txt===testoInvio) return prev; // evita duplicati
                            return {...prev,[tel]:[...existing,{da:"operatore",txt:testoInvio,ts:Date.now()}]};
                          });
                          // msg.id può essere sintetico (conv_X_ts) — usa sempre l'ID reale da waMsgsThread
                          const realWaMsg = [...waMsgsThread].filter(m => m.stato === "IN_TRATTAMENTO").pop()
                            || waMsgsThread[waMsgsThread.length - 1];
                          const realMsgId = (realWaMsg && !String(realWaMsg.id||"").startsWith("conv_")) ? realWaMsg.id : msg.id;
                          if (realMsgId) {
                            api.post({ action:"aggiornaRispostaBot", id:realMsgId, bot_risposta:testoInvio }).catch(()=>{});
                          }
                          if (ordenDaConfermare && hasItems) {
                            await onConfirmaDaConfermare(msg.nombre, tel, ordenDaConfermare, allItems, realMsgId);
                          } else if (!ordenDaConfermare && hasItems) {
                            await handleConfermaOrdine(tel, allItems, hora, msg.nombre, direccion, tipoConsegna, editZonaMap[tel] || null);
                          } else {
                            // Solo risposta — chiudi il dettaglio, la card rimane in lista come "in attesa"
                            const telNorm = String(tel||"").replace("+","");
                            waitingSentAtRef.current[telNorm] = Date.now();
                            setWaitingTels(prev => new Set([...prev, telNorm]));
                            setSel(null);
                          }
                          setRisposteCache(prev=>({...prev,[tel]:{testo:"",generando:false}}));
                          } finally {
                            setConfirmingTels(prev => { const n = new Set(prev); n.delete(tel); return n; });
                          }
                        }}
                        disabled={!cEnabled}
                        style={{
                          background: cEnabled ? `linear-gradient(135deg,${C.wa},#1aab52)` : "rgba(255,255,255,0.05)",
                          border:`2px solid ${cEnabled ? C.wa : "rgba(255,255,255,0.1)"}`,
                          color: cEnabled?"#fff":"#444",
                          borderRadius:14,padding:"16px 0",fontWeight:900,fontSize:15,width:"100%",
                          boxShadow: cEnabled?`0 6px 24px ${C.wa}55`:"none",
                          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                          cursor: cBusy ? "wait" : (cEnabled?"pointer":"not-allowed"),
                          opacity: cBusy ? 0.7 : 1,
                          transition:"all .2s",
                          animation: cEnabled?"livePulse 2.5s infinite":"none"
                        }}>
                        <span style={{fontSize:18}}>{cBusy ? "⏳" : "📤"}</span>
                        <span>{cBusy ? "Enviando…" : (ordenDaConfermare && hasItems ? `Añadir al pedido · Avisar cliente` : hasItems ? `Enviar al cliente · Confirmar pedido` : "Enviar al cliente")}</span>
                      </button>
                      ); })()}
                      {/* Bottone secondario: solo per risposta senza ordine → apre in Pedidos per creare manualmente */}
                      {!hasItems && !ordenDaConfermare && (
                        <button
                          onClick={async ()=>{
                            if(!canConfirm) return;
                            const testoInvio = testo || "";
                            if(testoInvio) onRispondi(tel, testoInvio);
                            if (msg.id) api.post({action:"aggiornaRispostaBot",id:msg.id,bot_risposta:testoInvio}).catch(()=>{});
                            if (onMoveToNuevo) await onMoveToNuevo(msg.id, msg.nombre, tel);
                            setRisposteCache(prev=>({...prev,[tel]:{testo:"",generando:false}}));
                            setSel(null);
                          }}
                          disabled={!canConfirm}
                          style={{
                            background: canConfirm ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.03)",
                            border:`1px solid ${canConfirm ? "#3b82f6" : "rgba(255,255,255,0.08)"}`,
                            color: canConfirm ? "#60a5fa" : "#444",
                            borderRadius:10, padding:"10px 0", fontWeight:700, fontSize:13, width:"100%",
                            cursor: canConfirm ? "pointer" : "not-allowed", textAlign:"center"
                          }}>
                          🛒 Enviar + abrir pedido en Pedidos
                        </button>
                      )}
                      </>
                    )}

                  </div>
                );
              })()}
              <button onClick={()=>{ onElimina(msg.id, msg.wa_id||msg.tel||msg.nombre); setSel(null); }}
                style={{background:"transparent",border:"none",color:"#666",
                  fontSize:12,fontWeight:500,padding:"6px 0",cursor:"pointer",textAlign:"center",
                  textDecoration:"underline",textUnderlineOffset:3,width:"100%"}}>
                🗑 Eliminar conversación
              </button>
            </>);
          })()}
        </div>
      </div>
    );
  })() : null;

  // ── Mobile ─────────────────────────────────────────────
  if(!isTablet) {
    if(sel && selMsg) return (
      <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
        {detalleEl}
      </div>
    );
    return (
      <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
        {listaEl}
      </div>
    );
  }

  // ── Tablet: split view ─────────────────────────────────
  return (
    <div style={{display:"flex",height:"100%",overflow:"hidden"}}>
      {listaEl}
      {detalleEl ||
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
          flexDirection:"column",gap:14,color:"#2A2A2A"}}>
          <div style={{fontSize:48,opacity:.3}}>💭</div>
          <div style={{fontSize:14,fontWeight:600,color:"#333"}}>Selecciona una conversación</div>
        </div>
      }
    </div>
  );
};


// ─── TAB WA — con sub-tab ORDENES / PREGUNTAS ─────────────────

export default TabPreguntas;
