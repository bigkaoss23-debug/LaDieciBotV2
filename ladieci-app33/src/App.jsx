import { useState, useEffect, useRef, useCallback, useMemo } from "react";

import Suoni from './sounds';
import { C, G, ORDENES_INIT, WA_INIT, blockedTels } from './constants';
import { sb, api, auth, SUPABASE_URL, SUPABASE_KEY } from './api';

import Splash from './components/Splash';
import Home from './components/Home';
import EconBotPage from './components/EconBotPage';

import ServicioPage from './components/ServicioPage';
import EconomiaPage from './components/EconomiaPage';
import RepartidorPage from './components/repartidor/RepartidorPage';
import { DevHeartbeatSender } from './components/DevPresence';

export default function App() {
  // ─── Deep link via URL path (affidabile su tutti i device/iOS/Safari) ──────
  // Link: /repartidor | /servizio | /econbot
  // Netlify _redirects: /* /index.html 200  →  pathname rimane intatto
  const [screen,setScreen] = useState(() => {
    const path = window.location.pathname.replace(/^\//, '').toLowerCase();
    if (path === 'repartidor') return 'repartidor';
    return 'splash'; // tutti gli altri path (inclusi /servizio e /econbot) vedono la splash
  });
  // true se la sessione è iniziata sul link /repartidor — il back button non deve mai
  // mostrare la Home (il delivery non ha accesso al pannello operatore)
  const startedAtRepartidor = useRef(
    window.location.pathname.replace(/^\//, '').toLowerCase() === 'repartidor'
  );
  // statiProtetti e pendingWrites rimossi — non più necessari

  // ─── PIN gate — protegge Servicio / Economía / Bot IA ──────────────────
  // Autenticazione SERVER-SIDE: il PIN viene validato da Netlify Function
  // che ritorna un JWT. Il token è in sessionStorage (per-tab).
  const [pinUnlocked, setPinUnlocked] = useState(() => auth.isAuthenticated());
  const [showPin,      setShowPin]      = useState(false);
  const [pinInput,     setPinInput]     = useState("");
  const [pinError,     setPinError]     = useState(false);
  const [pinLoading,   setPinLoading]   = useState(false);
  const [pendingAction,setPendingAction] = useState(null);

  // Deep link: azione da eseguire DOPO la splash (PIN o navigazione diretta)
  const postSplashAction = useRef(() => setScreen("home"));
  useEffect(() => {
    const path = window.location.pathname.replace(/^\//, '').toLowerCase();
    if (!path || path === 'repartidor') return;
    const dest  = path === 'servizio' ? 'servicio' : 'econbot';
    const go    = () => setScreen(dest);
    if (auth.isAuthenticated()) {
      postSplashAction.current = go;
    } else {
      postSplashAction.current = () => {
        setPendingAction(() => go);
        setPinInput(""); setPinError(false);
        setShowPin(true);
      };
    }
  }, []);

  const withPin = (action) => {
    if (pinUnlocked && auth.isAuthenticated()) { action(); return; }
    setPendingAction(() => action);
    setPinInput(""); setPinError(false);
    setShowPin(true);
  };

  const handlePinKey = (k) => {
    if (pinLoading) return;
    if (k === "DEL") { setPinInput(p => p.slice(0,-1)); return; }
    if (pinInput.length < 6) {
      const next = pinInput + k;
      setPinInput(next);
      if (next.length === 6) checkPin(next);
    }
  };

  const checkPin = async (pin) => {
    if (pinLoading) return;
    const value = pin !== undefined ? pin : pinInput;
    if (value.length < 6) return;
    setPinLoading(true);
    const result = await auth.login(value, "operador");
    setPinLoading(false);
    if (result.success) {
      setPinUnlocked(true);
      setShowPin(false);
      if (pendingAction) { pendingAction(); setPendingAction(null); }
    } else {
      setPinError(true); setPinInput("");
      setTimeout(() => setPinError(false), 1200);
    }
  };

  useEffect(()=>{
    document.title = "La Dieci";

    const path = window.location.pathname.replace(/^\//, '').toLowerCase();
    const iconUrl =
      path === 'repartidor' ? '/logo-yellow.jpg' :
      path === 'econbot'    ? '/logo-blue.jpg'   :
                              '/logo-red.jpg';

    const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
    link.type = 'image/jpeg'; link.rel = 'shortcut icon'; link.href = iconUrl;
    document.getElementsByTagName('head')[0].appendChild(link);
    const apple = document.querySelector("link[rel='apple-touch-icon']") || document.createElement('link');
    apple.rel = 'apple-touch-icon'; apple.href = iconUrl;
    document.getElementsByTagName('head')[0].appendChild(apple);
  },[]);
  const [ordenes,setOrdenes] = useState(ORDENES_INIT);
  const [waMsgs,setWaMsgs] = useState(WA_INIT);
  const [convConfermata,setConvConfermata] = useState([]);
  const [notif,setNotif] = useState(null);
  const [syncStatus,setSyncStatus] = useState("idle");
  const [pendingSug, setPendingSug] = useState(0);
  const [sugModal, setSugModal] = useState(false);
  const [sugList, setSugList] = useState([]);
  const notificatiIds = useRef(new Set()); // evita notifiche multiple per stesso msg
  // Patch ottimistici in volo: id ordine → { patch, ts }.
  // patch._deleted=true segnala una delete ottimistica.
  // Applicati come overlay sopra i dati backend in loadAll() per evitare che
  // un postgres_changes su wa_msgs/conv (o un fetch race) ribalti l'UI prima che
  // la PATCH del backend abbia committato.
  const pendingPatches = useRef(new Map());
  // blockedTels è definito a livello modulo (condiviso con ServicioPage).
  // skipLoadUntil RIMOSSO: il backend chiudiServizio è ora atomico e ritorna summary.
  // Niente più finestra cieca di 60s, niente race da gestire client-side.

  const notify = (msg,c=C.verde) => { setNotif({msg,c}); setTimeout(()=>setNotif(null),2600); };

  // Carica suggerimenti pending
  const loadSuggerimenti = async () => {
    try {
      const rows = await sb.select("suggerimenti", "stato=eq.pending&order=ts.desc");
      if (Array.isArray(rows)) { setPendingSug(rows.length); setSugList(rows); }
    } catch(e) {}
  };

  const [detailSug, setDetailSug] = useState(null); // suggerimento aperto in dettaglio
  const [rigenerando, setRigenerando] = useState(false);
  const handleRigenera = async () => {
    setRigenerando(true);
    notify("🔄 Analizando historial...", C.viola);
    try {
      const res = await api.get("rigeneraSuggerimenti");
      if (res && res.ok) {
        notify("✅ " + (res.n_suggerimenti||0) + " nuevas sugerencias generadas", C.verde);
        await loadSuggerimenti();
      } else {
        notify("❌ " + (res?.error || "Error"), C.rosso);
      }
    } catch(e) { notify("❌ Error de red", C.rosso); }
    setRigenerando(false);
  };

  const handleApprova = async (id, stato) => {
    try {
      await api.get(`approvaSuggerimento&id=${id}&stato=${stato}`);
      const updated = sugList.map(s => s.id === id ? {...s, stato} : s);
      setSugList(updated);
      const newPending = updated.filter(s => s.stato === "pending").length;
      setPendingSug(newPending);
      notify(stato === "approvato" ? "✅ Regla aplicada al bot" : "🚫 Sugerencia rechazada", stato === "approvato" ? C.verde : C.grigio);
    } catch(e) { notify("❌ Error", C.rosso); }
  };

  // ── Supabase Realtime + initial load (ZERO POLLING) ──
  useEffect(()=>{
    let mounted = true;

    // Initial load. Niente più skipLoadUntil: il backend è atomico.
    const loadAll = async () => {
      setSyncStatus("syncing");
      try {
        const [rOrdenes, rWA, rConv] = await Promise.all([api.getOrdenes(), api.getWaMsgs(), sb.select("conv","stato_ordine=eq.confermata")]);
        loadSuggerimenti();
        if (!mounted) return;
        if (rOrdenes.ordenes) {
          // Il DB è la sorgente di verità. Conserviamo:
          // - gli ordini _temp (creati ottimisticamente, non ancora confermati dal backend)
          // - i pendingPatches (transizioni di stato in volo, sopra i dati backend)
          setOrdenes(prev => {
            // Riconcilia _temp via client_req_id: se il DB ha già l'ordine
            // (anche se il client non ha ancora ricevuto la risposta), il temp
            // viene rimosso per evitare il doppio in UI.
            const dbReqIds = new Set(
              rOrdenes.ordenes
                .map(r => r.client_req_id)
                .filter(Boolean)
            );
            const localTemp = prev.filter(o =>
              o._temp &&
              !rOrdenes.ordenes.find(r => r.id === o.id) &&
              !(o.client_req_id && dbReqIds.has(o.client_req_id))
            );
            const pp = pendingPatches.current;
            const merged = rOrdenes.ordenes
              .filter(o => {
                const e = pp.get(o.id);
                return !(e && e.patch && e.patch._deleted);
              })
              .map(o => {
                const e = pp.get(o.id);
                return (e && e.patch) ? { ...o, ...e.patch } : o;
              });
            return [...merged, ...localTemp];
          });
        }
        if (rWA.msgs) {
          setWaMsgs(prev => {
            const now2 = Date.now();
            // Preserva i messaggi locali per i tel bloccati (ottimismo dopo conferma)
            const blockedSet = new Set(
              Object.entries(blockedTels.current)
                .filter(([, until]) => until > now2)
                .map(([tel]) => tel)
            );
            if (blockedSet.size === 0) return rWA.msgs;
            // FIX WHITELIST-BLOCKED: non scartare i nuovi wa_msgs (id mai visti prima)
            // anche se il tel e' bloccato. Il blocco serve solo a proteggere i msg gia'
            // esistenti dalla race condition post-conferma, non i nuovi ordini successivi.
            const prevIds = new Set(prev.map(m => m.id));
            const fromBackend = rWA.msgs.filter(m => {
              const tel = String(m.wa_id||m.tel||"").replace("+","");
              if (!blockedSet.has(tel)) return true;
              // Nuovo msg (id non visto prima) → mostra sempre dal backend
              return !prevIds.has(m.id);
            });
            const fromLocal = prev.filter(m =>
              blockedSet.has(String(m.wa_id||m.tel||"").replace("+","")) &&
              m.stato !== "COMPLETATO"
            );
            // Deduplica: fromLocal ha priorità per gli id già visti (race condition protection)
            const localIds = new Set(fromLocal.map(m => m.id));
            return [...fromBackend.filter(m => !localIds.has(m.id)), ...fromLocal];
          });
          const nuoviDaSuonare = rWA.msgs.filter(m =>
            m.stato === "NUEVO" &&
            (Date.now() - m.ts) < 30000 &&
            !notificatiIds.current.has(m.id)
          );
          if (nuoviDaSuonare.length > 0) {
            nuoviDaSuonare.forEach(m => notificatiIds.current.add(m.id));
            // Trim: evita memory leak su sessioni lunghe
            if (notificatiIds.current.size > 500) {
              const arr = Array.from(notificatiIds.current);
              notificatiIds.current = new Set(arr.slice(-250));
            }
            // Distingui ordini da preguntas
            const hasOrdine = nuoviDaSuonare.some(m => {
              try { const ia = typeof m.ia_items==="string" ? JSON.parse(m.ia_items) : m.ia_items; return Array.isArray(ia) && ia.length > 0; } catch(e) { return false; }
            });
            try { hasOrdine ? Suoni.nuovoOrdineWA() : Suoni.nuovaPreguntaWA(); } catch(e) {}
          }
        }
        if (mounted && Array.isArray(rConv)) setConvConfermata(rConv);
        setSyncStatus("ok");
      } catch(e) { if (mounted) setSyncStatus("error"); }
    };
    loadAll();

    // Supabase Realtime — ascolta cambiamenti su ordenes + wa_msgs
    const wsUrl = SUPABASE_URL.replace("https://","wss://") + "/realtime/v1/websocket?apikey="+SUPABASE_KEY+"&vsn=1.0.0";
    let ws = null;
    let heartbeat = null;
    let wsConnected = false; // true quando WebSocket è attivo e riceve eventi

    const connectRealtime = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          wsConnected = true;
          // Join ordenes channel
          ws.send(JSON.stringify({topic:"realtime:public:ordenes",event:"phx_join",payload:{config:{broadcast:{self:false},postgres_changes:[{event:"*",schema:"public",table:"ordenes"}]}},ref:"1"}));
          // Join wa_msgs channel
          ws.send(JSON.stringify({topic:"realtime:public:wa_msgs",event:"phx_join",payload:{config:{broadcast:{self:false},postgres_changes:[{event:"*",schema:"public",table:"wa_msgs"}]}},ref:"2"}));
          // Join conv channel
          ws.send(JSON.stringify({topic:"realtime:public:conv",event:"phx_join",payload:{config:{broadcast:{self:false},postgres_changes:[{event:"*",schema:"public",table:"conv"}]}},ref:"3"}));
          // Ricarica subito dopo reconnect per non perdere eventi persi durante disconnect
          if (mounted) loadAll();
          // Heartbeat
          heartbeat = setInterval(() => {
            if (ws.readyState === 1) ws.send(JSON.stringify({topic:"phoenix",event:"heartbeat",payload:{},ref:"hb"}));
          }, 30000);
        };
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.event === "postgres_changes") {
              // Supabase Realtime v2: table è in payload.data.table, non payload.table
              loadAll();
            }
          } catch(e) {}
        };
        ws.onclose = () => {
          wsConnected = false;
          if (heartbeat) clearInterval(heartbeat);
          // Riconnetti dopo 3s
          if (mounted) setTimeout(connectRealtime, 3000);
        };
        ws.onerror = () => { ws.close(); };
      } catch(e) {
        wsConnected = false;
      }
    };

    connectRealtime();

    // Fallback polling ogni 5s — attivo solo se WebSocket non è connesso
    const fallbackPoll = setInterval(() => { if (mounted && !wsConnected) loadAll(); }, 5000);

    return () => {
      mounted = false;
      if (ws) ws.close();
      if (heartbeat) clearInterval(heartbeat);
      clearInterval(fallbackPoll);
    };
  },[]);
  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",minHeight:"100vh",background:C.nero}}>
      <style>{G}</style>
      <DevHeartbeatSender/>
      {screen==="splash"   && <Splash onDone={()=>{ postSplashAction.current(); }}/>}
      {screen==="home"     && <Home
          onServizio={()=>withPin(()=>setScreen("servicio"))}
          onEconBot={()=>withPin(()=>setScreen("econbot"))}/>}
      {screen==="econbot"  && <EconBotPage
          onEconomia={()=>setScreen("economia")}
          onBotIA={()=>{ setSugModal(true); }}
          onBack={()=>setScreen("home")}
          pendingSug={pendingSug}/>}
      {screen==="servicio" && <ServicioPage onBack={()=>setScreen("home")}
          ordenes={ordenes} setOrdenes={setOrdenes}
          waMsgs={waMsgs} setWaMsgs={setWaMsgs} notify={notify} syncStatus={syncStatus}
          convConfermata={convConfermata}
          pendingPatches={pendingPatches}/>}
      {screen==="economia" && <EconomiaPage onBack={()=>setScreen("home")}/>}
      {screen==="repartidor" && <RepartidorPage
          ordenes={ordenes}
          onBack={startedAtRepartidor.current ? null : ()=>setScreen("home")}
          notify={notify}/>}

      {/* ─── Modal PIN — si apre quando si clicca Servicio/Economía/Bot ─── */}
      {showPin && (
        <div style={{
          position:"fixed", inset:0, zIndex:9999,
          background:"rgba(0,0,0,0.93)",
          display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center", gap:28
        }}>
          {/* Titolo */}
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:32, marginBottom:8}}>🔒</div>
            <div style={{color:"#fff", fontWeight:800, fontSize:20, letterSpacing:1}}>
              Código de acceso
            </div>
            <div style={{color:"rgba(255,255,255,0.35)", fontSize:13, marginTop:4}}>
              Introduce el PIN del operador
            </div>
          </div>

          {/* Puntos PIN — 6 cifre */}
          <div style={{display:"flex", gap:14}}>
            {[0,1,2,3,4,5].map(i => (
              <div key={i} style={{
                width:16, height:16, borderRadius:"50%",
                background: i < pinInput.length
                  ? (pinError ? "#E8341C" : "#F97316")
                  : "rgba(255,255,255,0.15)",
                border: `2px solid ${pinError ? "#E8341C" : i < pinInput.length ? "#F97316" : "rgba(255,255,255,0.25)"}`,
                transition:"all .15s",
                transform: pinError ? "scale(1.2)" : "scale(1)"
              }}/>
            ))}
          </div>
          {pinLoading && (
            <div style={{color:"rgba(255,255,255,0.5)", fontSize:13, marginTop:-18}}>
              Verificando…
            </div>
          )}
          {pinError && !pinLoading && (
            <div style={{color:"#E8341C", fontSize:13, fontWeight:600, marginTop:-18}}>
              PIN incorrecto
            </div>
          )}

          {/* Tastierino — solo numeri + cancella, auto-submit a 6 cifre */}
          <div style={{
            display:"grid", gridTemplateColumns:"repeat(3,1fr)",
            gap:12, width:240
          }}>
            {["1","2","3","4","5","6","7","8","9","DEL","0",""].map((k, idx) => (
              k === "" ? <div key={idx}/> :
              <button key={k} onClick={()=>handlePinKey(k)} disabled={pinLoading} style={{
                height:64,
                background: k==="DEL" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius:14,
                color:"#fff",
                fontSize: k==="DEL" ? 18 : 22,
                fontWeight:700,
                cursor: pinLoading ? "default" : "pointer",
                opacity: pinLoading ? 0.4 : 1,
                transition:"background .1s"
              }}>
                {k==="DEL" ? "⌫" : k}
              </button>
            ))}
          </div>

          {/* Annulla */}
          <button onClick={()=>{ setShowPin(false); setPendingAction(null); }} style={{
            background:"transparent", border:"none",
            color:"rgba(255,255,255,0.3)", fontSize:13,
            cursor:"pointer", padding:"8px 20px"
          }}>
            Cancelar
          </button>
        </div>
      )}
      {/* Modal Suggerimenti Bot — griglia riassuntiva */}
      {sugModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:9998,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"32px 24px",overflowY:"auto"}}>
          <div style={{background:"#0e0e1a",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"28px 32px",maxWidth:960,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.9)"}}>

            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,paddingBottom:20,borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:3,textTransform:"uppercase",color:"rgba(168,85,247,0.7)",marginBottom:6}}>Análisis IA · La Dieci</div>
                <div style={{fontSize:22,fontWeight:700,color:"#f0f0f0",letterSpacing:-0.3}}>Sugerencias para el Bot</div>
                {sugList.length > 0 && <div style={{fontSize:13,color:"rgba(255,255,255,0.3)",marginTop:4}}>{sugList.filter(s=>s.stato==="pending").length} pendientes · Toca una tarjeta para ver más</div>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <button onClick={handleRigenera} disabled={rigenerando} style={{
                  background:"transparent",border:"1px solid rgba(168,85,247,0.35)",
                  borderRadius:8,padding:"8px 16px",color:"rgba(168,85,247,0.85)",fontWeight:600,fontSize:12,
                  letterSpacing:0.5,cursor:rigenerando?"not-allowed":"pointer",opacity:rigenerando?0.5:1,
                  transition:"opacity .15s"}}>
                  {rigenerando ? "Analizando…" : "↻ Regenerar"}
                </button>
                <button onClick={()=>setSugModal(false)} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"rgba(255,255,255,0.4)",fontSize:16,cursor:"pointer",width:34,height:34,lineHeight:"32px",textAlign:"center"}}>✕</button>
              </div>
            </div>

            {/* Cards griglia — compatte, cliccabili */}
            {sugList.length === 0 ? (
              <div style={{color:"rgba(255,255,255,0.3)",textAlign:"center",padding:"40px 0",fontSize:14,letterSpacing:0.3}}>No hay sugerencias pendientes.<br/><span style={{fontSize:12,opacity:0.6}}>Toca ↻ Regenerar para analizar el historial.</span></div>
            ) : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
                {sugList.map(s => {
                  const tipoColor = s.tipo==="prompt" ? "#6ea8fe" : s.tipo==="menu" ? "#f0c060" : "#b07ff5";
                  const tipoLabel = s.tipo==="prompt" ? "PROMPT" : s.tipo==="menu" ? "MENÚ" : "COMPORTAMIENTO";
                  const isApproved = s.stato==="approvato";
                  const isRifiutato = s.stato==="rifiutato";

                  let motivTxt = s.motivazione || "";
                  let casi = [];
                  try {
                    if (motivTxt.trim().startsWith("{")) {
                      const p = JSON.parse(motivTxt);
                      motivTxt = p.m || "";
                      casi = Array.isArray(p.c) ? p.c : [];
                    }
                  } catch(e) {}

                  return (
                    <div key={s.id}
                      onClick={()=>setDetailSug(s)}
                      style={{
                        background: isApproved ? "rgba(46,213,115,0.05)" : isRifiutato ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.03)",
                        border:`1px solid ${isApproved?"rgba(46,213,115,0.2)":isRifiutato?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.09)"}`,
                        borderRadius:12,opacity:isRifiutato?0.45:1,cursor:"pointer",
                        display:"flex",flexDirection:"column",gap:0,overflow:"hidden",
                        transition:"border-color .15s, transform .1s",
                      }}
                      onMouseEnter={e=>{ if(!isRifiutato) e.currentTarget.style.borderColor=tipoColor+"55"; e.currentTarget.style.transform="translateY(-1px)"; }}
                      onMouseLeave={e=>{ e.currentTarget.style.borderColor=isApproved?"rgba(46,213,115,0.2)":isRifiutato?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.09)"; e.currentTarget.style.transform="none"; }}
                    >
                      {/* Striscia tipo colore top */}
                      <div style={{height:3,background:`linear-gradient(90deg,${tipoColor}60,${tipoColor}10)`}}/>
                      <div style={{padding:"16px 18px",display:"flex",flexDirection:"column",gap:10,flex:1}}>
                        {/* Tipo + stato */}
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <span style={{fontSize:10,fontWeight:800,letterSpacing:2,color:tipoColor,textTransform:"uppercase"}}>{tipoLabel}</span>
                          {isApproved && <span style={{fontSize:10,color:"#2ed573",fontWeight:600}}>✓ Aplicado</span>}
                          {isRifiutato && <span style={{fontSize:10,color:"rgba(255,255,255,0.25)"}}>Rechazado</span>}
                          {s.stato==="pending" && <span style={{fontSize:10,color:"rgba(255,255,255,0.2)"}}>Pendiente</span>}
                        </div>
                        {/* Testo regola (breve) */}
                        <div style={{color:"#e0e0e0",fontSize:13,fontWeight:500,lineHeight:1.6,letterSpacing:0.05,display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{s.testo}</div>
                        {/* Motivazione preview */}
                        {motivTxt && <div style={{color:"rgba(255,255,255,0.3)",fontSize:11,lineHeight:1.5,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{motivTxt}</div>}
                        {/* Badge casi */}
                        {casi.length > 0 && (
                          <div style={{marginTop:"auto",paddingTop:8,display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:10,color:tipoColor+"99",fontWeight:600,letterSpacing:0.5}}>{casi.length} {casi.length===1?"caso real":"casos reales"}</span>
                            <span style={{fontSize:10,color:"rgba(255,255,255,0.2)"}}>· Abrir para leer →</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer */}
            <div style={{marginTop:24,paddingTop:20,borderTop:"1px solid rgba(255,255,255,0.07)",display:"flex",justifyContent:"flex-end"}}>
              <button onClick={()=>setSugModal(false)} style={{
                background:"transparent",border:"1px solid rgba(255,255,255,0.1)",
                borderRadius:8,padding:"10px 24px",color:"rgba(255,255,255,0.3)",fontSize:13,
                fontWeight:500,letterSpacing:0.3,cursor:"pointer"}}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dettaglio Suggerimento — si apre sopra la griglia */}
      {detailSug && (() => {
        const s = detailSug;
        const tipoColor = s.tipo==="prompt" ? "#6ea8fe" : s.tipo==="menu" ? "#f0c060" : "#b07ff5";
        const tipoLabel = s.tipo==="prompt" ? "Mejora del prompt" : s.tipo==="menu" ? "Actualización del menú" : "Comportamiento del bot";
        const tipoDesc  = s.tipo==="prompt" ? "Cambia cómo el bot se expresa y responde" : s.tipo==="menu" ? "Sobre nombres, precios o disponibilidad de productos" : "Modifica el flujo de gestión del pedido";

        let motivTxt = s.motivazione || "";
        let casi = [];
        try {
          if (motivTxt.trim().startsWith("{")) {
            const p = JSON.parse(motivTxt);
            motivTxt = p.m || "";
            casi = Array.isArray(p.c) ? p.c : [];
          }
        } catch(e) {}

        const renderEstratto = (estratto, highlight) => {
          if (!highlight || !estratto) return <span>{estratto}</span>;
          const idx = estratto.toLowerCase().indexOf(highlight.toLowerCase());
          if (idx < 0) return <span>{estratto}</span>;
          return (
            <span>
              {estratto.slice(0, idx)}
              <mark style={{background:"rgba(251,191,36,0.28)",color:"#fde68a",borderRadius:3,padding:"1px 3px",fontWeight:700,fontStyle:"normal"}}>{estratto.slice(idx, idx+highlight.length)}</mark>
              {estratto.slice(idx+highlight.length)}
            </span>
          );
        };

        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}}
            onClick={e=>{ if(e.target===e.currentTarget) setDetailSug(null); }}>
            <div style={{background:"#0a0a14",border:`1px solid ${tipoColor}30`,borderRadius:20,maxWidth:640,width:"100%",maxHeight:"90vh",overflowY:"auto",boxShadow:`0 24px 80px rgba(0,0,0,0.95), 0 0 0 1px ${tipoColor}20`}}>

              {/* Striscia colore top */}
              <div style={{height:4,background:`linear-gradient(90deg,${tipoColor},${tipoColor}20)`,borderRadius:"20px 20px 0 0"}}/>

              <div style={{padding:"28px 32px",display:"flex",flexDirection:"column",gap:24}}>

                {/* Header */}
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16}}>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:10,fontWeight:800,letterSpacing:2,color:tipoColor,textTransform:"uppercase",background:`${tipoColor}15`,border:`1px solid ${tipoColor}30`,borderRadius:4,padding:"3px 8px"}}>{tipoLabel}</span>
                      {s.stato==="approvato" && <span style={{fontSize:11,color:"#2ed573",fontWeight:600,background:"rgba(46,213,115,0.1)",border:"1px solid rgba(46,213,115,0.25)",borderRadius:4,padding:"3px 8px"}}>✓ Ya aplicado</span>}
                    </div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.3)",letterSpacing:0.2}}>{tipoDesc}</div>
                  </div>
                  <button onClick={()=>setDetailSug(null)} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"rgba(255,255,255,0.4)",fontSize:16,cursor:"pointer",width:34,height:34,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                </div>

                {/* Regola — riquadro centrale */}
                <div style={{background:`${tipoColor}08`,border:`1px solid ${tipoColor}22`,borderRadius:12,padding:"20px 22px"}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:2,color:`${tipoColor}99`,textTransform:"uppercase",marginBottom:10}}>Regla sugerida</div>
                  <div style={{color:"#f0f0f0",fontSize:16,fontWeight:500,lineHeight:1.7,letterSpacing:0.1}}>{s.testo}</div>
                </div>

                {/* Perché cambiarlo — motivazione estesa */}
                {motivTxt && (
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{fontSize:11,fontWeight:700,letterSpacing:2,color:"rgba(255,255,255,0.3)",textTransform:"uppercase"}}>Por qué cambiarlo</div>
                    <div style={{color:"rgba(255,255,255,0.75)",fontSize:14,lineHeight:1.8,letterSpacing:0.15,background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"16px 18px",borderLeft:`3px solid ${tipoColor}40`}}>
                      {motivTxt}
                    </div>
                  </div>
                )}

                {/* Casi reali osservati */}
                {casi.length > 0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{fontSize:11,fontWeight:700,letterSpacing:2,color:"rgba(255,255,255,0.3)",textTransform:"uppercase"}}>Casos reales observados</div>
                      <div style={{flex:1,height:1,background:"rgba(255,255,255,0.06)"}}/>
                      <span style={{fontSize:11,color:"rgba(255,255,255,0.2)"}}>{casi.length} {casi.length===1?"conversación":"conversaciones"}</span>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {casi.map((c,i) => (
                        <div key={i} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"14px 16px",display:"flex",flexDirection:"column",gap:8}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:24,height:24,borderRadius:"50%",background:`${tipoColor}20`,border:`1px solid ${tipoColor}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:tipoColor,flexShrink:0}}>{i+1}</div>
                            {c.cliente && <span style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.5)",letterSpacing:0.3}}>{c.cliente}</span>}
                          </div>
                          <div style={{color:"rgba(255,255,255,0.65)",fontSize:13,lineHeight:1.7,fontStyle:"italic",padding:"8px 12px",background:"rgba(0,0,0,0.2)",borderRadius:7,borderLeft:`2px solid ${tipoColor}50`}}>
                            "{renderEstratto(c.estratto, c.highlight)}"
                          </div>
                          {c.highlight && (
                            <div style={{display:"flex",alignItems:"center",gap:6,paddingLeft:2}}>
                              <span style={{width:8,height:8,borderRadius:2,background:"rgba(251,191,36,0.5)",flexShrink:0}}/>
                              <span style={{fontSize:11,color:"rgba(253,230,138,0.6)",letterSpacing:0.2}}>El punto crítico: <em style={{color:"#fde68a",fontStyle:"normal"}}>"{c.highlight}"</em></span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Azioni */}
                {s.stato === "pending" && (
                  <div style={{display:"flex",gap:10,paddingTop:4}}>
                    <button onClick={()=>{ handleApprova(s.id,"approvato"); setDetailSug(null); }} style={{
                      flex:1,background:"rgba(46,213,115,0.1)",border:"1px solid rgba(46,213,115,0.3)",
                      borderRadius:10,padding:"14px 0",color:"#2ed573",fontWeight:700,fontSize:14,
                      letterSpacing:0.3,cursor:"pointer",transition:"background .15s"}}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(46,213,115,0.18)"}
                      onMouseLeave={e=>e.currentTarget.style.background="rgba(46,213,115,0.1)"}>
                      ✓ Aplicar al Bot
                    </button>
                    <button onClick={()=>{ handleApprova(s.id,"rifiutato"); setDetailSug(null); }} style={{
                      background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",
                      borderRadius:10,padding:"14px 20px",color:"rgba(255,255,255,0.3)",fontWeight:500,fontSize:13,cursor:"pointer",transition:"background .15s"}}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.08)"}
                      onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}>
                      Rechazar
                    </button>
                  </div>
                )}
                {s.stato === "approvato" && (
                  <div style={{textAlign:"center",color:"rgba(46,213,115,0.6)",fontSize:13,padding:"8px 0"}}>Esta regla ya está activa en el bot.</div>
                )}

              </div>
            </div>
          </div>
        );
      })()}

      {notif&&(
        <div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",
          background:notif.c,color:"#fff",padding:"10px 22px",borderRadius:30,zIndex:999,
          fontWeight:700,fontSize:13,boxShadow:`0 4px 20px ${notif.c}66`,
          animation:"slideDown .25s ease",whiteSpace:"nowrap"}}>
          {notif.msg}
        </div>
      )}
    </div>
  );
}
