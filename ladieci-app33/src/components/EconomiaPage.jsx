import { useState, useEffect, useMemo } from 'react';
import { C, LOGO_RED_SRC, calcTotale as calcTotaleHelper } from '../constants';
import { api, sb } from '../api';

// Legge il primo campo non-null tra le chiavi fornite — compatibilità multi-formato
const getField = (obj, ...keys) => {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
};

const parseTicketItems = (raw) => {
  let items = raw;
  if (typeof items === "string") {
    try { items = JSON.parse(items); } catch(e) { items = []; }
  }
  if (!Array.isArray(items)) return [];
  return items.map(it => {
    const item = it && typeof it === "object" ? it : {};
    const qRaw = item.q ?? item.qty ?? item.cantidad ?? item.quantita ?? 1;
    const qty = Number.parseInt(qRaw, 10) || 1;
    const nome = String(item.n || item.nombre || item.name || item.prodotto || item.label || "Producto").trim() || "Producto";
    const variante = String(item.sub || item.variante || item.extra || item.note || item.notas || "").trim();
    return { qty, nome, variante };
  }).filter(Boolean);
};

const orderNumberValue = (id) => {
  const n = Number.parseInt(String(id || "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 999999;
};

const aggrega = (righe) => {
  if(!righe || righe.length === 0) return null;

  // Backend v7 manda oggetti con chiavi — normalizza gestisce entrambi i casi
  const normalizza = (r) => {
    if(Array.isArray(r)) {
      return {
        id:r[0], nombre:r[1], tel:r[2], canal:r[3],
        items:r[4], nota:r[5], hora:r[6], estado:r[7],
        totale:r[8], fecha:r[9], giorno:r[10], fascia:r[11], ts:r[12],
        tipo_consegna: "RITIRO"
      };
    }
    return {
      id:            r.id,
      nombre:        r.nombre,
      tel:           r.tel,
      canal:         r.canal,
      items:         r.items,
      nota:          r.nota,
      hora:          r.hora,
      estado:        r.estado,
      totale:        r.totale,
      fecha:         r.fecha,
      giorno:        r.dia_semana || r.giorno,
      fascia:        r.fascia_ora  || r.fascia,
      ts:            r.ts,
      tipo_consegna: r.tipo_consegna || "RITIRO"
    };
  };

  const righeNorm = righe.map(normalizza);

  const oggi    = new Date().toLocaleDateString("es");
  const settMs  = 7  * 24 * 3600 * 1000;
  const meseMs  = 30 * 24 * 3600 * 1000;
  const now     = Date.now();

  let incassoTot=0, incassoOggi=0, incassoSett=0, incassoMese=0;
  let countOrdini=0;
  const prodMap    = {};
  const canali     = {};
  const fasceMap   = {};
  const giorniMap  = {};
  const consegneMap= {DOMICILIO:0, RITIRO:0};
  const newPagBucket = () => ({
    efectivo:        {incasso:0, count:0},
    tarjeta:         {incasso:0, count:0},
    bizum:           {incasso:0, count:0},
    no_especificado: {incasso:0, count:0},
  });
  const pagamenti     = newPagBucket(); // tutto
  const pagamentiOggi = newPagBucket();
  const pagamentiSett = newPagBucket();
  const pagamentiMese = newPagBucket();
  const GIORNI   = ["Domingo","Lunes","Martes","Miercoles","Jueves","Viernes","Sabado"];
  // Fasce orarie da 30 minuti — più granulari per pianificazione driver/pizzaiolo
  const FASCE_30 = [];
  for (let h = 19; h < 24; h++) {
    FASCE_30.push(`${String(h).padStart(2,"0")}:00`);
    FASCE_30.push(`${String(h).padStart(2,"0")}:30`);
  }

  righeNorm.forEach(r => {
    if(!r || typeof r !== "object") return;

    // Sorgente di verità: r.totale (salvato dal backend).
    // Fallback unico per record legacy: sum(items_puliti) + delivery_fee.
    let totale = parseFloat(r.totale || 0);
    if (!totale || totale <= 0 || totale > 9999) {
      let itemsCalc = r.items;
      if (typeof itemsCalc === "string") { try { itemsCalc = JSON.parse(itemsCalc); } catch(e) { itemsCalc = []; } }
      const clean = (Array.isArray(itemsCalc) ? itemsCalc : []).filter(i => i.n !== "Entrega a domicilio");
      totale = calcTotaleHelper(clean, r.tipo_consegna || "RITIRO");
    }
    if (isNaN(totale) || totale <= 0) return; // salta righe non valide

    // Periodo — ts o fecha (calcolato prima del conteggio per poter filtrare per orario)
    const ts    = Number(r.ts || 0);
    const refMs = ts > 1000000000000 ? ts : ts > 1000000000 ? ts * 1000 : null;
    let refDate = refMs ? new Date(refMs) : null;
    if(!refDate) {
      const fechaStr = String(r.fecha || r.giorno || "");
      if(fechaStr.includes("T")) { try { refDate=new Date(fechaStr); } catch(e){} }
      else if(fechaStr.includes("/")) { try { const [dd,mm,yy]=fechaStr.split("/").map(Number); refDate=new Date(yy,mm-1,dd); } catch(e){} }
    }

    // Filtra solo orari di apertura (19:50–23:00) — escludi test/dati fuori servizio
    if(refMs) {
      const hm = new Date(refMs).getHours() * 60 + new Date(refMs).getMinutes();
      if(hm < 19 * 60 + 50 || hm >= 23 * 60) return;
    }

    incassoTot += totale;
    countOrdini++;

    const midnight = new Date(); midnight.setHours(0,0,0,0);
    const refTime  = refDate && !isNaN(refDate.getTime()) ? refDate.getTime() : null;
    if(refTime && refTime >= midnight.getTime()) incassoOggi += totale;
    if(refTime && (now - refTime) < settMs)      incassoSett += totale;
    if(refTime && (now - refTime) < meseMs)      incassoMese += totale;

    // Canale
    const canalRaw = getField(r,"canal","Canal","channel","Channel","via","Via","source");
    const canal = canalRaw ? String(canalRaw).toUpperCase() : "MANUAL";
    const canalNorm = (canal==="WA"||canal.includes("WHATS")) ? "WA"
      : (canal==="BANCO"||canal.includes("BANK")) ? "BANCO"
      : (canal==="TEL"||canal==="TELEFONO"||canal==="PHONE") ? "TEL"
      : "MANUAL";
    canali[canalNorm] = (canali[canalNorm]||0) + 1;

    // Tipo consegna
    const tc = r.tipo_consegna === "DOMICILIO" ? "DOMICILIO" : "RITIRO";
    consegneMap[tc] = (consegneMap[tc]||0) + 1;

    // Metodo pagamento — efectivo / tarjeta / bizum / no_especificado (rispetta filtro periodo)
    const mp = String(getField(r,"metodo_pago","metodoPago","pago","pagoMetodo")||"").toLowerCase();
    const pk = mp === "efectivo" ? "efectivo"
      : mp === "tarjeta" ? "tarjeta"
      : mp === "bizum"   ? "bizum"
      : "no_especificado";
    const addPag = (bucket) => { bucket[pk].incasso += totale; bucket[pk].count += 1; };
    addPag(pagamenti);
    if (refTime && refTime >= midnight.getTime()) addPag(pagamentiOggi);
    if (refTime && (now - refTime) < settMs)      addPag(pagamentiSett);
    if (refTime && (now - refTime) < meseMs)      addPag(pagamentiMese);

    // Fascia oraria — slot da 30 min (HH:00 / HH:30)
    const horaRaw = getField(r,"hora","Hora","hour","Hour","time","Time","retiro","pickupTime");
    const hora = horaRaw ? String(horaRaw) : "";
    const parts = hora.split(":");
    const hh = parts[0] ? parseInt(parts[0]) : null;
    const mm = parts[1] ? parseInt(parts[1]) : 0;
    if (hh !== null && !isNaN(hh) && hh >= 19 && hh < 24) {
      const slot = (!isNaN(mm) && mm >= 30) ? 30 : 0;
      const label = `${String(hh).padStart(2,"0")}:${String(slot).padStart(2,"0")}`;
      fasceMap[label] = (fasceMap[label]||0) + 1;
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

  const topProdotti = Object.values(prodMap).sort((a,b) => b.q - a.q);

  const ticketMedio = countOrdini > 0 ? incassoTot / countOrdini : 0;


  // Dettaglio giorno per giorno (per navigazione interattiva e confronto)
  const perGiorno = {};
  righeNorm.forEach(r => {
    if(!r || typeof r !== "object") return;
    const fechaRaw = getField(r,"fecha","Fecha","date","Date","data","Data","day");
    const fechaStr = fechaRaw ? String(fechaRaw) : "";
    let dataKey = "";
    if(fechaStr.match(/^\d{4}-\d{2}-\d{2}/))      { dataKey = fechaStr.slice(0,10); }
    else if(fechaStr.includes("T"))                 { try { dataKey = new Date(fechaStr).toISOString().slice(0,10); } catch(e){} }
    else if(fechaStr.includes("/"))                 { try { const[dd,mm,yy]=fechaStr.split("/").map(Number); dataKey=new Date(yy,mm-1,dd).toISOString().slice(0,10); } catch(e){} }
    if(!dataKey) return;
    let itemsR = r.items;
    if(typeof itemsR === "string") { try { itemsR = JSON.parse(itemsR); } catch(e){ itemsR=[]; } }
    let tot=0, pizzeG=0, bevandeG=0;
    (Array.isArray(itemsR)?itemsR:[]).forEach(it=>{
      const p=parseFloat(it.p||0),q=parseInt(it.q)||1;
      if(!isNaN(p)&&p>0) tot+=p*q;
      if(it.cat==="Bebidas") bevandeG+=q; else pizzeG+=q;
    });
    // Use corrected r.totale (includes delivery fee) when available
    const rTotale = parseFloat(getField(r,"totale","total","Total")||0);
    if(rTotale > 0) tot = rTotale;
    if(!perGiorno[dataKey]) perGiorno[dataKey]={data:dataKey,incasso:0,ordini:0,pizze:0,bevande:0,consegne:0,ts:Number(getField(r,"ts")||0)};
    perGiorno[dataKey].incasso+=tot;
    perGiorno[dataKey].ordini++;
    perGiorno[dataKey].pizze+=pizzeG;
    perGiorno[dataKey].bevande+=bevandeG;
    if(r.tipo_consegna==="DOMICILIO") perGiorno[dataKey].consegne++;
  });
  const giorniDettaglio = Object.values(perGiorno).sort((a,b)=>String(b.data).localeCompare(String(a.data)));

  // Arrotonda incassi pagamento (tutti i bucket)
  [pagamenti, pagamentiOggi, pagamentiSett, pagamentiMese].forEach(b => {
    Object.keys(b).forEach(k => { b[k].incasso = Math.round(b[k].incasso * 100) / 100; });
  });

  return {
    incassoTot, incassoOggi, incassoSett, incassoMese,
    countOrdini, ticketMedio,
    topProdotti, canali, consegne: consegneMap,
    fasceOrarie: fasceMap,
    giorniSett:  giorniMap,
    giorniDettaglio,
    pagamenti, pagamentiOggi, pagamentiSett, pagamentiMese
  };
};

const PERIODI = [
  {id:"serata", label:"💰 Caja"},
  {id:"sett",   label:"Semana"},
  {id:"mese",   label:"Mes"},
  {id:"tutto",  label:"Todo"},
];

// Trasforma qualsiasi formato data → Date JS (mezzanotte locale)
const parseDataKey = (s) => {
  if(!s) return null;
  if(s.match(/^\d{4}-\d{2}-\d{2}/)) {
    const [yy,mm,dd] = s.slice(0,10).split("-").map(Number);
    return new Date(yy,mm-1,dd);
  }
  if(s.includes("T")) { try { return new Date(s); } catch(e){ return null; } }
  if(s.includes("/")) {
    const [dd,mm,yy] = s.split("/").map(Number);
    if(!isNaN(dd)&&!isNaN(mm)&&!isNaN(yy)) return new Date(yy,mm-1,dd);
  }
  return null;
};

// Formatta YYYY-MM-DD per display breve (es. "Ieri", "Lun 21")
const fmtGiorno = (iso) => {
  const dt = parseDataKey(iso);
  if(!dt) return iso;
  const today = new Date(); today.setHours(0,0,0,0);
  const ieri  = new Date(today); ieri.setDate(today.getDate()-1);
  if(dt.getTime()===today.getTime()) return "Hoy";
  if(dt.getTime()===ieri.getTime())  return "Ayer";
  const GIORNI = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  return GIORNI[dt.getDay()]+" "+dt.getDate();
};

const isoLocal = (dt = new Date()) =>
  `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;

const fmtFechaLarga = (iso) => {
  const dt = parseDataKey(iso);
  if(!dt) return iso || "";
  const DIAS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  return `${DIAS[dt.getDay()]} ${String(dt.getDate()).padStart(2,"0")}/${String(dt.getMonth()+1).padStart(2,"0")}/${dt.getFullYear()}`;
};

const fechaKeyOf = (r) => {
  const raw = String(r?.fecha || "");
  if(raw.match(/^\d{4}-\d{2}-\d{2}/)) return raw.slice(0,10);
  if(raw.includes("T")) {
    try { return isoLocal(new Date(raw)); } catch(e) { return ""; }
  }
  if(raw.includes("/")) {
    const [dd,mm,yy] = raw.split("/").map(Number);
    if(!isNaN(dd) && !isNaN(mm) && !isNaN(yy)) return isoLocal(new Date(yy, mm-1, dd));
  }
  const ts = Number(r?.ts || 0);
  if(ts > 0) {
    const ms = ts < 1e12 ? ts * 1000 : ts;
    try { return isoLocal(new Date(ms)); } catch(e) { return ""; }
  }
  return "";
};

const buildCajaStats = (rows) => {
  const lista = Array.isArray(rows) ? rows : [];
  let incasso = 0;
  let pizzeTot = 0;
  let bevandeTot = 0;
  const prodMap = {};
  const canali = {};
  const consegne = {DOMICILIO:0, RITIRO:0};
  const pagamenti = {
    efectivo:        {incasso:0, count:0},
    tarjeta:         {incasso:0, count:0},
    bizum:           {incasso:0, count:0},
    no_especificado: {incasso:0, count:0},
  };

  lista.forEach(r => {
    let items = r.items;
    if(typeof items === "string") { try { items = JSON.parse(items); } catch(e) { items = []; } }
    let totale = Number(r.totale) || 0;
    if(totale <= 0 || totale > 9999) {
      const clean = (Array.isArray(items) ? items : []).filter(i => i.n !== "Entrega a domicilio");
      totale = calcTotaleHelper(clean, r.tipo_consegna || "RITIRO");
    }
    incasso += totale;
    const canal = r.canal==="WA"?"WA":r.canal==="BANCO"?"BANCO":r.canal==="TEL"?"TEL":"MANUAL";
    canali[canal]=(canali[canal]||0)+1;
    const tc = r.tipo_consegna==="DOMICILIO"?"DOMICILIO":"RITIRO";
    consegne[tc]=(consegne[tc]||0)+1;
    const mp = String(r.metodo_pago||"").toLowerCase();
    const pk = mp==="efectivo"?"efectivo":mp==="tarjeta"?"tarjeta":mp==="bizum"?"bizum":"no_especificado";
    pagamenti[pk].incasso += totale;
    pagamenti[pk].count   += 1;
    (Array.isArray(items)?items:[]).forEach(it=>{
      if(!it||!it.n||it.n==="Entrega a domicilio") return;
      const q=parseInt(it.q)||1, p=parseFloat(it.p)||0;
      if(!prodMap[it.n]) prodMap[it.n]={n:it.n,e:it.e||"🍕",q:0,incasso:0,cat:it.cat||"Pizzas"};
      prodMap[it.n].q+=q;
      prodMap[it.n].incasso+=p*q;
      if(it.cat==="Bebidas") bevandeTot+=q; else pizzeTot+=q;
    });
  });
  Object.keys(pagamenti).forEach(k => { pagamenti[k].incasso = Math.round(pagamenti[k].incasso*100)/100; });
  const prodotti=Object.values(prodMap).sort((a,b)=>b.q-a.q);
  return {
    incasso: Math.round(incasso*100)/100,
    countOrdini: lista.length,
    ticketMedio: lista.length>0?Math.round((incasso/lista.length)*100)/100:0,
    prodotti, canali, consegne, pizzeTot, bevandeTot, pagamenti
  };
};

// Genera confronto 15 giorni: ogni giorno vs stesso giorno -7gg
const buildConfronto = (giorniDettaglio) => {
  if(!giorniDettaglio || giorniDettaglio.length === 0) return [];
  const byKey = {};
  giorniDettaglio.forEach(d => { byKey[d.data] = d; });
  const now = new Date(); now.setHours(0,0,0,0);
  const cutoff = new Date(now); cutoff.setDate(now.getDate() - 14);
  return giorniDettaglio
    .filter(d => {
      const dt = parseDataKey(d.data);
      return dt && dt >= cutoff;
    })
    .map(d => {
      const dt = parseDataKey(d.data);
      const prevDt = dt ? new Date(dt.getTime() - 7*24*3600*1000) : null;
      const prevKey = prevDt
        ? `${prevDt.getFullYear()}-${String(prevDt.getMonth()+1).padStart(2,"0")}-${String(prevDt.getDate()).padStart(2,"0")}`
        : null;
      const prev = prevKey ? byKey[prevKey] : null;
      const GIORNI_ES = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
      const label = dt ? GIORNI_ES[dt.getDay()] : "?";
      return { ...d, label, prev: prev || null };
    })
    .sort((a,b) => String(b.data).localeCompare(String(a.data)));
};

const EconomiaPage = ({onBack}) => {
  const [loading,      setLoading]      = useState(true);
  const [rawData,      setRawData]      = useState(null);
  const [error,        setError]        = useState(null);
  const [periodo,      setPeriodo]      = useState("serata");
  const [refresh,      setRefresh]      = useState(0);
  const [debugRaw,     setDebugRaw]     = useState(null);
  const [diaIdx,       setDiaIdx]       = useState(0);
  const [serataData,   setSerataData]   = useState(null);
  const [serataLoad,   setSerataLoad]   = useState(true);
  const [serataError,  setSerataError]  = useState(null);
  const [diaCajaSeleccionado, setDiaCajaSeleccionado] = useState(null);
  const [prodTab,      setProdTab]      = useState("pizze"); // "pizze" | "bevande"
  const [giornoFiltro, setGiornoFiltro] = useState(null);   // YYYY-MM-DD o null
  const [subTab,       setSubTab]       = useState("dinero"); // legacy, non più usato
  const [modalAperto,  setModalAperto]  = useState(null); // "ventas"|"ticket"|"pizzas"|"bebidas"|"delivery"|"stats"|"clientes"|null
  const [deliveryLogs, setDeliveryLogs] = useState(null);
  const [deliveryLoad, setDeliveryLoad] = useState(false);

  // Fetch delivery_logs on-demand quando si apre il modal Delivery
  useEffect(() => {
    if (modalAperto !== "delivery" || deliveryLogs !== null) return;
    setDeliveryLoad(true);
    sb.select("delivery_logs", "order=partito_alle.desc&limit=500")
      .then(rows => { setDeliveryLogs(Array.isArray(rows) ? rows : []); setDeliveryLoad(false); })
      .catch(e => { console.warn("[delivery_logs] fetch fail:", e?.message||e); setDeliveryLogs([]); setDeliveryLoad(false); });
  }, [modalAperto, deliveryLogs]);

  // Carica dati serata corrente (ordenes COMPLETADO/RETIRADO dalle 19:50)
  useEffect(() => {
    if (periodo !== "serata") return;
    setSerataLoad(true);
    setSerataError(null);
    api.getSerata()
      .then(d => { setSerataData(d); setSerataLoad(false); })
      .catch(e => { setSerataError("Error: " + e.toString()); setSerataLoad(false); });
  }, [periodo, refresh]);

  useEffect(()=>{
    setLoading(true);
    setError(null);
    api.getStorico()
      .then(r => {
        setDebugRaw(r); // salva per debug visivo
        if(!r || r.error) {
          setError(r?.error || "Sin respuesta del servidor");
          setLoading(false);
          return;
        }
        // Backend v7: {righe:[oggetti], analytics:{...}}
        if(r.analytics && r.analytics.countOrdini > 0) {
          const righe7 = Array.isArray(r.righe) ? r.righe : [];
          if(righe7.length > 0) { setRawData(righe7); }
          else { setRawData({_preAggregated: r.analytics}); }
          setLoading(false); return;
        }
        // Fallback formati
        let righe = null;
        if(Array.isArray(r))                          righe = r;
        else if(Array.isArray(r.righe))               righe = r.righe;
        else if(Array.isArray(r.storico))             righe = r.storico;
        else if(Array.isArray(r.data))                righe = r.data;
        else if(Array.isArray(r.rows))                righe = r.rows;
        else if(Array.isArray(r.records))             righe = r.records;
        else if(Array.isArray(r.ordenes))             righe = r.ordenes;
        else if(r.analytics)                          { setRawData({_preAggregated:r.analytics}); setLoading(false); return; }
        // Ultima risorsa: cerca il primo campo che è un array
        else {
          const firstArr = Object.values(r).find(v => Array.isArray(v) && v.length > 0);
          if(firstArr) righe = firstArr;
        }

        if(righe && righe.length > 0) {
          setRawData(righe);
        } else if(righe && righe.length === 0) {
          setError("Histórico vacío — entrega pedidos para ver estadísticas.");
        } else {
          // Nessun array trovato — logga le chiavi per debug
          setError(`Formato del backend no reconocido. Claves: ${Object.keys(r).join(", ")}`);
        }
        setLoading(false);
      })
      .catch(e => {
        console.error("[Economia] fetch error:", e);
        setError("Error de conexión: " + e.toString());
        setLoading(false);
      });
  }, [periodo, refresh]);

  // Aggrega — se già pre-aggregato dal backend usa direttamente
  const a = useMemo(() => {
    if(!rawData) return null;
    if(rawData._preAggregated) return rawData._preAggregated;
    return aggrega(rawData);
  }, [rawData]);

  const oggiIso = isoLocal();

  const diasCaja = useMemo(() => {
    const byData = {};
    (a?.giorniDettaglio || []).forEach(d => {
      if(d?.data) byData[d.data] = {...d};
    });
    if(serataData && serataData.countOrdini > 0) {
      const prev = byData[oggiIso] || {data: oggiIso, incasso: 0, ordini: 0, pizze: 0, bevande: 0, consegne: 0};
      byData[oggiIso] = {
        ...prev,
        data: oggiIso,
        incasso: Math.max(prev.incasso || 0, serataData.incasso || 0),
        ordini: Math.max(prev.ordini || 0, serataData.countOrdini || 0),
        pizze: Math.max(prev.pizze || 0, serataData.pizzeTot || 0),
        bevande: Math.max(prev.bevande || 0, serataData.bevandeTot || 0),
        consegne: Math.max(prev.consegne || 0, serataData.consegne?.DOMICILIO || 0),
      };
    }
    return Object.values(byData)
      .filter(d => d?.data)
      .sort((x,y)=>String(y.data).localeCompare(String(x.data)))
      .slice(0,7);
  }, [a, serataData, oggiIso]);

  useEffect(() => {
    if(periodo !== "serata") return;
    if(diasCaja.length === 0) {
      if(!diaCajaSeleccionado) setDiaCajaSeleccionado(oggiIso);
      return;
    }
    const exists = diasCaja.some(d => d.data === diaCajaSeleccionado);
    if(!exists) setDiaCajaSeleccionado(diasCaja[0].data);
  }, [periodo, diasCaja, diaCajaSeleccionado, oggiIso]);

  const ordenesCajaDia = useMemo(() => {
    const dia = diaCajaSeleccionado || diasCaja[0]?.data || oggiIso;
    const righe = Array.isArray(rawData) ? rawData : [];
    const storiche = righe.filter(r => fechaKeyOf(r) === dia);
    if(storiche.length > 0) return storiche;
    if(dia === oggiIso && serataData?.ordini) return serataData.ordini;
    return [];
  }, [diaCajaSeleccionado, diasCaja, rawData, serataData, oggiIso]);

  const cajaDiaData = useMemo(() => buildCajaStats(ordenesCajaDia), [ordenesCajaDia]);
  const cajaFechaLabel = fmtFechaLarga(diaCajaSeleccionado || diasCaja[0]?.data || oggiIso);

  // Stats per singolo giorno selezionato — filtra rawData per fecha
  const aGiorno = useMemo(() => {
    if(!giornoFiltro || !rawData || rawData._preAggregated) return null;
    const righe = Array.isArray(rawData) ? rawData : [];
    const filtrate = righe.filter(r => {
      const f = String(r.fecha||r.dia_semana||"");
      return f.slice(0,10) === giornoFiltro;
    });
    if(filtrate.length === 0) return null;
    // Calcola stats per questa sera
    let incasso=0; const prodMap={}; const canali={}; const consegne={DOMICILIO:0,RITIRO:0};
    let pizzeTot=0, bevandeTot=0;
    const pagamenti = {
      efectivo:        {incasso:0, count:0},
      tarjeta:         {incasso:0, count:0},
      bizum:           {incasso:0, count:0},
      no_especificado: {incasso:0, count:0},
    };
    filtrate.forEach(r => {
      let items = r.items;
      if (typeof items === "string") { try { items = JSON.parse(items); } catch(e) { items = []; } }
      // Sorgente di verità: r.totale. Fallback per record legacy.
      let totale = Number(r.totale) || 0;
      if (totale <= 0 || totale > 9999) {
        const clean = (Array.isArray(items) ? items : []).filter(i => i.n !== "Entrega a domicilio");
        totale = calcTotaleHelper(clean, r.tipo_consegna || "RITIRO");
      }
      incasso += totale;
      const canal = r.canal==="WA"?"WA":r.canal==="BANCO"?"BANCO":r.canal==="TEL"?"TEL":"MANUAL";
      canali[canal]=(canali[canal]||0)+1;
      const tc = r.tipo_consegna==="DOMICILIO"?"DOMICILIO":"RITIRO";
      consegne[tc]=(consegne[tc]||0)+1;
      const mp = String(r.metodo_pago||"").toLowerCase();
      const pk = mp==="efectivo"?"efectivo":mp==="tarjeta"?"tarjeta":mp==="bizum"?"bizum":"no_especificado";
      pagamenti[pk].incasso += totale;
      pagamenti[pk].count   += 1;
      // Conta prodotti — escludendo il fake item per ordini legacy
      (Array.isArray(items)?items:[]).forEach(it=>{
        if(!it||!it.n) return;
        if(it.n === "Entrega a domicilio") return;
        const q=parseInt(it.q)||1, p=parseFloat(it.p)||0;
        if(!prodMap[it.n]) prodMap[it.n]={n:it.n,e:it.e||"🍕",q:0,incasso:0,cat:it.cat||"Pizzas"};
        prodMap[it.n].q+=q; prodMap[it.n].incasso+=p*q;
        if(it.cat==="Bebidas") bevandeTot+=q; else pizzeTot+=q;
      });
    });
    const prodotti=Object.values(prodMap).sort((a,b)=>b.q-a.q);
    Object.keys(pagamenti).forEach(k => { pagamenti[k].incasso = Math.round(pagamenti[k].incasso*100)/100; });
    return {
      incasso: Math.round(incasso*100)/100,
      countOrdini: filtrate.length,
      ticketMedio: filtrate.length>0?Math.round((incasso/filtrate.length)*100)/100:0,
      prodotti, canali, consegne, pizzeTot, bevandeTot, pagamenti
    };
  }, [giornoFiltro, rawData]);

  const incasso = !a ? 0
    : periodo==="sett" ? a.incassoSett
    : periodo==="mese" ? a.incassoMese
    : a.incassoTot;

  // Delta vs periodo precedente — solo per Semana e Mese (Hoy/Todo non hanno baseline)
  const delta = useMemo(() => {
    if (!a || !a.giorniDettaglio || a.giorniDettaglio.length === 0) return null;
    const giorniN = periodo === "sett" ? 7 : periodo === "mese" ? 30 : null;
    if (!giorniN) return null;
    const now = new Date(); now.setHours(0,0,0,0);
    const dayMs = 24 * 3600 * 1000;
    const cutOggi = now.getTime() - giorniN * dayMs;
    const cutPrev = now.getTime() - 2 * giorniN * dayMs;
    let actVen = 0, actOrd = 0, prevVen = 0, prevOrd = 0;
    a.giorniDettaglio.forEach(d => {
      const dt = parseDataKey(d.data);
      if (!dt) return;
      const t = dt.getTime();
      if (t >= cutOggi)      { actVen  += d.incasso || 0; actOrd  += d.ordini || 0; }
      else if (t >= cutPrev) { prevVen += d.incasso || 0; prevOrd += d.ordini || 0; }
    });
    const pct = (a, p) => (p > 0 ? Math.round(((a - p) / p) * 100) : null);
    const actTicket  = actOrd  > 0 ? actVen  / actOrd  : 0;
    const prevTicket = prevOrd > 0 ? prevVen / prevOrd : 0;
    return {
      ventas:  pct(actVen, prevVen),
      ordini:  pct(actOrd, prevOrd),
      ticket:  pct(actTicket, prevTicket),
    };
  }, [a, periodo]);

  // Messaggio contestuale quando il periodo selezionato non ha dati
  const periodoVuoto = a && incasso === 0 && a.incassoTot > 0;
  const periodoLabel = periodo==="sett"?"esta semana":periodo==="mese"?"este mes":null;

  // ── VISTA: sorgente dati unificata per le 6 KPI cards ────────────────
  // Caja usa sempre il giorno selezionato; Semana/Mes/Todo restano aggregati.
  const vista = useMemo(() => {
    // 1) Caja del día
    if (periodo === "serata") {
      const prodotti = cajaDiaData.prodotti || [];
      return {
        contesto: "caja",
        etichetta: cajaFechaLabel,
        ventas:    cajaDiaData.incasso || 0,
        ticket:    cajaDiaData.ticketMedio || 0,
        pedidos:   cajaDiaData.countOrdini || 0,
        pizzas:    cajaDiaData.pizzeTot || 0,
        bebidas:   cajaDiaData.bevandeTot || 0,
        delivery:  cajaDiaData.consegne?.DOMICILIO || 0,
        local:     cajaDiaData.consegne?.RITIRO    || 0,
        pagamenti: cajaDiaData.pagamenti,
        prodottiPizzas:  prodotti.filter(p => p.cat !== "Bebidas"),
        prodottiBebidas: prodotti.filter(p => p.cat === "Bebidas"),
        canali:    cajaDiaData.canali || {},
      };
    }
    // 2) Singolo giorno selezionato
    if (giornoFiltro && aGiorno) {
      const prodotti = aGiorno.prodotti || [];
      return {
        contesto: "giorno",
        etichetta: `del ${giornoFiltro.split("-").reverse().join("/")}`,
        ventas:    aGiorno.incasso || 0,
        ticket:    aGiorno.ticketMedio || 0,
        pedidos:   aGiorno.countOrdini || 0,
        pizzas:    aGiorno.pizzeTot || 0,
        bebidas:   aGiorno.bevandeTot || 0,
        delivery:  aGiorno.consegne?.DOMICILIO || 0,
        local:     aGiorno.consegne?.RITIRO    || 0,
        pagamenti: aGiorno.pagamenti,
        prodottiPizzas:  prodotti.filter(p => p.cat !== "Bebidas"),
        prodottiBebidas: prodotti.filter(p => p.cat === "Bebidas"),
        canali:    aGiorno.canali || {},
      };
    }
    // 3) Aggregata (Semana/Mes/Todo)
    if (a) {
      const pizze   = (a.topProdotti||[]).filter(p => p.cat !== "Bebidas");
      const bevande = (a.topProdotti||[]).filter(p => p.cat === "Bebidas");
      const pag = periodo==="sett" ? a.pagamentiSett
                : periodo==="mese" ? a.pagamentiMese
                : a.pagamenti;
      return {
        contesto: "aggregata",
        etichetta: periodo==="sett" ? "de la semana"
                 : periodo==="mese" ? "del mes"
                 : "total",
        ventas:    incasso || 0,
        ticket:    a.ticketMedio || 0,
        pedidos:   a.countOrdini || 0,
        pizzas:    pizze.reduce((s,p)=>s+p.q,0),
        bebidas:   bevande.reduce((s,p)=>s+p.q,0),
        delivery:  a.consegne?.DOMICILIO || 0,
        local:     a.consegne?.RITIRO    || 0,
        pagamenti: pag,
        prodottiPizzas:  pizze,
        prodottiBebidas: bevande,
        canali:    a.canali || {},
      };
    }
    return null;
  }, [periodo, cajaDiaData, cajaFechaLabel, giornoFiltro, aGiorno, a, incasso]);

  const CANAL_COLOR = {WA:C.wa, TEL:C.blu, BANCO:C.rosso, MANUAL:"#F97316"};
  const CANAL_LABEL = {WA:"💬 WhatsApp", TEL:"📞 Teléfono", BANCO:"🏪 Barra", MANUAL:"✍️ Manual"};
  const FASCIA_ORDER = (() => {
    const out = [];
    for (let h = 19; h < 24; h++) {
      out.push(`${String(h).padStart(2,"0")}:00`);
      out.push(`${String(h).padStart(2,"0")}:30`);
    }
    return out;
  })();
  const COLORI = [C.rosso,C.giallo,C.blu,C.verde,C.viola,C.wa,C.rossoV,"#FF8C00"];

  const glassCard = {
    background:"rgba(255,255,255,0.055)",
    backdropFilter:"blur(28px) saturate(1.8)",
    WebkitBackdropFilter:"blur(28px) saturate(1.8)",
    border:"1px solid rgba(255,255,255,0.10)",
    boxShadow:"0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)",
    borderRadius:18, padding:"18px 20px", marginBottom:14,
    position:"relative", overflow:"hidden"
  };
  const shimmerLine = (
    <div style={{position:"absolute",top:0,left:"6%",right:"6%",height:1,
      background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)",
      pointerEvents:"none"}}/>
  );

  // Modal centrato a schermo — usato dai KPI cliccabili
  const Modal = ({titolo, icona, color, sub, onClose, children}) => (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, zIndex:300,
      background:"rgba(0,0,0,0.72)", backdropFilter:"blur(8px)",
      WebkitBackdropFilter:"blur(8px)",
      display:"flex", alignItems:"flex-start", justifyContent:"center",
      padding:"40px 14px 30px", overflowY:"auto",
      animation:"fadeIn .2s ease"
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:"100%", maxWidth:520,
        background:"linear-gradient(180deg,rgba(28,28,30,0.98),rgba(18,18,20,0.98))",
        border:"1px solid rgba(255,255,255,0.12)",
        borderRadius:22, overflow:"hidden",
        boxShadow:"0 30px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)"
      }}>
        {/* Header modal */}
        <div style={{
          padding:"18px 22px 14px",
          borderBottom:"1px solid rgba(255,255,255,0.06)",
          display:"flex", alignItems:"center", gap:14,
          background:`linear-gradient(180deg,${color||C.rosso}1a,transparent)`
        }}>
          <div style={{
            width:44, height:44, borderRadius:13,
            background:`${color||C.rosso}25`,
            border:`1px solid ${color||C.rosso}55`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:22, flexShrink:0
          }}>{icona}</div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{color:"#fff", fontWeight:900, fontSize:18, letterSpacing:.2}}>{titolo}</div>
            {sub && <div style={{color:"rgba(255,255,255,0.4)", fontSize:12, marginTop:2}}>{sub}</div>}
          </div>
          <button onClick={onClose} style={{
            background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)",
            color:"rgba(255,255,255,0.7)", borderRadius:10, width:34, height:34,
            fontSize:20, cursor:"pointer", display:"flex",
            alignItems:"center", justifyContent:"center", flexShrink:0
          }}>×</button>
        </div>
        {/* Body modal */}
        <div style={{padding:"18px 22px 24px", maxHeight:"75vh", overflowY:"auto"}}>
          {children}
        </div>
      </div>
    </div>
  );

  // Riga dato semplice — etichetta + valore allineato a destra
  const RigaDato = ({label, value, color, big, sub}) => (
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,0.04)",
      gap:12
    }}>
      <span style={{color:"rgba(255,255,255,0.65)", fontSize:14}}>{label}</span>
      <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end"}}>
        <span style={{
          color:color||"#fff", fontWeight:big?900:700,
          fontSize:big?22:15, fontFamily:"'DM Mono',monospace"
        }}>{value}</span>
        {sub && <span style={{color:"rgba(255,255,255,0.35)", fontSize:11, marginTop:2}}>{sub}</span>}
      </div>
    </div>
  );

  // Sezione titolo dentro un modal
  const ModalSection = ({titolo, children, marginTop}) => (
    <div style={{marginTop:marginTop??18}}>
      {titolo && <div style={{
        color:"rgba(255,255,255,0.4)", fontSize:11, fontWeight:800,
        letterSpacing:1.5, textTransform:"uppercase", marginBottom:6
      }}>{titolo}</div>}
      {children}
    </div>
  );

  // Blocco "Caja" — breakdown pagamenti (efectivo/tarjeta/bizum + no especificado)
  const BloccoCaja = ({pagamenti, titolo}) => {
    if (!pagamenti) return null;
    const totale = Object.values(pagamenti).reduce((s,p)=>s+(p.incasso||0),0);
    if (totale <= 0) return null;
    const ROWS = [
      {k:"efectivo",        label:"💵 Efectivo",       col:C.verde},
      {k:"tarjeta",         label:"💳 Tarjeta",        col:C.blu},
      {k:"bizum",           label:"📱 Bizum",          col:"#9B59B6"},
      {k:"no_especificado", label:"❓ No especificado", col:"rgba(255,255,255,0.45)"},
    ].filter(r => (pagamenti[r.k]?.incasso||0) > 0 || (pagamenti[r.k]?.count||0) > 0);
    return (
      <div style={glassCard}>
        {shimmerLine}
        <div style={{color:"rgba(255,255,255,0.85)",fontWeight:800,fontSize:16,
          marginBottom:4,display:"flex",alignItems:"center",gap:8}}>
          <span>💰</span><span>{titolo||"Caja"}</span>
          <span style={{marginLeft:"auto",color:C.verde,fontFamily:"'DM Mono',monospace",
            fontWeight:900,fontSize:16}}>{totale.toFixed(2)}€</span>
        </div>
        <div style={{color:"rgba(255,255,255,0.3)",fontSize:11,marginBottom:14}}>
          Cobros por método de pago
        </div>
        {ROWS.map(({k,label,col}) => {
          const p = pagamenti[k] || {incasso:0,count:0};
          const pct = totale > 0 ? (p.incasso / totale) * 100 : 0;
          return (
            <div key={k} style={{display:"flex",alignItems:"center",gap:12,marginBottom:11}}>
              <span style={{color:"rgba(255,255,255,0.7)",fontSize:13,minWidth:130,fontWeight:500}}>{label}</span>
              <div style={{flex:1,background:"rgba(255,255,255,0.06)",borderRadius:5,height:10,
                overflow:"hidden",border:"1px solid rgba(255,255,255,0.04)"}}>
                <div style={{background:`linear-gradient(90deg,${col}88,${col})`,
                  borderRadius:5,height:"100%",width:`${pct}%`,transition:"width .7s",
                  boxShadow:`0 0 8px ${col}55`}}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",
                minWidth:90,gap:1}}>
                <span style={{color:col,fontWeight:900,fontFamily:"'DM Mono',monospace",fontSize:14}}>
                  {p.incasso.toFixed(2)}€
                </span>
                <span style={{color:"rgba(255,255,255,0.35)",fontSize:10,
                  fontFamily:"'DM Mono',monospace"}}>
                  {p.count} ped · {Math.round(pct)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const TicketList = ({ordini, fechaLabel}) => {
    const lista = (Array.isArray(ordini) ? ordini : [])
      .slice()
      .sort((a, b) => orderNumberValue(a.id || a.orden_id) - orderNumberValue(b.id || b.orden_id));

    return (
      <div style={glassCard}>
        {shimmerLine}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
          <span style={{fontSize:18}}>🧾</span>
          <div style={{color:"rgba(255,255,255,0.86)",fontWeight:900,fontSize:16}}>
            Tiquets del día
          </div>
          <span style={{marginLeft:"auto",color:"rgba(255,255,255,0.35)",
            fontSize:12,fontFamily:"'DM Mono',monospace"}}>
            {lista.length} ped.
          </span>
        </div>
        <div style={{color:"rgba(255,255,255,0.34)",fontSize:12,marginBottom:14}}>
          {fechaLabel ? `${fechaLabel} · ` : ""}Pedidos cerrados listos para revisar en caja
        </div>

        {lista.length === 0 ? (
          <div style={{color:"rgba(255,255,255,0.42)",fontSize:14,
            textAlign:"center",padding:"20px 8px"}}>
            No hay tiquets cerrados para esta fecha.
          </div>
        ) : lista.map(o => {
          const id = o.id || o.orden_id || "#---";
          const nombre = String(o.nombre || "Cliente").trim() || "Cliente";
          const tipoBase = o.tipo_consegna === "DOMICILIO" ? "DOMICILIO" : "RITIRO";
          const tipoLabel = tipoBase === "DOMICILIO" && o.zona ? `DOMICILIO ${o.zona}` : tipoBase;
          const pago = String(o.metodo_pago || "").trim() || "sin pago";
          const total = Number(o.totale) || 0;
          const items = parseTicketItems(o.items);
          const nota = String(o.nota || "").trim();
          const notaCucina = String(o.nota_cucina || "").trim();

          return (
            <div key={`${id}-${o.ts || o.hora || ""}`} style={{
              border:"1px solid rgba(255,255,255,0.09)",
              background:"rgba(0,0,0,0.18)",
              borderRadius:14,
              padding:"13px 14px",
              marginTop:10,
              overflow:"hidden"
            }}>
              <div style={{display:"flex",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
                <div style={{flex:"1 1 230px",minWidth:0}}>
                  <div style={{color:"#fff",fontWeight:900,fontSize:14,lineHeight:1.35,
                    wordBreak:"break-word"}}>
                    {id} · {nombre} · {o.hora || "--:--"} · {tipoLabel}
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:7}}>
                    <span style={{background:"rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.68)",
                      border:"1px solid rgba(255,255,255,0.08)",borderRadius:999,
                      padding:"3px 9px",fontSize:11,fontWeight:800,textTransform:"uppercase"}}>
                      {pago}
                    </span>
                    <span style={{background:"rgba(34,197,94,0.12)",color:C.verde,
                      border:"1px solid rgba(34,197,94,0.28)",borderRadius:999,
                      padding:"3px 9px",fontSize:11,fontWeight:900,fontFamily:"'DM Mono',monospace"}}>
                      {total.toFixed(2)}€
                    </span>
                  </div>
                </div>
              </div>

              <div style={{marginTop:11,display:"flex",flexDirection:"column",gap:6}}>
                {items.length === 0 ? (
                  <div style={{color:"rgba(255,255,255,0.38)",fontSize:13}}>
                    Sin productos guardados.
                  </div>
                ) : items.map((it, idx) => (
                  <div key={`${it.nome}-${idx}`} style={{display:"flex",gap:8,
                    color:"rgba(255,255,255,0.76)",fontSize:13,lineHeight:1.4}}>
                    <span style={{color:C.giallo,fontWeight:900,minWidth:22,
                      fontFamily:"'DM Mono',monospace"}}>{it.qty}×</span>
                    <span style={{wordBreak:"break-word"}}>
                      {it.nome}
                      {it.variante && (
                        <span style={{color:"rgba(255,255,255,0.45)"}}> — {it.variante}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {(nota || notaCucina) && (
                <div style={{marginTop:11,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.06)",
                  color:"rgba(255,255,255,0.55)",fontSize:12,lineHeight:1.45}}>
                  {nota && <div><strong style={{color:"rgba(255,255,255,0.72)"}}>Nota:</strong> {nota}</div>}
                  {notaCucina && <div><strong style={{color:"rgba(255,255,255,0.72)"}}>Cocina:</strong> {notaCucina}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const StatCard = ({label,v,sub,color,icon,delta}) => {
    const dColor = delta == null ? null : delta > 0 ? C.verde : delta < 0 ? C.rosso : "rgba(255,255,255,0.4)";
    const dArrow = delta == null ? "" : delta > 0 ? "▲" : delta < 0 ? "▼" : "•";
    return (
      <div style={{...glassCard, flex:1, minWidth:130, marginBottom:0}}>
        {shimmerLine}
        <div style={{position:"absolute",top:0,left:0,right:0,height:"45%",
          background:"linear-gradient(180deg,rgba(255,255,255,0.06) 0%,transparent 100%)",pointerEvents:"none"}}/>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{color:"rgba(255,255,255,0.35)",fontSize:10,letterSpacing:2,
            textTransform:"uppercase",fontWeight:800}}>{label}</div>
          {delta != null && (
            <div style={{color:dColor,fontSize:11,fontWeight:800,
              fontFamily:"'DM Mono',monospace",letterSpacing:.5,
              background:`${dColor}1f`,border:`1px solid ${dColor}55`,
              borderRadius:6,padding:"1px 6px"}}>
              {dArrow} {Math.abs(delta)}%
            </div>
          )}
        </div>
        <div style={{display:"flex",alignItems:"baseline",gap:6}}>
          {icon&&<span style={{fontSize:22}}>{icon}</span>}
          <div style={{color:color||C.verde,fontSize:30,fontWeight:900,
            fontFamily:"'DM Mono',monospace",
            textShadow:`0 0 20px ${color||C.verde}66`}}>{v}</div>
        </div>
        {sub&&<div style={{color:"rgba(255,255,255,0.3)",fontSize:12,marginTop:5,fontWeight:500}}>{sub}</div>}
      </div>
    );
  };

  // Card KPI cliccabile per la nuova griglia 2×3
  const KpiCard = ({label, value, sub, icon, color, onClick, delta, disabled}) => {
    const dColor = delta == null ? null : delta > 0 ? C.verde : delta < 0 ? C.rosso : "rgba(255,255,255,0.4)";
    const dArrow = delta == null ? "" : delta > 0 ? "▲" : delta < 0 ? "▼" : "•";
    return (
      <button
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        style={{
          flex:"1 1 calc(50% - 5px)", minWidth:0,
          background:"rgba(255,255,255,0.045)",
          backdropFilter:"blur(20px) saturate(1.6)",
          WebkitBackdropFilter:"blur(20px) saturate(1.6)",
          border:"1px solid rgba(255,255,255,0.08)",
          borderRadius:18, padding:"16px 18px",
          textAlign:"left", cursor:disabled?"default":"pointer",
          position:"relative", overflow:"hidden",
          transition:"transform .15s, border-color .15s, box-shadow .15s",
          boxShadow:"0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
        onMouseEnter={e => { if(!disabled) { e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.borderColor=`${color||C.verde}55`; e.currentTarget.style.boxShadow=`0 8px 24px rgba(0,0,0,0.35), 0 0 0 1px ${color||C.verde}33`; } }}
        onMouseLeave={e => { e.currentTarget.style.transform="translateY(0)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"; e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)"; }}
      >
        {/* Shimmer */}
        <div style={{position:"absolute",top:0,left:"6%",right:"6%",height:1,
          background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)",
          pointerEvents:"none"}}/>
        <div style={{position:"absolute",top:0,left:0,right:0,height:"40%",
          background:"linear-gradient(180deg,rgba(255,255,255,0.05) 0%,transparent 100%)",
          pointerEvents:"none"}}/>

        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8}}>
          <div style={{color:"rgba(255,255,255,0.4)", fontSize:10, letterSpacing:1.8,
            textTransform:"uppercase", fontWeight:800}}>{label}</div>
          {delta != null && (
            <div style={{color:dColor, fontSize:10, fontWeight:800,
              fontFamily:"'DM Mono',monospace",
              background:`${dColor}1f`, border:`1px solid ${dColor}44`,
              borderRadius:6, padding:"1px 5px"}}>
              {dArrow} {Math.abs(delta)}%
            </div>
          )}
        </div>
        <div style={{display:"flex", alignItems:"baseline", gap:6}}>
          {icon && <span style={{fontSize:22}}>{icon}</span>}
          <div style={{
            color:color||C.verde, fontSize:26, fontWeight:900,
            fontFamily:"'DM Mono',monospace",
            textShadow:`0 0 18px ${color||C.verde}55`,
            lineHeight:1.05
          }}>{value}</div>
        </div>
        {sub && <div style={{color:"rgba(255,255,255,0.32)", fontSize:11, marginTop:6, fontWeight:500}}>{sub}</div>}
        {!disabled && (
          <div style={{position:"absolute", bottom:8, right:10,
            color:"rgba(255,255,255,0.18)", fontSize:13, fontWeight:700}}>›</div>
        )}
      </button>
    );
  };

  return (
    <div style={{background:C.nero,minHeight:"100vh",display:"flex",
      flexDirection:"column",animation:"fadeIn .3s ease"}}>

      {/* Header glass */}
      <div style={{
        background:"rgba(14,14,14,0.82)",
        backdropFilter:"blur(32px) saturate(1.8)",
        WebkitBackdropFilter:"blur(32px) saturate(1.8)",
        borderBottom:"1px solid rgba(255,255,255,0.08)",
        boxShadow:"0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.10)",
        padding:"12px 16px",
        display:"flex",alignItems:"center",gap:12,
        position:"sticky",top:0,zIndex:200,flexShrink:0
      }}>
        <div style={{position:"absolute",top:0,left:"5%",right:"5%",height:1,
          background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)",pointerEvents:"none"}}/>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",
          border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.5)",
          borderRadius:10,width:36,height:36,fontSize:18,cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>←</button>
        <div style={{width:48,height:48,borderRadius:13,overflow:"visible",flexShrink:0,
          background:"rgba(6,6,6,0.85)",
          border:"2px solid rgba(232,52,28,0.7)",
          boxShadow:"0 0 22px rgba(232,52,28,0.5), 0 0 50px rgba(200,30,8,0.2)",
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <img src={LOGO_RED_SRC} style={{
            width:"115%",height:"115%",objectFit:"contain",
            filter:"brightness(1.35) contrast(1.2) saturate(1.3) drop-shadow(0 0 8px rgba(255,60,20,0.75))"
          }}/>
        </div>
        <div style={{flex:1}}>
          <div style={{color:"rgba(255,255,255,0.8)",fontWeight:900,fontSize:17,letterSpacing:.2}}>ECONOMÍA</div>
          {a&&<div style={{color:"rgba(255,255,255,0.3)",fontSize:11,marginTop:1}}>
            {a.countOrdini} pedidos entregados
          </div>}
        </div>
        <button onClick={()=>setRefresh(r=>r+1)} style={{
          background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",
          color:"rgba(255,255,255,0.4)",borderRadius:10,width:36,height:36,fontSize:16,
          display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",
          flexShrink:0}} title="Aggiorna">⟳</button>
      </div>

      <div style={{flex:1,padding:"14px 14px 40px",overflowY:"auto"}}>

        {/* Filtro periodo — pill principali */}
        <div style={{display:"flex",gap:8,marginBottom:8,overflowX:"auto"}}>
          {PERIODI.map(p=>{
            const attivo = periodo===p.id;
            return (
              <button key={p.id} onClick={()=>{ setPeriodo(p.id); setGiornoFiltro(null); }} style={{
                background: attivo
                  ? "linear-gradient(145deg,rgba(232,52,28,0.9),rgba(160,20,8,0.95))"
                  : "rgba(255,255,255,0.055)",
                backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
                border:`1.5px solid ${attivo?"rgba(255,100,60,0.5)":"rgba(255,255,255,0.10)"}`,
                color:attivo?"#fff":"rgba(255,255,255,0.4)",
                borderRadius:99,padding:"7px 18px",fontSize:13,fontWeight:700,
                whiteSpace:"nowrap",flexShrink:0,cursor:"pointer",
                boxShadow:attivo?"0 4px 14px rgba(232,52,28,0.4)":"none"
              }}>{p.label}</button>
            );
          })}
        </div>

        {/* Selettore giorni — Caja del día */}
        {periodo === "serata" && (
          <div style={{
            background:"rgba(255,255,255,0.03)",
            border:"1px solid rgba(255,255,255,0.08)",
            borderRadius:14, padding:"10px 12px", marginBottom:14
          }}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <div style={{color:"#fff",fontSize:14,fontWeight:900,flex:1}}>
                Caja del día — {cajaFechaLabel}
              </div>
              <div style={{color:"rgba(255,255,255,0.35)",fontSize:11,
                fontFamily:"'DM Mono',monospace"}}>
                {cajaDiaData.countOrdini || 0} ped.
              </div>
            </div>
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
              {(diasCaja.length > 0 ? diasCaja : [{data: oggiIso, incasso: serataData?.incasso || 0, ordini: serataData?.countOrdini || 0}]).map(d=>{
                const attivo = (diaCajaSeleccionado || diasCaja[0]?.data || oggiIso) === d.data;
                return (
                  <button key={d.data} onClick={()=>setDiaCajaSeleccionado(d.data)} style={{
                    background: attivo
                      ? "linear-gradient(145deg,rgba(249,115,22,0.85),rgba(200,60,0,0.9))"
                      : "rgba(255,255,255,0.07)",
                    border:`1.5px solid ${attivo?"rgba(249,115,22,0.6)":"rgba(255,255,255,0.10)"}`,
                    color: attivo?"#fff":"rgba(255,255,255,0.55)",
                    borderRadius:10, padding:"6px 12px", fontSize:12, fontWeight:700,
                    whiteSpace:"nowrap", flexShrink:0, cursor:"pointer",
                    boxShadow:attivo?"0 3px 10px rgba(249,115,22,0.4)":"none",
                    display:"flex", flexDirection:"column", alignItems:"center", gap:2
                  }}>
                    <span>{fmtGiorno(d.data)}</span>
                    <span style={{opacity:.7,fontSize:10,fontWeight:600}}>
                      {d.ordini || 0} ped · {Number(d.incasso || 0).toFixed(0)}€
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ LEGACY VIEW — nascosto dietro `false &&` durante il refactor ═══ */}
        {false && (periodo === "serata" ? (
          serataLoad ? (
            <div style={{textAlign:"center",padding:"60px 0",color:"rgba(255,255,255,0.3)"}}>
              <div style={{fontSize:36,marginBottom:12,animation:"pulse 1.5s infinite"}}>🔴</div>
              <div style={{fontSize:14}}>Cargando caja del día...</div>
            </div>
          ) : serataError ? (
            <div style={{...glassCard,borderColor:"rgba(232,52,28,0.3)"}}>
              {shimmerLine}
              <div style={{color:C.rosso,fontWeight:700,fontSize:14}}>⚠ {serataError}</div>
            </div>
          ) : !serataData || serataData.countOrdini === 0 ? (
            <div style={glassCard}>
              {shimmerLine}
              <div style={{color:"rgba(255,255,255,0.4)",fontSize:14,textAlign:"center",padding:"30px 0"}}>
                <div style={{fontSize:40,marginBottom:12}}>🍕</div>
                Ningún pedido entregado para este día<br/>
                <span style={{fontSize:12,opacity:.6}}>Los pedidos aparecen aquí cuando se marcan como Retirado</span>
              </div>
            </div>
          ) : (
            <>
              {/* KPI serata — riga 1 */}
              <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}}>
                <StatCard label="Incasso serata" v={`${(serataData.incasso||0).toFixed(0)}€`}
                  color={C.verde} icon="💶"/>
                <StatCard label="Ticket medio" v={`${(serataData.ticketMedio||0).toFixed(1)}€`}
                  color={C.blu} icon="🎯"/>
                <StatCard label="Ordini" v={serataData.countOrdini}
                  sub="entregados hoy" color={C.giallo} icon="📦"/>
              </div>
              {/* KPI serata — riga 2 */}
              <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
                <StatCard label="Pizzas" v={serataData.pizzeTot||0}
                  sub="piezas hoy" color={C.rosso} icon="🍕"/>
                <StatCard label="Bebidas" v={serataData.bevandeTot||0}
                  sub="piezas hoy" color={C.viola||"#9B59B6"} icon="🥤"/>
                {serataData.consegne && (serataData.consegne.DOMICILIO > 0 || serataData.consegne.RITIRO > 0) && (
                  <StatCard label="Delivery"
                    v={serataData.consegne.DOMICILIO||0}
                    sub={`${serataData.consegne.RITIRO||0} en local`}
                    color="#F97316" icon="🛵"/>
                )}
              </div>

              {/* Caja serata (efectivo/tarjeta/bizum) */}
              <BloccoCaja pagamenti={serataData.pagamenti} titolo="Caja del día"/>

              {/* Canali serata */}
              {serataData.canali && Object.keys(serataData.canali).length > 0 && (
                <div style={glassCard}>
                  {shimmerLine}
                  <div style={{color:"rgba(255,255,255,0.8)",fontWeight:800,fontSize:15,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <span>📡</span><span>Canale</span>
                  </div>
                  {Object.entries(serataData.canali).sort((a,b)=>b[1]-a[1]).map(([c,n])=>{
                    const tot2 = Object.values(serataData.canali).reduce((s,x)=>s+x,0);
                    const col = {WA:C.wa,TEL:C.blu,BANCO:C.rosso,MANUAL:"#F97316"}[c]||C.grigio;
                    const lbl = {WA:"💬 WhatsApp",TEL:"📞 Teléfono",BANCO:"🏪 Barra",MANUAL:"✍️ Manual"}[c]||c;
                    return (
                      <div key={c} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                        <span style={{color:"rgba(255,255,255,0.6)",fontSize:13,minWidth:130,fontWeight:500}}>{lbl}</span>
                        <div style={{flex:1,background:"rgba(255,255,255,0.06)",borderRadius:5,height:10,overflow:"hidden"}}>
                          <div style={{background:`linear-gradient(90deg,${col}88,${col})`,borderRadius:5,height:"100%",
                            width:`${(n/tot2)*100}%`,transition:"width .7s",boxShadow:`0 0 8px ${col}55`}}/>
                        </div>
                        <span style={{color:col,fontWeight:800,minWidth:32,textAlign:"right",fontFamily:"'DM Mono',monospace",fontSize:14}}>{n}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tutto il venduto stasera */}
              {serataData.prodotti && serataData.prodotti.length > 0 && (
                <div style={glassCard}>
                  {shimmerLine}
                  <div style={{position:"absolute",top:0,left:0,right:0,height:"40%",
                    background:"linear-gradient(180deg,rgba(255,255,255,0.05) 0%,transparent 100%)",pointerEvents:"none"}}/>
                  <div style={{color:"rgba(255,255,255,0.8)",fontWeight:800,fontSize:15,
                    marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                    <span>🍕</span><span>Vendido hoy</span>
                    <span style={{marginLeft:"auto",color:"rgba(255,255,255,0.3)",fontSize:12,fontWeight:500}}>
                      {serataData.prodotti.reduce((s,p)=>s+p.q,0)} pz tot.
                    </span>
                  </div>
                  {serataData.prodotti.map((p,i)=>(
                    <div key={p.n} style={{display:"flex",alignItems:"center",gap:12,marginBottom:11}}>
                      <span style={{color:"rgba(255,255,255,0.2)",fontSize:12,fontWeight:800,minWidth:24,textAlign:"right"}}>#{i+1}</span>
                      <span style={{fontSize:20}}>{p.e||"🍕"}</span>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                          <span style={{color:"rgba(255,255,255,0.85)",fontSize:14,fontWeight:600}}>{p.n}</span>
                          <span style={{color:"rgba(255,255,255,0.4)",fontSize:12,fontFamily:"'DM Mono',monospace"}}>
                            {p.q} pz · {(p.incasso||0).toFixed(0)}€
                          </span>
                        </div>
                        <div style={{background:"rgba(255,255,255,0.06)",borderRadius:4,height:6,overflow:"hidden",border:"1px solid rgba(255,255,255,0.04)"}}>
                          <div style={{
                            background:COLORI[i]||C.grigio,borderRadius:4,height:"100%",
                            width:`${(p.q/(serataData.prodotti[0].q||1))*100}%`,
                            transition:"width .7s ease",boxShadow:`0 0 8px ${COLORI[i]||C.grigio}66`
                          }}/>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )
        ) : loading ? (
          <div style={{textAlign:"center",padding:"80px 0",color:"rgba(255,255,255,0.3)"}}>
            <div style={{fontSize:40,marginBottom:14,animation:"pulse 1.5s infinite"}}>📊</div>
            <div style={{fontSize:14}}>Cargando estadísticas...</div>
          </div>
        ) : error ? (
          <div style={{...glassCard, borderColor:"rgba(232,52,28,0.3)"}}>
            {shimmerLine}
            <div style={{color:C.rosso,fontWeight:700,fontSize:14,marginBottom:6}}>⚠ {error}</div>
            <div style={{color:"rgba(255,255,255,0.3)",fontSize:12,lineHeight:1.6,marginBottom:10}}>
              Los pedidos aparecerán aquí una vez que se entreguen y se guarden en el histórico.
              Cada vez que marcas un pedido como "Retirado", se añade automáticamente.
            </div>
            {debugRaw && (
              <div style={{background:"rgba(0,0,0,0.4)",borderRadius:8,padding:"10px 12px",
                border:"1px solid rgba(255,255,255,0.08)"}}>
                <div style={{color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:700,
                  letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>DEBUG — respuesta backend:</div>
                <pre style={{color:"rgba(255,200,100,0.7)",fontSize:11,
                  fontFamily:"'DM Mono',monospace",overflowX:"auto",whiteSpace:"pre-wrap",
                  wordBreak:"break-all",margin:0}}>
                  {JSON.stringify(debugRaw, null, 2).slice(0, 800)}
                </pre>
              </div>
            )}
          </div>
        ) : !a ? (
          <div style={{...glassCard}}>
            {shimmerLine}
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:14,textAlign:"center",padding:"30px 0"}}>
              <div style={{fontSize:40,marginBottom:12}}>📊</div>
              Sin datos todavía — entrega tu primer pedido para ver las estadísticas
            </div>
          </div>
        ) : (
          <>
            {/* ═══ VISTA GIORNO SINGOLO (quando si tappa un giorno nella riga date) ═══ */}
            {giornoFiltro && (
              aGiorno ? (
                <>
                  <div style={{...glassCard, borderColor:"rgba(249,115,22,0.25)", marginBottom:10}}>
                    {shimmerLine}
                    <div style={{color:"rgba(249,115,22,0.9)",fontWeight:800,fontSize:13,
                      letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>
                      Noche del {giornoFiltro.split("-").reverse().join("/")}
                    </div>
                    <div style={{color:"rgba(255,255,255,0.35)",fontSize:11}}>
                      Toca de nuevo la fecha para deseleccionar
                    </div>
                  </div>
                  {/* KPI giorno */}
                  <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}}>
                    <StatCard label="Incasso" v={`${(aGiorno.incasso||0).toFixed(0)}€`} color={C.verde} icon="💶"/>
                    <StatCard label="Ticket medio" v={`${(aGiorno.ticketMedio||0).toFixed(1)}€`} color={C.blu} icon="🎯"/>
                    <StatCard label="Ordini" v={aGiorno.countOrdini} sub="esa noche" color={C.giallo} icon="📦"/>
                  </div>
                  <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
                    <StatCard label="Pizzas" v={aGiorno.pizzeTot||0} sub="piezas" color={C.rosso} icon="🍕"/>
                    <StatCard label="Bebidas" v={aGiorno.bevandeTot||0} sub="uds." color="#9B59B6" icon="🥤"/>
                    {((aGiorno.consegne?.DOMICILIO||0)+(aGiorno.consegne?.RITIRO||0)) > 0 && (
                      <StatCard label="Delivery" v={aGiorno.consegne.DOMICILIO||0}
                        sub={`${aGiorno.consegne.RITIRO||0} en local`} color="#F97316" icon="🛵"/>
                    )}
                  </div>
                  {/* Caja del giorno (efectivo/tarjeta/bizum) */}
                  <BloccoCaja pagamenti={aGiorno.pagamenti}
                    titolo={`Caja del ${giornoFiltro.split("-").reverse().join("/")}`}/>
                  {/* Prodotti quel giorno */}
                  {aGiorno.prodotti && aGiorno.prodotti.length > 0 && (
                    <div style={glassCard}>
                      {shimmerLine}
                      <div style={{color:"rgba(255,255,255,0.8)",fontWeight:800,fontSize:15,marginBottom:14,
                        display:"flex",alignItems:"center",gap:8}}>
                        <span>🍕</span><span>Vendido esa noche</span>
                        <span style={{marginLeft:"auto",color:"rgba(255,255,255,0.3)",fontSize:12,fontWeight:500}}>
                          {aGiorno.prodotti.reduce((s,p)=>s+p.q,0)} pz tot.
                        </span>
                      </div>
                      {aGiorno.prodotti.slice(0,10).map((p,i)=>(
                        <div key={p.n} style={{display:"flex",alignItems:"center",gap:12,marginBottom:11}}>
                          <span style={{color:"rgba(255,255,255,0.2)",fontSize:12,fontWeight:800,minWidth:24,textAlign:"right"}}>#{i+1}</span>
                          <span style={{fontSize:20}}>{p.e||"🍕"}</span>
                          <div style={{flex:1}}>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                              <span style={{color:"rgba(255,255,255,0.85)",fontSize:14,fontWeight:600}}>{p.n}</span>
                              <span style={{color:"rgba(255,255,255,0.4)",fontSize:12,fontFamily:"'DM Mono',monospace"}}>
                                {p.q} pz · {(p.incasso||0).toFixed(0)}€
                              </span>
                            </div>
                            <div style={{background:"rgba(255,255,255,0.06)",borderRadius:4,height:6,overflow:"hidden"}}>
                              <div style={{background:COLORI[i]||C.grigio,borderRadius:4,height:"100%",
                                width:`${(p.q/(aGiorno.prodotti[0].q||1))*100}%`,
                                transition:"width .7s",boxShadow:`0 0 8px ${COLORI[i]||C.grigio}66`}}/>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Canali quel giorno */}
                  {aGiorno.canali && Object.keys(aGiorno.canali).length > 0 && (
                    <div style={glassCard}>
                      {shimmerLine}
                      <div style={{color:"rgba(255,255,255,0.8)",fontWeight:800,fontSize:15,marginBottom:12,
                        display:"flex",alignItems:"center",gap:8}}>
                        <span>📡</span><span>Canale</span>
                      </div>
                      {Object.entries(aGiorno.canali).sort((a,b)=>b[1]-a[1]).map(([c,n])=>{
                        const tot2=Object.values(aGiorno.canali).reduce((s,x)=>s+x,0);
                        const col={WA:C.wa,TEL:C.blu,BANCO:C.rosso,MANUAL:"#F97316"}[c]||C.grigio;
                        const lbl={WA:"💬 WhatsApp",TEL:"📞 Teléfono",BANCO:"🏪 Barra",MANUAL:"✍️ Manual"}[c]||c;
                        return (
                          <div key={c} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                            <span style={{color:"rgba(255,255,255,0.6)",fontSize:13,minWidth:130,fontWeight:500}}>{lbl}</span>
                            <div style={{flex:1,background:"rgba(255,255,255,0.06)",borderRadius:5,height:9,overflow:"hidden"}}>
                              <div style={{background:`linear-gradient(90deg,${col}88,${col})`,borderRadius:5,
                                height:"100%",width:`${(n/tot2)*100}%`,transition:"width .7s"}}/>
                            </div>
                            <span style={{color:col,fontWeight:800,minWidth:32,textAlign:"right",
                              fontFamily:"'DM Mono',monospace",fontSize:13}}>{n}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div style={glassCard}>
                  {shimmerLine}
                  <div style={{color:"rgba(255,255,255,0.35)",fontSize:13,textAlign:"center",padding:"24px 0"}}>
                    Sin datos para {giornoFiltro.split("-").reverse().join("/")}
                    <div style={{fontSize:11,marginTop:6,opacity:.6}}>Cierra el servicio para guardar los datos</div>
                  </div>
                </div>
              )
            )}

            {/* ═══ VISTA AGGREGATA (nascosta quando c'è un giorno selezionato) ═══ */}
            {!giornoFiltro && <>

            {/* Sub-tab: Dinero / Operativa / Clientes */}
            <div style={{display:"flex",gap:6,marginBottom:14,
              background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",
              borderRadius:12,padding:4}}>
              {[
                {id:"dinero",   label:"💰 Dinero"},
                {id:"operativa",label:"🛵 Operativa"},
                {id:"clientes", label:"👥 Clientes"},
              ].map(t => {
                const attivo = subTab === t.id;
                return (
                  <button key={t.id} onClick={()=>setSubTab(t.id)} style={{
                    flex:1,
                    background: attivo
                      ? "linear-gradient(145deg,rgba(232,52,28,0.85),rgba(160,20,8,0.95))"
                      : "transparent",
                    border:`1px solid ${attivo?"rgba(255,100,60,0.5)":"transparent"}`,
                    color: attivo?"#fff":"rgba(255,255,255,0.45)",
                    borderRadius:9, padding:"8px 6px", fontSize:12, fontWeight:800,
                    cursor:"pointer",
                    boxShadow:attivo?"0 4px 12px rgba(232,52,28,0.35)":"none",
                    transition:"all .2s"
                  }}>{t.label}</button>
                );
              })}
            </div>

            {/* ───── TAB DINERO ───── */}
            {subTab === "dinero" && <>
            {/* Selector giorno navigazione (vecchio, rimosso) */}
            {false && a.giorniDettaglio && a.giorniDettaglio.length > 0 && (
              <div style={{
                display:"flex",alignItems:"center",gap:10,
                marginBottom:14,
                background:"rgba(255,255,255,0.04)",
                border:"1px solid rgba(255,255,255,0.08)",
                borderRadius:14,padding:"10px 14px"
              }}>
                <button
                  onClick={()=>setDiaIdx(i=>Math.min(i+1,a.giorniDettaglio.length-1))}
                  disabled={diaIdx>=a.giorniDettaglio.length-1}
                  style={{background:"none",border:"none",color:diaIdx>=a.giorniDettaglio.length-1?"#333":"rgba(255,255,255,0.5)",
                    fontSize:22,cursor:"pointer",padding:"0 4px",lineHeight:1}}>‹</button>
                <div style={{flex:1,textAlign:"center"}}>
                  <div style={{color:"rgba(255,255,255,0.8)",fontWeight:800,fontSize:15}}>
                    {a.giorniDettaglio[diaIdx]?.data || "—"}
                  </div>
                  <div style={{color:"rgba(255,255,255,0.3)",fontSize:11,marginTop:2}}>
                    {a.giorniDettaglio[diaIdx]?.ordini||0} pedidos · {(a.giorniDettaglio[diaIdx]?.incasso||0).toFixed(0)}€
                  </div>
                </div>
                <button
                  onClick={()=>setDiaIdx(i=>Math.max(i-1,0))}
                  disabled={diaIdx<=0}
                  style={{background:"none",border:"none",color:diaIdx<=0?"#333":"rgba(255,255,255,0.5)",
                    fontSize:22,cursor:"pointer",padding:"0 4px",lineHeight:1}}>›</button>
              </div>
            )}

            {/* KPI riga 1 */}
            <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}}>
              <StatCard label="Ventas" v={`${(incasso||0).toFixed(0)}€`}
                sub={periodo==="tutto"?`${a.countOrdini} pedidos totales`:`de ${a.countOrdini} totales`}
                color={C.verde} icon="💶"
                delta={delta?.ventas}/>
              <StatCard label="Ticket medio" v={`${(a.ticketMedio||0).toFixed(1)}€`}
                color={C.blu} icon="🎯"
                delta={delta?.ticket}/>
            </div>
            {/* KPI riga 2 — pizze, bevande, delivery */}
            {(() => {
              const pizzeTot = (a.topProdotti||[]).filter(p=>p.cat!=="Bebidas").reduce((s,p)=>s+p.q,0);
              const bevTot   = (a.topProdotti||[]).filter(p=>p.cat==="Bebidas").reduce((s,p)=>s+p.q,0);
              const dom = a.consegne?.DOMICILIO||0;
              const rit = a.consegne?.RITIRO||0;
              return (
                <div style={{display:"flex",gap:10,marginBottom:periodoVuoto?8:14,flexWrap:"wrap"}}>
                  <StatCard label="Pizzas" v={pizzeTot} sub="piezas totales" color={C.rosso} icon="🍕"/>
                  <StatCard label="Bebidas" v={bevTot}  sub="piezas totales" color="#9B59B6" icon="🥤"/>
                  {(dom>0||rit>0) && (
                    <StatCard label="Delivery" v={dom} sub={`${rit} en local`} color="#F97316" icon="🛵"/>
                  )}
                </div>
              );
            })()}

            {periodoVuoto && periodoLabel && (
              <div style={{
                background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",
                borderRadius:12,padding:"10px 14px",marginBottom:14,
                color:"rgba(255,255,255,0.35)",fontSize:12,textAlign:"center"
              }}>
                Sin pedidos {periodoLabel} — el total histórico es {a.incassoTot.toFixed(0)}€
              </div>
            )}

            {/* Caja periodo (efectivo/tarjeta/bizum) — rispetta filtro periodo */}
            <BloccoCaja
              pagamenti={
                periodo==="sett" ? a.pagamentiSett
                : periodo==="mese" ? a.pagamentiMese
                : a.pagamenti
              }
              titolo={periodo==="sett" ? "Caja de la semana"
                : periodo==="mese" ? "Caja del mes"
                : "Caja total"}/>

            {/* Debug: mostra campi ricevuti se totale=0 */}
            {a.incassoTot === 0 && a.countOrdini > 0 && rawData && !rawData._preAggregated && (
              <div style={{
                background:"rgba(255,200,0,0.08)",
                border:"1px solid rgba(255,200,0,0.3)",
                borderRadius:14,padding:"14px 16px",marginBottom:14
              }}>
                <div style={{color:"#F5C842",fontWeight:800,fontSize:13,marginBottom:8}}>
                  ⚠ {a.countOrdini} pedidos encontrados pero importe = 0€
                </div>
                <pre style={{
                  color:"rgba(255,220,100,0.7)",fontSize:11,
                  fontFamily:"'DM Mono',monospace",
                  background:"rgba(0,0,0,0.4)",borderRadius:8,
                  padding:"8px 10px",overflowX:"auto",
                  whiteSpace:"pre-wrap",wordBreak:"break-all",margin:0
                }}>
                  {JSON.stringify(rawData[0], null, 2).slice(0,600)}
                </pre>
              </div>
            )}

            {/* Prodotti — tab Pizze / Bevande */}
            {a.topProdotti && a.topProdotti.length > 0 && (() => {
              const pizze   = a.topProdotti.filter(p=>p.cat!=="Bebidas");
              const bevande = a.topProdotti.filter(p=>p.cat==="Bebidas");
              const lista   = prodTab==="bevande" ? bevande : pizze;
              const maxQ    = lista[0]?.q || 1;
              return (
                <div style={glassCard}>
                  {shimmerLine}
                  <div style={{position:"absolute",top:0,left:0,right:0,height:"40%",
                    background:"linear-gradient(180deg,rgba(255,255,255,0.05) 0%,transparent 100%)",pointerEvents:"none"}}/>
                  {/* Header con tab */}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
                    <span style={{color:"rgba(255,255,255,0.8)",fontWeight:800,fontSize:16,flex:1}}>
                      🏆 Más vendidos
                    </span>
                    <div style={{display:"flex",gap:4}}>
                      {[{id:"pizze",label:"🍕 Pizzas"},{id:"bevande",label:"🥤 Bebidas"}].map(t=>(
                        <button key={t.id} onClick={()=>setProdTab(t.id)} style={{
                          background:prodTab===t.id?"rgba(232,52,28,0.7)":"rgba(255,255,255,0.07)",
                          border:`1px solid ${prodTab===t.id?"rgba(255,100,60,0.5)":"rgba(255,255,255,0.1)"}`,
                          color:prodTab===t.id?"#fff":"rgba(255,255,255,0.4)",
                          borderRadius:8,padding:"4px 10px",fontSize:12,fontWeight:700,cursor:"pointer"
                        }}>{t.label}</button>
                      ))}
                    </div>
                  </div>
                  {lista.length === 0 ? (
                    <div style={{color:"rgba(255,255,255,0.25)",fontSize:13,textAlign:"center",padding:"16px 0"}}>
                      Sin datos para este período
                    </div>
                  ) : lista.slice(0,8).map((p,i)=>(
                    <div key={p.n} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                      <span style={{color:"rgba(255,255,255,0.2)",fontSize:13,fontWeight:800,
                        minWidth:24,textAlign:"right"}}>#{i+1}</span>
                      <span style={{fontSize:20}}>{p.e||(prodTab==="bevande"?"🥤":"🍕")}</span>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                          <span style={{color:"rgba(255,255,255,0.85)",fontSize:14,fontWeight:600}}>{p.n}</span>
                          <span style={{color:"rgba(255,255,255,0.4)",fontSize:12,fontFamily:"'DM Mono',monospace"}}>
                            {p.q} pz · {(p.incasso||0).toFixed(0)}€
                          </span>
                        </div>
                        <div style={{background:"rgba(255,255,255,0.06)",borderRadius:4,height:6,overflow:"hidden",
                          border:"1px solid rgba(255,255,255,0.04)"}}>
                          <div style={{
                            background:COLORI[i]||C.grigio,borderRadius:4,height:"100%",
                            width:`${(p.q/maxQ)*100}%`,transition:"width .7s ease",
                            boxShadow:`0 0 8px ${COLORI[i]||C.grigio}66`
                          }}/>
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Meno venduti in fondo */}
                  {lista.length > 3 && (
                    <>
                      <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",margin:"10px 0 10px",paddingTop:10}}>
                        <div style={{color:"rgba(255,255,255,0.3)",fontSize:11,fontWeight:700,
                          letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Menos pedidos</div>
                        {[...lista].reverse().slice(0,3).map(p=>(
                          <div key={p.n+"_less"} style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                            <span style={{fontSize:16}}>{p.e||(prodTab==="bevande"?"🥤":"🍕")}</span>
                            <span style={{color:"rgba(255,255,255,0.4)",fontSize:13,flex:1}}>{p.n}</span>
                            <span style={{color:C.rosso,fontWeight:800,fontSize:13,
                              fontFamily:"'DM Mono',monospace"}}>{p.q} pz</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Confronto 15 giorni — stesso giorno settimana scorsa */}
            {a.giorniDettaglio && a.giorniDettaglio.length > 1 && (() => {
              const confronto = buildConfronto(a.giorniDettaglio);
              if(confronto.length === 0) return null;
              const maxPizze = Math.max(...confronto.map(d=>Math.max(d.pizze||0,(d.prev?.pizze||0))), 1);
              return (
                <div style={glassCard}>
                  {shimmerLine}
                  <div style={{color:"rgba(255,255,255,0.8)",fontWeight:800,fontSize:16,
                    marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
                    <span>📅</span><span>Comparar semanas</span>
                  </div>
                  <div style={{color:"rgba(255,255,255,0.25)",fontSize:11,marginBottom:14}}>
                    Últimos 15 días vs misma noche semana pasada
                  </div>
                  {/* Legenda */}
                  <div style={{display:"flex",gap:16,marginBottom:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      <div style={{width:10,height:10,borderRadius:3,background:C.rosso}}/>
                      <span style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>Esta sem.</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      <div style={{width:10,height:10,borderRadius:3,background:"rgba(100,120,200,0.6)"}}/>
                      <span style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>Sem. pasada</span>
                    </div>
                  </div>
                  {confronto.map(d => {
                    const pctDelta = d.prev && d.prev.incasso > 0
                      ? Math.round(((d.incasso - d.prev.incasso) / d.prev.incasso) * 100)
                      : null;
                    const deltaColor = pctDelta === null ? "transparent"
                      : pctDelta > 0 ? C.verde : pctDelta < 0 ? C.rosso : "rgba(255,255,255,0.3)";
                    return (
                      <div key={d.data} style={{marginBottom:12,paddingBottom:10,
                        borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                        {/* Intestazione giorno */}
                        <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:5}}>
                          <span style={{color:"rgba(255,255,255,0.7)",fontWeight:800,fontSize:13,
                            minWidth:28}}>{d.label}</span>
                          <span style={{color:"rgba(255,255,255,0.35)",fontSize:11,
                            fontFamily:"'DM Mono',monospace"}}>{d.data}</span>
                          <span style={{flex:1}}/>
                          {pctDelta !== null && (
                            <span style={{color:deltaColor,fontWeight:800,fontSize:12,
                              fontFamily:"'DM Mono',monospace"}}>
                              {pctDelta>0?"+":""}{pctDelta}%
                            </span>
                          )}
                          <span style={{color:C.verde,fontWeight:800,fontSize:13,
                            fontFamily:"'DM Mono',monospace",minWidth:48,textAlign:"right"}}>
                            {d.incasso.toFixed(0)}€
                          </span>
                        </div>
                        {/* Barra pizze questa sett. */}
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                          <div style={{flex:1,background:"rgba(255,255,255,0.05)",borderRadius:4,height:7,overflow:"hidden"}}>
                            <div style={{background:`linear-gradient(90deg,${C.rosso}99,${C.rosso})`,
                              borderRadius:4,height:"100%",
                              width:`${((d.pizze||0)/maxPizze)*100}%`,transition:"width .6s"}}/>
                          </div>
                          <span style={{color:C.rosso,fontSize:11,fontFamily:"'DM Mono',monospace",
                            minWidth:40,textAlign:"right",fontWeight:700}}>
                            {d.pizze||0} 🍕
                          </span>
                        </div>
                        {/* Barra pizze sett. scorsa */}
                        {d.prev ? (
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{flex:1,background:"rgba(255,255,255,0.05)",borderRadius:4,height:5,overflow:"hidden"}}>
                              <div style={{background:"rgba(100,120,200,0.55)",
                                borderRadius:4,height:"100%",
                                width:`${((d.prev.pizze||0)/maxPizze)*100}%`,transition:"width .6s"}}/>
                            </div>
                            <span style={{color:"rgba(100,120,200,0.8)",fontSize:10,
                              fontFamily:"'DM Mono',monospace",minWidth:40,textAlign:"right"}}>
                              {d.prev.pizze||0} 🍕 · {d.prev.incasso.toFixed(0)}€
                            </span>
                          </div>
                        ) : (
                          <div style={{color:"rgba(255,255,255,0.15)",fontSize:10,paddingLeft:2}}>
                            — sem. pasada: sin datos
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            </>}

            {/* ───── TAB OPERATIVA ───── */}
            {subTab === "operativa" && <>

            {/* Canali */}
            {a.canali && Object.keys(a.canali).length > 0 && (
              <div style={glassCard}>
                {shimmerLine}
                <div style={{color:"rgba(255,255,255,0.8)",fontWeight:800,fontSize:16,
                  marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                  <span>📡</span><span>Canal de pedido</span>
                </div>
                {/* Delivery vs Ritiro */}
                {a.consegne && (a.consegne.DOMICILIO > 0 || a.consegne.RITIRO > 0) && (() => {
                  const totC = (a.consegne.DOMICILIO||0) + (a.consegne.RITIRO||0);
                  return (
                    <div style={{marginBottom:16}}>
                      {[{k:"DOMICILIO",label:"🛵 Delivery",col:"#F97316"},{k:"RITIRO",label:"🏪 En local",col:C.verde}].map(({k,label,col})=>{
                        const n = a.consegne[k]||0;
                        return (
                          <div key={k} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                            <span style={{color:"rgba(255,255,255,0.6)",fontSize:13,minWidth:110,fontWeight:500}}>{label}</span>
                            <div style={{flex:1,background:"rgba(255,255,255,0.06)",borderRadius:5,height:9,overflow:"hidden"}}>
                              <div style={{background:`linear-gradient(90deg,${col}88,${col})`,
                                borderRadius:5,height:"100%",width:`${(n/totC)*100}%`,transition:"width .7s",
                                boxShadow:`0 0 8px ${col}55`}}/>
                            </div>
                            <span style={{color:col,fontWeight:800,minWidth:56,textAlign:"right",
                              fontFamily:"'DM Mono',monospace",fontSize:13}}>
                              {n} ({Math.round((n/totC)*100)}%)
                            </span>
                          </div>
                        );
                      })}
                      <div style={{borderTop:"1px solid rgba(255,255,255,0.05)",marginBottom:12}}/>
                    </div>
                  );
                })()}
                {/* Canale (WA / Tel / Banco) */}
                {Object.entries(a.canali).sort((a,b)=>b[1]-a[1]).map(([c,n])=>{
                  const tot = Object.values(a.canali).reduce((s,x)=>s+x,0);
                  const col = CANAL_COLOR[c]||C.grigio;
                  return (
                    <div key={c} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                      <span style={{color:"rgba(255,255,255,0.6)",fontSize:13,minWidth:130,fontWeight:500}}>
                        {CANAL_LABEL[c]||c}
                      </span>
                      <div style={{flex:1,background:"rgba(255,255,255,0.06)",borderRadius:5,height:10,
                        overflow:"hidden",border:"1px solid rgba(255,255,255,0.04)"}}>
                        <div style={{background:`linear-gradient(90deg,${col}88,${col})`,
                          borderRadius:5,height:"100%",
                          width:`${(n/tot)*100}%`,transition:"width .7s",
                          boxShadow:`0 0 8px ${col}55`}}/>
                      </div>
                      <span style={{color:col,fontWeight:800,minWidth:32,textAlign:"right",
                        fontFamily:"'DM Mono',monospace",fontSize:14}}>{n}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Orari di punta */}
            {a.fasceOrarie && Object.keys(a.fasceOrarie).length > 0 && (
              <div style={glassCard}>
                {shimmerLine}
                <div style={{color:"rgba(255,255,255,0.8)",fontWeight:800,fontSize:16,
                  marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                  <span>🕐</span><span>Horarios de mayor demanda</span>
                </div>
                {FASCIA_ORDER.filter(f=>a.fasceOrarie[f]).map(f=>{
                  const maxVal = Math.max(...Object.values(a.fasceOrarie));
                  return (
                    <div key={f} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                      <span style={{color:"rgba(255,255,255,0.4)",fontSize:13,minWidth:60,
                        fontFamily:"'DM Mono',monospace",fontWeight:600}}>{f}</span>
                      <div style={{flex:1,background:"rgba(255,255,255,0.06)",borderRadius:4,height:8,
                        overflow:"hidden"}}>
                        <div style={{
                          background:`linear-gradient(90deg,${C.rosso},${C.giallo})`,
                          borderRadius:4,height:"100%",
                          width:`${(a.fasceOrarie[f]/maxVal)*100}%`,
                          transition:"width .7s",
                          boxShadow:"0 0 8px rgba(232,52,28,0.5)"
                        }}/>
                      </div>
                      <span style={{color:"rgba(255,255,255,0.7)",fontWeight:800,minWidth:28,
                        textAlign:"right",fontFamily:"'DM Mono',monospace"}}>
                        {a.fasceOrarie[f]}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {a.giorniSett && Object.keys(a.giorniSett).length > 0 && (
              <div style={glassCard}>
                {shimmerLine}
                <div style={{color:"rgba(255,255,255,0.8)",fontWeight:800,fontSize:16,
                  marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                  <span>📊</span><span>Por día de la semana</span>
                </div>
                {["Lunes","Martes","Miercoles","Jueves","Viernes","Sabado","Domingo"]
                  .filter(g=>a.giorniSett[g])
                  .map(g=>{
                    const maxVal = Math.max(...Object.values(a.giorniSett));
                    return (
                      <div key={g} style={{display:"flex",alignItems:"center",gap:12,marginBottom:9}}>
                        <span style={{color:"rgba(255,255,255,0.45)",fontSize:13,minWidth:80}}>{g}</span>
                        <div style={{flex:1,background:"rgba(255,255,255,0.06)",borderRadius:4,height:7,overflow:"hidden"}}>
                          <div style={{background:`linear-gradient(90deg,${C.blu}88,${C.blu})`,
                            borderRadius:4,height:"100%",
                            width:`${(a.giorniSett[g]/maxVal)*100}%`,
                            transition:"width .7s",boxShadow:`0 0 8px ${C.blu}66`}}/>
                        </div>
                        <span style={{color:C.blu,fontWeight:800,minWidth:28,
                          textAlign:"right",fontFamily:"'DM Mono',monospace"}}>
                          {a.giorniSett[g]}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
            </>}

            {/* ───── TAB CLIENTES (placeholder) ───── */}
            {subTab === "clientes" && (
              <div style={glassCard}>
                {shimmerLine}
                <div style={{textAlign:"center",padding:"40px 10px",color:"rgba(255,255,255,0.45)"}}>
                  <div style={{fontSize:42,marginBottom:14}}>👥</div>
                  <div style={{fontSize:15,fontWeight:700,color:"rgba(255,255,255,0.7)",marginBottom:8}}>
                    Próximamente
                  </div>
                  <div style={{fontSize:12,lineHeight:1.6,maxWidth:340,margin:"0 auto"}}>
                    Top 10 clientes por gasto · Nuevos vs recurrentes · Frecuencia y ticket medio · Clientes dormidos.
                  </div>
                </div>
              </div>
            )}

            </>}
          </>
        ))}

        {/* ═══ NUOVA VISTA — griglia 6 KPI cards cliccabili ═══ */}
        {(() => {
          const isLoad = periodo==="serata" ? (serataLoad || loading) : loading;
          const errMsg = periodo==="serata" ? serataError : error;
          if (isLoad) {
            return (
              <div style={{textAlign:"center",padding:"60px 0",color:"rgba(255,255,255,0.3)"}}>
                <div style={{fontSize:36,marginBottom:12,animation:"pulse 1.5s infinite"}}>
                  {periodo==="serata"?"🔴":"📊"}
                </div>
                <div style={{fontSize:14}}>Cargando…</div>
              </div>
            );
          }
          if (errMsg) {
            return (
              <div style={{...glassCard, borderColor:"rgba(232,52,28,0.3)"}}>
                {shimmerLine}
                <div style={{color:C.rosso,fontWeight:700,fontSize:14}}>⚠ {errMsg}</div>
              </div>
            );
          }
          if (!vista || vista.pedidos === 0) {
            return (
              <>
                <div style={glassCard}>
                  {shimmerLine}
                  <div style={{color:"rgba(255,255,255,0.4)",fontSize:14,textAlign:"center",padding:"30px 0"}}>
                    <div style={{fontSize:40,marginBottom:12}}>🍕</div>
                    {periodo==="serata"
                      ? <>Sin pedidos para este día<br/><span style={{fontSize:12,opacity:.6}}>Selecciona otro día de caja si lo necesitas</span></>
                      : "Sin datos para este período"}
                  </div>
                </div>
                {periodo === "serata" && <TicketList ordini={ordenesCajaDia} fechaLabel={cajaFechaLabel}/>}
              </>
            );
          }
          // ── Griglia KPI ──
          const fmtEur = (n,dec=0) => `${Number(n||0).toFixed(dec)}€`;
          return (
            <>
              <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:14}}>
                <KpiCard label="Ventas" icon="💶" color={C.verde}
                  value={fmtEur(vista.ventas)}
                  sub={periodo==="serata"?"del día":vista.etichetta}
                  delta={vista.contesto==="aggregata" ? delta?.ventas : null}
                  onClick={()=>setModalAperto("ventas")}/>
                <KpiCard label="Ticket medio" icon="🎯" color={C.blu}
                  value={fmtEur(vista.ticket,1)}
                  sub="por pedido"
                  delta={vista.contesto==="aggregata" ? delta?.ticket : null}
                  onClick={()=>setModalAperto("ticket")}/>
                <KpiCard label="Pedidos" icon="📦" color={C.giallo}
                  value={vista.pedidos}
                  sub="entregados"
                  delta={vista.contesto==="aggregata" ? delta?.ordini : null}
                  disabled/>
                <KpiCard label="Pizzas" icon="🍕" color={C.rosso}
                  value={vista.pizzas} sub="piezas"
                  onClick={()=>setModalAperto("pizzas")}/>
                <KpiCard label="Bebidas" icon="🥤" color="#9B59B6"
                  value={vista.bebidas} sub="uds."
                  onClick={()=>setModalAperto("bebidas")}/>
                <KpiCard label="Delivery" icon="🛵" color="#F97316"
                  value={vista.delivery} sub={`${vista.local} en local`}
                  onClick={()=>setModalAperto("delivery")}/>
              </div>

              {periodo === "serata" && (
                <TicketList ordini={ordenesCajaDia} fechaLabel={cajaFechaLabel}/>
              )}

              {/* Bottoni in fondo — sezioni secondarie */}
              <div style={{display:"flex",gap:10,marginTop:6}}>
                <button onClick={()=>setModalAperto("stats")} style={{
                  flex:1,background:"rgba(255,255,255,0.045)",
                  border:"1px solid rgba(255,255,255,0.10)",
                  color:"rgba(255,255,255,0.75)",borderRadius:14,
                  padding:"14px 16px",fontSize:14,fontWeight:800,cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                  transition:"all .15s"
                }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(100,150,255,0.5)";e.currentTarget.style.color="#fff";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.10)";e.currentTarget.style.color="rgba(255,255,255,0.75)";}}>
                  📈 <span>Estadísticas</span>
                </button>
                <button onClick={()=>setModalAperto("clientes")} style={{
                  flex:1,background:"rgba(255,255,255,0.045)",
                  border:"1px solid rgba(255,255,255,0.10)",
                  color:"rgba(255,255,255,0.75)",borderRadius:14,
                  padding:"14px 16px",fontSize:14,fontWeight:800,cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                  transition:"all .15s"
                }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(155,89,182,0.5)";e.currentTarget.style.color="#fff";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.10)";e.currentTarget.style.color="rgba(255,255,255,0.75)";}}>
                  👥 <span>Clientes</span>
                </button>
              </div>
            </>
          );
        })()}
      </div>

      {/* ═══ MODALS ═══ */}
      {modalAperto && vista && (() => {
        const fmtEur = (n,dec=2) => `${Number(n||0).toFixed(dec)}€`;
        const titoloCtx = vista.etichetta;
        const closeM = () => setModalAperto(null);

        // ── VENTAS ──
        if (modalAperto === "ventas") {
          const pag = vista.pagamenti || {};
          const totalPag = Object.values(pag).reduce((s,p)=>s+(p.incasso||0),0);
          const PAG_ROWS = [
            {k:"efectivo",        label:"💵 Efectivo",       col:C.verde},
            {k:"tarjeta",         label:"💳 Tarjeta",        col:C.blu},
            {k:"bizum",           label:"📱 Bizum",          col:"#9B59B6"},
            {k:"no_especificado", label:"❓ No especificado", col:"rgba(255,255,255,0.5)"},
          ];
          return (
            <Modal titolo={vista.contesto === "caja" ? "Caja del día" : "Ventas"} sub={titoloCtx} icona="💶" color={C.verde} onClose={closeM}>
              <RigaDato label="Total ventas" value={fmtEur(vista.ventas)} color={C.verde} big/>
              <ModalSection titolo="Cobros por método de pago">
                {PAG_ROWS.map(({k,label,col}) => {
                  const p = pag[k] || {incasso:0,count:0};
                  if (p.incasso === 0 && p.count === 0) return null;
                  const pct = totalPag > 0 ? Math.round((p.incasso/totalPag)*100) : 0;
                  return (
                    <RigaDato key={k} label={label}
                      value={fmtEur(p.incasso)} color={col}
                      sub={`${p.count} ped · ${pct}%`}/>
                  );
                })}
              </ModalSection>
            </Modal>
          );
        }

        // ── TICKET MEDIO ──
        if (modalAperto === "ticket") {
          // Calcola distribuzione da rawData filtrato per contesto
          const allOrds = (() => {
            if (vista.contesto === "caja") return ordenesCajaDia;
            if (vista.contesto === "giorno" && rawData) {
              return (Array.isArray(rawData)?rawData:[]).filter(r => String(r.fecha||"").slice(0,10) === giornoFiltro);
            }
            return Array.isArray(rawData) ? rawData : [];
          })();
          const totals = allOrds.map(r => {
            let t = Number(r.totale)||0;
            if (t<=0) {
              let items = r.items;
              if (typeof items === "string") { try { items = JSON.parse(items); } catch(e){ items=[]; } }
              t = calcTotaleHelper((items||[]).filter(i=>i.n!=="Entrega a domicilio"), r.tipo_consegna||"RITIRO");
            }
            return t;
          }).filter(t => t > 0).sort((a,b)=>a-b);
          const min = totals[0]||0, max = totals[totals.length-1]||0;
          const mediana = totals.length ? totals[Math.floor(totals.length/2)] : 0;
          const bands = [
            {label:"<15€",   min:0,  max:15},
            {label:"15-25€", min:15, max:25},
            {label:"25-40€", min:25, max:40},
            {label:">40€",   min:40, max:Infinity},
          ].map(b => ({...b, n: totals.filter(t => t >= b.min && t < b.max).length}));
          return (
            <Modal titolo="Ticket medio" sub={titoloCtx} icona="🎯" color={C.blu} onClose={closeM}>
              <RigaDato label="Ticket medio" value={fmtEur(vista.ticket)} color={C.blu} big/>
              <ModalSection titolo="Rango de pedidos">
                <RigaDato label="🔻 Mínimo"  value={fmtEur(min)}/>
                <RigaDato label="🔺 Máximo"  value={fmtEur(max)}/>
                <RigaDato label="📊 Mediana" value={fmtEur(mediana)}/>
              </ModalSection>
              <ModalSection titolo="Distribución">
                {bands.map(b => {
                  const pct = totals.length>0 ? (b.n/totals.length)*100 : 0;
                  return (
                    <div key={b.label} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                      <span style={{color:"rgba(255,255,255,0.6)",fontSize:13,minWidth:70,
                        fontFamily:"'DM Mono',monospace"}}>{b.label}</span>
                      <div style={{flex:1,background:"rgba(255,255,255,0.06)",borderRadius:4,height:9,overflow:"hidden"}}>
                        <div style={{background:`linear-gradient(90deg,${C.blu}88,${C.blu})`,
                          borderRadius:4,height:"100%",width:`${pct}%`,transition:"width .5s"}}/>
                      </div>
                      <span style={{color:C.blu,fontWeight:800,minWidth:30,textAlign:"right",
                        fontFamily:"'DM Mono',monospace",fontSize:13}}>{b.n}</span>
                    </div>
                  );
                })}
              </ModalSection>
            </Modal>
          );
        }

        // ── PIZZAS ── (e simile a BEBIDAS)
        if (modalAperto === "pizzas" || modalAperto === "bebidas") {
          const isPiz = modalAperto === "pizzas";
          const lista = isPiz ? (vista.prodottiPizzas||[]) : (vista.prodottiBebidas||[]);
          const totQ = lista.reduce((s,p)=>s+(p.q||0),0);
          const totE = lista.reduce((s,p)=>s+(p.incasso||0),0);
          const maxQ = lista[0]?.q || 1;
          return (
            <Modal titolo={isPiz?"Pizzas":"Bebidas"} sub={titoloCtx}
              icona={isPiz?"🍕":"🥤"} color={isPiz?C.rosso:"#9B59B6"} onClose={closeM}>
              <RigaDato label={isPiz?"Total pizzas vendidas":"Total bebidas vendidas"}
                value={`${totQ} pz`} color={isPiz?C.rosso:"#9B59B6"} big
                sub={fmtEur(totE)}/>
              <ModalSection titolo={`Lista (${lista.length} ${isPiz?"variedades":"productos"})`}>
                {lista.length === 0 ? (
                  <div style={{color:"rgba(255,255,255,0.35)",textAlign:"center",padding:"24px 0",fontSize:13}}>
                    Sin {isPiz?"pizzas":"bebidas"} en este período
                  </div>
                ) : lista.map((p,i) => (
                  <div key={p.n} style={{display:"flex",alignItems:"center",gap:10,
                    padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                    <span style={{color:"rgba(255,255,255,0.25)",fontSize:11,fontWeight:800,minWidth:22,textAlign:"right",fontFamily:"'DM Mono',monospace"}}>#{i+1}</span>
                    <span style={{fontSize:18}}>{p.e||(isPiz?"🍕":"🥤")}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:"rgba(255,255,255,0.9)",fontSize:14,fontWeight:600,
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.n}</div>
                      <div style={{background:"rgba(255,255,255,0.05)",borderRadius:3,height:4,
                        overflow:"hidden",marginTop:4}}>
                        <div style={{background:isPiz?C.rosso:"#9B59B6",borderRadius:3,
                          height:"100%",width:`${(p.q/maxQ)*100}%`,transition:"width .5s"}}/>
                      </div>
                    </div>
                    <div style={{textAlign:"right",minWidth:80}}>
                      <div style={{color:isPiz?C.rosso:"#9B59B6",fontWeight:800,fontSize:14,
                        fontFamily:"'DM Mono',monospace"}}>{p.q} pz</div>
                      <div style={{color:"rgba(255,255,255,0.4)",fontSize:11,
                        fontFamily:"'DM Mono',monospace"}}>{fmtEur(p.incasso)}</div>
                    </div>
                  </div>
                ))}
              </ModalSection>
            </Modal>
          );
        }

        // ── DELIVERY ──
        if (modalAperto === "delivery") {
          const COSTO_PER_CONSEGNA = 1; // €
          const costoTot = vista.delivery * COSTO_PER_CONSEGNA;
          // Stima km da delivery_logs (se caricati) — 30 km/h città → km ≈ min/2
          const logs = (deliveryLogs||[]).filter(l => {
            const ts = l.partito_alle ? new Date(l.partito_alle).getTime() : 0;
            if (!ts) return false;
            const now = Date.now();
            if (vista.contesto === "caja") {
              const dia = diaCajaSeleccionado || diasCaja[0]?.data || oggiIso;
              const [yy,mm,dd] = dia.split("-").map(Number);
              const g0 = new Date(yy,mm-1,dd).getTime();
              const g1 = g0 + 24*3600*1000;
              return ts >= g0 && ts < g1;
            }
            if (vista.contesto === "giorno") {
              const [yy,mm,dd] = giornoFiltro.split("-").map(Number);
              const g0 = new Date(yy,mm-1,dd).getTime();
              const g1 = g0 + 24*3600*1000;
              return ts >= g0 && ts < g1;
            }
            // aggregata
            const giorniN = periodo==="sett"?7 : periodo==="mese"?30 : 9999;
            return (now - ts) < giorniN * 24 * 3600 * 1000;
          });
          const giri = logs.length;
          const tempoTot = logs.reduce((s,l)=>s+(Number(l.tempo_andata_min)||0),0);
          const kmStimati = Math.round(tempoTot / 2);
          const tempoMedio = giri > 0 ? Math.round(tempoTot/giri) : 0;
          // Aggrega per zona
          const perZona = {};
          logs.forEach(l => {
            const z = l.zona || "?";
            if (!perZona[z]) perZona[z] = {giri:0, tempoTot:0, ordini:0};
            perZona[z].giri++;
            perZona[z].tempoTot += Number(l.tempo_andata_min)||0;
            perZona[z].ordini += Number(l.n_ordini)||1;
          });
          const zoneRows = Object.entries(perZona).sort((a,b)=>b[1].giri-a[1].giri);
          return (
            <Modal titolo="Delivery" sub={titoloCtx} icona="🛵" color="#F97316" onClose={closeM}>
              <RigaDato label="Consegne" value={`${vista.delivery}`} color="#F97316" big
                sub={`${vista.local} ritiri in local`}/>
              <ModalSection titolo="Coste">
                <RigaDato label="💰 Coste delivery"
                  value={fmtEur(costoTot)}
                  sub={`${vista.delivery} × ${COSTO_PER_CONSEGNA}€/consegna`}/>
              </ModalSection>
              <ModalSection titolo="Driver">
                {deliveryLoad ? (
                  <div style={{textAlign:"center",padding:"18px 0",color:"rgba(255,255,255,0.4)"}}>
                    Cargando datos del driver…
                  </div>
                ) : giri === 0 ? (
                  <div style={{color:"rgba(255,255,255,0.4)",fontSize:13,padding:"12px 0",lineHeight:1.5}}>
                    Sin registros en <code>delivery_logs</code> para este período.<br/>
                    <span style={{opacity:.6,fontSize:11}}>Los datos se popolano quando il driver completa i giri.</span>
                  </div>
                ) : (
                  <>
                    <RigaDato label="🛣 Giri totali" value={`${giri}`}/>
                    <RigaDato label="📍 Km stimati"
                      value={`${kmStimati} km`}
                      sub={`stima da tempo (30 km/h città)`}/>
                    <RigaDato label="⏱ Tempo medio andata" value={`${tempoMedio} min`}/>
                  </>
                )}
              </ModalSection>
              {zoneRows.length > 0 && (
                <ModalSection titolo="Por zona">
                  {zoneRows.map(([z,d]) => (
                    <div key={z} style={{display:"flex",alignItems:"center",gap:12,
                      padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                      <span style={{color:"#F97316",fontWeight:900,minWidth:30,
                        fontFamily:"'DM Mono',monospace",fontSize:14}}>{z}</span>
                      <span style={{color:"rgba(255,255,255,0.6)",fontSize:13,flex:1}}>
                        {d.giri} giri · {d.ordini} ordini
                      </span>
                      <span style={{color:"rgba(255,255,255,0.45)",fontSize:12,
                        fontFamily:"'DM Mono',monospace"}}>
                        ⌀ {Math.round(d.tempoTot/d.giri)}min
                      </span>
                    </div>
                  ))}
                </ModalSection>
              )}
            </Modal>
          );
        }

        // ── CLIENTES (placeholder) ──
        if (modalAperto === "clientes") {
          return (
            <Modal titolo="Clientes" sub="Próximamente" icona="👥" color="#9B59B6" onClose={closeM}>
              <div style={{textAlign:"center",padding:"30px 10px",color:"rgba(255,255,255,0.55)"}}>
                <div style={{fontSize:42,marginBottom:14}}>👥</div>
                <div style={{fontSize:14,lineHeight:1.7}}>
                  Próximamente:<br/>
                  Top 10 clientes por gasto · Nuevos vs recurrentes ·<br/>
                  Frecuencia y ticket medio · Clientes dormidos.
                </div>
              </div>
            </Modal>
          );
        }

        // ── STATS (charts: canale + fasce + dia semana + comparar) ──
        if (modalAperto === "stats") {
          return (
            <Modal titolo="Estadísticas" sub={titoloCtx} icona="📈" color={C.giallo} onClose={closeM}>
              {/* Canal de pedido */}
              {vista.canali && Object.keys(vista.canali).length > 0 && (
                <ModalSection titolo="Canal de pedido" marginTop={0}>
                  {Object.entries(vista.canali).sort((a,b)=>b[1]-a[1]).map(([c,n]) => {
                    const tot = Object.values(vista.canali).reduce((s,x)=>s+x,0);
                    const col = CANAL_COLOR[c] || C.grigio;
                    return (
                      <div key={c} style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}>
                        <span style={{color:"rgba(255,255,255,0.7)",fontSize:13,minWidth:110}}>
                          {CANAL_LABEL[c]||c}
                        </span>
                        <div style={{flex:1,background:"rgba(255,255,255,0.06)",borderRadius:5,height:9,overflow:"hidden"}}>
                          <div style={{background:`linear-gradient(90deg,${col}88,${col})`,
                            borderRadius:5,height:"100%",width:`${(n/tot)*100}%`,transition:"width .5s"}}/>
                        </div>
                        <span style={{color:col,fontWeight:800,minWidth:28,textAlign:"right",
                          fontFamily:"'DM Mono',monospace",fontSize:13}}>{n}</span>
                      </div>
                    );
                  })}
                </ModalSection>
              )}
              {/* Fasce orarie 30min — solo se aggregata o serata */}
              {a?.fasceOrarie && Object.keys(a.fasceOrarie).length > 0 && (
                <ModalSection titolo="Horarios de mayor demanda">
                  {FASCIA_ORDER.filter(f=>a.fasceOrarie[f]).map(f => {
                    const maxV = Math.max(...Object.values(a.fasceOrarie));
                    return (
                      <div key={f} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                        <span style={{color:"rgba(255,255,255,0.5)",fontSize:12,minWidth:50,
                          fontFamily:"'DM Mono',monospace"}}>{f}</span>
                        <div style={{flex:1,background:"rgba(255,255,255,0.06)",borderRadius:4,height:8,overflow:"hidden"}}>
                          <div style={{background:`linear-gradient(90deg,${C.rosso},${C.giallo})`,
                            borderRadius:4,height:"100%",width:`${(a.fasceOrarie[f]/maxV)*100}%`,transition:"width .5s"}}/>
                        </div>
                        <span style={{color:"rgba(255,255,255,0.7)",fontWeight:800,minWidth:26,
                          textAlign:"right",fontFamily:"'DM Mono',monospace",fontSize:12}}>
                          {a.fasceOrarie[f]}
                        </span>
                      </div>
                    );
                  })}
                </ModalSection>
              )}
              {/* Por día de la semana */}
              {a?.giorniSett && Object.keys(a.giorniSett).length > 0 && (
                <ModalSection titolo="Por día de la semana">
                  {["Lunes","Martes","Miercoles","Jueves","Viernes","Sabado","Domingo"]
                    .filter(g=>a.giorniSett[g]).map(g => {
                      const maxV = Math.max(...Object.values(a.giorniSett));
                      return (
                        <div key={g} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                          <span style={{color:"rgba(255,255,255,0.5)",fontSize:12,minWidth:80}}>{g}</span>
                          <div style={{flex:1,background:"rgba(255,255,255,0.06)",borderRadius:4,height:7,overflow:"hidden"}}>
                            <div style={{background:`linear-gradient(90deg,${C.blu}88,${C.blu})`,
                              borderRadius:4,height:"100%",width:`${(a.giorniSett[g]/maxV)*100}%`,transition:"width .5s"}}/>
                          </div>
                          <span style={{color:C.blu,fontWeight:800,minWidth:26,textAlign:"right",
                            fontFamily:"'DM Mono',monospace",fontSize:12}}>{a.giorniSett[g]}</span>
                        </div>
                      );
                  })}
                </ModalSection>
              )}
              {/* Comparar semanas */}
              {a?.giorniDettaglio && a.giorniDettaglio.length > 1 && (() => {
                const confronto = buildConfronto(a.giorniDettaglio);
                if (confronto.length === 0) return null;
                const maxP = Math.max(...confronto.map(d=>Math.max(d.pizze||0,d.prev?.pizze||0)), 1);
                return (
                  <ModalSection titolo="Comparar semanas (15 días)">
                    {confronto.map(d => {
                      const pct = d.prev && d.prev.incasso > 0
                        ? Math.round(((d.incasso - d.prev.incasso) / d.prev.incasso) * 100) : null;
                      const dCol = pct == null ? "transparent" : pct > 0 ? C.verde : pct < 0 ? C.rosso : "rgba(255,255,255,0.3)";
                      return (
                        <div key={d.data} style={{marginBottom:11,paddingBottom:8,
                          borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                          <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:4}}>
                            <span style={{color:"rgba(255,255,255,0.7)",fontWeight:800,fontSize:12,minWidth:26}}>{d.label}</span>
                            <span style={{color:"rgba(255,255,255,0.32)",fontSize:10,
                              fontFamily:"'DM Mono',monospace"}}>{d.data}</span>
                            <span style={{flex:1}}/>
                            {pct != null && (
                              <span style={{color:dCol,fontWeight:800,fontSize:11,
                                fontFamily:"'DM Mono',monospace"}}>
                                {pct>0?"+":""}{pct}%
                              </span>
                            )}
                            <span style={{color:C.verde,fontWeight:800,fontSize:12,
                              fontFamily:"'DM Mono',monospace",minWidth:48,textAlign:"right"}}>
                              {d.incasso.toFixed(0)}€
                            </span>
                          </div>
                          <div style={{flex:1,background:"rgba(255,255,255,0.05)",borderRadius:3,height:5,overflow:"hidden",marginBottom:3}}>
                            <div style={{background:`linear-gradient(90deg,${C.rosso}99,${C.rosso})`,
                              borderRadius:3,height:"100%",width:`${((d.pizze||0)/maxP)*100}%`,transition:"width .5s"}}/>
                          </div>
                          {d.prev && (
                            <div style={{flex:1,background:"rgba(255,255,255,0.05)",borderRadius:3,height:4,overflow:"hidden"}}>
                              <div style={{background:"rgba(100,120,200,0.55)",
                                borderRadius:3,height:"100%",width:`${((d.prev.pizze||0)/maxP)*100}%`,transition:"width .5s"}}/>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </ModalSection>
                );
              })()}
            </Modal>
          );
        }

        return null;
      })()}
    </div>
  );
};


// ─── ROOT ─────────────────────────────────────────────

export default EconomiaPage;
