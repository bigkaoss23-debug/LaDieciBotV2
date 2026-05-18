import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { C, useWidth, blockedTels, MAX_PIZZE_ORA, LOGO_RED_SRC, genId, tot, calcTotale } from '../constants';
import { sb, api, auth } from '../api';
import Suoni from '../sounds';
import TabWA from './wa/TabWA';
import TabManual from './ordenes/TabManual';
import TabBanco from './ordenes/TabBanco';
import TabListos, { caricoTotale } from './ordenes/TabListos';
import TabCocina from './cocina/TabCocina';
import PanelCocina from './cocina/PanelCocina';
import TabEntregas from './entregas/TabEntregas';
import NuevoPedidoModal from './NuevoPedidoModal';
import ModificaOrdenModal from './ModificaOrdenModal';
import Badge from './ui/Badge';
import DevPresence from './DevPresence';
import { ORDER_STATES, buildEnCocinaTransition, buildEnEntregaTransition, buildListoTransition, buildOperatorOrderCreationIntent, buildRetiradoTransition, buildWaOrderCreationIntent, isCompletedState, logLegacyBypass, logOrderCreation, logRollback, logTransition } from '../core/orders';

const LiveTime = () => {
  const [t, setT] = useState(new Date());
  useEffect(()=>{const i=setInterval(()=>setT(new Date()),1000);return()=>clearInterval(i);},[]);
  const timeStr = t.toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const dateStr = t.toLocaleDateString("es",{weekday:"short",day:"numeric",month:"short"});
  return (
    <div style={{textAlign:"center"}}>
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:19,fontWeight:900,
        color:"#F3F3F3",letterSpacing:.5,lineHeight:1,
        textShadow:"0 0 22px rgba(232,52,28,0.22)"}}>{timeStr}</div>
      <div style={{fontSize:9,color:"#444",marginTop:2,
        textTransform:"capitalize",letterSpacing:.3}}>{dateStr}</div>
    </div>
  );
};

// ─── SERVICIO PAGE ────────────────────────────────────
const ServicioPage = ({onBack,ordenes,setOrdenes,waMsgs,setWaMsgs,notify,syncStatus,convConfermata=[],pendingPatches}) => {
  const observeOrderTransition = (action, id, to, metadata) => {
    const current = ordenes.find(o => o.id === id);
    logTransition({
      component: "ServicioPage",
      action,
      orderId: id,
      from: current?.estado,
      to,
      metadata,
    });
  };

  // Helper: applica un patch ottimistico marcandolo come "in volo" in pendingPatches.
  // Così loadAll() (App.jsx) non lo ribalta se un postgres_changes su un'altra
  // tabella scatena un refetch prima che la PATCH backend abbia committato.
  const optimisticOrden = async (id, patch, run) => {
    if (pendingPatches) pendingPatches.current.set(id, { patch, ts: Date.now() });
    setOrdenes(p => p.map(o => o.id === id ? { ...o, ...patch } : o));
    try { return await run(); }
    finally { if (pendingPatches) pendingPatches.current.delete(id); }
  };
  const optimisticDelete = async (id, run) => {
    if (pendingPatches) pendingPatches.current.set(id, { patch: { _deleted: true }, ts: Date.now() });
    setOrdenes(prev => prev.filter(o => o.id !== id));
    try { return await run(); }
    finally { if (pendingPatches) pendingPatches.current.delete(id); }
  };
  const [tab,setTab] = useState("wa");
  const [loadingIds, setLoadingIds] = useState(new Set());
  const [showNuevo,setShowNuevo] = useState(false);
  const [showCocina,setShowCocina] = useState(false);
  const [chatStoricoSel, setChatStoricoSel] = useState(null);
  const [prefillCliente,setPrefillCliente] = useState(null);
  const [goToPedidosSignal, setGoToPedidosSignal] = useState(0);
  const [goToPreguntasSignal, setGoToPreguntasSignal] = useState(0);
  const [ordenModifica, setOrdenModifica] = useState(null);
  const [aiForza, setAiForza] = useState("BASIC");
  const [chiudiModal, setChiudiModal] = useState(null); // null | { completati, attivi, loading, step }
  // VIP set — cliente_id dei clienti che oggi sono sopra soglia (calcolata su Railway).
  // Si aggiorna alla mount + ogni 5 min. Usato dalle card per mostrare la ⭐.
  const [vipIds, setVipIds] = useState(() => new Set());
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await api.getClientes();
        if (!mounted) return;
        const set = new Set((res?.clientes || []).filter(c => c.vip).map(c => c.id));
        setVipIds(set);
      } catch (e) { /* silenzioso */ }
    };
    load();
    const iv = setInterval(load, 5 * 60 * 1000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);
  const [webhookActive, setWebhookActive] = useState(true);
  const [healthStatus, setHealthStatus] = useState("ok"); // "ok" | "warning" | "error"
  const [showCambioPin, setShowCambioPin] = useState(false);
  const [pinChange, setPinChange] = useState({ tipo:"operador", step:1, viejo:"", nuevo:"", confirm:"", error:"", ok:false, loading:false });
  useEffect(() => {
    sb.select("config", "chiave=eq.AI_FORZA").then(rows => {
      if (rows && rows[0]) setAiForza(rows[0].valore || "BASIC");
    }).catch(e => console.warn("[init] load AI_FORZA fallito:", e?.message || e));
    // Carica stato webhook
    sb.select("config", "chiave=eq.AUTO_RISPOSTA").then(rows => {
      if (rows && rows[0]) setWebhookActive(rows[0].valore === "TRUE");
      else setWebhookActive(true); // default: attivo
    }).catch(e => console.warn("[init] load AUTO_RISPOSTA fallito:", e?.message || e));
  }, []);

  // ── Health check Railway (osservatore puro, non agisce sul backend) ─────────
  // Quando Railway è down NON tentiamo di chiamare Railway per "spegnere il bot"
  // (sarebbe inutile: l'API è proprio quella che non risponde). Avvisiamo solo:
  // banner UI + suono + browser notification. La gestione di emergenza è manuale.
  const failCountRef = useRef(0);
  const alertedRef = useRef(false);

  const PING_URL = "https://ladiecibot-production.up.railway.app/health";
  const PING_INTERVAL = 30000;

  useEffect(() => {
    // Richiedi permesso per browser notification — fallback per quando la tab
    // del dashboard non è in primo piano. Failure mode silenzioso (permesso negato).
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try { Notification.requestPermission().catch(() => {}); } catch (_) {}
    }

    const ping = async () => {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 6000);
        await fetch(PING_URL, { cache: "no-store", signal: ctrl.signal });
        clearTimeout(tid);
        failCountRef.current = 0;
        setHealthStatus("ok");
        if (alertedRef.current) {
          alertedRef.current = false;
          notify("✅ Railway online — backend respondiendo", C.verde);
        }
      } catch (e) {
        failCountRef.current += 1;
        setHealthStatus(failCountRef.current >= 3 ? "error" : "warning");
        if (failCountRef.current === 3 && !alertedRef.current) {
          alertedRef.current = true;
          notify("🚨 Railway no responde 90s — bot puede no contestar WhatsApp. Gestiona a mano.", C.rosso);
          try { Suoni.campanellaDieci(); } catch (_) {}
          try {
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification("⚠️ La Dieci — Railway offline", {
                body: "Il backend non risponde da 90s. WhatsApp può non funzionare. Gestire i messaggi a mano dal telefono.",
                tag: "railway-down",
                requireInteraction: true,
              });
            }
          } catch (_) {}
        }
      }
    };
    ping();
    const t = setInterval(ping, PING_INTERVAL);
    return () => clearInterval(t);
  }, []);

  const toggleWebhook = async () => {
    const next = !webhookActive;
    setWebhookActive(next);
    try {
      await api.post({ action: "setConfig", chiave: "AUTO_RISPOSTA", valore: next ? "TRUE" : "FALSE" });
      notify(next ? "✅ Bot WhatsApp ACTIVO" : "⛔ Bot WhatsApp APAGADO — mensajes → tu teléfono", next ? C.verde : C.orange);
    } catch(e) {
      setWebhookActive(!next); // rollback
      notify("❌ Errore cambio stato webhook", C.rosso);
      console.error("[toggleWebhook]", e);
    }
  };

  const handleChiudiServizio = async () => {
    // Step 1: scan → mostra modale
    setChiudiModal({ loading: true, completati: null, attivi: [] });
    try {
      const scan = await api.get("scanServizio");
      setChiudiModal({ loading: false, completati: scan.completati, attivi: scan.attivi || [] });
    } catch(err) {
      setChiudiModal(null);
      notify("❌ Error al escanear servicio", C.rosso);
    }
  };

  const handleChiudiConferma = async (deleteAttivi) => {
    setChiudiModal(null);
    notify("🌙 Cerrando servicio...", C.giallo);
    // Backend atomico: lock → calcola summary → scrivi storico completo →
    // verifica → cancella ordenes/conv/wa_msgs. Niente più finestra cieca client-side:
    // se il backend dice success, il DB è pulito; il WebSocket porterà gli eventi.
    try {
      const res = await api.get("chiudiServizio", deleteAttivi ? { deleteAttivi: "true" } : {});
      if (res?.skipped) {
        notify("ℹ️ Servicio già chiuso oggi", C.giallo);
      } else if (res?.success) {
        const s = res.summary || {};
        const eur = n => `${(Number(n)||0).toFixed(0)}€`;
        notify(`✅ ${s.n_ordini || 0} ordini · ${eur(s.cassa_totale)} archiviati`, C.verde);
      } else {
        notify(`❌ Chiusura fallita: ${res?.error || "errore"}`, C.rosso);
        console.error("chiudiServizio:", res);
      }
    } catch(err) {
      notify("❌ Errore di rete chiusura serata", C.rosso);
      console.error(err);
    }
  };

  const toggleAiForza = async () => {
    const next = aiForza === "BASIC" ? "STRONG" : "BASIC";
    const prev = aiForza;
    setAiForza(next);
    try {
      await api.post({ action: "setConfig", chiave: "AI_FORZA", valore: next });
      notify(`AI: ${next}`, next === "STRONG" ? C.viola : C.blu);
    } catch(e) {
      setAiForza(prev); // rollback ottimistico
      notify("❌ Error al cambiar AI", C.rosso);
      console.error("[toggleAiForza]", e);
    }
  };

  // Helper: parse adicion data from ia.nota (ADICION o ADICION_NUEVO)
  const parseAdicion = (m) => {
    try {
      const nota = m?.ia?.nota || "";
      if (nota.indexOf('"tipo":"ADICION"') === -1 && nota.indexOf('"tipo":"ADICION_NUEVO"') === -1) return null;
      return JSON.parse(nota);
    } catch(e) { return null; }
  };

  // ═══ FILTRO v10 — Architettura ad Agenti ═══
  // Sezione Ordini (Pedidos): ordini da confermare → operatore clicca "Invia in Cucina"
  //   - NUEVO con ordine_ref → ordine POR_CONFIRMAR creato dal backend
  //   - NUEVO senza ordine_ref → in attesa di ora
  //   - COCINA → già confermato dall'operatore
  // Sezione Chat (Preguntas): modifiche + domande → operatore gestisce
  //   - IN_TRATTAMENTO → modifiche, domande, ambigui
  // COMPLETATO → nascosto dal tab WA (resta nel DB fino a chiudiServizio notturno)

  const waMsgsPreguntas = waMsgs.filter(m => {
    if (m._botOnly) return false;
    if (m.stato === "COMPLETATO") return false;
    // IN_TRATTAMENTO → Chat (modifiche, domande, ambigui)
    if (m.stato === "IN_TRATTAMENTO") return true;
    return false;
  });

  // Tel con modifica attiva in Preguntas → nasconde il messaggio COCINA da Pedidos
  const telsInPreguntas = useMemo(() => {
    const s = new Set();
    waMsgsPreguntas.forEach(m => s.add(String(m.wa_id||m.tel||"").replace("+","")));
    return s;
  }, [waMsgsPreguntas]);

  const waMsgsOrdini = waMsgs.filter(m => {
    if (m._botOnly) return false;
    const tel = String(m.wa_id||m.tel||"").replace("+","");
    // Se il cliente ha una modifica attiva in Preguntas, nascondi il suo COCINA da Pedidos
    if (m.stato === "COCINA" && telsInPreguntas.has(tel)) return false;
    // NUEVO → Pedidos (con o senza ordine_ref)
    if (m.stato === "NUEVO") return true;
    // COCINA → Pedidos (già confermato, senza modifiche attive)
    if (m.stato === "COCINA") return true;
    return false;
  });

  const waNoLei   = waMsgsOrdini.filter(m=>!m.leido&&(m.stato==="NUEVO"||!m.stato)).length;
  const pregNoLei = waMsgsPreguntas.filter(m=>!m.leido).length;
  const waTotBadge = waNoLei + pregNoLei;
  const listosN  = useMemo(() => ordenes.filter(o=>o.estado===ORDER_STATES.LISTO || o.estado===ORDER_STATES.EN_ENTREGA).length, [ordenes]);
  const cocinaNC = useMemo(() => ordenes.filter(o=>o.estado===ORDER_STATES.EN_COCINA).length, [ordenes]);
  const totPizze  = useMemo(() => caricoTotale(ordenes), [ordenes]);
  const pctCarico = Math.min(100, Math.round((totPizze / MAX_PIZZE_ORA) * 100));
  const caricoCol = pctCarico >= 90 ? "#C0392B" : pctCarico >= 65 ? "#E67E22" : "#27AE60";
  const caricoLbl = pctCarico >= 90 ? "SATURO" : pctCarico >= 65 ? "Cargado" : "Libre";
  const ordineImpossibile = pctCarico >= 90 && waMsgsOrdini.some(m=>!m.stato||m.stato==="NUEVO");

  const handleTabChange = useCallback((t) => setTab(t), []);

  const confirmaOrdine = async (id) => {
    notify("✅ " + id + " → Cocina");
    const orden = ordenes.find(o => o.id === id);
    const intent = buildEnCocinaTransition(orden, {
      component: "ServicioPage",
      action: "confirmaOrdine",
    });
    logTransition(intent);
    await optimisticOrden(id, { estado: ORDER_STATES.EN_COCINA }, async () => {
      try { await api.updateEstado(id, ORDER_STATES.EN_COCINA); }
      catch(err) { console.error("confirmaOrdine error:", err); }
    });
  };

  const forzaEntrega = async (id) => {
    notify("🛵 " + id + " → Forzado a repartidor");
    let failed = false;
    const orden = ordenes.find(o => o.id === id);
    const intent = buildEnEntregaTransition(orden, {
      component: "ServicioPage",
      action: "forzaEntrega",
      metadata: { legacyBypass: true },
    });
    logLegacyBypass({
      component: "ServicioPage",
      action: "forzaEntrega",
      orderId: id,
      from: intent.from,
      to: ORDER_STATES.EN_ENTREGA,
      metadata: { reason: "operatore forza invio al repartidor" },
    });
    logTransition(intent);
    await optimisticOrden(id, { estado: ORDER_STATES.EN_ENTREGA }, async () => {
      try { await api.marcarEnEntrega(id); }
      catch(err) {
        failed = true;
        console.error("forzaEntrega:", err);
      }
    });
    if (failed) {
      logRollback({
        component: "ServicioPage",
        action: "forzaEntrega.rollback",
        orderId: id,
        from: ORDER_STATES.EN_ENTREGA,
        to: ORDER_STATES.LISTO,
        metadata: { reason: "api.marcarEnEntrega failed" },
      });
      setOrdenes(p=>p.map(o=>o.id===id?{...o,estado:ORDER_STATES.LISTO}:o));
      notify("❌ Error al forzar entrega", "#E8341C");
    }
  };

  const addOrden  = async (o) => {
    // Ottimistico: ID locale temporaneo + _temp:true → il bottone "🚀 A Cocina"
    // resta grigio finché il backend non conferma con l'ID reale.
    const creationIntent = buildOperatorOrderCreationIntent(o, {
      component: "ServicioPage",
      action: "addOrden",
    });
    logOrderCreation(creationIntent);
    setOrdenes(p=>[{...o, _temp:true},...p]);
    const canalLabel = o.canal==="BANCO" ? "Barra" : "Tel";
    notify("✅ " + canalLabel + " (guardando…)");
    if (o.canal==="MANUAL") setTab("manual");
    else if (o.canal==="BANCO") setTab("banco");
    try {
      // STRICT: throw se Railway non risponde con un id valido. L'idempotency
      // key (o.client_req_id) protegge da duplicati in caso di retry.
      const res = await api.createOrden(o);
      setOrdenes(p=>p.map(x=>x.id===o.id?{...x,id:res.id,_temp:false}:x));
      notify("✅ " + res.id + " → " + canalLabel);
    } catch(err) {
      // ROLLBACK: l'ordine fantasma viene rimosso dallo state. Il pizzaiolo
      // NON deve vedere ordini senza backing DB. Vedi audit CL4SBU del 14/05/2026.
      console.error("createOrden failed, rolling back:", err);
      setOrdenes(p=>p.filter(x=>x.id!==o.id));
      try { Suoni.errore(); } catch(_){}
      notify("❌ Error al guardar — vuelve a crear el pedido", "#E8341C");
    }
  };
  const waConfirm = useCallback(async (id,items,hora,nombre,tel,nuovaHora) => {
    const msgCorrente = waMsgs.find(m => m.id === id);
    const ordenRef = msgCorrente?.ordine_ref || "";
    // Previene doppio invio: blocca solo se già COCINA e non c'è un ordine POR_CONFIRMAR da mandare
    if (msgCorrente && msgCorrente.stato === "COCINA" && !ordenRef) return;
    const waId = String(msgCorrente?.wa_id || tel || "").replace("+","");

    // Aggiorna UI immediatamente
    setWaMsgs(p => p.map(m => m.id===id ? {...m, leido:true, stato:"COCINA"} : m));

    if (ordenRef) {
      // ── Ordine già creato dal backend come POR_CONFIRMAR ──
      // L'operatore conferma → sposta a EN_COCINA
      // Se nuovaHora: operatore ha scelto "Sposta slot" — aggiorna ora prima di mandare in cucina
      const oraFinale = nuovaHora || hora;
      Suoni.conferma();
      notify("✅ " + ordenRef + " → Cocina" + (nuovaHora ? " (" + nuovaHora + ")" : ""));
      const orden = ordenes.find(o => o.id === ordenRef);
      const intent = buildEnCocinaTransition(orden, {
        component: "ServicioPage",
        action: "waConfirm",
        metadata: { waMsgId: id, nuovaHora: !!nuovaHora },
      });
      logTransition(intent);
      await optimisticOrden(ordenRef, { estado: ORDER_STATES.EN_COCINA, hora: oraFinale }, async () => {
        try {
          if (nuovaHora) {
            await api.post({action:"updateOrden", id:ordenRef, hora:nuovaHora});
          }
          await api.updateEstado(ordenRef, ORDER_STATES.EN_COCINA);
          await api.post({action:"updateWaStato", id:msgCorrente.id, stato:"COCINA", ordine_ref:ordenRef});
          if (waId) blockedTels.current[waId] = Date.now() + 60000;
        } catch(err) {
          console.error("waConfirm updateEstado error:", err);
        }
      });
    } else {
      // ── Nessun ordine pre-creato (es. attesa ora poi operatore conferma) ──
      // Crea ordine EN_COCINA (l'operatore sta confermando)
      const tempId = genId();
      const reqId = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : ("req-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10));
      const newOrden = {
        id: tempId, client_req_id: reqId, nombre, tel, wa_id: waId, canal: "WA",
        items, nota: "", nota_cucina: "", hora,
        ts: Date.now(), estado: ORDER_STATES.EN_COCINA,
        _temp: true
      };
      const creationIntent = buildWaOrderCreationIntent({
        tempId,
        clientReqId: reqId,
        waMsgId: id,
        waId,
        hora,
        items,
        component: "ServicioPage",
        action: "waConfirm.createOrder",
      });
      logOrderCreation(creationIntent);
      setOrdenes(p => [newOrden, ...p]);
      Suoni.conferma();
      notify("✅ Cocina (guardando…)");
      try {
        // STRICT: throw se Railway non conferma con un id. Vedi api.confirmarWa.
        const res = await api.confirmarWa(id, items, hora, nombre, tel, reqId);
        setOrdenes(p => p.map(o => o.id === tempId ? {...o, id: res.id, _temp: false} : o));
        notify("✅ " + res.id + " → Cocina");
        if (waId) blockedTels.current[waId] = Date.now() + 60000;
      } catch(err) {
        // ROLLBACK su tutto: nessun ordine fantasma in cucina + ripristina wa_msgs
        // a "NUEVO" così il messaggio torna in lista per un nuovo tentativo.
        console.error("confirmarWa failed, rolling back:", err);
        setOrdenes(p => p.filter(o => o.id !== tempId));
        setWaMsgs(p => p.map(m => m.id === id ? {...m, leido: false, stato: "NUEVO"} : m));
        try { Suoni.errore(); } catch(_){}
        notify("❌ Error al mandar a cocina — vuelve a confirmar", "#E8341C");
      }
    }
  }, [waMsgs, ordenes]);
  const waManual = useCallback(id => { setWaMsgs(p=>p.map(m=>m.id===id?{...m,leido:true}:m)); notify("✋ Manual",C.giallo); }, []);

  const handleUpdateIaItems = useCallback((msgId, newItems) => {
    setWaMsgs(prev => prev.map(m => m.id === msgId
      ? {...m, ia: {...(m.ia||{}), items: newItems}}
      : m
    ));
  }, []);

  const waElimina = async (id, tel) => {
    const waId = String(tel||"").replace("+","");
    // _skip_backend_ = chiamata da handleConfermaOrdine — rimuovi solo dalla UI, no backend
    if (id === "_skip_backend_") {
      setWaMsgs(p => p.filter(m => {
        const mWaId = String(m.wa_id||m.tel||m.nombre||"").replace("+","");
        return mWaId !== waId;
      }));
      return;
    }
    setWaMsgs(p => p.map(m => m.id===id ? {...m, _eliminando:true} : m));
    notify("🗑 Eliminando...", C.rosso);
    try {
      // Elimina TUTTO per questo wa_id: WA_MSGS + CONV
      const res = await api.post({action:"eliminaConversazione", wa_id: waId});
      if (res && res.success !== false) {
        // Rimuovi tutti i messaggi di questo wa_id dalla UI
        setWaMsgs(p => p.filter(m => {
          const mWaId = String(m.wa_id || m.tel || m.nombre || "").replace("+","");
          return mWaId !== waId;
        }));
        // Blocca polling per 120s
        blockedTels.current[waId] = Date.now() + 120000;
        notify("🗑 Conversación eliminada", C.rosso);
      } else {
        setWaMsgs(p => p.map(m => m.id===id ? {...m, _eliminando:false} : m));
        notify("❌ Error al eliminar", C.rosso);
      }
    } catch(err) {
      setWaMsgs(p => p.map(m => m.id===id ? {...m, _eliminando:false} : m));
      notify("❌ Error al eliminar", C.rosso);
    }
  };

  const waRispondi = async (tel, testo) => {
    notify("📤 Enviando...",C.wa);
    try {
      const res = await api.post({action:"rispondiWA", wa_id:tel, testo:testo});
      if(res.success) {
        notify("✅ Mensaje enviado",C.wa);
        // Trova l'ultimo messaggio del tel per salvare bot_risposta
        const msgsDaTel = waMsgs.filter(m => {
          const mTel = String(m.wa_id||m.tel||"").replace("+","");
          const targetTel = String(tel||"").replace("+","");
          return mTel === targetTel && mTel !== "";
        }).sort((a,b)=>Number(b.ts||0)-Number(a.ts||0));
        if(msgsDaTel.length > 0) {
          const lastMsg = msgsDaTel[0];
          // Aggiorna UI: metti bot_risposta sull'ultimo messaggio del thread
          // Se il messaggio GIÀ ha un bot_risposta, crea un record sintetico
          // così ogni invio appare come bolla separata nella chat
          if (lastMsg.bot_risposta && lastMsg.bot_risposta.length > 0) {
            // L'ultimo msg ha già una risposta bot → aggiungi record sintetico
            const syntheticId = "bot_" + Date.now();
            const nombre = lastMsg.nombre || "";
            setWaMsgs(p => [...p, {
              id: syntheticId, nombre, tel,
              txt: "", // nessun testo cliente — solo risposta bot
              ts: Date.now(), stato: lastMsg.stato || "NUEVO",
              ago: "ahora", leido: true,
              ia: lastMsg.ia || { conf: 0, items: [], hora: "", nota: "" },
              bot_risposta: testo,
              _botOnly: true // flag per non mostrare bolla cliente vuota
            }]);
          } else {
            // L'ultimo msg non ha ancora risposta bot → aggiorna quello
            setWaMsgs(p => p.map(m => m.id===lastMsg.id ? {...m, bot_risposta:testo} : m));
          }
          api.post({action:"aggiornaRispostaBot", id:lastMsg.id, bot_risposta:testo});
        }
      } else notify("❌ Error al enviar",C.rosso);
    } catch(err) { notify("❌ Error al enviar",C.rosso); }
  };

  const waAddicion = async (msgId, ordenRef, itemsNuevos, ordenEstado, replace = false) => {
    notify(replace ? "🔄 Actualizando pedido..." : "➕ Añadiendo al pedido...", C.orange);
    try {
      const ordenAttuale = ordenes.find(o => o.id === ordenRef);
      if (!ordenAttuale) { notify("❌ Ordine non trovato", C.rosso); return; }
      const itemsEsistenti = ordenAttuale.items || [];
      // replace=true (modifica_complessa): sostituisce l'ordine
      // replace=false (aggiunta): merge classico
      const merged = replace ? [...(itemsNuevos||[])] : (() => {
        const m = [...itemsEsistenti];
        (itemsNuevos||[]).forEach(ni => {
          const ex = m.find(x => x.n === ni.n);
          if (ex) ex.q = (Number(ex.q)||1) + (Number(ni.q)||1);
          else m.push(ni);
        });
        return m;
      })();
      const res = await api.post({ action:"updateOrden", id:ordenRef, items:merged, nota:ordenAttuale.nota||"", hora:ordenAttuale.hora||"" });
      if (res && res.success !== false) {
        setOrdenes(prev => prev.map(o => o.id === ordenRef ? {...o, items: merged} : o));
        // Trova il tel del messaggio per bloccare il polling
        const msgObj = waMsgs.find(m => m.id === msgId);
        const telNorm = String(msgObj?.wa_id||msgObj?.tel||"").replace("+","");
        if (telNorm) blockedTels.current[telNorm] = Date.now() + 60000;
        // Chiude la Pregunta → COMPLETATO sparisce da Preguntas, il COCINA riappare in Pedidos
        setWaMsgs(p => p.map(m => m.id === msgId
          ? {...m, stato:"COMPLETATO"}
          : m
        ));
        await api.post({ action:"updateWaStato", id:msgId, stato:"COMPLETATO" });
        notify("✅ ¡Adición confirmada!", C.verde);
        // Invia riepilogo COMPLETO al cliente via WhatsApp
        const hora = ordenAttuale.hora ? "\nRecogida: " + ordenAttuale.hora : "";
        const tipoConsegnaAct = ordenAttuale.tipo_consegna || "RITIRO";
        const cleanMerged = merged.filter(it => it.n !== "Entrega a domicilio");
        const sumItems = cleanMerged.reduce((s, it) => s + (Number(it.p)||0) * (Number(it.q)||1), 0);
        const deliveryFee = tipoConsegnaAct === "DOMICILIO" ? 2.50 : 0;
        const tot = sumItems + deliveryFee;
        const resumen = cleanMerged.map(it =>
          (it.e||"🍕") + " " + (it.q||1) + "x " + it.n +
          " — " + ((Number(it.p)||0) * (Number(it.q)||1)).toFixed(2) + "eur"
        ).join("\n");
        const deliveryLine = tipoConsegnaAct === "DOMICILIO" ? "\n🛵 Entrega a domicilio — 2,50eur" : "";
        const botMsg = "✅ Pedido actualizado\n\n" + resumen + deliveryLine + "\n\n*Total: " + tot.toFixed(2) + "eur*" + hora;
        if (telNorm) {
          await api.post({ action: "rispondiWA", wa_id: telNorm, testo: botMsg });
          await api.post({ action: "aggiornaRispostaBot", id: msgId, bot_risposta: botMsg });
        }
        if (ordenEstado === ORDER_STATES.LISTO) notify("⚠️ Pedido ya LISTO — avisa al cliente!", C.orange);
      } else { notify("❌ Error al añadir", C.rosso); }
    } catch(err) { console.error("waAddicion:", err); notify("❌ Error al añadir", C.rosso); }
  };

  const setListo = async (id) => {
    Suoni.conferma();
    const orden = ordenes.find(o => o.id === id);
    const intent = buildListoTransition(orden, {
      component: "ServicioPage",
      action: "setListo",
    });
    logTransition(intent);
    try {
      const res = await api.updateEstado(id, ORDER_STATES.LISTO);
      if (!res || !res.success) {
        notify("❌ Errore — riprova", C.rosso);
      } else {
        setOrdenes(prev => prev.map(o => o.id===id ? {...o, estado:ORDER_STATES.LISTO} : o));
        notify("✅ Pizza lista!", C.verde);
      }
    } catch(err) {
      console.error("setListo:", err);
      notify("❌ Errore di rete — riprova", C.rosso);
    }
  };
  const modificaOrden = async (o) => {
    setOrdenModifica(null);
    notify("✏️ Ordine aggiornato",C.blu);
    logLegacyBypass({
      component: "ServicioPage",
      action: "modificaOrden",
      orderId: o.id,
      to: o.estado,
      metadata: { reason: "modal può inviare stato arbitrario insieme ai dati ordine" },
    });
    observeOrderTransition("modificaOrden", o.id, o.estado);
    // patch ottimistico completo: items/hora/nota/zona/estado restano sopra il backend
    // finché entrambe le PATCH (updateEstado + updateOrden) hanno committato.
    const patch = {
      estado: o.estado, items: o.items, nota: o.nota, hora: o.hora,
      ...(o.tipo_consegna === "DOMICILIO" ? {
        direccion: o.direccion ?? null,
        zona: o.zona ?? null,
        zona_lat: o.zona_lat ?? null,
        zona_lon: o.zona_lon ?? null,
        zona_manuale: !!o.zona_manuale
      } : {})
    };
    await optimisticOrden(o.id, patch, async () => {
      try {
        await Promise.all([
          api.updateEstado(o.id, o.estado),
          api.post({ action:"updateOrden", id:o.id,
            items: o.items, nota: o.nota, hora: o.hora,
            ...(o.tipo_consegna === "DOMICILIO" ? {
              direccion: o.direccion ?? null,
              zona: o.zona ?? null,
              zona_lat: o.zona_lat ?? null,
              zona_lon: o.zona_lon ?? null,
              zona_manuale: !!o.zona_manuale
            } : {})
          })
        ]);
      } catch(err) { console.error("modificaOrden:", err); }
    });
  };

  const setRetirado = async (id, metodo_pago = "", descuento = null) => {
    const orden = ordenes.find(o => o.id === id);
    const telNorm = orden ? String(orden.tel||"").replace("+","") : "";
    const intent = buildRetiradoTransition(orden, {
      component: "ServicioPage",
      action: "setRetirado",
      metadata: { metodo_pago: metodo_pago || "", hasDescuento: !!descuento },
    });
    logTransition(intent);

    try {
      const res = await api.updateEstado(id, ORDER_STATES.RETIRADO, metodo_pago || "", descuento);
      if (!res || res.error) {
        notify("❌ Errore — riprova", C.rosso);
        return;
      }
      // Il backend cascade in cambiaStato("RETIRADO") aggiorna estado + metodo_pago +
      // cobrado + hora_entrega + eventuale descuento (totale ricalcolato), e marca
      // conv→ritirata + wa_msgs→COMPLETATO atomicamente.
      // Update ottimistico: il backend è autoritativo sul totale finale — il polling lo riallinea.
      setOrdenes(prev => prev.map(o => o.id === id ? {...o, estado:ORDER_STATES.RETIRADO, metodo_pago} : o));
      if (orden && orden.canal === "WA" && telNorm) {
        setWaMsgs(prev => prev.map(m => {
          const mTel = String(m.tel||"").replace("+","");
          return mTel === telNorm ? {...m, stato:"COMPLETATO"} : m;
        }));
      }
      notify("🛍 Retirado — Buon appetito!", C.verde);
    } catch(err) {
      console.error("setRetirado:", err);
      notify("❌ Errore di rete — riprova", C.rosso);
    }
  };

  const eliminaOrdine = async (id) => {
    notify("🗑 Pedido eliminado", C.rosso);
    await optimisticDelete(id, async () => {
      try { await api.eliminaOrdine(id); }
      catch(err) { console.error("eliminaOrdine:", err); }
    });
  };

  // Tab — WA (con sub-tab interni), Tel, Banco, Listos, Cocina
  const bancoN  = useMemo(() => ordenes.filter(o=>o.canal==="BANCO" &&(o.estado===ORDER_STATES.POR_CONFIRMAR||o.estado===ORDER_STATES.EN_COCINA)).length, [ordenes]);
  const manualN   = useMemo(() => ordenes.filter(o=>o.canal==="MANUAL"&& o.estado===ORDER_STATES.POR_CONFIRMAR).length, [ordenes]);
  const entregasN = useMemo(() => ordenes.filter(o=>
    o.tipo_consegna==="DOMICILIO" && !isCompletedState(o.estado)
  ).length, [ordenes]);

  const isPizzaItem = (it) => {
    if (!it || !it.n) return false;
    if (it.n === "Entrega a domicilio") return false;
    const cat = it.cat || "Pizzas";
    if (cat === "Bebidas") return false;
    if (cat === "Postres" && it.n !== "Pizza Nutella") return false;
    return true;
  };
  const pizzeFatteStasera = useMemo(() => ordenes
    .filter(o => [ORDER_STATES.LISTO, ORDER_STATES.EN_ENTREGA, ORDER_STATES.RETIRADO].includes(o.estado))
    .reduce((sum, o) => sum + (Array.isArray(o.items)?o.items:[]).filter(isPizzaItem).reduce((s,it)=>s+(parseInt(it.q)||1),0), 0),
  [ordenes]);
  const pizzeConsegnateStasera = useMemo(() => ordenes
    .filter(o => o.estado === ORDER_STATES.RETIRADO && o.tipo_consegna === "DOMICILIO")
    .reduce((sum, o) => sum + (Array.isArray(o.items)?o.items:[]).filter(isPizzaItem).reduce((s,it)=>s+(parseInt(it.q)||1),0), 0),
  [ordenes]);

  const TABS = useMemo(() => [
    {id:"wa",       icon:"💬", label:"WhatsApp", badge:{n:waTotBadge, c:C.wa}},
    {id:"manual",   icon:"📞", label:"Tel",      badge:{n:manualN,    c:C.blu}},
    {id:"banco",    icon:"🏪", label:"Barra",    badge:{n:bancoN,     c:C.avana}},
    {id:"listos",   icon:"✅", label:"Listos",   badge:{n:listosN,    c:C.verde}},
    {id:"cocina",   icon:"🍕", label:"Cocina",   badge:{n:cocinaNC,   c:C.orange}},
    {id:"entregas", icon:"🛵", label:"Entregas", meta: pizzeConsegnateStasera > 0 ? `${pizzeConsegnateStasera} pz ✓` : null, badge:{n:entregasN,  c:"#F97316"}},
  ], [waTotBadge, bancoN, manualN, listosN, cocinaNC, entregasN, pizzeConsegnateStasera]);

  const tabContent = () => {
    if(tab==="wa")     return <TabWA
      msgsOrdini={waMsgsOrdini}
      msgsPreguntas={waMsgsPreguntas}
      allMsgs={waMsgs}
      ordenes={ordenes}
          onConfirm={waConfirm}
      onManual={(id,n,t)=>{ waManual(id); setPrefillCliente({nombre:n,tel:t}); setShowNuevo(true); }}
      onElimina={waElimina}
      onRispondi={waRispondi}
      onAddicion={waAddicion}
      onConfirmaDaConfermare={async (nombre, tel, ordine, nuoviItems, msgId) => {
        // L'Agente aveva pre-creato POR_CONFIRMAR — operatore ha risposto da Preguntas
        // L'ordine resta in POR_CONFIRMAR: solo il click esplicito "A Cocina" lo manda in cucina
        const telNorm = String(tel||"").replace("+","");
        // Se ordine è null (es. risposta a domanda senza ordine), segna solo COMPLETATO e basta
        if (!ordine) {
          if (msgId) {
            setWaMsgs(p => p.map(m => m.id===msgId ? {...m, stato:"COMPLETATO"} : m));
            api.post({action:"updateWaStato", id:msgId, stato:"COMPLETATO"})
              .catch(e => console.warn("[onConfirmaDaConfermare] updateWaStato COMPLETATO fallito:", e?.message || e));
          }
          notify("✅ Risposta inviata");
          return;
        }
        const ordenId = ordine.id;
        // Items finali: nuoviItems (dalla chat) se presenti, altrimenti base ordine
        const itemsBase = ordine.items || [];
        const itemsFinali = nuoviItems && nuoviItems.length > 0 ? nuoviItems : itemsBase;
        // Aggiorna items nella UI (ordine resta POR_CONFIRMAR → l'operatore lo manda in cucina da Pedidos)
        if (nuoviItems && nuoviItems.length > 0) {
          setOrdenes(p => p.map(o => o.id===ordenId ? {...o, items:itemsFinali} : o));
        }
        // IN_TRATTAMENTO → NUEVO: scompare da Preguntas, appare in Pedidos con ordine_ref già presente
        if (msgId) {
          setWaMsgs(p => p.map(m => m.id===msgId ? {...m, stato:"NUEVO"} : m));
        }
        // Blocca polling SUBITO — prima degli await, evita race condition WebSocket
        blockedTels.current[telNorm] = Date.now() + 60000;
        Suoni.conferma();
        notify("✅ Respuesta enviada — confirma desde Pedidos para enviar a cocina");
        try {
          if (nuoviItems && nuoviItems.length > 0) {
            await api.post({action:"updateOrden", id:ordenId, items:itemsFinali, hora:ordine.hora});
          }
          if (msgId) {
            api.post({action:"updateWaStato", id:msgId, stato:"NUEVO"})
              .catch(e => console.warn("[onConfirmaDaConfermare] updateWaStato NUEVO fallito:", e?.message || e));
          }
        } catch(err) { console.error("confirmaDaConfermare error:", err); }
        setGoToPedidosSignal(s => s+1);
      }}
      onCreaOrdenFromChat={async (nombre,tel,items,hora,direccion,tipoConsegna,zona_manuale)=>{
        if(items && items.length > 0) {
          const telNorm = String(tel||"").replace("+","");
          // Blocca polling per questo tel per 60s — evita race condition col backend
          blockedTels.current[telNorm] = Date.now() + 60000;

          if (zona_manuale && tipoConsegna === "DOMICILIO") {
            // Operatore ha assegnato la zona manualmente: crea l'ordine direttamente con
            // zona_manuale=true e lat/lon=null. Il backend usa tempoGiro della zona come fallback.
            try {
              const ordId = await api.createOrden({
                nombre, tel, wa_id: telNorm, canal: "WA",
                items, hora, nota: "",
                tipo_consegna: "DOMICILIO",
                direccion: direccion || null,
                zona: zona_manuale,
                zona_lat: null, zona_lon: null,
                zona_manuale: true,
                durata_andata_min: null,
                estado: ORDER_STATES.POR_CONFIRMAR,
                client_req_id: `zm_${telNorm}_${Date.now()}`
              });
              setWaMsgs(p => p.map(m => {
                const mTel = String(m.wa_id||m.tel||"").replace("+","");
                if (mTel === telNorm && mTel !== "" && m.stato === "IN_TRATTAMENTO") {
                  return {...m, stato: "NUEVO", ordine_ref: ordId, ia: {
                    ...(m.ia||{}), conf:100, items, hora: hora||"",
                    ...(direccion ? {direccion} : {}),
                    tipo_consegna: "DOMICILIO", zona_manuale,
                  }};
                }
                return m;
              }));
              notify(`✅ Zona ${zona_manuale} assegnata — ordine creato, confermare da Pedidos`);
            } catch(e) {
              console.error("createOrden zona_manuale failed:", e);
              notify("❌ Errore creazione ordine — riprova");
            }
          } else {
            // Nessuna zona manuale: sposta a Pedidos per revisione tramite NuevoPedidoModal
            setWaMsgs(p => p.map(m => {
              const mTel = String(m.wa_id||m.tel||"").replace("+","");
              if (mTel === telNorm && mTel !== "" && m.stato === "IN_TRATTAMENTO") {
                return {...m, stato: "NUEVO", ia: {
                  ...(m.ia||{}), conf:100, items, hora: hora||"",
                  ...(direccion ? {direccion} : {}),
                  ...(tipoConsegna ? {tipo_consegna: tipoConsegna} : {}),
                }};
              }
              return m;
            }));
            notify("✅ Movido a Pedidos — confirmar para enviar a Cocina");
          }
        } else {
          setPrefillCliente({nombre,tel});
          setShowNuevo(true);
        }
      }}
      initialSel={chatStoricoSel}
      onUpdateIaItems={handleUpdateIaItems}
      onNuevoPedido={(nombre, tel) => { setPrefillCliente({nombre, tel}); setGoToPedidosSignal(s => s+1); setShowNuevo(true); }}
      goToPedidosSignal={goToPedidosSignal}
      onMoveToNuevo={async (msgId, nombre, tel) => {
        const telNorm = String(tel||"").replace("+","");
        // Blocca polling PRIMA di qualsiasi api.post per evitare race condition col WebSocket
        blockedTels.current[telNorm] = Date.now() + 60000;
        // Aggiorna stato locale: tutti i messaggi IN_TRATTAMENTO di questo tel → NUEVO
        setWaMsgs(p => p.map(m => {
          const mTel = String(m.wa_id||m.tel||"").replace("+","");
          if (mTel === telNorm && m.stato === "IN_TRATTAMENTO") return {...m, stato:"NUEVO"};
          return m;
        }));
        await api.post({action:"updateWaStato", id:msgId, stato:"NUEVO"})
          .catch(e => console.warn("[onMoveToNuevo] updateWaStato fallito:", e?.message || e));
        // Switcha a sub-tab Pedidos
        setGoToPedidosSignal(s => s+1);
      }}
      goToPreguntasSignal={goToPreguntasSignal}
      onMoveToPreguntas={(msgId, tel) => {
        const telNorm = String(tel||"").replace("+","");
        blockedTels.current[telNorm] = Date.now() + 60000;
        setWaMsgs(p => p.map(m => {
          const mTel = String(m.wa_id||m.tel||"").replace("+","");
          if (mTel === telNorm && (m.stato === "NUEVO" || m.stato === "COCINA")) return {...m, stato:"IN_TRATTAMENTO"};
          return m;
        }));
        api.post({action:"updateWaStato", id:msgId, stato:"IN_TRATTAMENTO"})
          .catch(e => console.warn("[onMoveToPreguntas] updateWaStato fallito:", e?.message || e));
        setGoToPreguntasSignal(s => s+1);
      }}
    />;
    if(tab==="manual") return <TabManual ordenes={ordenes} onModifica={setOrdenModifica} onElimina={eliminaOrdine} onConfirm={confirmaOrdine} onForzarEntrega={forzaEntrega} vipIds={vipIds}/>;
    if(tab==="banco")  return <TabBanco  ordenes={ordenes} onModifica={setOrdenModifica} onElimina={eliminaOrdine} onConfirm={confirmaOrdine} onForzarEntrega={forzaEntrega} vipIds={vipIds}/>;
    if(tab==="listos") return <TabListos ordenes={ordenes} onRetirado={setRetirado} loadingIds={loadingIds}
      vipIds={vipIds}
      waMsgs={waMsgs}
      onCambiaPago={async (id, nuovoMetodo) => {
        logLegacyBypass({
          component: "ServicioPage",
          action: "onCambiaPago",
          orderId: id,
          to: ORDER_STATES.RETIRADO,
          metadata: { reason: "updateEstado usato anche per modificare metodo pagamento", nuovoMetodo },
        });
        observeOrderTransition("onCambiaPago", id, ORDER_STATES.RETIRADO, { nuovoMetodo });
        setOrdenes(prev => prev.map(o => o.id===id ? {...o, metodo_pago: nuovoMetodo} : o));
        try { await api.updateEstado(id, ORDER_STATES.RETIRADO, nuovoMetodo); }
        catch(err) { console.error("cambiaPago:", err); }
      }}
      onViewChat={(waId) => {
        const msg = waMsgs.find(m => String(m.wa_id||m.tel||"").replace("+","") === String(waId||"").replace("+",""));
        if (msg) { setChatStoricoSel(msg.id); setTab("wa"); }
      }}/>;
    if(tab==="cocina")   return <TabCocina ordenes={ordenes} onListo={setListo} loadingIds={loadingIds} msgsPreguntas={waMsgsPreguntas} pizzeFatte={pizzeFatteStasera}/>;
    if(tab==="entregas") return <TabEntregas ordenes={ordenes} setOrdenes={setOrdenes} notify={notify}/>;
    return null;
  };

  return (
    <div style={{background:C.nero,height:"100vh",overflow:"hidden",display:"flex",
      flexDirection:"column",animation:"fadeIn .3s ease"}}>
      <DevPresence/>

      {/* ── HEADER glass 3D ── */}
      <div style={{
        background:"rgba(14,14,14,0.82)",
        backdropFilter:"blur(32px) saturate(1.8) brightness(1.05)",
        WebkitBackdropFilter:"blur(32px) saturate(1.8) brightness(1.05)",
        borderBottom:"1px solid rgba(255,255,255,0.08)",
        boxShadow:"0 4px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.2)",
        padding:"10px 14px 8px",
        position:"sticky",top:0,zIndex:200,flexShrink:0
      }}>
        {/* Shimmer line top */}
        <div style={{position:"absolute",top:0,left:"5%",right:"5%",height:1,
          background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)",
          pointerEvents:"none"}}/>
        {/* Glass highlight */}
        <div style={{position:"absolute",top:0,left:0,right:0,height:"50%",
          background:"linear-gradient(180deg,rgba(255,255,255,0.07) 0%,transparent 100%)",
          pointerEvents:"none"}}/>

        <div style={{display:"flex",alignItems:"center",gap:8,position:"relative"}}>
          {/* Freccia indietro */}
          <button onClick={onBack} style={{
            background:"rgba(255,255,255,0.06)",
            border:"1px solid rgba(255,255,255,0.12)",
            borderRadius:10,width:32,height:32,
            display:"flex",alignItems:"center",justifyContent:"center",
            cursor:"pointer",color:"rgba(255,255,255,0.7)",fontSize:16,
            flexShrink:0, padding:0,
            transition:"background .15s"
          }}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.12)"}
          onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.06)"}
          title="Volver al inicio">←</button>

          {/* Logo = toggle webhook ON/OFF */}
          {(()=>{
            const isOn = webhookActive;
            const isOk = healthStatus === "ok";
            const isError = healthStatus === "error";
            const borderCol = !isOn ? "rgba(120,120,120,0.45)" : isError ? "rgba(220,30,30,0.9)" : isOk ? "rgba(232,52,28,0.75)" : "rgba(255,200,0,0.85)";
            const glowCol   = !isOn ? "none" : isError
              ? "0 0 28px rgba(220,30,30,0.8), 0 0 60px rgba(180,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)"
              : isOk
              ? "0 0 28px rgba(232,52,28,0.55), 0 0 60px rgba(200,30,8,0.25), inset 0 1px 0 rgba(255,255,255,0.15)"
              : "0 0 22px rgba(255,200,0,0.5), 0 0 50px rgba(200,150,0,0.2)";
            const imgFilter = !isOn
              ? "grayscale(1) brightness(0.45)"
              : "brightness(1.35) contrast(1.2) saturate(1.3) drop-shadow(0 0 10px rgba(255,60,20,0.8))";
            return (
              <button onClick={toggleWebhook} style={{
                width:50,height:50,borderRadius:14,overflow:"visible",flexShrink:0,
                background:"rgba(6,6,6,0.85)",
                border:`2px solid ${borderCol}`,
                boxShadow: glowCol,
                backdropFilter:"blur(12px)",
                WebkitBackdropFilter:"blur(12px)",
                display:"flex",alignItems:"center",justifyContent:"center",
                cursor:"pointer",padding:0,
                transition:"border-color .3s, box-shadow .3s",
                animation: (isOn && !isOk && !isError) ? "warnBlink 1.2s ease-in-out infinite" : "none"
              }}
              onMouseDown={e=>e.currentTarget.style.transform="scale(0.93)"}
              onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
              onTouchStart={e=>e.currentTarget.style.transform="scale(0.93)"}
              onTouchEnd={e=>e.currentTarget.style.transform="scale(1)"}
              title={isOn ? (isOk ? "Bot activo — toca para apagar" : "⚠ Railway sin respuesta") : "Bot APAGADO — toca para reactivar"}>
                <img src={LOGO_RED_SRC} style={{
                  width:"110%",height:"110%",objectFit:"contain",
                  filter: imgFilter,
                  transition:"filter .3s"
                }}/>
              </button>
            );
          })()}

          {/* Centro */}
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{fontSize:9,fontWeight:800,letterSpacing:"3px",
              textTransform:"uppercase",color:"rgba(255,255,255,0.3)",lineHeight:1,marginBottom:1}}>SERVICIO</div>
            <LiveTime/>
            {/* Barra carico forno */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,marginTop:4}}>
              <div style={{
                width:80,height:5,
                background:"rgba(255,255,255,0.08)",
                borderRadius:3,overflow:"hidden",
                border:"1px solid rgba(255,255,255,0.06)",
                boxShadow:"inset 0 1px 2px rgba(0,0,0,0.4)"
              }}>
                <div style={{
                  width:`${pctCarico}%`,height:"100%",
                  background:`linear-gradient(90deg,${caricoCol}88,${caricoCol})`,
                  borderRadius:3,
                  boxShadow:`0 0 6px ${caricoCol}88`,
                  transition:"width .6s ease"
                }}/>
              </div>
              <span style={{
                fontSize:10,fontWeight:800,letterSpacing:.3,
                color:caricoCol,
                textShadow:`0 0 10px ${caricoCol}88`
              }}>🔥 {pctCarico}% {caricoLbl}</span>
              {/* Sync dot */}
              <div style={{display:"flex",alignItems:"center",gap:3,marginLeft:4}}>
                <div style={{width:5,height:5,borderRadius:"50%",
                  background:syncStatus==="ok"?C.verde:syncStatus==="syncing"?C.giallo:C.rosso,
                  boxShadow:syncStatus==="ok"?`0 0 6px ${C.verde}cc`:"none",
                  animation:syncStatus==="syncing"?"pulse 1s infinite":"none"}}/>
                <span style={{fontSize:9,fontWeight:600,letterSpacing:.3,
                  color:syncStatus==="ok"?C.verde:syncStatus==="syncing"?C.giallo:"#888"}}>
                  {syncStatus==="ok"?"live":syncStatus==="syncing"?"sync":"off"}
                </span>
              </div>
              {/* AI Forza toggle */}
              <div onClick={toggleAiForza} style={{
                display:"flex",alignItems:"center",gap:3,marginLeft:6,
                background:aiForza==="STRONG"?"rgba(39,174,96,0.18)":"rgba(230,126,34,0.18)",
                border:`1px solid ${aiForza==="STRONG"?"#27AE6055":"#E67E2255"}`,
                borderRadius:7,padding:"2px 7px",cursor:"pointer",
                transition:"all .2s"
              }}>
                <span style={{fontSize:9,fontWeight:800,letterSpacing:.3,
                  color:aiForza==="STRONG"?"#27AE60":"#E67E22"}}>
                  🤖 {aiForza}
                </span>
              </div>
            </div>
          </div>

          {/* Bottone cucina — glass rosso */}
          <button onClick={()=>setShowCocina(true)} style={{
            background:"rgba(255,255,255,0.06)",
            backdropFilter:"blur(20px) saturate(1.6)",
            WebkitBackdropFilter:"blur(20px) saturate(1.6)",
            border:"1.5px solid rgba(232,52,28,0.55)",
            borderRadius:14,padding:"10px 12px",
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:"0 4px 18px rgba(232,52,28,0.28), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.2)",
            flexShrink:0,position:"relative",cursor:"pointer"}}>
            <div style={{position:"absolute",top:0,left:"10%",right:"10%",height:1,
              background:"linear-gradient(90deg,transparent,rgba(255,130,90,0.5),transparent)"}}/>
            <span style={{fontSize:22,lineHeight:1,filter:"drop-shadow(0 0 6px rgba(255,100,60,0.6))"}}>🍕</span>
            {cocinaNC>0&&<span style={{
              position:"absolute",top:-7,right:-7,
              background:`linear-gradient(135deg,${C.rosso},#A81808)`,
              border:"2px solid rgba(14,14,14,0.9)",
              color:"#fff",borderRadius:"50%",
              width:21,height:21,fontSize:11,fontWeight:900,
              display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow:`0 2px 8px ${C.rosso}88`
            }}>{cocinaNC}</span>}
          </button>
        </div>
      </div>

      {/* ── BANNER AUTO-KILL ── */}
      {!webhookActive && healthStatus !== "ok" && (
        <div style={{
          background:"rgba(180,0,0,0.92)", padding:"10px 16px",
          display:"flex", alignItems:"center", justifyContent:"space-between", gap:12,
          borderBottom:"2px solid #ff4444", flexShrink:0,
          animation:"warnBlink 1s ease-in-out infinite"
        }}>
          <span style={{color:"#fff", fontWeight:800, fontSize:13}}>
            ⛔ Bot desactivado automáticamente — Railway sin respuesta. Mensajes → tu WhatsApp.
          </span>
          <button onClick={toggleWebhook} style={{
            background:"#fff", color:"#B00000", border:"none",
            borderRadius:8, padding:"5px 12px", fontWeight:900, fontSize:12, cursor:"pointer", flexShrink:0
          }}>Riattiva</button>
        </div>
      )}

      {/* ── TAB BAR glass 3D ── */}
      <div style={{
        background:"rgba(10,10,10,0.78)",
        backdropFilter:"blur(28px) saturate(1.7)",
        WebkitBackdropFilter:"blur(28px) saturate(1.7)",
        borderBottom:"1px solid rgba(255,255,255,0.07)",
        boxShadow:"0 3px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)",
        padding:"8px 12px",
        display:"flex",gap:7,overflowX:"auto",flexShrink:0,
        position:"relative"
      }}>
        {/* Shimmer */}
        <div style={{position:"absolute",top:0,left:"4%",right:"4%",height:1,
          background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.10),transparent)",
          pointerEvents:"none"}}/>
        {TABS.map(t=>{
          const isOn = tab===t.id;
          return (
            <button key={t.id} onClick={()=>handleTabChange(t.id)} style={{
              flexShrink:0,
              position:"relative",
              background: isOn
                ? `linear-gradient(180deg, #FF6040 0%, #E8341C 30%, #A01808 100%)`
                : "rgba(255,255,255,0.055)",
              backdropFilter: isOn ? "none" : "blur(16px) saturate(1.5)",
              WebkitBackdropFilter: isOn ? "none" : "blur(16px) saturate(1.5)",
              border: isOn
                ? "2px solid #FF6644"
                : "1px solid rgba(255,255,255,0.08)",
              outline: isOn ? "3px solid rgba(232,52,28,0.50)" : "none",
              outlineOffset: isOn ? "2px" : "0px",
              borderRadius:99,
              padding:"8px 16px",
              display:"flex",alignItems:"center",gap:7,
              color: isOn ? "#fff" : "rgba(255,255,255,0.30)",
              fontWeight: isOn ? 900 : 400,
              fontSize:14,letterSpacing:.2,
              textShadow: isOn ? "0 1px 4px rgba(0,0,0,0.6)" : "none",
              boxShadow: isOn
                ? [
                    "0 0 20px rgba(255,80,40,0.75)",
                    "0 0 40px rgba(232,52,28,0.40)",
                    "0 6px 18px rgba(140,15,5,0.65)",
                    "inset 0 1px 0 rgba(255,230,200,0.65)",
                    "inset 0 -2px 0 rgba(0,0,0,0.50)"
                  ].join(", ")
                : "none",
              transition:"all .20s ease",whiteSpace:"nowrap",cursor:"pointer"}}>
              {/* Shimmer on active */}
              {isOn&&<div style={{position:"absolute",top:0,left:"10%",right:"10%",height:1,
                background:"linear-gradient(90deg,transparent,rgba(255,200,180,0.5),transparent)",
                borderRadius:1,pointerEvents:"none"}}/>}
              <span style={{fontSize:16,lineHeight:1}}>{t.icon}</span>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:1}}>
                <span>{t.label}</span>
                {t.meta&&<span style={{fontSize:9,fontWeight:700,opacity:.75,lineHeight:1}}>{t.meta}</span>}
              </div>
              {t.badge.n>0&&<Badge n={t.badge.n} c={isOn?"rgba(255,255,255,0.9)":t.badge.c}/>}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:"12px 14px 90px"}}>
        {/* ── Avviso forno saturo su tab WA ── */}
        {tab==="wa" && ordineImpossibile && (
          <div style={{
            marginBottom:12,
            background:"rgba(192,57,43,0.14)",
            backdropFilter:"blur(20px) saturate(1.6)",
            WebkitBackdropFilter:"blur(20px) saturate(1.6)",
            border:"1.5px solid rgba(192,57,43,0.55)",
            borderRadius:16,
            padding:"13px 16px",
            display:"flex",alignItems:"flex-start",gap:12,
            boxShadow:"0 4px 20px rgba(192,57,43,0.18), inset 0 1px 0 rgba(255,255,255,0.08)",
            position:"relative",overflow:"hidden"
          }}>
            <div style={{position:"absolute",top:0,left:"6%",right:"6%",height:1,
              background:"linear-gradient(90deg,transparent,rgba(255,100,80,0.4),transparent)",
              pointerEvents:"none"}}/>
            <span style={{fontSize:24,flexShrink:0,filter:"drop-shadow(0 0 8px rgba(255,80,60,0.7))"}}>🔴</span>
            <div style={{flex:1}}>
              <div style={{color:"#FF6B55",fontWeight:900,fontSize:14,marginBottom:3,letterSpacing:.2}}>
                FORNO SATURO — {pctCarico}% capacidad
              </div>
              <div style={{color:"rgba(255,200,190,0.8)",fontSize:12,lineHeight:1.5}}>
                Con {totPizze} pizza{totPizze!==1?"s":""} en curso, nuevos pedidos podrían retrasarse.
                Considera responder: <em>"En este momento tenemos alta demanda, el tiempo de espera es de 30-40 min."</em>
              </div>
            </div>
          </div>
        )}
        {tabContent()}
      </div>

      {/* Bottone NUEVO PEDIDO + Cerrar Servicio fixed bottom */}
      <div style={{
        position:"fixed",bottom:0,left:0,right:0,
        padding:"12px 14px 20px",
        background:`linear-gradient(to top, ${C.nero} 55%, transparent)`,
        zIndex:150,
        display:"flex",gap:10,alignItems:"stretch"}}>
        <button onClick={()=>{ setPrefillCliente(tab==="banco"?{canal:"BARRA"}:null); setShowNuevo(true); }} style={{
          flex:1,background:C.rosso,color:"#fff",
          border:"none",borderRadius:16,
          padding:"16px 0",
          fontWeight:900,fontSize:15,letterSpacing:"1.2px",
          display:"flex",alignItems:"center",justifyContent:"center",gap:9,
          boxShadow:`0 4px 22px ${C.rosso}55, inset 0 1px 0 rgba(255,130,90,0.22)`,
          textTransform:"uppercase",position:"relative",overflow:"hidden"}}>
          <span style={{position:"relative",fontSize:18}}>＋</span>
          <span style={{position:"relative"}}>NUEVO PEDIDO</span>
        </button>
        <button onClick={handleChiudiServizio} style={{
          flexShrink:0,
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius:16,
          padding:"16px 14px",
          display:"flex",alignItems:"center",justifyContent:"center",
          color: "rgba(255,255,255,0.45)",
          fontWeight:500,fontSize:20,
          cursor:"pointer",whiteSpace:"nowrap",transition:"all .18s ease"}}>
          🌙
        </button>
        <button onClick={()=>{ setPinChange({tipo:"operador",step:1,viejo:"",nuevo:"",confirm:"",error:"",ok:false,loading:false}); setShowCambioPin(true); }} style={{
          flexShrink:0,
          background:"rgba(255,255,255,0.07)",
          border:"1px solid rgba(255,255,255,0.12)",
          borderRadius:16,
          padding:"16px 14px",
          display:"flex",alignItems:"center",justifyContent:"center",
          color:"rgba(255,255,255,0.4)",
          fontSize:18, cursor:"pointer", transition:"all .18s ease"}}
          title="Cambiar PIN">
          🔑
        </button>
      </div>

      {/* Modal Cambiar PIN */}
      {showCambioPin && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#1F2937",borderRadius:20,padding:28,width:"100%",maxWidth:340,display:"flex",flexDirection:"column",alignItems:"center",gap:18}}>
            <div style={{fontSize:30}}>🔑</div>
            <div style={{color:"#fff",fontWeight:800,fontSize:18}}>Cambiar PIN</div>

            {/* Scelta tipo */}
            <div style={{display:"flex",gap:8,width:"100%"}}>
              {["operador","repartidor"].map(t => (
                <button key={t} onClick={()=>setPinChange(p=>({...p,tipo:t,viejo:"",nuevo:"",confirm:"",error:"",step:1}))} style={{
                  flex:1,padding:"10px 0",borderRadius:12,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,
                  background:pinChange.tipo===t?"#F97316":"rgba(255,255,255,0.1)",
                  color:pinChange.tipo===t?"#000":"rgba(255,255,255,0.6)"
                }}>{t==="operador"?"Operador":"Repartidor"}</button>
              ))}
            </div>

            {/* Step 1: PIN attuale */}
            {pinChange.step === 1 && (
              <>
                <div style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>PIN attuale ({pinChange.tipo})</div>
                <input type="password" inputMode="numeric" maxLength={6} value={pinChange.viejo}
                  onChange={e=>setPinChange(p=>({...p,viejo:e.target.value.replace(/\D/g,"").slice(0,6)}))}
                  placeholder="••••••"
                  style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"1px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.07)",color:"#fff",fontSize:22,textAlign:"center",letterSpacing:6,outline:"none"}}
                />
                {pinChange.error && <div style={{color:"#E8341C",fontSize:13}}>{pinChange.error}</div>}
                <button onClick={async()=>{
                  if(pinChange.viejo.length < 6){ setPinChange(p=>({...p,error:"El PIN tiene 6 dígitos"})); return; }
                  setPinChange(p=>({...p,loading:true,error:""}));
                  const r = await auth.login(pinChange.viejo, pinChange.tipo);
                  if(r.success){ setPinChange(p=>({...p,step:2,loading:false})); }
                  else { setPinChange(p=>({...p,loading:false,error:r.error||"PIN incorrecto"})); }
                }} disabled={pinChange.loading} style={{
                  width:"100%",padding:"14px 0",borderRadius:14,border:"none",
                  background:"#F97316",color:"#000",fontWeight:800,fontSize:15,cursor:"pointer"
                }}>{pinChange.loading?"Verificando…":"Verificar"}</button>
              </>
            )}

            {/* Step 2: Nuovo PIN */}
            {pinChange.step === 2 && (
              <>
                <div style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>Nuevo PIN (6 dígitos)</div>
                <input type="password" inputMode="numeric" maxLength={6} value={pinChange.nuevo}
                  onChange={e=>setPinChange(p=>({...p,nuevo:e.target.value.replace(/\D/g,"").slice(0,6)}))}
                  placeholder="••••••"
                  style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"1px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.07)",color:"#fff",fontSize:22,textAlign:"center",letterSpacing:6,outline:"none"}}
                />
                <div style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>Repite el nuevo PIN</div>
                <input type="password" inputMode="numeric" maxLength={6} value={pinChange.confirm}
                  onChange={e=>setPinChange(p=>({...p,confirm:e.target.value.replace(/\D/g,"").slice(0,6)}))}
                  placeholder="••••••"
                  style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"1px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.07)",color:"#fff",fontSize:22,textAlign:"center",letterSpacing:6,outline:"none"}}
                />
                {pinChange.error && <div style={{color:"#E8341C",fontSize:13}}>{pinChange.error}</div>}
                {pinChange.ok && <div style={{color:"#22C55E",fontSize:14,fontWeight:700}}>✅ PIN cambiado correctamente</div>}
                <button onClick={async()=>{
                  if(pinChange.nuevo.length < 6){ setPinChange(p=>({...p,error:"El nuevo PIN debe tener 6 dígitos"})); return; }
                  if(pinChange.nuevo !== pinChange.confirm){ setPinChange(p=>({...p,error:"Los PINs no coinciden"})); return; }
                  setPinChange(p=>({...p,loading:true,error:""}));
                  const chiave = pinChange.tipo === "repartidor" ? "REPARTIDOR_PIN" : "APP_PIN";
                  const res = await api.post({ action:"setConfig", chiave, valore: pinChange.nuevo });
                  if(res && res.success !== false){
                    setPinChange(p=>({...p,loading:false,ok:true}));
                    setTimeout(()=>setShowCambioPin(false), 1500);
                  } else {
                    setPinChange(p=>({...p,loading:false,error:"Error al guardar. Reintentar."}));
                  }
                }} disabled={pinChange.loading} style={{
                  width:"100%",padding:"14px 0",borderRadius:14,border:"none",
                  background:"#22C55E",color:"#000",fontWeight:800,fontSize:15,cursor:"pointer"
                }}>{pinChange.loading?"Guardando…":"Guardar nuevo PIN"}</button>
              </>
            )}

            <button onClick={()=>setShowCambioPin(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.3)",fontSize:13,cursor:"pointer"}}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Modal Chiudi Servizio */}
      {chiudiModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#1a1a2e",border:"1.5px solid rgba(255,255,255,0.13)",borderRadius:20,padding:28,maxWidth:420,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.7)"}}>
            <div style={{fontSize:22,fontWeight:900,color:"#fff",marginBottom:20}}>🌙 Cerrar servicio</div>

            {chiudiModal.loading ? (
              <div style={{color:"rgba(255,255,255,0.5)",textAlign:"center",padding:"24px 0"}}>Escaneando...</div>
            ) : (<>
              {/* Completati — sempre archiviati */}
              <div style={{background:"rgba(46,213,115,0.1)",border:"1px solid rgba(46,213,115,0.25)",borderRadius:12,padding:"12px 16px",marginBottom:12}}>
                <div style={{color:"#2ed573",fontWeight:700,fontSize:13,marginBottom:4}}>✅ Se archivarán y eliminarán</div>
                <div style={{color:"rgba(255,255,255,0.7)",fontSize:13}}>
                  {(chiudiModal.completati?.ordini || 0)} órdenes completados
                  {chiudiModal.completati?.conv > 0 ? ` · ${chiudiModal.completati.conv} conversaciones cerradas` : ""}
                </div>
              </div>

              {/* Attivi — operatore decide */}
              {chiudiModal.attivi.length > 0 ? (
                <div style={{background:"rgba(255,171,0,0.1)",border:"1px solid rgba(255,171,0,0.3)",borderRadius:12,padding:"12px 16px",marginBottom:20}}>
                  <div style={{color:"#ffab00",fontWeight:700,fontSize:13,marginBottom:8}}>
                    ⚠️ {chiudiModal.attivi.length} mensaje{chiudiModal.attivi.length>1?"s activos":"activo"} — ¿para mañana?
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:150,overflowY:"auto"}}>
                    {chiudiModal.attivi.map((a,i) => (
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,color:"rgba(255,255,255,0.8)",fontSize:12}}>
                        <span style={{background:"rgba(255,171,0,0.2)",borderRadius:6,padding:"2px 7px",fontWeight:700,color:"#ffab00",flexShrink:0}}>
                          {a.stato || "activo"}
                        </span>
                        <span style={{fontWeight:600}}>{a.nombre}</span>
                        {a.hora ? <span style={{color:"rgba(255,255,255,0.4)"}}>· {a.hora}</span> : null}
                      </div>
                    ))}
                  </div>
                  <div style={{color:"rgba(255,255,255,0.4)",fontSize:11,marginTop:8}}>
                    Verifica si son pedidos para mañana antes de eliminar.
                  </div>
                </div>
              ) : (
                <div style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"10px 16px",marginBottom:20}}>
                  <div style={{color:"rgba(255,255,255,0.45)",fontSize:13}}>No hay mensajes activos pendientes.</div>
                </div>
              )}

              {/* Bottoni */}
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {chiudiModal.attivi.length > 0 && (
                  <button onClick={()=>handleChiudiConferma(true)} style={{
                    background:"rgba(192,57,43,0.85)",border:"1.5px solid rgba(192,57,43,0.8)",
                    borderRadius:12,padding:"13px 16px",color:"#fff",fontWeight:800,
                    fontSize:13,cursor:"pointer",width:"100%"}}>
                    🗑️ Eliminar todo (incluso mensajes activos)
                  </button>
                )}
                <button onClick={()=>handleChiudiConferma(false)} style={{
                  background: chiudiModal.attivi.length > 0 ? "rgba(46,213,115,0.15)" : "rgba(192,57,43,0.85)",
                  border: chiudiModal.attivi.length > 0 ? "1.5px solid rgba(46,213,115,0.4)" : "1.5px solid rgba(192,57,43,0.8)",
                  borderRadius:12,padding:"13px 16px",
                  color: chiudiModal.attivi.length > 0 ? "#2ed573" : "#fff",
                  fontWeight:800,fontSize:13,cursor:"pointer",width:"100%"}}>
                  {chiudiModal.attivi.length > 0 ? "✅ Cerrar servicio (dejar mensajes activos)" : "✅ Confirmar — cerrar servicio"}
                </button>
                <button onClick={()=>setChiudiModal(null)} style={{
                  background:"transparent",border:"1px solid rgba(255,255,255,0.12)",
                  borderRadius:12,padding:"11px 16px",color:"rgba(255,255,255,0.4)",
                  fontWeight:600,fontSize:13,cursor:"pointer",width:"100%"}}>
                  Annulla
                </button>
              </div>
            </>)}
          </div>
        </div>
      )}

      {/* Modals */}
      <NuevoPedidoModal visible={showNuevo} onClose={()=>{setShowNuevo(false);setPrefillCliente(null);}}
        onConfirm={o=>{addOrden(o);setShowNuevo(false);setPrefillCliente(null);}}
        prefill={prefillCliente} ordenes={ordenes}/>
      {ordenModifica&&<ModificaOrdenModal orden={{
        ...ordenModifica,
        nota: String(ordenModifica.nota||""),
        hora: String(ordenModifica.hora||""),
        nombre: String(ordenModifica.nombre||""),
        items: Array.isArray(ordenModifica.items) ? ordenModifica.items : (() => {
          try { return JSON.parse(ordenModifica.items||"[]"); } catch(e) { return []; }
        })()
      }}
        onClose={()=>setOrdenModifica(null)} onSave={modificaOrden}/>}

      {/* Pannello cucina — overlay light mode */}
      {showCocina&&<PanelCocina
        ordenes={ordenes}
        convConfermata={convConfermata}
        onListo={(id)=>{ setListo(id); }}
        onClose={()=>setShowCocina(false)}
        loadingIds={loadingIds}
        pizzeFatte={pizzeFatteStasera}
      />}
    </div>
  );
};

// ─── AGGREGA STORICO lato client ────────────────────────────
// Helper: legge un campo da un oggetto cercando varianti del nome (case-insensitive)
const getField = (obj, ...keys) => {
  for(const k of keys) {
    // Exact match
    if(obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
    // Case-insensitive
    const found = Object.keys(obj).find(ok => ok.toLowerCase() === k.toLowerCase());
    if(found && obj[found] !== undefined && obj[found] !== null && obj[found] !== "") return obj[found];
  }
  return undefined;
};

const aggrega = (righe) => {
  if(!righe || righe.length === 0) return null;

  // Backend v7 manda oggetti con chiavi — normalizza gestisce entrambi i casi
  const normalizza = (r) => {
    if(Array.isArray(r)) {
      // Vecchio formato array posizionale (backward compat)
      return {
        id:r[0], nombre:r[1], tel:r[2], canal:r[3],
        items:r[4], nota:r[5], hora:r[6], estado:r[7],
        totale:r[8], fecha:r[9], giorno:r[10], fascia:r[11], ts:r[12]
      };
    }
    // Nuovo formato v7: oggetto con chiavi — mappatura diretta
    return {
      id:       r.id,
      nombre:   r.nombre,
      tel:      r.tel,
      canal:    r.canal,
      items:    r.items,
      nota:     r.nota,
      hora:     r.hora,
      estado:   r.estado,
      totale:   r.totale,        // già calcolato dal backend v7
      fecha:    r.fecha,
      giorno:   r.dia_semana || r.giorno,
      fascia:   r.fascia_ora  || r.fascia,
      ts:       r.ts
    };
  };

  const righeNorm = righe.map(normalizza);

  const oggi    = new Date().toLocaleDateString("es");
  const settMs  = 7  * 24 * 3600 * 1000;
  const meseMs  = 30 * 24 * 3600 * 1000;
  const now     = Date.now();

  let incassoTot=0, incassoOggi=0, incassoSett=0, incassoMese=0;
  let countOrdini=0;
  const prodMap  = {};
  const canali   = {};
  const fasceMap = {};
  const giorniMap= {};
  const GIORNI   = ["Domingo","Lunes","Martes","Miercoles","Jueves","Viernes","Sabado"];
  const FASCE    = [
    {label:"19-20h", h0:19, h1:20},
    {label:"20-21h", h0:20, h1:21},
    {label:"21-22h", h0:21, h1:22},
    {label:"22-23h", h0:22, h1:23},
    {label:"23h+",   h0:23, h1:25},
    {label:"Tarde",  h0:13, h1:19},
    {label:"Manana", h0: 9, h1:13},
  ];

  righeNorm.forEach(r => {
    if(!r || typeof r !== "object") return;

    // Sorgente di verità: r.totale salvato dal backend.
    // Fallback unico per record legacy senza totale popolato (usa calcTotale = sum(items) + delivery_fee).
    let totale = parseFloat(r.totale || 0);
    if (!totale || totale <= 0 || totale > 9999) {
      let itemsCalc = r.items;
      if (typeof itemsCalc === "string") { try { itemsCalc = JSON.parse(itemsCalc); } catch(e) { itemsCalc = []; } }
      const clean = (Array.isArray(itemsCalc) ? itemsCalc : []).filter(i => i.n !== "Entrega a domicilio");
      totale = calcTotale(clean, r.tipo_consegna || "RITIRO");
    }
    if (isNaN(totale) || totale <= 0) return; // salta righe non valide
    incassoTot += totale;
    countOrdini++;

    // Periodo — ts o fecha
    // ts numerico dal backend v7 — affidabile
    const ts    = Number(r.ts || 0);
    const refMs = ts > 1000000000000 ? ts : null;
    let refDate = refMs ? new Date(refMs) : null;
    if(!refDate) {
      const fechaStr = String(r.fecha || r.giorno || "");
      if(fechaStr.includes("T")) { try { refDate=new Date(fechaStr); } catch(e){} }
      else if(fechaStr.includes("/")) { try { const [dd,mm,yy]=fechaStr.split("/").map(Number); refDate=new Date(yy,mm-1,dd); } catch(e){} }
    }
    const midnight = new Date(); midnight.setHours(0,0,0,0);
    const refTime  = refDate && !isNaN(refDate.getTime()) ? refDate.getTime() : null;
    if(refTime && refTime >= midnight.getTime()) incassoOggi += totale;
    if(refTime && (now - refTime) < settMs)      incassoSett += totale;
    if(refTime && (now - refTime) < meseMs)      incassoMese += totale;

    // Canale
    const canalRaw = getField(r,"canal","Canal","channel","Channel","via","Via","source");
    const canal = canalRaw ? String(canalRaw).toUpperCase() : "MANUAL";
    // Normalizza: TELEFONO / TELEPHONE / TEL → MANUAL
    const canalNorm = (canal==="WA"||canal.includes("WHATS")) ? "WA"
      : (canal==="BANCO"||canal.includes("BANK")) ? "BANCO"
      : "MANUAL";
    canali[canalNorm] = (canali[canalNorm]||0) + 1;

    // Fascia oraria — può arrivare già pre-calcolata "22-23h" o da ora "22:00"
    const fasciaPrecomp = getField(r,"fascia","Fascia","fascia_oraria","slot");
    if(fasciaPrecomp && typeof fasciaPrecomp === "string" && fasciaPrecomp.includes("h")) {
      fasceMap[fasciaPrecomp] = (fasceMap[fasciaPrecomp]||0) + 1;
    } else {
      const horaRaw = getField(r,"hora","Hora","hour","Hour","time","Time","retiro","pickupTime");
      const hora = horaRaw ? String(horaRaw) : "";
      const hh   = hora ? parseInt(hora.split(":")[0]) : null;
      if(hh !== null && !isNaN(hh)) {
        const fascia = FASCE.find(f => hh >= f.h0 && hh < f.h1);
        if(fascia) fasceMap[fascia.label] = (fasceMap[fascia.label]||0) + 1;
      }
    }

    // Giorno settimana — può essere già nel campo "giorno" o derivato da refDate
    const giornoPrecomp = getField(r,"giorno","Giorno","day","Day","weekday");
    if(giornoPrecomp && typeof giornoPrecomp === "string" && GIORNI.includes(giornoPrecomp)) {
      giorniMap[giornoPrecomp] = (giorniMap[giornoPrecomp]||0) + 1;
    } else if(refDate && !isNaN(refDate.getTime())) {
      const g = GIORNI[refDate.getDay()];
      if(g) giorniMap[g] = (giorniMap[g]||0) + 1;
    }

    // Prodotti — items può essere stringa JSON, array, o campo separato
    const itemsRaw = getField(r,"items","Items","productos","Productos","products","pizzas","Pizzas");
    let items = itemsRaw;
    if(typeof items === "string" && items.trim().startsWith("[")) {
      try { items = JSON.parse(items); } catch(e){ items = []; }
    } else if(typeof items === "string" && items.trim()) {
      // Potrebbe essere una lista testuale: "Pelusa x1, Zizou x2"
      items = [];
    }
    (Array.isArray(items) ? items : []).forEach(it => {
      if(!it || !it.n) return;
      // Pulisci il nome: rimuovi " - SubNome" per raggruppare per pizza base
      const nomeCompleto = String(it.n).trim();
      // Usa nome completo come key (es. "El Gaucho - Diavola")
      const key = nomeCompleto;
      const emoji = (it.e && it.e.length <= 4) ? it.e : "🍕"; // evita testo spazzatura in e
      const p = parseFloat(it.p||0);
      const q = parseInt(it.q)||1;
      if(isNaN(p) || p <= 0) return; // salta items senza prezzo
      if(!prodMap[key]) prodMap[key] = {n:nomeCompleto, e:emoji, q:0, incasso:0, cat:it.cat||"Pizzas"};
      prodMap[key].q       += q;
      prodMap[key].incasso += p * q;
    });
  });

  const topProdotti = Object.values(prodMap)
    .filter(p => p.cat !== "Bebidas")
    .sort((a,b) => b.q - a.q);

  const ticketMedio = countOrdini > 0 ? incassoTot / countOrdini : 0;


  // Dettaglio giorno per giorno (per navigazione interattiva)
  const perGiorno = {};
  righeNorm.forEach(r => {
    if(!r || typeof r !== "object") return;
    const fechaRaw = getField(r,"fecha","Fecha","date","Date","data","Data","day");
    const fechaStr = fechaRaw ? String(fechaRaw) : "";
    let dataKey = "";
    if(fechaStr && fechaStr.includes("T")) {
      try { dataKey = new Date(fechaStr).toLocaleDateString("es",{day:"2-digit",month:"2-digit",year:"numeric"}); } catch(e){}
    } else if(fechaStr && fechaStr.includes("/")) {
      dataKey = fechaStr; // già "25/3/2026"
    }
    if(!dataKey) return;
    let itemsR = r.items;
    if(typeof itemsR === "string") { try { itemsR = JSON.parse(itemsR); } catch(e){ itemsR=[]; } }
    let tot = 0;
    (Array.isArray(itemsR)?itemsR:[]).forEach(it=>{
      const p=parseFloat(it.p||0),q=parseInt(it.q)||1;
      if(!isNaN(p)&&p>0) tot+=p*q;
    });
    if(tot<=0){const m=String(getField(r,"totale","total","Total")||"").match(/(\d+\.?\d*)/);if(m)tot=parseFloat(m[1]);}
    if(!perGiorno[dataKey]) perGiorno[dataKey]={data:dataKey,incasso:0,ordini:0,ts:getField(r,"ts")||0};
    perGiorno[dataKey].incasso+=tot;
    perGiorno[dataKey].ordini++;
  });
  const giorniDettaglio = Object.values(perGiorno).sort((a,b)=>String(b.data).localeCompare(String(a.data)));

  return {
    incassoTot, incassoOggi, incassoSett, incassoMese,
    countOrdini, ticketMedio,
    topProdotti, canali,
    fasceOrarie: fasceMap,
    giorniSett:  giorniMap,
    giorniDettaglio
  };
};

// ─── ECONOMIA PAGE ────────────────────────────────────────────

export default ServicioPage;
